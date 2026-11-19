'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
global.window = {};
['core.js', 'world.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
});
var SL = window.SL, w = SL.world, n = 0;
function t(name, fn) { fn(); n++; console.log('ok - ' + name); }

SL.MAP_SRC.forEach(function (row, i) { assert.strictEqual(row.length, 25, 'row ' + i); });
w.init(); w.init();

t('parse', function () {
  assert.strictEqual(w.W, 25); assert.strictEqual(w.H, 36);
  assert.deepStrictEqual(w.spawnP, { x: 11.5, z: 33.5 });
  assert.deepStrictEqual(w.spawnB, { x: 12.5, z: 2.5 });
  assert.ok(w.solid(-1, 0) && w.solid(0, 0) && w.solid(4, 2) && !w.solid(5, 2));
  assert.strictEqual(w.zone[1 * 25 + 1], 1); assert.strictEqual(w.zone[1 * 25 + 18], 2);
});
t('paths', function () {
  var p = w.findPath(w.spawnP.x, w.spawnP.z, w.spawnB.x, w.spawnB.z);
  assert.ok(p && p.length > 10);
  assert.deepStrictEqual(p[p.length - 1], { x: w.spawnB.x, z: w.spawnB.z });
  SL.WAYPOINTS.forEach(function (wp) {
    var q = w.findPath(w.spawnP.x, w.spawnP.z, wp.x, wp.z);
    assert.ok(q, 'path to ' + wp.id);
  });
  assert.deepStrictEqual(w.findPath(11.5, 33.5, 11.7, 33.2), []);
  assert.ok(w.findPath(11.5, 33.5, 4.5, 4.5 - 0.0) !== undefined);
  var s = w.findPath(11.5, 33.5, 9.5, 20.5); // solid target, snaps nearby
  assert.ok(s && s.length > 0);
});
t('los', function () {
  assert.strictEqual(w.los(w.spawnP.x, w.spawnP.z, w.spawnB.x, w.spawnB.z), false);
  assert.strictEqual(w.los(1.5, 9.5, 1.5, 30.5), true);
  assert.strictEqual(w.los(3, 3, 3, 3), true);
  assert.strictEqual(w.clearPath(1.5, 9.5, 1.5, 30.5), true);
  assert.strictEqual(w.clearPath(12.5, 10.5, 12.5, 13.5, 0.36), true);
  assert.ok(Math.abs(w.rayDist(12.5, 10.5, 1, 0, 50) - 11.5 + 0 ) >= 0);
  assert.ok(Math.abs(w.rayDist(11.5, 14.5, 1, 0, 50) - 2.5) < 1e-6);
});
t('cover', function () {
  var cv = w.findCover(12.5, 20.5, 12.5, 10.5);
  assert.ok(cv, 'cover found');
  assert.ok(!w.los(cv.x, cv.z, 12.5, 10.5));
  assert.ok(Math.hypot(cv.x - 12.5, cv.z - 20.5) > 3);
});
t('collide', function () {
  var u = { x: 8.9, z: 10.5 }; // tile 8 is wall (cols 4-9 wall in row 10), edge at x=10
  u = { x: 10.1, z: 10.5 };
  assert.ok(w.solid(9, 10));
  w.collide(u, 10.5, 10.5);
  assert.ok(u.x >= 10 + SL.C.UNIT_R - 1e-6, 'pushed out: ' + u.x);
  var v = { x: 9.5, z: 10.5 }; w.collide(v, 10.6, 10.5);
  assert.strictEqual(v.x, 10.6);
  var a = SL.makeUnit(true), b = SL.makeUnit(false);
  a.x = 12.5; a.z = 23.5; b.x = 12.7; b.z = 23.5; // open floor, clear of the crates at (11,20) and (2,18)
  assert.ok(!w.solid(11, 23) && !w.solid(12, 23) && !w.solid(13, 23));
  w.separate(a, b);
  assert.ok(b.x - a.x >= 2 * SL.C.UNIT_R - 1e-6);
});
console.log(n + ' groups passed');
