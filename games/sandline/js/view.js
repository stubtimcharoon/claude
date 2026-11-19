/* Sandline Duel: presentation layer (release). Renderer, camera, characters, fog of war, VFX and DOM overlays.
   Reads SL.G and unit fields; writes only SL.view.botVisible. Draw-call budget: about 25 main pass + 9 shadow pass
   at peak (world included). All fx pools are InstancedMesh with additive blending and fade by instance colour. */
'use strict';
(function (SL) {
  var V = SL.view = { botVisible: false, scene: null, camera: null, renderer: null };

  /* ---------- constants ---------- */
  var COL_YOU = 0x35c2b0, COL_FOE = 0xef5b3f;
  var LEG_YOU = 0x22625c, LEG_FOE = 0x7c2f22;
  var SKIN = 0xf0c49c, METAL = 0x2a262e, METAL2 = 0x3c3742, WOOD = 0x7a4a2a, BRASS = 0xd9a441;
  var RIG_S = 1.25, GUN_Y = 0.8, GUN_Z = 0.14, FX_Y = 1.0;
  var TRACER_LIFE = 0.09, DMG_LIFE = 0.7, GHOST_LIFE = 1.2, PING_LIFE = 1.2, DROP_TIME = 0.5;
  var N_TRACER = 40, N_PUFF = 64, N_BILL = 48, N_CHIP = 64, N_CASE = 24, N_RING = 8, N_PING = 4, N_DMG = 10, N_ARR = 3;
  var N_BILL_MAX = N_BILL + 6, N_MOTE = 150;

  /* ---------- module state ---------- */
  var renderer, scene, camera, fxLayer, inited = false;
  var vw = 1, vh = 1, camDist = 30, camMul = 1, sinE = 0, cosE = 1;
  var vt = 0;
  var chars = [];
  var GEO = {}, geoCache = {}, gunGeo = {}, gunTip = {};
  var gunMat, legMesh, teamRing, rangeRing, rangeWeapon = null, targetRing, ghostRing, ghostT = 0;
  var tracerMesh, puffMesh, billMesh, chipMesh, caseMesh, ringMesh, markMesh, laserMesh;
  var tracers, puffs, bills, chips, cases, rings, pings;
  var banner, bannerT = 0, bannerX = 0, bannerZ = 0;
  var motes, moteBase;
  var dmgPool = [], dmgIdx = 0, arrows = [];
  var hpBar, hpFill, hpShown = false, hpLast = -1;
  var camTarget = new THREE.Vector3(), camSnap = true;
  var shake = 0, shakeX = 0, shakeZ = 0, reducedQ = null;
  var prevVis = false, lastSeenX = 0, lastSeenZ = 0;
  var TRACER_COL = {}, TRIM_COL = {};

  /* temps (no per-frame allocation) */
  var tM = new THREE.Matrix4(), tP = new THREE.Vector3(), tQ = new THREE.Quaternion(), tQ2 = new THREE.Quaternion();
  var tS = new THREE.Vector3(), tE = new THREE.Euler(), tC = new THREE.Color(), tV = new THREE.Vector3();
  var UP = new THREE.Vector3(0, 1, 0), ZAX = new THREE.Vector3(0, 0, 1), ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
  var camQ = new THREE.Quaternion();

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function isMenu(st) { return st === 'menu' || st === 'lobby'; }
  function reducedMotion() { return !!(reducedQ && reducedQ.matches); }
  function teamHex(u) { return u && u.isPlayer ? COL_YOU : COL_FOE; }
  function tracerHex(u) { var id = u && u.equip && u.equip.tracer; return TRACER_COL[id] || 0xffd36b; }
  function trimHex(id) { return TRIM_COL[id] != null ? TRIM_COL[id] : 0xe8c99a; }
  function charOf(u) { return u === SL.G.player ? chars[0] : (u === SL.G.bot ? chars[1] : null); }
  function charShown(c) { return !!(c && c.root.visible); }

  /* ---------- geometry building ---------- */
  function part(list, geo, hex, x, y, z, rx, ry, rz, sx, sy, sz) {
    list.push({ g: geo, c: hex, x: x, y: y, z: z, rx: rx || 0, ry: ry || 0, rz: rz || 0, sx: sx || 1, sy: sy || 1, sz: sz || 1 });
  }
  /* Merge parts into one flat-shaded, vertex-coloured, non-indexed BufferGeometry. */
  function merge(list) {
    var pos = [], col = [], i, j, m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    var c = new THREE.Color();
    for (i = 0; i < list.length; i++) {
      var p = list[i];
      var g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
      e.set(p.rx, p.ry, p.rz);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.sx, p.sy, p.sz));
      g.applyMatrix4(m);
      var a = g.attributes.position.array;
      c.setHex(p.c);
      for (j = 0; j < a.length; j += 3) {
        pos.push(a[j], a[j + 1], a[j + 2]);
        col.push(c.r, c.g, c.b);
      }
      g.dispose();
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeVertexNormals();
    out.computeBoundingSphere();
    return out;
  }

  function scaleHex(hex, k) { tC.setHex(hex).multiplyScalar(k); return tC.getHex(); }

  function torsoGeo(team, hg, trim) {
    var key = team + '|' + hg + '|' + trim;
    if (geoCache[key]) return geoCache[key];
    var L = [], dark = scaleHex(team, 0.6), cap = scaleHex(team, 0.85), legC = team === COL_YOU ? LEG_YOU : LEG_FOE;
    part(L, GEO.hips, legC, 0, 0.42, 0);
    part(L, GEO.cyl, trim, 0, 0.5, 0, 0, 0, 0, 0.255, 0.07, 0.255);           // belt
    part(L, GEO.body, team, 0, 0.72, 0);
    part(L, GEO.box, dark, -0.27, 0.74, 0, 0, 0, 0, 0.16, 0.36, 0.32);         // pack
    part(L, GEO.box, trim, -0.27, 0.83, 0, 0, 0, 0, 0.17, 0.05, 0.34);         // pack strap
    part(L, GEO.cyl, trim, -0.27, 0.97, 0, Math.PI / 2, 0, 0, 0.06, 0.32, 0.06); // bedroll
    part(L, GEO.box, team, 0.05, 0.84, 0.2, 0, 0, -0.4, 0.14, 0.2, 0.1);      // right sleeve
    part(L, GEO.box, team, 0.1, 0.85, -0.04, 0, -0.95, -0.25, 0.4, 0.09, 0.09); // left sleeve
    part(L, GEO.sph, SKIN, 0, 1.12, 0, 0, 0, 0, 0.17, 0.17, 0.17);             // head
    if (hg === 'keffiyeh') {
      part(L, GEO.hemi, 0xeee2c4, 0, 1.11, 0, 0, 0, 0, 0.205, 0.2, 0.205);
      part(L, GEO.box, 0xe2d3ae, -0.12, 1.0, 0, 0, 0, 0.15, 0.14, 0.28, 0.36);
      part(L, GEO.cyl, trim, 0, 1.2, 0, 0, 0, 0, 0.2, 0.035, 0.2);
    } else if (hg === 'goggles') {
      part(L, GEO.hemi, cap, 0, 1.13, 0, 0, 0, 0, 0.19, 0.19, 0.19);
      part(L, GEO.cyl, trim, 0, 1.15, 0, 0, 0, 0, 0.195, 0.05, 0.195);
      part(L, GEO.box, 0xf2a03d, 0.18, 1.16, 0.065, 0, 0, 0, 0.05, 0.07, 0.08);
      part(L, GEO.box, 0xf2a03d, 0.18, 1.16, -0.065, 0, 0, 0, 0.05, 0.07, 0.08);
    } else if (hg === 'bandit') {
      part(L, GEO.hemi, dark, 0, 1.13, 0, 0, 0, 0, 0.19, 0.19, 0.19);
      part(L, GEO.cyl, 0x2b2533, 0, 1.06, 0, 0, 0, 0, 0.178, 0.1, 0.178);
      part(L, GEO.box, trim, -0.19, 1.12, 0, 0, 0, 0, 0.06, 0.08, 0.08);
      part(L, GEO.cyl, trim, 0, 1.16, 0, 0, 0, 0, 0.195, 0.04, 0.195);
    } else if (hg === 'brass') {
      part(L, GEO.hemi, 0xc9a24a, 0, 1.13, 0, 0, 0, 0, 0.205, 0.21, 0.205);
      part(L, GEO.box, 0xa8812f, -0.02, 1.33, 0, 0, 0, 0, 0.3, 0.07, 0.04);
      part(L, GEO.cyl, trim, 0, 1.14, 0, 0, 0, 0, 0.21, 0.05, 0.21);
    } else {
      part(L, GEO.hemi, cap, 0, 1.13, 0, 0, 0, 0, 0.195, 0.19, 0.195);
      part(L, GEO.cyl, trim, 0, 1.15, 0, 0, 0, 0, 0.2, 0.05, 0.2);
    }
    return (geoCache[key] = merge(L));
  }

  /* Gun models: local +x forward, grip at origin. Hands (skin) ride with the gun. */
  function buildGuns() {
    var H = Math.PI / 2, L;
    L = [];
    part(L, GEO.box, METAL, 0.12, 0, 0, 0, 0, 0, 0.34, 0.1, 0.09);
    part(L, GEO.box, METAL2, 0.36, 0.01, 0, 0, 0, 0, 0.14, 0.05, 0.05);
    part(L, GEO.box, METAL2, 0.15, -0.1, 0, 0, 0, 0.2, 0.06, 0.16, 0.05);
    part(L, GEO.box, METAL2, -0.08, -0.01, 0, 0, 0, 0, 0.1, 0.06, 0.05);
    part(L, GEO.sph, SKIN, 0.0, -0.05, 0, 0, 0, 0, 0.065, 0.065, 0.065);
    part(L, GEO.sph, SKIN, 0.24, -0.04, 0, 0, 0, 0, 0.06, 0.06, 0.06);
    gunGeo.smg = merge(L); gunTip.smg = [0.44, 0.01];
    L = [];
    part(L, GEO.box, METAL, 0.16, 0, 0, 0, 0, 0, 0.42, 0.1, 0.09);
    part(L, GEO.box, METAL2, 0.5, 0.01, 0, 0, 0, 0, 0.26, 0.04, 0.04);
    part(L, GEO.box, METAL2, 0.2, -0.1, 0, 0, 0, 0.3, 0.06, 0.15, 0.05);
    part(L, GEO.box, WOOD, -0.12, -0.01, 0, 0, 0, 0, 0.18, 0.09, 0.07);
    part(L, GEO.sph, SKIN, 0.0, -0.05, 0, 0, 0, 0, 0.065, 0.065, 0.065);
    part(L, GEO.sph, SKIN, 0.32, -0.04, 0, 0, 0, 0, 0.06, 0.06, 0.06);
    gunGeo.rifle = merge(L); gunTip.rifle = [0.64, 0.01];
    L = [];
    part(L, GEO.box, METAL, 0.1, 0, 0, 0, 0, 0, 0.3, 0.11, 0.1);
    part(L, GEO.cyl, METAL2, 0.42, 0.02, 0, 0, 0, -H, 0.045, 0.34, 0.045);
    part(L, GEO.box, WOOD, 0.36, -0.06, 0, 0, 0, 0, 0.16, 0.07, 0.1);
    part(L, GEO.box, WOOD, -0.14, -0.01, 0, 0, 0, 0, 0.2, 0.1, 0.08);
    part(L, GEO.sph, SKIN, 0.0, -0.05, 0, 0, 0, 0, 0.065, 0.065, 0.065);
    part(L, GEO.sph, SKIN, 0.36, -0.1, 0, 0, 0, 0, 0.06, 0.06, 0.06);
    gunGeo.shotgun = merge(L); gunTip.shotgun = [0.6, 0.02];
    L = [];
    part(L, GEO.box, METAL, 0.18, 0, 0, 0, 0, 0, 0.5, 0.09, 0.08);
    part(L, GEO.cyl, METAL2, 0.66, 0.01, 0, 0, 0, -H, 0.025, 0.45, 0.025);
    part(L, GEO.cyl, 0x1c1a20, 0.2, 0.09, 0, 0, 0, -H, 0.04, 0.24, 0.04);
    part(L, GEO.box, WOOD, -0.15, -0.01, 0, 0, 0, 0, 0.22, 0.1, 0.07);
    part(L, GEO.sph, SKIN, 0.0, -0.05, 0, 0, 0, 0, 0.065, 0.065, 0.065);
    part(L, GEO.sph, SKIN, 0.34, -0.04, 0, 0, 0, 0, 0.06, 0.06, 0.06);
    gunGeo.sniper = merge(L); gunTip.sniper = [0.89, 0.01];
  }

  function bannerGeo(team, trim) {
    var key = 'banner|' + team + '|' + trim;
    if (geoCache[key]) return geoCache[key];
    var L = [];
    part(L, GEO.cyl, 0x3a2b22, 0, 1.0, 0, 0, 0, 0, 0.03, 2.0, 0.03);
    part(L, GEO.box, team, 0.32, 1.58, 0, 0, 0, 0, 0.6, 0.72, 0.03);
    part(L, GEO.box, trim, 0.32, 1.32, 0, 0, 0, 0, 0.6, 0.09, 0.035);
    part(L, GEO.sph, BRASS, 0, 2.04, 0, 0, 0, 0, 0.06, 0.06, 0.06);
    return (geoCache[key] = merge(L));
  }

  /* ---------- instanced fx helpers ---------- */
  function addMat() {
    return new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  }
  function instanced(geo, mat, max, order) {
    var m = new THREE.InstancedMesh(geo, mat, max);
    tC.setRGB(0, 0, 0);
    for (var i = 0; i < max; i++) { m.setMatrixAt(i, ZERO_M); m.setColorAt(i, tC); }
    m.count = 0;
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = order || 0;
    scene.add(m);
    return m;
  }
  function makePool(n) { var a = []; for (var i = 0; i < n; i++) a.push({ t: 0 }); a.i = 0; return a; }
  function take(pool) { var it = pool[pool.i]; pool.i = (pool.i + 1) % pool.length; return it; }
  function setCol(it, hex, k) { tC.setHex(hex); it.r = tC.r * k; it.g = tC.g * k; it.b = tC.b * k; }
  function put(mesh, n, x, y, z, q, sx, sy, sz, r, g, b) {
    tP.set(x, y, z); tS.set(sx, sy, sz);
    tM.compose(tP, q, tS);
    mesh.setMatrixAt(n, tM);
    tC.setRGB(r, g, b);
    mesh.setColorAt(n, tC);
  }
  function finish(mesh, n) {
    mesh.count = n;
    mesh.visible = n > 0;
    if (n > 0) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
  }

  /* ---------- spawners ---------- */
  function spawnTracer(x0, z0, x1, z1, hex) {
    var dx = x1 - x0, dz = z1 - z0;
    if (dx * dx + dz * dz < 0.0025) return;
    var t = take(tracers);
    t.t = TRACER_LIFE; t.x0 = x0; t.z0 = z0; t.x1 = x1; t.z1 = z1;
    setCol(t, hex, 1.1);
  }
  function spawnPuff(x, y, z, vx, vy, vz, life, s0, s1, hex, k) {
    var p = take(puffs);
    p.t = life; p.life = life; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s0 = s0; p.s1 = s1;
    setCol(p, hex, k);
  }
  function spawnBill(x, y, z, vx, vy, vz, grav, life, s, hex, k) {
    var b = take(bills);
    b.t = life; b.life = life; b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = vy; b.vz = vz; b.grav = grav; b.s = s;
    b.rot = Math.random() * 6.28;
    setCol(b, hex, k);
  }
  function spawnChip(x, y, z, vx, vy, vz, life, s, hex, k) {
    var c = take(chips);
    c.t = life; c.life = life; c.x = x; c.y = y; c.z = z; c.vx = vx; c.vy = vy; c.vz = vz; c.s = s;
    c.rx = Math.random() * 6.28; c.ry = Math.random() * 6.28; c.sx = rnd(-14, 14); c.sy = rnd(-14, 14);
    setCol(c, hex, k);
  }
  function spawnRing(x, z, r0, r1, life, hex, k, delay) {
    var r = take(rings);
    r.t = life + (delay || 0); r.life = life; r.x = x; r.z = z; r.r0 = r0; r.r1 = r1;
    setCol(r, hex, k);
  }
  function dustRing(x, z, n, spd, hex, k) {
    for (var i = 0; i < n; i++) {
      var a = (i / n) * 6.283 + Math.random() * 0.4;
      spawnPuff(x + Math.cos(a) * 0.25, 0.12, z + Math.sin(a) * 0.25, Math.cos(a) * spd, rnd(0.2, 0.6), Math.sin(a) * spd,
        rnd(0.35, 0.55), 0.9, 2.6, hex, k);
    }
  }

  /* ---------- characters ---------- */
  function makeChar(slot) {
    var root = new THREE.Group(), rig = new THREE.Group();
    rig.scale.setScalar(RIG_S);
    root.add(rig);
    var mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    var torso = new THREE.Mesh(GEO.box, mat);
    torso.castShadow = true;
    rig.add(torso);
    var gun = new THREE.Mesh(GEO.box, gunMat);
    gun.position.set(0.04, GUN_Y, GUN_Z);
    gun.castShadow = true;
    rig.add(gun);
    function leg(z) {
      var hip = new THREE.Object3D();
      hip.position.set(0, 0.38, z);
      var l = new THREE.Object3D();
      l.position.set(0, -0.19, 0);
      l.scale.set(0.14, 0.38, 0.15);
      hip.add(l);
      rig.add(hip);
      return { hip: hip, leg: l };
    }
    var lL = leg(-0.1), lR = leg(0.1);
    scene.add(root);
    return {
      slot: slot, root: root, rig: rig, torso: torso, mat: mat, gun: gun,
      hipL: lL.hip, legL: lL.leg, hipR: lR.hip, legR: lR.leg,
      team: -1, hg: null, trim: null, weapon: null, emis: -1,
      walk: 0, spd: 0, deadK: 0, px: 0, pz: 0, recoil: 0, reloadK: 0, dropT: 0, land: 0, wasAlive: true, init: false, dashAcc: 0,
      mx: 0, my: FX_Y, mz: 0, unit: null
    };
  }

  function syncChar(c, u, dt, st) {
    var eq = u.equip || SL.DEFAULT_EQUIP;
    var team = teamHex(u);
    if (c.unit !== u) { c.unit = u; c.init = false; }
    if (team !== c.team || eq.headgear !== c.hg || eq.trim !== c.trim) {
      c.team = team; c.hg = eq.headgear; c.trim = eq.trim;
      c.torso.geometry = torsoGeo(team, eq.headgear, trimHex(eq.trim));
    }
    if (u.weapon !== c.weapon) {
      c.weapon = u.weapon;
      c.gun.geometry = gunGeo[u.weapon] || gunGeo.rifle;
    }

    /* speed from motion (works for locally simulated and network-interpolated units) */
    var dx = u.x - c.px, dz = u.z - c.pz, d = Math.sqrt(dx * dx + dz * dz);
    var jumped = c.init && d > 3;
    if (dt > 0 && !jumped) c.spd += (Math.min(d / dt, 8) - c.spd) * (1 - Math.exp(-dt * 10));
    if (jumped) c.spd = 0;
    c.px = u.x; c.pz = u.z;
    if (c.init && !isMenu(st) && u.alive && (jumped || !c.wasAlive)) { c.dropT = DROP_TIME; c.recoil = 0; }
    c.wasAlive = u.alive;
    c.init = true;

    c.root.position.set(u.x, 0, u.z);
    c.root.rotation.y = -u.aim;

    var k = 0;
    if (!u.alive) { k = Math.min(1, u.deadT / 0.35); k = 1 - (1 - k) * (1 - k) * (1 - k); }
    c.rig.rotation.z = 1.35 * k;
    c.deadK = k;

    var amp = u.alive ? SL.clamp(c.spd / 4.5, 0, 1) : 0;
    c.walk += dt * (3 + c.spd * 2.4);
    var sw = Math.sin(c.walk) * 0.7 * amp;
    c.hipL.rotation.z = sw;
    c.hipR.rotation.z = -sw;

    var y = Math.abs(Math.sin(c.walk)) * 0.06 * amp;
    if (c.dropT > 0) {
      c.dropT -= dt;
      var dk = 1 - Math.max(0, c.dropT) / DROP_TIME;
      y = 3.2 * (1 - dk) * (1 - dk);
      if (c.dropT <= 0) {
        c.land = 1;
        if (c.slot === 0 || V.botVisible) dustRing(u.x, u.z, 8, 1.6, 0xead6ad, 0.32);
      }
    }
    c.rig.position.y = y;
    c.land *= Math.exp(-dt * 9);
    c.rig.scale.set(RIG_S * (1 + 0.08 * c.land), RIG_S * (1 - 0.16 * c.land), RIG_S * (1 + 0.08 * c.land));

    c.torso.scale.y = 1 + Math.sin(vt * 2.4 + c.slot * 1.7) * 0.018 * (1 - amp);
    c.recoil *= Math.exp(-dt * 16);
    c.reloadK += ((u.reloading && u.alive ? 1 : 0) - c.reloadK) * (1 - Math.exp(-dt * 10));
    c.torso.rotation.z = c.recoil * 0.07;
    c.gun.position.x = 0.04 - 0.1 * c.recoil;
    c.gun.rotation.z = c.recoil * 0.22 + c.reloadK * 0.65;
    c.gun.rotation.x = c.reloadK * 0.8;

    var e = u.hitT > 0 ? 0.85 : 0;
    if (e !== c.emis) { c.mat.emissive.setRGB(e, e, e); c.emis = e; }

    c.root.updateMatrixWorld(true);
    var tip = gunTip[c.weapon] || gunTip.rifle;
    tV.set(tip[0], tip[1], 0).applyMatrix4(c.gun.matrixWorld);
    c.mx = tV.x; c.my = tV.y; c.mz = tV.z;
  }

  function writeLegs(c, u) {
    var i0 = c.slot * 2;
    if (!c.root.visible) { legMesh.setMatrixAt(i0, ZERO_M); legMesh.setMatrixAt(i0 + 1, ZERO_M); return; }
    legMesh.setMatrixAt(i0, c.legL.matrixWorld);
    legMesh.setMatrixAt(i0 + 1, c.legR.matrixWorld);
    if (u.hitT > 0) tC.setRGB(1, 1, 1); else tC.setHex(c.team === COL_YOU ? LEG_YOU : LEG_FOE);
    legMesh.setColorAt(i0, tC);
    legMesh.setColorAt(i0 + 1, tC);
  }

  function writeTeamRing(c, u) {
    var s = c.root.visible ? (1 - (c.deadK || 0)) : 0;
    if (c.dropT > 0) s *= 1 - c.dropT / DROP_TIME;
    tQ.setFromAxisAngle(UP, -u.aim);
    put(teamRing, c.slot, u.x, 0.022, u.z, tQ, s, 1, s, 0, 0, 0);
    tC.setHex(c.team);
    teamRing.setColorAt(c.slot, tC);
  }

  /* ---------- DOM ---------- */
  function injectStyle() {
    if (document.getElementById('sl-view-style')) return;
    var s = document.createElement('style');
    s.id = 'sl-view-style';
    s.textContent =
      '.sl-dmg,.sl-hp,.sl-arr{position:absolute;left:0;top:0;pointer-events:none;will-change:transform,opacity;' +
      'font-family:"Chakra Petch",system-ui,sans-serif;font-weight:700;}' +
      '.sl-dmg{display:none;font-size:19px;line-height:1;white-space:nowrap;color:#f6ead6;' +
      'text-shadow:0 2px 0 #1d1820,0 0 4px #1d1820,1px 1px 0 #1d1820,-1px -1px 0 #1d1820;}' +
      '.sl-dmg.in{color:#ef5b3f;}' +
      '.sl-dmg.out{color:#fff3c2;}' +
      '.sl-dmg.big{font-size:26px;}' +
      '.sl-hp{display:none;width:46px;height:7px;border-radius:4px;background:rgba(29,24,32,0.82);' +
      'box-shadow:0 0 0 2px rgba(29,24,32,0.55),0 2px 3px rgba(29,24,32,0.4);overflow:hidden;}' +
      '.sl-hp i{display:block;width:100%;height:100%;background:#ef5b3f;transform-origin:0 50%;transition:transform 0.12s linear;}' +
      '.sl-arr{display:none;width:26px;height:26px;margin:-13px 0 0 -13px;--c:#ef5b3f;}' +
      '.sl-arr:before,.sl-arr:after{content:"";position:absolute;inset:0;clip-path:polygon(100% 50%,0 4%,30% 50%,0 96%);}' +
      '.sl-arr:before{background:#1d1820;transform:scale(1.3);}' +
      '.sl-arr:after{background:var(--c);}';
    document.head.appendChild(s);
  }

  function buildDom() {
    fxLayer = document.getElementById('fx') || document.body;
    var i;
    for (i = 0; i < N_DMG; i++) {
      var el = document.createElement('div');
      el.className = 'sl-dmg';
      fxLayer.appendChild(el);
      dmgPool.push({ el: el, t: 0, x: 0, z: 0, jx: 0, amount: 0, target: null, kind: '', last: 0, win: 0, shown: false });
    }
    hpBar = document.createElement('div');
    hpBar.className = 'sl-hp';
    hpFill = document.createElement('i');
    hpBar.appendChild(hpFill);
    fxLayer.appendChild(hpBar);
    for (i = 0; i < N_ARR; i++) {
      var a = document.createElement('div');
      a.className = 'sl-arr';
      fxLayer.appendChild(a);
      arrows.push({ el: a, shown: false, col: '' });
    }
  }

  function spawnDamage(target, attacker, amount, kind) {
    var i, d, w = attacker && SL.WEAPONS[attacker.weapon];
    var win = (w ? w.rate : 0.1) + 0.05;
    for (i = 0; i < N_DMG; i++) {
      d = dmgPool[i];
      if (d.t > 0 && d.target === target && d.kind === kind && vt - d.last <= d.win) {
        d.amount += amount;
        d.last = vt;
        d.win = win;
        d.t = Math.max(d.t, DMG_LIFE * 0.8);
        d.el.textContent = Math.round(d.amount);
        d.el.className = 'sl-dmg ' + kind + (d.amount >= 50 ? ' big' : '');
        return;
      }
    }
    d = dmgPool[dmgIdx];
    dmgIdx = (dmgIdx + 1) % N_DMG;
    d.t = DMG_LIFE; d.target = target; d.kind = kind; d.amount = amount; d.last = vt; d.win = win;
    d.x = target.x; d.z = target.z;
    d.jx = (Math.random() - 0.5) * 0.5;
    d.el.textContent = Math.round(amount);
    d.el.className = 'sl-dmg ' + kind + (amount >= 50 ? ' big' : '');
    if (!d.shown) { d.el.style.display = 'block'; d.shown = true; }
  }

  /* Project to screen px into tV. Returns false when behind the camera. */
  function toScreen(x, y, z) {
    tV.set(x, y, z).project(camera);
    if (tV.z > 1) return false;
    tV.x = (tV.x * 0.5 + 0.5) * vw;
    tV.y = (-tV.y * 0.5 + 0.5) * vh;
    return true;
  }

  V.project = function (x, y, z) {
    if (!inited) return { x: 0, y: 0, on: false };
    var front = toScreen(x, y, z);
    return { x: tV.x, y: tV.y, on: front && tV.x >= 0 && tV.x <= vw && tV.y >= 0 && tV.y <= vh };
  };

  /* Edge arrow toward a world point when it is off screen. Returns true if shown. */
  function edgeArrow(a, x, z, colCss) {
    toScreen(x, 0.8, z);
    var mL = 24, mT = 72, mB = 110;
    var px = tV.x, py = tV.y;
    if (px >= mL && px <= vw - mL && py >= mT && py <= vh - mB) return false;
    var cx = vw / 2, cy = (mT + vh - mB) / 2;
    var dx = px - cx, dy = py - cy;
    var hx = vw / 2 - mL, hy = (vh - mB - mT) / 2;
    var s = Math.min(Math.abs(dx) > 0.01 ? hx / Math.abs(dx) : 1e9, Math.abs(dy) > 0.01 ? hy / Math.abs(dy) : 1e9);
    if (s >= 1) return false;
    if (a.col !== colCss) { a.el.style.setProperty('--c', colCss); a.col = colCss; }
    a.el.style.transform = 'translate3d(' + ((cx + dx * s) | 0) + 'px,' + ((cy + dy * s) | 0) + 'px,0) rotate(' +
      Math.atan2(dy, dx).toFixed(3) + 'rad)';
    if (!a.shown) { a.el.style.display = 'block'; a.shown = true; }
    return true;
  }
  function hideArrow(a) { if (a.shown) { a.el.style.display = 'none'; a.shown = false; } }

  /* ---------- events ---------- */
  function onShot(e) {
    if (!inited || !e || !e.tracers) return;
    var u = e.u, c = charOf(u), G = SL.G;
    var w = typeof e.weapon === 'string' ? SL.WEAPONS[e.weapon] : (e.weapon || SL.WEAPONS[u && u.weapon]);
    var maxD = (w ? w.range : 10) * 1.15;
    var shown = c && charShown(c);
    var hex = tracerHex(u);
    if (c) c.recoil = 1;
    var sx = c && c.init ? c.mx : e.mx, sz = c && c.init ? c.mz : e.mz;
    for (var i = 0; i < e.tracers.length; i++) {
      var t = e.tracers[i];
      spawnTracer(sx, sz, t.x1, t.z1, hex);
      var ddx = t.x1 - sx, ddz = t.z1 - sz, dl = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
      var bx = -ddx / dl, bz = -ddz / dl;
      if (t.hit) {
        for (var j = 0; j < 4; j++) {
          spawnBill(t.x1, 0.95, t.z1, bx * rnd(1.5, 4) + rnd(-1.5, 1.5), rnd(0.5, 2.5), bz * rnd(1.5, 4) + rnd(-1.5, 1.5),
            -9, rnd(0.12, 0.22), rnd(0.12, 0.2), 0xffe2a0, 1);
        }
      } else {
        var ux = u ? u.x : e.mx, uz = u ? u.z : e.mz;
        var fx = t.x1 - ux, fz = t.z1 - uz;
        var wall = Math.sqrt(fx * fx + fz * fz) < maxD - 0.05;
        if (wall) {
          var cx = t.x1 + bx * 0.05, cz = t.z1 + bz * 0.05;
          for (var k = 0; k < 3; k++) {
            spawnChip(cx, FX_Y, cz, bx * rnd(0.8, 2.5) + rnd(-1, 1), rnd(1, 3), bz * rnd(0.8, 2.5) + rnd(-1, 1),
              rnd(0.45, 0.7), rnd(0.8, 1.3), 0xd4844a, 0.75);
          }
          spawnPuff(cx, FX_Y, cz, bx * 0.6, 0.2, bz * 0.6, 0.2, 0.6, 2.4, 0xead6ad, 0.35);
        } else {
          spawnPuff(t.x1, 0.08, t.z1, 0, 0.3, 0, 0.18, 0.5, 2.0, 0xead6ad, 0.25);
        }
      }
    }
    if (shown && u) {
      var rx = -Math.sin(u.aim), rz = Math.cos(u.aim), fwx = Math.cos(u.aim), fwz = Math.sin(u.aim);
      var cs = take(cases);
      cs.t = 1.6; cs.life = 1.6;
      cs.x = u.x + rx * 0.2 * RIG_S + fwx * 0.15; cs.y = GUN_Y * RIG_S + 0.05; cs.z = u.z + rz * 0.2 * RIG_S + fwz * 0.15;
      var sp = rnd(1.4, 2.2);
      cs.vx = rx * sp - fwx * 0.4 + rnd(-0.3, 0.3); cs.vy = rnd(1.8, 2.8); cs.vz = rz * sp - fwz * 0.4 + rnd(-0.3, 0.3);
      cs.ry = Math.random() * 6.28; cs.rz = 0; cs.spin = rnd(10, 20);
      setCol(cs, w && w.id === 'shotgun' ? 0xd0503a : BRASS, 0.9);
    }
  }

  function onDamage(e) {
    if (!inited || !e || !e.target) return;
    var p = SL.G.player;
    if (e.target === p) {
      spawnDamage(e.target, e.attacker, e.amount, 'in');
      var rm = reducedMotion();
      var add = Math.min(0.5, e.amount * 0.011) * (rm ? 0.2 : 1);
      shake = Math.min(rm ? 0.12 : 0.6, shake + add);
      var hd = p.hitDir || 0;
      shakeX = -Math.cos(hd); shakeZ = -Math.sin(hd);
    } else if (e.attacker === p) {
      spawnDamage(e.target, e.attacker, e.amount, 'out');
    }
  }

  function onDeath(e) {
    if (!inited || !e || !e.unit) return;
    var u = e.unit, killer = e.killer, i, a;
    spawnRing(u.x, u.z, 0.3, 3.2, 0.55, teamHex(u), 1);
    var fx = (killer && killer.equip && killer.equip.killfx) || 'sand';
    if (fx === 'glass') {
      for (i = 0; i < 18; i++) {
        a = Math.random() * 6.283;
        var sp = rnd(1.5, 4.5);
        spawnChip(u.x, rnd(0.5, 1.3), u.z, Math.cos(a) * sp, rnd(2, 5), Math.sin(a) * sp, rnd(0.8, 1.2), rnd(1.2, 2.0), 0xbfeeff, 0.95);
      }
      for (i = 0; i < 8; i++) {
        a = Math.random() * 6.283;
        spawnBill(u.x, 1, u.z, Math.cos(a) * 3, rnd(1, 3), Math.sin(a) * 3, -6, rnd(0.25, 0.4), 0.22, 0xe8fbff, 1);
      }
    } else if (fx === 'banner') {
      var kt = killer ? teamHex(killer) : COL_YOU;
      var ke = (killer && killer.equip) || SL.DEFAULT_EQUIP;
      banner.geometry = bannerGeo(kt, trimHex(ke.trim));
      bannerT = 2.4; bannerX = u.x + 0.4; bannerZ = u.z;
      banner.rotation.y = SL.G.flip ? Math.PI : 0;
      dustRing(u.x, u.z, 6, 1.2, 0xead6ad, 0.3);
    } else {
      for (i = 0; i < 14; i++) {
        a = (i / 14) * 6.283 + Math.random() * 0.3;
        var s2 = rnd(1.8, 3.6);
        spawnPuff(u.x, rnd(0.2, 0.9), u.z, Math.cos(a) * s2, rnd(0.6, 2), Math.sin(a) * s2, rnd(0.5, 0.8), 1.2, 3.6, 0xead6ad, 0.45);
      }
      for (i = 0; i < 10; i++) {
        a = Math.random() * 6.283;
        spawnChip(u.x, 0.6, u.z, Math.cos(a) * rnd(1, 3), rnd(2, 4), Math.sin(a) * rnd(1, 3), rnd(0.6, 0.9), 1.3, 0xe0b878, 0.7);
      }
    }
    if (u === SL.G.player) shake = Math.min(0.6, shake + (reducedMotion() ? 0.08 : 0.35));
  }

  function onDash(e) {
    if (!inited || !e || !e.u) return;
    var c = charOf(e.u);
    if (!c || !charShown(c)) return;
    dustRing(e.u.x, e.u.z, 6, 1.1, 0xead6ad, 0.35);
    c.dashAcc = 0;
  }

  function onLaser(e) {
    if (!inited || !e || !e.u) return;
    var c = charOf(e.u);
    if (c && c.init) spawnBill(c.mx, c.my, c.mz, 0, 0, 0, 0, 0.18, 0.45, 0xff4030, 1);
  }

  function onPing(e) {
    if (!inited || !e) return;
    var hex = teamHex(e.u);
    var p = take(pings);
    p.t = PING_LIFE; p.x = e.x; p.z = e.z;
    setCol(p, hex, 1);
    p.css = hex === COL_YOU ? '#35c2b0' : '#ef5b3f';
    spawnRing(e.x, e.z, 0.3, 2.6, PING_LIFE * 0.7, hex, 0.9);
    spawnRing(e.x, e.z, 0.3, 2.6, PING_LIFE * 0.7, hex, 0.6, 0.3);
  }

  /* ---------- init ---------- */
  V.init = function (container) {
    if (inited) return;
    var dpr = window.devicePixelRatio || 1, i;
    renderer = new THREE.WebGLRenderer({ antialias: dpr < 2, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(dpr, 2));
    renderer.setClearColor(0x1d1820, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.display = 'block';
    (container || document.body).appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(SL.C.CAM_FOV, 1, 1, 200);
    var el = SL.C.CAM_ELEV_DEG * Math.PI / 180;
    sinE = Math.sin(el); cosE = Math.cos(el);
    V.scene = scene; V.camera = camera; V.renderer = renderer;

    if (SL.world && SL.world.build) SL.world.build(scene);

    var cos = SL.COSMETICS || {};
    (cos.tracer || []).forEach(function (t) { TRACER_COL[t.id] = t.color; });
    (cos.trim || []).forEach(function (t) { TRIM_COL[t.id] = t.color; });

    GEO.box = new THREE.BoxGeometry(1, 1, 1);
    GEO.cyl = new THREE.CylinderGeometry(1, 1, 1, 8);
    GEO.sph = new THREE.SphereGeometry(1, 8, 6);
    GEO.hemi = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    GEO.body = new THREE.CylinderGeometry(0.2, 0.25, 0.5, 8);
    GEO.hips = new THREE.CylinderGeometry(0.22, 0.2, 0.12, 8);

    gunMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    buildGuns();
    chars[0] = makeChar(0);
    chars[1] = makeChar(1);

    legMesh = new THREE.InstancedMesh(GEO.box, new THREE.MeshLambertMaterial({ color: 0xffffff }), 4);
    tC.setHex(LEG_YOU);
    for (i = 0; i < 4; i++) { legMesh.setMatrixAt(i, ZERO_M); legMesh.setColorAt(i, tC); }
    legMesh.castShadow = true;
    legMesh.frustumCulled = false;
    scene.add(legMesh);

    /* crisp team ring with aim chevron (one draw for both units) */
    var L = [];
    part(L, new THREE.RingGeometry(0.44, 0.52, 32), 0xffffff, 0, 0, 0);
    var ch = new THREE.Shape();
    ch.moveTo(0.6, 0.15); ch.lineTo(0.8, 0); ch.lineTo(0.6, -0.15); ch.lineTo(0.66, 0); ch.lineTo(0.6, 0.15);
    part(L, new THREE.ShapeGeometry(ch), 0xffffff, 0, 0, 0);
    var rg = merge(L);
    rg.rotateX(-Math.PI / 2);
    teamRing = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), 2);
    tC.setHex(COL_YOU);
    for (i = 0; i < 2; i++) { teamRing.setMatrixAt(i, ZERO_M); teamRing.setColorAt(i, tC); }
    teamRing.frustumCulled = false;
    teamRing.renderOrder = 1;
    scene.add(teamRing);

    function flatRing(inner, outer, segs, color, opacity) {
      var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false, side: THREE.DoubleSide });
      var m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, segs), mat);
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
      m.visible = false;
      scene.add(m);
      return m;
    }
    rangeRing = flatRing(1, 1.1, 8, COL_YOU, 0.16);
    targetRing = flatRing(0.6, 0.7, 28, COL_FOE, 0.8);
    ghostRing = flatRing(0.4, 0.52, 28, COL_FOE, 0.6);

    /* fx pools */
    tracerMesh = instanced(GEO.box, addMat(), N_TRACER, 3);
    puffMesh = instanced(new THREE.IcosahedronGeometry(0.1, 0), addMat(), N_PUFF, 3);
    var star = new THREE.BufferGeometry();
    star.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 1, 0, -0.18, 0, 0, 0.18, 0, 0, 0, -1, 0, 0.18, 0, 0, -0.18, 0, 0,
      1, 0, 0, 0, 0.18, 0, 0, -0.18, 0, -1, 0, 0, 0, -0.18, 0, 0, 0.18, 0,
      0, 0.4, 0, -0.4, 0, 0, 0, -0.4, 0, 0, 0.4, 0, 0, -0.4, 0, 0.4, 0, 0
    ], 3));
    var billMat = addMat(); billMat.side = THREE.DoubleSide;
    billMesh = instanced(star, billMat, N_BILL_MAX, 4);
    chipMesh = instanced(new THREE.TetrahedronGeometry(0.05, 0), addMat(), N_CHIP, 3);
    var caseGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.075, 6);
    caseGeo.rotateZ(Math.PI / 2);
    caseMesh = instanced(caseGeo, addMat(), N_CASE, 3);
    var ringGeo = new THREE.RingGeometry(0.86, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    var ringMat = addMat(); ringMat.side = THREE.DoubleSide; ringMat.depthTest = false;
    ringMesh = instanced(ringGeo, ringMat, N_RING, 5);
    var markMat = addMat(); markMat.depthTest = false;
    markMesh = instanced(new THREE.OctahedronGeometry(0.22, 0), markMat, N_PING, 6);
    laserMesh = instanced(GEO.box, addMat(), 2, 4);

    tracers = makePool(N_TRACER); puffs = makePool(N_PUFF); bills = makePool(N_BILL); chips = makePool(N_CHIP);
    cases = makePool(N_CASE); rings = makePool(N_RING); pings = makePool(N_PING);

    banner = new THREE.Mesh(GEO.box, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    banner.visible = false;
    scene.add(banner);

    /* ambient dust motes */
    var mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_MOTE * 3), 3));
    moteBase = new Float32Array(N_MOTE * 4);
    for (i = 0; i < N_MOTE; i++) {
      moteBase[i * 4] = Math.random() * 20; moteBase[i * 4 + 1] = 0.2 + Math.random() * 2.6;
      moteBase[i * 4 + 2] = Math.random() * 26; moteBase[i * 4 + 3] = Math.random() * 6.283;
    }
    motes = new THREE.Points(mg, new THREE.PointsMaterial({
      color: 0xfff1d6, size: 0.13, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    motes.frustumCulled = false;
    motes.renderOrder = 7;
    scene.add(motes);

    injectStyle();
    buildDom();
    if (window.matchMedia) { try { reducedQ = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (err) { reducedQ = null; } }

    SL.on('shot', onShot);
    SL.on('damage', onDamage);
    SL.on('death', onDeath);
    SL.on('dash', onDash);
    SL.on('laser', onLaser);
    SL.on('ping', onPing);

    inited = true;
    V.resize();
    window.addEventListener('resize', V.resize);
    window.addEventListener('orientationchange', V.resize);
  };

  V.resize = function () {
    if (!renderer) return;
    vw = Math.max(1, window.innerWidth);
    vh = Math.max(1, window.innerHeight);
    var aspect = vw / vh;
    renderer.setSize(vw, vh);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    var t = Math.tan(SL.C.CAM_FOV * Math.PI / 360);
    camDist = Math.max(6.3 / (t * aspect), 7.5 / t);
  };

  /* ---------- per-frame fx update ---------- */
  function updateFx(dt) {
    var i, n, it, k;
    /* tracers */
    n = 0;
    for (i = 0; i < N_TRACER; i++) {
      it = tracers[i];
      if (it.t <= 0) continue;
      it.t -= dt;
      if (it.t <= 0) continue;
      k = it.t / TRACER_LIFE;
      var dx = it.x1 - it.x0, dz = it.z1 - it.z0, len = Math.sqrt(dx * dx + dz * dz);
      tQ.setFromAxisAngle(UP, -Math.atan2(dz, dx));
      var w = 0.035 + 0.035 * k;
      put(tracerMesh, n++, (it.x0 + it.x1) * 0.5, FX_Y, (it.z0 + it.z1) * 0.5, tQ, len, w, w, it.r * k, it.g * k, it.b * k);
    }
    finish(tracerMesh, n);

    /* puffs */
    n = 0;
    tQ.identity();
    for (i = 0; i < N_PUFF; i++) {
      it = puffs[i];
      if (it.t <= 0) continue;
      it.t -= dt;
      if (it.t <= 0) continue;
      k = 1 - it.t / it.life;
      var drag = Math.exp(-dt * 5);
      it.vx *= drag; it.vz *= drag; it.vy *= drag;
      it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
      var s = it.s0 + (it.s1 - it.s0) * (1 - (1 - k) * (1 - k));
      var f = (1 - k) * (1 - k);
      put(puffMesh, n++, it.x, it.y, it.z, tQ, s, s * 0.8, s, it.r * f, it.g * f, it.b * f);
    }
    finish(puffMesh, n);

    /* chips */
    n = 0;
    for (i = 0; i < N_CHIP; i++) {
      it = chips[i];
      if (it.t <= 0) continue;
      it.t -= dt;
      if (it.t <= 0) continue;
      it.vy -= 14 * dt;
      it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
      if (it.y < 0.03) { it.y = 0.03; it.vy = -it.vy * 0.3; it.vx *= 0.5; it.vz *= 0.5; it.sx *= 0.5; it.sy *= 0.5; }
      it.rx += it.sx * dt; it.ry += it.sy * dt;
      tE.set(it.rx, it.ry, 0); tQ2.setFromEuler(tE);
      k = it.t / it.life; k = k > 0.4 ? 1 : k / 0.4;
      put(chipMesh, n++, it.x, it.y, it.z, tQ2, it.s, it.s, it.s, it.r * k, it.g * k, it.b * k);
    }
    finish(chipMesh, n);

    /* casings */
    n = 0;
    for (i = 0; i < N_CASE; i++) {
      it = cases[i];
      if (it.t <= 0) continue;
      it.t -= dt;
      if (it.t <= 0) continue;
      if (it.y > 0.025 || it.vy > 0) {
        it.vy -= 14 * dt;
        it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
        it.rz += it.spin * dt;
        if (it.y < 0.025) {
          it.y = 0.025;
          if (it.vy < -1.2) { it.vy = -it.vy * 0.35; it.vx *= 0.5; it.vz *= 0.5; it.spin *= 0.5; }
          else { it.vy = 0; it.vx = 0; it.vz = 0; it.rz = 0; }
        }
      }
      tE.set(0, it.ry, it.rz); tQ2.setFromEuler(tE);
      k = it.t > 0.4 ? 1 : it.t / 0.4;
      put(caseMesh, n++, it.x, it.y, it.z, tQ2, 1, 1, 1, it.r * k, it.g * k, it.b * k);
    }
    finish(caseMesh, n);

    /* rings (shock + ping) */
    n = 0;
    tQ.identity();
    for (i = 0; i < N_RING; i++) {
      it = rings[i];
      if (it.t <= 0) continue;
      it.t -= dt;
      if (it.t <= 0 || it.t > it.life) continue;
      k = 1 - it.t / it.life;
      var r = it.r0 + (it.r1 - it.r0) * (1 - (1 - k) * (1 - k));
      var fr = 1 - k;
      put(ringMesh, n++, it.x, 0.05, it.z, tQ, r, 1, r, it.r * fr, it.g * fr, it.b * fr);
    }
    finish(ringMesh, n);

    /* ping markers */
    n = 0;
    for (i = 0; i < N_PING; i++) {
      it = pings[i];
      if (it.t <= 0) continue;
      it.t -= dt;
      if (it.t <= 0) continue;
      k = it.t / PING_LIFE;
      var fm = k < 0.3 ? k / 0.3 : 1;
      tQ.setFromAxisAngle(UP, vt * 3);
      put(markMesh, n++, it.x, 1.9 + Math.sin(vt * 6) * 0.12, it.z, tQ, 1, 1.5, 1, it.r * fm, it.g * fm, it.b * fm);
    }
    finish(markMesh, n);

    /* banner */
    if (bannerT > 0) {
      bannerT -= dt;
      var age = 2.4 - bannerT, by;
      if (age < 0.35) { var bk = age / 0.35; by = 5 * (1 - bk * bk); }
      else if (bannerT < 0.4) by = -2.1 * (1 - bannerT / 0.4);
      else by = 0;
      banner.position.set(bannerX, by, bannerZ);
      banner.rotation.z = age > 0.35 ? Math.sin(age * 7) * 0.05 * Math.exp(-(age - 0.35) * 1.5) : 0;
      banner.visible = bannerT > 0;
    } else banner.visible = false;
  }

  /* Billboards: pooled sparks plus per-frame muzzle flashes and laser end dots. */
  function updateBills(dt, extras) {
    var n = 0, i, it, k;
    for (i = 0; i < N_BILL; i++) {
      it = bills[i];
      if (it.t <= 0) continue;
      it.t -= dt;
      if (it.t <= 0) continue;
      it.vy += it.grav * dt;
      it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
      k = it.t / it.life;
      tQ2.setFromAxisAngle(ZAX, it.rot);
      tQ.copy(camQ).multiply(tQ2);
      var s = it.s * (0.5 + 0.5 * k);
      put(billMesh, n++, it.x, it.y, it.z, tQ, s, s, s, it.r * k, it.g * k, it.b * k);
    }
    for (i = 0; i < extras.length && n < N_BILL_MAX; i += 6) {
      tQ2.setFromAxisAngle(ZAX, extras[i + 4]);
      tQ.copy(camQ).multiply(tQ2);
      var es = extras[i + 3], red = extras[i + 5] === 1;
      put(billMesh, n++, extras[i], extras[i + 1], extras[i + 2], tQ, es, es, es, 1, red ? 0.25 : 0.9, red ? 0.2 : 0.55);
    }
    finish(billMesh, n);
  }
  var extras = [];

  function updateMotes(dt, cx, cz) {
    var arr = motes.geometry.attributes.position.array;
    var t = vt * (reducedMotion() ? 0.3 : 1);
    for (var i = 0; i < N_MOTE; i++) {
      var b = i * 4, ph = moteBase[b + 3];
      var lx = ((moteBase[b] + t * 0.35 + Math.sin(t * 0.7 + ph) * 0.3) % 20 + 20) % 20;
      var lz = ((moteBase[b + 2] + t * 0.12) % 26 + 26) % 26;
      /* wrap into a 20 x 26 window around the camera target, anchored in world space */
      var ox = cx - 10, oz = cz - 13;
      var gx = ox + ((lx - ox) % 20 + 20) % 20, gz = oz + ((lz - oz) % 26 + 26) % 26;
      arr[i * 3] = gx;
      arr[i * 3 + 1] = moteBase[b + 1] + Math.sin(t * 0.9 + ph * 2) * 0.15;
      arr[i * 3 + 2] = gz;
    }
    motes.geometry.attributes.position.needsUpdate = true;
  }

  /* ---------- render ---------- */
  V.render = function (dt) {
    if (!inited) return;
    var rdt = Math.min(Math.max(dt || 0, 0), 0.1);
    var G = SL.G, st = G.state, ts = G.timeScale == null ? 1 : G.timeScale;
    var fdt = rdt * SL.clamp(ts, 0, 1);
    vt += fdt;
    var clock = G.clock || 0;
    var p = G.player, b = G.bot, i;
    var flip = !!G.flip, fs = flip ? -1 : 1;
    var menu = isMenu(st);

    /* fog of war */
    var vis = !!b;
    if (p && b && (st === 'countdown' || st === 'live') && p.alive && b.alive) {
      vis = SL.world && SL.world.los ? !!SL.world.los(p.x, p.z, b.x, b.z) : true;
    }
    V.botVisible = vis;

    /* characters */
    chars[0].root.visible = !!p;
    chars[1].root.visible = vis;
    if (p) syncChar(chars[0], p, fdt, st);
    if (b) syncChar(chars[1], b, fdt, st);
    extras.length = 0;
    for (i = 0; i < 2; i++) {
      var c = chars[i], u = i === 0 ? p : b;
      if (!u) { legMesh.setMatrixAt(i * 2, ZERO_M); legMesh.setMatrixAt(i * 2 + 1, ZERO_M); teamRing.setMatrixAt(i, ZERO_M); continue; }
      writeLegs(c, u);
      writeTeamRing(c, u);
      if (c.root.visible && u.alive && u.flashT > 0) {
        extras.push(c.mx, c.my, c.mz, rnd(0.4, 0.6), Math.random() * 6.28, 0);
        extras.push(c.mx, c.my, c.mz, rnd(0.25, 0.35), Math.random() * 6.28, 0);
      }
      /* dash dust streak */
      if (c.root.visible && u.dashT > 0) {
        c.dashAcc += fdt;
        while (c.dashAcc > 0.02) {
          c.dashAcc -= 0.02;
          spawnPuff(u.x + rnd(-0.15, 0.15), 0.12, u.z + rnd(-0.15, 0.15), rnd(-0.3, 0.3), rnd(0.2, 0.5), rnd(-0.3, 0.3), 0.4, 1.0, 2.4, 0xead6ad, 0.3);
        }
      }
      /* sniper aim laser, visible through fog */
      if (u.alive && u.laserT > 0) {
        var ax = Math.cos(u.aim), az = Math.sin(u.aim);
        var wpn = SL.WEAPONS[u.weapon] || SL.WEAPONS.sniper;
        var dist = SL.world && SL.world.rayDist ? SL.world.rayDist(u.x, u.z, ax, az, wpn.range) : wpn.range;
        var ex = u.x + ax * dist, ez = u.z + az * dist;
        var lx = ex - c.mx, lz = ez - c.mz, ll = Math.sqrt(lx * lx + lz * lz);
        var fl = 0.75 + 0.25 * Math.sin(vt * 45);
        tQ.setFromAxisAngle(UP, -Math.atan2(lz, lx));
        put(laserMesh, i, (c.mx + ex) * 0.5, c.my, (c.mz + ez) * 0.5, tQ, ll, 0.028, 0.028, fl, 0.12 * fl, 0.08 * fl);
        extras.push(ex, c.my, ez, 0.2, vt * 4, 1);
      } else laserMesh.setMatrixAt(i, ZERO_M);
    }
    legMesh.instanceMatrix.needsUpdate = true;
    legMesh.instanceColor.needsUpdate = true;
    teamRing.instanceMatrix.needsUpdate = true;
    teamRing.instanceColor.needsUpdate = true;
    var lasers = (p && p.alive && p.laserT > 0) || (b && b.alive && b.laserT > 0);
    laserMesh.count = 2;
    laserMesh.visible = !!lasers;
    if (lasers) { laserMesh.instanceMatrix.needsUpdate = true; laserMesh.instanceColor.needsUpdate = true; }

    /* last-seen ghost */
    if (st === 'live' && prevVis && !vis) { ghostT = GHOST_LIFE; ghostRing.position.set(lastSeenX, 0.035, lastSeenZ); }
    if (vis && b) { lastSeenX = b.x; lastSeenZ = b.z; ghostT = 0; }
    if (st !== 'live') ghostT = 0;
    prevVis = vis;
    if (ghostT > 0) {
      ghostT -= rdt;
      var gk = Math.max(0, ghostT / GHOST_LIFE);
      ghostRing.material.opacity = 0.65 * gk;
      ghostRing.scale.setScalar(1 + (1 - gk) * 0.35);
      ghostRing.visible = ghostT > 0;
    } else ghostRing.visible = false;

    /* range + target rings */
    if (p && p.alive && !menu) {
      if (p.weapon !== rangeWeapon) {
        var rr = (SL.WEAPONS[p.weapon] || SL.WEAPONS.rifle).range;
        rangeRing.geometry.dispose();
        rangeRing.geometry = new THREE.RingGeometry(rr - 0.05, rr + 0.05, 96);
        rangeWeapon = p.weapon;
      }
      rangeRing.position.set(p.x, 0.03, p.z);
      rangeRing.visible = true;
    } else rangeRing.visible = false;
    if (p && b && vis && p.alive && b.alive && p.target) {
      targetRing.position.set(b.x, 0.04, b.z);
      targetRing.rotation.z = vt * 1.5;
      targetRing.scale.setScalar(1 + Math.sin(vt * 9) * 0.06);
      targetRing.visible = true;
    } else targetRing.visible = false;

    /* camera */
    if (menu || !p) {
      tP.set(12.5, 0, 18 + Math.sin(clock * 0.15) * 12);
    } else {
      var lx2 = Math.cos(p.aim) * 0.6, lz2 = Math.sin(p.aim) * 0.6;
      if (p.target && p.alive && b && b.alive) {
        var tdx = b.x - p.x, tdz = b.z - p.z, td = Math.sqrt(tdx * tdx + tdz * tdz) || 1;
        var lead = Math.min(2.5, td * 0.5);
        lx2 = tdx / td * lead; lz2 = tdz / td * lead;
      }
      tP.set(p.x + lx2, 0, p.z + lz2 - 1.6 * fs);
      /* keep the camera over the map: no empty void behind the spawn rows or past the side walls */
      var mW = (SL.world && SL.world.W) || 25, mH = (SL.world && SL.world.H) || 36;
      if (fs > 0) tP.z = Math.min(tP.z, mH - 8.5); else tP.z = Math.max(tP.z, 8.5);
      tP.x = SL.clamp(tP.x, 5.3, mW - 5.3);
    }
    if (camSnap) { camTarget.copy(tP); camSnap = false; }
    else camTarget.lerp(tP, 1 - Math.exp(-rdt * 7));
    camMul += ((ts < 1 ? 0.92 : 1) - camMul) * (1 - Math.exp(-rdt * 6));

    var sx = 0, sz = 0;
    if (shake > 0.002) {
      var wob = Math.sin(clock * 91.3) + Math.sin(clock * 53.1);
      sx = (wob * 0.5 + shakeX * 0.6) * shake;
      sz = ((Math.sin(clock * 77.7) + Math.sin(clock * 41.9)) * 0.5 + shakeZ * 0.6) * shake;
      shake *= Math.exp(-rdt * 12);
    } else shake = 0;
    var cx = camTarget.x + sx, cz = camTarget.z + sz, D = camDist * camMul;
    camera.position.set(cx, D * sinE, cz + D * cosE * fs);
    camera.lookAt(cx, 0, cz);
    camera.updateMatrixWorld();
    camQ.copy(camera.quaternion);

    /* fx */
    updateFx(fdt);
    updateBills(fdt, extras);
    updateMotes(fdt, camTarget.x, camTarget.z);
    if (SL.world && typeof SL.world.update === 'function') SL.world.update(fdt, camera);

    renderer.render(scene, camera);

    /* DOM: damage numbers */
    for (i = 0; i < N_DMG; i++) {
      var d = dmgPool[i];
      if (d.t <= 0) continue;
      d.t -= rdt;
      if (d.target && d.t > DMG_LIFE * 0.75) { d.x = d.target.x; d.z = d.target.z; }
      if (d.t <= 0 || !toScreen(d.x + d.jx, 1.6 + (1 - d.t / DMG_LIFE) * 0.9, d.z)) {
        d.t = 0;
        if (d.shown) { d.el.style.display = 'none'; d.shown = false; }
        continue;
      }
      var dk = 1 - d.t / DMG_LIFE;
      d.el.style.opacity = dk < 0.5 ? 1 : 1 - (dk - 0.5) * 2;
      d.el.style.transform = 'translate3d(' + (tV.x | 0) + 'px,' + (tV.y | 0) + 'px,0) translate(-50%,-50%) scale(' +
        (dk < 0.12 ? 1.35 - dk * 2.9 : 1).toFixed(2) + ')';
    }

    /* DOM: foe HP bar */
    var showHp = !!(b && vis && b.alive && !menu) && toScreen(b.x, 1.75, b.z);
    if (showHp) {
      hpBar.style.transform = 'translate3d(' + ((tV.x - 23) | 0) + 'px,' + ((tV.y - 12) | 0) + 'px,0)';
      var hp = Math.max(0, b.hp);
      if (hp !== hpLast) { hpFill.style.transform = 'scaleX(' + (hp / SL.C.HP).toFixed(3) + ')'; hpLast = hp; }
    }
    if (showHp !== hpShown) { hpBar.style.display = showHp ? 'block' : 'none'; hpShown = showHp; }

    /* DOM: off-screen arrows (opponent, then active pings) */
    var ai = 0;
    var arrowsOn = SL.G.state === 'live' || SL.G.state === 'countdown';
    if (b && vis && b.alive && arrowsOn && edgeArrow(arrows[ai], b.x, b.z, '#ef5b3f')) ai++;
    for (i = 0; i < N_PING && ai < N_ARR; i++) {
      var pg = pings[i];
      if (pg.t > 0 && edgeArrow(arrows[ai], pg.x, pg.z, pg.css)) ai++;
    }
    for (; ai < N_ARR; ai++) hideArrow(arrows[ai]);
  };
})(window.SL);
