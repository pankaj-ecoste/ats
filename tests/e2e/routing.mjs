// Page addresses in a real browser: each screen has a URL, the back button and refresh work, links open the right record.
//   npm run test:e2e:routing            (add `-- dist` to test the single-file build)
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.argv[2] === 'dist' ? 'dist/Ecoste_Recruit_Tracker.html' : 'index.html';
const base = pathToFileURL(resolve(root, target)).href;
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage();
await page.addInitScript(() => { globalThis.__APP_CONFIG_OVERRIDE = { supabaseUrl: '', anonKey: '' }; });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base);

const results = [];
const check = (name, ok) => results.push([name, !!ok]);
const hash = () => page.evaluate(() => location.hash);
const view = () => page.evaluate(() => `${R.view}|${R.param}|${R.tab}`);
const settle = () => page.waitForTimeout(150);

check('the first screen has an address', (await hash()).startsWith('#/'));

await page.click('[data-go="openings"]');
check('opening a page puts it in the address', (await hash()) === '#/openings');

const opId = await page.evaluate(() => S.openings[0].id);
await page.evaluate((id) => go('opening', id), opId);
check('an opening has its own address', (await hash()) === '#/opening/' + encodeURIComponent(opId));

await page.click('[data-tab="applications"]');
check('a tab is part of the address', (await hash()).endsWith('/applications'));

await page.goBack(); await settle();
check('back goes to the opening overview (address and screen agree)', (await hash()) === '#/opening/' + encodeURIComponent(opId) && (await view()) === `opening|${opId}|overview`);

await page.goBack(); await settle();
check('back again goes to the openings list', (await hash()) === '#/openings' && (await view()).startsWith('openings'));

await page.goForward(); await settle();
check('forward returns to the opening', (await view()) === `opening|${opId}|overview`);

const candId = await page.evaluate(() => S.candidates[1].id);
await page.goto(base + '#/candidate/' + candId + '/notes');
await page.reload(); await settle();
check('a pasted link opens that candidate on that tab', (await view()) === `candidate|${candId}|notes`);
check('refresh keeps the screen', (await page.evaluate(() => document.getElementById('content').textContent)).includes(await page.evaluate((id) => getC(id).name, candId)));

await page.goto(base + '#/candidate/NOPE-1'); await page.reload(); await settle();
check('a link to a record that does not exist opens the start page, not an error', (await view()).startsWith('dashboard') && errors.length === 0);

await page.goto(base + '#/nonsense/%E0%A4'); await page.reload(); await settle();
check('a broken address is ignored', (await view()).startsWith('dashboard'));

await page.goto(base + '#/dashboard/today'); await page.reload(); await settle();
check('the dashboard remembers which tab', (await page.evaluate(() => R.dashTab)) === 'today');

check('no errors in the page', errors.length === 0 || (console.error(errors), false));
await browser.close();
let bad = 0;
for (const [name, ok] of results) { console.log((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) bad++; }
console.log(bad ? `FAIL ${target}` : `OK ${target}: ${results.length} routing checks`);
process.exit(bad ? 1 : 0);
