// Injected before page scripts: emulates claude.use('room') across tabs of one browser context via BroadcastChannel.
(function () {
  const PEER = Math.random().toString(36).slice(2, 10);
  function makeRoom(name) {
    const es = new EventSource('/sse?room=' + encodeURIComponent(name));
    const ch = { onmessage: null, postMessage(m) { m.from = PEER; fetch('/pub?room=' + encodeURIComponent(name), { method: 'POST', body: JSON.stringify(m), keepalive: true }); }, close() { es.close(); } };
    es.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.from === PEER) return; if (ch.onmessage) ch.onmessage({ data: m }); };
    es.onopen = () => ch.postMessage({ t: 'hello', peer: PEER });
    const peers = new Map(); // peer -> {presence, updatedAt}
    let mine = {};
    const peerL = new Set();
    const mk = (p, pres) => Object.freeze({ peer: p, by: null, isMe: p === PEER, sameTab: p === PEER, kind: 'viewer', guest: false, presence: Object.freeze(pres || {}), updatedAt: Date.now() });
    peers.set(PEER, mk(PEER, mine));
    let snap = Object.freeze([...peers.values()]);
    function fire(change) { snap = Object.freeze([...peers.values()]); const c = Object.assign({ peers: snap, joined: [], left: [], updated: [] }, change); peerL.forEach(fn => setTimeout(() => fn(c), 0)); }
    ch.onmessage = (e) => {
      const m = e.data;
      if (m.t === 'hello') { ch.postMessage({ t: 'pres', peer: PEER, presence: mine }); }
      if (m.t === 'pres') { const had = peers.has(m.peer); const p = mk(m.peer, m.presence); peers.set(m.peer, p); fire(had ? { updated: [p] } : { joined: [p] }); }
      if (m.t === 'bye') { const p = peers.get(m.peer); if (p) { peers.delete(m.peer); fire({ left: [p] }); } }
    };
    let pending = null;
    const api = {
      name,
      presence(patch) {
        mine = Object.assign({}, mine, patch); Object.keys(mine).forEach(k => { if (mine[k] === null) delete mine[k]; });
        const size = new TextEncoder().encode(JSON.stringify(mine)).length;
        if (size > 4096) return Promise.reject({ code: 'invalid_argument', message: 'presence over 4 KiB: ' + size });
        peers.set(PEER, mk(PEER, mine));
        if (!pending) pending = setTimeout(() => { pending = null; ch.postMessage({ t: 'pres', peer: PEER, presence: mine }); }, 33);
        fire({ updated: [peers.get(PEER)] });
        return Promise.resolve();
      },
      peers: () => snap,
      onPeers(fn) { peerL.add(fn); setTimeout(() => fn({ peers: snap, joined: snap, left: [], updated: [] }), 0); return () => peerL.delete(fn); },
      emit() { return Promise.reject({ code: 'not_permitted', message: 'fake' }); },
      on() { return () => {}; },
      connected: () => true,
      onConnection(fn) { setTimeout(() => fn(true), 0); return () => {}; },
      leave() { ch.postMessage({ t: 'bye', peer: PEER }); ch.close(); return Promise.resolve(); }
    };
    window.addEventListener('pagehide', () => { try { ch.postMessage({ t: 'bye', peer: PEER }); } catch (e) {} });
    window.__fakeRoomStats = window.__fakeRoomStats || { maxPresence: 0 };
    const origPresence = api.presence;
    api.presence = (patch) => { const r = origPresence(patch); const s = new TextEncoder().encode(JSON.stringify(mine)).length; window.__fakeRoomStats.maxPresence = Math.max(window.__fakeRoomStats.maxPresence, s); return r; };
    return api;
  }
  const rooms = new Map();
  const room = {
    join: (name) => Promise.resolve(rooms.get(name) || (rooms.set(name, makeRoom(name)), rooms.get(name))),
    presence: () => Promise.resolve(), peers: () => [], onPeers: () => () => {}, emit: () => Promise.resolve(), on: () => () => {},
    connected: () => true, onConnection: (fn) => { setTimeout(() => fn(true), 0); return () => {}; }
  };
  window.claude = Object.freeze({ use: (n) => Promise.resolve(n === 'room' ? room : null) });
})();
