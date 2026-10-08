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

// ---- offer -> joining -> onboarding -> employee ready
const oa = await ev(() => { const a = S.applications.find((x) => !offerOfA(x.id) && x.stage === 'New'); repo.update('applications', a.id, { stage: 'Selected' }); return a.id; });
const tasksBefore = await ev(() => S.tasks.length);
await ev((id) => offerEditor(null, id), oa);
await page.click('#ofSend');
await modalGone();
const of1 = await ev((id) => { const f = offerOfA(id); return { id: f.id, status: f.status, sent: f.sent, stage: getA(id).stage }; }, oa);
check('offer: sending stores a Sent offer with the send date and moves the candidate to Offer', of1.status === 'Sent' && of1.sent === (await ev(() => today())) && of1.stage === 'Offer');
check('offer: sending creates a follow-up task', (await ev(() => S.tasks.length)) === tasksBefore + 1);
await ev((id) => offerResponse(id), of1.id);
await page.click('[data-r="Accepted"]');
await page.waitForSelector('#jS');
await page.click('#jS');
await modalGone();
check('offer: accepting then confirming joining reaches Joining and sets the date on the offer', await ev(([a, f]) => getA(a).stage === 'Joining' && !!getA(a).joining && S.offers.find((o) => o.id === f).joining === getA(a).joining, [oa, of1.id]));
await ev((id) => markJoined(id), oa);
await page.click('#cOK');
check('onboarding: marking joined starts the checklist', await ev((id) => getA(id).stage === 'Onboarding' && !!S.onboarding.find((o) => o.appId === id), oa));
const items = await ev((id) => S.onboarding.find((o) => o.appId === id).items.length, oa);
for (let k = 0; k < items; k++) await page.click(`[data-ob="${oa}"][data-k="${k}"]`);
check('onboarding: every checklist item can be ticked', await ev((id) => S.onboarding.find((o) => o.appId === id).items.every((i) => i.done), oa));
await page.click(`[data-ready="${oa}"]`);
check('onboarding: mark employee ready finishes the journey', await ev((id) => getA(id).stage === 'Employee Ready', oa));
await closeAllModals();

// ---- job posting
const pb = await ev(() => ({ op: S.openings[0].id, board: boards().find((b) => b.type === 'board').id }));
const postsBefore = await ev(() => S.postings.length);
await ev((x) => markPosted(getOp(x.op), boards().find((b) => b.id === x.board)), pb);
await page.fill('#mpu', 'https://example.com/job/1');
await page.click('#mpsave');
await modalGone();
check('posting: saving a listing adds a posting record', await ev((n) => S.postings.length === n + 1 && S.postings.at(-1).url === 'https://example.com/job/1', postsBefore));
await ev((x) => markPosted(getOp(x.op), boards().find((b) => b.id === x.board)), pb);
await page.click('#mpdel');
await modalGone();
check('posting: removing the record deletes it', await ev((n) => S.postings.length === n, postsBefore));
await ev(() => postingSettings());
await page.fill('#psh', '#flowtest');
await page.click('#pssave');
await modalGone();
check('posting settings: saved into the posting config', await ev(() => S.postCfg.hashtags === '#flowtest'));

// ---- pipeline SLA rules
await ev(() => slaModal());
const firstSla = await ev(() => document.querySelector('[data-sla]').dataset.sla);
await page.fill(`[data-sla="${firstSla}"]`, '9');
await page.click('#slaSave');
await modalGone();
check('SLA rules: saved into settings', await ev((k) => S.settings.sla[k] === 9, firstSla));

// ---- settings page
await page.click('[data-go="settings"]');
await page.fill('[data-s="company"]', 'Flow Test Co');
await page.dispatchEvent('[data-s="company"]', 'change');
check('settings: a field change is saved', await ev(() => S.settings.company === 'Flow Test Co'));
await page.$eval('[data-w="skills"]', (el) => { el.value = 33; el.dispatchEvent(new Event('change')); });
check('settings: a match weight change is saved', await ev(() => S.settings.weights.skills === 33));
await page.click('#wReset');
check('settings: restore default weights', await ev(() => S.settings.weights.skills === DEFAULT_SETTINGS.weights.skills && S.settings.threshold === 65));
await page.click('#resetAll');
await page.click('#cOK');
check('settings: reset demo data restores the sample company and clears our test data', await ev(() => S.settings.company === DEFAULT_SETTINGS.company && !S.openings.some((o) => o.title.startsWith('Flow Test'))));

await browser.close();
for (const [n, ok] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`);
if (errors.length || results.some(([, ok]) => !ok)) { console.error('FAIL', target, errors); process.exit(1); }
console.log(`OK ${target}: ${results.length} flow checks`);
