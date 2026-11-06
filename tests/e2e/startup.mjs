// How long a person waits at the start, against the live project, over a realistic connection (latency of India to the Seoul region, ordinary broadband).
//   npm run test:e2e:startup
// It serves dist/site with the real headers (so it measures what Vercel serves), makes a temporary admin (zz...), and measures three times:
//   first visit   address typed -> sign-in screen shown
//   sign in       click -> the app is shown
//   next morning  reload with the session still there -> the app is shown (the most common start)
// It prints the medians and the size of what was downloaded. It changes nothing; the temporary account is removed afterwards.
// A budget is checked only with --check (the live project is shared, so a slow moment must not fail an ordinary run).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { connect, loadEnv } from '../../scripts/db.mjs';
import { createTestAdmin, newTag, removeTestAccounts } from '../support/accounts.mjs';

loadEnv();
if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) { console.log('SKIP startup: .env is not complete'); process.exit(0); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = resolve(root, 'dist/site');
const headers = Object.fromEntries(JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')).headers[0].headers.map((h) => [h.key, h.value]));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const cfg = { supabaseUrl: process.env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''), anonKey: process.env.SUPABASE_ANON_KEY };
const NETWORK = { latency: 150, downloadThroughput: (20 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 };   // the site is served from this computer, so its own files are throttled as if they came over the same line
const RUNS = 3;
// "ready" = signed in, the sign-in card gone, and the first page drawn from the loaded data (the empty page frame is there from the first moment, so it proves nothing)
const ready = (page) => page.waitForFunction(() => !document.body.classList.contains('signed-out') && document.getElementById('auth') && document.getElementById('auth').innerHTML === '' && document.getElementById('content').children.length > 0 && typeof S !== 'undefined' && !!S.settings, null, { timeout: 30000 });

// like Vercel: compressed, and a hashed script file may be kept for a year (the headers come from vercel.json, so this follows the real file)
const server = createServer((q, r) => {
  const p = q.url.split('?')[0];
  const f = resolve(SITE, '.' + (p === '/' ? '/index.html' : p));
  if (!f.startsWith(SITE) || !existsSync(f)) { r.writeHead(404).end(); return; }
  const body = gzipSync(readFileSync(f));
  r.writeHead(200, { ...headers, ...(cacheFor(p)), 'Content-Type': TYPES[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream', 'Content-Encoding': 'gzip' }).end(body);
}).listen(0);
const rules = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')).headers.slice(1);
function cacheFor(path) {
  const out = {};
  for (const rule of rules) if (new RegExp('^' + rule.source.replace(/\(\.\*\)/g, '.*').replace(/\*/g, '.*') + '$').test(path)) for (const h of rule.headers) out[h.key] = h.value;
  return out;
}
const base = `http://localhost:${server.address().port}`;

const tag = newTag(), PW = 'admin-pass-1';
const db = connect();
await db.connect();
await createTestAdmin(db, tag, PW);
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const indicator = [];
const first = [], sign = [], morning = [], bytes = [], reqs = [], morningReqs = [];
let counts = {};
try {
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript((c) => { globalThis.__APP_CONFIG_OVERRIDE = c; }, cfg);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NETWORK });
    let n = 0, b = 0;
    page.on('response', async (r) => { n++; try { b += (await r.body()).length; } catch { /* redirects have no body */ } });

    let t = Date.now();
    await page.goto(base + '/');
    await page.waitForSelector('#loginForm', { state: 'visible', timeout: 30000 });
    first.push(Date.now() - t);

    await page.fill('#loginForm [name="username"]', `${tag}_admin`);
    await page.fill('#loginForm [name="password"]', PW);
    n = 0; b = 0;
    t = Date.now();
    await page.click('#loginBtn');
    await ready(page);
    sign.push(Date.now() - t);
    await page.waitForTimeout(500);
    bytes.push(b); reqs.push(n);

    n = 0;
    const tl = [];
    const t0 = Date.now();
    page.on('requestfinished', (r) => tl.push([Date.now() - t0, r.url().replace(base, '').replace(cfg.supabaseUrl, 'DB').replace(/\?.*/, '').slice(0, 60)]));
    t = Date.now();
    await page.reload();
    await ready(page);
    morning.push(Date.now() - t);
    if (process.env.DETAIL && i === RUNS - 1) { await page.waitForTimeout(300); console.log(tl.map(([ms, u]) => String(ms).padStart(5) + ' ms  ' + u).join(String.fromCharCode(10))); }
    morningReqs.push(n);
    if (i === RUNS - 1) {
      // the save word in the top bar, without writing anything: the browser's connection and the writer's queue are stood in for
      const word = () => page.evaluate(() => { const e = document.getElementById('saveState'); return e ? e.textContent + '|' + e.className : null; });
      indicator.push(['shows All saved when nothing is waiting', (await word()) === 'All saved|save-state ok']);
      await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')); });
      indicator.push(['says Offline when the connection goes', (await word()) === 'Offline|save-state bad']);
      await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); window.dispatchEvent(new Event('online')); });
      indicator.push(['goes back to All saved when it returns', (await word()) === 'All saved|save-state ok']);
      await page.evaluate(() => { globalThis.__wp = WRITER.pending; WRITER.pending = () => 2; emitEvent('data:pending', { n: 2 }); });
      indicator.push(['does not flash Saving… for a save under a third of a second', (await word()) === 'All saved|save-state ok']);
      await page.waitForTimeout(500);
      indicator.push(['says Saving… when a save takes longer', (await word()) === 'Saving…|save-state busy']);
      await page.evaluate(() => { WRITER.pending = globalThis.__wp; emitEvent('data:pending', { n: 0 }); });
      indicator.push(['is back to All saved when the queue is empty', (await word()) === 'All saved|save-state ok']);
      await page.evaluate(() => go('openings')); await page.evaluate(() => go('dashboard'));
      indicator.push(['is still filled in after the page changes', (await word()) === 'All saved|save-state ok']);
    }
    counts = await page.evaluate(() => ({ leads: S.candidates.length, applications: S.applications.length }));
    await ctx.close();
  }
} finally {
  await removeTestAccounts(db, tag);
  await db.end();
  await browser.close();
  server.close();
}
const kb = (x) => Math.round(x / 1024) + ' KB';
console.log(`data in the project: ${counts.leads} people, ${counts.applications} applications (over ${NETWORK.latency} ms latency, 20 Mbit/s, ${RUNS} runs, median)`);
console.log(`first visit -> sign-in screen   ${median(first)} ms`);
console.log(`sign in -> app shown            ${median(sign)} ms   (${median(reqs)} requests, ${kb(median(bytes))} received)`);
console.log(`reload, still signed in -> app  ${median(morning)} ms   (${median(morningReqs)} requests)`);
let indicatorBad = 0;
for (const [name, ok] of indicator) { console.log((ok ? 'ok   the save word ' : 'FAIL the save word ') + name); if (!ok) indicatorBad++; }
if (indicatorBad) process.exit(1);
if (process.argv.includes('--check')) {
  const bad = median(morning) > 3000 || median(first) > 2500;
  console.log(bad ? 'FAIL startup budget (reload 3000 ms, first screen 2500 ms)' : 'OK startup budget');
  process.exit(bad ? 1 : 0);
}
