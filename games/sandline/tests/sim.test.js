/* Headless duel simulation (contract v2): combat unit checks, then scripted players vs the bot on every
   difficulty, then a bot-vs-bot gun matrix for weapon balance.
   Run: node tests/sim.test.js [roundsPerCell]   (default 200) */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
global.window = {};
['core.js', 'world.js', 'combat.js', 'bot.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
});
var SL = window.SL, W = SL.world, C = SL.C;
/* Tuning experiments: SIM_TUNE='{"C":{...},"WEAPONS":{"rifle":{...}},"DIFF":{"hard":{...}}}' node tests/sim.test.js */
if (process.env.SIM_TUNE) {
  var tune = JSON.parse(process.env.SIM_TUNE);
  Object.assign(SL.C, tune.C || {});
  Object.keys(tune.WEAPONS || {}).forEach(function (k) { Object.assign(SL.WEAPONS[k], tune.WEAPONS[k]); });
  Object.keys(tune.DIFF || {}).forEach(function (k) { Object.assign(SL.DIFF[k], tune.DIFF[k]); });
}
var QUICK = !!process.env.SIM_QUICK;  // skip unit checks
W.init();

var ROUNDS = +process.argv[2] || 200;
var DT = 1 / 60;
var MAX_STEPS = Math.round(C.ROUND_TIME / DT);
var GUNS = SL.WEAPON_ORDER;

function pair() {
  var a = SL.makeUnit(true), b = SL.makeUnit(false);
  a.foe = b; b.foe = a;
  SL.G.player = a; SL.G.bot = b;
  return [a, b];
}

/* ---------- combat unit checks ---------- */
if (!QUICK) (function unitChecks() {
  var ev = {};
  ['shot', 'damage', 'death', 'reload', 'dash', 'laser'].forEach(function (n) { ev[n] = 0; SL.on(n, function () { ev[n]++; }); });
  var u = pair(), a = u[0], b = u[1];
  SL.combat.resetUnit(a, W.spawnP, -Math.PI / 2, 'rifle');
  SL.combat.resetUnit(b, W.spawnB, Math.PI / 2, 'rifle');
  assert.strictEqual(a.ammo, 25); assert.strictEqual(a.hp, C.HP); assert.strictEqual(a.still, 1); assert.strictEqual(a.dashCd, 0);

  /* damage, hitDir, stats, death */
  SL.combat.applyDamage(a, 60, b);
  assert.strictEqual(a.hp, C.HP - 60); assert.ok(a.hitT > 0);
  assert.ok(Math.abs(a.hitDir - Math.atan2(b.z - a.z, b.x - a.x)) < 1e-9, 'hitDir points at attacker');
  SL.combat.applyDamage(a, 60, b);
  assert.strictEqual(a.alive, false); assert.strictEqual(ev.death, 1);
  assert.strictEqual(b.stats.dmgDealt, C.HP); assert.strictEqual(a.stats.dmgTaken, C.HP); assert.strictEqual(b.stats.kills, 1);
  assert.ok(b.stats.longest > 20);
  SL.combat.applyDamage(a, 60, b); assert.strictEqual(ev.death, 1, 'no double death');

  /* rifle point blank: fires, hits, cooldown carries remainder (rate 0.12 at 60 Hz -> ~8.3 shots/s) */
  u = pair(); a = u[0]; b = u[1];
  SL.combat.resetUnit(a, { x: 12.5, z: 33.5 }, 0, 'rifle');
  SL.combat.resetUnit(b, { x: 15.5, z: 33.5 }, Math.PI, 'rifle');
  b.hp = 1e9;
  for (var i = 0; i < 120; i++) SL.combat.updateUnit(a, DT, 0, 0, 0, null, true);
  var expect = (2 - a.reaction) / SL.WEAPONS.rifle.rate;
  assert.ok(Math.abs(a.stats.shots - expect) <= 2, 'cadence ' + a.stats.shots + ' vs ' + expect.toFixed(1));
  assert.ok(a.stats.hits >= a.stats.shots - 2);

  /* sniper: laser warning, needStill gate */
  u = pair(); a = u[0]; b = u[1];
  SL.combat.resetUnit(a, { x: 12.5, z: 33.5 }, 0, 'sniper');
  SL.combat.resetUnit(b, { x: 18.5, z: 33.5 }, Math.PI, 'rifle');
  var lasers = ev.laser;
  a.still = 0;
  SL.combat.updateUnit(a, DT, 0, 0, 0, null, true);
  assert.strictEqual(ev.laser, lasers + 1); assert.ok(a.laserT > 0);
  var firstShot = -1;
  for (i = 0; i < 90 && firstShot < 0; i++) { SL.combat.updateUnit(a, DT, 0, 0, 0, null, true); if (a.stats.shots) firstShot = (i + 2) * DT; }
  var need = Math.max(SL.WEAPONS.sniper.laser, SL.WEAPONS.sniper.needStill, a.reaction);
  assert.ok(firstShot >= need - 1e-6 && firstShot < need + 0.25, 'sniper first shot at ' + firstShot);
  /* a moving sniper never fires */
  u = pair(); a = u[0]; b = u[1];
  SL.combat.resetUnit(a, { x: 3.5, z: 33.5 }, 0, 'sniper');
  SL.combat.resetUnit(b, { x: 15.5, z: 33.5 }, Math.PI, 'rifle');
  for (i = 0; i < 90; i++) SL.combat.updateUnit(a, DT, 1, 0, 1, null, true);
  assert.strictEqual(a.stats.shots, 0, 'needStill blocks firing on the move');

  /* spin-up: Heavy MG's first gaps are rate*spinMul, then it reaches full rate; losing the target resets it */
  var hm = SL.WEAPONS.hmg;
  if (hm && hm.spin > 0) {
    u = pair(); a = u[0]; b = u[1];
    SL.combat.resetUnit(a, { x: 12.5, z: 33.5 }, 0, 'hmg');
    SL.combat.resetUnit(b, { x: 15.5, z: 33.5 }, Math.PI, 'rifle');
    b.hp = 1e9;
    var times = [];
    SL.on('shot', function (e) { if (e.u === a) times.push(tNow); });
    var tNow = 0;
    for (i = 0; i < 180; i++) { tNow = i * DT; SL.combat.updateUnit(a, DT, 0, 0, 0, null, true); }
    var g0 = times[1] - times[0], gl = times[times.length - 1] - times[times.length - 2];
    assert.ok(g0 > hm.rate * hm.spinMul * 0.8, 'first gap slow: ' + g0.toFixed(3));
    assert.ok(gl < hm.rate * 1.6 && a.spin01 === 1, 'full rate after spin: ' + gl.toFixed(3));
    b.x = 30; SL.combat.updateUnit(a, DT, 0, 0, 0, null, true);
    assert.strictEqual(a.spin01, 0, 'spin resets when the target is lost');
  }

  /* dash: distance, cooldown, no firing, event */
  u = pair(); a = u[0]; b = u[1];
  SL.combat.resetUnit(a, { x: 3.5, z: 34.5 }, 0, 'rifle');
  SL.combat.resetUnit(b, { x: 22.5, z: 2.5 }, 0, 'rifle');
  var d0 = ev.dash;
  assert.strictEqual(SL.combat.dash(a, 1, 0), true);
  assert.strictEqual(SL.combat.dash(a, 1, 0), false, 'cooldown');
  assert.strictEqual(ev.dash, d0 + 1);
  for (i = 0; i < 30; i++) SL.combat.updateUnit(a, DT, 0, 0, 0, null, true);
  assert.ok(Math.abs(a.x - 3.5 - C.DASH_DIST) < 0.45, 'dash distance ' + (a.x - 3.5).toFixed(2));
  assert.ok(a.dashCd > 0 && a.dashT === 0);
  /* dash into a wall stays out of solids, also at 20 fps */
  SL.combat.resetUnit(a, { x: 1.5, z: 33.5 }, 0, 'rifle');
  SL.combat.dash(a, -1, 0.2);
  for (i = 0; i < 10; i++) { SL.combat.updateUnit(a, 0.05, 0, 0, 0, null, true); assert.ok(!W.solid(Math.floor(a.x), Math.floor(a.z))); }

  /* external: no integration, still/moving derived from vx,vz */
  SL.combat.resetUnit(a, { x: 7.5, z: 33.5 }, 0, 'rifle');
  a.vx = 3; SL.combat.updateUnit(a, DT, 1, 0, 1, null, false, { external: true });
  assert.strictEqual(a.x, 7.5); assert.strictEqual(a.moving, true); assert.strictEqual(a.still, 0);
  a.vx = 0; SL.combat.updateUnit(a, DT, 0, 0, 0, null, false, { external: true });
  assert.strictEqual(a.moving, false); assert.ok(a.still > 0);

  /* moveOnly: moves, no combat */
  var shots = ev.shot;
  SL.combat.resetUnit(a, { x: 7.5, z: 33.5 }, 0, 'rifle');
  SL.combat.resetUnit(b, { x: 9.5, z: 33.5 }, 0, 'rifle');
  for (i = 0; i < 30; i++) SL.combat.moveOnly(a, DT, 0, -1, 1);
  assert.ok(a.z < 33.5 - 0.5); assert.strictEqual(ev.shot, shots);

  /* bot: counter-picks, fog-safe look, ping memory */
  for (i = 0; i < 50; i++) {
    assert.strictEqual(SL.bot.pickWeapon('hard', 'sniper'), 'smg');
    assert.strictEqual(SL.bot.pickWeapon('normal', 'smg'), 'rifle');
    assert.ok(['sniper', 'shotgun'].indexOf(SL.bot.pickWeapon('normal', 'rifle')) >= 0);
    assert.ok(GUNS.indexOf(SL.bot.pickWeapon('easy', null)) >= 0);
  }
  u = pair(); a = u[0]; b = u[1];
  SL.combat.resetUnit(a, W.spawnP, -Math.PI / 2, 'rifle');
  SL.combat.resetUnit(b, W.spawnB, Math.PI / 2, 'rifle');
  SL.bot.reset(b, 'hard');
  SL.bot.update(b, DT, true, true);
  SL.emit('ping', { u: a, x: a.x, z: a.z });
  assert.ok(b.ai.lastSeen && b.ai.lastSeen.x === a.x, 'ping reaches bot memory');
  console.log('ok - combat and bot unit checks');
})();

/* ---------- scripted players ---------- */
function Mover(mode) { this.mode = mode; this.path = null; this.i = 0; this.goal = 'B'; this.repath = 0; }
Mover.prototype.step = function (u, foe, dt) {
  if (!u.alive) return [0, 0, 0];
  var w = SL.WEAPONS[u.weapon];
  var seen = foe.alive && W.los(u.x, u.z, foe.x, foe.z);
  var d = Math.hypot(foe.x - u.x, foe.z - u.z);
  if (this.mode === 'dasher' && seen) {
    if (d > w.range && d < w.range + C.DASH_DIST) SL.combat.dash(u, (foe.x - u.x) / d, (foe.z - u.z) / d);
    else if (u.reloading && d < 9) SL.combat.dash(u, 0, 0);
  }
  if (this.mode !== 'runner' && u.target) return [0, 0, 0];
  this.repath -= dt;
  if (this.goal === 'B' && Math.hypot(u.x - W.spawnB.x, u.z - W.spawnB.z) < 0.6) { this.goal = 'foe'; this.path = null; }
  if (!this.path || (this.goal === 'foe' && this.repath <= 0)) {
    var g = this.goal === 'B' ? W.spawnB : foe;
    this.path = W.findPath(u.x, u.z, g.x, g.z) || []; this.i = 0; this.repath = 0.5;
  }
  while (this.i < this.path.length && Math.hypot(this.path[this.i].x - u.x, this.path[this.i].z - u.z) < 0.3) this.i++;
  if (this.i >= this.path.length) { this.path = null; return [0, 0, 0]; }
  var n = this.path[this.i], dx = n.x - u.x, dz = n.z - u.z, dd = Math.hypot(dx, dz);
  return [dx / dd, dz / dd, 1];
};

/* ---------- one round ---------- */
function runRound(pw, bw, diff, mode, botVsBot) {
  var u = pair(), p = u[0], b = u[1];
  SL.G.state = 'live'; SL.G.diff = diff;
  SL.combat.resetUnit(p, W.spawnP, -Math.PI / 2, pw);
  SL.combat.resetUnit(b, W.spawnB, Math.PI / 2, bw);
  SL.bot.reset(b, diff);
  if (botVsBot) SL.bot.reset(p, diff);
  else p.reaction = C.PLAYER_REACTION * (0.8 + Math.random() * 0.4);  // human variance
  var mv = new Mover(mode), res = { t: C.ROUND_TIME, winner: null, nan: 0, solid: 0 };
  var pingAt = C.ROUND_TIME - C.STALL_FROM;
  for (var s = 0; s < MAX_STEPS; s++) {
    var tNow = s * DT;
    if (tNow >= pingAt) {
      pingAt += C.STALL_EVERY;
      SL.emit('ping', { u: p, x: p.x, z: p.z }); SL.emit('ping', { u: b, x: b.x, z: b.z });
    }
    if (botVsBot) SL.bot.update(p, DT, true, true);
    else { var m = mv.step(p, b, DT); SL.combat.updateUnit(p, DT, m[0], m[1], m[2], null, true); }
    SL.bot.update(b, DT, true, true);
    W.separate(p, b);
    for (var k = 0; k < 2; k++) {
      var q = u[k];
      if (!isFinite(q.x) || !isFinite(q.z) || !isFinite(q.aim)) res.nan++;
      else if (W.solid(Math.floor(q.x), Math.floor(q.z))) res.solid++;
    }
    if (!p.alive || !b.alive) {
      res.t = (s + 1) * DT;
      res.winner = !b.alive && p.alive ? 'p' : !p.alive && b.alive ? 'b' : 'both';
      break;
    }
  }
  return res;
}

var t0 = Date.now(), problems = 0;
var gunPool = {};  // gun -> [wins, decided rounds], both sides, from the player-vs-bot runs
GUNS.forEach(function (g) { gunPool[g] = [0, 0]; });
var table = {};

console.log('\nBot win rate (decided rounds), ' + ROUNDS + ' rounds per cell. Blind picks both ways: the player picks');
console.log('uniformly, the bot uses its blind-pick weights. Dash is out of play, so no scripted player dashes.');
console.log('diff    player   botWin  timeouts  avgTTK  NaN  inSolid');
Object.keys(SL.DIFF).forEach(function (diff) {
  ['stopper', 'runner'].forEach(function (mode) {
    var kills = 0, timeouts = 0, tsum = 0, botWins = 0, nan = 0, solid = 0;
    for (var r = 0; r < ROUNDS; r++) {
      var pw = GUNS[Math.floor(Math.random() * GUNS.length)];
      var bw = SL.bot.pickWeapon(diff, null);
      var res = runRound(pw, bw, diff, mode, false);
      nan += res.nan; solid += res.solid;
      if (res.winner) {
        kills++; tsum += res.t;
        if (res.winner === 'b') botWins++;
        if (res.winner !== 'both') {
          gunPool[pw][1]++; gunPool[bw][1]++;
          gunPool[res.winner === 'p' ? pw : bw][0]++;
        }
      } else timeouts++;
    }
    problems += nan + solid;
    var rate = kills ? botWins / kills : 0;
    table[diff + '/' + mode] = rate;
    console.log(diff.padEnd(7) + ' ' + mode.padEnd(8) + ' ' + (Math.round(rate * 100) + '%').padStart(6) + '  ' +
      String(timeouts).padStart(8) + '  ' + (kills ? (tsum / kills).toFixed(1) + 's' : '-').padStart(6) + '  ' +
      String(nan).padStart(3) + '  ' + String(solid).padStart(7));
  });
});

function shares(pool) {
  var wr = {}, sum = 0;
  GUNS.forEach(function (g) { wr[g] = pool[g][1] ? pool[g][0] / pool[g][1] : 0; sum += wr[g]; });
  return GUNS.map(function (g) { return { g: g, wr: wr[g], share: sum ? wr[g] / sum : 0 }; });
}
function printShares(label, pool) {
  var s = shares(pool);
  console.log(label + ': ' + s.map(function (e) { return e.g + ' ' + Math.round(e.share * 100) + '% (wr ' + Math.round(e.wr * 100) + '%)'; }).join(', '));
  return Math.max.apply(null, s.map(function (e) { return e.share; }));
}

/* Bot-vs-bot gun matrix on Normal: every ordered gun pair, so picks are uniform. */
var mat = {}, mirror = {}, matrixTimeouts = 0;
GUNS.forEach(function (g) { mirror[g] = [0, 0]; mat[g] = {}; });
var perPair = Math.max(10, Math.round(ROUNDS * 4 / (GUNS.length * GUNS.length)));
GUNS.forEach(function (ga) {
  GUNS.forEach(function (gb) {
    var wa = 0, n = 0;
    for (var r = 0; r < perPair; r++) {
      var res = runRound(ga, gb, 'normal', null, true);
      problems += res.nan + res.solid;
      if (!res.winner) matrixTimeouts++;
      if (!res.winner || res.winner === 'both') continue;
      n++; if (res.winner === 'p') wa++;
      mirror[ga][1]++; mirror[gb][1]++; mirror[res.winner === 'p' ? ga : gb][0]++;
    }
    mat[ga][gb] = n ? wa / n : NaN;
  });
});
console.log('\nBot-vs-bot (Normal) row gun (bottom spawn) win rate vs column gun (top spawn); timeouts ' + matrixTimeouts + ':');
console.log('         ' + GUNS.map(function (g) { return g.padStart(8); }).join(''));
GUNS.forEach(function (ga) {
  console.log(ga.padEnd(9) + GUNS.map(function (gb) { return (Math.round(mat[ga][gb] * 100) + '%').padStart(8); }).join(''));
});
console.log('');
var maxA = printShares('Pick-weighted win share, player-vs-bot runs', gunPool);
var maxB = printShares('Pick-weighted win share, bot-vs-bot matrix ', mirror);

console.log('\nNormal: runner minus stopper bot win rate: ' + Math.round((table['normal/runner'] - table['normal/stopper']) * 100) + ' points');
console.log('max gun share: ' + Math.round(Math.max(maxA, maxB) * 100) + '%');
console.log(((Date.now() - t0) / 1000).toFixed(1) + 's wall');
assert.strictEqual(problems, 0, 'NaN or in-solid frames found');
console.log('ok - sim');
