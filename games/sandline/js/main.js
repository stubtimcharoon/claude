/* Sandline Duel: shell (contract v2). Boot, match state machine (solo + online host), guest UI follower,
   input (floating joystick, keyboard, dash), HUD, overlays (menu, lobby, join, pick, results), modals
   (locker, settings, how to play), stats tracking and profile awards.
   main.js writes SL.G.state/round/score/roundT/stateT/mode/flip/timeScale; on the guest, net.js writes the
   match fields from host snapshots and main.js only follows them. */
'use strict';
(function (SL) {
  var G = SL.G, C = SL.C, PI = Math.PI;
  var JOY_R = 56, DEADZONE = 0.12;
  var COUNTDOWN_T = 3, ROUND_END_T = 2.6, GO_T = 0.7;
  var SLOW_T = 0.35, SLOW_SCALE = 0.25, LOW_HP = 35, FEED_T = 3, LOST_T = 2.2;
  var RING_C = 2 * PI * 35;
  var K_SETTINGS = 'sl.v1.settings', K_HOWTO = 'sl.v1.howto';
  var SLOT_LABEL = { headgear: 'Headgear', trim: 'Trim', tracer: 'Tracer', killfx: 'Kill effect' };
  var MATCH_STATES = { pick: 1, countdown: 1, live: 1, roundEnd: 1 };

  var el = {};
  var settings = { diff: 'normal', music: true, sfx: true };
  var netOk = false, panel = null, modal = null, modalReturn = null, docHidden = false;
  var uiState = null, uiT = 0, frames = 0;
  var pickMode = 'blind', botFirst = null, botWeapon = 'rifle', lastPick = null, myPick = null, pickedRound = 0;
  var rematchN = 0, rematchSent = false, nextPing = 0, peerEquipKey = '';
  var cdShown = 0, bannerT = 0, slowT = 0, lostT = 0, feedT = 0, toastT = 0;
  var vig = 0, dmgT = 0, dashReady = null;
  var scoreAt = { p: 0, b: 0 };
  var rs = blankRound(), ms = blankMatch();
  var xpAnim = null, unlockCards = [], unlockIdx = 0, unlockT = 0, lockerDoneShow = false;
  var lockerSlot = 'headgear';
  var hud = {};
  var errOnce = {};
  var last = 0;
  var musicNow = null;

  function $(id) { return document.getElementById(id); }
  function blankRound() { return { dealt: 0, taken: 0, shots: 0, hits: 0 }; }
  function blankMatch() { return { dealt: 0, taken: 0, shots: 0, hits: 0, kills: 0, longest: 0, flawless: 0, killsBy: {}, rounds: [] }; }
  function logOnce(key, e) { if (!errOnce[key]) { errOnce[key] = true; console.error(e); } }
  function online() { return G.mode === 'host' || G.mode === 'guest'; }
  function inMatch() { return !!MATCH_STATES[G.state]; }
  function foeName() { return online() ? 'Rival' : 'Bot'; }
  function wname(id) { return SL.WEAPONS[id] ? SL.WEAPONS[id].name : ''; }
  function validW(id) { return SL.WEAPONS[id] ? id : 'rifle'; }
  function hex(c) { return '#' + ('000000' + (c >>> 0).toString(16)).slice(-6); }
  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  /* ---------- audio + ui sounds ---------- */
  function audioInit() { try { if (SL.audio && SL.audio.init) SL.audio.init(); } catch (e) { logOnce('audioInit', e); } }
  function music(name) {
    if (musicNow === name) return;
    musicNow = name;
    try { if (SL.audio && SL.audio.music) SL.audio.music(name); } catch (e) { logOnce('music', e); }
  }
  function ui(kind, id) { SL.emit('ui', { kind: kind, id: id }); }
  function setBus(bus, on) {
    settings[bus] = !!on;
    try { if (SL.audio && SL.audio.setBus) SL.audio.setBus(bus, !!on); } catch (e) { logOnce('bus', e); }
    SL.store.set(K_SETTINGS, settings);
    var t = bus === 'music' ? el.musicToggle : el.sfxToggle;
    if (t) t.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  /* ---------- state ---------- */
  function setState(s, winner) {
    G.state = s;
    G.stateT = 0;
    SL.emit('round', { phase: s, winner: winner === undefined ? null : winner });
  }

  function showOverlays() {
    var s = G.state;
    el.menu.hidden = s !== 'menu';
    el.lobby.hidden = !(s === 'lobby' && panel === 'host');
    el.join.hidden = !(s === 'lobby' && panel === 'join');
    el.pick.hidden = s !== 'pick';
    el.end.hidden = s !== 'matchEnd';
  }

  function focusSoon(node) {
    if (!node || modal) return;
    try { node.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  /* ---------- banner, feed, toast ---------- */
  function showBanner(main, sub, tone, dur, stamp) {
    el.bannerMain.textContent = main;
    el.bannerSub.textContent = sub || '';
    el.banner.setAttribute('data-tone', tone || '');
    el.banner.classList.toggle('stamp', !!stamp);
    el.banner.classList.remove('pop');
    void el.banner.offsetWidth; // restart the animation
    el.banner.classList.add('pop', 'show');
    bannerT = dur || 0; // 0 = stays until replaced or hidden
  }
  function hideBanner() { el.banner.classList.remove('show', 'pop'); bannerT = 0; }
  function hideSummary() { el.summary.classList.remove('show'); }

  function feed(parts) {
    el.feed.textContent = '';
    var box = document.createElement('span');
    parts.forEach(function (p) {
      var s = document.createElement('span');
      if (typeof p === 'string') { box.appendChild(document.createTextNode(p)); return; }
      s.className = p.c; s.textContent = p.t; s.style.padding = '0'; s.style.border = '0'; s.style.background = 'none';
      box.appendChild(s);
    });
    el.feed.appendChild(box);
    el.feed.classList.add('show');
    feedT = FEED_T;
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    toastT = 2.4;
  }

  /* ---------- scene ---------- */
  function freshStats(u) { u.stats = { shots: 0, hits: 0, dmgDealt: 0, dmgTaken: 0, kills: 0, longest: 0 }; }

  function resetScene() {
    SL.combat.resetUnit(G.player, SL.world.spawnP, -PI / 2, validW(lastPick || G.playerWeapon));
    SL.combat.resetUnit(G.bot, SL.world.spawnB, PI / 2, 'rifle');
    G.bot.equip = SL.DEFAULT_EQUIP;
    peerEquipKey = '';
    try { SL.bot.reset(G.bot, G.diff); } catch (e) { logOnce('botReset', e); }
    slowT = 0; G.timeScale = 1;
  }

  /* ---------- solo + host state machine ---------- */
  function goMenu() {
    G.mode = 'solo'; G.flip = false;
    G.round = 1; G.scoreP = 0; G.scoreB = 0; G.roundT = C.ROUND_TIME; G.lastRoundWinner = null;
    panel = null; lostT = 0;
    resetScene();
    setState('menu');
  }

  function startMatch() {
    G.round = 1; G.scoreP = 0; G.scoreB = 0; G.lastRoundWinner = null;
    goPick();
  }

  function goPick() {
    G.roundT = C.ROUND_TIME;
    pickMode = online() ? 'online' : 'blind';
    botFirst = null;
    /* Picks are always blind: neither side learns the other's gun until it sees it in a fight. */
    SL.combat.resetUnit(G.player, SL.world.spawnP, -PI / 2, validW(myPick || G.playerWeapon));
    if (G.mode === 'solo') SL.combat.resetUnit(G.bot, SL.world.spawnB, PI / 2, validW(botFirst || botWeapon));
    setState('pick');
  }

  function choose(id) {
    if (G.state !== 'pick' || pickedRound === G.round || !SL.WEAPONS[id] || lostT > 0) return;
    ui('card', id);
    lastPick = id; myPick = id; G.playerWeapon = id; pickedRound = G.round;
    if (G.mode === 'solo') {
      var bw = SL.bot.pickWeapon(G.diff, null);
      startCountdown(id, bw);
    } else {
      try { SL.net.setLocal({ pick: { r: G.round, w: id } }); } catch (e) { logOnce('setPick', e); }
      refreshPick();
    }
  }

  function startCountdown(pw, bw) {
    botWeapon = validW(bw);
    SL.combat.resetUnit(G.player, SL.world.spawnP, -PI / 2, validW(pw));
    SL.combat.resetUnit(G.bot, SL.world.spawnB, PI / 2, botWeapon);
    if (G.mode === 'solo') SL.bot.reset(G.bot, G.diff);
    G.roundT = C.ROUND_TIME;
    nextPing = C.STALL_FROM;
    setState('countdown');
  }

  function endRound(winner) {
    if (G.state !== 'live') return;
    if (winner === 'p') G.scoreP++;
    else if (winner === 'b') G.scoreB++;
    G.lastRoundWinner = winner;
    setState('roundEnd', winner);
  }

  function finishRound() {
    if (G.scoreP >= C.WIN || G.scoreB >= C.WIN) setState('matchEnd', G.scoreP > G.scoreB ? 'p' : 'b');
    else { G.round++; goPick(); }
  }

  function machine(rdt, dt) {
    G.stateT += rdt;
    var peer;
    switch (G.state) {
      case 'lobby':
        if (G.mode === 'host' && SL.net && SL.net.status === 'connected') startMatch();
        break;
      case 'pick':
        if (G.mode === 'host' && pickedRound === G.round) {
          peer = SL.net.peerInfo();
          var pk = peer && peer.pick;
          if (pk && pk.r === G.round && SL.WEAPONS[pk.w]) startCountdown(myPick, pk.w);
        }
        break;
      case 'countdown':
        if (G.stateT >= COUNTDOWN_T) setState('live');
        break;
      case 'live':
        G.roundT = Math.max(0, G.roundT - dt);
        if (G.roundT <= C.STALL_FROM && G.roundT <= nextPing && G.roundT > 0) {
          nextPing -= C.STALL_EVERY;
          [G.player, G.bot].forEach(function (u) { if (u.alive) SL.emit('ping', { u: u, x: u.x, z: u.z }); });
        }
        if (G.roundT <= 0) {
          var hp = G.player.hp, hb = G.bot.hp;
          endRound(hp > hb ? 'p' : hb > hp ? 'b' : null);
        }
        break;
      case 'roundEnd':
        if (G.stateT >= ROUND_END_T) finishRound();
        break;
      case 'matchEnd':
        if (G.mode === 'host' && rematchSent) {
          peer = SL.net.peerInfo();
          if (peer && peer.rematch === rematchN) { rematchSent = false; startMatch(); }
        }
        break;
    }
  }

  function simulate(dt) {
    var s = G.state, live = s === 'live', canMove = live || s === 'roundEnd';
    var inp = worldInput();
    if (!canMove) { inp.x = 0; inp.z = 0; inp.mag = 0; }
    if (G.mode === 'guest') {
      if (canMove && G.player.alive) SL.combat.moveOnly(G.player, dt, inp.x, inp.z, inp.mag);
      return;
    }
    SL.combat.updateUnit(G.player, dt, inp.x, inp.z, inp.mag, null, live);
    if (G.mode === 'host') {
      SL.combat.updateUnit(G.bot, dt, 0, 0, 0, null, live, { external: true });
    } else {
      SL.bot.update(G.bot, dt, canMove, live);
      SL.world.separate(G.player, G.bot);
    }
  }

  /* ---------- event hooks ---------- */
  function tracking() { return G.state === 'live' || G.state === 'roundEnd'; }

  SL.on('death', function (ev) {
    if (!ev || !ev.unit) return;
    if (G.state === 'live') slowT = SLOW_T;
    if (tracking()) {
      var P = G.player, killer = ev.killer, dead = ev.unit;
      if (killer === P && dead !== P) {
        var d = Math.sqrt((P.x - dead.x) * (P.x - dead.x) + (P.z - dead.z) * (P.z - dead.z));
        ms.kills++;
        ms.killsBy[P.weapon] = (ms.killsBy[P.weapon] || 0) + 1;
        if (d > ms.longest) ms.longest = d;
        feed([{ c: 'y', t: 'You' }, ' took down ', { c: 'b', t: foeName() }, ' with the ' + wname(P.weapon) + ', ' + Math.round(d) + ' m']);
      } else if (dead === P) {
        var k = killer || G.bot;
        feed([{ c: 'b', t: foeName() }, ' took you down']);
      }
    }
    if (G.mode !== 'guest' && G.state === 'live') {
      var w;
      if (ev.killer) w = ev.killer === G.player ? 'p' : 'b';
      else w = ev.unit === G.player ? 'b' : 'p';
      endRound(w);
    }
  });

  SL.on('damage', function (ev) {
    if (!ev) return;
    var amt = Math.min(C.HP, Math.max(0, ev.amount || 0)); // overkill is not damage dealt
    if (tracking()) {
      if (ev.attacker === G.player && ev.target !== G.player) { rs.dealt += amt; ms.dealt += amt; }
      if (ev.target === G.player) { rs.taken += amt; ms.taken += amt; }
    }
    if (ev.target === G.player) {
      vig = Math.min(1, Math.max(vig, 0.45 + amt / 80));
      dmgT = 0.9;
      try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* ignore */ }
    }
  });

  SL.on('shot', function (ev) {
    if (!ev || ev.u !== G.player || !tracking()) return;
    var n = 1, h = 0;
    if (ev.tracers && ev.tracers.length) {
      n = ev.tracers.length;
      for (var i = 0; i < n; i++) if (ev.tracers[i].hit) h++;
    }
    rs.shots += n; rs.hits += h; ms.shots += n; ms.hits += h;
  });

  SL.on('ping', function (ev) {
    if (ev && ev.u === G.player && G.state === 'live') feed(['Stalemate. Both positions revealed']);
  });

  /* ---------- UI follower (all modes): reacts to state changes ---------- */
  function onEnter(s, prev) {
    el.app.setAttribute('data-state', s);
    el.app.setAttribute('data-mode', G.mode);
    showOverlays();
    if (s !== 'live' && s !== 'countdown' && s !== 'roundEnd') releaseJoy();
    switch (s) {
      case 'menu':
        hideBanner(); hideSummary();
        music('menu');
        refreshMenu();
        focusSoon(el.playBtn);
        break;
      case 'lobby':
        hideBanner(); hideSummary();
        music('menu');
        break;
      case 'pick':
        hideBanner(); hideSummary();
        if (G.round === 1 && prev !== 'pick') matchStart();
        refreshPick();
        focusSoon(firstPickable());
        break;
      case 'countdown':
        roundStart();
        break;
      case 'live':
        showBanner('Go', '', 'you', GO_T, false);
        ui('go');
        break;
      case 'roundEnd':
        roundEndUi();
        break;
      case 'matchEnd':
        hideBanner(); hideSummary();
        music('off');
        showResults();
        break;
    }
  }

  function matchStart() {
    ms = blankMatch();
    freshStats(G.player); freshStats(G.bot);
    pickedRound = 0;
    rematchSent = false;
    el.rematchStatus.textContent = '';
    music('round');
  }

  function roundStart() {
    rs = blankRound();
    scoreAt.p = G.scoreP; scoreAt.b = G.scoreB;
    if (G.mode === 'guest') {
      var peer = null;
      try { peer = SL.net.peerInfo(); } catch (e) { /* ignore */ }
      var pw = peer && peer.pick && SL.WEAPONS[peer.pick.w] ? peer.pick.w : G.bot.weapon;
      botWeapon = validW(pw); // display only: net applies units from the host snapshot
    }
    cdShown = COUNTDOWN_T;
    showBanner(String(cdShown), 'Get ready', 'sand', 0, true);
    ui('tick');
  }

  function roundEndUi() {
    var winner = G.scoreP > scoreAt.p ? 'p' : G.scoreB > scoreAt.b ? 'b' : null;
    var timeUp = G.player.alive && G.bot.alive;
    var main = winner === 'p' ? 'Round won' : winner === 'b' ? 'Round lost' : 'Draw';
    var tone = winner === 'p' ? 'you' : winner === 'b' ? 'foe' : 'sand';
    var sub;
    if (timeUp) sub = winner === 'p' ? 'Time up. You had more HP' : winner === 'b' ? 'Time up. ' + foeName() + ' had more HP' : 'Time up. Even HP, nobody scores';
    else sub = winner === 'p' ? foeName() + ' down' : winner === 'b' ? 'You went down' : 'Both down';
    showBanner(main, sub, tone, 0, false);
    if (winner === 'p' && rs.taken <= 0) ms.flawless++;
    ms.rounds.push({ w: winner, hp: Math.max(0, Math.ceil(G.player.hp || 0)), taken: Math.round(rs.taken) });
    el.sumDealt.textContent = String(Math.round(rs.dealt));
    el.sumTaken.textContent = String(Math.round(rs.taken));
    el.sumAcc.textContent = rs.shots ? Math.round(100 * rs.hits / rs.shots) + '%' : '-';
    el.summary.classList.add('show');
  }

  function syncUi(rdt) {
    if (G.state !== uiState) {
      var prev = uiState;
      uiState = G.state; uiT = 0;
      onEnter(G.state, prev);
    } else uiT += rdt;

    if (G.state === 'countdown') {
      var n = COUNTDOWN_T - Math.floor(uiT);
      if (n >= 1 && n !== cdShown) {
        cdShown = n;
        showBanner(String(n), 'Get ready', 'sand', 0, true);
        ui('tick');
      }
    }
    if (G.state === 'pick' && G.mode === 'host' && hud.pickPeer !== peerPicked()) { hud.pickPeer = peerPicked(); refreshPick(); }
    if (G.state === 'matchEnd') tickResults(rdt);

    if (bannerT > 0) { bannerT -= rdt; if (bannerT <= 0) hideBanner(); }
    if (feedT > 0) { feedT -= rdt; if (feedT <= 0) el.feed.classList.remove('show'); }
    if (toastT > 0) { toastT -= rdt; if (toastT <= 0) el.toast.classList.remove('show'); }
  }

  function peerPicked() {
    try { var p = SL.net.peerInfo(); return !!(p && p.pick && p.pick.r === G.round); } catch (e) { return false; }
  }

  /* ---------- menu ---------- */
  function refreshMenu() {
    var info = SL.profile.levelInfo(SL.profile.data.xp);
    el.menuLevel.textContent = 'Level ' + info.level;
    el.menuXpFill.style.width = Math.round(info.frac * 100) + '%';
    el.menuXp.textContent = Math.floor(info.into) + ' / ' + info.need + ' XP';
    var next = SL.profile.nextReward();
    el.menuNext.textContent = '';
    if (next) {
      el.menuNext.appendChild(document.createTextNode('Next reward: '));
      var b = document.createElement('b'); b.textContent = itemLabel(next.slot, next.name); el.menuNext.appendChild(b);
      el.menuNext.appendChild(document.createTextNode(' at level ' + next.level));
    } else {
      el.menuNext.textContent = 'Locker complete';
    }
  }

  function itemLabel(slot, name) { return slot === 'trim' || slot === 'tracer' ? name + ' ' + slot : name; }

  function setDiff(key) {
    if (!SL.DIFF[key]) key = 'normal';
    G.diff = key; settings.diff = key;
    SL.store.set(K_SETTINGS, settings);
    var btns = el.diffSeg.querySelectorAll('button[data-diff]');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i].getAttribute('data-diff') === key ? 'true' : 'false');
  }

  function setOnline(ok) {
    netOk = !!ok;
    el.onlineBtns.hidden = !netOk;
    el.onlineNote.hidden = netOk;
    if (!netOk) el.onlineNote.textContent = 'Online play works when this page is opened from a shared Claude link while signed in.';
  }

  function checkOnline() {
    if (!SL.net || typeof SL.net.available !== 'function') { setOnline(false); return; }
    var settled = false;
    var timer = setTimeout(function () { if (!settled) { settled = true; setOnline(false); } }, 8000);
    try {
      SL.net.available().then(function (ok) {
        if (settled) { if (ok) setOnline(true); return; }
        settled = true; clearTimeout(timer); setOnline(ok);
      }, function () { if (!settled) { settled = true; clearTimeout(timer); setOnline(false); } });
    } catch (e) { settled = true; clearTimeout(timer); setOnline(false); }
  }

  /* ---------- online: lobby, join, leave ---------- */
  function sendEquip() {
    try { SL.net.setLocal({ equip: { headgear: SL.profile.equip.headgear, trim: SL.profile.equip.trim, tracer: SL.profile.equip.tracer, killfx: SL.profile.equip.killfx } }); } catch (e) { logOnce('equip', e); }
  }

  function applyPeer() {
    var peer = null;
    try { peer = SL.net.peerInfo(); } catch (e) { return; }
    if (!peer || !peer.equip) return;
    var eq = {}, key = '';
    SL.profile.SLOTS.forEach(function (slot) {
      var id = peer.equip[slot], ok = (SL.COSMETICS[slot] || []).some(function (it) { return it.id === id; });
      eq[slot] = ok ? id : SL.DEFAULT_EQUIP[slot];
      key += eq[slot] + '|';
    });
    if (key !== peerEquipKey) { peerEquipKey = key; G.bot.equip = eq; }
  }

  function hostGame() {
    if (!netOk) return;
    panel = 'host';
    el.lobbyCode.textContent = '-----';
    el.copyBtn.disabled = true;
    setStatus(el.lobbyStatus, 'Creating room', false, true);
    setState('lobby');
    var p;
    try { p = SL.net.host(); } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).then(function (code) {
      if (G.state !== 'lobby' || panel !== 'host') { try { SL.net.leave(); } catch (e) { /* ignore */ } return; }
      G.mode = 'host'; G.flip = false; rematchN = 0;
      el.app.setAttribute('data-mode', G.mode);
      sendEquip();
      el.lobbyCode.textContent = String((SL.net.code && SL.net.code()) || code || '').toUpperCase();
      el.copyBtn.disabled = false;
      setStatus(el.lobbyStatus, 'Waiting for your rival', false, true);
      focusSoon(el.copyBtn);
    }, function (e) {
      console.error(e);
      if (G.state === 'lobby' && panel === 'host') setStatus(el.lobbyStatus, netError(e, 'Could not create a game. Try again in a moment.'), true, false);
    });
  }

  function openJoin() {
    if (!netOk) return;
    panel = 'join';
    el.joinCode.value = '';
    el.joinCode.disabled = false;
    el.joinGo.disabled = true;
    setStatus(el.joinStatus, '', false, false);
    setState('lobby');
    showOverlays();
    try { el.joinCode.focus(); } catch (e) { /* ignore */ }
  }

  function submitJoin(e) {
    if (e) e.preventDefault();
    var code = el.joinCode.value;
    if (code.length !== 5 || G.mode === 'guest') return;
    el.joinGo.disabled = true; el.joinCode.disabled = true;
    setStatus(el.joinStatus, 'Joining', false, true);
    var p;
    try { p = SL.net.join(code); } catch (err) { p = Promise.reject(err); }
    Promise.resolve(p).then(function () {
      if (G.state !== 'lobby' || panel !== 'join') { try { SL.net.leave(); } catch (err) { /* ignore */ } return; }
      G.mode = 'guest'; G.flip = true; rematchN = 0; pickedRound = 0; myPick = null;
      el.app.setAttribute('data-mode', G.mode);
      sendEquip();
      setStatus(el.joinStatus, 'Connected. Waiting for the host', false, true);
    }, function (err) {
      console.error(err);
      if (G.state !== 'lobby' || panel !== 'join') return;
      el.joinCode.disabled = false; el.joinGo.disabled = el.joinCode.value.length !== 5;
      setStatus(el.joinStatus, netError(err, 'No game with that code. Check it and try again.'), true, false);
      try { el.joinCode.focus(); } catch (x) { /* ignore */ }
    });
  }

  var NET_ERR = {
    bad_code: 'Codes are 5 letters and digits. Check it and try again.',
    unavailable: 'Online play is not available in this view.',
    no_host: 'No game with that code. Check it and try again.',
    full: 'That game already has two players.',
    timeout: 'The game did not answer. Check the code and try again.',
    cancelled: 'Join cancelled.',
    not_permitted: 'Online play is not allowed for this account.',
    limit_reached: 'Too many games are open right now. Try again shortly.',
    upstream_error: 'Could not connect. Try again in a moment.'
  };
  function netError(e, fallback) { return (e && NET_ERR[e.code]) || fallback; }

  function setStatus(node, text, err, dots) {
    node.textContent = text;
    node.classList.toggle('err', !!err);
    if (dots) { var d = document.createElement('span'); d.className = 'dots'; node.appendChild(d); }
  }

  function leaveOnline() {
    try { if (SL.net && SL.net.leave) SL.net.leave(); } catch (e) { logOnce('leave', e); }
    goMenu();
  }

  function copyCode() {
    var code = el.lobbyCode.textContent;
    var fallback = function () {
      try {
        var r = document.createRange(); r.selectNodeContents(el.lobbyCode);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      } catch (e) { /* ignore */ }
      toast('Code selected. Copy it from the menu.');
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () { toast('Code copied'); }, fallback);
      } else fallback();
    } catch (e) { fallback(); }
  }

  /* ---------- pick ---------- */
  var GUN_SVG = {
    smg: '<polygon points="8,15 22,13 22,22 10,25"/><rect x="22" y="11" width="44" height="12" rx="2"/><rect x="66" y="14" width="24" height="4" rx="1"/><rect x="45" y="23" width="7" height="12" rx="1"/><rect x="30" y="23" width="7" height="9" rx="1" transform="rotate(12 33 23)"/><rect x="58" y="8" width="5" height="3"/>',
    rifle: '<polygon points="4,15 26,12 26,23 8,28"/><rect x="26" y="11" width="50" height="11" rx="2"/><rect x="76" y="14" width="38" height="4" rx="1"/><rect x="52" y="22" width="8" height="12" rx="1" transform="rotate(-10 56 22)"/><rect x="34" y="22" width="7" height="10" rx="1" transform="rotate(12 37 22)"/><rect x="40" y="6" width="14" height="5" rx="1"/>',
    shotgun: '<polygon points="4,16 28,13 28,23 6,29"/><rect x="28" y="12" width="28" height="11" rx="2"/><rect x="56" y="12" width="60" height="5" rx="1"/><rect x="56" y="18" width="48" height="4" rx="1"/><rect x="66" y="16" width="22" height="8" rx="2"/><rect x="34" y="23" width="7" height="9" rx="1" transform="rotate(12 37 23)"/>',
    sniper: '<polygon points="2,15 30,13 30,23 6,29"/><rect x="30" y="13" width="38" height="9" rx="2"/><rect x="68" y="15" width="50" height="3" rx="1"/><rect x="36" y="4" width="28" height="6" rx="3"/><rect x="42" y="10" width="3" height="3"/><rect x="55" y="10" width="3" height="3"/><rect x="48" y="22" width="7" height="8" rx="1"/><rect x="34" y="22" width="6" height="10" rx="1" transform="rotate(12 37 22)"/><path d="M96 18 L90 32 M96 18 L102 32" stroke="currentColor" stroke-width="2" fill="none"/>'
  };

  function buildCards() {
    el.cards.textContent = '';
    el.cardList = [];
    SL.WEAPON_ORDER.forEach(function (id) {
      var w = SL.WEAPONS[id];
      if (!w) return;
      var dps = w.dmg * w.pellets * (w.pellets > 1 ? 0.75 : 1) / w.rate;
      var stats = [['Range', w.range / 20], ['Damage/sec', dps / 200], ['Mobility', w.speed / 4.6]];
      var note = w.needStill > 0 ? 'Must stand still to fire' : '';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'card';
      b.setAttribute('data-weapon', id);
      b.setAttribute('data-sfx', 'none');
      var label = w.name + '. ' + w.tag + '.' + (note ? ' ' + note + '.' : '');
      var html = '<span class="card-badge"></span>' +
        '<svg class="card-gun" viewBox="0 0 120 36" preserveAspectRatio="xMinYMid meet" fill="currentColor" aria-hidden="true">' + (GUN_SVG[id] || GUN_SVG.rifle) + '</svg>' +
        '<span class="card-name">' + w.name + '</span>' +
        '<span class="card-tag">' + w.tag + '</span>';
      stats.forEach(function (st) {
        var v = SL.clamp(st[1], 0.04, 1);
        html += '<span class="stat"><span class="stat-label">' + st[0] + '</span>' +
          '<span class="stat-bar"><i style="width:' + Math.round(v * 100) + '%"></i></span></span>';
        label += ' ' + st[0] + ' ' + Math.max(1, Math.round(v * 10)) + ' of 10.';
      });
      html += '<span class="card-note">' + note + '</span>';
      b.innerHTML = html;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', function () { choose(id); });
      el.cards.appendChild(b);
      el.cardList.push(b);
    });
  }

  function refreshPick() {
    el.pickTitle.textContent = 'Round ' + G.round;
    el.pickScore.innerHTML = '<small>YOU</small><span class="y">' + G.scoreP + '</span> : <span class="b">' +
      G.scoreB + '</span><small>' + foeName().toUpperCase() + '</small>';
    var picked = pickedRound === G.round;
    var note = el.pickNote;
    note.className = 'pick-note';
    note.textContent = '';
    if (picked && online()) {
      note.classList.add('wait');
      note.textContent = G.mode === 'host' && peerPicked() ? 'Both picked. Starting' : 'Locked in. Waiting for your rival';
      var d = document.createElement('span'); d.className = 'dots'; note.appendChild(d);
    } else if (pickMode === 'botFirst' && botFirst) {
      note.classList.add('threat');
      note.appendChild(document.createTextNode('You lost the last round, so the bot picks first. Bot is taking: '));
      var b = document.createElement('b'); b.textContent = wname(botFirst); note.appendChild(b);
    } else if (pickMode === 'botAfter') {
      note.textContent = 'You took the last round. The bot will counter your pick.';
    } else if (pickMode === 'online') {
      note.textContent = 'Blind pick. You will not know your rival\'s gun until you see it.';
    } else {
      note.textContent = 'Blind pick. You will not know the bot\'s gun until you see it.';
    }
    for (var i = 0; i < el.cardList.length; i++) {
      var card = el.cardList[i], id = card.getAttribute('data-weapon');
      var isFoe = pickMode === 'botFirst' && botFirst === id && !picked;
      var isLast = !picked && !isFoe && id === lastPick;
      card.disabled = picked;
      card.classList.toggle('is-chosen', picked && id === myPick);
      card.classList.toggle('is-last', isLast);
      card.classList.toggle('is-foe', isFoe);
      card.querySelector('.card-badge').textContent = isFoe ? 'Bot pick' : isLast ? 'Last pick' : '';
    }
  }

  function firstPickable() {
    if (!el.cardList.length || pickedRound === G.round) return null;
    for (var i = 0; i < el.cardList.length; i++) if (el.cardList[i].getAttribute('data-weapon') === lastPick) return el.cardList[i];
    return el.cardList[0];
  }

  /* ---------- results ---------- */
  function showResults() {
    var won = G.scoreP > G.scoreB;
    el.endTitle.textContent = won ? 'You win' : (online() ? 'Rival wins' : 'Bot wins');
    el.endTitle.className = 'end-title ' + (won ? 'you' : 'foe');
    el.endP.textContent = String(G.scoreP);
    el.endB.textContent = String(G.scoreB);
    el.endFoeLabel.textContent = foeName();
    el.rAcc.textContent = ms.shots ? Math.round(100 * ms.hits / ms.shots) + '%' : '-';
    el.rDmg.textContent = String(Math.round(ms.dealt));
    el.rLong.textContent = ms.longest > 0 ? Math.round(ms.longest) + ' m' : '-';
    el.rFlaw.textContent = String(ms.flawless);

    var res;
    try {
      res = SL.profile.award({
        won: won, diff: G.diff, mode: G.mode, roundsP: G.scoreP, roundsB: G.scoreB,
        stats: { shots: ms.shots, hits: ms.hits, dmgDealt: ms.dealt, dmgTaken: ms.taken, kills: ms.kills, longest: ms.longest },
        killsBy: ms.killsBy, rounds: ms.rounds
      });
    } catch (e) {
      logOnce('award', e);
      res = { xp: 0, breakdown: [], medals: [], unlocked: [], xpBefore: SL.profile.data.xp, xpAfter: SL.profile.data.xp, complete: SL.profile.isComplete() };
    }
    el.xpGain.textContent = '+' + res.xp + ' XP';

    /* breakdown lines */
    el.xpLines.textContent = '';
    (res.breakdown || []).forEach(function (line) {
      var row = document.createElement('div');
      var dt = document.createElement('dt'); dt.textContent = line.label;
      var dd = document.createElement('dd'); dd.textContent = '+' + line.xp;
      row.appendChild(dt); row.appendChild(dd);
      el.xpLines.appendChild(row);
    });

    /* medal chips */
    el.medals.textContent = '';
    (res.medals || []).forEach(function (m, i) {
      var chip = document.createElement('span');
      chip.className = 'medal medal--' + m.id;
      chip.style.animationDelay = (0.15 + i * 0.12).toFixed(2) + 's';
      chip.title = m.desc;
      chip.setAttribute('role', 'listitem');
      chip.setAttribute('aria-label', m.name + '. ' + m.desc + '. Plus ' + m.xp + ' XP');
      chip.innerHTML = medalIcon(m.id);
      var nm = document.createElement('span'); nm.className = 'm-name'; nm.textContent = m.name;
      var xp = document.createElement('span'); xp.className = 'm-xp'; xp.textContent = '+' + m.xp;
      chip.appendChild(nm); chip.appendChild(xp);
      el.medals.appendChild(chip);
    });

    /* XP bar: animates through every level-up */
    var from = res.xpBefore != null ? res.xpBefore : SL.profile.data.xp - res.xp;
    var to = from + res.xp;
    var crossed = SL.profile.levelOf(to) - SL.profile.levelOf(from);
    var rm = reduced();
    xpAnim = { from: from, to: to, t: 0, delay: rm ? 0 : 0.6, dur: rm ? 0 : SL.clamp(0.9 + 0.45 * crossed, 0.9, 2.6), done: false, shown: SL.profile.levelOf(from) };
    hud.xpLvl = null;
    renderXp(rm ? to : from);

    /* unlock cards (revealed one by one after the bar) */
    el.unlocks.textContent = '';
    unlockCards = [];
    (res.unlocked || []).forEach(function (u) {
      var card = document.createElement('div');
      card.className = 'unlock';
      card.appendChild(swatch(u.slot, u.id));
      var t = document.createElement('div');
      var k = document.createElement('div'); k.className = 'u-kind'; k.textContent = 'New ' + SLOT_LABEL[u.slot].toLowerCase();
      var n = document.createElement('div'); n.className = 'u-name'; n.textContent = u.name;
      var v = document.createElement('div'); v.className = 'u-via';
      v.textContent = u.via === 'level' ? 'Level ' + u.level + ' reward' : (u.hint || 'Achievement');
      t.appendChild(k); t.appendChild(n); t.appendChild(v);
      card.appendChild(t);
      el.unlocks.appendChild(card);
      unlockCards.push(card);
    });
    el.unlocks.hidden = !unlockCards.length;
    unlockIdx = 0; unlockT = 0;
    lockerDoneShow = !!res.complete;
    el.lockerDone.hidden = true;

    el.rematchBtn.disabled = false;
    el.rematchStatus.textContent = '';
    focusSoon(el.rematchBtn);
  }

  function renderXp(xp) {
    var info = SL.profile.levelInfo(xp);
    if (hud.xpLvl !== info.level) { hud.xpLvl = info.level; el.xpLevel.textContent = 'Level ' + info.level; }
    el.xpFill.style.transform = 'scaleX(' + info.frac.toFixed(4) + ')';
    el.xpSub.textContent = Math.floor(info.into) + ' / ' + info.need + ' XP';
  }

  function levelPop() {
    el.xpLevel.classList.remove('pop'); void el.xpLevel.offsetWidth; el.xpLevel.classList.add('pop');
    ui('tick', 'level');
  }

  function tickResults(rdt) {
    if (!xpAnim) return;
    if (!xpAnim.done) {
      xpAnim.t += rdt;
      var k = xpAnim.dur > 0 ? SL.clamp((xpAnim.t - xpAnim.delay) / xpAnim.dur, 0, 1) : 1;
      var e = 1 - Math.pow(1 - k, 2);
      var cur = xpAnim.from + (xpAnim.to - xpAnim.from) * e;
      renderXp(cur);
      var lvl = SL.profile.levelOf(cur);
      if (lvl > xpAnim.shown) { xpAnim.shown = lvl; levelPop(); }
      if (k >= 1) xpAnim.done = true;
      return;
    }
    if (unlockIdx < unlockCards.length) {
      unlockT -= rdt;
      if (unlockT <= 0) {
        unlockCards[unlockIdx].classList.add('in');
        ui('unlock', unlockIdx);
        unlockIdx++;
        unlockT = reduced() ? 0.05 : 0.45;
      }
      return;
    }
    if (lockerDoneShow) { lockerDoneShow = false; el.lockerDone.hidden = false; }
  }

  var MEDAL_SVG = {
    duelist: '<path d="M5 19L17 7M17 7v-3h3M19 19L7 7M7 7V4H4"/>',
    victor: '<path d="M4 8l4 4 4-7 4 7 4-4-2 10H6z"/>',
    flawless: '<path d="M12 3l8 9-8 9-8-9z"/>',
    comeback: '<path d="M4 18c4 0 6-3 7-6s3-6 9-6"/><path d="M16 3l4 3-4 3"/>',
    sharp: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    longshot: '<path d="M3 12h15"/><path d="M14 7l5 5-5 5"/><path d="M3 9v6"/>',
    closecall: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/><path d="M12 8v5"/>',
    untouched: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>',
    gritty: '<path d="M5 20h14"/><path d="M7 20V10l5-6 5 6v10"/>'
  };
  function medalIcon(id) {
    return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (MEDAL_SVG[id] || MEDAL_SVG.duelist) + '</svg>';
  }

  function rematch() {
    if (!online()) { startMatch(); return; }
    if (rematchSent) return;
    rematchN++;
    rematchSent = true;
    try { SL.net.setLocal({ rematch: rematchN, pick: null }); } catch (e) { logOnce('rematch', e); }
    el.rematchBtn.disabled = true;
    setStatus(el.rematchStatus, 'Waiting for your rival', false, true);
  }

  /* ---------- locker ---------- */
  function swatch(slot, id) {
    var s = document.createElement('span');
    s.className = 'swatch';
    s.setAttribute('aria-hidden', 'true');
    var it = (SL.COSMETICS[slot] || []).filter(function (x) { return x.id === id; })[0];
    if (it && typeof it.color === 'number') {
      var dot = document.createElement('i');
      dot.style.background = hex(it.color);
      s.appendChild(dot);
    } else if (slot === 'headgear') {
      s.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 15a8 8 0 0 1 16 0v2H4z"/><path d="M2.5 17h19"/></svg>';
    } else {
      s.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>';
    }
    return s;
  }

  function renderLocker() {
    var tabs = el.lockerTabs.querySelectorAll('[role="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-slot') === lockerSlot;
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[i].tabIndex = on ? 0 : -1;
      if (on) el.lockerItems.setAttribute('aria-labelledby', tabs[i].id);
    }
    var c = SL.profile.counts();
    el.lockerCount.textContent = c.have + ' / ' + c.total;
    el.lockerItems.textContent = '';
    (SL.COSMETICS[lockerSlot] || []).forEach(function (it) {
      var unlocked = SL.profile.isUnlocked(lockerSlot, it.id);
      var equipped = SL.profile.equip[lockerSlot] === it.id;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'item' + (unlocked ? '' : ' locked');
      b.setAttribute('aria-pressed', equipped ? 'true' : 'false');
      if (!unlocked) b.setAttribute('aria-disabled', 'true');
      b.appendChild(swatch(lockerSlot, it.id));
      var txt = document.createElement('span'); txt.className = 'item-text';
      var nm = document.createElement('span'); nm.className = 'item-name'; nm.textContent = it.name;
      var sb = document.createElement('span'); sb.className = 'item-sub';
      var lv = unlocked ? 0 : SL.profile.trackLevelFor(lockerSlot, it.id);
      sb.textContent = unlocked ? (equipped ? 'Equipped' : 'Tap to equip') : (it.hint || 'Locked') + (lv ? ', or reach level ' + lv : '');
      txt.appendChild(nm); txt.appendChild(sb);
      b.appendChild(txt);
      var st = document.createElement('span'); st.className = 'item-state';
      st.textContent = equipped ? 'On' : unlocked ? '' : 'Locked';
      b.appendChild(st);
      b.addEventListener('click', function () {
        if (!unlocked) { toast((it.hint || 'Locked') + (lv ? ', or reach level ' + lv : '')); return; }
        if (SL.profile.setEquip(lockerSlot, it.id)) {
          G.player.equip = SL.profile.equip;
          if (online()) sendEquip();
          renderLocker();
          var again = el.lockerItems.querySelector('[aria-pressed="true"]');
          if (again) try { again.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        }
      });
      el.lockerItems.appendChild(b);
    });
  }

  /* ---------- modals ---------- */
  function openModal(name) {
    if (modal === name) return;
    if (modal) closeModal(true);
    modal = name;
    modalReturn = document.activeElement;
    el[name].hidden = false;
    releaseJoy(); clearKeys();
    if (name === 'settings') {
      var match = inMatch();
      el.leaveBtn.hidden = !match;
      el.settingsDone.textContent = match ? 'Resume' : 'Done';
      el.musicToggle.setAttribute('aria-checked', settings.music ? 'true' : 'false');
      el.sfxToggle.setAttribute('aria-checked', settings.sfx ? 'true' : 'false');
    }
    if (name === 'locker') renderLocker();
    updatePause();
    var first = el[name].querySelector(name === 'locker' ? '[role="tab"][aria-selected="true"]' : 'button');
    if (name === 'howto') first = el.howDone;
    try { if (first) first.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function closeModal(silent) {
    if (!modal) return;
    var name = modal;
    el[name].hidden = true;
    modal = null;
    if (name === 'howto') SL.store.set(K_HOWTO, true);
    updatePause();
    if (!silent && modalReturn && document.contains(modalReturn)) {
      try { modalReturn.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    modalReturn = null;
  }

  function trapTab(e) {
    var box = el[modal];
    var f = Array.prototype.filter.call(box.querySelectorAll('button, input, [tabindex]'), function (n) {
      return !n.disabled && n.tabIndex >= 0 && n.offsetParent !== null;
    });
    if (!f.length) return;
    var i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
  }

  function updatePause() {
    G.paused = docHidden || (!!modal && G.mode === 'solo' && inMatch());
  }

  /* ---------- input: floating joystick ---------- */
  var joy = { id: null, ox: 0, oy: 0, vx: 0, vz: 0 };

  function joyAllowed() {
    var s = G.state;
    return !G.paused && !modal && lostT <= 0 && (s === 'live' || s === 'countdown' || s === 'roundEnd');
  }
  function drawJoy(kx, ky) {
    el.joyBase.style.transform = 'translate3d(' + joy.ox + 'px,' + joy.oy + 'px,0)';
    el.joyKnob.style.transform = 'translate3d(' + (joy.ox + kx) + 'px,' + (joy.oy + ky) + 'px,0)';
  }
  function moveJoy(x, y) {
    var dx = x - joy.ox, dy = y - joy.oy, d = Math.sqrt(dx * dx + dy * dy);
    if (d > JOY_R) { // origin follows the finger
      var k = (d - JOY_R) / d;
      joy.ox += dx * k; joy.oy += dy * k;
      dx = x - joy.ox; dy = y - joy.oy; d = JOY_R;
    }
    var m = d / JOY_R;
    if (m < DEADZONE || d < 1e-6) { joy.vx = 0; joy.vz = 0; }
    else {
      var s = ((m - DEADZONE) / (1 - DEADZONE)) / d;
      joy.vx = dx * s; joy.vz = dy * s; // screen right = +x, screen down = +z
    }
    drawJoy(dx, dy);
  }
  function releaseJoy() {
    var id = joy.id;
    joy.id = null; joy.vx = 0; joy.vz = 0;
    if (id !== null && el.game) {
      try { if (el.game.hasPointerCapture(id)) el.game.releasePointerCapture(id); } catch (e) { /* ignore */ }
    }
    if (el.joy) el.joy.hidden = true;
  }
  function onDown(e) {
    if (joy.id !== null || !joyAllowed()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.vx = 0; joy.vz = 0;
    try { el.game.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    drawJoy(0, 0);
    el.joy.hidden = false;
  }
  function onMove(e) {
    if (e.pointerId !== joy.id) return;
    e.preventDefault();
    if (!joyAllowed()) { releaseJoy(); return; }
    moveJoy(e.clientX, e.clientY);
  }
  function onUp(e) { if (e.pointerId === joy.id) releaseJoy(); }

  /* ---------- input: keyboard ---------- */
  var KEYMAP = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
  var keys = { u: 0, d: 0, l: 0, r: 0 };
  function clearKeys() { keys.u = keys.d = keys.l = keys.r = 0; }

  /* Screen-space input: x right, z down, unit direction + magnitude. */
  function readInput() {
    var x = joy.vx + (keys.r - keys.l), z = joy.vz + (keys.d - keys.u);
    var len = Math.sqrt(x * x + z * z);
    if (len < 1e-4) return { x: 0, z: 0, mag: 0 };
    return { x: x / len, z: z / len, mag: Math.min(1, len) };
  }
  /* World-space input: the guest's camera is rotated 180 degrees, so both axes invert. */
  function worldInput() {
    var i = readInput();
    if (G.flip) { i.x = -i.x; i.z = -i.z; }
    return i;
  }

  /* ---------- dash ---------- */
  function doDash() {
    return; // dash removed from the game; kept as a no-op so old bindings stay harmless
    if (!(G.state === 'live' || G.state === 'roundEnd') || !G.player.alive || G.paused || modal) return;
    var i = worldInput();
    var ok = false;
    try { ok = SL.combat.dash(G.player, i.x * i.mag, i.z * i.mag); } catch (e) { logOnce('dash', e); }
    el.dash.classList.add('press');
    setTimeout(function () { el.dash.classList.remove('press'); }, 110);
    if (ok) try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* ignore */ }
  }

  /* ---------- HUD (DOM writes only on change) ---------- */
  function setText(key, node, v) {
    if (hud[key] === v) return false;
    hud[key] = v; node.textContent = v;
    return true;
  }
  function setFlag(key, node, cls, on) {
    if (hud[key] === on) return;
    hud[key] = on; node.classList.toggle(cls, on);
  }
  function setAttr(key, node, name, v) {
    if (hud[key] === v) return;
    hud[key] = v; node.setAttribute(name, v);
  }
  function setPips(container, n) {
    var pips = container.children;
    for (var i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < n);
  }
  function bump(node) { node.classList.remove('bump'); void node.offsetWidth; node.classList.add('bump'); }

  function updateHud(rdt) {
    var p = G.player;
    if (!p) return;
    var s = G.state;

    if (setText('sp', el.scoreP, String(G.scoreP))) { setPips(el.pipsP, G.scoreP); if (G.scoreP) bump(el.scoreP); }
    if (setText('sb', el.scoreB, String(G.scoreB))) { setPips(el.pipsB, G.scoreB); if (G.scoreB) bump(el.scoreB); }
    setText('foe', el.foeLabel, online() ? 'RIVAL' : 'BOT');
    setText('round', el.roundLabel, 'Round ' + G.round);

    var t = Math.max(0, Math.ceil((G.roundT || 0) - 1e-6));
    var sec = t % 60;
    setText('clock', el.clockTime, Math.floor(t / 60) + ':' + (sec < 10 ? '0' : '') + sec);
    setFlag('low', el.clock, 'is-low', s === 'live' && t <= 10);

    var dead = !p.alive && (s === 'live' || s === 'roundEnd');
    setAttr('dead', el.app, 'data-dead', dead ? '1' : '0');

    var hp = Math.max(0, Math.ceil(p.hp));
    if (setText('hp', el.hpNum, String(hp))) el.hpFill.style.transform = 'scaleX(' + SL.clamp(hp / C.HP, 0, 1) + ')';
    setFlag('hpLow', el.hp, 'is-low', hp < LOW_HP);

    var w = SL.WEAPONS[p.weapon];
    if (w) {
      var rel = !!p.reloading && p.alive;
      setText('wname', el.wpnName, w.name);
      var plant = !rel && p.alive && w.needStill > 0 && p.target && p.still < w.needStill;
      setText('ammo', el.wpnAmmo, rel ? 'Reloading' : plant ? 'Stand still' : (Math.max(0, p.ammo | 0) + ' / ' + w.mag));
      setFlag('rel', el.wpn, 'is-reloading', rel);
    }

    /* dash ring */
    var cdFrac = SL.clamp((p.dashCd || 0) / C.DASH_CD, 0, 1);
    var off = (RING_C * cdFrac).toFixed(1);
    if (hud.ring !== off) { hud.ring = off; el.dashRing.setAttribute('stroke-dashoffset', off); }
    var ready = cdFrac <= 0 && p.alive;
    if (dashReady !== ready) {
      if (ready && dashReady === false) { el.dash.classList.remove('flash'); void el.dash.offsetWidth; el.dash.classList.add('flash'); }
      dashReady = ready;
      el.dash.classList.toggle('ready', ready);
    }

    /* hurt flash, low HP pulse */
    if (!G.paused) vig = Math.max(0, vig - rdt * 1.8);
    var o = Math.round(vig * 50) / 50;
    if (hud.vig !== o) { hud.vig = o; el.hurt.style.opacity = String(o); }
    setFlag('lowhp', el.lowhp, 'on', s === 'live' && p.alive && hp < LOW_HP);

    /* damage direction arc */
    if (dmgT > 0) {
      if (!G.paused) dmgT = Math.max(0, dmgT - rdt);
      var ang = (p.hitDir || 0) + (G.flip ? PI : 0);
      var pos = null;
      try { if (SL.view.project) pos = SL.view.project(p.x, 0.6, p.z); } catch (e) { pos = null; }
      if (pos && pos.on) { el.dmgDir.style.left = pos.x + 'px'; el.dmgDir.style.top = pos.y + 'px'; }
      el.dmgArc.style.transform = 'rotate(' + (ang + PI / 2).toFixed(3) + 'rad)';
      el.dmgDir.style.opacity = String(Math.min(1, dmgT / 0.45).toFixed(2));
      hud.dmgOn = true;
    } else if (hud.dmgOn) { hud.dmgOn = false; el.dmgDir.style.opacity = '0'; }
  }

  /* ---------- loop ---------- */
  function frame(t) {
    requestAnimationFrame(frame);
    var rdt = Math.min(0.05, Math.max(0, (t - last) / 1000));
    last = t;
    if (!G.paused) {
      G.clock += rdt;
      /* The guest's timeScale comes from the host snapshot. */
      if (G.mode !== 'guest') {
        if (slowT > 0) slowT = Math.max(0, slowT - rdt);
        G.timeScale = slowT > 0 ? SLOW_SCALE : 1;
      }
      var dt = rdt * SL.clamp(G.timeScale || 1, 0, 2);
      try {
        if (lostT > 0) {
          lostT -= rdt;
          if (lostT <= 0) leaveOnline();
        } else if (G.mode === 'guest') {
          /* Guest: move own unit only, then let net publish it and apply the host snapshot. */
          simulate(dt);
          SL.net.tick(rdt);
          applyPeer();
        } else if (G.mode === 'host') {
          /* Host: state changes and unit resets happen before tick so net sees them in the same frame. */
          machine(rdt, dt);
          SL.net.tick(rdt);
          applyPeer();
          simulate(dt);
        } else {
          machine(rdt, dt);
          simulate(dt);
        }
      } catch (e) { logOnce('step', e); }
    }
    try { syncUi(G.paused ? 0 : rdt); updateHud(rdt); } catch (e) { logOnce('ui', e); }
    try { if (SL.audio && SL.audio.update) SL.audio.update(rdt); } catch (e) { logOnce('audioUpdate', e); }
    try { SL.view.render(G.paused ? 0 : rdt); } catch (e) { logOnce('render', e); }
    frames++;
    if (frames === 2) afterFirstPaint();
  }

  function afterFirstPaint() {
    el.splash.classList.add('gone');
    setTimeout(function () { el.splash.hidden = true; }, 700);
    if (!SL.store.get(K_HOWTO, false) && G.state === 'menu') openModal('howto');
  }

  /* ---------- wiring ---------- */
  function buildPips(container) {
    container.textContent = '';
    for (var i = 0; i < C.WIN; i++) container.appendChild(document.createElement('i'));
  }

  function wire() {
    el.playBtn.addEventListener('click', function () { G.mode = 'solo'; G.flip = false; startMatch(); });
    el.hostBtn.addEventListener('click', hostGame);
    el.joinBtn.addEventListener('click', openJoin);
    el.lobbyCancel.addEventListener('click', leaveOnline);
    el.joinCancel.addEventListener('click', leaveOnline);
    el.copyBtn.addEventListener('click', copyCode);
    el.joinForm.addEventListener('submit', submitJoin);
    el.joinCode.addEventListener('input', function () {
      var v = el.joinCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
      if (v !== el.joinCode.value) el.joinCode.value = v;
      el.joinGo.disabled = v.length !== 5;
      if (el.joinStatus.classList.contains('err')) setStatus(el.joinStatus, '', false, false);
    });
    el.rematchBtn.addEventListener('click', rematch);
    el.menuBtn.addEventListener('click', function () { if (online()) leaveOnline(); else goMenu(); });
    el.diffSeg.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-diff]') : null;
      if (b) setDiff(b.getAttribute('data-diff'));
    });

    el.lockerBtn.addEventListener('click', function () { openModal('locker'); });
    el.howBtn.addEventListener('click', function () { openModal('howto'); });
    el.settingsBtn.addEventListener('click', function () { openModal('settings'); });
    el.gearBtn.addEventListener('click', function () { openModal('settings'); });
    el.lockerClose.addEventListener('click', function () { closeModal(); });
    el.settingsClose.addEventListener('click', function () { closeModal(); });
    el.settingsDone.addEventListener('click', function () { closeModal(); });
    el.howDone.addEventListener('click', function () { closeModal(); });
    el.leaveBtn.addEventListener('click', function () { closeModal(true); if (online()) leaveOnline(); else goMenu(); });
    el.musicToggle.addEventListener('click', function () { setBus('music', !settings.music); });
    el.sfxToggle.addEventListener('click', function () { setBus('sfx', !settings.sfx); });
    [el.locker, el.settings, el.howto].forEach(function (m) {
      m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
    });
    el.lockerTabs.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[role="tab"]') : null;
      if (b) { lockerSlot = b.getAttribute('data-slot'); renderLocker(); }
    });
    el.lockerTabs.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var slots = SL.profile.SLOTS, i = slots.indexOf(lockerSlot);
      lockerSlot = slots[(i + (e.key === 'ArrowRight' ? 1 : slots.length - 1)) % slots.length];
      renderLocker();
      var t = $('tab-' + lockerSlot); if (t) t.focus();
    });
    el.reloadBtn.addEventListener('click', function () { try { window.location.reload(); } catch (e) { /* ignore */ } });

    /* Dash: pointerdown for zero latency; click covers keyboard activation. */
    el.dash.setAttribute('data-sfx', 'none');
    el.dash.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); doDash(); });
    el.dash.addEventListener('click', function (e) { if (e.detail === 0) doDash(); });

    /* UI tap sounds for every button (cards and dash emit their own). */
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b || b.disabled) return;
      var k = b.getAttribute('data-sfx');
      if (k === 'none') return;
      ui(k || 'tap', b.id || null);
    });

    /* Audio unlock on every gesture (iOS needs it repeatedly after interruptions). */
    document.addEventListener('pointerdown', audioInit, true);
    document.addEventListener('keydown', audioInit, true);

    el.game.addEventListener('pointerdown', onDown);
    el.game.addEventListener('pointermove', onMove);
    el.game.addEventListener('pointerup', onUp);
    el.game.addEventListener('pointercancel', onUp);
    el.game.addEventListener('lostpointercapture', onUp);
    el.game.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    window.addEventListener('keydown', function (e) {
      if (modal) {
        if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
        else if (e.key === 'Tab') trapTab(e);
        return;
      }
      var typing = e.target && e.target.tagName === 'INPUT';
      if (typing) return;
      var k = KEYMAP[e.code];
      var play = G.state === 'live' || G.state === 'countdown' || G.state === 'roundEnd';
      if (k) { keys[k] = 1; if (play) e.preventDefault(); return; }
      if (e.key === 'Escape' && inMatch()) { e.preventDefault(); openModal('settings'); return; }
      if (G.state === 'pick' && /^Digit[1-9]$/.test(e.code)) {
        var id = SL.WEAPON_ORDER[parseInt(e.code.slice(5), 10) - 1];
        if (id) choose(id);
      }
    });
    window.addEventListener('keyup', function (e) { var k = KEYMAP[e.code]; if (k) keys[k] = 0; });
    window.addEventListener('blur', function () { clearKeys(); releaseJoy(); });

    document.addEventListener('visibilitychange', function () {
      docHidden = !!document.hidden;
      updatePause();
      clearKeys();
      releaseJoy();
      try {
        if (SL.audio) { if (docHidden) { if (SL.audio.suspend) SL.audio.suspend(); } else if (SL.audio.resume) SL.audio.resume(); }
      } catch (e) { logOnce('suspend', e); }
      last = performance.now();
    });

    if (SL.net && typeof SL.net.onStatus === 'function') {
      try {
        SL.net.onStatus(function (st) {
          if (st !== 'lost' || !online() || lostT > 0) return;
          lostT = LOST_T;
          releaseJoy();
          var why = G.mode === 'guest' ? 'The host left or put the game in the background' : 'Your rival left or put the game in the background';
          showBanner('Opponent left', why + '. Returning to the menu.', 'foe', 0, false);
        });
      } catch (e) { logOnce('onStatus', e); }
    }
  }

  function showFallback() {
    ['menu', 'lobby', 'join', 'pick', 'end', 'locker', 'settings', 'howto'].forEach(function (k) { if (el[k]) el[k].hidden = true; });
    if (el.splash) el.splash.hidden = true;
    if (el.fallback) {
      el.fallback.hidden = false;
      if (el.reloadBtn) {
        el.reloadBtn.onclick = function () { try { window.location.reload(); } catch (e) { /* ignore */ } };
        try { el.reloadBtn.focus(); } catch (e) { /* ignore */ }
      }
    }
  }

  /* ---------- boot ---------- */
  function boot() {
    ['splash', 'app', 'game', 'fx', 'hurt', 'lowhp', 'dmgDir', 'dmgArc', 'scoreP', 'scoreB', 'pipsP', 'pipsB', 'foeLabel',
      'clock', 'roundLabel', 'clockTime', 'feed', 'hp', 'hpNum', 'hpFill', 'wpn', 'wpnName', 'wpnAmmo', 'gearBtn',
      'dash', 'dashRing', 'stage', 'banner', 'bannerMain', 'bannerSub', 'summary', 'sumDealt', 'sumTaken', 'sumAcc',
      'joy', 'joyBase', 'joyKnob', 'menu', 'menuLevel', 'menuXpFill', 'menuXp', 'menuNext', 'diffSeg', 'playBtn', 'onlineBtns',
      'hostBtn', 'joinBtn', 'onlineNote', 'lockerBtn', 'howBtn', 'settingsBtn', 'winNote', 'lobby', 'lobbyCode',
      'copyBtn', 'lobbyStatus', 'lobbyCancel', 'join', 'joinForm', 'joinCode', 'joinStatus', 'joinGo', 'joinCancel',
      'pick', 'pickTitle', 'pickScore', 'pickNote', 'cards', 'end', 'endTitle', 'endP', 'endB', 'endFoeLabel', 'rAcc',
      'rDmg', 'rLong', 'rFlaw', 'xpLevel', 'xpGain', 'xpFill', 'xpSub', 'xpLines', 'medals', 'lockerDone', 'lockerCount', 'unlocks', 'rematchBtn', 'menuBtn',
      'rematchStatus', 'locker', 'lockerClose', 'lockerTabs', 'lockerItems', 'settings', 'settingsClose',
      'musicToggle', 'sfxToggle', 'settingsDone', 'leaveBtn', 'howto', 'howDone', 'toast', 'fallback', 'reloadBtn'
    ].forEach(function (id) { el[id] = $(id); });
    el.cardList = [];

    try {
      if (!window.THREE) throw new Error('THREE did not load');
      if (!SL.world || !SL.combat || !SL.bot || !SL.view || !SL.profile) throw new Error('A game module did not load');

      var saved = SL.store.get(K_SETTINGS, null);
      var bus = (SL.audio && SL.audio.bus) || { music: true, sfx: true };
      settings.music = saved && typeof saved.music === 'boolean' ? saved.music : bus.music !== false;
      settings.sfx = saved && typeof saved.sfx === 'boolean' ? saved.sfx : bus.sfx !== false;
      setDiff(saved && SL.DIFF[saved.diff] ? saved.diff : G.diff);
      setBus('music', settings.music);
      setBus('sfx', settings.sfx);

      el.winNote.textContent = 'First to ' + C.WIN + ' rounds';
      buildPips(el.pipsP);
      buildPips(el.pipsB);
      buildCards();

      G.mode = 'solo'; G.flip = false;
      G.player = SL.makeUnit(true);
      G.bot = SL.makeUnit(false);
      G.player.foe = G.bot;
      G.bot.foe = G.player;
      G.player.equip = SL.profile.equip;
      G.bot.equip = SL.DEFAULT_EQUIP;
      SL.world.init();
      G.round = 1; G.scoreP = 0; G.scoreB = 0; G.roundT = C.ROUND_TIME;
      resetScene();
      SL.view.init(el.game);

      wire();
      setOnline(false);
      el.onlineNote.textContent = 'Checking online play';
      var d = document.createElement('span'); d.className = 'dots'; el.onlineNote.appendChild(d);
      checkOnline();
      setState('menu');
      last = performance.now();
      requestAnimationFrame(frame);
    } catch (e) {
      console.error(e);
      showFallback();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.SL);

/* Diagnostics readout for real-device and live-online testing. Off by default.
   Turn on: open the page with #diag, or tap the round clock 5 times quickly. Shows frame rate, slow-frame time,
   and (online) how often the opponent's updates arrive and how stale the latest one is. */
(function () {
  'use strict';
  var on = false, el = null, times = [], lastT = 0, taps = [], timer = 0;
  function make() {
    el = document.createElement('div');
    el.id = 'diag';
    el.setAttribute('aria-live', 'off');
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top, 0px) + 96px);' +
      'z-index:30;pointer-events:none;padding:6px 10px;border-radius:6px;background:var(--panel, rgba(29,24,32,.86));' +
      'color:var(--ink, #f6ead6);font:600 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;' +
      'font-variant-numeric:tabular-nums;white-space:pre-wrap;text-align:left;max-width:calc(100vw - 32px);box-sizing:border-box;';
    document.body.appendChild(el);
  }
  function loop(t) {
    if (!on) return;
    if (lastT) { times.push(t - lastT); if (times.length > 180) times.shift(); }
    lastT = t;
    requestAnimationFrame(loop);
  }
  function render() {
    if (!on || !el) return;
    var s = times.slice().sort(function (a, b) { return a - b; });
    var avg = s.length ? s.reduce(function (a, b) { return a + b; }, 0) / s.length : 0;
    var p95 = s.length ? s[Math.floor(s.length * 0.95)] : 0;
    var lines = ['fps ' + (avg ? Math.round(1000 / avg) : '-') + '   slow frames ' + (p95 ? p95.toFixed(1) : '-') + ' ms'];
    var n = window.SL && SL.net && typeof SL.net.stats === 'function' ? SL.net.stats() : null;
    if (n) {
      var f = function (v) { return v == null ? '-' : Math.round(v); };
      lines.push(n.role + ' ' + n.status + '   updates every ' + f(n.gapMed) + ' ms (p95 ' + f(n.gapP95) + ', max ' + f(n.gapMax) + ')');
      lines.push('last update ' + f(n.since) + ' ms ago');
    }
    el.textContent = lines.join('\n');
  }
  function setOn(v) {
    on = v;
    if (on) { if (!el) make(); el.hidden = false; lastT = 0; times = []; requestAnimationFrame(loop); timer = setInterval(render, 500); }
    else { if (el) el.hidden = true; clearInterval(timer); }
  }
  function boot() {
    try { if (location.hash === '#diag') setOn(true); } catch (e) { /* ignore */ }
    var clock = document.getElementById('clock');
    if (clock) {
      clock.style.pointerEvents = 'auto';
      clock.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        var t = Date.now(); taps = taps.filter(function (x) { return t - x < 2000; }); taps.push(t);
        if (taps.length >= 5) { taps = []; setOn(!on); }
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
