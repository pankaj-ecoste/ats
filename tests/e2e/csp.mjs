// The built app under the real Content-Security-Policy from vercel.json: nothing it does may be blocked, and it must reach no outside address.
//   npm run test:e2e:csp            (always tests dist/, so build first)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { makePdf } from '../support/files.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const headers = Object.fromEntries(JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')).headers[0].headers.map((h) => [h.key, h.value]));
const FILES = { '/': 'dist/Ecoste_Recruit_Tracker.html', '/careers.html': 'dist/careers.html' };
const server = createServer((req, res) => {
  const f = FILES[req.url.split('?')[0]];
  if (!f) { res.writeHead(404).end(); return; }
  res.writeHead(200, { ...(process.env.NO_CSP ? {} : headers), 'Content-Type': 'text/html; charset=utf-8' }).end(readFileSync(resolve(root, f)));
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
page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) outside.push(r.url()); });
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

await page.goto(base + '/careers.html');
await page.waitForTimeout(500);
check('the careers page loads under the policy', (await page.locator('body').innerText()).length > 0);

const violations = await page.evaluate(() => globalThis.__csp);
check('no policy violations', violations.length === 0 || (console.error(violations), false));
check('no request leaves for another address (no fonts, no CDN)', outside.length === 0 || (console.error(outside), false));
check('no script errors', errors.length === 0 || (console.error(errors), false));
await browser.close(); server.close();
let bad = 0;
for (const [n, ok] of results) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) bad++; }
console.log(bad ? 'FAIL csp' : `OK csp: ${results.length} checks`);
process.exit(bad ? 1 : 0);
