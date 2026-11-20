/* Online 1v1 over a fake in-memory `room` capability. Two isolated SL instances (vm contexts) load core, world,
   combat and net. The host runs the real combat sim with a scripted mover; the guest runs a scripted mover that only
   moves itself. Fake clock and timers, presence delivered with latency and ~30/s coalescing.
   Run: node tests/net.test.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

var LAT = 60;            // ms one-way presence latency
var FRAME = 1000 / 60, DT = 1 / 60;

/* ---------------- fake clock and timers ---------------- */
var clock = { now: 1000000 }, timers = [], timerId = 0;
function fakeSetTimeout(fn, ms) { timers.push({ id: ++timerId, at: clock.now + (ms || 0), fn: fn }); return timerId; }
function fakeClearTimeout(id) { timers = timers.filter(function (t) { return t.id !== id; }); }
function runTimers() {
  for (;;) {
    var due = timers.filter(function (t) { return t.at <= clock.now; });
    if (!due.length) return;
    timers = timers.filter(function (t) { return t.at > clock.now; });
    due.sort(function (a, b) { return a.at - b.at; }).forEach(function (t) { t.fn(); });
  }
}
function flush() { return new Promise(function (r) { setImmediate(r); }); }

/* ---------------- fake room hub (subset of the room capability that net.js uses) ---------------- */
var hub = { rooms: {}, maxBytes: 0, snaps: {}, nextPeer: 0 };
function utf8(s) { return Buffer.byteLength(s, 'utf8'); }
function hubRoom(name) {
  return hub.rooms[name] || (hub.rooms[name] = { name: name, members: [], subs: [] });
}
function joinRoom(name, opts) {
  assert.ok(/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name), 'room name grammar: ' + name);
  var R = hubRoom(name);
  var m = { peer: 'p' + (++hub.nextPeer) + 'x', local: {}, published: Object.freeze({}), queue: [], lastQueue: -1e9,
    gone: false, views: {}, updatedAt: clock.now, sends: 0, born: clock.now };
  R.members.push(m);
  R.dirty = true;
  function viewFor(viewer) {
    return Object.freeze(R.members.filter(function (x) { return !x.gone; }).map(function (x) {
      var pres = x === viewer ? x.local : x.published;
      var c = x.views[viewer.peer];
      if (!c || c.pres !== pres) {
        c = x.views[viewer.peer] = { pres: pres, obj: Object.freeze({ peer: x.peer, by: null, isMe: x === viewer, sameTab: x === viewer,
          kind: 'viewer', guest: false, presence: pres, updatedAt: x.updatedAt }) };
      }
      return c.obj;
    }));
  }
  m.snapshot = function () { return viewFor(m); };
  return {
    name: name,
    presence: function (patch) {
      if (m.gone) return Promise.reject({ code: 'invalid_argument', message: 'left' });
      var merged = JSON.parse(JSON.stringify(m.local));
      Object.keys(patch).forEach(function (k) {
        assert.ok(/^[A-Za-z_][A-Za-z0-9_-]*$/.test(k), 'presence key ' + k);
        if (patch[k] === null) delete merged[k]; else merged[k] = JSON.parse(JSON.stringify(patch[k]));
      });
      var txt = JSON.stringify(merged), n = utf8(txt);
      if (n > hub.maxBytes) hub.maxBytes = n;
      if (n > 4096) return Promise.reject({ code: 'invalid_argument', message: 'presence over 4 KiB' });
      m.local = Object.freeze(merged);
      if (merged.snap) hub.snaps[merged.snap.q] = merged.snap;
      var last = m.queue[m.queue.length - 1];
      if (last && clock.now - m.lastQueue < 33) last.pres = m.local;   // coalesced to ~30 sends/s, whole object
      else { m.queue.push({ at: clock.now + LAT, pres: m.local }); m.lastQueue = clock.now; m.sends++; }
      return Promise.resolve();
    },
    peers: function () { return m.snapshot(); },
    onPeers: function (fn) {
      var sub = { m: m, fn: fn, known: {}, seen: {}, first: true };
      R.subs.push(sub);
      return function () { R.subs = R.subs.filter(function (x) { return x !== sub; }); };
    },
    connected: function () { return !m.gone; },
    onConnection: function (fn) { Promise.resolve().then(function () { fn(true); }); return function () {}; },
    emit: function () { return Promise.reject({ code: 'not_permitted', message: 'presence only' }); },
    on: function () { throw new Error('net.js must not use room events'); },
    leave: function () {
      if (!m.gone) { m.gone = true; R.dirty = true; R.subs = R.subs.filter(function (x) { return x.m !== m; }); }
      return Promise.resolve();
    },
    _m: m
  };
}
/* Deliver due presence and one coalesced onPeers change per room per frame. */
function hubStep() {
  Object.keys(hub.rooms).forEach(function (name) {
    var R = hub.rooms[name];
    R.members.forEach(function (m) {
      while (m.queue.length && m.queue[0].at <= clock.now) {
        var q = m.queue.shift();
        if (!m.gone) { m.published = q.pres; m.updatedAt = clock.now; R.dirty = true; }
      }
    });
    if (!R.dirty && !R.subs.some(function (s) { return s.first; })) return;
    R.dirty = false;
    R.subs.slice().forEach(function (sub) {
      var peers = sub.m.snapshot(), joined = [], updated = [], left = [], now = {};
      peers.forEach(function (p) {
        now[p.peer] = p;
        if (!sub.known[p.peer]) joined.push(p);
        else if (sub.known[p.peer] !== p) updated.push(p);
      });
      Object.keys(sub.known).forEach(function (k) { if (!now[k]) left.push(sub.known[k]); });
      sub.known = now; sub.first = false;
      if (joined.length || updated.length || left.length) sub.fn({ peers: peers, joined: joined, left: left, updated: updated });
    });
  });
}
function fakeClaude(opts) {
  var lobby = { join: function (name) { return Promise.resolve(joinRoom(name, opts)); } };
  return { use: function (n) { return Promise.resolve(n === 'room' ? lobby : null); } };
}

/* ---------------- isolated game instances ---------------- */
function instance(label, withClaude) {
  var win = {};
  if (withClaude === 'null') win.claude = { use: function () { return Promise.resolve(null); } };
  else if (withClaude) win.claude = fakeClaude({ label: label });
  var ctx = vm.createContext({ window: win, console: console, setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout });
  ['core.js', 'world.js', 'combat.js', 'net.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: label + ':' + f });
  });
  var SL = win.SL;
  SL.world.init();
  SL.net._now = function () { return clock.now; };
  SL.G.player = SL.makeUnit(true); SL.G.bot = SL.makeUnit(false);
  SL.G.player.foe = SL.G.bot; SL.G.bot.foe = SL.G.player;
  return { SL: SL, label: label };
}

/* Movement only (combat.moveOnly when the gameplay build provides it; else the v1 movement code). */
function moveOnly(SL, u, dt, mx, mz, mag) {
  if (SL.combat.moveOnly) return SL.combat.moveOnly(u, dt, mx, mz, mag);
  if (!u.alive) return;
  var w = SL.WEAPONS[u.weapon] || SL.WEAPONS.rifle, k = Math.min(1, dt * 14);
  u.vx += (mx * w.speed * mag - u.vx) * k; u.vz += (mz * w.speed * mag - u.vz) * k;
  var px = u.x, pz = u.z;
  u.x += u.vx * dt; u.z += u.vz * dt;
  SL.world.collide(u, px, pz);
}

/* Scripted mover: path toward the foe, stop once it is in sight and within 70% of weapon range. */
function Mover(SL) { this.SL = SL; this.path = null; this.i = 0; this.repath = 0; }
Mover.prototype.step = function (u, foe, dt) {
  var W = this.SL.world, w = this.SL.WEAPONS[u.weapon];
  if (!u.alive) return [0, 0, 0];
  var d = Math.hypot(foe.x - u.x, foe.z - u.z);
  if (foe.alive && d < w.range * 0.7 && W.los(u.x, u.z, foe.x, foe.z)) return [0, 0, 0];
  this.repath -= dt;
  if (!this.path || this.repath <= 0) { this.path = W.findPath(u.x, u.z, foe.x, foe.z) || []; this.i = 0; this.repath = 0.5; }
  while (this.i < this.path.length && Math.hypot(this.path[this.i].x - u.x, this.path[this.i].z - u.z) < 0.3) this.i++;
  if (this.i >= this.path.length) { this.path = null; return [0, 0, 0]; }
  var n = this.path[this.i], dx = n.x - u.x, dz = n.z - u.z, l = Math.hypot(dx, dz);
  return [dx / l, dz / l, 1];
};

/* Minimal host shell: lobby -> countdown -> live -> roundEnd -> ... -> matchEnd, like main.js. */
function HostShell(I) {
  var SL = I.SL, G = SL.G, C = SL.C, W = SL.world, self = this;
  this.mover = new Mover(SL); this.pickHonored = 0;
  G.state = 'lobby';
  function setState(s) {
    G.state = s; G.stateT = 0;
    SL.emit('round', { phase: s, winner: s === 'roundEnd' || s === 'matchEnd' ? G.lastRoundWinner : null });
  }
  function newRound() {
    var pw = SL.WEAPON_ORDER[Math.floor(Math.random() * 4)], pi = SL.net.peerInfo();
    var gw = pi && pi.pick && pi.pick.r === G.round ? pi.pick.w : 'rifle';
    if (gw !== 'rifle' || (pi && pi.pick && pi.pick.r === G.round)) self.pickHonored++;
    SL.combat.resetUnit(G.player, W.spawnP, -Math.PI / 2, pw);
    SL.combat.resetUnit(G.bot, W.spawnB, Math.PI / 2, gw);
    G.roundT = C.ROUND_TIME;
    setState('countdown');
  }
  function endRound(w) {
    if (G.state !== 'live') return;
    if (w === 'p') G.scoreP++; else if (w === 'b') G.scoreB++;
    G.lastRoundWinner = w;
    setState('roundEnd');
  }
  SL.on('death', function (ev) {
    if (G.state !== 'live') return;
    endRound(ev.killer === G.player ? 'p' : ev.killer === G.bot ? 'b' : ev.unit === G.player ? 'b' : 'p');
  });
  this.step = function (dt) {
    G.clock += dt; G.stateT += dt;
    if (G.state === 'lobby') { if (SL.net.status === 'connected') { G.round = 1; G.scoreP = G.scoreB = 0; newRound(); } }
    else if (G.state === 'countdown') { if (G.stateT >= 1) setState('live'); }
    else if (G.state === 'live') {
      G.roundT = Math.max(0, G.roundT - dt);
      if (G.roundT <= 0) endRound(G.player.hp > G.bot.hp ? 'p' : G.bot.hp > G.player.hp ? 'b' : null);
    } else if (G.state === 'roundEnd') {
      if (G.stateT >= 1) {
        if (G.scoreP >= C.WIN || G.scoreB >= C.WIN) setState('matchEnd');
        else { G.round++; newRound(); }
      }
    }
    var live = G.state === 'live', canMove = live || G.state === 'roundEnd';
    var m = canMove ? self.mover.step(G.player, G.bot, dt) : [0, 0, 0];
    SL.combat.updateUnit(G.player, dt, m[0], m[1], m[2], null, live);
    SL.combat.updateUnit(G.bot, dt, 0, 0, 0, null, live, { external: true });
    W.separate(G.player, G.bot);
    SL.net.tick(dt);
  };
}

/* Minimal guest shell: moves only itself; everything else comes from net.tick. */
function GuestShell(I) {
  var SL = I.SL, G = SL.G, self = this;
  this.mover = new Mover(SL); this.paused = false; this.solid = 0;
  G.state = 'lobby';
  this.step = function (dt) {
    if (self.paused) return;
    G.clock += dt;
    var canMove = (G.state === 'live' || G.state === 'roundEnd') && G.player.alive;
    var m = canMove ? self.mover.step(G.player, G.bot, dt) : [0, 0, 0];
    moveOnly(SL, G.player, dt, m[0], m[1], m[2]);
    if (G.state === 'roundEnd' || G.state === 'lobby' || G.state === 'countdown') {
      var r = G.state === 'roundEnd' ? G.round + 1 : G.round;
      SL.net.setLocal({ pick: { r: r, w: SL.WEAPON_ORDER[r % 4] } });
    }
    SL.net.tick(dt);
    if (SL.world.solid(Math.floor(G.player.x), Math.floor(G.player.z))) self.solid++;
  };
}

var NAMES = { s: 'shot', d: 'damage', k: 'death', r: 'reload', h: 'dash', l: 'laser', p: 'ping' };

async function frames(n, fn) {
  for (var i = 0; i < n; i++) {
    clock.now += FRAME;
    runTimers();
    hubStep();
    await flush();
    if (fn && fn() === false) return i;
  }
  return n;
}

async function main() {
  var H = instance('host', true), Gt = instance('guest', true);
  var HS = H.SL, GS = Gt.SL;

  /* availability: true with the capability, false without window.claude, false when use() gives null */
  assert.strictEqual(await HS.net.available(), true);
  var bare = instance('bare', false);
  assert.strictEqual(await bare.SL.net.available(), false);
  var nullCap = instance('nullcap', 'null');
  assert.strictEqual(await nullCap.SL.net.available(), false);
  var unavailErr = null;
  await nullCap.SL.net.host().catch(function (e) { unavailErr = e; });
  assert.strictEqual(unavailErr && unavailErr.code, 'unavailable');
  console.log('ok - available()');

  var hostStatus = [], guestStatus = [];
  HS.net.onStatus(function (s) { hostStatus.push(s); });
  GS.net.onStatus(function (s) { guestStatus.push(s); });

  var hostShell = new HostShell(H), guestShell = new GuestShell(Gt);
  HS.net._dbg.log = [];
  HS.net.setLocal({ equip: { headgear: 'goggles', trim: 'oasis', tracer: 'ice', killfx: 'glass' } });

  var code = await HS.net.host();
  assert.ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(code), 'code ' + code);
  assert.strictEqual(HS.G.mode, 'host'); assert.strictEqual(HS.G.flip, false);
  assert.strictEqual(HS.net.status, 'waiting');

  var joined = false, joinErr = null;
  GS.net.join(code.toLowerCase()).then(function () { joined = true; }, function (e) { joinErr = e; });
  var t0 = clock.now;
  await frames(600, function () { hostShell.step(DT); if (joined) guestShell.step(DT); return !(joined || joinErr); });
  assert.ok(!joinErr, 'join failed: ' + (joinErr && joinErr.code));
  assert.ok(joined && clock.now - t0 < 2000, 'joined quickly');
  assert.strictEqual(GS.G.mode, 'guest'); assert.strictEqual(GS.G.flip, true);
  assert.strictEqual(GS.net.status, 'connected');
  console.log('ok - host + join (' + Math.round(clock.now - t0) + ' ms)');

  /* events the guest re-emits, as (kind, side) with H = host's unit, G = guest's unit */
  var got = [];
  function side(u) { return u === GS.G.bot ? 'H' : u === GS.G.player ? 'G' : '?'; }
  GS.on('shot', function (e) { got.push('shot:' + side(e.u) + ':' + e.tracers.length); });
  GS.on('damage', function (e) { got.push('damage:' + side(e.target) + ':' + e.amount); });
  GS.on('death', function (e) { got.push('death:' + side(e.unit)); });
  GS.on('reload', function (e) { got.push('reload:' + side(e.u)); });
  GS.on('laser', function (e) { got.push('laser:' + side(e.u)); });
  GS.on('ping', function (e) { got.push('ping:' + side(e.u)); });
  GS.on('dash', function (e) { got.push('dash:' + side(e.u)); });
  var guestRounds = [];
  GS.on('round', function (e) { guestRounds.push(e.phase + ':' + e.winner); });

  /* full match */
  var mirrorChecks = 0, distSum = 0, distN = 0, hostSolid = 0, maxFrames = 60 * 60 * 8;
  var n = await frames(maxFrames, function () {
    hostShell.step(DT); guestShell.step(DT);
    var q = GS.net._dbg.lastQ, sn = q !== null ? hub.snaps[q] : null;
    if (sn) {
      assert.strictEqual(GS.G.state, sn.s, 'state mirrors snapshot');
      assert.strictEqual(GS.G.round, sn.r, 'round mirrors');
      assert.strictEqual(GS.G.scoreP, sn.sc[1], 'guest scoreP = host scoreB');
      assert.strictEqual(GS.G.scoreB, sn.sc[0], 'guest scoreB = host scoreP');
      assert.strictEqual(GS.G.lastRoundWinner, sn.w === 'p' ? 'b' : sn.w === 'b' ? 'p' : null, 'winner mirrors');
      mirrorChecks++;
    }
    if (HS.world.solid(Math.floor(HS.G.bot.x), Math.floor(HS.G.bot.z))) hostSolid++;
    if (HS.G.state === 'live' && GS.G.state === 'live' && GS.G.player.alive && HS.G.stateT > 0.5) {
      distSum += Math.hypot(HS.G.bot.x - GS.G.player.x, HS.G.bot.z - GS.G.player.z); distN++;
    }
    return !(HS.G.state === 'matchEnd' && GS.G.state === 'matchEnd');
  });
  assert.ok(n < maxFrames, 'match finished');
  await frames(30, function () { hostShell.step(DT); guestShell.step(DT); });
  assert.strictEqual(GS.G.scoreP, HS.G.scoreB); assert.strictEqual(GS.G.scoreB, HS.G.scoreP);
  assert.ok(Math.max(HS.G.scoreP, HS.G.scoreB) === HS.C.WIN, 'someone reached WIN');
  assert.ok(guestRounds.indexOf('matchEnd:' + (HS.G.scoreP > HS.G.scoreB ? 'b' : 'p')) >= 0, 'guest saw matchEnd with mirrored winner');
  assert.strictEqual(guestShell.solid, 0, 'guest never inside walls');
  assert.strictEqual(hostSolid, 0, 'host copy of guest never inside walls');
  var meanErr = distSum / Math.max(1, distN);
  assert.ok(meanErr < 0.6, 'host tracks guest movement (mean error ' + meanErr.toFixed(2) + ')');
  console.log('ok - match ' + HS.G.scoreP + ':' + HS.G.scoreB + ' in ' + HS.G.round + ' rounds, ' + (n / 60).toFixed(0) +
    ' s, ' + mirrorChecks + ' mirror checks, host-vs-guest position error ' + meanErr.toFixed(2) + ' u');

  /* events relayed exactly once, in order */
  var d = GS.net._dbg;
  var want = HS.net._dbg.log.filter(function (e) { return e[1] > d.firstEv && e[1] <= d.lastEv && !(e[0] === 'h' && e[2] === 1); })
    .map(function (e) {
      var s = e[2] === 0 ? 'H' : 'G';
      return e[0] === 's' ? 'shot:' + s + ':' + e[6].length / 3 : e[0] === 'd' ? 'damage:' + s + ':' + e[4] : NAMES[e[0]] + ':' + s;
    });
  assert.ok(want.length > 20, 'enough events to compare (' + want.length + ')');
  assert.strictEqual(d.gaps, 0, 'no event gaps');
  assert.deepStrictEqual(got, want, 'relayed events match host events exactly once');
  console.log('ok - ' + got.length + ' events relayed exactly once (' +
    got.filter(function (x) { return x.indexOf('death') === 0; }).length + ' deaths)');

  /* send budget: each page stays well under the ~40/s shared presence budget */
  Object.keys(hub.rooms).forEach(function (k) {
    hub.rooms[k].members.forEach(function (m) {
      var rate = m.sends / Math.max(1, (clock.now - m.born) / 1000);
      assert.ok(rate <= 31, 'presence sends/s ' + rate.toFixed(1));
    });
  });

  /* worst case size: a full ring of 9-pellet shotgun shots */
  for (var si = 0; si < 14; si++) {
    var tr = [];
    for (var pi9 = 0; pi9 < 9; pi9++) tr.push({ x0: 11.123, z0: 30.456, x1: 12.345 + pi9, z1: 25.678, hit: pi9 % 2 === 0 });
    HS.emit('shot', { u: HS.G.player, weapon: HS.WEAPONS.shotgun, mx: 11.123, mz: 30.456, tracers: tr });
  }
  await frames(6, function () { hostShell.step(DT); guestShell.step(DT); });

  /* snapshot size */
  assert.ok(HS.net._dbg.maxBytes < 3584, 'host presence < 3.5 KiB (' + HS.net._dbg.maxBytes + ')');
  assert.ok(hub.maxBytes <= 4096);
  console.log('ok - max presence ' + HS.net._dbg.maxBytes + ' bytes');

  /* info relay */
  var pi = GS.net.peerInfo();
  assert.ok(pi && pi.equip && pi.equip.trim === 'oasis', 'guest sees host equip');
  assert.ok(HS.net.peerInfo() && HS.net.peerInfo().pick, 'host sees guest pick');
  assert.ok(hostShell.pickHonored > 0, 'guest weapon picks reached the host');
  console.log('ok - info relay');

  /* a third player is turned away; a missing code fails within 6 s; a bad code fails at once */
  var Third = instance('third', true), thirdErr = null;
  Third.SL.net.join(code).catch(function (e) { thirdErr = e; });
  await frames(60 * 7, function () { hostShell.step(DT); guestShell.step(DT); return !thirdErr; });
  assert.ok(thirdErr && thirdErr.code === 'full', 'third player rejected: ' + (thirdErr && thirdErr.code));
  assert.strictEqual(HS.net.status, 'connected');
  assert.strictEqual(Third.SL.G.mode, 'solo');

  var Lost = instance('lost', true), missErr = null, tMiss = clock.now, tMissEnd = 0;
  Lost.SL.net.join('ZZZZ9').catch(function (e) { missErr = e; tMissEnd = clock.now; });
  await frames(60 * 8, function () { hostShell.step(DT); guestShell.step(DT); return !missErr; });
  assert.ok(missErr && missErr.code === 'no_host', 'missing code: ' + (missErr && missErr.code));
  assert.ok(tMissEnd - tMiss <= 6000 + FRAME, 'missing code fails within 6 s (' + Math.round(tMissEnd - tMiss) + ' ms)');
  assert.strictEqual(Lost.SL.net.status, 'off');
  var badErr = null;
  await Lost.SL.net.join('AB').catch(function (e) { badErr = e; });
  assert.strictEqual(badErr && badErr.code, 'bad_code');
  console.log('ok - full room, missing code (' + Math.round(tMissEnd - tMiss) + ' ms), bad code');

  /* silence: guest stops sending for > 10 s -> host 'lost'; resumes -> 'connected' */
  guestShell.paused = true;
  var tq = clock.now;
  await frames(60 * 11, function () { hostShell.step(DT); return HS.net.status !== 'lost'; });
  assert.strictEqual(HS.net.status, 'lost');
  assert.ok(clock.now - tq >= 10000 && clock.now - tq < 10600, 'lost after ~10 s of silence (' + Math.round(clock.now - tq) + ' ms)');
  guestShell.paused = false;
  await frames(60, function () { hostShell.step(DT); guestShell.step(DT); return HS.net.status !== 'connected'; });
  assert.strictEqual(HS.net.status, 'connected');
  console.log('ok - silence detected after ' + Math.round(clock.now - tq) + ' ms total, recovered');

  /* guest leaves -> host 'lost' quickly; guest back to solo */
  GS.net.leave();
  assert.strictEqual(GS.net.status, 'off'); assert.strictEqual(GS.G.mode, 'solo'); assert.strictEqual(GS.G.flip, false);
  var tl = clock.now;
  await frames(120, function () { hostShell.step(DT); return HS.net.status !== 'lost'; });
  assert.strictEqual(HS.net.status, 'lost');
  assert.ok(clock.now - tl < 500, 'leave noticed fast');
  HS.net.leave();
  assert.strictEqual(HS.G.mode, 'solo');
  assert.strictEqual(hostStatus[0], 'waiting');
  assert.ok(hostStatus.indexOf('connected') >= 0 && hostStatus.indexOf('lost') >= 0);
  assert.ok(guestStatus.indexOf('connected') >= 0 && guestStatus[guestStatus.length - 1] === 'off');
  console.log('ok - leave detected in ' + Math.round(clock.now - tl) + ' ms');
  console.log('ok - net');
}

main().catch(function (e) { console.error(e); process.exit(1); });
