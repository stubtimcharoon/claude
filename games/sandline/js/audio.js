/* Sandline Duel: synthesized audio (contract v2). WebAudio only, no files. Never throws if WebAudio is missing.
   Graph:
     one-shot voices > pan buses (9 fixed StereoPanners) > sfx > muffle LP > sfxGroup > master > compressor > out
     ui > sfxGroup;  soft wind > amb > ambDuck > sfxGroup
     song rack (FM pluck, triangle lead, triangle pad, sine sub, drum kit) > music > musicDuck > musicFade > musicGroup > master
     stinger rack > stingBus > musicGroup;  both racks send to a small two-delay music room > musicGroup
     echo send (one DelayNode, canyon slap) > sfx
   sfxGroup / musicGroup are the user toggles (SL.audio.bus, persisted with SL.store).
   Gunshots are pre-rendered into round-robin banks with OfflineAudioContext after init; until a bank is ready the
   same recipe is synthesized live. Music is a composed, deterministic score (menu theme, lobby variation, layered
   in-round track, four stingers) played by a 16th-note lookahead scheduler on ctx.currentTime. */
'use strict';
(function (SL) {
  var A = SL.audio = { ready: false, bus: { music: true, sfx: true } };
  var K_MUSIC = 'sandline.music', K_SFX = 'sandline.sfx';
  if (SL.store) {
    A.bus.music = SL.store.get(K_MUSIC, true) !== false;
    A.bus.sfx = SL.store.get(K_SFX, true) !== false;
  }

  var MUSIC_LEVEL = 0.071; // in-round music peaks 10+ dB under shot peaks (see harness/musiccap.js levels)
  var MAX_VOICES = 24, DEDUPE = 0.03, VARIANTS = 4, LOOKAHEAD = 0.12, TICK_MS = 25;
  var ctx = null, noiseBuf = null, N = {}, hasPan = false, masterMute = false;
  var voices = [], lastKey = {}, bank = {}, banking = false;

  /* ---------------- small helpers ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function jit(v, pct) { return v * (1 + (Math.random() * 2 - 1) * pct); }
  function db(d) { return Math.pow(10, d / 20); }
  function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function now() { return ctx.currentTime; }
  function ok() { return !!(ctx && N.master && ctx.state === 'running'); }
  function dedupe(key, t) {
    var l = lastKey[key];
    if (l != null && t >= l && t - l < DEDUPE) return true;
    lastKey[key] = t;
    return false;
  }
  function player() { return SL.G && SL.G.player; }
  function distTo(x, z) {
    var p = player();
    if (!p || x == null) return 0;
    var dx = x - p.x, dz = z - p.z;
    return Math.sqrt(dx * dx + dz * dz);
  }
  function att(x, z) { return clamp(1 - (distTo(x, z) - 1.5) / 20, 0.15, 1); }
  /* Screen-x pan relative to the local player. The camera is mirrored when SL.G.flip is true. */
  function panOf(x) {
    var p = player();
    if (!p || x == null) return 0;
    var dx = x - p.x;
    if (SL.G.flip) dx = -dx;
    return clamp(dx / 7, -0.8, 0.8);
  }
  function panDest(p) { return hasPan ? N.pans[Math.round((clamp(p, -0.8, 0.8) + 0.8) / 0.2)] : N.sfx; }
  function gainNode(c, v, dest) { var g = c.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  function filt(c, type, f, q, dest) {
    var fl = c.createBiquadFilter();
    fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    if (dest) fl.connect(dest);
    return fl;
  }

  /* ---------------- voices: cap, steal, cancel ---------------- */
  function prune(t) { for (var i = voices.length - 1; i >= 0; i--) if (voices[i].end < t) voices.splice(i, 1); }
  function kill(v, t) {
    try { v.out.gain.cancelScheduledValues(t); v.out.gain.setTargetAtTime(0, t, 0.005); } catch (e) { /* ignore */ }
    for (var i = 0; i < v.srcs.length; i++) { try { v.srcs[i].stop(t + 0.03); } catch (e) { /* already stopped */ } }
  }
  /* c: live or offline context. Live voices count toward the cap unless free (music). tag: owner unit for cancel. */
  function voice(c, dest, tag, free) {
    var v = { c: c, out: c.createGain(), srcs: [], end: 0, tag: tag || null, nb: null };
    v.out.connect(dest);
    if (c === ctx && !free) {
      var t = ctx.currentTime;
      prune(t);
      while (voices.length >= MAX_VOICES) kill(voices.shift(), t);
      voices.push(v);
    }
    return v;
  }
  function cancelTag(tag) {
    if (!ctx || !tag) return;
    var t = ctx.currentTime;
    for (var i = voices.length - 1; i >= 0; i--) {
      if (voices[i].tag === tag) { if (voices[i].end > t) kill(voices[i], t); voices.splice(i, 1); }
    }
  }
  function cancelUnits() { if (SL.G) { cancelTag(SL.G.player); cancelTag(SL.G.bot); } }

  function env(param, t, a, peak, dur) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    param.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.002));
  }
  function grow(v, end) { if (end > v.end) v.end = end; }
  /* Filtered noise layer. */
  function nz(v, t, type, f, f1, q, dur, vol, a, out) {
    var c = v.c, src = c.createBufferSource();
    src.buffer = v.nb || noiseBuf;
    src.loop = true;
    src.playbackRate.value = rand(0.9, 1.1);
    var fl = c.createBiquadFilter();
    fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f1 !== f) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var g = c.createGain();
    env(g.gain, t, a || 0.002, vol, dur);
    src.connect(fl); fl.connect(g); g.connect(out || v.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    v.srcs.push(src); grow(v, t + dur + 0.05);
    return g;
  }
  /* Enveloped oscillator layer with optional pitch sweep. */
  function tn(v, t, type, f0, f1, dur, vol, a, out) {
    var c = v.c, o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var g = c.createGain();
    env(g.gain, t, a || 0.004, vol, dur);
    o.connect(g); g.connect(out || v.out);
    o.start(t);
    o.stop(t + dur + 0.05);
    v.srcs.push(o); grow(v, t + dur + 0.05);
    return o;
  }
  /* Bare oscillator, envelope lives on the voice output. */
  function oscAt(v, t, type, f, stopT, detune, out) {
    var o = v.c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.value = detune;
    o.connect(out || v.out);
    o.start(t); o.stop(stopT);
    v.srcs.push(o); grow(v, stopT);
    return o;
  }
  function send(v, amt) { if (amt > 0 && N.echoIn) v.out.connect(gainNode(ctx, amt, N.echoIn)); }

  /* ---------------- ducking ---------------- */
  function duckParam(g, d, t) {
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(db(d), t, 0.007);
    g.setTargetAtTime(1, t + 0.08, 0.13);
  }
  function duck(s) {
    if (!ok()) return;
    try {
      var t = now();
      s = clamp(s, 0, 1);
      duckParam(N.mDuck.gain, -8 * s, t);
      duckParam(N.aDuck.gain, -4 * s, t);
    } catch (e) { /* ignore */ }
  }

  /* ---------------- gunshots ---------------- */
  /* click [HP Hz, dur s, vol], body [type, f0, f1, Q, dur, vol], thump [f0, f1, dur, vol], echo send, bank slot (s). */
  var SHOT = {
    smg:     { click: [5000, 0.005, 0.25], body: ['bandpass', 2600, 2600, 1.2, 0.045, 0.30], thump: [160, 70, 0.035, 0.20], send: 0.08, slot: 0.12 },
    rifle:   { click: [4000, 0.007, 0.30], body: ['bandpass', 1500, 800, 0.9, 0.09, 0.40],   thump: [120, 50, 0.07, 0.40],  send: 0.15, slot: 0.18 },
    shotgun: { click: [3500, 0.010, 0.35], body: ['lowpass', 2200, 400, 0.7, 0.22, 0.60],    thump: [90, 38, 0.16, 0.60],   send: 0.25, slot: 0.30, foley: 'pump' },
    sniper:  { click: [3000, 0.030, 0.50], body: ['lowpass', 1800, 250, 0.9, 0.40, 0.60],     thump: [70, 30, 0.30, 0.70],   send: 0.35, slot: 0.48, foley: 'bolt' },
    /* Heavy MG: deep, short and dense so 14 shots/s stay punchy without smearing */
    hmg:     { click: [3500, 0.006, 0.30], body: ['bandpass', 1100, 550, 0.8, 0.075, 0.48],  thump: [95, 42, 0.09, 0.55],   send: 0.12, slot: 0.17 },
    /* Hand Cannon: sharp crack, big low boom, a little tail from the echo send */
    hand:    { click: [4500, 0.008, 0.45], crack: [2500, 0.03, 0.40], body: ['lowpass', 2600, 320, 0.8, 0.26, 0.70], thump: [75, 32, 0.28, 0.85], send: 0.30, slot: 0.42 }
  };
  var DUCK_ON = { sniper: 1, hand: 0.6 };
  function shotLayers(v, t, r) {
    var cv = jit(1, 0.15), pv = jit(1, 0.06), b = r.body, th = r.thump;
    nz(v, t, 'highpass', r.click[0] * cv, r.click[0] * cv, 0.7, r.click[1], r.click[2], 0.001);
    if (r.crack) nz(v, t, 'highpass', r.crack[0] * cv, r.crack[0] * cv, 0.6, r.crack[1], r.crack[2], 0.001);
    nz(v, t, b[0], b[1] * cv, b[2] * cv, b[3], b[4], b[5], 0.003);
    tn(v, t, 'sine', th[0] * pv, th[1] * pv, th[2], th[3], 0.003);
  }
  /* Render VARIANTS takes per weapon into one buffer each, one weapon at a time, off the main thread. */
  function renderBanks() {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC || banking || !noiseBuf) return;
    banking = true;
    var ids = Object.keys(SHOT), sr = ctx.sampleRate || 44100;
    function next() {
      var id = ids.shift();
      if (!id) return;
      var r = SHOT[id];
      try {
        var oc = new OAC(1, Math.ceil(sr * r.slot * VARIANTS), sr);
        var nb = oc.createBuffer(1, noiseBuf.length, sr);
        nb.getChannelData(0).set(noiseBuf.getChannelData(0));
        for (var k = 0; k < VARIANTS; k++) {
          var v = voice(oc, oc.destination);
          v.nb = nb;
          shotLayers(v, k * r.slot + 0.002, r);
        }
        var done = function (buf) { if (buf) bank[id] = { buf: buf, slot: r.slot, rr: 0 }; next(); };
        var pr = oc.startRendering();
        if (pr && pr.then) pr.then(done, next);
        else oc.oncomplete = function (e) { done(e && e.renderedBuffer); };
      } catch (e) { next(); }
    }
    next();
  }
  function foley(kind, t, u, vol, pan) {
    var v = voice(ctx, panDest(pan), u);
    if (kind === 'pump') {
      nz(v, t + 0.35, 'bandpass', 1200, 1200, 2, 0.03, 0.18 * vol);
      nz(v, t + 0.41, 'bandpass', 1800, 1800, 2, 0.025, 0.2 * vol);
    } else {
      nz(v, t + 0.6, 'bandpass', 1400, 1400, 2, 0.03, 0.15 * vol);
      nz(v, t + 0.72, 'highpass', 2500, 2500, 0.8, 0.02, 0.12 * vol);
      nz(v, t + 0.8, 'bandpass', 900, 900, 1.5, 0.06, 0.12 * vol);
    }
  }
  function weaponId(e, u) {
    var w = e.weapon;
    return (w && w.id) || (typeof w === 'string' ? w : u.weapon) || 'rifle';
  }
  function onShot(e) {
    if (!ok() || !e || !e.u) return;
    try {
      var u = e.u, t = now(), mine = u === player();
      var id = weaponId(e, u), r = SHOT[id] || SHOT.rifle;
      var x = e.mx != null ? e.mx : u.x, z = e.mz != null ? e.mz : u.z;
      var d = mine ? 0 : distTo(x, z), a = mine ? 1 : att(x, z);
      if (!dedupe('shot' + (mine ? 'p' : 'o'), t)) {
        var dest = panDest(mine ? 0 : panOf(x));
        if (!mine) dest = filt(ctx, 'lowpass', Math.max(1200, 12000 * (1 - d / 22)), 0.7, dest);
        var v = voice(ctx, dest);
        v.out.gain.value = a * db(rand(-1.5, 1.5)) * (mine ? 1 : 0.85);
        var bk = bank[id];
        if (bk) {
          var s = ctx.createBufferSource();
          s.buffer = bk.buf;
          s.playbackRate.value = jit(1, 0.06);
          bk.rr = (bk.rr + 1) % VARIANTS;
          s.connect(v.out);
          s.start(t, bk.rr * bk.slot, bk.slot);
          v.srcs.push(s); grow(v, t + bk.slot * 1.1);
        } else {
          shotLayers(v, t, r);
        }
        if (mine || d < 12) send(v, r.send);
        if (r.foley && (mine || d < 10)) foley(r.foley, t, u, mine ? 1 : 0.5 * a, mine ? 0 : panOf(u.x));
        if (DUCK_ON[id]) duck(DUCK_ON[id] * (mine ? 1 : 0.7));
      }
      tracerFx(e, u, mine, id);
    } catch (err) { /* audio is optional */ }
  }

  /* Whiz past the local player and wall impacts, derived from tracers. One whiz and at most 2 impacts per shot. */
  function tracerFx(e, u, mine, id) {
    var tr = e.tracers;
    if (!tr || !tr.length) return;
    var p = player(), t = now(), i, q;
    var w = SL.WEAPONS && SL.WEAPONS[id], maxD = w ? w.range * 1.15 : 12;
    if (!mine && p && p.alive) {
      var best = 9, bx = p.x;
      for (i = 0; i < tr.length; i++) {
        q = tr[i];
        if (q.hit) continue;
        var dx = q.x1 - q.x0, dz = q.z1 - q.z0, L2 = dx * dx + dz * dz;
        if (L2 < 1e-6) continue;
        var s = ((p.x - q.x0) * dx + (p.z - q.z0) * dz) / L2;
        if (s <= 0.05 || s >= 1) continue;
        var cx = q.x0 + dx * s, cz = q.z0 + dz * s, dd = Math.sqrt((p.x - cx) * (p.x - cx) + (p.z - cz) * (p.z - cz));
        if (dd < best) { best = dd; bx = cx; }
      }
      if (best < 1.2 && !dedupe('whiz', t)) {
        var vw = voice(ctx, panDest(panOf(bx)));
        nz(vw, t, 'bandpass', 2000, 700, 4, 0.14, 0.25 * (1.2 - best) + 0.05, 0.03);
      }
    }
    var n = 0, start = Math.floor(Math.random() * tr.length);
    for (i = 0; i < tr.length && n < 2; i++) {
      q = tr[(start + i) % tr.length];
      if (q.hit) continue;
      var len = Math.sqrt((q.x1 - q.x0) * (q.x1 - q.x0) + (q.z1 - q.z0) * (q.z1 - q.z0));
      if (len + 0.55 >= maxD - 0.05) continue; // ran out of range over open sand
      var di = distTo(q.x1, q.z1);
      if (di > 14) continue;
      impact(t + Math.min(0.06, len * 0.004), q.x1, di);
      n++;
    }
  }
  function impact(t, x, d) {
    var a = clamp(1 - (d - 1.5) / 14, 0.1, 1), v = voice(ctx, panDest(panOf(x)));
    nz(v, t, 'bandpass', jit(3000, 0.15), jit(3000, 0.15), 2, 0.02, 0.1 * a, 0.001);
    nz(v, t, 'lowpass', 600, 600, 0.7, 0.04, 0.05 * a, 0.002);
    if (Math.random() < 0.25) tn(v, t + 0.01, 'sine', jit(2400, 0.08), 1300, 0.14, 0.04 * a, 0.002);
  }

  /* ---------------- damage, death, reload, dash, laser, ping ---------------- */
  var chain = 0, lastHitT = -9;
  function onDamage(e) {
    if (!ok() || !e) return;
    try {
      var p = player(), t = now(), v;
      if (e.attacker === p && e.target !== p && !dedupe('hit', t)) {
        chain = t - lastHitT < 0.4 ? Math.min(5, chain + 1) : 0;
        lastHitT = t;
        var m = Math.pow(2, chain / 12);
        v = voice(ctx, N.sfx);
        tn(v, t, 'triangle', 2000 * m, 2000 * m, 0.02, 0.1, 0.001, filt(ctx, 'bandpass', 2500 * m, 1.5, v.out));
        tn(v, t, 'sine', 1100 * m, 1100 * m, 0.06, 0.14, 0.002);
      }
      if (e.target === p && !dedupe('hurt', t)) {
        v = voice(ctx, N.sfx);
        tn(v, t, 'sine', 120, 55, 0.15, 0.45, 0.003);
        nz(v, t, 'lowpass', 400, 400, 0.7, 0.08, 0.25, 0.002);
        if (e.amount > 30) duck(0.8);
      }
    } catch (err) { /* ignore */ }
  }
  function onDeath(e) {
    if (!e || !e.unit) return;
    cancelTag(e.unit);
    if (!ok()) return;
    try {
      var p = player(), u = e.unit, t = now(), v;
      if (u === p) {
        v = voice(ctx, N.sfx);
        tn(v, t, 'sine', 110, 40, 0.35, 0.45, 0.005);
        nz(v, t, 'lowpass', 400, 120, 0.7, 0.45, 0.3, 0.004);
        duck(1);
      } else {
        var a = att(u.x, u.z);
        v = voice(ctx, panDest(panOf(u.x)));
        tn(v, t, 'sine', 110, 40, 0.35, 0.35 * a, 0.004);
        nz(v, t, 'lowpass', 600, 200, 0.7, 0.3, 0.15 * a, 0.003);
        if (e.killer === p) {
          var k = voice(ctx, N.ui);
          tn(k, t + 0.03, 'triangle', 880, 880, 0.08, 0.22, 0.003);
          tn(k, t + 0.11, 'triangle', 1318.5, 1318.5, 0.2, 0.22, 0.003);
          tn(k, t + 0.03, 'sine', 60, 60, 0.2, 0.4, 0.004);
          duck(1);
        }
      }
    } catch (err) { /* ignore */ }
  }
  function onReload(e) {
    if (!ok() || !e || !e.u) return;
    try {
      var u = e.u, mine = u === player(), t = now(), i;
      if (!mine && distTo(u.x, u.z) > 12) return;
      var w = (SL.WEAPONS && SL.WEAPONS[u.weapon]) || { reload: 2, mag: 25 }, T = w.reload;
      var v = voice(ctx, panDest(mine ? 0 : panOf(u.x)), u);
      v.out.gain.value = mine ? 1 : 0.4 * att(u.x, u.z);
      if (u.weapon === 'hmg') {                                       // belt-fed: latch, belt rattle, lid slam, charge
        nz(v, t + 0.08 * T, 'bandpass', 900, 900, 2, 0.04, 0.18);
        nz(v, t + 0.08 * T, 'highpass', 2500, 2500, 0.8, 0.015, 0.1);
        for (i = 0; i < 10; i++) nz(v, t + (i < 5 ? 0.22 : 0.38) * T + (i % 5) * 0.03, 'bandpass', jit(2600, 0.06), 2600, 3, 0.012, 0.08);
        nz(v, t + 0.6 * T, 'lowpass', 700, 700, 0.7, 0.07, 0.25);
        nz(v, t + 0.6 * T, 'bandpass', 1500, 1500, 1.5, 0.04, 0.18);
        nz(v, t + 0.85 * T, 'highpass', 2500, 2500, 0.8, 0.02, 0.14);
        nz(v, t + 0.85 * T + 0.01, 'bandpass', 900, 900, 1.5, 0.06, 0.14);
        nz(v, t + 0.85 * T + 0.09, 'bandpass', 1300, 1300, 2, 0.03, 0.12);
      } else if (u.weapon === 'hand') {                               // heavy pistol: mag out, mag in, slide release
        nz(v, t + 0.15 * T, 'bandpass', 1300, 1300, 1.5, 0.035, 0.16);
        nz(v, t + 0.55 * T, 'bandpass', 1900, 1900, 2, 0.025, 0.2);
        nz(v, t + 0.55 * T, 'lowpass', 500, 500, 0.7, 0.04, 0.12);
        nz(v, t + 0.82 * T, 'highpass', 3000, 3000, 0.8, 0.015, 0.16);
        nz(v, t + 0.82 * T + 0.01, 'bandpass', 1100, 1100, 1.5, 0.05, 0.16);
      } else if (u.weapon === 'shotgun') {
        var n = clamp(w.mag - (u.ammo || 0), 1, 6);
        for (i = 0; i < n; i++) nz(v, t + T * (0.1 + 0.7 * (i + 0.5) / n), 'bandpass', jit(2200, 0.05), 2200, 2, 0.025, 0.16);
        nz(v, t + T * 0.9, 'bandpass', 1200, 1200, 2, 0.03, 0.16);
        nz(v, t + T * 0.9 + 0.06, 'bandpass', 1800, 1800, 2, 0.025, 0.18);
      } else {
        nz(v, t + 0.15 * T, 'bandpass', 1200, 1200, 1.5, 0.04, 0.16);
        tn(v, t + 0.15 * T, 'sine', 300, 300, 0.01, 0.08, 0.001);
        nz(v, t + 0.65 * T, 'bandpass', 1800, 1800, 2, 0.025, 0.18);
        nz(v, t + 0.65 * T + 0.025, 'bandpass', 1800, 1800, 2, 0.025, 0.15);
        nz(v, t + 0.85 * T, 'highpass', 2500, 2500, 0.8, 0.02, 0.14);
        nz(v, t + 0.85 * T + 0.01, 'bandpass', 900, 900, 1.5, 0.06, 0.12);
      }
    } catch (err) { /* ignore */ }
  }
  function onDash(e) {
    if (!ok() || !e || !e.u) return;
    try {
      var u = e.u, mine = u === player(), t = now();
      if (dedupe('dash' + (mine ? 'p' : 'o'), t)) return;
      var a = mine ? 1 : att(u.x, u.z), v = voice(ctx, panDest(mine ? 0 : panOf(u.x)));
      nz(v, t, 'bandpass', 500, 2500, 1.5, 0.22, 0.28 * a, 0.04);
      nz(v, t, 'lowpass', 300, 300, 0.7, 0.12, 0.12 * a, 0.01);
    } catch (err) { /* ignore */ }
  }
  /* Sniper aim warning: audible through fog, so it barely attenuates. A single 120 ms sine, nothing sustained. */
  function onLaser(e) {
    if (!ok() || !e || !e.u) return;
    try {
      var u = e.u, mine = u === player(), t = now();
      if (dedupe('laser' + (mine ? 'p' : 'o'), t)) return;
      var a = mine ? 0.35 : Math.max(0.6, att(u.x, u.z)), v = voice(ctx, panDest(mine ? 0 : panOf(u.x)));
      tn(v, t, 'sine', 1100, 1500, 0.12, 0.14 * a, 0.005);   // one short clean rising beep (no beating pair)
    } catch (err) { /* ignore */ }
  }
  /* Anti-stall sonar blip. Lower pitch when it is the local player being revealed. */
  function onPing(e) {
    if (!ok() || !e) return;
    try {
      var mine = e.u === player(), t = now();
      if (dedupe('ping' + (mine ? 'p' : 'o'), t)) return;
      var x = e.x != null ? e.x : e.u && e.u.x, f = mine ? 784 : 1046.5;
      var v = voice(ctx, panDest(mine ? 0 : panOf(x)));
      tn(v, t, 'sine', f, f, 0.45, 0.22, 0.006);
      tn(v, t, 'triangle', f * 2, f * 2, 0.12, 0.05, 0.003);
      tn(v, t + 0.12, 'sine', f, f, 0.3, 0.07, 0.006);
      send(v, 0.4);
    } catch (err) { /* ignore */ }
  }

  /* ---------------- UI and stings ---------------- */
  var CARD = { smg: 784, rifle: 659.3, shotgun: 523.3, sniper: 440, hmg: 392, hand: 587.3 };
  function ui(kind, id) {
    if (!ok()) return;
    try {
      var t = now();
      if (dedupe('ui' + kind, t)) return;
      var v = voice(ctx, N.ui), i, f;
      if (kind === 'card') {
        f = CARD[id] || 600;
        tn(v, t, 'triangle', f, f, 0.12, 0.22, 0.003);
        tn(v, t, 'sine', f * 2, f * 2, 0.06, 0.08, 0.002);
      } else if (kind === 'tick') {
        tn(v, t, 'triangle', 523.3, 523.3, 0.15, 0.3, 0.003, filt(ctx, 'lowpass', 2000, 0.7, v.out));
      } else if (kind === 'go') {
        var lp = filt(ctx, 'lowpass', 1800, 0.9, v.out);
        lp.frequency.setValueAtTime(1800, t);
        lp.frequency.exponentialRampToValueAtTime(4000, t + 0.35);
        [523.3, 659.3, 784].forEach(function (n) { tn(v, t, 'triangle', n, n, 0.35, 0.12, 0.005, lp); });
        tn(v, t, 'sine', 261.6, 261.6, 0.35, 0.15, 0.005);
      } else if (kind === 'unlock') {
        f = [1046.5, 1318.5, 1568, 2093];
        for (i = 0; i < f.length; i++) tn(v, t + i * 0.06, 'triangle', f[i], f[i], 0.18, 0.14, 0.003);
      } else if (kind === 'back') {
        tn(v, t, 'sine', 900, 600, 0.05, 0.16, 0.002);
      } else {
        tn(v, t, 'sine', 1200, 900, 0.03, 0.18, 0.002);
      }
    } catch (err) { /* ignore */ }
  }
  function notes(v, t, list, step, type, vol, lastDur, out) {
    for (var i = 0; i < list.length; i++) {
      var last = i === list.length - 1;
      tn(v, t + i * step, type, list[i], list[i], last ? lastDur : 0.12, vol, 0.004, out);
    }
  }
  function sting(kind, delay) {
    if (!ok()) return;
    try {
      var t = now() + (delay || 0), v = voice(ctx, N.ui), lp;
      if (kind === 'roundWin') notes(v, t, [440, 523.3, 659.3], 0.09, 'triangle', 0.22, 0.35);
      else if (kind === 'roundLose') notes(v, t, [329.6, 261.6, 220], 0.09, 'triangle', 0.24, 0.4, filt(ctx, 'lowpass', 900, 0.7, v.out));
      else if (kind === 'roundDraw') notes(v, t, [440, 440], 0.15, 'triangle', 0.2, 0.25);
      else if (kind === 'matchWin') {
        notes(v, t, [440, 523.3, 659.3, 880], 0.1, 'triangle', 0.22, 0.5);
        lp = filt(ctx, 'lowpass', 1400, 0.7, v.out);
        [220, 329.6, 440].forEach(function (f) { tn(v, t + 0.3, 'triangle', f, f, 1.2, 0.07, 0.25, lp); });
      } else if (kind === 'matchLose') {
        lp = filt(ctx, 'lowpass', 600, 0.7, v.out);
        tn(v, t, 'triangle', 220, 207.7, 1.2, 0.2, 0.02, lp);
      }
      duck(1);
    } catch (err) { /* ignore */ }
  }

  /* ================= music: composed score, synth palette, lookahead scheduler =================
     Modern action-game style in A natural minor (B section lifts to A Dorian with F#). Instruments are clean and
     warm: triangle pads with slow attack, FM plucks, a soft triangle lead, a round sine sub bass and a synthesized
     drum kit (kick, snare, clap, closed and open hats, toms, crash). No sawtooth or square oscillators anywhere in
     the music, so nothing sustained can buzz.
     Main motif (menu bar 1-2): E D C D E G | A G F E C.
     Everything is deterministic: the score is data and humanisation / noise offsets come from a seeded rng.
     Each song runs on its own "rack" (instrument filters + output gain). Changing song fades the old rack and builds a
     new one, so tails ring out naturally while the new music starts on the next 16th. */
  var M_LOOKAHEAD = 0.15, MCAP = 48;
  var mVoices = [];
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* Music voices have their own cap so a busy bar can never starve the SFX pool (and vice versa). */
  function mv(dest) {
    var v = { c: ctx, out: ctx.createGain(), srcs: [], end: 0, tag: null, nb: null }, t = ctx.currentTime;
    v.out.connect(dest);
    for (var i = mVoices.length - 1; i >= 0; i--) if (mVoices[i].end < t) mVoices.splice(i, 1);
    while (mVoices.length >= MCAP) kill(mVoices.shift(), t);
    mVoices.push(v);
    return v;
  }

  /* ---------- score ---------- */
  var PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var SCORE_ERR = [], CHECK = true;   // stingers end mid-bar on purpose, so bar checks apply to the songs only
  function nm(s) {
    var m = /^([A-G])(b|#)?(\d)$/.exec(s);
    if (!m) { SCORE_ERR.push('bad note ' + s); return 69; }
    return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  function add(ev, pos, e) { (ev[pos] = ev[pos] || []).push(e); }
  function ext(e, x) { if (x) for (var k in x) e[k] = x[k]; return e; }
  /* "E5:3 D5:1 r:4 | ..." in 16th-note steps; '|' marks bar lines and is checked. Returns the length in steps. */
  function line(ev, start, text, inst, vol, x) {
    var pos = start, bar = start, tr = (x && x.tr) || 0;
    text.split(/\s+/).forEach(function (tok) {
      if (!tok) return;
      if (tok === '|') { if (CHECK && (pos - bar) % 16) SCORE_ERR.push(inst + ' bar at ' + bar + ' is ' + (pos - bar) + ' steps'); bar = pos; return; }
      var p = tok.split(':'), d = +p[1];
      if (p[0] !== 'r') add(ev, pos, ext({ i: inst, m: nm(p[0]) + tr, d: d, v: vol }, x));
      pos += d;
    });
    if (CHECK && (pos - bar) % 16) SCORE_ERR.push(inst + ' last bar at ' + bar + ' is ' + (pos - bar) + ' steps');
    return pos - start;
  }
  /* Drum map: { step: velocity }. */
  function drums(ev, base, inst, map, x) { for (var s in map) add(ev, base + (+s), ext({ i: inst, v: map[s] }, x)); }
  /* Chords: bass root (octave 2) and a close voicing around middle C. */
  var CH = {
    Am: { r: 45, t: [57, 60, 64] }, F: { r: 41, t: [57, 60, 65] }, C: { r: 48, t: [55, 60, 64] },
    G: { r: 43, t: [55, 59, 62] }, Em: { r: 40, t: [55, 59, 64] }, Dm: { r: 38, t: [57, 62, 65] },
    D: { r: 38, t: [57, 62, 66] }, Esus: { r: 40, t: [57, 59, 64] }
  };
  /* Pads: consecutive equal chords merge into one held pad. */
  function padRun(ev, chords, startBar, vol, x) {
    var last = null;
    chords.forEach(function (c, i) {
      if (last && last.c === c) { last.e.d += 16; return; }
      var e = ext({ i: 'pad', m: CH[c].t, d: 16, v: vol }, x);
      add(ev, (startBar + i) * 16, e);
      last = { c: c, e: e };
    });
  }
  /* Arpeggio over a chord: 8ths or 16ths, pattern of chord-tone indexes (3 = root an octave up). */
  function arp(ev, base, c, every, vol, x) {
    var t = CH[c].t, pat = [0, 1, 2, 1, 3, 1, 2, 1];
    for (var k = 0; k < 16 / every; k++) {
      var i = pat[k % 8];
      add(ev, base + k * every, ext({ i: 'pluck', m: i === 3 ? t[0] + 12 : t[i], d: every, v: vol }, x));
    }
  }
  /* Pedal-tone riff (16ths): p p a p b p c p d p c p b p e- */
  function riff(p, a, b, c, d, e) {
    return [p, p, a, p, b, p, c, p, d, p, c, p, b, p].map(function (n) { return n + ':1'; }).join(' ') + ' ' + e + ':2';
  }

  var MOTIF = 'E5:3 D5:1 C5:2 D5:2 E5:6 G5:2 | A5:4 G5:2 F5:2 E5:4 C5:4';
  function buildMenu() {
    /* 90 BPM, 24 bars (64 s): Intro 2 | A 8 (lead theme) | B 8 (Dorian lift, soaring lead) | A' 4 | Outro 2 */
    var ev = [], b;
    var chords = ['Am', 'F',
      'Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'Am',
      'F', 'G', 'Em', 'Am', 'F', 'G', 'D', 'Esus',
      'Am', 'F', 'C', 'G',
      'Am', 'F'];
    function sec(bar) { return bar < 2 ? 'I' : bar < 10 ? 'A' : bar < 18 ? 'B' : bar < 22 ? 'A2' : 'O'; }
    var A1 = MOTIF + ' | D5:3 C5:1 B4:2 C5:2 D5:4 E5:4 | B4:4 G4:4 D5:8' +
      ' | E5:3 D5:1 C5:2 D5:2 E5:6 G5:2 | A5:4 G5:2 F5:2 E5:4 D5:4 | D5:3 E5:1 D5:2 C5:2 B4:4 G4:4 | A4:12 r:4';
    line(ev, 2 * 16, A1, 'lead', 0.5, { lob: 0.55 });
    line(ev, 10 * 16, 'C5:4 F5:4 E5:4 C5:4 | D5:6 B4:2 G4:8 | E5:4 G5:4 F#5:4 E5:4 | E5:12 r:4' +
      ' | C5:4 F5:4 A5:4 G5:4 | G5:4 F#5:2 E5:2 D5:8 | F#5:4 E5:4 D5:4 A4:4 | B4:8 A4:4 B4:4', 'lead', 0.5, { lob: 0.55 });
    var A2 = MOTIF + ' | D5:3 C5:1 B4:2 C5:2 D5:4 E5:4 | B4:4 G4:4 D5:8';
    line(ev, 18 * 16, A2, 'lead', 0.52, { lob: 0.55 });
    line(ev, 18 * 16, A2, 'pluck', 0.3, { tr: -12, lob: 0.8 });
    line(ev, 22 * 16, 'E5:3 D5:1 C5:2 B4:2 A4:8 | r:16', 'lead', 0.45, { lob: 0.55 });
    padRun(ev, chords, 0, 0.05, { lob: 1.2 });
    for (b = 0; b < chords.length; b++) {
      var c = chords[b], r = CH[c].r, base = b * 16, s = sec(b);
      if (s === 'A' || s === 'A2') {
        arp(ev, base, c, 2, 0.22, { lob: 1 });
        add(ev, base, { i: 'bass', m: r, d: 6, v: 0.5 }); add(ev, base + 6, { i: 'bass', m: r, d: 2, v: 0.4 });
        add(ev, base + 8, { i: 'bass', m: r + 7, d: 4, v: 0.42 }); add(ev, base + 12, { i: 'bass', m: r + 12, d: 4, v: 0.38 });
        drums(ev, base, 'kick', { 0: 0.9, 10: 0.6 });
        drums(ev, base, 'clap', { 8: 0.6 });
        drums(ev, base, 'hat', { 2: 0.25, 4: 0.18, 6: 0.25, 10: 0.25, 12: 0.18, 14: 0.25 });
      } else if (s === 'B') {
        arp(ev, base, c, 1, 0.18, { lob: 0.9 });
        add(ev, base, { i: 'bass', m: r, d: 3, v: 0.5 }); add(ev, base + 3, { i: 'bass', m: r, d: 3, v: 0.42 });
        add(ev, base + 6, { i: 'bass', m: r + 12, d: 2, v: 0.38 }); add(ev, base + 8, { i: 'bass', m: r, d: 4, v: 0.45 });
        add(ev, base + 12, { i: 'bass', m: r + 7, d: 4, v: 0.4 });
        drums(ev, base, 'kick', { 0: 0.95, 6: 0.55, 8: 0.8 });
        drums(ev, base, 'snare', { 4: 0.55, 12: 0.6 });
        var hh = {}; for (var k = 0; k < 16; k++) hh[k] = k % 2 ? 0.14 : 0.24;
        drums(ev, base, 'hat', hh);
      } else if (s === 'I') {
        arp(ev, base, c, 2, 0.26, { lob: 1 });
        add(ev, base, { i: 'bass', m: r, d: 16, v: 0.35 });
      } else {
        arp(ev, base, c, 2, 0.2, { lob: 1 });
        add(ev, base, { i: 'bass', m: r, d: 16, v: 0.4 });
        drums(ev, base, 'kick', { 0: 0.7 });
      }
      if (b === 9 || b === 17) drums(ev, base, 'snare', { 12: 0.35, 13: 0.4, 14: 0.5, 15: 0.6 });   // section fills
    }
    [2, 10, 18].forEach(function (bb) { add(ev, bb * 16, { i: 'crash', v: 0.45 }); });
    return { name: 'menu', bpm: 90, len: 24 * 16, ev: ev };
  }

  function buildRound() {
    /* 104 BPM, 8-bar loop (18.5 s). Levels: 0 calm, 1 enemy spotted, 2 last 15 s. Events carry lo/hi level gates. */
    var ev = [], chords = ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'Dm', 'Esus'];
    var R = {
      Am: riff('A4', 'E5', 'D5', 'C5', 'B4', 'E5'), F: riff('F4', 'C5', 'D5', 'C5', 'A4', 'E5'),
      G: riff('G4', 'D5', 'E5', 'D5', 'B4', 'F5'), Dm: riff('D4', 'A4', 'F4', 'A4', 'C5', 'G4'),
      Esus: riff('E4', 'B4', 'A4', 'B4', 'D5', 'B4')
    };
    chords.forEach(function (c, i) { line(ev, i * 16, R[c], 'pluck', 0.24, { lo: 1, ring: 0.12 }); });
    line(ev, 0, MOTIF + ' | A5:4 G5:2 F5:2 E5:4 C5:4 | D5:3 C5:1 B4:2 C5:2 D5:4 G5:4 | A5:6 B5:2 C6:4 B5:4' +
      ' | A5:4 G5:2 E5:2 C5:4 E5:4 | A5:4 G5:2 F5:2 D5:4 F5:4 | E5:8 D5:4 B4:4', 'lead', 0.42, { lo: 2 });
    padRun(ev, chords, 0, 0.05);
    chords.forEach(function (c, b) {
      var base = b * 16, r = CH[c].r, k, map;
      /* calm: pad, half-note bass, soft kick, ticking hats, a muted pulse on the root */
      add(ev, base, { i: 'bass', m: r, d: 8, v: 0.5, hi: 0 }); add(ev, base + 8, { i: 'bass', m: r + 7, d: 8, v: 0.42, hi: 0 });
      drums(ev, base, 'kick', { 0: 0.75, 8: 0.5 }, { hi: 0 });
      drums(ev, base, 'hat', { 2: 0.16, 6: 0.16, 10: 0.16, 14: 0.16 }, { hi: 0 });
      for (k = 0; k < 8; k++) add(ev, base + k * 2, { i: 'pluck', m: CH[c].t[0], d: 1, v: 0.12, hi: 0, ring: 0.05 });
      /* spotted: driving 8th bass with octaves, kick + snare backbeat, 16th hats, the pedal riff */
      [[0, 2, r], [2, 2, r], [4, 2, r + 12], [6, 2, r], [8, 2, r], [10, 2, r + 12], [12, 2, r + 7], [14, 2, r]].forEach(function (n, j) {
        add(ev, base + n[0], { i: 'bass', m: n[2], d: n[1], v: j === 0 ? 0.55 : 0.42, lo: 1 });
      });
      drums(ev, base, 'kick', { 0: 0.95, 6: 0.5, 8: 0.8 }, { lo: 1, hi: 1 });
      drums(ev, base, 'snare', { 4: 0.6, 12: 0.65 }, { lo: 1 });
      map = {}; for (k = 0; k < 16; k++) map[k] = k % 2 ? 0.12 : 0.22;
      drums(ev, base, 'hat', map, { lo: 1, hi: 1 });
      /* last 15 s: four-on-the-floor, open hats on the offbeats, ghost snares, crash every 2 bars, the lead motif */
      drums(ev, base, 'kick', { 0: 1, 4: 0.8, 8: 0.9, 12: 0.8, 14: 0.45 }, { lo: 2 });
      drums(ev, base, 'snare', { 7: 0.18, 15: 0.22 }, { lo: 2 });
      drums(ev, base, 'ohat', { 2: 0.3, 6: 0.3, 10: 0.3, 14: 0.3 }, { lo: 2 });
      drums(ev, base, 'hat', { 1: 0.12, 3: 0.14, 5: 0.12, 7: 0.14, 9: 0.12, 11: 0.14, 13: 0.12, 15: 0.14 }, { lo: 2 });
      if (b % 2 === 0) add(ev, base, { i: 'crash', v: 0.35, lo: 2 });
    });
    return { name: 'round', bpm: 104, len: 8 * 16, ev: ev };
  }

  function mkSting(name, bpm, seed, build) { CHECK = false; var ev = [], len = build(ev); CHECK = true; return { name: name, bpm: bpm, len: len, ev: ev, seed: seed }; }
  function chordAt(ev, pos, c, d, x) { add(ev, pos, ext({ i: 'pad', m: CH[c].t, d: d, v: 0.06 }, x)); add(ev, pos, { i: 'bass', m: CH[c].r, d: d, v: 0.5 }); }
  var STINGS = {
    roundWin: mkSting('roundWin', 120, 11, function (ev) {          // motif head rising to a bright C major (F G C)
      line(ev, 0, 'E5:1 D5:1 C5:1 D5:1 E5:2 G5:2 C6:10', 'lead', 0.5);
      line(ev, 0, 'A4:1 C5:1 E5:1 A5:1 B4:1 D5:1 G5:1 B5:1 C5:1 E5:1 G5:1 C6:7', 'pluck', 0.22, { ring: 0.6 });
      chordAt(ev, 0, 'F', 4); chordAt(ev, 4, 'G', 4); chordAt(ev, 8, 'C', 10);
      drums(ev, 0, 'kick', { 0: 0.8, 4: 0.7, 8: 1 }); drums(ev, 0, 'snare', { 6: 0.5, 7: 0.6 });
      add(ev, 8, { i: 'crash', v: 0.5 });
      return 18;
    }),
    roundLose: mkSting('roundLose', 92, 12, function (ev) {         // falling line settling on a dark A minor
      line(ev, 0, 'E5:2 D5:2 C5:2 B4:3 A4:9', 'lead', 0.45);
      line(ev, 0, 'E4:2 D4:2 C4:2 B3:3 A3:9', 'pluck', 0.2, { ring: 0.8 });
      chordAt(ev, 0, 'Dm', 6); chordAt(ev, 6, 'Am', 12);
      drums(ev, 0, 'kick', { 0: 0.6, 9: 0.5 });
      return 18;
    }),
    roundDraw: mkSting('roundDraw', 100, 13, function (ev) {        // motif head left hanging on G
      line(ev, 0, 'E5:2 D5:2 C5:2 D5:10', 'lead', 0.45);
      chordAt(ev, 0, 'Am', 6); chordAt(ev, 6, 'G', 10);
      drums(ev, 0, 'kick', { 0: 0.6 });
      return 16;
    }),
    matchWin: mkSting('matchWin', 120, 14, function (ev) {          // full motif, climbing cadence, big C major finish
      line(ev, 0, MOTIF + ' | D5:2 E5:2 F5:2 G5:2 A5:2 B5:2 D6:4 | C6:10', 'lead', 0.5);
      ['Am', 'F', 'G'].forEach(function (c, b) { arp(ev, b * 16, c, 2, 0.2); chordAt(ev, b * 16, c, 16); });
      chordAt(ev, 48, 'C', 10);
      [55, 60, 64, 67, 72].forEach(function (m, i) { add(ev, 48 + i, { i: 'pluck', m: m, d: 10 - i, v: 0.25, ring: 1.0 }); });
      for (var b = 0; b < 3; b++) { drums(ev, b * 16, 'kick', { 0: 0.9, 8: 0.8 }); drums(ev, b * 16, 'snare', { 4: 0.55, 12: 0.6 }); drums(ev, b * 16, 'hat', { 2: 0.2, 6: 0.2, 10: 0.2, 14: 0.2 }); }
      drums(ev, 32, 'tom', { 12: 0.5, 13: 0.55, 14: 0.6, 15: 0.7 });
      drums(ev, 48, 'kick', { 0: 1 }); add(ev, 0, { i: 'crash', v: 0.4 }); add(ev, 48, { i: 'crash', v: 0.55 });
      return 58;
    }),
    matchLose: mkSting('matchLose', 72, 15, function (ev) {         // the motif, slow, sinking to a low A
      line(ev, 0, 'E5:3 D5:1 C5:2 D5:2 E5:6 G5:2 | F5:4 E5:2 D5:2 C5:2 B4:2 A4:4', 'lead', 0.42);
      chordAt(ev, 0, 'Am', 8); chordAt(ev, 8, 'F', 8); chordAt(ev, 16, 'Dm', 8); chordAt(ev, 24, 'Am', 8);
      drums(ev, 0, 'kick', { 0: 0.6, 16: 0.5, 24: 0.55 });
      return 32;
    })
  };
  var SONGS = { menu: buildMenu(), round: buildRound() };

  /* ---------- synth palette (sine / triangle / filtered noise only) ---------- */
  /* FM pluck: sine carrier, sine modulator at 2x whose index decays in 120 ms. Bright attack, round sine tail. */
  function pluck(r, t, m, dur, vol, ring) {
    var v = mv(r.pluck), f = midi(m), g = v.out.gain, rel = t + Math.max(0.05, dur) + (ring == null ? 0.25 : ring), stop = rel + 0.25;
    var car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain();
    car.frequency.setValueAtTime(f, t);
    mod.frequency.setValueAtTime(f * 2, t);
    mg.gain.setValueAtTime(f * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.12);
    mod.connect(mg); mg.connect(car.frequency); car.connect(v.out);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(vol, t + 0.003);
    var dEnd = Math.min(t + 0.35, rel);
    g.exponentialRampToValueAtTime(Math.max(0.0002, vol * 0.25), dEnd);
    g.setTargetAtTime(0, rel, 0.05);
    car.start(t); mod.start(t); car.stop(stop); mod.stop(stop);
    v.srcs.push(car, mod); grow(v, stop);
  }
  /* Lead: soft triangle with a quiet sine an octave up, a small scoop into the note and delayed vibrato. */
  function lead(r, t, m, dur, vol) {
    var v = mv(r.lead), f = midi(m), end = t + Math.max(dur, 0.08), stop = end + 0.2, g = v.out.gain;
    var o = ctx.createOscillator(), o2 = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    o2.frequency.setValueAtTime(f * 2, t);
    o.detune.setValueAtTime(-20, t);
    o.detune.linearRampToValueAtTime(0, t + 0.04);
    lfo.frequency.value = 5.5;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(dur > 0.4 ? 10 : 0, t + Math.min(0.5, dur));
    lfo.connect(lg); lg.connect(o.detune); lg.connect(o2.detune);
    o.connect(v.out);
    o2.connect(gainNode(ctx, 0.18, v.out));
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(vol, t + 0.015);
    g.linearRampToValueAtTime(vol * 0.8, t + 0.12);
    g.setValueAtTime(vol * 0.8, Math.max(t + 0.12, end));
    g.linearRampToValueAtTime(0.0001, Math.max(t + 0.12, end) + 0.14);
    o.start(t); o2.start(t); lfo.start(t);
    o.stop(stop); o2.stop(stop); lfo.stop(stop);
    v.srcs.push(o, o2, lfo); grow(v, stop);
  }
  /* Warm pad: two slightly detuned triangles per chord tone, split left/right, slow attack and release. */
  function pad(r, t, ch, dur, vol) {
    var v = mv(r.padL), gR = gainNode(ctx, 0, r.padR), stop = t + dur + 1.2;
    [v.out.gain, gR.gain].forEach(function (g) {
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(vol, t + 0.6);
      g.setValueAtTime(vol, t + Math.max(0.61, dur));
      g.linearRampToValueAtTime(0.0001, t + Math.max(0.61, dur) + 1.0);
    });
    for (var i = 0; i < ch.length; i++) {
      oscAt(v, t, 'triangle', midi(ch[i]), stop, -6, v.out);
      oscAt(v, t, 'triangle', midi(ch[i]), stop, 6, gR);
    }
  }
  /* Round sub bass: sine with a quiet triangle an octave up so it still reads on phone speakers. */
  function bass(r, t, m, dur, vol) {
    vol *= 0.3;                                            // lows read as weight, not loudness: keep headroom for SFX
    var v = mv(r.bass), g = v.out.gain, f = midi(m), d1 = Math.min(0.2, dur * 0.5), hold = t + Math.max(d1 + 0.01, dur - 0.02);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(vol, t + 0.008);
    g.exponentialRampToValueAtTime(vol * 0.6, t + d1);
    g.setValueAtTime(vol * 0.6, hold);
    g.linearRampToValueAtTime(0.0001, hold + 0.06);
    oscAt(v, t, 'sine', f, hold + 0.1);
    oscAt(v, t, 'triangle', f * 2, hold + 0.1, 0, gainNode(ctx, 0.15, v.out));
  }
  /* Deterministic filtered noise burst (no Math.random). */
  function mnz(v, t, type, f, f1, q, dur, vol, a, off) {
    var src = ctx.createBufferSource(), fl = filt(ctx, type, f, q), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    fl.frequency.setValueAtTime(f, t);
    if (f1 !== f) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g.gain, t, a, vol, dur);
    src.connect(fl); fl.connect(g); g.connect(v.out);
    src.start(t, off); src.stop(t + dur + 0.05);
    v.srcs.push(src); grow(v, t + dur + 0.05);
  }
  /* Drum kit. */
  function drum(r, kind, t, vol, x) {
    var v = mv(kind === 'hat' || kind === 'ohat' || kind === 'crash' ? r.hi : r.perc), off = x * 0.5;
    if (kind === 'kick') {
      tn(v, t, 'sine', 150, 48, 0.28, vol * 0.75, 0.002);
      mnz(v, t, 'highpass', 3000, 3000, 0.7, 0.006, vol * 0.12, 0.0005, off);
    } else if (kind === 'snare') {
      tn(v, t, 'sine', 195, 170, 0.09, vol * 0.25, 0.001);
      mnz(v, t, 'bandpass', 1900, 1500, 0.8, 0.14, vol * 0.5, 0.001, off);
      mnz(v, t, 'highpass', 5000, 5000, 0.7, 0.08, vol * 0.22, 0.001, off * 0.7);
    } else if (kind === 'clap') {
      for (var k = 0; k < 3; k++) mnz(v, t + k * 0.011, 'bandpass', 1300, 1300, 1, 0.012, vol * 0.4, 0.001, off + k * 0.07);
      mnz(v, t + 0.033, 'bandpass', 1300, 1000, 1, 0.13, vol * 0.35, 0.001, off * 0.5);
    } else if (kind === 'hat') {
      mnz(v, t, 'highpass', 8000, 8000, 0.7, 0.03, vol * 0.4, 0.0005, off);
    } else if (kind === 'ohat') {
      mnz(v, t, 'highpass', 7000, 7000, 0.7, 0.22, vol * 0.28, 0.001, off);
    } else if (kind === 'tom') {
      tn(v, t, 'sine', 210, 130, 0.18, vol * 0.6, 0.002);
      mnz(v, t, 'lowpass', 700, 500, 0.7, 0.04, vol * 0.2, 0.001, off);
    } else if (kind === 'crash') {
      mnz(v, t, 'highpass', 4500, 4500, 0.6, 1.1, vol * 0.22, 0.001, off);
      mnz(v, t, 'bandpass', 7000, 5000, 0.5, 0.6, vol * 0.14, 0.001, off * 0.6);
    } else if (kind === 'riser') {
      mnz(v, t, 'bandpass', 400, 5000, 1.2, vol, 0.12, Math.max(0.01, vol * 0.85), off);
    }
  }
  var PERC = { kick: 1, snare: 1, clap: 1, hat: 1, ohat: 1, tom: 1, crash: 1 };
  /* cur = a playing cursor (song or stinger) with its rack and seeded rng. */
  function play(cur, e, t, vol, sd) {
    var x = cur.rng();
    t = Math.max(ctx.currentTime, t + (x - 0.5) * 0.006);   // +-3 ms humanise
    vol *= 0.94 + 0.12 * cur.rng();
    var r = cur.rack;
    if (e.i === 'pluck') pluck(r, t, e.m, e.d * sd, vol, e.ring);
    else if (e.i === 'lead') lead(r, t, e.m, e.d * sd, vol);
    else if (e.i === 'pad') pad(r, t, e.m, e.d * sd, vol);
    else if (e.i === 'bass') bass(r, t, e.m, e.d * sd, vol);
    else drum(r, e.i, t, vol, x);
  }
  /* A rack: per-song instrument chain. tone = low-pass used for the thin lobby arrangement. */
  function newRack(dest) {
    var c = ctx, r = {};
    r.out = gainNode(c, 1, dest);
    r.out.connect(gainNode(c, 0.16, N.mVerbIn));
    r.tone = filt(c, 'lowpass', 18000, 0.5, r.out);
    var mix = gainNode(c, 1, r.tone), L = mix, R = mix;
    if (hasPan) {
      L = c.createStereoPanner(); L.pan.value = -0.3; L.connect(mix);
      R = c.createStereoPanner(); R.pan.value = 0.3; R.connect(mix);
    }
    r.pluck = filt(c, 'lowpass', 4200, 0.6, L);
    r.lead = filt(c, 'lowpass', 3200, 0.5, R);
    r.padL = filt(c, 'lowpass', 1400, 0.4, L);
    r.padR = filt(c, 'lowpass', 1400, 0.4, R);
    r.bass = filt(c, 'lowpass', 320, 0.6, mix);
    r.perc = mix;
    r.hi = R;
    return r;
  }
  function fadeRack(r, t) {
    if (!r) return;
    try {
      var g = r.out.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.setTargetAtTime(0, t, 0.12);
    } catch (e) { /* ignore */ }
  }

  /* ---------- scheduler ---------- */
  var M = { mode: 'off', want: 'menu', song: null, rack: null, step: 0, nextT: 0, timer: null, rng: null,
            lvl: 0, fillTo: -1, accent: false, pre: false, k: 0, on: true, seen: -99, sting: null, stingEnd: 0 };
  function sd16(bpm) { return 60 / bpm / 4; }
  function desiredLvl() {
    var G = SL.G;
    if (!G || G.state !== 'live') return 0;
    if (G.roundT <= 15) return 2;
    return ctx.currentTime - M.seen < 4 ? 1 : 0;
  }
  /* Round track bar line: levels only change here; a raise gets a crash + kick, a drop a single kick. */
  function barLine(t) {
    var prev = M.lvl, w = desiredLvl();
    if (M.fillTo > M.lvl) M.lvl = M.fillTo;
    if (w !== M.lvl) M.lvl = w;
    M.fillTo = -1;
    if (!M.on) { M.accent = false; return; }
    if (M.lvl > prev || M.accent) { drum(M.rack, 'crash', t, 0.45, 0.1); drum(M.rack, 'kick', t, 1, 0.2); }
    else if (M.lvl < prev) drum(M.rack, 'kick', t, 0.8, 0.3);
    M.accent = false;
  }
  /* Fill on beat 4 before a raise (or at the end of the 8-bar phrase): snare and tom roll, plus a riser into level 2. */
  function fill(t, s, sd) {
    var vol = 0.35 + 0.1 * (s - 12);
    drum(M.rack, M.fillTo > M.lvl && s >= 14 ? 'tom' : 'snare', t, vol, s * 0.03);
    if (M.fillTo === 2) {
      drum(M.rack, 'snare', t + sd / 2, vol * 0.6, s * 0.05);
      if (s === 12) drum(M.rack, 'riser', t, sd * 4, 0.4);
    }
  }
  /* Countdown pre-roll: held A minor, snare roll swelling into the downbeat of 'live'. */
  function preStep(t, k) {
    var sd = sd16(SONGS.round.bpm), ramp = clamp(k / 20, 0, 1);
    if (k % 16 === 0) { pad(M.rack, t, CH.Am.t, 16 * sd, 0.05); bass(M.rack, t, CH.Am.r, 16 * sd, 0.45); }
    if (k === 0) drum(M.rack, 'riser', t, 3.0, 0.5);
    if (k % 4 === 0) drum(M.rack, 'kick', t, 0.5 + 0.3 * ramp, 0.1);
    if (k < 28 || k % 2 === 0) drum(M.rack, 'snare', t, 0.08 + 0.35 * ramp * (k % 2 ? 0.7 : 1), (k % 7) * 0.07);   // a long countdown settles into 8ths
    if (k >= 28 && k % 2) drum(M.rack, 'hat', t, 0.2, (k % 5) * 0.1);
  }
  function songStep(t, step) {
    var song = M.song, s = step % 16, sd = sd16(song.bpm), round = song === SONGS.round, i;
    if (round) {
      if (s === 0) barLine(t);
      if (s === 12) { var w = desiredLvl(); M.fillTo = w > M.lvl ? w : ((step >> 4) === 7 ? M.lvl : -1); }
      if (M.on && M.fillTo >= 0 && s >= 12) fill(t, s, sd);
    }
    var list = song.ev[step];
    if (!list || !M.on) return;
    var lob = M.mode === 'lobby';
    for (i = 0; i < list.length; i++) {
      var e = list[i], vol = e.v;
      if (lob) { if (!e.lob) continue; vol *= e.lob; }
      if (e.lo != null && M.lvl < e.lo) continue;
      if (e.hi != null && M.lvl > e.hi) continue;
      if (round && M.fillTo >= 0 && s >= 12 && PERC[e.i]) continue;   // the fill replaces the groove
      play(M, e, t, vol, sd);
    }
  }
  function pump() {
    if (!ctx || ctx.state !== 'running') return;
    try {
      var t = ctx.currentTime, horizon = t + M_LOOKAHEAD;
      M.on = A.bus.music && !masterMute;
      if (M.song) {
        if (M.nextT < t - 0.2) M.nextT = t + 0.05;           // resync after a stall or suspend
        if (M.pre && SL.G && SL.G.state === 'live') {          // countdown over: downbeat of bar 1 now
          M.pre = false; M.step = 0; M.lvl = 0; M.fillTo = -1; M.accent = true; M.nextT = t + 0.03;
        }
        while (M.nextT < horizon) {
          if (M.pre) {
            if (M.on) preStep(M.nextT, M.k);
            M.k++;
            M.nextT += sd16(SONGS.round.bpm);
            continue;
          }
          songStep(M.nextT, M.step);
          M.nextT += sd16(M.song.bpm);
          M.step = (M.step + 1) % M.song.len;
        }
      }
      var S = M.sting;
      while (S && S.nextT < horizon) {
        var list = S.song.ev[S.step], sd = sd16(S.song.bpm);
        if (list) for (var i = 0; i < list.length; i++) play(S, list[i], S.nextT, list[i].v, sd);
        S.nextT += sd;
        if (++S.step >= S.song.len) { M.sting = S = null; }
      }
      if (!M.song && !M.sting) stopTimer();
    } catch (e) { /* ignore */ }
  }
  function startTimer() {
    if (M.timer || typeof setInterval !== 'function') return;
    M.timer = setInterval(pump, TICK_MS);
    if (M.timer && M.timer.unref) M.timer.unref();
  }
  function stopTimer() { if (M.timer) { clearInterval(M.timer); M.timer = null; } }
  function startSong(mode, t) {
    fadeRack(M.rack, t);
    var song = mode === 'round' ? SONGS.round : SONGS.menu;
    M.rack = newRack(N.music);
    M.song = song; M.step = 0; M.k = 0; M.lvl = 0; M.fillTo = -1; M.accent = true;
    M.pre = mode === 'round' && !(SL.G && SL.G.state === 'live');
    M.rng = rng(song.bpm * 31 + 7);
    M.nextT = Math.max(t + 0.05, M.stingEnd - 0.3);           // let a stinger finish before the next song
  }
  function applyMusic() {
    if (!ctx || !N.music) return;
    var mode = M.want, prev = M.mode, t = ctx.currentTime;
    if (mode === prev) return;
    M.mode = mode;
    if (mode === 'off') {
      fadeRack(M.rack, t);
      M.rack = null; M.song = null;
      if (!M.sting) stopTimer();
      return;
    }
    N.mFade.gain.cancelScheduledValues(t);
    N.mFade.gain.setTargetAtTime(1, t, 0.05);
    var menuish = function (m) { return m === 'menu' || m === 'lobby'; };
    if (!(menuish(mode) && menuish(prev) && M.song === SONGS.menu)) startSong(mode, t);
    var lob = mode === 'lobby';                                 // thin arrangement: darker, no drums or bass
    M.rack.tone.frequency.setTargetAtTime(lob ? 2200 : 18000, t, 0.4);
    M.rack.out.gain.setTargetAtTime(lob ? 0.55 : mode === 'round' ? 0.42 : 0.8, t, 0.4);   // in-round: further under the gunfire
    startTimer();
    pump();
  }
  /* Musical stinger on its own rack and bus (not ducked, not faded by song changes). A stinger that arrives while
     another is still sounding waits for its last note (round won, then match won). */
  function startSting(kind, at) {
    var sc = STINGS[kind];
    if (!sc || !ctx || !N.stingBus) return;
    var t = Math.max(ctx.currentTime + 0.03, at || 0);
    if (M.sting) { t = Math.max(t, M.stingEnd - 0.7); fadeRack(M.sting.rack, t); }
    M.sting = { song: sc, step: 0, nextT: t, rack: newRack(N.stingBus), rng: rng(sc.seed) };
    M.stingEnd = t + sc.len * sd16(sc.bpm) + 0.7;
    startTimer();
    pump();
  }
  function playSting(kind, delay) {
    if (!ok()) return;
    if (!A.bus.music || masterMute) { sting(kind, delay); return; }   // music off: short UI cue instead
    startSting(kind, now() + (delay || 0));
  }
  /* Map a request onto the game state, so the shell's own music() calls and the 'round' events always agree. */
  function resolveMode(x) {
    if (x !== 'menu' && x !== 'lobby' && x !== 'round') return 'off';
    var s = SL.G && SL.G.state;
    if (s === 'lobby' || s === 'pick') return 'lobby';
    if (s === 'countdown' || s === 'live') return 'round';
    if (s === 'menu') return x === 'lobby' ? 'lobby' : 'menu';
    return x;
  }

  /* ---------------- per-frame: footsteps, spotted, heartbeat, muffle, music ---------------- */
  var FT = { p: { x: null, z: null, acc: 0 }, b: { x: null, z: null, acc: 0 } };
  var hb = 0, wasVis = false, muffleF = 18000;
  function trackSteps(u, tr, me) {
    if (!u || !u.alive) { tr.x = null; return; }
    if (tr.x == null) { tr.x = u.x; tr.z = u.z; tr.acc = 0; return; }
    var dx = u.x - tr.x, dz = u.z - tr.z, d = Math.sqrt(dx * dx + dz * dz);
    tr.x = u.x; tr.z = u.z;
    if (d > 1.5 || u.dashT > 0) return;        // teleport or dash (dash has its own whoosh)
    tr.acc += d;
    if (tr.acc < 0.75) return;
    tr.acc = tr.acc > 1.5 ? 0 : tr.acc - 0.75;
    var dist = me ? 0 : distTo(u.x, u.z);
    if (dist > 8) return;
    var a = me ? 1 : 0.7 * clamp(1 - dist / 8, 0.2, 1), t = now();
    var v = voice(ctx, panDest(me ? 0 : panOf(u.x)));
    nz(v, t, 'lowpass', rand(700, 950), 600, 0.7, 0.045, 0.06 * a, 0.005);
    nz(v, t, 'highpass', 3000, 3000, 0.7, 0.012, 0.02 * a, 0.002);
  }
  /* Heavy MG spin-up whine: a clean sine (plus a faint octave) that rises with u.spin01, only while spinning up. */
  var SPIN = { p: null, b: null }, SPIN_LAST = { p: 0, b: 0 };
  function spinStop(key, t) { var st = SPIN[key]; if (st) { kill(st.v, t); st.v.end = t; SPIN[key] = null; } }
  function spinWhine(u, key, me, t, dt) {
    var s = u && u.alive && u.weapon === 'hmg' && typeof u.spin01 === 'number' ? clamp(u.spin01, 0, 1) : 0;
    var prev = SPIN_LAST[key], rising = s > prev + 0.0005 && s < 0.995, st = SPIN[key];
    SPIN_LAST[key] = s;
    if (rising && !st && (me || distTo(u.x, u.z) < 14)) {
      var v = voice(ctx, panDest(me ? 0 : panOf(u.x)), u), o = ctx.createOscillator(), o2 = ctx.createOscillator();
      o.frequency.value = 220 + 680 * s; o2.frequency.value = 2 * (220 + 680 * s);
      o.connect(v.out); o2.connect(gainNode(ctx, 0.2, v.out));
      v.out.gain.setValueAtTime(0.0001, t);
      o.start(t); o2.start(t); o.stop(t + 30); o2.stop(t + 30);
      v.srcs.push(o, o2); v.end = t + 30;
      st = SPIN[key] = { v: v, o: o, o2: o2, idle: 0, f: 0, g: -1 };
    }
    if (!st) return;
    var f = 220 + 680 * s, g = rising ? 0.05 * (me ? 1 : 0.6 * att(u.x, u.z)) : 0;
    if (Math.abs(f - st.f) > 2) { st.f = f; st.o.frequency.setTargetAtTime(f, t, 0.03); st.o2.frequency.setTargetAtTime(2 * f, t, 0.03); }
    if (Math.abs(g - st.g) > 0.002) { st.g = g; st.v.out.gain.setTargetAtTime(g, t, rising ? 0.04 : 0.08); }
    st.idle = rising ? 0 : st.idle + dt;
    if (st.idle > 0.4 || !u || !u.alive) spinStop(key, t);
  }
  function heartbeat(t) {
    var v = voice(ctx, N.sfx);
    tn(v, t, 'sine', 75, 45, 0.09, 0.35, 0.004);              // short pitch-dropping thumps, no steady low tone
    nz(v, t, 'lowpass', 180, 180, 0.7, 0.05, 0.1, 0.002);
    tn(v, t + 0.18, 'sine', 68, 44, 0.08, 0.25, 0.004);
  }
  function resetRound() {
    FT.p.x = null; FT.b.x = null;
    hb = 0; wasVis = false; M.seen = -99;
    if (ctx) { spinStop('p', ctx.currentTime); spinStop('b', ctx.currentTime); }
    cancelUnits();
  }
  A.update = function (dt) {
    if (!ctx || !N.master) return;
    try {
      pump();
      if (!ok()) return;
      var G = SL.G, p = G.player, t = now(), live = G.state === 'live';
      dt = dt > 0 && dt < 0.5 ? dt : 0;
      if (live) {
        trackSteps(p, FT.p, true);
        trackSteps(G.bot, FT.b, false);
      }
      spinWhine(p, 'p', true, t, dt);
      spinWhine(G.bot, 'b', false, t, dt);
      var vis = !!(live && p && p.alive && (p.target || (SL.view && SL.view.botVisible === true)));
      if (vis) M.seen = t;                         // the round track raises its level at the next bar line
      wasVis = vis;
      var low = live && p && p.alive && p.hp < 35;
      if (low) {
        hb -= dt;
        if (hb <= 0) { heartbeat(t); hb = 0.55 + 0.35 * clamp((p.hp - 10) / 25, 0, 1); }
      } else hb = 0;
      var mf = low ? 2500 + 3500 * clamp(p.hp / 35, 0, 1) : 18000;
      if (Math.abs(mf - muffleF) > 200) { muffleF = mf; N.muffle.frequency.setTargetAtTime(mf, t, 0.25); }
    } catch (e) { /* ignore */ }
  };

  /* ---------------- graph, lifecycle, toggles ---------------- */
  function startWind() {
    var c = ctx;
    [-0.6, 0.6].forEach(function (side, i) {
      var src = c.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      var bp = filt(c, 'bandpass', 400, 0.6);
      var g = gainNode(c, 0.04);
      var dest = N.amb;
      if (hasPan) { var pn = c.createStereoPanner(); pn.pan.value = side; pn.connect(N.amb); dest = pn; }
      src.connect(bp); bp.connect(g); g.connect(dest);
      var lfo = c.createOscillator(); lfo.frequency.value = i ? 0.09 : 0.07;
      lfo.connect(gainNode(c, 250, bp.frequency));
      var glfo = c.createOscillator(); glfo.frequency.value = i ? 0.13 : 0.11;
      glfo.connect(gainNode(c, 0.015, g.gain));
      src.start(0, i * 0.5); lfo.start(0); glfo.start(0);
    });
  }
  function build() {
    var c = ctx, i;
    N.comp = c.createDynamicsCompressor();
    N.comp.threshold.value = -18; N.comp.knee.value = 6; N.comp.ratio.value = 4;
    N.comp.attack.value = 0.003; N.comp.release.value = 0.12;
    /* brickwall-style limiter after the bus compressor: keeps stacked shots, stings and music under 0 dBFS (no clipping) */
    N.lim = c.createDynamicsCompressor();
    N.lim.threshold.value = -3; N.lim.knee.value = 0; N.lim.ratio.value = 20;
    N.lim.attack.value = 0.001; N.lim.release.value = 0.08;
    N.comp.connect(N.lim);
    N.limOut = gainNode(c, 0.89, c.destination);
    N.lim.connect(N.limOut);
    N.master = gainNode(c, 1.1, N.comp);
    N.sfxG = gainNode(c, 1, N.master);
    N.musicG = gainNode(c, 1, N.master);
    N.muffle = filt(c, 'lowpass', 18000, 0.5, N.sfxG);
    N.sfx = gainNode(c, 1, N.muffle);
    N.ui = gainNode(c, 0.6, N.sfxG);
    N.aDuck = gainNode(c, 1, N.sfxG);
    N.amb = gainNode(c, 0.12, N.aDuck);                       // wind is a faint broadband bed, well under the music
    N.mFade = gainNode(c, 0, N.musicG);
    N.mDuck = gainNode(c, 1, N.mFade);
    N.music = gainNode(c, MUSIC_LEVEL, N.mDuck);
    N.stingBus = gainNode(c, MUSIC_LEVEL * 1.8, N.musicG);    // stingers: not ducked, not faded by song changes
    /* music room: two cross-fed delays through a dark low-pass (cheap, no convolver) */
    N.mVerbIn = gainNode(c, 1);
    var d1 = c.createDelay(1), d2 = c.createDelay(1), vlp = filt(c, 'lowpass', 2200, 0.5), vfb = gainNode(c, 0.3);
    d1.delayTime.value = 0.137; d2.delayTime.value = 0.211;
    N.mVerbIn.connect(d1); N.mVerbIn.connect(d2); d1.connect(vlp); d2.connect(vlp); vlp.connect(vfb); vfb.connect(d1); vfb.connect(d2);
    N.mVerbOut = gainNode(c, 0.5, N.musicG);
    vlp.connect(N.mVerbOut);
    N.echoIn = gainNode(c, 1);
    var dl = c.createDelay(1);
    dl.delayTime.value = 0.11;
    var efl = filt(c, 'lowpass', 1200, 0.7), fb = gainNode(c, 0.25, dl);
    N.echoIn.connect(dl); dl.connect(efl); efl.connect(fb);
    efl.connect(gainNode(c, 0.7, N.sfx));
    hasPan = false;
    try {
      if (typeof c.createStereoPanner === 'function') {
        N.pans = [];
        for (i = 0; i < 9; i++) { var p = c.createStereoPanner(); p.pan.value = -0.8 + 0.2 * i; p.connect(N.sfx); N.pans.push(p); }
        hasPan = true;
      }
    } catch (e) { hasPan = false; }
    var len = Math.floor((c.sampleRate || 44100) * 1.0);
    noiseBuf = c.createBuffer(1, len, c.sampleRate || 44100);
    var data = noiseBuf.getChannelData(0);
    for (i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    startWind();
    applyBus(true);
  }
  function applyBus(instant) {
    if (!ctx || !N.master) return;
    try {
      var t = ctx.currentTime, s = A.bus.sfx && !masterMute ? 1 : 0, m = A.bus.music && !masterMute ? 1 : 0;
      if (instant) { N.sfxG.gain.value = s; N.musicG.gain.value = m; return; }
      N.sfxG.gain.setTargetAtTime(s, t, 0.02);
      N.musicG.gain.setTargetAtTime(m, t, 0.05);
    } catch (e) { /* ignore */ }
  }
  function unlock() {
    try {
      var b = ctx.createBufferSource();
      b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
      b.connect(ctx.destination);
      b.start(0);
    } catch (e) { /* ignore */ }
  }
  function hidden() { return typeof document !== 'undefined' && !!document.hidden; }
  function onVis() { if (hidden()) A.suspend(); else A.resume(); }

  /* Safe on every user gesture: creates the context once, then resumes a suspended or iOS 'interrupted' one. */
  A.init = function () {
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
        build();
        A.ready = true;
        renderBanks();
        if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', onVis);
      }
      try { if (typeof navigator !== 'undefined' && navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
      if (ctx.state !== 'running') { unlock(); A.resume(); }
      applyMusic();
    } catch (e) { /* audio is optional */ }
  };
  A.resume = function () {
    if (!ctx || hidden()) return;
    try {
      if (ctx.state !== 'running' && ctx.resume) {
        var pr = ctx.resume();
        if (pr && pr.then) pr.then(function () { if (M.mode !== 'off') startTimer(); }, function () {});
      }
      if (M.mode !== 'off') startTimer();
    } catch (e) { /* ignore */ }
  };
  A.suspend = function () {
    stopTimer();
    if (!ctx) return;
    try {
      if (ctx.suspend && ctx.state === 'running') {
        var pr = ctx.suspend();
        if (pr && pr.catch) pr.catch(function () {});
      }
    } catch (e) { /* ignore */ }
  };
  /* 'menu' | 'round' | 'off' per contract; 'lobby' also accepted. Requests are mapped onto SL.G.state. */
  A.music = function (mode) {
    M.want = resolveMode(mode);
    try { applyMusic(); } catch (e) { /* ignore */ }
  };
  A.setBus = function (name, on) {
    if (name !== 'music' && name !== 'sfx') return;
    A.bus[name] = !!on;
    if (SL.store) SL.store.set(name === 'music' ? K_MUSIC : K_SFX, !!on);
    applyBus(false);
  };
  /* Legacy shims for the v1 shell; not part of the v2 contract. */
  A.setMuted = function (m) { masterMute = !!m; applyBus(false); };
  A.beep = function (kind) { ui(kind); };
  /* Introspection for tests. */
  A._stats = function () {
    return { voices: voices.length, mvoices: mVoices.length, banks: Object.keys(bank).length, mode: M.mode, pan: hasPan, lvl: M.lvl, sting: !!M.sting, spin: !!(SPIN.p || SPIN.b) };
  };
  A._songs = function () {
    var o = { errors: SCORE_ERR.slice() };
    [SONGS.menu, SONGS.round].concat(Object.keys(STINGS).map(function (k) { return STINGS[k]; })).forEach(function (s) {
      o[s.name] = { bpm: s.bpm, bars: s.len / 16, seconds: s.len * sd16(s.bpm) };
    });
    return o;
  };

  /* ---------------- event wiring ---------------- */
  var lastRoundSting = -9;
  function onRound(e) {
    if (!e) return;
    try {
      var ph = e.phase;
      if (ph === 'menu') { resetRound(); A.music('menu'); }
      else if (ph === 'lobby' || ph === 'pick') { resetRound(); A.music('lobby'); }
      else if (ph === 'countdown') { resetRound(); A.music('round'); }
      else if (ph === 'live') { if (M.want !== 'round') A.music('round'); }
      else if (ph === 'roundEnd') {
        cancelUnits();
        A.music('off');
        if (ok()) { playSting(e.winner === 'p' ? 'roundWin' : e.winner === 'b' ? 'roundLose' : 'roundDraw', 0); lastRoundSting = now(); }
      } else if (ph === 'matchEnd') {
        cancelUnits();
        A.music('off');
        if (ok()) playSting(e.winner === 'p' ? 'matchWin' : 'matchLose', 0);
      }
    } catch (err) { /* ignore */ }
  }
  if (SL.on) {
    SL.on('shot', onShot);
    SL.on('damage', onDamage);
    SL.on('death', onDeath);
    SL.on('reload', onReload);
    SL.on('dash', onDash);
    SL.on('laser', onLaser);
    SL.on('ping', onPing);
    SL.on('round', onRound);
    SL.on('ui', function (e) { if (e) ui(e.kind, e.id); });
  }
})(window.SL);
