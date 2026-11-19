/* Sandline Duel: combat (contract v2). Movement integration, dash, auto-aim, auto-fire, reload, damage, stats.
   Registers SL.combat. Shared by both units so the player, the bot and an online opponent follow the same rules. */
'use strict';
(function (SL) {
  var DEG = Math.PI / 180;

  function normAng(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  function weaponOf(u) { return SL.WEAPONS[u.weapon] || SL.WEAPONS.rifle; }

  function ensureStats(u) {
    if (!u.stats) u.stats = { shots: 0, hits: 0, dmgDealt: 0, dmgTaken: 0, kills: 0, longest: 0 };
    return u.stats;
  }

  /* Per-round reset. u.stats is per match and is left alone (makeUnit creates it). */
  function resetUnit(u, spawn, aim, weaponId) {
    var w = SL.WEAPONS[weaponId] || SL.WEAPONS.rifle;
    u.x = spawn.x; u.z = spawn.z;
    u.vx = 0; u.vz = 0;
    if (aim !== null && aim !== undefined) u.aim = aim;
    u.hp = SL.C.HP; u.alive = true;
    u.weapon = w.id; u.ammo = w.mag;
    u.reloading = false; u.reloadT = 0;
    u.cd = 0; u.react = 0;
    u.had = false; u.target = false;
    u.still = 1; u.moving = false; u.noTarget = 0;
    u.dashT = 0; u.dashCd = 0; u.dashX = 0; u.dashZ = 0;
    u.laserT = 0;
    u.flashT = 0; u.hitT = 0; u.deadT = 0;
    ensureStats(u);
  }

  function applyDamage(target, amount, attacker) {
    if (!target || !target.alive || !(amount > 0)) return;
    var dealt = Math.min(target.hp, amount);
    target.hp = Math.max(0, target.hp - amount);
    target.hitT = 0.12;
    if (attacker) target.hitDir = Math.atan2(attacker.z - target.z, attacker.x - target.x);
    ensureStats(target).dmgTaken += dealt;
    if (attacker) ensureStats(attacker).dmgDealt += dealt;
    SL.emit('damage', { target: target, attacker: attacker, amount: amount, x: target.x, z: target.z });
    if (target.hp <= 0) {
      target.alive = false;
      target.deadT = 0;
      target.vx = 0; target.vz = 0;
      target.moving = false; target.target = false;
      target.dashT = 0; target.laserT = 0;
      if (attacker) {
        var st = ensureStats(attacker);
        st.kills++;
        var d = Math.sqrt((attacker.x - target.x) * (attacker.x - target.x) + (attacker.z - target.z) * (attacker.z - target.z));
        if (d > st.longest) st.longest = d;
      }
      SL.emit('death', { unit: target, killer: attacker });
    }
  }

  /* Ray (origin o, unit dir d) vs circle (centre c, radius r). Returns entry distance (>= 0) or -1. */
  function rayCircle(ox, oz, dx, dz, cx, cz, r) {
    var fx = ox - cx, fz = oz - cz;
    var b = fx * dx + fz * dz;
    var c = fx * fx + fz * fz - r * r;
    var disc = b * b - c;
    if (disc < 0) return -1;
    var s = Math.sqrt(disc);
    if (-b + s < 0) return -1;
    return Math.max(0, -b - s);
  }

  function fire(u, e, w, dt) {
    u.cd = Math.max(u.cd, -dt) + w.rate;
    u.ammo--;
    u.flashT = 0.05;
    var settle = SL.clamp(u.still / SL.C.STILL_SETTLE, 0, 1);
    var spreadRad = (w.move + (w.still - w.move) * settle) * u.spreadMul * DEG;
    var maxD = w.range * 1.15;
    var mx = u.x + Math.cos(u.aim) * 0.55;
    var mz = u.z + Math.sin(u.aim) * 0.55;
    var tracers = [];
    var dmg = 0;
    for (var i = 0; i < w.pellets; i++) {
      var a = u.aim + (Math.random() - 0.5) * spreadRad;
      var dx = Math.cos(a), dz = Math.sin(a);
      var wall = SL.world.rayDist(u.x, u.z, dx, dz, maxD);
      var t = e && e.alive ? rayCircle(u.x, u.z, dx, dz, e.x, e.z, SL.C.HIT_R) : -1;
      var hit = t >= 0 && t < wall && t <= maxD;
      var end = hit ? t : Math.min(wall, maxD);
      if (hit) dmg += w.dmg;
      tracers.push({ x0: mx, z0: mz, x1: u.x + dx * end, z1: u.z + dz * end, hit: hit });
    }
    var st = ensureStats(u);
    st.shots++;
    if (dmg > 0) st.hits++;
    SL.emit('shot', { u: u, weapon: w, mx: mx, mz: mz, tracers: tracers });
    if (dmg > 0) applyDamage(e, dmg, u);
  }

  function setStillness(u, dt) {
    var sp = Math.sqrt(u.vx * u.vx + u.vz * u.vz);
    if (u.dashT > 0 || sp >= SL.C.STILL_SPEED) { u.moving = true; u.still = 0; }
    else { u.moving = false; u.still += dt; }
  }

  function tickDash(u, dt) {
    if (u.dashCd > 0) u.dashCd = Math.max(0, u.dashCd - dt);
  }

  /* Movement + collision + dash motion. No combat. */
  function moveOnly(u, dt, mx, mz, mag) {
    if (!u.alive) return;
    var w = weaponOf(u);
    tickDash(u, dt);
    if (u.dashT > 0) {
      var dashSpeed = SL.C.DASH_DIST / SL.C.DASH_TIME;
      var step = Math.min(dt, u.dashT);
      u.dashT -= dt;
      u.vx = u.dashX * dashSpeed; u.vz = u.dashZ * dashSpeed;
      /* Substeps of <= 0.2 units so a fast dash never tunnels through a tile at low frame rates. */
      var n = Math.max(1, Math.ceil(dashSpeed * step / 0.2)), sub = step / n;
      for (var i = 0; i < n; i++) {
        var px0 = u.x, pz0 = u.z;
        u.x += u.vx * sub; u.z += u.vz * sub;
        SL.world.collide(u, px0, pz0);
      }
      if (u.dashT <= 0) {
        /* Leave the dash at running speed so it does not coast. */
        u.dashT = 0;
        u.vx = u.dashX * w.speed; u.vz = u.dashZ * w.speed;
      }
      u.moving = true; u.still = 0;
      return;
    }
    mag = SL.clamp(mag || 0, 0, 1);
    if (!(mx === mx) || !(mz === mz)) { mx = 0; mz = 0; mag = 0; }
    var tvx = mx * w.speed * mag, tvz = mz * w.speed * mag;
    var k = Math.min(1, dt * 14);
    u.vx += (tvx - u.vx) * k;
    u.vz += (tvz - u.vz) * k;
    var px = u.x, pz = u.z;
    u.x += u.vx * dt;
    u.z += u.vz * dt;
    SL.world.collide(u, px, pz);
    setStillness(u, dt);
  }

  /* Start a dash. dir may be zero: then velocity direction, else aim. */
  function dash(u, dirX, dirZ) {
    if (!u || !u.alive || u.dashCd > 0 || u.dashT > 0) return false;
    var dx = dirX || 0, dz = dirZ || 0, d = Math.sqrt(dx * dx + dz * dz);
    if (!(d > 1e-6)) {
      var sp = Math.sqrt(u.vx * u.vx + u.vz * u.vz);
      if (sp > 0.1) { dx = u.vx; dz = u.vz; d = sp; }
      else { dx = Math.cos(u.aim); dz = Math.sin(u.aim); d = 1; }
    }
    u.dashX = dx / d; u.dashZ = dz / d;
    u.dashT = SL.C.DASH_TIME;
    u.dashCd = SL.C.DASH_CD;
    u.still = 0; u.moving = true;
    SL.emit('dash', { u: u });
    return true;
  }

  function updateUnit(u, dt, mx, mz, mag, lookAngle, allowFire, opts) {
    if (!u.alive) {
      u.deadT += dt;
      u.flashT = Math.max(0, u.flashT - dt);
      u.hitT = Math.max(0, u.hitT - dt);
      u.laserT = 0;
      return;
    }
    var w = weaponOf(u);

    /* Move */
    if (opts && opts.external) {
      tickDash(u, dt);
      if (u.dashT > 0) u.dashT = Math.max(0, u.dashT - dt);
      setStillness(u, dt);
    } else {
      moveOnly(u, dt, mx, mz, mag);
    }

    /* Target */
    var e = SL.enemyOf(u);
    var dist = Infinity, angE = u.aim;
    if (e) {
      var ex = e.x - u.x, ez = e.z - u.z;
      dist = Math.sqrt(ex * ex + ez * ez);
      angE = Math.atan2(ez, ex);
    }
    u.target = !!(e && e.alive && dist <= w.range && SL.world.los(u.x, u.z, e.x, e.z));
    if (u.target && !u.had) {
      u.react = u.reaction;
      if (w.laser > 0) { u.laserT = w.laser; SL.emit('laser', { u: u }); }
    }
    if (!u.target) u.laserT = 0;
    u.had = u.target;
    if (u.target) u.noTarget = 0; else u.noTarget += dt;

    /* Aim */
    var desired = null;
    if (u.target) desired = angE;
    else if (lookAngle !== null && lookAngle !== undefined && !u.moving) desired = lookAngle;
    else if (u.moving) desired = u.dashT > 0 ? Math.atan2(u.dashZ, u.dashX) : Math.atan2(u.vz, u.vx);
    if (desired !== null && desired === desired) {
      var d = SL.angDiff(u.aim, desired);
      var maxTurn = SL.C.TURN * dt;
      u.aim = normAng(u.aim + SL.clamp(d, -maxTurn, maxTurn));
    }

    /* Timers. cd may dip to -dt so the fire cadence carries its remainder across frames. */
    u.cd = Math.max(-dt, u.cd - dt);
    u.react = Math.max(0, u.react - dt);
    u.laserT = Math.max(0, u.laserT - dt);
    u.flashT = Math.max(0, u.flashT - dt);
    u.hitT = Math.max(0, u.hitT - dt);

    /* Reload */
    if (u.reloading) {
      u.reloadT -= dt;
      if (u.reloadT <= 0) { u.reloadT = 0; u.reloading = false; u.ammo = w.mag; }
    } else if (u.ammo <= 0 || (!u.target && u.ammo < w.mag && u.noTarget > SL.C.AUTO_RELOAD_IDLE)) {
      u.reloading = true;
      u.reloadT = w.reload;
      SL.emit('reload', { u: u });
    }

    /* Fire */
    if (allowFire && u.target && !u.reloading && u.ammo > 0 && u.cd <= 0 && u.react <= 0 &&
        u.laserT <= 0 && u.dashT <= 0 && u.still >= (w.needStill || 0) &&
        Math.abs(SL.angDiff(u.aim, angE)) < SL.C.FIRE_CONE) {
      fire(u, e, w, dt);
    }
  }

  SL.combat = { resetUnit: resetUnit, updateUnit: updateUnit, moveOnly: moveOnly, dash: dash, applyDamage: applyDamage };
})(window.SL);
