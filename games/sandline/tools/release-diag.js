const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2], OUT = process.argv[3], MODE = process.argv[4] || 'solo';
const FAKE = fs.readFileSync(path.join(__dirname, 'fake-room.js'), 'utf8');
const subs = {};
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const p = decodeURIComponent(u.pathname);
  if (p === '/sse') { const r = u.searchParams.get('room'); res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' }); res.write(':ok\n\n'); (subs[r] = subs[r] || new Set()).add(res); req.on('close', () => subs[r].delete(res)); return; }
  if (p === '/pub') { const r = u.searchParams.get('room'); let b = ''; req.on('data', d => b += d).on('end', () => { (subs[r] || new Set()).forEach(s => s.write('data: ' + b + '\n\n')); res.writeHead(204); res.end(); }); return; }
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body style="margin:0">' + fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') + '</body></html>'); }
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function newPage(ctx, tag, errs) {
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errs.push(tag + ' console: ' + m.text()); });
  page.on('pageerror', e => errs.push(tag + ' pageerror: ' + e.message));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ path: path.join(ROOT, 'vendor/three.min.js'), contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  return page;
}
async function dismissHow(page) { const h = page.locator('#howDone'); if (await h.isVisible().catch(() => false)) await h.click(); }
async function pickFirst(page) { await page.locator('#cards button').first().click({ timeout: 8000 }); }
async function hold(page, dx, dy, ms) { const vp = page.viewportSize(); const sx = vp.width / 2, sy = vp.height * 0.62; await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + dx, sy + dy, { steps: 4 }); await sleep(ms); await page.mouse.up(); }
const st = page => page.evaluate(() => { const G = SL.G; return { mode: G.mode, state: G.state, round: G.round, score: [G.scoreP, G.scoreB], p: [+G.player.x.toFixed(1), +G.player.z.toFixed(1), G.player.hp], b: [+G.bot.x.toFixed(1), +G.bot.z.toFixed(1), G.bot.hp], net: SL.net && SL.net.status, maxPres: window.__fakeRoomStats && window.__fakeRoomStats.maxPresence }; });
(async () => {
  await new Promise(r => srv.listen(0, r)); const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const errs = [], log = [];
  if (MODE === 'solo') {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await newPage(ctx, 'solo', errs);
    await page.goto(url); await sleep(1800); await page.screenshot({ path: OUT + '/s1-first.png' });
    await dismissHow(page); await sleep(400); await page.screenshot({ path: OUT + '/s2-menu.png' });
    await page.click('#lockerBtn'); await sleep(400); await page.screenshot({ path: OUT + '/s3-locker.png' }); await page.click('#lockerClose');
    await page.click('#playBtn'); await sleep(600); await page.screenshot({ path: OUT + '/s4-pick.png' });
    await pickFirst(page); await sleep(3800); await page.screenshot({ path: OUT + '/s5-live.png' });
    let shots = 0;
    for (let i = 0; i < 120; i++) {
      const s = await st(page);
      if (s.state === 'pick') { await pickFirst(page).catch(() => {}); await sleep(3500); continue; }
      if (s.state === 'matchEnd') break;
      if (s.state === 'live') { await hold(page, (Math.random() - 0.5) * 60, -50, 900); await page.keyboard.press('Space'); }
      else await sleep(500);
      if (i === 6 || i === 20) await page.screenshot({ path: OUT + '/s6-fight' + (shots++) + '.png' });
    }
    (x=>{console.error('LOG',JSON.stringify(x));log.push(x)})(await st(page)); await sleep(2500); await page.screenshot({ path: OUT + '/s7-end.png' });
  } else {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const ctx2 = await browser.newContext({ ...devices['iPhone 13'] });
    for (const c of [ctx, ctx2]) await c.addInitScript({ content: FAKE + ";Object.defineProperty(document,'hidden',{get:()=>false});Object.defineProperty(document,'visibilityState',{get:()=>'visible'});" });
    const A = await newPage(ctx, 'host', errs), B = await newPage(ctx2, 'guest', errs);
    await A.goto(url + '#diag'); await B.goto(url + '#diag'); await sleep(2000); await dismissHow(A); await dismissHow(B);
    await A.click('#hostBtn'); await sleep(1500);
    const code = (await A.locator('#lobbyCode').innerText()).trim(); (x=>{console.error('LOG',JSON.stringify(x));log.push(x)})('code ' + code);
    await A.screenshot({ path: OUT + '/o1-lobby.png' });
    await B.click('#joinBtn'); await B.fill('#joinCode', code); await B.click('#joinGo'); await sleep(2500);
    (x=>{console.error('LOG',JSON.stringify(x));log.push(x)})({ A: await st(A), B: await st(B) });
    await pickFirst(A).catch(e => (x=>{console.error('LOG',JSON.stringify(x));log.push(x)})('A pick ' + e.message)); await pickFirst(B).catch(e => (x=>{console.error('LOG',JSON.stringify(x));log.push(x)})('B pick ' + e.message));
    await sleep(4500); (x=>{console.error('LOG',JSON.stringify(x));log.push(x)})({ A: await st(A), B: await st(B) });
    await A.screenshot({ path: OUT + '/o2-host.png' }); await B.screenshot({ path: OUT + '/o3-guest.png' });
    for (let i = 0; i < 16; i++) {
      const [a, b] = [await st(A), await st(B)];
      if (a.state === 'pick') { await pickFirst(A).catch(() => {}); console.error('pickA'); }
      if (b.state === 'pick') { await pickFirst(B).catch(() => {}); }
      if (a.state === 'matchEnd') break;
      await Promise.all([hold(A, 0, -50, 700), hold(B, 0, -50, 700)]);
      if (i % 8 === 0) (x=>{console.error('LOG',JSON.stringify(x));log.push(x)})({ i, A: a, B: b });
    }
    await A.screenshot({ path: OUT + '/o4-host.png' }); await B.screenshot({ path: OUT + '/o5-guest.png' });
    await B.close(); await sleep(11500); (x=>{console.error('LOG',JSON.stringify(x));log.push(x)})({ afterGuestLeft: await st(A) }); await A.screenshot({ path: OUT + '/o6-left.png' });
  }
  console.log(JSON.stringify({ log, errs: errs.slice(0, 25), errCount: errs.length }, null, 1));
  await browser.close(); srv.close();
})().catch(e => { console.error('HARNESS', e); process.exit(1); });
