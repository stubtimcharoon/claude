/* Sandline Duel: shared contract, v2 (release). Every other module reads this file and registers itself on window.SL.
   Load order (classic scripts, no modules): three.min.js (r128, global THREE), core.js, profile.js, world.js,
   combat.js, bot.js, audio.js, view.js, net.js, main.js.
   Coordinates: map column c -> world x in [c, c+1], map row r -> world z in [r, r+1]. Tile = 1 unit = "1 m".
   Row 0 is the TOP of the map. Angles are radians on the x/z plane: direction = (cos a, sin a), so a = -PI/2 points
   toward row 0 (up the screen for the default camera) and +PI/2 toward the bottom.

   FILE OWNERSHIP (release build): core.js tuning blocks (C, MAP_SRC, WEAPONS, DIFF) may be retuned by the gameplay
   owner; every other section here is frozen contract. profile.js + index.html + main.js: shell owner.
   world.js: world-art owner. combat.js + bot.js + tests/sim.test.js: gameplay owner. view.js: view owner.
   audio.js: audio owner. net.js + tests/net.test.js: net owner. */
'use strict';
window.SL = window.SL || {};
(function (SL) {
  SL.VERSION = '1.0.0';

  /* ---------------- tuning (gameplay owner may retune) ---------------- */
  SL.C = {
    UNIT_R: 0.34,          // collision radius
    HIT_R: 0.42,           // bullet hit radius
    HP: 100,
    WIN: 3,                // rounds to win the match (first to 3)
    ROUND_TIME: 45,        // seconds
    STALL_FROM: 12,        // last N seconds of a round: both positions are pinged through fog
    STALL_EVERY: 3,        // seconds between pings
    TURN: 6.0,             // aim turn rate, rad/s
    FIRE_CONE: 0.14,       // rad: must be aimed this close to the target to fire
    STILL_SPEED: 0.4,      // below this speed (u/s) a unit counts as standing still
    STILL_SETTLE: 0.3,     // seconds of stillness to reach full "still" accuracy
    AUTO_RELOAD_IDLE: 1.2, // reload a partial mag after this long with no target
    PLAYER_REACTION: 0.22, // seconds between first sighting and first shot
    DASH_DIST: 3.5,        // units covered by one dash
    DASH_TIME: 0.16,       // seconds a dash lasts (no firing during it, stillness resets)
    DASH_CD: 7,            // seconds between dashes
    CAM_FOV: 40,
    CAM_ELEV_DEG: 58
  };

  /* Original map "Sandline". '#' wall, 'c' crate (blocks movement and sight), '.' sand floor,
     'a' / 'b' site floor (walkable), 'T' bottom spawn, 'C' top spawn. 25 x 36. */
  SL.MAP_SRC = [
    '#########################', // 0
    '#aaaaaaa#.......#bbbbbbb#', // 1
    '#aa.c.aa#...C...#bb.c.bb#', // 2
    '#a..c..a.........b..c..b#', // 3
    '#a.....a.........b.....b#', // 4
    '#aa.cc.a#...c...#b.cc.bb#', // 5
    '#a.....a#.......#b.....b#', // 6
    '#aaa######.....######bbb#', // 7
    '#...######.....######...#', // 8
    '#...######..c..######...#', // 9
    '#.c.######.....######.c.#', // 10
    '#...######.....######...#', // 11
    '#...#######...#######...#', // 12
    '#...#######...#######...#', // 13
    '#.............#######...#', // 14
    '#.....c.......#######...#', // 15
    '#...#######...#######...#', // 16
    '#...#######...#######...#', // 17
    '#.c.#######...#######.c.#', // 18
    '#...#######...#######...#', // 19
    '#...#######c..#######...#', // 20
    '#...#######...#######...#', // 21
    '#...#######.........c...#', // 22
    '#...#######.............#', // 23
    '#...#######...#######...#', // 24
    '#.c.#######...#######.c.#', // 25
    '#...#######...#######...#', // 26
    '#...#######...#######...#', // 27
    '#...####.........####...#', // 28
    '#...####....c....####...#', // 29
    '#...####.........####...#', // 30
    '#...#####.......#####...#', // 31
    '#.......................#', // 32
    '#....c.....T.......c....#', // 33
    '#.......................#', // 34
    '#########################'  // 35
  ];

  /* Named spots (world coords, all on open floor) for bot patrols and UI labels. */
  SL.WAYPOINTS = [
    { id: 'A site', x: 4.5, z: 4.0 },
    { id: 'B site', x: 20.5, z: 4.0 },
    { id: 'CT', x: 12.5, z: 2.5 },
    { id: 'Top mid', x: 12.5, z: 10.5 },
    { id: 'Lower mid', x: 12.5, z: 30.5 },
    { id: 'Short', x: 7.5, z: 15.0 },
    { id: 'Connector', x: 16.5, z: 23.0 },
    { id: 'Long', x: 2.5, z: 20.5 },
    { id: 'Tunnels', x: 22.5, z: 16.5 },
    { id: 'T spawn', x: 12.5, z: 33.5 }
  ];

  /* spread values are FULL cone width in degrees. still = fully settled, move = while moving.
     needStill: seconds of stillness required before the gun may fire at all (0 = none).
     laser: seconds a visible aim warning shows (view draws it through fog) before the first shot of an engagement. */
  SL.WEAPONS = {
    smg:     { id: 'smg',     name: 'SMG',     tag: 'Best on the run',           range: 7,   rate: 0.08,  dmg: 16,  pellets: 1, still: 3.5, move: 5,  mag: 30, reload: 1.6, speed: 4.9, needStill: 0,    laser: 0,    gun: [0.50, 0.11, 0.11] },
    rifle:   { id: 'rifle',   name: 'Rifle',   tag: 'Stop, then shoot',          range: 8.25, rate: 0.135, dmg: 17,  pellets: 1, still: 2.4, move: 9,  mag: 25, reload: 2.0, speed: 4.2, needStill: 0,    laser: 0,    gun: [0.70, 0.10, 0.10] },
    shotgun: { id: 'shotgun', name: 'Shotgun', tag: 'One shot at point blank',   range: 6.5, rate: 0.5,   dmg: 13,  pellets: 10, still: 10, move: 14, mag: 6,  reload: 2.2, speed: 4.8, needStill: 0,    laser: 0,    gun: [0.55, 0.15, 0.15] },
    sniper:  { id: 'sniper',  name: 'Sniper',  tag: 'Plant your feet, hold a lane', range: 18, rate: 1.0,   dmg: 95,  pellets: 1, still: 0.5, move: 16, mag: 5,  reload: 2.6, speed: 3.7, needStill: 0.3,  laser: 0.4,  gun: [0.95, 0.09, 0.09] },
    /* spin: seconds of continuous firing to reach full rate; the first shots come at rate * spinMul (slower). */
    hmg:     { id: 'hmg',     name: 'Heavy MG', tag: 'Spins up, then shreds',    range: 9,   rate: 0.07,  dmg: 12,  pellets: 1, still: 3,   move: 12, mag: 60, reload: 3.2, speed: 3.5, needStill: 0,    laser: 0,    spin: 0.6, spinMul: 2.2, gun: [0.85, 0.14, 0.14] },
    hand:    { id: 'hand',    name: 'Hand Cannon', tag: 'Few shots, big hits',   range: 8.75, rate: 0.5,  dmg: 34,  pellets: 1, still: 1.0, move: 6,  mag: 7,  reload: 1.6, speed: 4.8, needStill: 0,    laser: 0,    gun: [0.36, 0.11, 0.09] }
  };
  /* Pick-screen order. net.js sends weapons by index into this list, so host and guest must run the same build. */
  SL.WEAPON_ORDER = ['smg', 'rifle', 'shotgun', 'sniper', 'hmg', 'hand'];

  /* Bot tuning per difficulty. dash: whether the bot uses its dash. */
  SL.DIFF = {
    easy:   { label: 'Easy',   reaction: 0.39, spreadMul: 1.6, hunt: 0.35, cover: false, dash: false },
    normal: { label: 'Normal', reaction: 0.27, spreadMul: 1.2,  hunt: 0.55, cover: true,  dash: false },
    hard:   { label: 'Hard',   reaction: 0.24, spreadMul: 0.95, hunt: 0.75, cover: true,  dash: false }
  };

  /* ---------------- cosmetics catalog (frozen ids; profile.js unlocks, view.js renders) ----------------
     The local player's body stays in the teal family and the opponent's in the red family; cosmetics change trim,
     headgear, tracer colour and kill effect only. `req` is evaluated by profile.js against the saved profile. */
  SL.COSMETICS = {
    headgear: [
      { id: 'helmet',   name: 'Field helmet', req: null },
      { id: 'keffiyeh', name: 'Keffiyeh',     req: { kind: 'matches', n: 1 },       hint: 'Finish a match' },
      { id: 'goggles',  name: 'Dune goggles', req: { kind: 'wins', n: 1 },          hint: 'Win a match' },
      { id: 'bandit',   name: 'Bandit mask',  req: { kind: 'winDiff', diff: 'hard' },   hint: 'Win on Hard' },
      { id: 'brass',    name: 'Brass helm',   req: { kind: 'flawless', n: 1 },      hint: 'Win a match without losing a round' }
    ],
    trim: [
      { id: 'standard', name: 'Standard', color: 0xe8c99a, req: null },
      { id: 'dune',     name: 'Dune',     color: 0xc98a4b, req: { kind: 'matches', n: 2 },  hint: 'Finish 2 matches' },
      { id: 'oasis',    name: 'Oasis',    color: 0x7fd6c9, req: { kind: 'wins', n: 3 },     hint: 'Win 3 matches' },
      { id: 'night',    name: 'Night',    color: 0x2b2533, req: { kind: 'online', n: 1 },   hint: 'Finish an online match' }
    ],
    tracer: [
      { id: 'gold',  name: 'Gold',  color: 0xffd36b, req: null },
      { id: 'brass', name: 'Brass', color: 0xd9a441, req: { kind: 'kills', weapon: 'rifle', n: 5 },    hint: '5 rifle kills' },
      { id: 'ember', name: 'Ember', color: 0xff6a3d, req: { kind: 'kills', weapon: 'shotgun', n: 5 },  hint: '5 shotgun kills' },
      { id: 'ice',   name: 'Ice',   color: 0x9fe7ff, req: { kind: 'kills', weapon: 'sniper', n: 5 },   hint: '5 sniper kills' },
      { id: 'neon',  name: 'Neon',  color: 0x7dff9a, req: { kind: 'kills', weapon: 'smg', n: 5 },      hint: '5 SMG kills' },
      { id: 'heavy', name: 'Heavy', color: 0xc4ccd6, req: { kind: 'kills', weapon: 'hmg', n: 5 },      hint: '5 Heavy MG kills' },
      { id: 'gilded', name: 'Gilded', color: 0xfff0b0, req: { kind: 'kills', weapon: 'hand', n: 5 },   hint: '5 Hand Cannon kills' }
    ],
    killfx: [
      { id: 'sand',   name: 'Sand burst',  req: null },
      { id: 'glass',  name: 'Glass shards', req: { kind: 'xp', n: 300 },  hint: 'Reach 300 XP' },
      { id: 'banner', name: 'Banner drop',  req: { kind: 'xp', n: 800 },  hint: 'Reach 800 XP' }
    ]
  };
  SL.DEFAULT_EQUIP = { headgear: 'helmet', trim: 'standard', tracer: 'gold', killfx: 'sand' };
  /* Opponent cosmetics: the bot always uses DEFAULT_EQUIP; an online opponent sends its own equip. */

  /* ---------------- global state ----------------
     main.js owns writes to state/round/score/roundT/stateT/mode/flip; net.js writes them on the guest from snapshots. */
  SL.G = {
    state: 'menu',        // 'menu' | 'lobby' | 'pick' | 'countdown' | 'live' | 'roundEnd' | 'matchEnd'
    mode: 'solo',         // 'solo' | 'host' | 'guest'
    flip: false,          // true when the local player spawns at the TOP (guest): camera looks from -z, joystick inverts
    diff: 'normal',
    round: 1,
    scoreP: 0,            // local player's score
    scoreB: 0,            // opponent's score (bot or online opponent)
    roundT: 45,
    stateT: 0,
    clock: 0,             // seconds since load, advanced by main.js
    timeScale: 1,         // main.js may slow simulation briefly for the kill moment; view reads it
    paused: false,
    playerWeapon: 'rifle',
    lastRoundWinner: null, // 'p' | 'b' | null
    player: null,         // local unit
    bot: null             // opponent unit (bot AI in solo, remote human online)
  };

  /* Unit shape shared by both sides. combat.js owns combat fields; bot.js keeps its memory in u.ai. */
  SL.makeUnit = function (isPlayer) {
    return {
      isPlayer: isPlayer,     // true for the LOCAL player on this device
      foe: null,              // the other unit; main.js links them after creating both
      x: 0, z: 0, vx: 0, vz: 0,
      aim: isPlayer ? -Math.PI / 2 : Math.PI / 2,
      hp: SL.C.HP, alive: true,
      weapon: 'rifle', ammo: 0, reloading: false, reloadT: 0,
      cd: 0,          // fire cooldown remaining
      react: 0,       // reaction delay remaining
      had: false,     // had a valid target last frame
      target: false,  // has a valid target this frame (in range + line of sight)
      still: 0,       // seconds spent below STILL_SPEED
      moving: false,
      noTarget: 0,    // seconds without a target
      reaction: isPlayer ? SL.C.PLAYER_REACTION : 0.32,
      spreadMul: 1,
      dashT: 0,       // seconds of dash remaining (>0 = dashing)
      dashCd: 0,      // seconds until dash is ready
      laserT: 0,      // >0 while the sniper aim warning is showing (view draws it)
      flashT: 0,      // muzzle flash timer (view reads)
      hitT: 0,        // hurt flash timer (view reads)
      hitDir: 0,      // angle FROM this unit TOWARD the last attacker (view/HUD damage direction)
      deadT: 0,       // seconds since death (view reads)
      equip: SL.DEFAULT_EQUIP, // cosmetics for this unit
      stats: { shots: 0, hits: 0, dmgDealt: 0, dmgTaken: 0, kills: 0, longest: 0 }, // per match, combat.js updates
      ai: {}
    };
  };
  SL.enemyOf = function (u) { return u.foe || (u === SL.G.player ? SL.G.bot : SL.G.player); };

  /* Tiny event bus. Events and payloads:
     'shot'   { u, weapon, mx, mz, tracers: [{x0,z0,x1,z1,hit}] }   (mx,mz = muzzle)   combat.js
     'damage' { target, attacker, amount, x, z }                                      combat.js
     'death'  { unit, killer }                                                        combat.js
     'reload' { u }                                                                   combat.js
     'dash'   { u }                                                                   combat.js
     'laser'  { u }  sniper aim warning started                                        combat.js
     'ping'   { u, x, z }  anti-stall reveal of unit u through fog                      main.js (host/solo), net.js (guest)
     'round'  { phase, winner }  every state change; winner 'p'|'b'|null on roundEnd/matchEnd   main.js / net.js
     'ui'     { kind, id }  kind: 'tap' | 'card' | 'tick' | 'go' | 'unlock' | 'back'      main.js
     On the guest, net.js re-emits the host's shot/damage/death/reload/dash/laser/ping events with units remapped to
     the guest's own SL.G.player / SL.G.bot, so view.js and audio.js never need to know the mode. */
  var handlers = {};
  SL.on = function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); };
  SL.emit = function (name, payload) { (handlers[name] || []).forEach(function (fn) { try { fn(payload); } catch (e) { console.error(e); } }); };

  SL.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  SL.angDiff = function (a, b) { var d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  /* ---------------- module API contract (frozen) ----------------
  SL.profile (profile.js): load(), data, equip, setEquip(slot, id), isUnlocked(slot, id),
     award(result) -> { xp, unlocked: [{slot,id,name}] }  where result = { won, diff, mode, roundsP, roundsB, stats }.
  SL.world (world.js): unchanged from v1 (init, solid, collide, separate, rayDist, los, clearPath, findPath, findCover,
     build(scene), W, H, grid, zone, spawnP, spawnB) plus optional update(dt, camera) for ambient animation.
  SL.combat (combat.js):
     resetUnit(u, spawn, aim, weaponId)
     updateUnit(u, dt, mx, mz, mag, lookAngle, allowFire, opts)
        opts.external = true: do NOT integrate movement; u.x/u.z/u.vx/u.vz were set by someone else (net host for the
        remote unit); still/moving are derived from vx,vz. Everything else (aim, reload, firing, dash timers) runs.
     moveOnly(u, dt, mx, mz, mag)  movement + collision + dash motion only, no combat (guest predicting itself).
     dash(u, dirX, dirZ) -> bool   starts a dash if dashCd <= 0 and alive; dir may be zero (then uses aim/velocity).
     applyDamage(target, amount, attacker)
  SL.bot (bot.js): reset(bot, diffKey), pickWeapon(diffKey, knownPlayerWeapon|null), update(bot, dt, allowMove, allowFire)
  SL.audio (audio.js): init() (every user gesture; safe to repeat), suspend(), resume(), update(dt) (every frame),
     music('menu'|'round'|'off'), setBus('music'|'sfx', on), bus: { music, sfx } booleans.
  SL.view (view.js): init(container), resize(), render(dt), botVisible, project(x,y,z) -> {x,y,on} screen px.
  SL.net (net.js):
     available() -> Promise<boolean>   room capability usable in this view
     host() -> Promise<code>           create a named room, become host (mode 'host', local unit spawns bottom)
     join(code) -> Promise<void>       join as guest (mode 'guest', flip = true, local unit spawns top)
     leave()
     status: 'off' | 'waiting' | 'connected' | 'lost';  onStatus(fn)
     peerInfo() -> { equip, pick, ready, rematch } | null   latest info from the other side
     setLocal(info)   merge { pick, ready, rematch, equip } into what this side advertises
     tick(dt)         call every frame in online modes. Host: reads guest movement into SL.G.bot (x,z,vx,vz, dash) and
                      publishes snapshots at ~20 Hz. Guest: publishes own unit movement, applies the latest host snapshot
                      to SL.G (state, round, scores, roundT, hp/ammo/aim/alive of both units, opponent interpolated) and
                      re-emits relayed events.
  */

  /* ---------------- shared helpers ---------------- */
  SL.rng = function (seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  SL.store = {
    get: function (k, def) { try { var v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
})(window.SL);
