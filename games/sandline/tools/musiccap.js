// Records Sandline music previews: one page per track, real WebAudio output tapped at ctx.destination.
// Loads only core.js + audio.js on a bare page so the game loop cannot interfere; this script drives SL.G and events.
// Usage: node musiccap.js <sandlineRoot> <outDir>
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.resolve(process.argv[2]), OUT = path.resolve(process.argv[3]);
fs.mkdirSync(OUT, { recursive: true });

const TAP = `(function(){
  const orig = AudioNode.prototype.connect; const caps = new WeakMap(); window.__cap = { L: [], sr: 0 };
  function tapFor(ctx){ let t = caps.get(ctx); if (t) return t;
    t = ctx.createScriptProcessor(4096, 2, 2); window.__cap.sr = ctx.sampleRate;
    t.onaudioprocess = e => { const a = e.inputBuffer, l = a.getChannelData(0), r = a.numberOfChannels > 1 ? a.getChannelData(1) : l, n = l.length, o = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { o[2*i] = l[i]; o[2*i+1] = r[i]; } window.__cap.L.push(o); };
    orig.call(t, ctx.destination); caps.set(ctx, t); return t; }
  AudioNode.prototype.connect = function(dest){ const r = orig.apply(this, arguments); try { if (dest instanceof AudioDestinationNode && !(this instanceof ScriptProcessorNode) && !(window.OfflineAudioContext && dest.context instanceof OfflineAudioContext)) orig.call(this, tapFor(dest.context)); } catch(e){} return r; };
})();`;
const PAGE = '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
  '<script src="/js/core.js"></script><script src="/js/audio.js"></script>' +
  '<script>setInterval(function () { try { SL.audio.update(1 / 60); } catch (e) { console.error(e); } }, 16);</script></body></html>';

const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE); }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(fs.readFileSync(f));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Each track: list of [page action, seconds to wait after it]. */
const SETUP = () => {
  const G = SL.G, p = SL.makeUnit(true), b = SL.makeUnit(false);
  p.foe = b; b.foe = p; G.player = p; G.bot = b; p.x = 12; p.z = 30; b.x = 12; b.z = 5;
  window.phase = (ph, w) => { G.state = ph; SL.emit('round', { phase: ph, winner: w === undefined ? null : w }); };
  SL.audio.init();
  SL.audio.setBus('sfx', false);     // music only: no wind or UI in the previews
  SL.audio.setBus('music', true);
};
const TRACKS = {
  menu: [[() => phase('menu'), 71]],
  lobby: [[() => phase('lobby'), 25]],
  round: [
    [() => { phase('countdown'); SL.G.roundT = 45; }, 3],
    [() => phase('live'), 20],                                        // calm
    [() => { SL.G.player.target = true; }, 20],                       // enemy spotted
    [() => { SL.G.roundT = 15; window.__rt = setInterval(() => { SL.G.roundT = Math.max(0, SL.G.roundT - 0.1); }, 100); }, 15],
    [() => { clearInterval(window.__rt); SL.G.player.target = false; phase('roundEnd', 'p'); }, 3.5]
  ],
  sting_round_won: [[() => phase('roundEnd', 'p'), 3.5]],
  sting_round_lost: [[() => phase('roundEnd', 'b'), 4]],
  sting_match_victory: [[() => phase('matchEnd', 'p'), 9]],
  sting_match_defeat: [[() => phase('matchEnd', 'b'), 9]],
  /* level reference, not a music track: SFX only, rifle bursts from the player and the bot */
  sfx_ref: [[() => {
    SL.audio.setBus('music', false); SL.audio.setBus('sfx', true); phase('live');
    const G = SL.G, w = SL.WEAPONS.rifle; let n = 0;
    window.__sh = setInterval(() => { if (n++ > 40) return clearInterval(window.__sh);
      const u = n % 2 ? G.player : G.bot; SL.emit('shot', { u: u, weapon: w, mx: u.x, mz: u.z, tracers: [{ x0: u.x, z0: u.z, x1: u.x, z1: u.z + (u === G.player ? -6 : 6), hit: false }] }); }, 130);
  }, 7]]
};

function stats(wav) {
  const r = require('child_process').spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', 'astats=measure_perchannel=none', '-f', 'null', '-'], { encoding: 'utf8' });
  const out = (r.stderr || '') + (r.stdout || '');
  const pk = /Peak level dB:\s*(-?[\d.]+|-inf)/.exec(out), rms = /RMS level dB:\s*(-?[\d.]+|-inf)/.exec(out);
  return { peak: pk ? pk[1] : '?', rms: rms ? rms[1] : '?' };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const results = {};
  const only = process.argv[4] ? process.argv[4].split(',') : Object.keys(TRACKS);
  for (const name of only) {
    const ctx = await browser.newContext();
    await ctx.addInitScript({ content: TAP });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto('http://127.0.0.1:' + srv.address().port + '/');
    await page.evaluate(SETUP);
    let total = 0;
    for (const [fn, secs] of TRACKS[name]) { await page.evaluate(fn); await sleep(secs * 1000); total += secs; }
    const meta = await page.evaluate(() => ({ sr: window.__cap.sr, n: window.__cap.L.length }));
    const parts = [];
    for (let i = 0; i < meta.n; i += 40) {
      parts.push(Buffer.from(await page.evaluate(([a, b]) => {
        const arr = window.__cap.L.slice(a, b); let len = 0; arr.forEach(x => len += x.length);
        const all = new Float32Array(len); let o = 0; arr.forEach(x => { all.set(x, o); o += x.length; });
        let s = ''; const u8 = new Uint8Array(all.buffer);
        for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000));
        return btoa(s);
      }, [i, i + 40]), 'base64'));
    }
    const pcm = Buffer.concat(parts), hdr = Buffer.alloc(44);
    hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16);
    hdr.writeUInt16LE(3, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(meta.sr, 24); hdr.writeUInt32LE(meta.sr * 8, 28);
    hdr.writeUInt16LE(8, 32); hdr.writeUInt16LE(32, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
    const wav = path.join(OUT, name + '.wav'), mp3 = path.join(OUT, name + '.mp3');
    fs.writeFileSync(wav, Buffer.concat([hdr, pcm]));
    execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '2', mp3]);
    results[name] = Object.assign({ seconds: +(pcm.length / 8 / meta.sr).toFixed(1), errs }, stats(wav));
    fs.unlinkSync(wav);
    console.log(name, JSON.stringify(results[name]));
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'levels.json'), JSON.stringify(results, null, 2));
  await browser.close(); srv.close();
})().catch(e => { console.error('MUSICCAP', e); process.exit(1); });
