// Browser check that user actions end up in the data through the services (src/services/).
//   npm run test:e2e:flows            (add `-- dist` to test the single-file build)
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
const ev = (fn, arg) => page.evaluate(fn, arg);

// ---- openings
await ev(() => openingForm());
await page.fill('#opF [name="title"]', 'Flow Test Role');
await page.click('#opSave');
await page.waitForSelector('.scrim', { state: 'detached' });
check('openings: create saves a new opening and opens it', await ev(() => S.openings[0].title === 'Flow Test Role' && R.view === 'opening' && R.param === S.openings[0].id));
check('openings: creation is logged', await ev(() => S.activity[0].text.includes('Flow Test Role')));
await ev(() => openingForm(S.openings[0].id));
await page.fill('#opF [name="title"]', 'Flow Test Role 2');
await page.click('#opSave');
await page.waitForSelector('.scrim', { state: 'detached' });
check('openings: edit updates in place', await ev(() => S.openings[0].title === 'Flow Test Role 2' && S.openings.filter((o) => o.title.startsWith('Flow Test')).length === 1));

// ---- add candidate from resume
const before = await ev(() => ({ c: S.candidates.length, a: S.applications.length }));
await ev(() => addCandidate());
await page.click('#acParse');
await page.click('#acSave');
await page.waitForSelector('.scrim', { state: 'detached' });
const after = await ev(() => ({ c: S.candidates.length, a: S.applications.length, v: R.view, newest: S.applications[0].stage }));
check('add candidate: one candidate and one New application are created', after.c === before.c + 1 && after.a === before.a + 1 && after.newest === 'New');
check('add candidate: lands on the candidate page', after.v === 'candidate');

// ---- candidate profile: notes, documents
await page.click('[data-tab="notes"]');
await page.fill('#noteIn', 'Flow note');
await page.click('#noteAdd');
check('candidate notes: a note is added', await ev(() => getC(R.param).notes[0].text === 'Flow note'));
await page.click('[data-tab="documents"]');
await page.selectOption('[data-doc="1"]', 'Verified');
check('candidate documents: status can be changed', await ev(() => getC(R.param).documents[1].status === 'Verified'));
await page.click('#addDoc');
await page.fill('#dn', 'Payslips');
await page.click('#dS');
await page.waitForSelector('.scrim', { state: 'detached' });
check('candidate documents: a document request is added', await ev(() => getC(R.param).documents.slice(-1)[0].name === 'Payslips'));

// ---- applications: bulk assign
await page.click('[data-go="applications"]');
const ids = await ev(() => S.applications.slice(0, 2).map((a) => a.id));
await ev((l) => { l.forEach((i) => R.sel.add(i)); render(); }, ids);
await page.selectOption('#bulkRec', 'Sneha Kapoor');
check('applications: bulk assign sets the recruiter on every selected row', await ev((l) => l.every((i) => getA(i).recruiter === 'Sneha Kapoor'), ids));

const closeAllModals = () => ev(() => { while (modalStack.length) closeModal(); });
const modalGone = () => page.waitForSelector('.scrim', { state: 'detached', timeout: 5000 }).catch(async (e) => { console.error('page errors:', errors); console.error(await page.evaluate(() => ({ modals: modalStack.length, toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent), title: document.querySelector('.scrim h2')?.textContent }))); throw e; });

// ---- screening call
const sid = await ev(() => { const a = S.applications.find((x) => x.stage === 'Shortlisted'); return a && a.id; });
check('screening: seed has a shortlisted candidate to test with', !!sid);
await ev((id) => screeningCall(id), sid);
await page.click('#callSave');
check('screening: saving a call records outcome and date', await ev((id) => !!getA(id).screening && getA(id).screening.date === today(), sid));
await closeAllModals();

// ---- group interview: schedule, remind, evaluate
const grp = await ev(() => {
  const o = S.openings.find((x) => appsOfOp(x.id).length >= 2);
  const ids = appsOfOp(o.id).slice(0, 2).map((a) => a.id);
  ids.forEach((id) => { repo.update('applications', id, { stage: 'Shortlisted' }); });
  return { op: o.id, ids };
});
await ev((g) => scheduleGI(g.op, g.ids), grp);
await page.click('#giS');
await modalGone();
const sched = await ev((g) => ({ n: S.groups.length, last: S.groups.at(-1).appIds, stages: g.ids.map((i) => getA(i).stage) }), grp);
check('group interview: scheduling creates the group and moves our candidates', grp.ids.every((i) => sched.last.includes(i)) && sched.stages.every((x) => x === 'Group Interview'));
check('group interview: one interview record per candidate', await ev((g) => g.ids.every((i) => S.interviews.some((x) => x.appId === i && x.kind === 'Group')), grp));
const gid = await ev(() => S.groups.at(-1).id);
await ev((id) => groupDetail(id), gid);
await ev((id) => { S.interviews.filter((i) => i.groupId === id).forEach((i) => { i.invite = 'Pending'; }); }, gid);
await page.click('#gRem');
check('group interview: reminder turns Pending invites into Sent', await ev((id) => S.interviews.filter((i) => i.groupId === id).every((i) => i.invite === 'Sent'), gid));
await closeAllModals();
await ev((id) => groupEval(id), gid);
const recs = await ev((id) => S.interviews.filter((i) => i.groupId === id).map((i) => i.id), gid);
// the scheduling dialog also ticks candidates already in Group Interview, so the group can hold more than our two
for (const [k, id] of recs.entries()) await page.selectOption(`[data-rec="${id}"]`, k === 0 ? 'Select for Personal Interview' : 'Reject');
await page.click('#gSub');
await modalGone();
check('group interview: evaluation moves candidates by recommendation', await ev((g) => getA(g.ids[0]).stage === 'Personal Interview' && getA(g.ids[1]).stage === 'Rejected', grp));
check('group interview: group is marked evaluated', await ev((id) => S.groups.find((x) => x.id === id).evaluated === true, gid));

// ---- personal interview: schedule, scorecard, no-show, cancel
const pid = grp.ids[0];
await ev((id) => schedulePI(id), pid);
await page.click('#piS');
await modalGone();
check('personal interview: scheduling adds a Scheduled interview', await ev((id) => { const i = S.interviews.at(-1); return i.appId === id && i.kind === 'Personal' && i.status === 'Scheduled'; }, pid));
const pi1 = await ev(() => S.interviews.at(-1).id);
await ev((id) => piScorecard(id), pi1);
for (let k = 0; k < 5; k++) await page.click(`[data-crit="${k}"] button[data-v="4"]`);
await page.selectOption('#pDec', 'Rejected');
await page.click('#pSub');
await modalGone();
check('personal interview: scorecard completes it and applies the decision', await ev(([id, a]) => { const i = S.interviews.find((x) => x.id === id); return i.status === 'Completed' && i.decision === 'Rejected' && getA(a).stage === 'Rejected'; }, [pi1, pid]));
for (const [btn, status] of [['#iNs', 'No-show'], ['#iCan', 'Cancelled']]) {
  await ev((id) => repo.update('applications', id, { stage: 'Personal Interview' }), pid);
  await ev((id) => schedulePI(id), pid);
  await page.click('#piS');
  await modalGone();
  const iid = await ev(() => S.interviews.at(-1).id);
  await ev((id) => interviewDetail(id), iid);
  await page.click(btn);
  await modalGone();
  check(`interview detail: ${status} is saved`, await ev(([id, st]) => S.interviews.find((x) => x.id === id).status === st, [iid, status]));
}

await browser.close();
for (const [n, ok] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`);
if (errors.length || results.some(([, ok]) => !ok)) { console.error('FAIL', target, errors); process.exit(1); }
console.log(`OK ${target}: ${results.length} flow checks`);
