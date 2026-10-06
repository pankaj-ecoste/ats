// Browser check of the extension points in src/app/hooks.js: slots, bind hooks, view decorator, stage event, nav order.
//   npm run test:e2e:hooks            (add `-- dist` to test the single-file build)
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

const results = [];
const check = (name, ok) => results.push([name, !!ok]);
const text = () => page.evaluate(() => document.getElementById('content').textContent);

check('nav order is dashboard, pipeline, openings, posting', await page.evaluate(() => NAV.slice(0, 4).map((n) => n[0]).join() === 'dashboard,pipeline,openings,posting'));

await page.click('[data-go="sheets"]');
check('sheets slot: auto-import card is rendered above the grid', (await text()).includes('Auto-import applications from Google Sheet'));
check('sheets bind hook: connect button is wired', await page.evaluate(() => !!document.getElementById('asconnect')?.onclick));

await page.click('[data-go="applications"]');
check('applications slot: auto-import entry is in the toolbar', (await text()).includes('Auto-import from Google Sheet'));

await page.click('[data-go="dashboard"]');
await page.click('[data-dt="report"]');
check('dashboard decorator: management report tab renders', (await text()).includes('management report'));
await page.click('[data-dt="today"]');
check('dashboard decorator: original dashboard still renders', (await text()).length > 200);

const ev = await page.evaluate(() => {
  const a = S.applications.find((x) => x.stage === 'New');
  const before = (S.events || []).length;
  setStage(a.id, 'Shortlisted', true);
  const added = (S.events || []).slice(before);
  return { stage: a.stage, types: added.map((e) => e.t) };
});
check('stage event: setStage moves the stage', ev.stage === 'Shortlisted');
check('stage event: management report records "shortlist"', ev.types.includes('shortlist'));

await browser.close();
for (const [n, ok] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`);
if (errors.length || results.some(([, ok]) => !ok)) { console.error('FAIL', target, errors); process.exit(1); }
console.log(`OK ${target}: ${results.length} hook checks`);
