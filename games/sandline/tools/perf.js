// CPU-side frame cost under CPU throttling (phone proxy) + renderer stats during live play.
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2], RATE = +(process.argv[3] || 4);
const HOOK = `(function(){ const raf = window.requestAnimationFrame.bind(window); window.__ft = [];
  window.requestAnimationFrame = cb => raf(t => { const s = performance.now(); cb(t); window.__ft.push(performance.now() - s); }); })();`;
const srv = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body style="margin:0">' + fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') + '</body></html>'); }
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(fs.readFileSync(f)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] }); await ctx.addInitScript({ content: HOOK });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ path: path.join(ROOT, 'vendor/three.min.js'), contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  const t0 = Date.now(); await page.goto('http://127.0.0.1:' + srv.address().port + '/');
  await page.waitForFunction(() => window.SL && SL.view && SL.view.renderer); const boot = Date.now() - t0;
  const how = page.locator('#howDone'); if (await how.isVisible().catch(() => false)) await how.click();
  const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await page.click('#playBtn'); await sleep(800); await page.locator('#cards button').nth(1).click(); await sleep(3800);
  await page.evaluate(() => { window.__ft = []; window.__calls = []; const r = SL.view.renderer, orig = r.render.bind(r); r.render = (s, c) => { orig(s, c); window.__calls.push([r.info.render.calls, r.info.render.triangles]); }; });
  const vp = page.viewportSize();
  for (let i = 0; i < 12; i++) { await page.mouse.move(vp.width / 2, vp.height * 0.62); await page.mouse.down(); await page.mouse.move(vp.width / 2 + (i % 3 - 1) * 30, vp.height * 0.62 - 50, { steps: 3 }); await sleep(800); await page.mouse.up(); if (i % 4 === 1) await page.keyboard.press('Space'); }
  const r = await page.evaluate(() => { const f = window.__ft.slice().sort((a, b) => a - b), q = p => f[Math.min(f.length - 1, Math.floor(p * f.length))];
    const c = window.__calls.map(x => x[0]), t = window.__calls.map(x => x[1]);
    return { frames: f.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: f[f.length - 1], callsMax: Math.max(...c), callsAvg: c.reduce((a, b) => a + b, 0) / c.length, trisMax: Math.max(...t), heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null, state: SL.G.state }; });
  console.log(JSON.stringify(Object.assign({ cpuThrottle: RATE + 'x', bootMs: boot, errs }, r), (k, v) => typeof v === 'number' ? +v.toFixed(2) : v));
  await browser.close(); srv.close();
})().catch(e => { console.error('HARNESS', e); process.exit(1); });
