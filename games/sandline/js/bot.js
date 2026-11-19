/* Sandline Duel: bot brain (contract v2). Decides movement and dashes only; aiming and firing go through SL.combat
   with the same rules as the player. The bot never reads the player's position unless it can see them, was pinged,
   or remembers a sighting. All memory lives in bot.ai. */
'use strict';
(function (SL) {
  var REPATH = 0.5;        // seconds between path refreshes
  var NODE_EPS = 0.3;      // advance when this close to a path node
  var ARRIVE = 0.35;       // goal reached
  var STUCK_WIN = 0.7;     // stuck sample window
  var STUCK_MIN = 0.15;    // must move at least this far per window
  var MEMORY = 4;          // seconds a sighting is chased
  var KNOWN_TTL = 20;      // seconds a sighting or ping still steers the hunt
  var COVER_RECALC = 1.0;  // min seconds between findCover calls while retreating

  /* Retreat tuning (measured with tests/sim.test.js): fleeing in the open loses fights, so the bot only
     breaks off when cover is close and the foe is not already on top of it, then holds the spot as an ambush. */
  var T = { reloadMin: 0.8, reloadHold: 1.2, hpHold: 4, hpMinDist: 4, hpCoverMax: 4.5,
            ambushGap: 3, ambushEvery: 7 };

  /* Blind picks lean toward the guns that suit this lane-heavy map (order follows SL.WEAPON_ORDER). */
  var WEIGHTS = {
    easy:   { smg: 1, rifle: 1, shotgun: 1, sniper: 1 },
    normal: { smg: 1, rifle: 1.2, shotgun: 0.9, sniper: 1 },
    hard:   { smg: 1, rifle: 1.3, shotgun: 0.8, sniper: 1.1 }
  };
  var COUNTER = { sniper: ['smg'], shotgun: ['rifle', 'sniper'], rifle: ['sniper', 'shotgun'], smg: ['rifle'] };
  var COUNTER_P = { easy: 0.45, normal: 1, hard: 1 };

  var bots = [];           // units that went through reset(), so pings reach them

  function diffOf(bot) { return SL.DIFF[bot.ai.diff] || SL.DIFF.normal; }
  function dist2(ax, az, bx, bz) { var dx = bx - ax, dz = bz - az; return dx * dx + dz * dz; }
  function angTo(bot, p) { return Math.atan2(p.z - bot.z, p.x - bot.x); }

  function reset(bot, diffKey) {
    var d = SL.DIFF[diffKey] || SL.DIFF.normal;
    bot.reaction = d.reaction;
    bot.spreadMul = d.spreadMul;
    bot.ai = { diff: SL.DIFF[diffKey] ? diffKey : 'normal', baseReaction: d.reaction };
    if (bots.indexOf(bot) < 0) { bots.push(bot); if (bots.length > 4) bots.shift(); }
  }

  function pickWeapon(diffKey, known) {
    var o = SL.WEAPON_ORDER, i;
    var opts = known ? COUNTER[known] : null;
    var cp = COUNTER_P[diffKey] === undefined ? 1 : COUNTER_P[diffKey];
    if (opts && Math.random() < cp) return opts[Math.floor(Math.random() * opts.length) % opts.length];
    var wt = WEIGHTS[diffKey] || WEIGHTS.normal, sum = 0;
    for (i = 0; i < o.length; i++) sum += wt[o[i]] || 1;
    var r = Math.random() * sum;
    for (i = 0; i < o.length; i++) { r -= wt[o[i]] || 1; if (r < 0) return o[i]; }
    return o[o.length - 1];
  }

  function remember(bot, x, z) {
    var ai = bot.ai;
    ai.lastSeen = { x: x, z: z, t: ai.t };
    ai.known = { x: x, z: z, t: ai.t };
  }

  /* Anti-stall reveal: the bot learns where its foe is, exactly like the player does. */
  SL.on('ping', function (e) {
    if (!e || !e.u) return;
    for (var i = 0; i < bots.length; i++) {
      var b = bots[i];
      if (b.ai && b.ai.ready && b.alive && SL.enemyOf(b) === e.u) remember(b, e.x, e.z);
    }
  });

  function initAi(bot) {
    var ai = bot.ai;
    if (ai.ready) return;
    ai.ready = true;
    ai.t = 0;
    if (!(ai.baseReaction > 0)) ai.baseReaction = bot.reaction;
    ai.rolled = false;
    ai.lastSeen = null; ai.known = null;
    var sp = SL.world.spawnP, sb = SL.world.spawnB;
    ai.foeSpawn = dist2(bot.x, bot.z, sp.x, sp.z) > dist2(bot.x, bot.z, sb.x, sb.z) ? { x: sp.x, z: sp.z } : { x: sb.x, z: sb.z };
    ai.path = null; ai.pathI = 0; ai.gx = NaN; ai.gz = NaN; ai.repathT = 0;
    ai.wp = -1; ai.wpGoal = -1; ai.holdT = 0; ai.holding = false; ai.holdLook = null;
    ai.cover = null; ai.coverT = -99; ai.retreat = null; ai.fled = false; ai.ambushNext = 0;
    ai.prevDist = -1; ai.closing = 0;
    ai.stuckT = 0; ai.sx = NaN; ai.sz = NaN;
  }

  /* Some spots may sit on blocked tiles: walk to the nearest open tile centre instead. */
  function freeGoal(x, z) {
    var c = Math.floor(x), r = Math.floor(z);
    if (!SL.world.solid(c, r)) return null;
    var best = null, bd = Infinity;
    for (var dr = -2; dr <= 2; dr++) for (var dc = -2; dc <= 2; dc++) {
      if (SL.world.solid(c + dc, r + dr)) continue;
      var d = dist2(x, z, c + dc + 0.5, r + dr + 0.5);
      if (d < bd) { bd = d; best = { x: c + dc + 0.5, z: r + dr + 0.5 }; }
    }
    return best;
  }

  /* Path following toward (gx, gz). Fills out {mx, mz, mag, arrived}. */
  function steer(bot, gx, gz, dt, out) {
    var ai = bot.ai;
    var fg = freeGoal(gx, gz);
    if (fg) { gx = fg.x; gz = fg.z; }
    out.mx = 0; out.mz = 0; out.mag = 0; out.arrived = false;
    if (dist2(bot.x, bot.z, gx, gz) < ARRIVE * ARRIVE) { out.arrived = true; return out; }
    ai.repathT -= dt;
    if (!ai.path || ai.repathT <= 0 || !(ai.gx === ai.gx) || dist2(ai.gx, ai.gz, gx, gz) > 1) {
      var p = SL.world.findPath(bot.x, bot.z, gx, gz);
      ai.repathT = REPATH;
      ai.gx = gx; ai.gz = gz;
      if (p === null) { ai.path = null; return out; }
      p = p.slice();
      if (p.length) p[p.length - 1] = { x: gx, z: gz }; else p.push({ x: gx, z: gz });
      ai.path = p; ai.pathI = 0;
    }
    var path = ai.path;
    if (!path || !path.length) return out;
    var guard = 0;
    while (ai.pathI < path.length - 1 && guard < 6 &&
           SL.world.clearPath(bot.x, bot.z, path[ai.pathI + 1].x, path[ai.pathI + 1].z)) { ai.pathI++; guard++; }
    var n = path[ai.pathI];
    while (dist2(bot.x, bot.z, n.x, n.z) < NODE_EPS * NODE_EPS && ai.pathI < path.length - 1) { ai.pathI++; n = path[ai.pathI]; }
    var dx = n.x - bot.x, dz = n.z - bot.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6) { out.arrived = ai.pathI >= path.length - 1; return out; }
    out.mx = dx / d; out.mz = dz / d;
    out.mag = ai.pathI >= path.length - 1 ? SL.clamp(d / 0.6, 0.35, 1) : 1;
    return out;
  }

  function nearestWaypoint(x, z, exclude) {
    var best = -1, bd = Infinity;
    for (var i = 0; i < SL.WAYPOINTS.length; i++) {
      if (i === exclude) continue;
      var d = dist2(x, z, SL.WAYPOINTS[i].x, SL.WAYPOINTS[i].z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /* Best guess of where the foe is, from information the bot legitimately has. */
  function guess(bot) {
    var ai = bot.ai;
    if (ai.known && ai.t - ai.known.t < KNOWN_TTL) return ai.known;
    return ai.foeSpawn;
  }

  function chooseWaypoint(bot) {
    var ai = bot.ai, n = SL.WAYPOINTS.length;
    if (Math.random() < diffOf(bot).hunt) { var g = guess(bot); return nearestWaypoint(g.x, g.z, ai.wp); }
    var i = Math.floor(Math.random() * (n - 1));
    if (ai.wp >= 0 && i >= ai.wp) i++;
    return Math.min(i, n - 1);
  }

  /* Direction to watch while holding: down the lane that leads toward the best guess, i.e. the first path node
     that is a couple of units out (where the foe would appear), not the foe's true position. */
  function laneLook(bot) {
    var g = guess(bot);
    var p = SL.world.findPath(bot.x, bot.z, g.x, g.z);
    if (!p || !p.length) return angTo(bot, g);
    var pick = p[p.length - 1];
    for (var i = 0; i < p.length; i++) {
      if (dist2(bot.x, bot.z, p[i].x, p[i].z) >= 6.25) { pick = p[i]; break; }
    }
    return angTo(bot, pick);
  }

  /* Open direction leading away from (fx, fz), or null when boxed in. */
  function awayDir(bot, fx, fz) {
    var ax = bot.x - fx, az = bot.z - fz, d = Math.sqrt(ax * ax + az * az) || 1;
    ax /= d; az /= d;
    var best = null, bs = 0.15;
    for (var k = 0; k < 12; k++) {
      var a = k * Math.PI / 6, dx = Math.cos(a), dz = Math.sin(a);
      var dot = dx * ax + dz * az;
      if (dot <= bs) continue;
      if (SL.world.rayDist(bot.x, bot.z, dx, dz, 1.6) < 1.5) continue;
      if (!SL.world.clearPath(bot.x, bot.z, bot.x + dx * 1.2, bot.z + dz * 1.2, 0.34)) continue;
      bs = dot; best = { x: dx, z: dz };
    }
    return best;
  }

  /* Rough seconds to finish a target with hp left (expected 70% of pellets landing). */
  function ttk(w, hp) {
    var per = w.dmg * Math.max(1, w.pellets * 0.7);
    return (Math.ceil(hp / per) - 1) * w.rate;
  }

  function tryDash(bot, dx, dz) {
    if (bot.dashCd > 0 || bot.dashT > 0) return false;
    if (SL.world.rayDist(bot.x, bot.z, dx, dz, 2.5) < 2) return false;
    return SL.combat.dash(bot, dx, dz);
  }

  var tmp = { mx: 0, mz: 0, mag: 0, arrived: false };

  function update(bot, dt, allowMove, allowFire) {
    if (!bot.ai) bot.ai = {};
    initAi(bot);
    var ai = bot.ai;
    if (!allowMove || !bot.alive) {
      SL.combat.updateUnit(bot, dt, 0, 0, 0, null, false);
      return;
    }
    ai.t += dt;
    /* Human-like variance: each new engagement gets a reaction within +-20% of the difficulty value. */
    if (!bot.had && !ai.rolled) { bot.reaction = ai.baseReaction * (0.8 + Math.random() * 0.4); ai.rolled = true; }
    else if (bot.had) ai.rolled = false;
    var foe = SL.enemyOf(bot);
    var w = SL.WEAPONS[bot.weapon] || SL.WEAPONS.rifle;
    var pw = foe ? (SL.WEAPONS[foe.weapon] || w) : w;
    var D = diffOf(bot);
    var vis = !!(foe && foe.alive && SL.world.los(bot.x, bot.z, foe.x, foe.z));
    var dist = Infinity;
    if (vis) {
      remember(bot, foe.x, foe.z);
      dist = Math.sqrt(dist2(bot.x, bot.z, foe.x, foe.z));
      ai.closing = ai.prevDist >= 0 ? ai.closing * 0.85 + (ai.prevDist - dist) / dt * 0.15 : 0;
      ai.prevDist = dist;
    } else { ai.prevDist = -1; ai.closing = 0; }

    var mx = 0, mz = 0, mag = 0, look = null, wantMove = false, goal = null, dashGoal = false;

    /* ---- retreat: break line of sight to reload, or once per life when losing badly; then ambush ---- */
    var lowHp = vis && bot.hp < 35 && foe.hp > bot.hp + 15;
    var reloadRun = vis && bot.reloading && bot.reloadT > T.reloadMin && dist <= pw.range * 1.05;
    /* Fleeing under fire usually loses, so only run when the trade is clearly lost (or the gun is empty). */
    var hpRun = lowHp && !ai.fled && dist >= T.hpMinDist && (bot.reloading || ttk(w, foe.hp) > 2 * ttk(pw, bot.hp));
    /* Badly outranged in the open (say SMG facing a sniper down a lane): do not charge, break sight and let the
       foe walk into a corner. Rate limited so the bot does not hide all round. */
    var ambush = vis && !bot.target && pw.range > w.range + T.ambushGap && dist <= pw.range && ai.t >= ai.ambushNext;
    if (D.cover && !ai.retreat && (reloadRun || hpRun || ambush)) {
      var why = reloadRun ? 'reload' : hpRun ? 'hp' : 'ambush';
      var c0 = SL.world.findCover(bot.x, bot.z, foe.x, foe.z, 8);
      if (c0 && why !== 'reload' && dist2(bot.x, bot.z, c0.x, c0.z) > T.hpCoverMax * T.hpCoverMax) c0 = null;
      if (c0) {
        ai.retreat = { why: why, arriveT: -1, dashed: false };
        ai.cover = c0; ai.coverT = ai.t;
        if (why === 'hp') ai.fled = true;
        if (why === 'ambush') ai.ambushNext = ai.t + T.ambushEvery;
      }
    }
    if (ai.retreat) {
      var R = ai.retreat, end = false;
      if (!foe || !foe.alive) end = true;
      else if (R.arriveT < 0) {
        if (R.why === 'reload' && !bot.reloading) end = true;
        else if (vis && ai.t - ai.coverT > COVER_RECALC) {
          ai.coverT = ai.t;
          var c1 = SL.world.findCover(bot.x, bot.z, foe.x, foe.z, 8);
          if (c1) ai.cover = c1; else end = true;
        }
      } else {
        var held = ai.t - R.arriveT;
        if (vis && !bot.reloading) end = true;
        else if (R.why === 'reload' ? (!bot.reloading && held > T.reloadHold) : held > T.hpHold) end = true;
      }
      if (end) { ai.retreat = null; ai.cover = null; }
    }

    if (ai.retreat && ai.cover) {
      goal = ai.cover;
      ai.holding = false;
      dashGoal = D.dash && vis && !ai.retreat.dashed;
    } else if (vis) {
      ai.holding = false;
      /* Short guns close in; long guns plant as soon as they have a target (moving costs them accuracy). */
      var chaseAt = (w.id === 'smg' || w.id === 'shotgun') ? w.range * 0.55 : (bot.target ? Infinity : w.range * 0.85);
      var outranges = w.range > pw.range + 1;
      var cheapMove = w.move <= w.still * 2 || bot.reloading || bot.cd > (w.needStill || 0) + SL.C.STILL_SETTLE;
      if (outranges && ai.closing > 0.5 && dist < pw.range + 1.5) {
        /* Kite: keep the gap while the gun is not paying for the movement, otherwise plant and shoot. */
        if (cheapMove) {
          var ad = awayDir(bot, foe.x, foe.z);
          if (ad) { mx = ad.x; mz = ad.z; mag = 1; wantMove = true; }
        }
      } else if (dist > chaseAt) {
        goal = { x: foe.x, z: foe.z };
        /* Hard closes the gap with a dash when its short gun is outranged and nearly in range. */
        if (D.dash && ai.diff === 'hard' && (w.id === 'smg' || w.id === 'shotgun') && w.range <= pw.range &&
            dist < w.range + SL.C.DASH_DIST * 0.75 && dist > w.range * 0.6 &&
            SL.world.clearPath(bot.x, bot.z, foe.x, foe.z, 0.34)) {
          var ux = (foe.x - bot.x) / dist, uz = (foe.z - bot.z) / dist;
          tryDash(bot, ux, uz);
        }
      }
      /* else: stand still, combat aims at the target and the stance tightens spread */
    } else if (ai.lastSeen && ai.t - ai.lastSeen.t < MEMORY) {
      ai.holding = false;
      goal = ai.lastSeen;
      look = angTo(bot, ai.lastSeen);
    } else {
      ai.lastSeen = null;
      if (ai.holding) {
        ai.holdT -= dt;
        look = ai.holdLook;
        if (ai.holdT <= 0) { ai.holding = false; ai.wpGoal = -1; }
      }
      if (!ai.holding) {
        if (ai.wpGoal < 0) ai.wpGoal = chooseWaypoint(bot);
        goal = SL.WAYPOINTS[ai.wpGoal];
      }
    }

    if (goal) {
      steer(bot, goal.x, goal.z, dt, tmp);
      if (tmp.arrived) {
        if (ai.retreat && goal === ai.cover) {
          if (ai.retreat.arriveT < 0) ai.retreat.arriveT = ai.t;
          var k = ai.known || ai.lastSeen;
          if (k) look = angTo(bot, k);
        } else if (ai.lastSeen && goal === ai.lastSeen) {
          ai.lastSeen = null;
        } else if (!vis && ai.wpGoal >= 0 && goal === SL.WAYPOINTS[ai.wpGoal]) {
          ai.wp = ai.wpGoal; ai.wpGoal = -1;
          ai.holding = true; ai.holdT = 1 + Math.random() * 1.8;
          ai.holdLook = laneLook(bot);
          look = ai.holdLook;
        }
      } else {
        mx = tmp.mx; mz = tmp.mz; mag = tmp.mag;
        wantMove = mag > 0;
        if (dashGoal && wantMove && tryDash(bot, mx, mz)) ai.retreat.dashed = true;
      }
    }

    /* Stuck detection */
    if (wantMove) {
      if (!(ai.sx === ai.sx)) { ai.sx = bot.x; ai.sz = bot.z; ai.stuckT = 0; }
      ai.stuckT += dt;
      if (ai.stuckT >= STUCK_WIN) {
        if (dist2(ai.sx, ai.sz, bot.x, bot.z) < STUCK_MIN * STUCK_MIN) {
          ai.repathT = 0; ai.path = null;
          if (!vis && !ai.retreat) { ai.wpGoal = -1; ai.lastSeen = null; }
          if (ai.retreat) { ai.retreat = null; ai.cover = null; }
        }
        ai.sx = bot.x; ai.sz = bot.z; ai.stuckT = 0;
      }
    } else {
      ai.sx = NaN; ai.stuckT = 0;
    }

    SL.combat.updateUnit(bot, dt, mx, mz, mag, look, allowFire);
  }

  SL.bot = { reset: reset, pickWeapon: pickWeapon, update: update };
})(window.SL);
