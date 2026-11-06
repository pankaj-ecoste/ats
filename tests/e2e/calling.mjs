// The calling queue in a real browser: the right lead first, one tap logs the call and shows the next, Undo writes nothing, the held call is written
// after five seconds or when the person leaves, a connected call asks what next, the keys work, and the screen fits a phone.
//   npm run test:e2e:calling            (add `-- dist` to test the single-file build)
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.argv[2] === 'dist' ? 'dist/Ecoste_Recruit_Tracker.html' : 'index.html';
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage();
await page.addInitScript(() => { globalThis.__APP_CONFIG_OVERRIDE = { supabaseUrl: '', anonKey: '' }; });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(resolve(root, target)).href);
await page.waitForSelector('.app');

const results = [];
const check = (name, ok) => results.push([name, !!ok]);
const settle = () => page.waitForTimeout(120);
const app = (id) => page.evaluate((i) => { const a = getA(i); return { call: a.appCall || null, at: a.appCallAt || null, stage: a.stage }; }, id);
const shown = () => page.evaluate(() => { const c = document.querySelector('[data-cq]'); return c ? c.dataset.cq : null; });
const noteCount = (cid) => page.evaluate((i) => getC(i).notes.length, cid);

// six leads for the signed-in person, applied on six different days; every other lead is out of the way
const ids = await page.evaluate(() => {
  const me = S.settings.user, list = S.applications;
  list.forEach((a) => { a.stage = 'Rejected'; });
  const mine = list.slice(0, 6);
  mine.forEach((a, i) => { Object.assign(a, { recruiter: me, appCall: null, appCallAt: null, stage: 'New', date: '2026-10-' + String(10 + i * 2).padStart(2, '0') }); });
  // the order must come from the date, not from the list: reverse the list
  S.applications.reverse();
  const c = getC(mine[0].cid); c.phone = '98765 43210';
  return mine.map((a) => a.id);
});
const [L1, L2, L3, L4, L5] = ids;

await page.evaluate(() => go('applications')); await page.evaluate(() => go('dashboard'));
check('Calling is in the menu', await page.locator('[data-go="calling"]').count() === 1);
await page.click('[data-go="calling"]');
await page.waitForSelector('[data-cq]');
check('the first lead is the one who applied first, whatever the order of the list', (await shown()) === L1);
check('the title says how many are to call', /6 to call/.test(await page.locator('.page-h p').innerText()));
check('the phone number is a tap-to-call link with the country code', (await page.locator('#cqCall').getAttribute('href')) === 'tel:+919876543210');
check('there is a WhatsApp link', /^https:\/\/wa\.me\/91/.test((await page.locator('.cq-wa').getAttribute('href')) || ''));
check('seven big status buttons and More', await page.locator('.cq-actions [data-cqs]').count() === 7 && await page.locator('[data-cqmore]').count() === 1);
check('the URL has an address of its own', (await page.evaluate(() => location.hash)) === '#/calling');

// a status: the next lead is on screen at once, and nothing is written yet
await page.click('[data-cqs="Busy"]'); await settle();
check('one tap shows the next lead at once', (await shown()) === L2);
check('an Undo bar is shown', await page.locator('.cq-undo').count() === 1);
check('nothing is written during the five seconds', (await app(L1)).call === null);

// undo: back to the same lead, nothing was ever written
await page.click('[data-cqundo]'); await settle();
check('Undo brings the same lead back', (await shown()) === L1);
check('Undo wrote nothing: no call, no time', JSON.stringify(await app(L1)) === JSON.stringify({ call: null, at: null, stage: 'New' }));
check('the Undo bar is gone', await page.locator('.cq-undo').count() === 0);

// a note typed with the call is kept with it
await page.fill('#cqNote', 'Wants a call after 6 pm');
const notesBefore = await noteCount(await page.evaluate((i) => getA(i).cid, L1));
await page.click('[data-cqs="Busy"]'); await settle();
check('the next lead has an empty note box', (await page.inputValue('#cqNote')) === '');
await page.waitForTimeout(5400);
const l1 = await app(L1);
check('after five seconds the call is written: status and time', l1.call === 'Busy' && l1.at > Date.now() - 20000);
check('the note was saved on the person with the call', (await noteCount(await page.evaluate((i) => getA(i).cid, L1))) === notesBefore + 1 && await page.evaluate((i) => getC(getA(i).cid).notes[0].text, L1) === 'Wants a call after 6 pm');
check('a call is in the activity log', await page.evaluate(() => S.activity.some((x) => /Call logged on .*: Busy/.test(x.text))));
check('the Undo bar went by itself', await page.locator('.cq-undo').count() === 0);
check('the screen is still on the second lead', (await shown()) === L2);

// the keys: 3 is Busy; typing in the note box does not trigger them
await page.click('#cqNote'); await page.keyboard.type('3'); await settle();
check('a number typed in the note box is only text', (await shown()) === L2 && (await page.inputValue('#cqNote')) === '3');
await page.fill('#cqNote', '');
await page.evaluate(() => document.activeElement.blur());
await page.keyboard.press('2'); await settle();   // Call not connected
check('key 2 sets Call not connected and shows the next lead', (await shown()) === L3);
// a second tap writes the first at once
await page.keyboard.press('1'); await settle();   // Connected on L3
check('the first status was written when the second was tapped', (await app(L2)).call === 'Call not connected');

// a connected call asks what next and writes nothing until the answer
check('a connected call stays on screen and asks what next', (await shown()) === L3 && await page.locator('.cq-next').count() === 1);
check('the status buttons are replaced by the three answers', await page.locator('[data-cqscreen]').count() === 1 && await page.locator('[data-cqshort]').count() === 1 && await page.locator('[data-cqnext]').count() === 1);
check('nothing is written until the answer', (await app(L3)).call === null);
await page.click('[data-cqchange]'); await settle();
check('Change status goes back to the buttons and writes nothing', await page.locator('[data-cqs]').count() >= 7 && (await app(L3)).call === null && (await shown()) === L3);
await page.click('[data-cqs="Connected"]'); await settle();
await page.fill('#cqNote', 'Interested, notice 30 days');       // typed after the status was tapped: the card is still there
const l3cid = await page.evaluate((i) => getA(i).cid, L3), l3notes = await noteCount(l3cid);
await page.click('[data-cqnext]'); await settle();
check('Next lead writes Connected and shows the next lead', (await app(L3)).call === 'Connected' && (await shown()) === L4);
check('a note typed after tapping Connected is saved with the call', (await noteCount(l3cid)) === l3notes + 1 && await page.evaluate((c) => getC(c).notes[0].text, l3cid) === 'Interested, notice 30 days');

// shortlist after connected
await page.click('[data-cqs="Connected"]'); await settle();
await page.click('[data-cqshort]'); await settle();
const l4 = await app(L4);
check('Shortlist writes the call and moves the lead on', l4.call === 'Connected' && l4.stage === 'Shortlisted');
check('the next lead is shown after shortlisting', (await shown()) === L5);

// screen now: the screening records the call itself, the held one is dropped
await page.click('[data-cqs="Connected"]'); await settle();
await page.click('[data-cqscreen]'); await settle();
check('Screen now opens the screening call', await page.locator('.modal').count() === 1 && /Screening call/.test(await page.locator('.modal h2').first().innerText()));
check('the call is not written twice: nothing yet, the screening writes it when saved', (await app(L5)).call === null);
await page.keyboard.press('Escape').catch(() => {});
await page.evaluate(() => closeModal());
await settle();

// skip and back
await page.evaluate(() => go('calling')); await page.waitForSelector('[data-cq]');
const first = await shown();
await page.click('[data-cqskip]'); await settle();
const second = await shown();
check('Skip shows another lead', second && second !== first);
await page.click('[data-cqback]'); await settle();
check('Previous brings the skipped lead back', (await shown()) === first);

// leaving the page writes what is held
const beforeLeave = await shown();
await page.click('[data-cqs="Not Interested"]'); await settle();
check('held and not yet written', (await app(beforeLeave)).call === null);
await page.click('[data-go="dashboard"]'); await settle();
check('leaving the page writes it', (await app(beforeLeave)).call === 'Not Interested');

// call again, filters, empty state
await page.click('[data-go="calling"]'); await page.waitForSelector('.cq-bar');
await page.click('[data-cqmode="again"]'); await settle();
const again = await page.evaluate(() => cqQueue('again').map((a) => a.id));
check('Call again holds the calls that did not settle, the oldest attempt first', again.includes(L1) && again.includes(L2) && !again.includes(L3) && !again.includes(L4) && !again.includes(beforeLeave));
check('the count in the tab matches', (await page.locator('[data-cqmode="again"]').innerText()).includes('(' + again.length + ')'));
await page.click('[data-cqmode="new"]'); await settle();
await page.uncheck('#cqMine'); await settle();
check('Only my leads can be switched off', await page.evaluate(() => CQ.mine === false));
await page.selectOption('#cqOp', 'OP-NOPE').catch(() => {});
await page.evaluate(() => { CQ.op = 'zz-nothing'; CQ.cur = null; render(); });
check('an empty queue says so and offers a way on', /Nobody left to call/.test(await page.locator('.cq-empty').innerText()));

// a phone
await page.evaluate(() => { CQ.op = ''; CQ.mine = true; CQ.skip.clear(); CQ.back = []; CQ.cur = null; render(); });
await page.setViewportSize({ width: 390, height: 800 });
await page.waitForTimeout(200);
check('on a phone nothing scrolls sideways', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
const hasCard = await page.locator('[data-cq]').count();
if (hasCard) {
  const h = await page.locator('.cq-s').first().evaluate((e) => e.getBoundingClientRect().height);
  check('on a phone the status buttons are large enough to tap (at least 48 px)', h >= 48);
  check('on a phone the Call button fills the width', (await page.locator('#cqCall').evaluate((e) => e.getBoundingClientRect().width)) > 300);
} else check('a lead is left for the phone check', false);

await page.setViewportSize({ width: 1200, height: 800 });
check('no script errors', errors.length === 0 || (console.error(errors), false));
await browser.close();
let bad = 0;
for (const [n, ok] of results) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) bad++; }
console.log(bad ? 'FAIL calling' : `OK ${target}: ${results.length} calling checks`);
process.exit(bad ? 1 : 0);
