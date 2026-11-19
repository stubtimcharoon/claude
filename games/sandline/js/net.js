/* Sandline Duel: online 1v1 over the artifact runtime's `room` capability. No server, no WebSocket.
   Registers SL.net (API in core.js). Uses room PRESENCE only (events need permissions most viewers lack).

   Roles. The host runs the real simulation (combat, rounds, scores) and is authoritative for everything except the
   guest's own movement. The guest moves its own unit locally (main.js calls combat.moveOnly) and reports it; the host
   writes it into SL.G.bot (speed-clamped, collided) and main.js runs combat on it with opts.external.
   Same world coordinates on both sides: the host's G.player is the guest's G.bot and vice versa.

   Room name: 'sl-' + lowercase 5-char code. Presence objects (whole object re-sent at ~20 Hz, kept < 3.5 KiB):
     host  { v:1, role:'host',  opp:'<guest peer label>'|'', info, snap }
     guest { v:1, role:'guest', info, me:{ x, z, vx, vz, dashT, seq, t, k } }      k = last reset counter applied
     info  { pick:{r,w}, ready, rematch, equip:{headgear,trim,tracer,killfx} }
     snap  { q:seq, t:hostMs, s:state, r:round, rt:roundT, st:stateT, sc:[hostScore, guestScore], w:'p'|'b'|'',
             k:resetCounter, ts:timeScale, u:[hostUnit, guestUnit], e:[last <= 12 events] }
     unit  [x, z, aim, hp, alive, weaponIdx, ammo, reloading, dashT, laserT, flashT, hitDir, vx, vz, target]
     event ['s',id,u,weaponIdx,mx,mz,[x1,z1,hit,...]] shot | ['d',id,target,attacker,amount,x,z] damage |
           ['k',id,unit,killer] death | ['r',id,u] reload | ['h',id,u] dash | ['l',id,u] laser | ['p',id,u,x,z] ping
           unit indexes: 0 = host's unit, 1 = guest's unit, -1 = none. ids increase; the guest relays each id once. */
'use strict';
(function (SL) {
  var C = SL.C;
  var ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars: no I, L, O, 0, 1
  var CODE_LEN = 5, PROTO = 1;
  var SEND_MS = 50, IDLE_SEND_MS = 200, LOST_MS = 10000, JOIN_MS = 6000, POLL_MS = 100;
  var INTERP_MS = 100, EXTRAP_MS = 100, MAX_EVENTS = 12, SNAP_BUDGET = 3400;
  var STATES = { menu: 1, lobby: 1, pick: 1, countdown: 1, live: 1, roundEnd: 1, matchEnd: 1 };
  var RESET_STATES = { menu: 1, lobby: 1, pick: 1, countdown: 1 };
  var EQUIP_SLOTS = ['headgear', 'trim', 'tracer', 'killfx'];

  var N = SL.net = { status: 'off' };
  N._now = function () { return Date.now(); };             // tests replace this with a fake clock
  N._dbg = { maxBytes: 0, gaps: 0, published: 0, applied: 0, lastQ: null, firstEv: null, lastEv: null, log: null };

  var S = null;            // active session or null
  var statusFns = [];
  var nsPromise = null;
  var localInfo = { equip: null, pick: null, ready: false, rematch: 0 };

  /* ---------------- helpers ---------------- */
  function noop() {}
  function num(v, d) { v = +v; return isFinite(v) ? v : (d || 0); }
  function r2(v) { v = +v; return isFinite(v) ? Math.round(v * 100) / 100 : 0; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dashTime() { return C.DASH_TIME || 0.16; }
  function dashSpeed() { return (C.DASH_DIST || 4) / dashTime(); }
  function dashCd() { return C.DASH_CD || 5; }
  function widx(id) { var i = SL.WEAPON_ORDER.indexOf(id); return i < 0 ? 1 : i; }
  function wid(i) { return SL.WEAPON_ORDER[i | 0] || 'rifle'; }
  function bytes(str) {
    var n = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) n += 1; else if (c < 0x800) n += 2; else if (c >= 0xd800 && c < 0xdc00) { n += 4; i++; } else n += 3;
    }
    return n;
  }
  function err(code, message) { var e = new Error(message); e.code = code; return e; }
  function wrapErr(e) {
    if (e && e.code && e instanceof Error) return e;
    var code = e && e.code ? e.code : 'upstream_error';
    var msg = code === 'not_permitted' ? 'Online rooms are not allowed for this viewer.' :
      code === 'limit_reached' ? 'Too many rooms open right now. Try again shortly.' :
      'Could not reach the room. Try again.';
    return err(code, msg);
  }
  function randInt(n) {
    try {
      var c = window.crypto;
      if (c && c.getRandomValues) { var a = new Uint32Array(1); c.getRandomValues(a); return a[0] % n; }
    } catch (e) { /* fall back */ }
    return Math.floor(Math.random() * n);
  }
  function newCode() { var s = ''; for (var i = 0; i < CODE_LEN; i++) s += ALPHABET.charAt(randInt(ALPHABET.length)); return s; }
  function normCode(code) { return String(code == null ? '' : code).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function validCode(code) {
    if (code.length !== CODE_LEN) return false;
    for (var i = 0; i < code.length; i++) if (ALPHABET.indexOf(code.charAt(i)) < 0) return false;
    return true;
  }
  function roomName(code) { return 'sl-' + code.toLowerCase(); }
  function safePeers(room) { try { var p = room.peers(); return p && typeof p.length === 'number' ? p : []; } catch (e) { return []; } }

  function cleanStr(v, max) { return typeof v === 'string' && v.length <= max && /^[A-Za-z0-9_-]*$/.test(v) ? v : null; }
  function cleanInfo(src) {
    var o = { pick: null, ready: false, rematch: 0, equip: null };
    if (!src || typeof src !== 'object') return o;
    if (src.pick && typeof src.pick === 'object') {
      var w = cleanStr(src.pick.w, 16);
      if (w && SL.WEAPONS[w]) o.pick = { r: clamp(num(src.pick.r) | 0, 0, 999), w: w };
    }
    o.ready = !!src.ready;
    o.rematch = clamp(num(src.rematch) | 0, 0, 9999);
    if (src.equip && typeof src.equip === 'object') {
      o.equip = {};
      EQUIP_SLOTS.forEach(function (k) { o.equip[k] = cleanStr(src.equip[k], 32) || SL.DEFAULT_EQUIP[k]; });
    }
    return o;
  }

  function setStatus(s) {
    if (N.status === s) return;
    N.status = s;
    statusFns.slice().forEach(function (fn) { try { fn(s); } catch (e) { console.error(e); } });
  }

  function roomNs() {
    if (!nsPromise) {
      var c = typeof window !== 'undefined' ? window.claude : null;
      if (!c || typeof c.use !== 'function') nsPromise = Promise.resolve(null);
      else {
        nsPromise = new Promise(function (res) {
          try { Promise.resolve(c.use('room')).then(function (r) { res(r || null); }, function () { res(null); }); }
          catch (e) { res(null); }
        });
      }
    }
    return nsPromise;
  }

  /* ---------------- session ---------------- */
  function newSession(role, room, code) {
    var now = N._now();
    return {
      role: role, room: room, code: code, t0: now, unsubs: [],
      myPeer: null, oppPeer: null, oppPres: null, oppInfo: null, lastHeard: now, joined: false,
      seq: 0, lastSend: -1e9, pubFail: false,
      /* host */ resetK: 0, lastState: SL.G.state, lastW: null, lastMeSeq: null, lastApplyT: 0,
      inDash: false, dashOk: false, lastDashAt: -1e9, ring: [], evId: 0,
      /* guest */ lastQ: null, appliedK: -1, lastEv: null, buf: [], off: null, snapAt: now, baseRT: 0, baseST: 0
    };
  }

  function watch(s) {
    try {
      s.unsubs.push(s.room.onPeers(function () { if (S === s) scan(s); }, function () { if (S === s) setStatus('lost'); }));
    } catch (e) { /* tick() still scans */ }
  }

  function publish(s, pres) {
    var txt = JSON.stringify(pres), n = bytes(txt);
    if (n > N._dbg.maxBytes) N._dbg.maxBytes = n;
    N._dbg.published++;
    s.lastSend = N._now();
    try {
      var p = s.room.presence(pres);
      if (p && p.catch) p.catch(function (e) { if (!s.pubFail) { s.pubFail = true; console.warn('net: presence rejected', e && e.code); } });
    } catch (e) { /* rejects, never throws; be safe anyway */ }
  }

  /* Find the opponent (and accept a guest on the host). Updates lastHeard and status. Returns the opponent peer. */
  function scan(s) {
    var ps = safePeers(s.room), opp = null, cand = null, now = N._now();
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p.sameTab) { s.myPeer = p.peer; continue; }
      if (p.kind === 'agent') continue;
      var pr = p.presence || {};
      if (s.oppPeer) { if (p.peer === s.oppPeer) opp = p; }
      else if (s.role === 'host' && !cand && pr.v === PROTO && pr.role === 'guest') cand = p;
    }
    if (s.role === 'host' && !s.oppPeer && cand) {
      s.oppPeer = cand.peer; opp = cand; s.lastHeard = now;
      s.lastSend = -1e9; // advertise the pairing on the next tick
    }
    if (opp && s.role === 'guest') {
      var hp = opp.presence || {};
      if (hp.role !== 'host' || (s.myPeer && hp.opp !== s.myPeer)) opp = null; // host gone or paired with someone else
    }
    if (opp && opp.presence !== s.oppPres) {
      s.oppPres = opp.presence; s.lastHeard = now;
      s.oppInfo = opp.presence && opp.presence.info ? cleanInfo(opp.presence.info) : s.oppInfo;
    }
    if (!s.oppPeer) setStatus('waiting');
    else if (s.joined || s.role === 'host') setStatus(opp && now - s.lastHeard <= LOST_MS ? 'connected' : 'lost');
    return opp && now - s.lastHeard <= LOST_MS ? opp : null;
  }

  function infoOut() {
    var o = cleanInfo(localInfo);
    var out = { ready: o.ready, rematch: o.rematch };
    if (o.pick) out.pick = o.pick;
    out.equip = o.equip || cleanInfo({ equip: SL.DEFAULT_EQUIP }).equip;
    return out;
  }

  /* ---------------- host ---------------- */
  function packUnit(u) {
    if (!u) return 0;
    return [r2(u.x), r2(u.z), r2(u.aim), r2(u.hp), u.alive ? 1 : 0, widx(u.weapon), u.ammo | 0, u.reloading ? 1 : 0,
      r2(u.dashT || 0), r2(u.laserT || 0), r2(u.flashT || 0), r2(u.hitDir || 0), r2(u.vx), r2(u.vz), u.target ? 1 : 0];
  }

  function hostPresence(s, nEv) {
    var G = SL.G;
    return {
      v: PROTO, role: 'host', opp: s.oppPeer || '', info: infoOut(),
      snap: {
        q: s.seq, t: Math.round(N._now() - s.t0), s: G.state, r: G.round | 0, rt: r2(G.roundT), st: r2(G.stateT),
        sc: [G.scoreP | 0, G.scoreB | 0], w: G.lastRoundWinner === 'p' || G.lastRoundWinner === 'b' ? G.lastRoundWinner : '',
        k: s.resetK, ts: r2(G.timeScale == null ? 1 : G.timeScale), u: [packUnit(G.player), packUnit(G.bot)],
        e: nEv > 0 ? s.ring.slice(-nEv) : []
      }
    };
  }

  function hostPublish(s) {
    s.seq++;
    var nEv = s.ring.length, pres = hostPresence(s, nEv);
    while (nEv > 0 && bytes(JSON.stringify(pres)) > SNAP_BUDGET) { nEv--; pres = hostPresence(s, nEv); }
    publish(s, pres);
  }

  function uIndex(u) { var G = SL.G; return !u ? -1 : u === G.player ? 0 : u === G.bot ? 1 : -1; }

  function record(kind, ev) {
    var s = S;
    if (!s || s.role !== 'host' || !ev) return;
    var id = ++s.evId, e = null;
    if (kind === 'shot') {
      var f = [];
      (ev.tracers || []).forEach(function (t) { f.push(r2(t.x1), r2(t.z1), t.hit ? 1 : 0); });
      e = ['s', id, uIndex(ev.u), widx(ev.weapon && ev.weapon.id), r2(ev.mx), r2(ev.mz), f];
    } else if (kind === 'damage') e = ['d', id, uIndex(ev.target), uIndex(ev.attacker), r2(ev.amount), r2(ev.x), r2(ev.z)];
    else if (kind === 'death') e = ['k', id, uIndex(ev.unit), uIndex(ev.killer)];
    else if (kind === 'reload') e = ['r', id, uIndex(ev.u)];
    else if (kind === 'dash') e = ['h', id, uIndex(ev.u)];
    else if (kind === 'laser') e = ['l', id, uIndex(ev.u)];
    else if (kind === 'ping') e = ['p', id, uIndex(ev.u), r2(ev.x), r2(ev.z)];
    if (!e || e[2] < 0) { s.evId--; return; }
    s.ring.push(e);
    if (s.ring.length > MAX_EVENTS) s.ring.shift();
    if (N._dbg.log) N._dbg.log.push(e);
  }
  ['shot', 'damage', 'death', 'reload', 'dash', 'laser', 'ping'].forEach(function (k) {
    SL.on(k, function (ev) { record(k, ev); });
  });

  /* Write the guest's reported movement into the host's copy of the guest unit (SL.G.bot). */
  function applyGuest(s, me, now) {
    var u = SL.G.bot;
    if (!u || !me || typeof me !== 'object' || me.k !== s.resetK || me.seq === s.lastMeSeq) return;
    s.lastMeSeq = me.seq;
    var x = +me.x, z = +me.z;
    if (!isFinite(x) || !isFinite(z) || !u.alive) return;
    var el = s.lastApplyT ? clamp((now - s.lastApplyT) / 1000, 0.02, 0.5) : 0.1;
    s.lastApplyT = now;
    var dT = clamp(num(me.dashT), 0, dashTime());
    if (dT > 0 && !s.inDash) {
      s.inDash = true;
      s.dashOk = now - s.lastDashAt >= (dashCd() - 0.3) * 1000;
      if (s.dashOk) { s.lastDashAt = now; u.dashCd = dashCd(); SL.emit('dash', { u: u }); }
    } else if (dT <= 0) { s.inDash = false; s.dashOk = false; }
    var dashing = s.inDash && s.dashOk;
    var w = SL.WEAPONS[u.weapon] || SL.WEAPONS.rifle;
    var cap = dashing ? dashSpeed() : w.speed * 1.3;
    var maxD = cap * el + 0.15;
    var dx = x - u.x, dz = z - u.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > maxD) { dx *= maxD / d; dz *= maxD / d; d = maxD; }
    var steps = Math.max(1, Math.ceil(d / 0.25));
    for (var i = 0; i < steps; i++) {
      var px = u.x, pz = u.z;
      u.x += dx / steps; u.z += dz / steps;
      SL.world.collide(u, px, pz);
    }
    var vx = num(me.vx), vz = num(me.vz), sp = Math.sqrt(vx * vx + vz * vz);
    if (sp > cap) { vx *= cap / sp; vz *= cap / sp; }
    u.vx = vx; u.vz = vz;
    u.dashT = dashing ? dT : 0;
  }

  function hostTick(s) {
    var G = SL.G, now = N._now(), b = G.bot;
    var opp = scan(s);
    if (G.state !== s.lastState) { if (RESET_STATES[G.state]) s.resetK++; s.lastState = G.state; }
    if (b && s.lastW && (Math.abs(b.x - s.lastW.x) > 1 || Math.abs(b.z - s.lastW.z) > 1)) s.resetK++; // teleported by main
    if (opp && b) applyGuest(s, opp.presence && opp.presence.me, now);
    if (now - s.lastSend >= (s.oppPeer ? SEND_MS : IDLE_SEND_MS)) hostPublish(s);
    s.lastW = b ? { x: b.x, z: b.z } : null;
  }

  /* ---------------- guest ---------------- */
  function unitFor(i) { var G = SL.G; return i === 0 ? G.bot : i === 1 ? G.player : null; }
  function mirrorW(w) { return w === 'p' ? 'b' : w === 'b' ? 'p' : null; }

  function applyCombat(u, a, own) {
    if (!u || !a || typeof a.length !== 'number' || a.length < 15) return;
    u.aim = num(a[2], u.aim); u.hp = clamp(num(a[3], u.hp), 0, C.HP);
    var alive = !!a[4];
    if (alive !== u.alive) { u.deadT = 0; if (!alive) { u.vx = 0; u.vz = 0; u.moving = false; } }
    u.alive = alive;
    u.weapon = wid(a[5]); u.ammo = num(a[6]) | 0; u.reloading = !!a[7];
    if (!own) u.dashT = num(a[8]);
    u.laserT = num(a[9]); u.flashT = Math.max(u.flashT || 0, num(a[10])); u.hitDir = num(a[11]); u.target = !!a[14];
  }

  function stat(u, k, v, max) {
    if (!u || !u.stats) return;
    if (max) u.stats[k] = Math.max(u.stats[k] || 0, v); else u.stats[k] = (u.stats[k] || 0) + v;
  }

  function relay(e) {
    var G = SL.G, kind = e[0], u = unitFor(e[2]);
    if (!u) return;
    if (kind === 's') {
      var w = SL.WEAPONS[wid(e[3])], mx = num(e[4]), mz = num(e[5]), f = e[6] || [], tr = [], hits = 0;
      for (var i = 0; i + 2 < f.length; i += 3) { tr.push({ x0: mx, z0: mz, x1: num(f[i]), z1: num(f[i + 1]), hit: !!f[i + 2] }); if (f[i + 2]) hits++; }
      u.flashT = 0.05;
      stat(u, 'shots', 1); if (hits) stat(u, 'hits', 1);
      SL.emit('shot', { u: u, weapon: w, mx: mx, mz: mz, tracers: tr });
    } else if (kind === 'd') {
      var att = unitFor(e[3]), amt = num(e[4]);
      u.hitT = 0.12;
      stat(u, 'dmgTaken', amt); stat(att, 'dmgDealt', amt);
      SL.emit('damage', { target: u, attacker: att, amount: amt, x: num(e[5]), z: num(e[6]) });
    } else if (kind === 'k') {
      var killer = unitFor(e[3]);
      if (u.alive) { u.alive = false; u.deadT = 0; u.vx = 0; u.vz = 0; }
      if (killer && killer !== u) { stat(killer, 'kills', 1); stat(killer, 'longest', Math.sqrt((killer.x - u.x) * (killer.x - u.x) + (killer.z - u.z) * (killer.z - u.z)), true); }
      SL.emit('death', { unit: u, killer: killer });
    } else if (kind === 'r') SL.emit('reload', { u: u });
    else if (kind === 'h') { if (u !== G.player) SL.emit('dash', { u: u }); } // own dash was already emitted locally
    else if (kind === 'l') SL.emit('laser', { u: u });
    else if (kind === 'p') SL.emit('ping', { u: u, x: num(e[3]), z: num(e[4]) });
  }

  function applySnap(s, sn, now) {
    var G = SL.G;
    if (typeof sn.q !== 'number' || !STATES[sn.s] || !sn.u || !sn.sc) return;
    var first = s.lastQ === null;
    if (!first && sn.q <= s.lastQ) return;
    s.lastQ = sn.q; N._dbg.lastQ = sn.q; N._dbg.applied++;
    var t = num(sn.t), off = now - t;
    s.off = s.off === null ? off : Math.min(off, s.off + 2);

    var prevState = G.state;
    G.state = sn.s; G.round = num(sn.r, 1) | 0;
    G.roundT = Math.max(0, num(sn.rt)); G.stateT = Math.max(0, num(sn.st));
    G.scoreP = clamp(num(sn.sc[1]) | 0, 0, 99); G.scoreB = clamp(num(sn.sc[0]) | 0, 0, 99);
    G.lastRoundWinner = mirrorW(sn.w);
    G.timeScale = clamp(num(sn.ts, 1), 0, 2);
    s.snapAt = now; s.baseRT = G.roundT; s.baseST = G.stateT;

    var me = G.player, op = G.bot, um = sn.u[1], uo = sn.u[0];
    applyCombat(me, um, true);
    applyCombat(op, uo, false);
    var k = num(sn.k) | 0;
    if (first || k !== s.appliedK) {
      s.appliedK = k;
      if (me && um && um.length) { me.x = num(um[0], me.x); me.z = num(um[1], me.z); me.vx = 0; me.vz = 0; me.dashT = 0; }
      if (op && uo && uo.length) { op.x = num(uo[0], op.x); op.z = num(uo[1], op.z); }
      s.buf.length = 0;
      s.lastSend = -1e9; // ack the reset right away
    }
    if (uo && uo.length) {
      s.buf.push({ t: t, x: num(uo[0]), z: num(uo[1]), a: num(uo[2]), vx: num(uo[12]), vz: num(uo[13]) });
      if (s.buf.length > 40) s.buf.shift();
    }

    var evs = [];
    if (sn.e && typeof sn.e.length === 'number') for (var i = 0; i < sn.e.length; i++) if (sn.e[i] && typeof sn.e[i][1] === 'number') evs.push(sn.e[i]);
    evs.sort(function (a, b) { return a[1] - b[1]; });
    if (s.lastEv === null) {
      s.lastEv = evs.length ? evs[evs.length - 1][1] : 0;
      N._dbg.firstEv = s.lastEv;
    } else {
      var gapChecked = false;
      for (var j = 0; j < evs.length; j++) {
        var id = evs[j][1];
        if (id <= s.lastEv) continue;
        if (!gapChecked && id > s.lastEv + 1) N._dbg.gaps++;
        gapChecked = true;
        s.lastEv = id;
        relay(evs[j]);
      }
    }
    N._dbg.lastEv = s.lastEv;

    if (G.state !== prevState) {
      SL.emit('round', { phase: G.state, winner: G.state === 'roundEnd' || G.state === 'matchEnd' ? G.lastRoundWinner : null,
        round: G.round, scoreP: G.scoreP, scoreB: G.scoreB });
    }
  }

  function interp(s, now) {
    var op = SL.G.bot, b = s.buf;
    if (!op || !b.length || s.off === null) return;
    var rt = now - s.off - INTERP_MS;
    while (b.length > 2 && b[1].t <= rt) b.shift();
    var x, z, a, vx, vz, L = b[b.length - 1];
    if (b.length === 1 || rt >= L.t) {          // past the newest snapshot: extrapolate a little
      var ext = op.alive ? clamp(rt - L.t, 0, EXTRAP_MS) / 1000 : 0;
      x = L.x + L.vx * ext; z = L.z + L.vz * ext; a = L.a; vx = L.vx; vz = L.vz;
    } else if (rt <= b[0].t) {
      x = b[0].x; z = b[0].z; a = b[0].a; vx = b[0].vx; vz = b[0].vz;
    } else {
      var p = b[0], q = b[1], f = (rt - p.t) / Math.max(1, q.t - p.t);
      x = p.x + (q.x - p.x) * f; z = p.z + (q.z - p.z) * f;
      a = p.a + SL.angDiff(p.a, q.a) * f;
      vx = p.vx + (q.vx - p.vx) * f; vz = p.vz + (q.vz - p.vz) * f;
    }
    if (SL.world.solid(Math.floor(x), Math.floor(z))) return; // extrapolated into a wall: hold
    op.x = x; op.z = z; op.aim = a; op.vx = vx; op.vz = vz;
    op.moving = Math.sqrt(vx * vx + vz * vz) >= C.STILL_SPEED;
  }

  function guestTick(s, dt) {
    var G = SL.G, now = N._now();
    var host = scan(s);
    if (host && host.presence && host.presence.snap) applySnap(s, host.presence.snap, now);
    interp(s, now);
    [G.player, G.bot].forEach(function (u) {
      if (!u) return;
      u.flashT = Math.max(0, (u.flashT || 0) - dt);
      u.hitT = Math.max(0, (u.hitT || 0) - dt);
      if (!u.alive) u.deadT = (u.deadT || 0) + dt;
    });
    var since = Math.min(0.25, Math.max(0, (now - s.snapAt) / 1000));
    if (G.state === 'live') G.roundT = Math.max(0, s.baseRT - since);
    G.stateT = s.baseST + since;
    if (now - s.lastSend >= SEND_MS) {
      var u = G.player;
      s.seq++;
      publish(s, {
        v: PROTO, role: 'guest', info: infoOut(),
        me: u ? { x: r2(u.x), z: r2(u.z), vx: r2(u.vx), vz: r2(u.vz), dashT: r2(u.dashT || 0), seq: s.seq, t: Math.round(now - s.t0), k: s.appliedK }
          : { x: 0, z: 0, vx: 0, vz: 0, dashT: 0, seq: s.seq, t: 0, k: -1 }
      });
    }
  }

  function waitForHost(s, deadline) {
    return new Promise(function (res, rej) {
      function check() {
        if (S !== s) { rej(err('cancelled', 'Join was cancelled.')); return; }
        var ps = safePeers(s.room), host = null;
        for (var i = 0; i < ps.length; i++) {
          var p = ps[i], pr = p.presence || {};
          if (p.sameTab) { s.myPeer = p.peer; continue; }
          if (p.kind !== 'agent' && pr.v === PROTO && pr.role === 'host') host = p;
        }
        if (host && s.myPeer) {
          var o = host.presence.opp;
          if (o === s.myPeer) { s.oppPeer = host.peer; s.lastHeard = N._now(); res(); return; }
          if (o) { rej(err('full', 'That game already has two players.')); return; }
        }
        if (N._now() + POLL_MS > deadline) {
          rej(host ? err('timeout', 'The host did not answer. Try again.') : err('no_host', 'No game found with that code.'));
          return;
        }
        setTimeout(check, POLL_MS);
      }
      check();
    });
  }

  /* ---------------- public API ---------------- */
  N.available = function () {
    return roomNs().then(function (r) { return !!(r && typeof r.join === 'function'); });
  };

  N.host = function () {
    N.leave();
    return roomNs().then(function (room) {
      if (!room) throw err('unavailable', 'Online play is not available in this view.');
      var code = newCode();
      return room.join(roomName(code)).then(function (nr) {
        var s = newSession('host', nr, code);
        S = s;
        SL.G.mode = 'host'; SL.G.flip = false;
        watch(s);
        setStatus('waiting');
        hostPublish(s);
        return code;
      });
    }).catch(function (e) { throw wrapErr(e); });
  };

  N.join = function (code) {
    code = normCode(code);
    if (!validCode(code)) return Promise.reject(err('bad_code', 'Codes are 5 letters and digits.'));
    N.leave();
    var s = null, deadline = N._now() + JOIN_MS;   // the whole join, room admission included, gives up after 6 s
    return roomNs().then(function (room) {
      if (!room) throw err('unavailable', 'Online play is not available in this view.');
      return room.join(roomName(code));
    }).then(function (nr) {
      s = newSession('guest', nr, code);
      S = s;
      setStatus('waiting');
      publish(s, { v: PROTO, role: 'guest', info: infoOut(), me: { x: 0, z: 0, vx: 0, vz: 0, dashT: 0, seq: 0, t: 0, k: -1 } });
      return waitForHost(s, deadline);
    }).then(function () {
      s.joined = true;
      SL.G.mode = 'guest'; SL.G.flip = true;
      watch(s);
      setStatus('connected');
    }, function (e) {
      if (s && S === s) N.leave();
      throw wrapErr(e);
    });
  };

  N.leave = function () {
    var s = S;
    S = null;
    if (s) {
      s.unsubs.forEach(function (u) { try { u(); } catch (e) { /* ignore */ } });
      try { var p = s.room.leave(); if (p && p.catch) p.catch(noop); } catch (e) { /* ignore */ }
      if (SL.G.mode === 'host' || SL.G.mode === 'guest') { SL.G.mode = 'solo'; SL.G.flip = false; }
    }
    localInfo.pick = null; localInfo.ready = false; localInfo.rematch = 0;
    setStatus('off');
  };

  N.onStatus = function (fn) {
    if (typeof fn !== 'function') return noop;
    statusFns.push(fn);
    return function () { var i = statusFns.indexOf(fn); if (i >= 0) statusFns.splice(i, 1); };
  };

  N.peerInfo = function () {
    if (!S || !S.oppInfo) return null;
    var o = S.oppInfo;
    return { equip: o.equip || null, pick: o.pick ? { r: o.pick.r, w: o.pick.w } : null, ready: o.ready, rematch: o.rematch };
  };

  N.setLocal = function (info) {
    if (!info || typeof info !== 'object') return;
    var before = JSON.stringify(infoOut());
    ['pick', 'ready', 'rematch', 'equip'].forEach(function (k) { if (k in info) localInfo[k] = info[k]; });
    if (S && JSON.stringify(infoOut()) !== before) S.lastSend = -1e9; // changed: advertise on the next tick
  };

  N.code = function () { return S ? S.code : null; };

  N.tick = function (dt) {
    var s = S;
    if (!s) return;
    dt = num(dt);
    if (s.role === 'host') hostTick(s);
    else if (s.joined) guestTick(s, dt);
  };
})(window.SL);
