/* Sandline Duel: player profile (contract v2). XP, counters, cosmetic unlocks and equip, saved via SL.store
   under 'sl.v1.profile'. Loads itself on script evaluation so SL.profile.equip exists before main.js boots. */
'use strict';
(function (SL) {
  var KEY = 'sl.v1.profile';
  var DIFF_ORDER = ['easy', 'normal', 'hard'];
  var SLOTS = ['headgear', 'trim', 'tracer', 'killfx'];
  var LEVEL_XP = 300; // XP per level (flat, easy to read on the results bar)

  function blank() {
    var kills = {};
    (SL.WEAPON_ORDER || []).forEach(function (w) { kills[w] = 0; });
    return {
      v: 1,
      xp: 0,
      matches: 0,
      wins: 0,
      winDiff: { easy: 0, normal: 0, hard: 0 },
      flawless: 0,
      online: 0,
      onlineWins: 0,
      kills: kills,
      equip: copyEquip(SL.DEFAULT_EQUIP)
    };
  }

  function copyEquip(e) {
    var o = {};
    SLOTS.forEach(function (s) { o[s] = e && e[s] ? e[s] : SL.DEFAULT_EQUIP[s]; });
    return o;
  }

  function num(v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0; }

  function item(slot, id) {
    var list = SL.COSMETICS[slot] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
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
        /* A win on a harder difficulty also counts. */
        var from = DIFF_ORDER.indexOf(req.diff);
        if (from < 0) return false;
        for (var i = from; i < DIFF_ORDER.length; i++) if (num(d.winDiff[DIFF_ORDER[i]]) >= (req.n || 1)) return true;
        return false;
      }
      default: return false;
    }
  }

  function unlockedSet(d) {
    var set = {};
    SLOTS.forEach(function (slot) {
      (SL.COSMETICS[slot] || []).forEach(function (it) { if (meets(d, it.req)) set[slot + ':' + it.id] = true; });
    });
    return set;
  }

  var P = SL.profile = {
    data: blank(),
    equip: copyEquip(SL.DEFAULT_EQUIP),
    SLOTS: SLOTS,
    LEVEL_XP: LEVEL_XP
  };

  P.load = function () {
    var raw = SL.store.get(KEY, null);
    var d = blank();
    if (raw && typeof raw === 'object') {
      ['xp', 'matches', 'wins', 'flawless', 'online', 'onlineWins'].forEach(function (k) { d[k] = num(raw[k]); });
      if (raw.winDiff) DIFF_ORDER.forEach(function (k) { d.winDiff[k] = num(raw.winDiff[k]); });
      if (raw.kills) Object.keys(d.kills).forEach(function (k) { d.kills[k] = num(raw.kills[k]); });
      if (raw.equip) d.equip = copyEquip(raw.equip);
    }
    P.data = d;
    /* Keep the same equip object so units holding a reference see changes. */
    SLOTS.forEach(function (slot) {
      var id = d.equip[slot];
      P.equip[slot] = item(slot, id) && meets(d, item(slot, id).req) ? id : SL.DEFAULT_EQUIP[slot];
    });
    d.equip = P.equip;
    return d;
  };

  P.save = function () { SL.store.set(KEY, P.data); };

  P.isUnlocked = function (slot, id) {
    var it = item(slot, id);
    return !!it && meets(P.data, it.req);
  };

  P.setEquip = function (slot, id) {
    if (SLOTS.indexOf(slot) < 0 || !P.isUnlocked(slot, id)) return false;
    P.equip[slot] = id;
    P.save();
    return true;
  };

  /* Level info for an XP total: { level, into, need, frac }. */
  P.levelInfo = function (xp) {
    xp = num(xp);
    var level = Math.floor(xp / LEVEL_XP) + 1, into = xp - (level - 1) * LEVEL_XP;
    return { level: level, into: into, need: LEVEL_XP, frac: into / LEVEL_XP };
  };

  /* XP for a finished match. 10 per round won, 25 for the match win, x1.5 on Hard (solo), x1.25 online. */
  P.xpFor = function (result) {
    var base = 10 * num(result.roundsP) + (result.won ? 25 : 0);
    var online = result.mode && result.mode !== 'solo';
    var mul = online ? 1.25 : (result.diff === 'hard' ? 1.5 : 1);
    return Math.round(base * mul);
  };

  /* result = { won, diff, mode, roundsP, roundsB, stats, killsBy? }
     killsBy (optional) = { weaponId: kills } for this match; without it, stats.kills goes to stats.weapon if given. */
  P.award = function (result) {
    result = result || {};
    var d = P.data;
    var before = unlockedSet(d);
    var xpBefore = d.xp;
    var gain = P.xpFor(result);
    var online = result.mode && result.mode !== 'solo';

    d.xp += gain;
    d.matches += 1;
    if (online) d.online += 1;
    if (result.won) {
      d.wins += 1;
      if (online) d.onlineWins += 1;
      else if (d.winDiff[result.diff] != null) d.winDiff[result.diff] += 1;
      if (num(result.roundsB) === 0) d.flawless += 1;
    }
    if (result.killsBy) {
      Object.keys(result.killsBy).forEach(function (w) {
        if (d.kills[w] == null) d.kills[w] = 0;
        d.kills[w] += num(result.killsBy[w]);
      });
    } else if (result.stats && result.stats.weapon && d.kills[result.stats.weapon] != null) {
      d.kills[result.stats.weapon] += num(result.stats.kills);
    }

    var after = unlockedSet(d);
    var unlocked = [];
    SLOTS.forEach(function (slot) {
      (SL.COSMETICS[slot] || []).forEach(function (it) {
        var k = slot + ':' + it.id;
        if (after[k] && !before[k]) unlocked.push({ slot: slot, id: it.id, name: it.name });
      });
    });
    P.save();
    return { xp: gain, unlocked: unlocked, xpBefore: xpBefore, xpAfter: d.xp };
  };

  P.load();
})(window.SL);
