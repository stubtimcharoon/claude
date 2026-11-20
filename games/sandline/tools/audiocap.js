// Records the page's real WebAudio output (everything reaching ctx.destination) during a scripted solo session.
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2], OUT = process.argv[3];
const TAP = `(function(){
  const orig = AudioNode.prototype.connect; const caps = new WeakMap(); window.__cap = { L: [], R: [], sr: 0, ev: [] };
  function tapFor(ctx){ let t = caps.get(ctx); if (t) return t;
    t = ctx.createScriptProcessor(4096, 2, 2); window.__cap.sr = ctx.sampleRate; window.__capCtx = ctx;
    t.onaudioprocess = e => { if (window.__cap.t0 === undefined) window.__cap.t0 = e.playbackTime - e.inputBuffer.duration; const a = e.inputBuffer, l = a.getChannelData(0), r = a.numberOfChannels > 1 ? a.getChannelData(1) : l, n = l.length, o = new Int16Array(n * 2); for (let i = 0; i < n; i++) { o[2*i] = Math.max(-32768, Math.min(32767, Math.round(l[i] * 32767))); o[2*i+1] = Math.max(-32768, Math.min(32767, Math.round(r[i] * 32767))); } window.__cap.L.push(o); };
    orig.call(t, ctx.destination); caps.set(ctx, t); return t; }
  AudioNode.prototype.connect = function(dest){ const r = orig.apply(this, arguments); try { if (dest instanceof AudioDestinationNode && !(this instanceof ScriptProcessorNode) && !(window.OfflineAudioContext && dest.context instanceof OfflineAudioContext)) orig.call(this, tapFor(dest.context)); } catch(e){} return r; };
})();`;
const srv = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body style="margin:0">' + fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') + '</body></html>'); }
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(fs.readFileSync(f)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] }); await ctx.addInitScript({ content: TAP });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ path: path.join(ROOT, 'vendor/three.min.js'), contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.goto('http://127.0.0.1:' + srv.address().port + '/'); await sleep(1500);
  const mark = (label) => page.evaluate(l => { const c = window.__capCtx; window.__cap.ev.push([l, c ? c.currentTime : -1, window.__cap.L.length]); }, label);
  await page.evaluate(() => { ['shot','damage','death','reload','dash','laser','ping','round','ui'].forEach(k => SL.on(k, p => { const c = window.__capCtx; const w = k === 'shot' ? p.weapon && (p.weapon.id || p.weapon) : (p && (p.phase || p.kind)) || ''; window.__cap.ev.push([k + ':' + w + (p && p.u ? (p.u.isPlayer ? ':me' : ':foe') : ''), c ? c.currentTime : -1]); })); });
  const how = page.locator('#howDone'); if (await how.isVisible().catch(() => false)) await how.click();
  await mark('menu'); await sleep(6000);
  await page.click('#playBtn'); await sleep(1200);
  for (let round = 0; round < 3; round++) {
    const cards = page.locator('#cards button'); await cards.nth(round % 4).click().catch(() => {});
    await sleep(3600);
    const vp = page.viewportSize();
    for (let i = 0; i < 14; i++) { const st = await page.evaluate(() => SL.G.state); if (st !== 'live') break;
      await page.mouse.move(vp.width / 2, vp.height * 0.62); await page.mouse.down(); await page.mouse.move(vp.width / 2 + (i % 3 - 1) * 30, vp.height * 0.62 - 50, { steps: 3 }); await sleep(900); await page.mouse.up(); if (i % 5 === 2) await page.keyboard.press('Space'); }
    for (let k = 0; k < 20; k++) { const st = await page.evaluate(() => SL.G.state); if (st === 'pick' || st === 'matchEnd') break; await sleep(500); }
  }
  await sleep(1500);
  const meta = await page.evaluate(() => ({ t0: window.__cap.t0, sr: window.__cap.sr, n: window.__cap.L.length, ev: window.__cap.ev, stats: SL.audio._stats && SL.audio._stats() }));
  const parts = [];
  for (let i = 0; i < meta.n; i += 50) parts.push(Buffer.from(await page.evaluate(([a, b]) => { const arr = window.__cap.L.slice(a, b); let len = 0; arr.forEach(x => len += x.length); const all = new Int16Array(len); let o = 0; arr.forEach(x => { all.set(x, o); o += x.length; }); let s = ''; const u8 = new Uint8Array(all.buffer); for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000)); return btoa(s); }, [i, i + 50]), 'base64'));
  const pcm = Buffer.concat(parts); const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(meta.sr, 24); hdr.writeUInt32LE(meta.sr * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(OUT + '/session.wav', Buffer.concat([hdr, pcm])); fs.writeFileSync(OUT + '/cap.json', JSON.stringify({ t0: meta.t0, sr: meta.sr, ev: meta.ev, stats: meta.stats }));
  const L = { length: pcm.length / 4 }, cap = { sr: meta.sr, ev: meta.ev, stats: meta.stats };
  console.log(JSON.stringify({ seconds: (L.length / cap.sr).toFixed(1), sr: cap.sr, events: cap.ev.length, stats: cap.stats, errs }));
  await browser.close(); srv.close();
})().catch(e => { console.error('HARNESS', e); process.exit(1); });
