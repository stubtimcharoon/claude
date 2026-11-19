/* Sandline Duel: synthesized audio (contract v2). WebAudio only, no files. Never throws if WebAudio is missing.
   Graph:
     one-shot voices > pan buses (9 fixed StereoPanners) > sfx > muffle LP > sfxGroup > master > compressor > out
     ui > sfxGroup;  wind > amb > ambDuck > sfxGroup
     music layers > music > musicDuck > musicFade > musicGroup > master
     echo send (one DelayNode, canyon slap) > sfx
   sfxGroup / musicGroup are the user toggles (SL.audio.bus, persisted with SL.store).
   Gunshots are pre-rendered into round-robin banks with OfflineAudioContext after init; until a bank is ready the
   same recipe is synthesized live. Music is a 16-step lookahead scheduler on ctx.currentTime. */
'use strict';
(function (SL) {
  var A = SL.audio = { ready: false, bus: { music: true, sfx: true } };
  var K_MUSIC = 'sandline.music', K_SFX = 'sandline.sfx';
  if (SL.store) {
    A.bus.music = SL.store.get(K_MUSIC, true) !== false;
    A.bus.sfx = SL.store.get(K_SFX, true) !== false;
  }

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
    sniper:  { click: [3000, 0.030, 0.50], body: ['lowpass', 1800, 250, 0.9, 0.40, 0.60],     thump: [70, 30, 0.30, 0.70],   send: 0.35, slot: 0.48, foley: 'bolt' }
  };
  function shotLayers(v, t, r) {
    var cv = jit(1, 0.15), pv = jit(1, 0.06), b = r.body, th = r.thump;
    nz(v, t, 'highpass', r.click[0] * cv, r.click[0] * cv, 0.7, r.click[1], r.click[2], 0.001);
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
        if (id === 'sniper') duck(mine ? 1 : 0.7);
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
        tn(v, t, 'square', 2000 * m, 2000 * m, 0.02, 0.08, 0.001, filt(ctx, 'bandpass', 2500 * m, 1.5, v.out));
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
        tn(v, t, 'sine', 90, 35, 0.6, 0.5, 0.005);
        nz(v, t, 'lowpass', 300, 120, 0.7, 0.5, 0.3, 0.004);
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
      if (u.weapon === 'shotgun') {
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
  /* Sniper aim warning: audible through fog, so it barely attenuates. */
  function onLaser(e) {
    if (!ok() || !e || !e.u) return;
    try {
      var u = e.u, mine = u === player(), t = now();
      if (dedupe('laser' + (mine ? 'p' : 'o'), t)) return;
      var a = mine ? 0.35 : Math.max(0.6, att(u.x, u.z)), v = voice(ctx, panDest(mine ? 0 : panOf(u.x)));
      tn(v, t, 'sine', 1400, 1800, 0.35, 0.12 * a, 0.01);
      tn(v, t, 'sine', 1410, 1812, 0.35, 0.08 * a, 0.01);
      tn(v, t, 'triangle', 700, 900, 0.35, 0.06 * a, 0.01);
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
  var CARD = { smg: 784, rifle: 659.3, shotgun: 523.3, sniper: 440 };
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
        [523.3, 659.3, 784].forEach(function (n) { tn(v, t, 'sawtooth', n, n, 0.35, 0.09, 0.005, lp); });
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
        [220, 221, 329.6, 440].forEach(function (f) { tn(v, t + 0.3, 'sawtooth', f, f, 1.2, 0.05, 0.25, lp); });
      } else if (kind === 'matchLose') {
        lp = filt(ctx, 'lowpass', 600, 0.7, v.out);
        tn(v, t, 'sawtooth', 110, 103.8, 1.5, 0.18, 0.02, lp);
        tn(v, t, 'sine', 55, 52, 1.5, 0.2, 0.02);
      }
      duck(1);
    } catch (err) { /* ignore */ }
  }

  /* ---------------- music: 16-step lookahead scheduler ---------------- */
  var SCALE = [0, 1, 4, 5, 7, 8, 10];             // D Phrygian dominant: D Eb F# G A Bb C
  var MENU_PH = [
    [0, null, null, 2, null, 4, null, 3, 2, null, null, 1, 0, null, null, null],
    [4, null, 3, null, 2, null, 4, 5, 4, null, null, 2, 1, null, 0, null]
  ];
  var OST = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 1, 0, -1];
  var LAYER_VOL = [1, 0.9, 0.8, 1];
  var M = { mode: 'off', want: 'menu', bpm: 92, nextT: 0, step: 0, bar: 0, timer: null,
            lv: [0, 0, 0, 0], lpf: 600, seen: -99, rng: Math.random };
  function deg(d, oct) {
    var n = SCALE.length, o = Math.floor(d / n), i = ((d % n) + n) % n;
    return midi(38 + 12 * (oct || 0) + 12 * o + SCALE[i]);   // 38 = D2
  }
  function stepDur() { return 60 / M.bpm / 4; }
  function lastPhase() { return SL.G && SL.G.state === 'live' && SL.G.roundT <= 15; }
  function mv(dest) { return voice(ctx, dest, null, true); }
  function drone(t, len, dest, vol) {
    var v = mv(dest), g = v.out.gain;
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(vol, t + 0.4);
    g.setValueAtTime(vol, t + len);
    g.linearRampToValueAtTime(0.0001, t + len + 0.6);
    oscAt(v, t, 'triangle', midi(38), t + len + 0.65);
    oscAt(v, t, 'sine', midi(45), t + len + 0.65);
  }
  function pluck(t, f, vol) { var v = mv(N.oudLP); tn(v, t, 'triangle', f, f, 0.25, vol, 0.003); tn(v, t, 'sine', f * 2, f * 2, 0.12, vol * 0.3, 0.002); }
  function shaker(t, dest, vol) { nz(mv(dest), t, 'highpass', 6000, 6000, 0.7, 0.02, vol, 0.001); }
  function tom(t, dest, vol) { tn(mv(dest), t, 'sine', 90, 50, 0.12, vol || 0.5, 0.003); }
  function swell(t, len, dest) {
    var v = mv(dest), g = v.out.gain, lp = filt(ctx, 'lowpass', 1200, 0.7, v.out);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(0.05, t + len * 0.5);
    g.linearRampToValueAtTime(0.0001, t + len);
    [220, 293.66].forEach(function (f) {
      oscAt(v, t, 'sawtooth', f, t + len + 0.05, -7, lp);
      oscAt(v, t, 'sawtooth', f, t + len + 0.05, 7, lp);
    });
  }
  function schedStep(t, s) {
    var sd = stepDur();
    if (M.mode === 'menu') {
      if (s === 0) drone(t, 16 * sd, N.menuG, 0.05);
      var ph = MENU_PH[M.bar % 2][s];
      if (ph != null) {
        if (M.rng() < 0.15) ph += M.rng() < 0.5 ? 1 : -1;
        pluck(t, deg(ph, 2), 0.18);
      }
      if (s % 4 === 2) shaker(t, N.menuG, 0.03);
    } else if (M.mode === 'round') {
      if (s === 0) drone(t, 16 * sd, N.mL[0], 0.06);
      if (M.lv[1] > 0.02) {
        if (s === 0 || s === 6 || s === 10) tom(t, N.mL[1]);
        if (s % 2 === 0) shaker(t, N.mL[1], 0.025);
      }
      if (M.lv[2] > 0.02) tn(mv(N.ostLP), t, 'sawtooth', deg(OST[s], 1), deg(OST[s], 1), sd * 0.9, 0.07, 0.004);
      if (M.lv[3] > 0.02 && s === 0 && M.bar % 2 === 0) swell(t, 32 * sd, N.mL[3]);
    }
  }
  function pump() {
    if (!ctx || M.mode === 'off' || ctx.state !== 'running') return;
    try {
      var t = ctx.currentTime;
      if (M.nextT < t - 0.2) M.nextT = t + 0.05; // resync after a stall or suspend
      while (M.nextT < t + LOOKAHEAD) {
        if (M.step === 0) M.bpm = M.mode === 'round' && lastPhase() ? 104 : 92;
        if (A.bus.music && !masterMute) schedStep(M.nextT, M.step);
        M.nextT += stepDur();
        M.step = (M.step + 1) % 16;
        if (M.step === 0) M.bar++;
      }
    } catch (e) { /* ignore */ }
  }
  function startTimer() {
    if (M.timer || typeof setInterval !== 'function') return;
    M.timer = setInterval(pump, TICK_MS);
    if (M.timer && M.timer.unref) M.timer.unref();
  }
  function stopTimer() { if (M.timer) { clearInterval(M.timer); M.timer = null; } }
  function applyMusic() {
    if (!ctx || !N.mFade) return;
    var mode = M.want, t = ctx.currentTime, g = N.mFade.gain;
    if (mode === M.mode) return;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    if (mode === 'off') {
      g.setTargetAtTime(0, t, 0.1);
      M.mode = 'off';
      stopTimer();
      return;
    }
    if (M.mode === 'off') g.setTargetAtTime(1, t, 0.2);
    M.mode = mode;
    M.nextT = Math.max(M.nextT, t + 0.05);
    M.step = 0; M.bar = 0;
    if (mode === 'round') resetLayers(t);
    startTimer();
    pump();
  }
  function resetLayers(t) {
    for (var i = 0; i < 4; i++) {
      M.lv[i] = i === 0 ? 1 : 0;
      N.mL[i].gain.cancelScheduledValues(t);
      N.mL[i].gain.setTargetAtTime(M.lv[i] * LAYER_VOL[i], t, 0.3);
    }
  }
  function musicUpdate(t) {
    if (M.mode !== 'round') return;
    var G = SL.G, I = t - M.seen < 3 ? 0.6 : 0.25;
    if (G.state === 'countdown') I = 0.2;
    if (lastPhase()) I = Math.max(I, 0.5 + 0.5 * (15 - G.roundT) / 15);
    var lv = [1, clamp((I - 0.2) / 0.3, 0, 1), clamp((I - 0.4) / 0.4, 0, 1), clamp((I - 0.7) / 0.3, 0, 1)];
    for (var i = 1; i < 4; i++) {
      if (Math.abs(lv[i] - M.lv[i]) > 0.03) { M.lv[i] = lv[i]; N.mL[i].gain.setTargetAtTime(lv[i] * LAYER_VOL[i], t, 1.5); }
    }
    var f = 600 + 2400 * I;
    if (Math.abs(f - M.lpf) > 50) { M.lpf = f; N.ostLP.frequency.setTargetAtTime(f, t, 1.5); }
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
  function heartbeat(t) {
    var v = voice(ctx, N.sfx);
    tn(v, t, 'sine', 55, 50, 0.07, 0.5, 0.005);
    tn(v, t + 0.18, 'sine', 52, 48, 0.06, 0.35, 0.005);
  }
  function resetRound() {
    FT.p.x = null; FT.b.x = null;
    hb = 0; wasVis = false; M.seen = -99;
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
      var vis = !!(live && p && p.alive && (p.target || (SL.view && SL.view.botVisible === true)));
      if (vis) {
        if (!wasVis && t - M.seen > 4 && A.bus.music) { var sv = mv(N.music); tn(sv, t, 'triangle', 146.8, 146.8, 0.25, 0.12, 0.004); tom(t, N.music, 0.35); }
        M.seen = t;
      }
      wasVis = vis;
      var low = live && p && p.alive && p.hp < 35;
      if (low) {
        hb -= dt;
        if (hb <= 0) { heartbeat(t); hb = 0.55 + 0.35 * clamp((p.hp - 10) / 25, 0, 1); }
      } else hb = 0;
      var mf = low ? 2500 + 3500 * clamp(p.hp / 35, 0, 1) : 18000;
      if (Math.abs(mf - muffleF) > 200) { muffleF = mf; N.muffle.frequency.setTargetAtTime(mf, t, 0.25); }
      musicUpdate(t);
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
    var gs = c.createBufferSource();
    gs.buffer = noiseBuf; gs.loop = true;
    var hp = filt(c, 'highpass', 3000, 0.7), gg = gainNode(c, 0.008, N.amb);
    gs.connect(hp); hp.connect(gg);
    var gl = c.createOscillator(); gl.frequency.value = 0.05;
    gl.connect(gainNode(c, 0.006, gg.gain));
    gs.start(0, 0.25); gl.start(0);
  }
  function build() {
    var c = ctx, i;
    N.comp = c.createDynamicsCompressor();
    N.comp.threshold.value = -18; N.comp.knee.value = 6; N.comp.ratio.value = 4;
    N.comp.attack.value = 0.003; N.comp.release.value = 0.12;
    N.comp.connect(c.destination);
    N.master = gainNode(c, 0.8, N.comp);
    N.sfxG = gainNode(c, 1, N.master);
    N.musicG = gainNode(c, 1, N.master);
    N.muffle = filt(c, 'lowpass', 18000, 0.5, N.sfxG);
    N.sfx = gainNode(c, 1, N.muffle);
    N.ui = gainNode(c, 0.6, N.sfxG);
    N.aDuck = gainNode(c, 1, N.sfxG);
    N.amb = gainNode(c, 0.5, N.aDuck);
    N.mFade = gainNode(c, 0, N.musicG);
    N.mDuck = gainNode(c, 1, N.mFade);
    N.music = gainNode(c, 0.35, N.mDuck);
    N.menuG = gainNode(c, 0.9, N.music);
    N.oudLP = filt(c, 'lowpass', 1600, 0.7, N.menuG);
    N.mL = [];
    for (i = 0; i < 4; i++) N.mL.push(gainNode(c, 0, N.music));
    N.ostLP = filt(c, 'lowpass', 600, 1, N.mL[2]);
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
  A.music = function (mode) {
    M.want = mode === 'menu' || mode === 'round' ? mode : 'off';
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
  A._stats = function () { return { voices: voices.length, banks: Object.keys(bank).length, mode: M.mode, pan: hasPan }; };

  /* ---------------- event wiring ---------------- */
  var lastRoundSting = -9;
  function onRound(e) {
    if (!e) return;
    try {
      var ph = e.phase;
      if (ph === 'menu' || ph === 'lobby' || ph === 'pick') { resetRound(); A.music('menu'); }
      else if (ph === 'countdown') { resetRound(); A.music('round'); }
      else if (ph === 'live') { if (M.want !== 'round') A.music('round'); }
      else if (ph === 'roundEnd') {
        cancelUnits();
        A.music('off');
        if (ok()) { sting(e.winner === 'p' ? 'roundWin' : e.winner === 'b' ? 'roundLose' : 'roundDraw', 0); lastRoundSting = now(); }
      } else if (ph === 'matchEnd') {
        cancelUnits();
        A.music('off');
        if (ok()) sting(e.winner === 'p' ? 'matchWin' : 'matchLose', now() - lastRoundSting < 0.6 ? 0.6 : 0);
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
