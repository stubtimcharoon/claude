/* Audio smoke test: loads core.js + audio.js against a strict fake WebAudio, fires every event type and music
   mode, and runs update() through a simulated match: 70 s of menu theme, lobby, pick, countdown pre-roll, a full
   45 s round (calm, spotted, last 15 s), stingers and a second short round. Also checks the score (bar lengths,
   tempos, durations), the music voice cap, determinism of the music, and runs with no StereoPanner /
   OfflineAudioContext and with no WebAudio at all. Run: node tests/audio.smoke.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
var SRC = ['core.js', 'audio.js'].map(function (f) {
  return { f: f, code: fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8') };
});
/* audio.js swallows errors by design; for the test, every catch also reports to window.__caught so bugs surface. */
SRC[1].code = SRC[1].code.replace(/catch \((e|err)\) \{/g, function (m, v) {
  return m + ' if (window.__caught) window.__caught.push(String(' + v + ' && ' + v + '.stack || ' + v + '));';
});

/* ---------- strict fake WebAudio: records misuse that real browsers would throw on ---------- */
function makeFake(opts) {
  var errors = [], stats = { nodes: 0, started: 0, offline: 0 }, log = opts.log ? [] : null;
  function fail(msg) { errors.push(msg); throw new Error(msg); }
  function num(v, what) { if (typeof v !== 'number' || !isFinite(v)) fail('non-finite ' + what + ': ' + v); }
  function Param(v) {
    this.value = v;
    this.setValueAtTime = function (x, t) { num(x, 'value'); num(t, 'time'); this.value = x; if (log) log.push(x.toFixed(4) + '@' + t.toFixed(4)); };
    this.linearRampToValueAtTime = function (x, t) { num(x, 'value'); num(t, 'time'); };
    this.exponentialRampToValueAtTime = function (x, t) { num(x, 'value'); num(t, 'time'); if (x <= 0) fail('exp ramp to <= 0'); };
    this.setTargetAtTime = function (x, t, k) { num(x, 'value'); num(t, 'time'); num(k, 'tau'); if (k < 0) fail('negative tau'); };
    this.cancelScheduledValues = function (t) { num(t, 'time'); };
  }
  function Node(params) {
    stats.nodes++;
    var self = this;
    (params || []).forEach(function (p) { self[p] = new Param(1); });
    this.connect = function (d) { if (!d) fail('connect to undefined'); return d; };
    this.disconnect = function () {};
  }
  function Source(params) {
    Node.call(this, params);
    var started = false;
    this.start = function (t, off, dur) {
      if (started) fail('start called twice');
      started = true; stats.started++;
      [t || 0, off || 0, dur == null ? 0 : dur].forEach(function (x) { num(x, 'start arg'); if (x < 0) fail('negative start arg'); });
    };
    this.stop = function (t) { num(t || 0, 'stop time'); };
  }
  function Buffer(ch, len, sr) {
    var data = [];
    for (var i = 0; i < ch; i++) data.push(new Float32Array(len));
    this.length = len; this.sampleRate = sr; this.duration = len / sr; this.numberOfChannels = ch;
    this.getChannelData = function (i) { return data[i]; };
  }
  function Ctx(sr) {
    this.sampleRate = sr || 48000;
    this.currentTime = 0;
    this.state = 'suspended';
    this.destination = new Node();
  }
  var P = Ctx.prototype;
  P.createGain = function () { return new Node(['gain']); };
  P.createBiquadFilter = function () { return new Node(['frequency', 'Q', 'gain', 'detune']); };
  P.createOscillator = function () { return new Source(['frequency', 'detune']); };
  P.createBufferSource = function () { return new Source(['playbackRate', 'detune']); };
  P.createDelay = function () { return new Node(['delayTime']); };
  P.createDynamicsCompressor = function () { return new Node(['threshold', 'knee', 'ratio', 'attack', 'release']); };
  P.createBuffer = function (ch, len, sr) { if (len < 1) fail('empty buffer'); return new Buffer(ch, len, sr); };
  if (opts.panner) P.createStereoPanner = function () { return new Node(['pan']); };
  P.resume = function () { this.state = 'running'; return Promise.resolve(); };
  P.suspend = function () { this.state = 'suspended'; return Promise.resolve(); };

  function AudioContext(o) { Ctx.call(this, 48000); if (o && typeof o !== 'object') fail('bad ctor options'); AudioContext.last = this; }
  AudioContext.prototype = Object.create(P);
  function OfflineAudioContext(ch, len, sr) {
    Ctx.call(this, sr);
    num(len, 'offline length');
    if (len < 1) fail('offline length < 1');
    this.length = len;
    this.startRendering = function () { stats.offline++; return Promise.resolve(new Buffer(ch, len, sr)); };
  }
  OfflineAudioContext.prototype = Object.create(P);
  return { AudioContext: AudioContext, OfflineAudioContext: opts.offline ? OfflineAudioContext : undefined, errors: errors, stats: stats, log: log };
}

function load(win) {
  var sandbox = { window: win, console: console, setInterval: setInterval, clearInterval: clearInterval, setTimeout: setTimeout, Promise: Promise };
  vm.createContext(sandbox);
  SRC.forEach(function (s) { vm.runInContext(s.code, sandbox, { filename: s.f }); });
  return win.SL;
}
function tick() { return new Promise(function (r) { setImmediate(r); }); }

async function scenario(label, opts) {
  var fake = opts.webaudio ? makeFake(opts) : null;
  var win = { __caught: [] };
  if (fake) { win.AudioContext = fake.AudioContext; win.OfflineAudioContext = fake.OfflineAudioContext; }
  var SL = load(win), A = SL.audio, G = SL.G;
  ['init', 'suspend', 'resume', 'update', 'music', 'setBus'].forEach(function (k) { assert.strictEqual(typeof A[k], 'function', k); });
  assert.strictEqual(typeof A.bus.music, 'boolean'); assert.strictEqual(typeof A.bus.sfx, 'boolean');

  var p = SL.makeUnit(true), b = SL.makeUnit(false);
  p.foe = b; b.foe = p; G.player = p; G.bot = b;
  p.x = 11.5; p.z = 33.5; b.x = 12.5; b.z = 20; b.weapon = 'sniper';

  /* Everything before init must be a silent no-op. */
  A.update(0.016); A.music('round');
  SL.emit('shot', { u: b, weapon: SL.WEAPONS.rifle, mx: b.x, mz: b.z, tracers: [] });
  SL.emit('ui', { kind: 'tap' });

  A.init(); A.init();
  await tick(); await tick(); await tick(); await tick(); await tick();
  var ctx = fake && fake.AudioContext.last;
  if (fake) assert.strictEqual(ctx.state, 'running', label + ': context resumed by init');

  var DT = 1 / 60, t = 0, frame = 0, weapons = SL.WEAPON_ORDER, lvls = {}, maxM = 0, maxV = 0, spun = false;
  function phase(ph, winner) { G.state = ph; G.stateT = 0; SL.emit('round', { phase: ph, winner: winner === undefined ? null : winner }); }
  function run(sec, each) {
    var until = t + sec;
    while (t < until) {
      t += DT; frame++;
      if (ctx) ctx.currentTime = t;
      if (each) each();
      A.update(DT);
      var st = A._stats ? A._stats() : null;
      if (st) { lvls[st.lvl] = true; maxM = Math.max(maxM, st.mvoices); maxV = Math.max(maxV, st.voices); spun = spun || st.spin; }
    }
  }
  function started() { return fake ? fake.stats.started : 0; }

  phase('menu');
  ['tap', 'card', 'tick', 'go', 'unlock', 'back', 'mystery'].forEach(function (k) { SL.emit('ui', { kind: k, id: 'sniper' }); });
  A.music('menu');
  var s0 = started();
  run(70);                                                       // the whole menu theme and its loop point
  if (fake) assert.ok(started() - s0 > 400, label + ': menu theme plays (' + (started() - s0) + ' sources)');
  phase('lobby'); run(4);
  phase('pick'); A.music('round'); run(2);                       // shell asks for 'round' at match start: stays lobby
  if (fake) assert.strictEqual(A._stats().mode, 'lobby', label + ': pick maps to the lobby variation');
  phase('countdown'); G.roundT = 45; run(3);                     // pre-roll
  phase('live');
  run(45, function () {
    var lt = t - 79;                                             // seconds into the round
    if (lt > 12 && lt < 16) {                                    // Heavy MG spin-ups on both sides (whine)
      p.weapon = 'hmg'; b.weapon = 'hmg';
      p.spin01 = b.spin01 = Math.min(1, ((lt - 12) % 2) / 0.8);
      if (frame % 5 === 0) SL.emit('shot', { u: b, weapon: SL.WEAPONS.hmg, mx: b.x, mz: b.z, tracers: [] });
    } else if (lt >= 16 && lt < 16 + DT) { b.weapon = 'hand'; SL.emit('shot', { u: b, weapon: SL.WEAPONS.hand, mx: b.x, mz: b.z, tracers: [] }); SL.emit('reload', { u: b }); }
    G.roundT = Math.max(0, 45 - lt);
    p.x = 11.5 + Math.sin(t) * 3; p.z = 33.5 - (lt % 20) * 0.5;  // walking: footsteps
    b.x = 12.5 + Math.cos(t); b.z = p.z - 5;
    p.target = lt > 12 && lt < 26 && (frame % 200) < 150;        // spotted mid-round
    p.hp = lt > 36 ? Math.max(5, 40 - (lt - 36) * 8) : 100;      // low HP heartbeat + muffle
    if (frame % 600 === 0) G.flip = !G.flip;
    if (lt < 12 && frame % 7 === 0) {
      var w = SL.WEAPONS[weapons[(frame / 7) % 4 | 0]], trs = [];
      for (var i = 0; i < w.pellets; i++) trs.push({ x0: p.x, z0: p.z, x1: p.x + 2 + i * 0.1, z1: p.z - 3, hit: i === 0 });
      SL.emit('shot', { u: p, weapon: w, mx: p.x, mz: p.z - 0.5, tracers: trs });
      /* bot miss that passes 0.5 m from the player (whiz) and one that stops on a wall (impact) */
      SL.emit('shot', { u: b, weapon: SL.WEAPONS.rifle, mx: b.x, mz: b.z, tracers: [
        { x0: b.x, z0: b.z, x1: p.x + 0.5, z1: p.z + 4, hit: false },
        { x0: b.x, z0: b.z, x1: b.x - 2, z1: b.z, hit: false }] });
    }
    if (frame % 45 === 0) SL.emit('damage', { target: b, attacker: p, amount: 22, x: b.x, z: b.z });
    if (frame % 50 === 0) SL.emit('damage', { target: p, attacker: b, amount: 40, x: p.x, z: p.z });
    if (frame % 90 === 0) { SL.emit('reload', { u: p }); SL.emit('reload', { u: b }); p.weapon = weapons[(frame / 90) % 4 | 0]; }
    if (frame % 100 === 0) { SL.emit('dash', { u: p }); SL.emit('dash', { u: b }); SL.emit('laser', { u: b }); SL.emit('laser', { u: p }); }
    if (frame % 120 === 0) { SL.emit('ping', { u: b, x: b.x, z: b.z }); SL.emit('ping', { u: p, x: p.x, z: p.z }); }
    if (lt > 5 && lt < 5 + DT) { A.setBus('music', false); A.setBus('sfx', false); }
    if (lt > 6 && lt < 6 + DT) { A.setBus('music', true); A.setBus('sfx', true); }
    if (lt > 8 && lt < 8 + DT) A.suspend();
    if (lt > 8.2 && lt < 8.2 + DT) A.init();
  });
  if (fake) assert.ok(spun, label + ': Heavy MG spin-up whine started');
  if (fake) assert.ok(lvls[0] && lvls[1] && lvls[2], label + ': round track reached calm, spotted and last-15-s levels ' + JSON.stringify(lvls));
  SL.emit('death', { unit: b, killer: p });
  phase('roundEnd', 'p');
  if (fake) assert.ok(A._stats().sting, label + ': round stinger playing');
  run(2);
  phase('pick'); run(2); phase('countdown'); run(3); phase('live'); run(4);
  SL.emit('death', { unit: p, killer: b });
  phase('roundEnd', 'b'); run(1.8);
  phase('matchEnd', 'p'); run(9);
  phase('menu'); run(2);
  phase('roundEnd', null); run(3);
  A.setBus('music', false); phase('matchEnd', 'b'); run(1); A.setBus('music', true);   // music off: UI cue fallback
  phase('matchEnd', 'b'); run(8);
  A.music('round'); A.update(DT); A.music('menu'); A.update(DT); A.music('lobby'); A.update(DT); A.music('off'); A.update(DT); A.music('bogus');
  A.suspend(); A.resume(); A.suspend();

  if (fake) {
    var songs = A._songs();
    assert.strictEqual(JSON.stringify(songs.errors), '[]', label + ': score bar lengths');
    assert.ok(songs.menu.seconds >= 60 && songs.menu.seconds <= 90, label + ': menu theme 60 to 90 s');
    assert.ok(songs.round.bpm >= 100 && songs.round.bpm <= 110, label + ': round tempo 100 to 110');
    ['roundWin', 'roundLose'].forEach(function (k) { assert.ok(songs[k].seconds >= 2 && songs[k].seconds <= 3, k + ' 2 to 3 s'); });
    ['matchWin', 'matchLose'].forEach(function (k) { assert.ok(songs[k].seconds >= 5 && songs[k].seconds <= 8, k + ' 5 to 8 s'); });
    assert.ok(maxM <= 48, label + ': music voice cap held (' + maxM + ')');
    assert.ok(maxV <= 24, label + ': sfx voice cap held (' + maxV + ')');
  }
  assert.deepStrictEqual(win.__caught, [], label + ': errors swallowed inside audio.js');
  if (fake) {
    assert.deepStrictEqual(fake.errors, [], label + ': WebAudio misuse');
    var s = A._stats();
    assert.ok(s.voices <= 24, label + ': voice cap held (' + s.voices + ')');
    assert.ok(fake.stats.started > 500, label + ': sounds were produced (' + fake.stats.started + ')');
    if (opts.offline) assert.strictEqual(s.banks, 6, label + ': all shot banks rendered');
    else assert.strictEqual(s.banks, 0, label + ': live fallback');
    assert.strictEqual(s.pan, !!opts.panner, label + ': pan detection');
    console.log('ok - ' + label + ' (' + fake.stats.nodes + ' nodes, ' + fake.stats.started + ' sources, ' + fake.stats.offline + ' offline renders, peak music voices ' + maxM + ')');
  } else {
    assert.strictEqual(A.ready, false);
    console.log('ok - ' + label);
  }
}

/* The music must be the same song every time: two fresh loads, menu + lobby + round, identical automation logs. */
async function musicLog() {
  var fake = makeFake({ webaudio: true, panner: true, offline: false, log: true }), win = { __caught: [] };
  win.AudioContext = fake.AudioContext;
  var SL = load(win), A = SL.audio, G = SL.G, p = SL.makeUnit(true), b = SL.makeUnit(false);
  G.player = p; G.bot = b; p.foe = b; b.foe = p;
  A.init(); await tick();
  var ctx = fake.AudioContext.last, t = 0;
  fake.log.length = 0;
  function run(sec) { var u = t + sec; while (t < u) { t += 1 / 60; ctx.currentTime = t; A.update(1 / 60); } }
  G.state = 'menu'; SL.emit('round', { phase: 'menu' }); run(20);
  G.state = 'countdown'; SL.emit('round', { phase: 'countdown' }); run(3);
  G.state = 'live'; G.roundT = 14; SL.emit('round', { phase: 'live' }); run(10);
  A.music('off'); A.update(0);
  assert.deepStrictEqual(win.__caught, []);
  return fake.log;
}

(async function () {
  var l1 = await musicLog(), l2 = await musicLog();
  assert.ok(l1.length > 1000, 'music automation logged');
  assert.deepStrictEqual(l1, l2, 'music is deterministic');
  console.log('ok - music deterministic (' + l1.length + ' automation events)');
  await scenario('full WebAudio', { webaudio: true, panner: true, offline: true });
  await scenario('no StereoPanner, no OfflineAudioContext', { webaudio: true, panner: false, offline: false });
  await scenario('no WebAudio', { webaudio: false });
  console.log('audio smoke: all passed');
})().catch(function (e) { console.error(e); process.exit(1); });
