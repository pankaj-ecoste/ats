// Speed with a lot of leads: every page must still open quickly with 5,000 and with 20,000 leads in the app.
// Before the lookups were indexed, 20,000 leads made the Applications page take 12 seconds, the Pipeline 10 and the Reports 4 (the work
// grew with the square of the list). The budgets are about ten times what a normal laptop needs, so a slow build machine does not fail it, but a
// return of the square-law does.
//   npm run test:e2e:scale            (add `-- dist` to test the single-file build)
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.argv[2] === 'dist' ? 'dist/Ecoste_Recruit_Tracker.html' : 'index.html';
const base = pathToFileURL(resolve(root, target)).href;
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

const BUDGET_MS = { 5000: 1500, 20000: 4000 };
const VIEWS = ['dashboard', 'applications', 'candidates', 'pipeline', 'openings', 'reports', 'interviews', 'tasks'];
const results = [];
const check = (name, ok) => results.push([name, !!ok]);

for (const N of [5000, 20000]) {
  const page = await browser.newPage();
  await page.addInitScript(() => { globalThis.__APP_CONFIG_OVERRIDE = { supabaseUrl: '', anonKey: '' }; });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForSelector('.app');
  const t = await page.evaluate(({ N, VIEWS }) => {
    // N more leads made from the sample ones: spread over the openings and over the stages, 2 skills each
    const c0 = S.candidates[0], a0 = S.applications[0], ops = S.openings.map((o) => o.id);
    const stages = ['New', 'New', 'New', 'Shortlisted', 'Screening', 'Group Interview', 'Personal Interview', 'Rejected', 'Rejected', 'On Hold'];
    const cs = [], as = [];
    for (let i = 0; i < N; i++) {
      const cid = 'C-P' + i;
      cs.push({ ...JSON.parse(JSON.stringify(c0)), id: cid, name: 'Lead ' + i + ' Person', email: 'p' + i + '@x.com', phone: '9' + String(100000000 + i), skills: ['Java', 'SQL'] });
      as.push({ ...JSON.parse(JSON.stringify(a0)), id: 'A-P' + i, cid, opId: ops[i % ops.length], stage: stages[i % stages.length], stageSince: '2026-10-' + String(1 + (i % 28)).padStart(2, '0'), custom: { 'Zeta question': i % 3 ? '' : 'yes' } });
    }
    S.candidates = S.candidates.concat(cs); S.applications = S.applications.concat(as);
    const out = {};
    for (const v of VIEWS) { const s = performance.now(); go(v); out[v] = Math.round(performance.now() - s); }
    let s = performance.now(); go('opening', S.openings[0].id); out.opening = Math.round(performance.now() - s);
    s = performance.now(); go('candidate', cs[5].id); out.candidate = Math.round(performance.now() - s);
    s = performance.now(); for (let i = 0; i < 2000; i++) { getC(cs[i * 7 % N].id); getA('A-P' + (i * 11 % N)); appsOfC(cs[i].id); } out.lookups2000 = Math.round(performance.now() - s);
    // a change must show at once: the lookups know about a new lead and about a removed one
    const before = getC('C-P1') && getA('A-P1');
    repo.remove('applications', 'A-P1'); repo.remove('candidates', 'C-P1');
    out.removedGone = !getC('C-P1') && !getA('A-P1') && appsOfC('C-P1').length === 0;
    repo.insert('candidates', { ...cs[2], id: 'C-NEW', name: 'Brand New' });
    out.addedFound = !!getC('C-NEW') && getC('C-NEW').name === 'Brand New';
    out.hadBefore = !!before;
    return out;
  }, { N, VIEWS });
  const slow = Object.entries(t).filter(([, v]) => typeof v === 'number' && v > BUDGET_MS[N]);
  check(`${N} leads: every page opens within ${BUDGET_MS[N]} ms`, slow.length === 0 || (console.error(N, t), false));
  check(`${N} leads: 2,000 lookups are instant, and a removed or added record is seen at once`, t.lookups2000 < 300 && t.removedGone && t.addedFound && t.hadBefore);
  check(`${N} leads: no script errors`, errors.length === 0 || (console.error(errors), false));
  console.log(`${String(N).padStart(6)} leads: ${VIEWS.map((v) => v + ' ' + t[v]).join(', ')} (ms)`);
  await page.close();
}
await browser.close();
let bad = 0;
for (const [n, ok] of results) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) bad++; }
console.log(bad ? 'FAIL scale' : `OK ${target}: ${results.length} scale checks`);
process.exit(bad ? 1 : 0);
