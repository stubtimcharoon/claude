/* Sandline Duel: world module. Map parsing, collision, line of sight, pathfinding, static visuals.
   Registers SL.world. Depends on core.js; build() additionally needs global THREE (r128). */
'use strict';
(function (SL) {
  var World = SL.world = { W: 0, H: 0, grid: null, zone: null, spawnP: { x: 0, z: 0 }, spawnB: { x: 0, z: 0 } };

  World.init = function () {
    var src = SL.MAP_SRC, H = src.length, W = 0, r, c;
    for (r = 0; r < H; r++) if (src[r].length > W) W = src[r].length;
    World.W = W; World.H = H;
    var grid = new Uint8Array(W * H), zone = new Uint8Array(W * H);
    for (r = 0; r < H; r++) {
      var row = src[r];
      for (c = 0; c < W; c++) {
        var ch = c < row.length ? row.charAt(c) : '#', i = r * W + c;
        if (ch === '#') grid[i] = 1;
        else if (ch === 'c') grid[i] = 2;
        else {
          if (ch === 'a') zone[i] = 1;
          else if (ch === 'b') zone[i] = 2;
          else if (ch === 'T') World.spawnP = { x: c + 0.5, z: r + 0.5 };
          else if (ch === 'C') World.spawnB = { x: c + 0.5, z: r + 0.5 };
        }
      }
    }
    for (c = 0; c < W; c++) { grid[c] = 1; grid[(H - 1) * W + c] = 1; }
    for (r = 0; r < H; r++) { grid[r * W] = 1; grid[r * W + W - 1] = 1; }
    World.grid = grid; World.zone = zone;
  };

  function solid(c, r) {
    return c < 0 || r < 0 || c >= World.W || r >= World.H || World.grid[r * World.W + c] !== 0;
  }
  World.solid = solid;

  function collide(u, prevX, prevZ) {
    var R = SL.C.UNIT_R, it, c, r;
    for (it = 0; it < 2; it++) {
      var c0 = Math.floor(u.x) - 1, r0 = Math.floor(u.z) - 1;
      for (r = r0; r <= r0 + 2; r++) {
        for (c = c0; c <= c0 + 2; c++) {
          if (!solid(c, r)) continue;
          var px = u.x < c ? c : (u.x > c + 1 ? c + 1 : u.x);
          var pz = u.z < r ? r : (u.z > r + 1 ? r + 1 : u.z);
          var dx = u.x - px, dz = u.z - pz, d2 = dx * dx + dz * dz;
          if (d2 >= R * R || d2 < 1e-12) continue;
          var d = Math.sqrt(d2), k = (R - d) / d;
          u.x += dx * k; u.z += dz * k;
        }
      }
    }
    if (solid(Math.floor(u.x), Math.floor(u.z))) { u.x = prevX; u.z = prevZ; }
  }
  World.collide = collide;

  World.separate = function (a, b) {
    if (!a.alive || !b.alive) return;
    var dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, m = 2 * SL.C.UNIT_R;
    if (d2 >= m * m) return;
    var d = Math.sqrt(d2), nx, nz;
    if (d < 1e-6) { nx = 1; nz = 0; } else { nx = dx / d; nz = dz / d; }
    var push = (m - d) * 0.5;
    a.x -= nx * push; a.z -= nz * push;
    b.x += nx * push; b.z += nz * push;
    collide(a, a.x, a.z);
    collide(b, b.x, b.z);
  };

  function rayDist(x, z, dx, dz, max) {
    var c = Math.floor(x), r = Math.floor(z);
    if (solid(c, r)) return 0;
    var stepC = dx > 0 ? 1 : -1, stepR = dz > 0 ? 1 : -1;
    var tdC = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdR = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    var tmC = dx > 0 ? (c + 1 - x) * tdC : dx < 0 ? (x - c) * tdC : Infinity;
    var tmR = dz > 0 ? (r + 1 - z) * tdR : dz < 0 ? (z - r) * tdR : Infinity;
    for (var n = 0; n < 200; n++) {
      var t;
      if (tmC < tmR) { t = tmC; c += stepC; tmC += tdC; } else { t = tmR; r += stepR; tmR += tdR; }
      if (t >= max) return max;
      if (solid(c, r)) return t;
    }
    return max;
  }
  World.rayDist = rayDist;

  function los(ax, az, bx, bz) {
    var dx = bx - ax, dz = bz - az, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6) return true;
    return rayDist(ax, az, dx / d, dz / d, d) >= d - 1e-3;
  }
  World.los = los;

  World.clearPath = function (ax, az, bx, bz, rad) {
    if (rad === undefined) rad = 0.36;
    var dx = bx - ax, dz = bz - az, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6) return true;
    var px = -dz / d * rad, pz = dx / d * rad;
    return los(ax, az, bx, bz) && los(ax + px, az + pz, bx + px, bz + pz) && los(ax - px, az - pz, bx - px, bz - pz);
  };

  var SQ2M1 = Math.SQRT2 - 1;
  function octile(dc, dr) {
    dc = dc < 0 ? -dc : dc; dr = dr < 0 ? -dr : dr;
    return (dc > dr ? dc : dr) + SQ2M1 * (dc > dr ? dr : dc);
  }

  World.findPath = function (sx, sz, tx, tz) {
    var W = World.W, H = World.H, N = W * H;
    var sc = Math.floor(sx), sr = Math.floor(sz), tc = Math.floor(tx), tr = Math.floor(tz);
    var exact = true;
    if (solid(sc, sr)) return null;
    if (solid(tc, tr)) {
      exact = false;
      var best = -1, bd = 1e9, dc, dr;
      for (dr = -2; dr <= 2; dr++) for (dc = -2; dc <= 2; dc++) {
        if (solid(tc + dc, tr + dr)) continue;
        var dd = (tc + dc + 0.5 - tx) * (tc + dc + 0.5 - tx) + (tr + dr + 0.5 - tz) * (tr + dr + 0.5 - tz);
        if (dd < bd) { bd = dd; best = (tr + dr) * W + tc + dc; }
      }
      if (best < 0) return null;
      tc = best % W; tr = (best / W) | 0;
    }
    if (sc === tc && sr === tr) return [];
    var g = new Float32Array(N), f = new Float32Array(N), from = new Int32Array(N).fill(-1), state = new Uint8Array(N);
    var heap = new Int32Array(N * 4), hn = 0;
    function push(i) {
      var k = hn++; heap[k] = i;
      while (k > 0) { var p = (k - 1) >> 1; if (f[heap[p]] <= f[heap[k]]) break; var t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; }
    }
    function pop() {
      var top = heap[0]; heap[0] = heap[--hn]; var k = 0;
      for (;;) {
        var l = 2 * k + 1, rr = l + 1, m = k;
        if (l < hn && f[heap[l]] < f[heap[m]]) m = l;
        if (rr < hn && f[heap[rr]] < f[heap[m]]) m = rr;
        if (m === k) break;
        var t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m;
      }
      return top;
    }
    var si = sr * W + sc, ti = tr * W + tc;
    f[si] = octile(sc - tc, sr - tr); state[si] = 1; push(si);
    var found = false;
    while (hn > 0) {
      var cur = pop();
      if (state[cur] === 2) continue;
      state[cur] = 2;
      if (cur === ti) { found = true; break; }
      var cc = cur % W, cr = (cur / W) | 0;
      for (var oz = -1; oz <= 1; oz++) for (var ox = -1; ox <= 1; ox++) {
        if (!ox && !oz) continue;
        var nc = cc + ox, nr = cr + oz;
        if (solid(nc, nr)) continue;
        if (ox && oz && (solid(cc + ox, cr) || solid(cc, cr + oz))) continue;
        var ni = nr * W + nc;
        if (state[ni] === 2) continue;
        var ng = g[cur] + (ox && oz ? Math.SQRT2 : 1);
        if (state[ni] === 0 || ng < g[ni]) {
          g[ni] = ng; f[ni] = ng + octile(nc - tc, nr - tr); from[ni] = cur; state[ni] = 1; push(ni);
        }
      }
    }
    if (!found) return null;
    var out = [], i = ti;
    while (i !== si) { out.push({ x: (i % W) + 0.5, z: ((i / W) | 0) + 0.5 }); i = from[i]; }
    out.reverse();
    if (exact) out[out.length - 1] = { x: tx, z: tz };
    return out;
  };

  World.findCover = function (fx, fz, tx, tz, maxDepth) {
    if (maxDepth === undefined) maxDepth = 8;
    var W = World.W, H = World.H, sc = Math.floor(fx), sr = Math.floor(fz);
    if (solid(sc, sr)) return null;
    var seen = new Uint8Array(W * H), q = [sr * W + sc], dep = [0], h = 0;
    seen[q[0]] = 1;
    var dirs = [1, 0, -1, 0, 0, 1, 0, -1];
    while (h < q.length) {
      var cur = q[h], d = dep[h++], c = cur % W, r = (cur / W) | 0;
      if (cur !== q[0]) {
        var x = c + 0.5, z = r + 0.5;
        if ((x - fx) * (x - fx) + (z - fz) * (z - fz) > 9 && !los(x, z, tx, tz)) return { x: x, z: z };
      }
      if (d >= maxDepth) continue;
      for (var k = 0; k < 8; k += 2) {
        var nc = c + dirs[k], nr = r + dirs[k + 1];
        if (solid(nc, nr)) continue;
        var ni = nr * W + nc;
        if (seen[ni]) continue;
        seen[ni] = 1; q.push(ni); dep.push(d + 1);
      }
    }
    return null;
  };

  /* ---------- visuals ----------
     Everything below is presentation only: build(scene) adds static meshes, update(dt, camera) animates dressing.
     Draw calls (main pass): ground, floor, walls, caps, lips, rubble, crates, palm trunks, palm fronds, banners,
     awnings, sun shafts = 12. Shadow casters: walls, crates, palms. Nothing here sits on walkable floor except paint
     baked into the floor texture. */
  var P = 32;          // canvas pixels per map tile
  var anim = null;     // animated dressing, set by build()

  function rngMaker(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* Smooth 2D value noise in [0, 1], period 64. */
  function makeNoise(seed) {
    var rnd = rngMaker(seed), tab = new Float32Array(4096), i;
    for (i = 0; i < 4096; i++) tab[i] = rnd();
    function at(x, y) { return tab[((y & 63) << 6) | (x & 63)]; }
    return function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      var a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
  }

  function inb(c, r) { return c >= 0 && r >= 0 && c < World.W && r < World.H; }
  function wallAt(c, r) { return inb(c, r) && World.grid[r * World.W + c] === 1; }
  function floorAt(c, r) { return inb(c, r) && World.grid[r * World.W + c] === 0; }
  function openAt(c, r) { return inb(c, r) && World.grid[r * World.W + c] !== 1; }
  function makeCanvas(w, h) { var cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
  function shuffle(a, rnd) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function spaced(list, c, r, d) {
    for (var i = 0; i < list.length; i++) if (Math.max(Math.abs(list[i].c - c), Math.abs(list[i].r - r)) < d) return false;
    return true;
  }

  /* ---------- layout plan: wall blocks, heights, crumbled corners, dressing spots ---------- */
  function planWorld() {
    var W = World.W, H = World.H, N = W * H, rnd = rngMaker(4242), noise = makeNoise(77), i, c, r, k;
    var comp = new Int16Array(N).fill(-1), blocks = [];
    for (i = 0; i < N; i++) {
      if (World.grid[i] !== 1 || comp[i] >= 0) continue;
      var id = blocks.length, q = [i], border = false, h;
      comp[i] = id;
      for (h = 0; h < q.length; h++) {
        var cc = q[h] % W, cr = (q[h] / W) | 0;
        if (cc === 0 || cr === 0 || cc === W - 1 || cr === H - 1) border = true;
        var nb = [cc - 1, cr, cc + 1, cr, cc, cr - 1, cc, cr + 1];
        for (k = 0; k < 8; k += 2) {
          if (!wallAt(nb[k], nb[k + 1])) continue;
          var ni = nb[k + 1] * W + nb[k];
          if (comp[ni] < 0) { comp[ni] = id; q.push(ni); }
        }
      }
      blocks.push({ border: border, h: border ? 2.3 : 1.6 + Math.floor(rnd() * 5) * 0.1, hue: (rnd() - 0.5) * 0.02, lit: (rnd() - 0.5) * 0.05 });
    }

    var hgt = new Float32Array(N), deep = new Uint8Array(N), crumb = new Uint8Array(N), reserved = new Uint8Array(N);
    for (i = 0; i < N; i++) {
      if (World.grid[i] !== 1) continue;
      c = i % W; r = (i / W) | 0;
      var b = blocks[comp[i]], d = 1;
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) if (!wallAt(c + dc, r + dr)) d = 0;
      deep[i] = d && !b.border ? 1 : 0;
      var hh = b.h;
      if (deep[i] && noise(c * 0.3 + 5, r * 0.3) > 0.62) hh += 0.3;            // raised roof tiers inside big blocks
      else if (b.border && noise(c * 0.45, r * 0.45 + 9) > 0.66) hh += 0.25;   // skyline steps on the outer wall
      hgt[i] = hh;
    }

    /* Banners: two per spawn on south faces (default camera) and two on north faces (flipped camera). */
    function pickFace(sx, sz, dz, side) {
      var best = null, bd = 1e9;
      for (var rr = 0; rr < H; rr++) for (var c2 = 0; c2 < W; c2++) {
        if (!wallAt(c2, rr) || !floorAt(c2, rr + dz)) continue;
        var dx = c2 + 0.5 - sx; if (dx * side < 1.5) continue;
        var fz = dz > 0 ? rr + 1 : rr, dd = dx * dx + (fz - sz) * (fz - sz);
        if (dd < bd) { bd = dd; best = { c: c2, r: rr, dz: dz }; }
      }
      return best;
    }
    var banners = [];
    [[World.spawnP, 0], [World.spawnB, 1]].forEach(function (sp) {
      [1, -1].forEach(function (dz) {
        [-1, 1].forEach(function (side) {
          var f = pickFace(sp[0].x, sp[0].z, dz, side);
          if (f) { f.team = sp[1]; banners.push(f); reserved[f.r * W + f.c] = 1; }
        });
      });
    });

    /* Crumbled convex corners: lowered cell plus rubble chunks on top. */
    var cand = [];
    for (i = 0; i < N; i++) {
      if (World.grid[i] !== 1 || reserved[i]) continue;
      c = i % W; r = (i / W) | 0;
      if ((openAt(c - 1, r) || openAt(c + 1, r)) && (openAt(c, r - 1) || openAt(c, r + 1))) cand.push({ c: c, r: r });
    }
    var crumbled = [];
    shuffle(cand, rnd).forEach(function (p) {
      if (crumbled.length >= 7 || !spaced(crumbled, p.c, p.r, 4)) return;
      var j = p.r * W + p.c;
      crumb[j] = 1; hgt[j] = Math.max(1.15, hgt[j] - 0.45); crumbled.push(p);
    });

    /* Palms: deep roof cells with roof two tiles north and south, so fronds never hang over a lane. */
    var palms = [], pc = [];
    for (i = 0; i < N; i++) {
      if (!deep[i]) continue;
      c = i % W; r = (i / W) | 0;
      var ok = true;
      for (k = -1; k <= 1; k++) if (!wallAt(c + k, r - 2) || !wallAt(c + k, r + 2)) ok = false;
      if (ok) pc.push({ c: c, r: r });
    }
    shuffle(pc, rnd).forEach(function (p) {
      if (palms.length < 7 && spaced(palms, p.c, p.r, 4)) palms.push(p);
    });

    /* Awnings: two-tile spans on south faces of lane walls, away from banners and broken corners. */
    var aw = [], awnings = [];
    for (i = 0; i < N; i++) {
      c = i % W; r = (i / W) | 0;
      if (!wallAt(c, r) || !wallAt(c + 1, r) || !floorAt(c, r + 1) || !floorAt(c + 1, r + 1)) continue;
      var j2 = i + 1;
      if (reserved[i] || reserved[j2] || crumb[i] || crumb[j2]) continue;
      aw.push({ c: c, r: r });
    }
    shuffle(aw, rnd).forEach(function (p) {
      if (awnings.length >= 6 || !spaced(awnings, p.c, p.r, 5) || !spaced(banners, p.c, p.r, 3)) return;
      awnings.push({ c: p.c, r: p.r, h: Math.min(hgt[p.r * W + p.c], hgt[p.r * W + p.c + 1]), pal: awnings.length % 3 });
    });

    return { comp: comp, blocks: blocks, hgt: hgt, deep: deep, crumb: crumb, banners: banners, crumbled: crumbled, palms: palms, awnings: awnings, noise: noise };
  }

  /* Upscale a quarter-tile colour field so large-scale variation is smooth (no per-tile checkerboard). */
  function smoothField(g, fn) {
    var W = World.W, H = World.H, S = 4, sm = makeCanvas(W * S, H * S), sg = sm.getContext('2d');
    var img = sg.createImageData(W * S, H * S), col = new THREE.Color(), x, y, k;
    for (y = 0; y < H * S; y++) for (x = 0; x < W * S; x++) {
      fn(col, (x + 0.5) / S, (y + 0.5) / S);
      k = (y * W * S + x) * 4;
      img.data[k] = col.r * 255; img.data[k + 1] = col.g * 255; img.data[k + 2] = col.b * 255; img.data[k + 3] = 255;
    }
    sg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(sm, 0, 0, W * P, H * P);
  }

  function edgeShade(g, c, r, d, A, rgba0) {
    var x0 = c * P, y0 = r * P, gr;
    if (d === 0) gr = g.createLinearGradient(0, y0, 0, y0 + A);
    else if (d === 1) gr = g.createLinearGradient(0, y0 + P, 0, y0 + P - A);
    else if (d === 2) gr = g.createLinearGradient(x0, 0, x0 + A, 0);
    else gr = g.createLinearGradient(x0 + P, 0, x0 + P - A, 0);
    gr.addColorStop(0, rgba0); gr.addColorStop(1, 'rgba(30,18,10,0)');
    g.fillStyle = gr;
    if (d === 0) g.fillRect(x0, y0, P, A); else if (d === 1) g.fillRect(x0, y0 + P - A, P, A);
    else if (d === 2) g.fillRect(x0, y0, A, P); else g.fillRect(x0 + P - A, y0, A, P);
  }
  var DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // N, S, W, E (matches edgeShade d)

  function bricks(g, x, y, w, h, rnd) {
    g.fillStyle = 'hsl(14,30%,33%)'; g.fillRect(x, y, w, h);
    for (var yy = 0; yy < h; yy += 5) {
      var off = ((yy / 5) & 1) ? 4 : 0;
      for (var xx = -off; xx < w; xx += 9) {
        g.fillStyle = 'hsl(' + (12 + rnd() * 8) + ',32%,' + (36 + rnd() * 8) + '%)';
        g.fillRect(x + xx + 1, y + yy + 1, 7, 3);
      }
    }
  }

  /* ---------- roof caps: one world-mapped plaster texture ---------- */
  function paintCaps(plan) {
    var W = World.W, H = World.H, N = W * H, rnd = rngMaker(9001), noise = plan.noise, i, c, r, k, d;
    var cv = makeCanvas(W * P, H * P), g = cv.getContext('2d');
    var def = { hue: 0, lit: 0, border: false };
    smoothField(g, function (col, x, y) {
      var ci = Math.floor(y) * W + Math.floor(x), b = (ci >= 0 && ci < N && plan.comp[ci] >= 0) ? plan.blocks[plan.comp[ci]] : def;
      var n = noise(x * 0.35 + 20, y * 0.35) * 0.65 + noise(x * 1.3, y * 1.3 + 30) * 0.35;
      col.setHSL(0.052 + b.hue, 0.25, 0.43 + b.lit + (n - 0.5) * 0.09 - (b.border ? 0.03 : 0));
    });
    for (i = 0; i < N; i++) {
      if (World.grid[i] !== 1) continue;
      c = i % W; r = (i / W) | 0;
      var x = c * P, y = r * P;
      if (plan.crumb[i]) { // exposed mud brick where the corner broke away
        bricks(g, x, y, P, P, rnd);
        g.fillStyle = 'rgba(40,22,16,0.25)'; g.fillRect(x, y, P, P);
      }
      for (k = 0; k < 16; k++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,236,214,0.16)' : 'rgba(50,28,20,0.16)';
        g.fillRect(x + rnd() * P, y + rnd() * P, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
      }
      for (d = 0; d < 4; d++) {
        var nc = c + DIRS[d][0], nr = r + DIRS[d][1];
        if (wallAt(nc, nr) && plan.hgt[nr * W + nc] > plan.hgt[i] + 0.1) edgeShade(g, c, r, d, 12, 'rgba(30,16,10,0.42)');
        else if (inb(nc, nr) && !wallAt(nc, nr) && !plan.crumb[i]) edgeShade(g, c, r, d, 6, 'rgba(30,16,10,0.22)');
      }
    }
    // flaked plaster showing brick, on a few deep cells
    var deepCells = [];
    for (i = 0; i < N; i++) if (plan.deep[i]) deepCells.push(i);
    shuffle(deepCells, rnd);
    deepCells.slice(0, Math.ceil(deepCells.length / 9)).forEach(function (ci) {
      var cx = (ci % W + 0.2 + rnd() * 0.6) * P, cy = (((ci / W) | 0) + 0.2 + rnd() * 0.6) * P, rx = 6 + rnd() * 9, ry = 4 + rnd() * 6;
      g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, rnd() * 3, 0, Math.PI * 2); g.clip();
      bricks(g, cx - rx, cy - ry, rx * 2, ry * 2, rnd); g.restore();
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,230,205,0.2)'; g.lineWidth = 1; g.stroke();
    });
    // hatches and drying rugs painted flat on the roofs (paint only, never reads as cover)
    deepCells.slice(-5).forEach(function (ci, n) {
      var x0 = (ci % W) * P, y0 = ((ci / W) | 0) * P;
      if (n < 3) {
        g.fillStyle = 'rgba(30,18,14,0.55)'; g.fillRect(x0 + 8, y0 + 8, 16, 16);
        g.fillStyle = 'hsl(24,35%,30%)'; g.fillRect(x0 + 10, y0 + 10, 12, 12);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0 + 10, y0 + 15, 12, 1); g.fillRect(x0 + 10, y0 + 19, 12, 1);
      } else {
        var cols = n === 3 ? ['#5d4a7a', '#e2c38a'] : ['#8a3b3b', '#d9c7a4'];
        g.fillStyle = 'rgba(30,18,14,0.3)'; g.fillRect(x0 + 5, y0 + 7, 24, 18);
        for (k = 0; k < 6; k++) { g.fillStyle = cols[k & 1]; g.fillRect(x0 + 4 + k * 4, y0 + 6, 4, 18); }
      }
    });
    // hairline cracks: short random walks that stop at the roof edge
    var wallCells = [];
    for (i = 0; i < N; i++) if (World.grid[i] === 1 && !plan.crumb[i]) wallCells.push(i);
    var nCracks = Math.ceil(wallCells.length / 5);
    g.lineCap = 'round';
    for (k = 0; k < nCracks; k++) {
      var s = wallCells[Math.floor(rnd() * wallCells.length)];
      var px = (s % W + 0.15 + rnd() * 0.7) * P, py = (((s / W) | 0) + 0.15 + rnd() * 0.7) * P, ang = rnd() * Math.PI * 2;
      var pts = [[px, py]], steps = 5 + Math.floor(rnd() * 10);
      for (var st = 0; st < steps; st++) {
        ang += (rnd() - 0.5) * 1.3;
        var nx = px + Math.cos(ang) * (3 + rnd() * 5), ny = py + Math.sin(ang) * (3 + rnd() * 5);
        if (!wallAt(Math.floor(nx / P), Math.floor(ny / P))) break;
        px = nx; py = ny; pts.push([px, py]);
      }
      if (pts.length < 2) continue;
      [[1, 1, 'rgba(255,236,214,0.16)'], [0, 0, 'rgba(42,22,16,0.5)']].forEach(function (pass) {
        g.beginPath(); g.moveTo(pts[0][0] + pass[0], pts[0][1] + pass[1]);
        for (var q = 1; q < pts.length; q++) g.lineTo(pts[q][0] + pass[0], pts[q][1] + pass[1]);
        g.strokeStyle = pass[2]; g.lineWidth = 1.1; g.stroke();
      });
    }
    var t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4;
    return t;
  }

  /* ---------- floor: sand, site mosaics, spawn rugs, contact shade ---------- */
  function drawRug(g, cx, cz, w, h, base, accent, cream) {
    var x = Math.round((cx - w / 2) * P), y = Math.round((cz - h / 2) * P), pw = Math.round(w * P), ph = Math.round(h * P), i, j;
    g.fillStyle = 'rgba(40,22,12,0.3)'; g.fillRect(x + 2, y + 3, pw, ph);
    g.strokeStyle = cream; g.lineWidth = 1;
    g.beginPath();
    for (j = y + 3; j < y + ph - 2; j += 3) { g.moveTo(x - 5, j); g.lineTo(x, j); g.moveTo(x + pw, j); g.lineTo(x + pw + 5, j); }
    g.stroke();
    g.fillStyle = base; g.fillRect(x, y, pw, ph);
    g.strokeStyle = accent; g.lineWidth = 5; g.strokeRect(x + 5.5, y + 5.5, pw - 11, ph - 11);
    g.strokeStyle = cream; g.lineWidth = 1.5; g.strokeRect(x + 2.5, y + 2.5, pw - 5, ph - 5); g.strokeRect(x + 10.5, y + 10.5, pw - 21, ph - 21);
    // teeth along the accent band
    g.fillStyle = cream;
    for (i = x + 10; i < x + pw - 10; i += 8) { g.beginPath(); g.moveTo(i, y + 8); g.lineTo(i + 4, y + 4); g.lineTo(i + 8, y + 8); g.fill(); g.beginPath(); g.moveTo(i, y + ph - 8); g.lineTo(i + 4, y + ph - 4); g.lineTo(i + 8, y + ph - 8); g.fill(); }
    // diamond lattice field
    g.save(); g.beginPath(); g.rect(x + 12, y + 12, pw - 24, ph - 24); g.clip();
    var ds = 14, n = 0;
    for (j = y + 12; j < y + ph; j += ds) for (i = x + 12; i < x + pw; i += ds) {
      g.beginPath(); g.moveTo(i + ds / 2, j + 1); g.lineTo(i + ds - 1, j + ds / 2); g.lineTo(i + ds / 2, j + ds - 1); g.lineTo(i + 1, j + ds / 2); g.closePath();
      g.strokeStyle = (n++ & 1) ? accent : cream; g.lineWidth = 1.2; g.stroke();
      g.fillStyle = cream; g.fillRect(i + ds / 2 - 1, j + ds / 2 - 1, 2, 2);
    }
    g.restore();
    // central medallion
    var mx = x + pw / 2, my = y + ph / 2, mr = Math.min(pw, ph) * 0.28;
    g.beginPath(); g.moveTo(mx, my - mr); g.lineTo(mx + mr * 1.5, my); g.lineTo(mx, my + mr); g.lineTo(mx - mr * 1.5, my); g.closePath();
    g.fillStyle = base; g.fill(); g.strokeStyle = cream; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.moveTo(mx, my - mr * 0.55); g.lineTo(mx + mr * 0.8, my); g.lineTo(mx, my + mr * 0.55); g.lineTo(mx - mr * 0.8, my); g.closePath();
    g.fillStyle = accent; g.fill();
    // weave grain
    g.fillStyle = 'rgba(0,0,0,0.07)';
    for (j = y; j < y + ph; j += 2) g.fillRect(x, j, pw, 1);
  }

  function drawSite(g, zoneId, pal, rnd) {
    var W = World.W, H = World.H, i, c, r, c0 = W, c1 = -1, r0 = H, r1 = -1;
    for (i = 0; i < W * H; i++) if (World.zone[i] === zoneId) { c = i % W; r = (i / W) | 0; c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r); }
    if (c1 < 0) return;
    for (r = r0; r <= r1; r++) for (c = c0; c <= c1; c++) {
      if (!openAt(c, r)) continue;
      var x = c * P, y = r * P, s;
      if (World.zone[r * W + c] === zoneId) { // frame tiles
        g.fillStyle = pal.frame; g.fillRect(x, y, P, P);
        g.beginPath(); g.moveTo(x + P / 2, y + 5); g.lineTo(x + P - 5, y + P / 2); g.lineTo(x + P / 2, y + P - 5); g.lineTo(x + 5, y + P / 2); g.closePath();
        g.fillStyle = pal.cream; g.fill();
        g.fillStyle = pal.accent; g.fillRect(x + P / 2 - 3, y + P / 2 - 3, 6, 6);
      } else { // field: 2 x 2 glazed tiles per cell
        for (s = 0; s < 4; s++) {
          var sx = x + (s & 1) * 16, sy = y + (s >> 1) * 16, pick = ((c * 2 + (s & 1)) + (r * 2 + (s >> 1))) & 1;
          g.fillStyle = pal.field[pick]; g.fillRect(sx, sy, 16, 16);
          g.fillStyle = rnd() < 0.5 ? 'rgba(255,248,232,0.10)' : 'rgba(60,40,30,0.07)'; g.fillRect(sx, sy, 16, 16);
        }
      }
      g.strokeStyle = 'rgba(70,45,35,0.32)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + P); g.moveTo(x, y + 0.5); g.lineTo(x + P, y + 0.5);
      g.moveTo(x + 16.5, y); g.lineTo(x + 16.5, y + P); g.moveTo(x, y + 16.5); g.lineTo(x + P, y + 16.5); g.stroke();
    }
    // medallion at the site centre
    var mx = (c0 + c1 + 1) / 2 * P, my = (r0 + r1 + 1) / 2 * P, R = 1.15 * P, k;
    g.beginPath(); g.arc(mx, my, R, 0, Math.PI * 2); g.fillStyle = pal.accent; g.fill();
    g.strokeStyle = pal.cream; g.lineWidth = 2; g.beginPath(); g.arc(mx, my, R - 4, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    for (k = 0; k < 16; k++) { var a = k * Math.PI / 8, rr = (k & 1) ? R * 0.45 : R * 0.82; g.lineTo(mx + Math.cos(a) * rr, my + Math.sin(a) * rr); }
    g.closePath(); g.fillStyle = pal.cream; g.fill();
    g.beginPath(); g.arc(mx, my, R * 0.26, 0, Math.PI * 2); g.fillStyle = pal.frame; g.fill();
  }

  function paintFloor(plan) {
    var W = World.W, H = World.H, rnd = rngMaker(1337), noise = makeNoise(31), r, c, i, k, d;
    var cv = makeCanvas(W * P, H * P), g = cv.getContext('2d');
    smoothField(g, function (col, x, y) {
      var n = noise(x * 0.3, y * 0.3) * 0.7 + noise(x * 1.1 + 40, y * 1.1) * 0.3;
      col.setHSL(0.097 + (n - 0.5) * 0.02, 0.47, 0.69 + (n - 0.5) * 0.07);
    });
    // wind ripples
    g.lineWidth = 1;
    for (k = 0; k < 90; k++) {
      var y0 = rnd() * H * P, x0 = rnd() * W * P, len = 40 + rnd() * 110, amp = 1.5 + rnd() * 2, ph = rnd() * 6;
      [[0, 'rgba(255,246,222,0.22)'], [1.2, 'rgba(140,96,52,0.13)']].forEach(function (pass) {
        g.beginPath();
        for (var t = 0; t <= len; t += 4) g.lineTo(x0 + t, y0 + pass[0] + Math.sin(t * 0.06 + ph) * amp);
        g.strokeStyle = pass[1]; g.stroke();
      });
    }
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) {
      if (!floorAt(c, r)) continue;
      for (k = 0; k < 14; k++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,240,200,0.30)' : 'rgba(120,80,40,0.20)';
        g.fillRect(c * P + rnd() * P, r * P + rnd() * P, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
      }
    }
    drawSite(g, 1, { field: ['#dcab84', '#d19c76'], frame: '#b9785a', accent: '#8f4a36', cream: '#f0dfc2' }, rnd);
    drawSite(g, 2, { field: ['#c3cbc6', '#b4bfbc'], frame: '#7c949a', accent: '#3f5f6e', cream: '#eee6d3' }, rnd);
    paintRugs(g, false);
    // rubble pebbles at the foot of crumbled corners
    plan.crumbled.forEach(function (p) {
      for (d = 0; d < 4; d++) {
        var nc = p.c + DIRS[d][0], nr = p.r + DIRS[d][1];
        if (!floorAt(nc, nr)) continue;
        for (k = 0; k < 7; k++) {
          var ex = d === 2 ? P - rnd() * 10 : d === 3 ? rnd() * 10 : rnd() * P;
          var ey = d === 0 ? P - rnd() * 10 : d === 1 ? rnd() * 10 : rnd() * P;
          var s = 1.5 + rnd() * 2.5;
          g.fillStyle = 'rgba(40,22,14,0.3)'; g.fillRect(nc * P + ex + 1, nr * P + ey + 1, s, s);
          g.fillStyle = 'hsl(16,' + (28 + rnd() * 10) + '%,' + (38 + rnd() * 10) + '%)'; g.fillRect(nc * P + ex, nr * P + ey, s, s);
        }
      }
    });
    // contact shade along walls and crates
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) {
      if (solid(c, r)) continue;
      for (d = 0; d < 4; d++) if (solid(c + DIRS[d][0], r + DIRS[d][1])) edgeShade(g, c, r, d, 11, 'rgba(30,18,10,0.45)');
    }
    var t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4;
    floorPaint = { g: g, tex: t, flip: false };
    return t;
  }
  /* Spawn rugs carry team colours: the local player's spawn is teal, the opponent's red. Repainted in place when the
     local player switches sides (online guest spawns at the top). Sizes stay fixed so a repaint covers the old rug. */
  var floorPaint = null;
  var RUG_TEAL = ['#36324d', '#35c2b0', '#efe0c4'], RUG_RED = ['#58282b', '#ef5b3f', '#efe0c4'];
  function paintRugs(g, flip) {
    var bottom = flip ? RUG_RED : RUG_TEAL, top = flip ? RUG_TEAL : RUG_RED;
    drawRug(g, World.spawnP.x, World.spawnP.z, 4.4, 2.2, bottom[0], bottom[1], bottom[2]);
    drawRug(g, World.spawnB.x, World.spawnB.z + 0.1, 3.6, 2.2, top[0], top[1], top[2]);
  }

  /* ---------- small textures ---------- */
  function wallSideTexture() {
    var cv = makeCanvas(64, 128), g = cv.getContext('2d'), rnd = rngMaker(55), k;
    var gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#fbf1e6'); gr.addColorStop(0.08, '#efe2d4'); gr.addColorStop(0.72, '#e6d6c6'); gr.addColorStop(0.86, '#cdb39c'); gr.addColorStop(1, '#a98b72');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
    g.fillStyle = 'rgba(80,50,40,0.07)';
    for (k = 14; k < 110; k += 16) g.fillRect(0, k, 64, 1);
    for (k = 0; k < 160; k++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(70,40,30,0.12)'; g.fillRect(rnd() * 64, rnd() * 128, 1 + rnd(), 1 + rnd()); }
    g.strokeStyle = 'rgba(60,34,26,0.25)'; g.lineWidth = 1; g.beginPath();
    var x = 20 + rnd() * 24, y = 10; g.moveTo(x, y);
    while (y < 70) { y += 4 + rnd() * 5; x += (rnd() - 0.5) * 4; g.lineTo(x, y); }
    g.stroke();
    return new THREE.CanvasTexture(cv);
  }

  function crateTexture() {
    var cv = makeCanvas(64, 64), g = cv.getContext('2d'), rnd = rngMaker(66), k;
    g.fillStyle = '#c08a55'; g.fillRect(0, 0, 64, 64);
    for (k = 0; k < 4; k++) {
      g.fillStyle = 'hsl(28,' + (42 + rnd() * 8) + '%,' + (50 + rnd() * 8) + '%)'; g.fillRect(0, k * 16 + 1, 64, 14);
      g.fillStyle = 'rgba(80,46,22,0.25)';
      for (var j = 0; j < 5; j++) g.fillRect(rnd() * 64, k * 16 + 2 + rnd() * 12, 6 + rnd() * 14, 1);
    }
    g.save(); g.beginPath(); g.rect(7, 7, 50, 50); g.clip();
    g.strokeStyle = '#7d5130'; g.lineWidth = 7; g.beginPath(); g.moveTo(4, 60); g.lineTo(60, 4); g.stroke(); g.restore();
    g.strokeStyle = '#7d5130'; g.lineWidth = 7; g.strokeRect(3.5, 3.5, 57, 57);
    g.strokeStyle = 'rgba(255,220,170,0.25)'; g.lineWidth = 1; g.strokeRect(1.5, 1.5, 61, 61);
    g.fillStyle = '#3b2a20';
    [[4, 4], [60, 4], [4, 60], [60, 60], [32, 4], [32, 60], [4, 32], [60, 32]].forEach(function (p) { g.fillRect(p[0] - 1, p[1] - 1, 2, 2); });
    return new THREE.CanvasTexture(cv);
  }

  function bannerTexture() {
    var cv = makeCanvas(128, 256), g = cv.getContext('2d');
    [['#35c2b0', '#1f7f73'], ['#ef5b3f', '#a3361f']].forEach(function (cols, team) {
      var x = team * 64;
      g.save(); g.translate(x, 0);
      g.beginPath(); g.moveTo(5, 10); g.lineTo(59, 10); g.lineTo(59, 250); g.lineTo(32, 212); g.lineTo(5, 250); g.closePath();
      g.fillStyle = cols[0]; g.fill();
      g.save(); g.clip();
      g.fillStyle = cols[1]; g.fillRect(5, 10, 54, 6);
      g.strokeStyle = '#f6ead6'; g.lineWidth = 2; g.beginPath(); g.moveTo(11, 26); g.lineTo(53, 26); g.moveTo(11, 31); g.lineTo(53, 31); g.stroke();
      g.beginPath(); g.moveTo(32, 62); g.lineTo(50, 92); g.lineTo(32, 122); g.lineTo(14, 92); g.closePath(); g.fillStyle = '#f6ead6'; g.fill();
      g.beginPath(); g.moveTo(32, 76); g.lineTo(41, 92); g.lineTo(32, 108); g.lineTo(23, 92); g.closePath(); g.fillStyle = cols[1]; g.fill();
      g.strokeStyle = '#f6ead6'; g.lineWidth = 4;
      for (var k = 0; k < 3; k++) { var y = 146 + k * 18; g.beginPath(); g.moveTo(14, y); g.lineTo(32, y + 12); g.lineTo(50, y); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,0.12)'; for (var s = 10; s < 250; s += 3) g.fillRect(5, s, 54, 1);
      g.restore();
      g.fillStyle = '#3a2a22'; g.fillRect(1, 3, 62, 8);
      g.fillStyle = '#c9a25e'; g.fillRect(0, 2, 4, 10); g.fillRect(60, 2, 4, 10);
      g.restore();
    });
    var t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4;
    return t;
  }

  var AWN_PAL = [['#efe2c8', '#3d4a78'], ['#efe2c8', '#d9962f'], ['#efe2c8', '#7e3446']];
  function awningTexture() {
    var cv = makeCanvas(128, 128), g = cv.getContext('2d'), p, k;
    AWN_PAL.forEach(function (pal, i) {
      var y = i * 32;
      g.save(); g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.lineTo(128, y + 24);
      for (k = 128; k > 0; k -= 16) g.quadraticCurveTo(k - 8, y + 36, k - 16, y + 24);
      g.closePath(); g.clip();
      for (k = 0; k < 8; k++) { g.fillStyle = pal[k & 1]; g.fillRect(k * 16, y, 16, 32); }
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y + 21, 128, 2);
      g.restore();
    });
    var t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return t;
  }

  function shaftTexture() {
    var cv = makeCanvas(64, 128), g = cv.getContext('2d');
    var gh = g.createLinearGradient(0, 0, 64, 0);
    gh.addColorStop(0, 'rgba(255,255,255,0)'); gh.addColorStop(0.5, 'rgba(255,255,255,1)'); gh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gh; g.fillRect(0, 0, 64, 128);
    g.globalCompositeOperation = 'destination-in';
    var gv = g.createLinearGradient(0, 128, 0, 0);
    gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(0.12, 'rgba(0,0,0,0.9)'); gv.addColorStop(0.45, 'rgba(0,0,0,0.6)'); gv.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gv; g.fillRect(0, 0, 64, 128);
    return new THREE.CanvasTexture(cv);
  }

  /* ---------- geometry builders ---------- */
  function capGeometry(plan) {
    var W = World.W, H = World.H, cells = [], i, j;
    for (i = 0; i < W * H; i++) if (World.grid[i] === 1) cells.push(i);
    var pos = new Float32Array(cells.length * 18), nor = new Float32Array(cells.length * 18), uv = new Float32Array(cells.length * 12);
    var Q = [0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0];
    cells.forEach(function (ci, k) {
      var c = ci % W, r = (ci / W) | 0, y = plan.hgt[ci] + 0.004;
      for (j = 0; j < 6; j++) {
        var px = c + Q[j * 2], pz = r + Q[j * 2 + 1], o = k * 18 + j * 3;
        pos[o] = px; pos[o + 1] = y; pos[o + 2] = pz; nor[o + 1] = 1;
        uv[k * 12 + j * 2] = px / W; uv[k * 12 + j * 2 + 1] = 1 - pz / H;
      }
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }

  /* Merge transformed non-indexed parts into one vertex-coloured geometry. */
  function mergeParts(parts) {
    var total = 0, o = 0;
    parts.forEach(function (p) { total += p.geo.attributes.position.count; });
    var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    parts.forEach(function (p) {
      var n = p.geo.attributes.position.count;
      pos.set(p.geo.attributes.position.array, o * 3);
      nor.set(p.geo.attributes.normal.array, o * 3);
      if (p.colors) col.set(p.colors, o * 3);
      else for (var j = 0; j < n; j++) { col[(o + j) * 3] = p.color.r; col[(o + j) * 3 + 1] = p.color.g; col[(o + j) * 3 + 2] = p.color.b; }
      o += n;
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }

  var PALM_H = 1.55, PALM_LEAN = 0.22;
  function palmTrunkGeo() {
    var parts = [], n = 6, m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (var i = 0; i < n; i++) {
      var t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2, r0 = 0.11 - t0 * 0.045, r1 = 0.11 - t1 * 0.045;
      var g = new THREE.CylinderGeometry(r1 * 0.9, r0, PALM_H / n * 1.1, 7, 1, true);
      if (g.index) g = g.toNonIndexed();
      e.set(0, 0, -Math.atan(2 * PALM_LEAN * tm / PALM_H)); q.setFromEuler(e);
      v.set(PALM_LEAN * tm * tm, tm * PALM_H, 0);
      g.applyMatrix4(m.compose(v, q, one));
      parts.push({ geo: g, color: new THREE.Color(i & 1 ? 0x8a6a4a : 0x6f5238) });
    }
    return mergeParts(parts);
  }

  function palmFrondGeo() {
    var pos = [], col = [], rnd = rngMaker(9), S = 6;
    var cBase = new THREE.Color(0x4a6a33), cTip = new THREE.Color(0x9bb05a), cEdge = new THREE.Color(0x67883f), a = new THREE.Color(), b = new THREE.Color();
    function blade(ang, len, droop, lift, wid) {
      var ca = Math.cos(ang), sa = Math.sin(ang), prev = null;
      for (var i = 0; i <= S; i++) {
        var t = i / S, d = t * len, y = lift * Math.sin(t * 2.4) - droop * t * t;
        var w = (0.03 + wid * Math.sin(Math.min(1, t * 1.15) * Math.PI)) * (1 - t * 0.35);
        var sp = [d * ca, y + 0.03, d * sa], L = [d * ca - sa * w, y - 0.02 - w * 0.3, d * sa + ca * w], R = [d * ca + sa * w, y - 0.02 - w * 0.3, d * sa - ca * w];
        a.copy(cBase).lerp(cTip, t); b.copy(cEdge).lerp(cTip, t * 0.8);
        var cur = { s: sp, l: L, r: R, cs: [a.r, a.g, a.b], ce: [b.r, b.g, b.b] };
        if (prev) {
          [[prev.l, prev.ce], [prev.s, prev.cs], [cur.s, cur.cs], [prev.l, prev.ce], [cur.s, cur.cs], [cur.l, cur.ce],
           [prev.s, prev.cs], [prev.r, prev.ce], [cur.r, cur.ce], [prev.s, prev.cs], [cur.r, cur.ce], [cur.s, cur.cs]].forEach(function (vv) {
            pos.push(vv[0][0], vv[0][1], vv[0][2]); col.push(vv[1][0], vv[1][1], vv[1][2]);
          });
        }
        prev = cur;
      }
    }
    for (var k = 0; k < 9; k++) blade(k * Math.PI * 2 / 9 + (rnd() - 0.5) * 0.3, 0.9 + rnd() * 0.25, 0.5 + rnd() * 0.25, 0.16, 0.16);
    for (k = 0; k < 3; k++) blade(k * Math.PI * 2 / 3 + 0.5, 0.42, 0.04, 0.3, 0.09);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    geo.computeVertexNormals();
    var nut = new THREE.IcosahedronGeometry(0.06, 0), parts = [{ geo: geo, colors: geo.attributes.color.array }];
    for (k = 0; k < 3; k++) {
      var gg = nut.clone(); gg.translate(Math.cos(k * 2.1) * 0.07, -0.07, Math.sin(k * 2.1) * 0.07);
      parts.push({ geo: gg, color: new THREE.Color(0x4b3424) });
    }
    return mergeParts(parts);
  }

  var BAN_W = 0.62, BAN_L = 1.3, BAN_ROWS = 8;
  function bannerGeometry(plan, list) {
    var pos = [], nor = [], uv = [], idx = [], meta = [], W = World.W;
    list.forEach(function (b) {
      var h = plan.hgt[b.r * W + b.c], top = h - 0.04, z = b.dz > 0 ? b.r + 1 + 0.035 : b.r - 0.035, cx = b.c + 0.5;
      var base = pos.length / 3, u0 = b.team * 0.5, phase = b.c * 1.7 + b.r * 0.9;
      for (var i = 0; i <= BAN_ROWS; i++) {
        var t = i / BAN_ROWS;
        for (var s = 0; s < 2; s++) {
          var side = s === 0 ? -1 : 1, x = cx + side * BAN_W / 2 * b.dz; // mirrored on north faces so it reads correctly
          pos.push(x, top - t * BAN_L, z); nor.push(0, 0, b.dz);
          uv.push(u0 + s * 0.5, 1 - t);
          meta.push(t, b.dz, phase);
        }
        if (i > 0) { var a0 = base + (i - 1) * 2; idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
      }
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    geo.setIndex(idx);
    return { geo: geo, base: new Float32Array(pos), meta: new Float32Array(meta) };
  }

  function awningGeometry(list) {
    var pos = [], uv = [];
    function quad(p, t) { // p: 4 corners (a,b,c,d) in order around the quad; t: their uvs
      [0, 1, 2, 0, 2, 3].forEach(function (k) { pos.push(p[k][0], p[k][1], p[k][2]); uv.push(t[k][0], t[k][1]); });
    }
    list.forEach(function (a) {
      var x0 = a.c + 0.06, x1 = a.c + 1.94, f = a.r + 1, yb = a.h - 0.1, yf = yb - 0.26, zf = f + 0.34, yv = yf - 0.13;
      var vt = 1 - (a.pal * 32) / 128, vm = 1 - (a.pal * 32 + 22) / 128, vb = 1 - (a.pal * 32 + 32) / 128;
      quad([[x0, yb, f], [x0, yf, zf], [x1, yf, zf], [x1, yb, f]], [[0, vt], [0, vm], [1, vm], [1, vt]]);
      quad([[x0, yf, zf], [x0, yv, zf], [x1, yv, zf], [x1, yf, zf]], [[0, vm], [0, vb], [1, vb], [1, vm]]);
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    geo.computeVertexNormals();
    return geo;
  }

  function shaftGeometry(spots, sunDir) {
    var pos = [], uv = [], up = new THREE.Vector3(0, 1, 0), ax = sunDir.clone().normalize();
    var p1 = new THREE.Vector3().crossVectors(ax, up).normalize(), p2 = new THREE.Vector3().crossVectors(ax, p1).normalize();
    spots.forEach(function (s) {
      var base = new THREE.Vector3(s.x, 0, s.z), top = base.clone().addScaledVector(ax, s.len);
      [p1, p2].forEach(function (pp) {
        var a = base.clone().addScaledVector(pp, -s.w / 2), b = base.clone().addScaledVector(pp, s.w / 2);
        var c = top.clone().addScaledVector(pp, s.w), d = top.clone().addScaledVector(pp, -s.w);
        [[a, 0, 0], [b, 1, 0], [c, 1, 1], [a, 0, 0], [c, 1, 1], [d, 0, 1]].forEach(function (v) { pos.push(v[0].x, v[0].y, v[0].z); uv.push(v[1], v[2]); });
      });
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    return geo;
  }

  /* ---------- build ---------- */
  World.build = function (scene) {
    var W = World.W, H = World.H, i, c, r, k, d;
    var plan = planWorld(), rnd = rngMaker(4243), noise = plan.noise;
    scene.background = new THREE.Color(0x1d1820);
    var dummy = new THREE.Object3D(), col = new THREE.Color(), box = new THREE.BoxGeometry(1, 1, 1);

    var ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 80, H + 80), new THREE.MeshLambertMaterial({ color: 0x2a2227 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, -0.05, H / 2); ground.receiveShadow = true;
    scene.add(ground);

    /* Canvas row r maps to world z in [r, r+1]: the rotated plane's +v edge sits at z = 0 and flipY puts canvas y = 0 there. */
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: paintFloor(plan) }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2); floor.receiveShadow = true;
    scene.add(floor);

    function inst(geo, mat, n, cast, receive) {
      var m = new THREE.InstancedMesh(geo, mat, Math.max(n, 1));
      m.count = n; m.castShadow = !!cast; m.receiveShadow = receive !== false; scene.add(m); return m;
    }

    /* Walls: one textured box per cell, coloured per block with low-frequency noise. */
    var walls = [];
    for (i = 0; i < W * H; i++) if (World.grid[i] === 1) walls.push(i);
    var wm = inst(box, new THREE.MeshLambertMaterial({ map: wallSideTexture() }), walls.length, true);
    walls.forEach(function (ci, n) {
      c = ci % W; r = (ci / W) | 0;
      var b = plan.blocks[plan.comp[ci]], h = plan.hgt[ci], nz = noise(c * 0.3 + 11, r * 0.3);
      dummy.rotation.set(0, 0, 0); dummy.position.set(c + 0.5, h / 2, r + 0.5); dummy.scale.set(1, h, 1); dummy.updateMatrix();
      wm.setMatrixAt(n, dummy.matrix);
      col.setHSL(0.048 + b.hue, 0.34, 0.47 + b.lit + (nz - 0.5) * 0.06); wm.setColorAt(n, col);
    });

    /* Roof caps: a single world-mapped plaster texture over every wall top. */
    var caps = new THREE.Mesh(capGeometry(plan), new THREE.MeshLambertMaterial({ map: paintCaps(plan) }));
    caps.receiveShadow = true;
    scene.add(caps);

    /* Parapet lips on roof edges that face floor or crates (tier steps stay bare so roofs read calm). */
    var lips = [];
    walls.forEach(function (ci) {
      if (plan.crumb[ci]) return;
      c = ci % W; r = (ci / W) | 0;
      for (d = 0; d < 4; d++) {
        var nc = c + DIRS[d][0], nr = r + DIRS[d][1];
        if (!inb(nc, nr)) continue;
        if (!wallAt(nc, nr)) lips.push({ c: c, r: r, d: d, ci: ci });
      }
    });
    var lm = inst(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), lips.length, false);
    lips.forEach(function (l, n) {
      var h = plan.hgt[l.ci], T = 0.1, LH = 0.13, b = plan.blocks[plan.comp[l.ci]];
      var x = l.c + 0.5 + DIRS[l.d][0] * (0.5 - T / 2), z = l.r + 0.5 + DIRS[l.d][1] * (0.5 - T / 2);
      dummy.rotation.set(0, 0, 0); dummy.position.set(x, h + LH / 2, z);
      if (l.d < 2) dummy.scale.set(1, LH, T); else dummy.scale.set(T, LH, 1);
      dummy.updateMatrix(); lm.setMatrixAt(n, dummy.matrix);
      col.setHSL(0.058 + b.hue, 0.27, 0.56 + b.lit); lm.setColorAt(n, col);
    });

    /* Rubble chunks resting on crumbled corners (inside the wall footprint only). */
    var chunks = [];
    plan.crumbled.forEach(function (p) { for (k = 0; k < 3; k++) chunks.push(p); });
    var km = inst(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), chunks.length, false);
    chunks.forEach(function (p, n) {
      var ci = p.r * W + p.c, s = 0.16 + rnd() * 0.16, b = plan.blocks[plan.comp[ci]];
      dummy.position.set(p.c + 0.22 + rnd() * 0.56, plan.hgt[ci] + s * 0.35, p.r + 0.22 + rnd() * 0.56);
      dummy.rotation.set((rnd() - 0.5) * 0.9, rnd() * 3, (rnd() - 0.5) * 0.9);
      dummy.scale.set(s * (1 + rnd() * 0.6), s * 0.7, s); dummy.updateMatrix(); km.setMatrixAt(n, dummy.matrix);
      col.setHSL(0.045 + b.hue, 0.3, 0.42 + rnd() * 0.08); km.setColorAt(n, col);
    });

    /* Crates: one plank-textured instanced box. */
    var crates = [];
    for (i = 0; i < W * H; i++) if (World.grid[i] === 2) crates.push(i);
    var cm = inst(box, new THREE.MeshLambertMaterial({ map: crateTexture() }), crates.length, true);
    crates.forEach(function (ci, n) {
      dummy.position.set(ci % W + 0.5, 0.45, ((ci / W) | 0) + 0.5); dummy.rotation.set(0, (rnd() - 0.5) * 0.12, 0);
      dummy.scale.set(0.9, 0.9, 0.9); dummy.updateMatrix(); cm.setMatrixAt(n, dummy.matrix);
      col.setHSL(0.08, 0.25, 0.86 + rnd() * 0.12); cm.setColorAt(n, col);
    });
    dummy.rotation.set(0, 0, 0);

    /* Palms on deep roof cells. */
    anim = { t: 0, palms: [], amp: 1 };
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) anim.amp = 0.3; } catch (e) { /* ignore */ }
    if (plan.palms.length) {
      var trunkMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      var frondMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      var tm = inst(palmTrunkGeo(), trunkMat, plan.palms.length, true, false);
      var fm = inst(palmFrondGeo(), frondMat, plan.palms.length, true, false);
      var topV = new THREE.Vector3();
      plan.palms.forEach(function (p, n) {
        var ci = p.r * W + p.c, s = 0.85 + rnd() * 0.3, ry = rnd() * Math.PI * 2;
        dummy.position.set(p.c + 0.5 + (rnd() - 0.5) * 0.3, plan.hgt[ci], p.r + 0.5 + (rnd() - 0.5) * 0.3);
        dummy.rotation.set(0, ry, 0); dummy.scale.setScalar(s); dummy.updateMatrix(); tm.setMatrixAt(n, dummy.matrix);
        col.setHSL(0.08, 0.2, 0.9 + rnd() * 0.1); tm.setColorAt(n, col);
        topV.set(PALM_LEAN, PALM_H, 0).applyMatrix4(dummy.matrix);
        var pd = { x: topV.x, y: topV.y, z: topV.z, ry: ry + rnd(), s: s, ph: rnd() * 6 };
        anim.palms.push(pd);
        dummy.position.set(pd.x, pd.y, pd.z); dummy.updateMatrix(); fm.setMatrixAt(n, dummy.matrix);
        col.setHSL(0.25, 0.15, 0.85 + rnd() * 0.15); fm.setColorAt(n, col);
      });
      anim.fronds = fm;
    }

    /* Team banners hanging on wall faces at each spawn. */
    if (plan.banners.length) {
      var bg = bannerGeometry(plan, plan.banners);
      var btex = bannerTexture(); btex.wrapS = THREE.RepeatWrapping; anim.bannerTex = btex; anim.bannerFlip = false;
      var bmesh = new THREE.Mesh(bg.geo, new THREE.MeshLambertMaterial({ map: btex, side: THREE.DoubleSide, alphaTest: 0.5 }));
      bmesh.receiveShadow = true;
      scene.add(bmesh);
      anim.banner = bg;
    }

    /* Striped awnings on a few lane-facing south walls, high above head height. */
    if (plan.awnings.length) {
      var am = new THREE.Mesh(awningGeometry(plan.awnings), new THREE.MeshLambertMaterial({ map: awningTexture(), side: THREE.DoubleSide, alphaTest: 0.5 }));
      am.receiveShadow = true;
      scene.add(am);
    }

    /* Lights (unchanged rig). */
    scene.add(new THREE.HemisphereLight(0xfff1d6, 0x5a4636, 0.75));
    var sun = new THREE.DirectionalLight(0xffd39a, 0.85);
    var cx = W / 2, cz = H / 2, len = 45, dl = Math.sqrt(0.25 + 1 + 0.36);
    sun.position.set(cx - 0.5 / dl * len, 1 / dl * len, cz - 0.6 / dl * len);
    sun.target.position.set(cx, 0, cz); scene.add(sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(1536, 1536);
    var sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 120;
    sun.shadow.bias = -0.0006;
    scene.add(sun);

    /* Two faint additive sun shafts over the mid plazas, aligned with the sun. */
    var shaftMat = new THREE.MeshBasicMaterial({ map: shaftTexture(), color: 0xffd9a0, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    var shafts = new THREE.Mesh(shaftGeometry([{ x: 12.5, z: 10, w: 1.2, len: 7 }, { x: 12.5, z: 29.5, w: 1.4, len: 7 }], new THREE.Vector3(-0.5, 1, -0.6)), shaftMat);
    shafts.renderOrder = 5;
    scene.add(shafts);
    anim.shaftMat = shaftMat;
  };

  /* Ambient animation: banner sway, palm fronds, shaft shimmer. Cheap: about 150 vertices and 7 matrices a frame. */
  var swayObj = null;
  World.update = function (dt, camera) {
    if (!anim) return;
    /* Team banners follow the local player: teal at whichever spawn is yours (guest spawns at the top). */
    var wantFlip = !!(SL.G && SL.G.flip);
    if (anim.bannerTex && anim.bannerFlip !== wantFlip) { anim.bannerTex.offset.x = wantFlip ? 0.5 : 0; anim.bannerFlip = wantFlip; }
    if (floorPaint && floorPaint.flip !== wantFlip) { paintRugs(floorPaint.g, wantFlip); floorPaint.tex.needsUpdate = true; floorPaint.flip = wantFlip; }
    anim.t += Math.min(Math.max(dt || 0, 0), 0.1);
    var t = anim.t, A = anim.amp, i;
    if (anim.banner) {
      var bp = anim.banner.geo.attributes.position, arr = bp.array, base = anim.banner.base, meta = anim.banner.meta, n = bp.count;
      for (i = 0; i < n; i++) {
        var tt = meta[i * 3], ph = meta[i * 3 + 2];
        arr[i * 3 + 2] = base[i * 3 + 2] + meta[i * 3 + 1] * A * tt * (0.035 + 0.025 * Math.sin(t * 2.3 + ph + tt * 3.2));
      }
      bp.needsUpdate = true;
    }
    if (anim.fronds) {
      swayObj = swayObj || new THREE.Object3D();
      for (i = 0; i < anim.palms.length; i++) {
        var p = anim.palms[i];
        swayObj.position.set(p.x, p.y, p.z);
        swayObj.rotation.set(Math.sin(t * 1.1 + p.ph) * 0.05 * A, p.ry + Math.sin(t * 0.6 + p.ph) * 0.04 * A, Math.sin(t * 1.4 + p.ph * 1.3) * 0.05 * A);
        swayObj.scale.setScalar(p.s); swayObj.updateMatrix();
        anim.fronds.setMatrixAt(i, swayObj.matrix);
      }
      anim.fronds.instanceMatrix.needsUpdate = true;
    }
    if (anim.shaftMat) anim.shaftMat.opacity = 0.13 + (0.03 * Math.sin(t * 0.7) + 0.015 * Math.sin(t * 1.9)) * A;
  };
})(window.SL);
