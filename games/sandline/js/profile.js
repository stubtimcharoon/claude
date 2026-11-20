/* Sandline Duel: player profile. XP, levels, medals, counters, cosmetic unlocks and equip, saved via SL.store
   under 'sl.v1.profile' (data version 2; older saves migrate on load). Loads itself on script evaluation so
   SL.profile.equip exists before main.js boots.

   Progression:
   - Every finished match pays XP: 40 + 20 per round won + 30 for the win, times the difficulty multiplier
     (Easy 1, Normal 1.25, Hard 1.5, online 1.25), plus medal XP (not multiplied).
   - Flat 120 XP per level. Each level-up grants the next locked item on the reward TRACK.
   - Achievements (SL.COSMETICS[...].req) also unlock items directly. An item counts once either way; the track
     skips items that are already unlocked. */
'use strict';
(function (SL) {
  var KEY = 'sl.v1.profile';
  var DATA_V = 2;
  var DIFF_ORDER = ['easy', 'normal', 'hard'];
  var SLOTS = ['headgear', 'trim', 'tracer', 'killfx'];
  var LEVEL_XP = 120;
  var XP_FINISH = 40, XP_ROUND = 20, XP_WIN = 30;
  var MULT = { easy: 1, normal: 1.25, hard: 1.5 }, ONLINE_MULT = 1.25;
  var SHARP_ACC = 0.55, SHARP_MIN_SHOTS = 6, LONG_SHOT_M = 12, CLOSE_CALL_HP = 20;

  /* Reward track, cheap-looking first. Catalog items missing here are appended at the end. */
  var TRACK_ORDER = [
    ['trim', 'dune'], ['headgear', 'keffiyeh'], ['tracer', 'brass'], ['headgear', 'goggles'], ['tracer', 'ember'],
    ['trim', 'oasis'], ['killfx', 'glass'], ['tracer', 'neon'], ['tracer', 'heavy'], ['headgear', 'bandit'],
    ['tracer', 'ice'], ['tracer', 'gilded'], ['headgear', 'brass'], ['trim', 'night'], ['killfx', 'banner']
  ];

  var MEDALS = [
    { id: 'duelist',   name: 'Duelist',      xp: 10, desc: 'Finished a match' },
    { id: 'victor',    name: 'Victor',       xp: 15, desc: 'Won the match' },
    { id: 'flawless',  name: 'Flawless',     xp: 25, desc: 'Won without losing a round' },
    { id: 'comeback',  name: 'Comeback',     xp: 30, desc: 'Won after being down 0-2' },
    { id: 'sharp',     name: 'Sharpshooter', xp: 15, desc: 'Hit 55% of your shots' },
    { id: 'longshot',  name: 'Long shot',    xp: 15, desc: 'Landed a kill from 12 m or more' },
    { id: 'closecall', name: 'Close call',   xp: 15, desc: 'Won a round on 20 HP or less' },
    { id: 'untouched', name: 'Untouched',    xp: 20, desc: 'Won a round without taking damage' },
    { id: 'gritty',    name: 'Gritty',       xp: 10, desc: 'Took a round in a lost match' }
  ];

  function num(v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0; }
  function keyOf(slot, id) { return slot + ':' + id; }
  function isOnline(mode) { return !!mode && mode !== 'solo'; }

  function item(slot, id) {
    var list = SL.COSMETICS[slot] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function buildTrack() {
    var out = [], seen = {};
    TRACK_ORDER.forEach(function (p) {
      var it = item(p[0], p[1]);
      if (it && it.req !== null && it.req !== undefined && !seen[keyOf(p[0], p[1])]) { seen[keyOf(p[0], p[1])] = 1; out.push({ slot: p[0], id: p[1] }); }
    });
    SLOTS.forEach(function (slot) {
      (SL.COSMETICS[slot] || []).forEach(function (it) {
        if (it.req && !seen[keyOf(slot, it.id)]) { seen[keyOf(slot, it.id)] = 1; out.push({ slot: slot, id: it.id }); }
      });
    });
    return out;
  }
  var TRACK = buildTrack();

  function copyEquip(e) {
    var o = {};
    SLOTS.forEach(function (s) { o[s] = e && e[s] ? e[s] : SL.DEFAULT_EQUIP[s]; });
    return o;
  }

  function blank() {
    var kills = {}, medals = {};
    (SL.WEAPON_ORDER || []).forEach(function (w) { kills[w] = 0; });
    MEDALS.forEach(function (m) { medals[m.id] = 0; });
    return {
      v: DATA_V, xp: 0, matches: 0, wins: 0, winDiff: { easy: 0, normal: 0, hard: 0 },
      flawless: 0, online: 0, onlineWins: 0, kills: kills, medals: medals,
      unlocked: {}, trackLevel: 1, equip: copyEquip(SL.DEFAULT_EQUIP)
    };
  }

  /* Does the profile data `d` satisfy requirement `req`? */
  function meets(d, req) {
    if (!req) return true;
    switch (req.kind) {
      case 'wins': return d.wins >= (req.n || 1);
      case 'matches': return d.matches >= (req.n || 1);
      case 'flawless': return d.flawless >= (req.n || 1);
      case 'online': return d.online >= (req.n || 1);
      case 'xp': return d.xp >= (req.n || 0);
      case 'kills': return num(d.kills[req.weapon]) >= (req.n || 1);
      case 'winDiff': {
        var from = DIFF_ORDER.indexOf(req.diff); // a win on a harder difficulty also counts
        if (from < 0) return false;
        for (var i = from; i < DIFF_ORDER.length; i++) if (num(d.winDiff[DIFF_ORDER[i]]) >= (req.n || 1)) return true;
        return false;
      }
      default: return false;
    }
  }

  function levelOf(xp) { return Math.floor(num(xp) / LEVEL_XP) + 1; }

  var P = SL.profile = {
    data: blank(),
    equip: copyEquip(SL.DEFAULT_EQUIP),
    SLOTS: SLOTS,
    LEVEL_XP: LEVEL_XP,
    MEDALS: MEDALS,
    TRACK: TRACK
  };

  P.item = item;
  P.levelOf = levelOf;
  P.medal = function (id) { for (var i = 0; i < MEDALS.length; i++) if (MEDALS[i].id === id) return MEDALS[i]; return null; };

  P.isUnlocked = function (slot, id) {
    var it = item(slot, id);
    if (!it) return false;
    return !it.req || !!P.data.unlocked[keyOf(slot, id)];
  };

  function nextTrackItems() {
    return TRACK.filter(function (t) { return !P.data.unlocked[keyOf(t.slot, t.id)]; });
  }

  /* Grant everything the data now entitles: achievements first, then one track item per new level. */
  function grant() {
    var d = P.data, out = [];
    SLOTS.forEach(function (slot) {
      (SL.COSMETICS[slot] || []).forEach(function (it) {
        var k = keyOf(slot, it.id);
        if (it.req && !d.unlocked[k] && meets(d, it.req)) {
          d.unlocked[k] = true;
          out.push({ slot: slot, id: it.id, name: it.name, via: 'achievement', hint: it.hint || '' });
        }
      });
    });
    var lvl = levelOf(d.xp);
    while (d.trackLevel < lvl) {
      d.trackLevel++;
      var next = nextTrackItems()[0];
      if (next) {
        d.unlocked[keyOf(next.slot, next.id)] = true;
        out.push({ slot: next.slot, id: next.id, name: item(next.slot, next.id).name, via: 'level', level: d.trackLevel });
      }
    }
    return out;
  }

  P.load = function () {
    var raw = SL.store.get(KEY, null);
    var d = blank();
    if (raw && typeof raw === 'object') {
      ['xp', 'matches', 'wins', 'flawless', 'online', 'onlineWins'].forEach(function (k) { d[k] = num(raw[k]); });
      if (raw.winDiff) DIFF_ORDER.forEach(function (k) { d.winDiff[k] = num(raw.winDiff[k]); });
      if (raw.kills) Object.keys(raw.kills).forEach(function (k) { d.kills[k] = num(raw.kills[k]); });
      if (raw.medals) Object.keys(d.medals).forEach(function (k) { d.medals[k] = num(raw.medals[k]); });
      if (raw.unlocked && typeof raw.unlocked === 'object') {
        Object.keys(raw.unlocked).forEach(function (k) {
          var p = k.split(':');
          if (raw.unlocked[k] && p.length === 2 && item(p[0], p[1])) d.unlocked[k] = true;
        });
      }
      d.trackLevel = Math.max(1, num(raw.trackLevel) | 0) || 1;
      if (raw.equip) d.equip = copyEquip(raw.equip);
    }
    P.data = d;
    /* Migration: silently grant whatever the level and eased achievements entitle (no reveals). */
    grant();
    /* Keep the same equip object so units holding a reference see changes. */
    SLOTS.forEach(function (slot) {
      var id = d.equip[slot];
      P.equip[slot] = P.isUnlocked(slot, id) ? id : SL.DEFAULT_EQUIP[slot];
    });
    d.equip = P.equip;
    d.v = DATA_V;
    if (raw) P.save();
    return d;
  };

  P.save = function () { SL.store.set(KEY, P.data); };

  P.setEquip = function (slot, id) {
    if (SLOTS.indexOf(slot) < 0 || !P.isUnlocked(slot, id)) return false;
    P.equip[slot] = id;
    P.save();
    return true;
  };

  /* Level info for an XP total: { level, into, need, frac }. */
  P.levelInfo = function (xp) {
    xp = num(xp);
    var level = levelOf(xp), into = xp - (level - 1) * LEVEL_XP;
    return { level: level, into: into, need: LEVEL_XP, frac: into / LEVEL_XP };
  };

  /* Next item on the reward track and the level that grants it, or null when the locker is complete. */
  P.nextReward = function () {
    var n = nextTrackItems()[0];
    if (!n) return null;
    return { slot: n.slot, id: n.id, name: item(n.slot, n.id).name, level: P.data.trackLevel + 1 };
  };

  /* Level at which a locked item arrives from the track if nothing else unlocks first (0 if unlocked/not on it). */
  P.trackLevelFor = function (slot, id) {
    if (P.isUnlocked(slot, id)) return 0;
    var rest = nextTrackItems();
    for (var i = 0; i < rest.length; i++) if (rest[i].slot === slot && rest[i].id === id) return P.data.trackLevel + 1 + i;
    return 0;
  };

  P.counts = function () {
    var total = 0, have = 0;
    SLOTS.forEach(function (slot) {
      (SL.COSMETICS[slot] || []).forEach(function (it) { total++; if (P.isUnlocked(slot, it.id)) have++; });
    });
    return { have: have, total: total };
  };
  P.isComplete = function () { var c = P.counts(); return c.have >= c.total; };

  P.multFor = function (result) {
    return isOnline(result.mode) ? ONLINE_MULT : (MULT[result.diff] || 1);
  };

  /* Medals for a finished match. result.rounds = [{ w: 'p'|'b'|null, hp, taken }] in play order (optional). */
  P.medalsFor = function (result) {
    var ids = ['duelist'];
    var won = !!result.won, rp = num(result.roundsP), rb = num(result.roundsB);
    var st = result.stats || {}, rounds = result.rounds || [];
    if (won) ids.push('victor');
    if (won && rb === 0 && rp > 0) ids.push('flawless');
    if (won) {
      var p = 0, b = 0, down = false;
      rounds.forEach(function (r) { if (r.w === 'p') p++; else if (r.w === 'b') b++; if (p === 0 && b >= 2) down = true; });
      if (down) ids.push('comeback');
    }
    if (num(st.shots) >= SHARP_MIN_SHOTS && num(st.hits) / num(st.shots) >= SHARP_ACC) ids.push('sharp');
    if (num(st.longest) >= LONG_SHOT_M) ids.push('longshot');
    if (rounds.some(function (r) { return r.w === 'p' && num(r.hp) > 0 && num(r.hp) <= CLOSE_CALL_HP; })) ids.push('closecall');
    if (rounds.some(function (r) { return r.w === 'p' && num(r.taken) <= 0; })) ids.push('untouched');
    if (!won && rp > 0) ids.push('gritty');
    return ids.map(function (id) { var m = P.medal(id); return { id: id, name: m.name, xp: m.xp, desc: m.desc }; });
  };

  /* result = { won, diff, mode, roundsP, roundsB, stats:{shots,hits,dmgDealt,dmgTaken,kills,longest},
                killsBy?:{weapon:n}, rounds?:[{w,hp,taken}] }
     Returns { xp, base, mult, breakdown:[{label,xp}], medals:[{id,name,xp,desc}], xpBefore, xpAfter,
               levelBefore, levelAfter, unlocked:[{slot,id,name,via,level?,hint?}], complete, next } */
  P.award = function (result) {
    result = result || {};
    var d = P.data;
    var online = isOnline(result.mode);
    var rp = num(result.roundsP), won = !!result.won;
    var xpBefore = d.xp, levelBefore = levelOf(d.xp);

    var base = XP_FINISH + XP_ROUND * rp + (won ? XP_WIN : 0);
    var mult = P.multFor(result);
    var multBonus = Math.round(base * mult) - base;
    var medals = P.medalsFor(result);
    var medalXp = medals.reduce(function (s, m) { return s + m.xp; }, 0);
    var gain = base + multBonus + medalXp;

    var breakdown = [{ label: 'Match finished', xp: XP_FINISH }];
    if (rp > 0) breakdown.push({ label: 'Rounds won x' + rp, xp: XP_ROUND * rp });
    if (won) breakdown.push({ label: 'Match win', xp: XP_WIN });
    if (multBonus > 0) {
      var diffLabel = online ? 'Online' : (SL.DIFF[result.diff] ? SL.DIFF[result.diff].label : 'Bonus');
      breakdown.push({ label: diffLabel + ' x' + mult, xp: multBonus });
    }
    breakdown.push({ label: 'Medals x' + medals.length, xp: medalXp });

    d.xp += gain;
    d.matches += 1;
    if (online) d.online += 1;
    if (won) {
      d.wins += 1;
      if (online) d.onlineWins += 1;
      else if (d.winDiff[result.diff] != null) d.winDiff[result.diff] += 1;
      if (num(result.roundsB) === 0) d.flawless += 1;
    }
    medals.forEach(function (m) { d.medals[m.id] = num(d.medals[m.id]) + 1; });
    if (result.killsBy) {
      Object.keys(result.killsBy).forEach(function (w) { d.kills[w] = num(d.kills[w]) + num(result.killsBy[w]); });
    } else if (result.stats && result.stats.weapon) {
      d.kills[result.stats.weapon] = num(d.kills[result.stats.weapon]) + num(result.stats.kills);
    }

    var unlocked = grant();
    P.save();
    return {
      xp: gain, base: base, mult: mult, breakdown: breakdown, medals: medals,
      xpBefore: xpBefore, xpAfter: d.xp, levelBefore: levelBefore, levelAfter: levelOf(d.xp),
      unlocked: unlocked, complete: P.isComplete(), next: P.nextReward()
    };
  };

  P.load();
})(window.SL);
