// The deployed folder (dist/site) under the real Content-Security-Policy from vercel.json: nothing the app does may be blocked,
// it must reach no outside address, and the policy must really stop injected script and a connection to any other database project.
//   npm run test:e2e:csp            (always tests dist/site, so build first)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { makePdf } from '../support/files.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const headers = Object.fromEntries(JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')).headers[0].headers.map((h) => [h.key, h.value]));
const SITE = resolve(root, 'dist/site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  const file = resolve(SITE, '.' + (path === '/' ? '/index.html' : path));
  if (!file.startsWith(SITE) || !existsSync(file)) { res.writeHead(404).end(); return; }
  const ext = file.slice(file.lastIndexOf('.'));
  res.writeHead(200, { ...(process.env.NO_CSP ? {} : headers), 'Content-Type': TYPES[ext] || 'application/octet-stream' }).end(readFileSync(file));
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage();
await page.addInitScript(() => {
  globalThis.__APP_CONFIG_OVERRIDE = { supabaseUrl: '', anonKey: '' };
  globalThis.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => globalThis.__csp.push(`${e.violatedDirective}: ${e.blockedURI}`));
});
const errors = [], outside = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => { if (!r.url().includes(PROBE) && !r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) outside.push(r.url()); });
const PROBE = 'attacker-project.supabase.co';
const results = [];
const check = (name, ok) => results.push([name, !!ok]);

await page.goto(base + '/');
check('the response carries the policy and the security headers', ['Content-Security-Policy', 'X-Frame-Options', 'Strict-Transport-Security', 'X-Content-Type-Options'].every((k) => headers[k]));
for (const v of await page.evaluate(() => NAV.filter((n) => n[0] !== 'sep').map((n) => n[0]))) { await page.evaluate((x) => go(x), v); }
check('every page opens', errors.length === 0);

const pdfText = await page.evaluate(async (bytes) => {
  const f = new File([new Uint8Array(bytes)], 'cv.pdf', { type: 'application/pdf' });
  try { return await resumeTextFromFile(f, loadPdfReader); } catch (e) { return 'ERROR ' + e.message; }
}, [...makePdf(['Asha Rao', 'Senior Analyst, 6 years of experience', 'Java, Spring Boot, SQL, AWS', 'asha@example.com  +91 90000 12345'])]);
if (!/Asha Rao/.test(String(pdfText))) console.error(pdfText, await page.evaluate(() => globalThis.__csp), errors);
check('a PDF is read under the policy', /Asha Rao/.test(String(pdfText)));

const xlsx = await page.evaluate(async () => { const X = await loadExcel(); const wb = await window.SheetsIO.build(X, S); return (await wb.xlsx.writeBuffer()).byteLength; });
check('the Excel export works under the policy', xlsx > 5000);

const appViolations = await page.evaluate(() => globalThis.__csp);
check('the app: no policy violations', appViolations.length === 0 || (console.error(appViolations), false));

// the policy has to bite: injected inline script does not run, and the page cannot talk to a database project that is not ours
const probe = await page.evaluate(async () => {
  globalThis.__ran = false;
  const s = document.createElement('script'); s.textContent = 'globalThis.__ran = true'; document.head.appendChild(s);
  let reached = true;
  try { await fetch('https://attacker-project.supabase.co/rest/v1/', { mode: 'no-cors' }); } catch { reached = false; }
  return { ran: globalThis.__ran, reached };
});
check('injected inline script does not run', probe.ran === false);
check('a connection to another Supabase project is refused', probe.reached === false);
// text that someone pasted into an offer letter is cleaned; a stored page is locked before it opens
const cleaned = await page.evaluate(() => ({
  attack: cleanHtml('<p onclick="x()" class="k">Hi <b>there</b><script>bad()</script><img src="https://evil.example/p.png" onerror="y()"><a href="javascript:z()">link</a><iframe src="//e"></iframe></p>'),
  keeps: cleanHtml('<div style="text-align:right"><table><tr><td colspan="2">A</td></tr></table><img alt="" src="data:image/png;base64,AAAA"></div>'),
  css: cleanHtml('<p style="background:url(https://evil.example/x)">t</p>'),
  locked: lockPage('<!doctype html><html><head><title>x</title></head><body>b</body></html>'),
  lockedBare: lockPage('<p>no head</p>'),
}));
check('the letter cleaner removes scripts, handlers, frames, outside pictures and live links', cleaned.attack === '<p class="k">Hi <b>there</b><img><a>link</a></p>' || (console.error(cleaned.attack), false));
check('the letter cleaner keeps layout and an embedded picture', /text-align:right/.test(cleaned.keeps) && /colspan="2"/.test(cleaned.keeps) && /src="data:image\/png/.test(cleaned.keeps));
check('the letter cleaner drops style that fetches', cleaned.css === '<p>t</p>');
check('a stored page is locked: the policy comes first', /<head><meta http-equiv="Content-Security-Policy"/.test(cleaned.locked) && cleaned.lockedBare.startsWith('<meta http-equiv="Content-Security-Policy"'));
const scriptSrc = (headers['Content-Security-Policy'].match(/script-src ([^;]*)/) || [])[1] || '';
check("script-src allows only this site's files (no 'unsafe-inline', no 'unsafe-eval')", scriptSrc.trim() === "'self'");
check('connect-src names the database project, not a wildcard', !/\*/.test((headers['Content-Security-Policy'].match(/connect-src ([^;]*)/) || [])[1] || '*'));
await page.goto(base + '/careers.html');
await page.waitForTimeout(500);
check('the careers page loads under the policy', (await page.locator('body').innerText()).length > 0);

const violations = await page.evaluate(() => globalThis.__csp);
check('the careers page: no policy violations', violations.length === 0 || (console.error(violations), false));
check('no request leaves for another address (no fonts, no CDN)', outside.length === 0 || (console.error(outside), false));
check('no script errors', errors.length === 0 || (console.error(errors), false));
await browser.close(); server.close();
let bad = 0;
for (const [n, ok] of results) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) bad++; }
console.log(bad ? 'FAIL csp' : `OK csp: ${results.length} checks`);
process.exit(bad ? 1 : 0);
