// Integration test: wraps index.html in a doc skeleton like the artifact host, serves it, drives a phone session.
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2], OUT = process.argv[3] || '.';
const types = { '.js': 'text/javascript', '.html': 'text/html' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') {
    const body = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body style="margin:0">' + body + '</body></html>');
  }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ path: path.join(ROOT, 'vendor/three.min.js'), contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.goto(url);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + '/1-menu.png' });
  const clickText = async (re) => { const el = page.getByRole('button', { name: re }).first(); await el.click(); };
  await clickText(/play/i);
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/2-pick.png' });
  await clickText(/rifle/i);
  await page.waitForTimeout(3600);
  await page.screenshot({ path: OUT + '/3-live.png' });
  // drag joystick upward for a few seconds
  const vp = page.viewportSize();
  const sx = vp.width / 2, sy = vp.height * 0.7;
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let i = 0; i < 20; i++) { await page.mouse.move(sx + (i > 10 ? 30 : 0), sy - 50); await page.waitForTimeout(250); }
  await page.screenshot({ path: OUT + '/4-moving.png' });
  await page.mouse.up();
  const st = await page.evaluate(() => { const G = SL.G; return { state: G.state, round: G.round, p: [G.player.x, G.player.z, G.player.hp], b: [G.bot.x, G.bot.z, G.bot.hp], score: [G.scoreP, G.scoreB], botVisible: SL.view && SL.view.botVisible }; });
  // fast-forward: walk toward bot to force a fight
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => { const G = SL.G, p = G.player, b = G.bot; if (G.state !== 'live') return; const dx = b.x - p.x, dz = b.z - p.z; });
    await page.waitForTimeout(250);
    const s2 = await page.evaluate(() => SL.G.state);
    if (s2 !== 'live') break;
  }
  await page.screenshot({ path: OUT + '/5-later.png' });
  const st2 = await page.evaluate(() => { const G = SL.G; return { state: G.state, round: G.round, score: [G.scoreP, G.scoreB], php: G.player.hp, bhp: G.bot.hp }; });
  console.log(JSON.stringify({ st, st2, errs }, null, 1));
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
