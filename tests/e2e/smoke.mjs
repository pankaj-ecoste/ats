// Browser smoke test: opens every page from the sidebar and fails on any uncaught error.
//   npm run test:e2e            tests the multi-file app (index.html)
//   npm run test:e2e -- dist    tests the single-file build (run `npm run build` first)
// Set CHROME_PATH to use an already-installed Chromium/Chrome instead of Playwright's download.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.argv[2] === 'dist' ? 'dist/Ecoste_Recruit_Tracker.html' : 'index.html';

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(resolve(root, target)).href);

const views = await page.evaluate(() => NAV.filter((n) => n[0] !== 'sep').map((n) => n[0]));
const empty = [];
for (const v of views) {
  await page.click(`[data-go="${v}"]`);
  const len = await page.evaluate(() => document.getElementById('content').textContent.trim().length);
  if (len < 20) empty.push(v);
}
await browser.close();

if (errors.length || empty.length) {
  console.error(`FAIL ${target}`, { errors, empty });
  process.exit(1);
}
console.log(`OK ${target}: ${views.length} pages rendered with no errors (${views.join(', ')})`);
