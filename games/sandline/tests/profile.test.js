'use strict';
/* Profile progression simulation: 15 typical matches, then a v1 save migration.
   Run: node tests/profile.test.js */
var fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

var mem = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
  setItem: function (k, v) { mem[k] = String(v); },
  removeItem: function (k) { delete mem[k]; }
};
global.window = {};
function loadModules() {
  global.window = {};
  ['core.js', 'profile.js'].forEach(function (f) {
    vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
  });
  return window.SL;
}

/* seq: round winners in order, e.g. 'pbpp'. hp: player HP at the end of each round. taken: damage taken per round. */
function match(o) {
  var rounds = [], p = 0, b = 0;
  o.seq.split('').forEach(function (c, i) {
    var w = c === 'p' ? 'p' : c === 'b' ? 'b' : null;
    if (w === 'p') p++; else if (w === 'b') b++;
    rounds.push({ w: w, hp: (o.hp && o.hp[i] != null) ? o.hp[i] : (w === 'b' ? 0 : 55), taken: (o.taken && o.taken[i] != null) ? o.taken[i] : (w === 'b' ? 100 : 45) });
  });
  var killsBy = {}; killsBy[o.weapon || 'rifle'] = p;
  return {
    won: p > b, diff: o.diff || 'normal', mode: o.mode || 'solo', roundsP: p, roundsB: b,
    stats: { shots: o.shots || 40, hits: Math.round((o.shots || 40) * (o.acc || 0.42)), dmgDealt: p * 100, dmgTaken: b * 100, kills: p, longest: o.longest || 8 },
    killsBy: killsBy, rounds: rounds
  };
}

var SL = loadModules();
var P = SL.profile;
var matches = [
  match({ diff: 'normal', seq: 'bpbb' }),                                         // first match, a loss
  match({ diff: 'normal', seq: 'pbpp', weapon: 'rifle' }),
  match({ diff: 'easy', seq: 'ppp', weapon: 'smg', taken: [0, 30, 20] }),
  match({ diff: 'normal', seq: 'bbb' }),                                          // shutout loss
  match({ diff: 'normal', seq: 'pbbpb', hp: [15, 0, 0, 60, 0], weapon: 'shotgun' }),
  match({ diff: 'hard', seq: 'bbppp', weapon: 'sniper', longest: 14, acc: 0.6 }),  // comeback on Hard
  match({ diff: 'normal', seq: 'pppb'.slice(0, 3), weapon: 'rifle' }),
  match({ diff: 'hard', seq: 'pbbb', weapon: 'sniper', longest: 13 }),
  match({ diff: 'normal', seq: 'bpp' + 'p', weapon: 'smg' }),
  match({ diff: 'easy', seq: 'pbpbp', weapon: 'shotgun', hp: [40, 0, 18, 0, 70] }),
  match({ diff: 'normal', seq: 'bpbb', mode: 'host' }),                           // online loss
  match({ diff: 'normal', seq: 'ppbp', weapon: 'rifle' }),
  match({ diff: 'hard', seq: 'ppp', weapon: 'sniper', longest: 15, taken: [0, 0, 40] }),
  match({ diff: 'normal', seq: 'bbpb', weapon: 'smg' }),
  match({ diff: 'normal', seq: 'pbp' + 'p', weapon: 'rifle', mode: 'guest' })
];

var rows = [], unlockedFirst10 = 0, totalXp = 0;
console.log('#  diff    score  xp   lvl  medals                                   unlocks');
matches.forEach(function (r, i) {
  var res = P.award(r);
  assert.ok(res.medals.length >= 1, 'match ' + (i + 1) + ' awards at least one medal');
  assert.ok(res.xp > 0);
  if (i < 10) unlockedFirst10 += res.unlocked.length;
  totalXp += res.xp;
  var line = String(i + 1).padEnd(3) + (r.mode === 'solo' ? r.diff : 'online').padEnd(8) +
    (r.roundsP + '-' + r.roundsB).padEnd(7) + String(res.xp).padEnd(5) + String(res.levelAfter).padEnd(5) +
    res.medals.map(function (m) { return m.name; }).join(', ').padEnd(41) +
    (res.unlocked.map(function (u) { return u.name + (u.via === 'level' ? ' (L' + u.level + ')' : ' (ach)'); }).join(', ') || '-');
  console.log(line);
  rows.push(res);
});
var avg = totalXp / matches.length;
console.log('average XP per match: ' + avg.toFixed(1) + ', unlocks in first 10 matches: ' + unlockedFirst10 +
  ', locker ' + P.counts().have + '/' + P.counts().total + (P.isComplete() ? ' (complete)' : ', next: ' + JSON.stringify(P.nextReward())));
assert.ok(avg >= 100 && avg <= 180, 'average XP per match in 100..180, got ' + avg);
assert.ok(unlockedFirst10 >= 8, 'first 10 matches unlock at least 8 items, got ' + unlockedFirst10);

/* No item is granted twice. */
var seen = {};
rows.forEach(function (r) { r.unlocked.forEach(function (u) { var k = u.slot + ':' + u.id; assert.ok(!seen[k], 'dup unlock ' + k); seen[k] = 1; }); });

/* Persistence round trip keeps everything. */
var saved = JSON.parse(mem['sl.v1.profile']);
SL = loadModules(); P = SL.profile;
assert.strictEqual(P.data.xp, saved.xp);
assert.strictEqual(P.counts().have, Object.keys(saved.unlocked).length + 4);

/* Migration from a v1 save: XP and stats kept, entitled items granted silently, equip kept when valid. */
mem = {};
mem['sl.v1.profile'] = JSON.stringify({ v: 1, xp: 500, matches: 4, wins: 2, winDiff: { easy: 0, normal: 2, hard: 0 }, flawless: 0,
  online: 0, onlineWins: 0, kills: { smg: 0, rifle: 6, shotgun: 0, sniper: 0 }, equip: { headgear: 'helmet', trim: 'standard', tracer: 'gold', killfx: 'sand' } });
SL = loadModules(); P = SL.profile;
assert.strictEqual(P.data.xp, 500);
assert.strictEqual(P.data.matches, 4);
assert.strictEqual(P.levelInfo(500).level, 5);
['headgear:keffiyeh', 'headgear:goggles', 'trim:dune', 'tracer:brass', 'killfx:glass'].forEach(function (k) {
  var p = k.split(':'); assert.ok(P.isUnlocked(p[0], p[1]), 'migrated ' + k);
});
assert.strictEqual(P.data.trackLevel, 5);
assert.ok(P.counts().have >= 4 + 5 + 4 - 1, 'migration granted level rewards too');
var mig = JSON.parse(mem['sl.v1.profile']);
assert.strictEqual(mig.v, 2);
console.log('migration: level 5 save now has ' + P.counts().have + '/' + P.counts().total + ' items, next ' + JSON.stringify(P.nextReward()));
console.log('ok - profile progression');
