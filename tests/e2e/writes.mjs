// The app saving real work: use cases run in the signed-in app, the rows are checked in the live Supabase project,
// then the page is reloaded and the same data must come back. Also checks that a refusal is shown in plain words.
//   npm run test:e2e:writes            (add `-- dist` to test the built file)
// Needs DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY in .env. Skips quietly when they are missing.
// Everything it creates carries the tag zz<tag> in a title or name and is removed at the end; the settings it changes are put back.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { connect, loadEnv } from '../../scripts/db.mjs';
import { createTestAdmin, newTag, removeTestAccounts } from '../support/accounts.mjs';

loadEnv();
if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.log('SKIP writes: DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY are not all set');
  process.exit(0);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.argv[2] === 'dist' ? 'dist/Ecoste_Recruit_Tracker.html' : 'index.html';
const cfg = { supabaseUrl: process.env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''), anonKey: process.env.SUPABASE_ANON_KEY };
const tag = newTag();
const ADMIN = `${tag}_admin`, REC = `${tag}_rec`, PW = 'admin-pass-1';
const MONTH = '2099-01';

const db = connect();
await db.connect();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const results = [];
const check = (name, ok) => results.push([name, !!ok]);
let context;
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const all = async (sql, params) => (await db.query(sql, params)).rows;

async function freshPage() {
  if (context) await context.close();
  context = await browser.newContext();
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript((c) => { globalThis.__APP_CONFIG_OVERRIDE = c; }, cfg);
  await page.goto(pathToFileURL(resolve(root, target)).href);
  return page;
}
async function signIn(page, user) {
  await page.waitForSelector('#loginForm', { state: 'visible', timeout: 15000 });
  await page.fill('#loginForm [name="username"]', user);
  await page.fill('#loginForm [name="password"]', PW);
  await page.click('#loginBtn');
  await page.waitForSelector('.app', { state: 'visible', timeout: 20000 });
  await page.evaluate(() => { window.__dataErrors = []; onEvent('data:error', (e) => window.__dataErrors.push(e.message)); });
}
const saved = (page) => page.waitForFunction(() => writesPending() === 0, null, { timeout: 30000 });

// removes this run's records (audit rows are append-only, so their removal needs the guard lifted briefly, as removeTestAccounts does)
const startedAt = new Date();
async function removeTestRecords() {
  const cands = (await all('select id from public.candidates where name like $1', [`%${tag}%`])).map((r) => r.id);
  const apps = cands.length ? (await all('select id from public.applications where candidate_id = any($1)', [cands])).map((r) => r.id) : [];
  const ops = (await all('select id from public.openings where title like $1', [`%${tag}%`])).map((r) => r.id);
  if (apps.length) {
    await db.query('delete from public.report_events where application_id = any($1)', [apps]);
    await db.query('delete from public.activity where application_id = any($1)', [apps]);
  }
  await db.query("delete from public.activity where text like $1 or actor_id in (select id from public.profiles where username like $2)", [`%${tag}%`, `${tag}\\_%`]);
  await db.query('delete from public.tasks where title like $1', [`%${tag}%`]);
  await db.query('delete from public.monthly_targets where month = $1', [MONTH]);
  const offers = apps.length ? (await all('select id from public.offers where application_id = any($1)', [apps])).map((r) => r.id) : [];
  await db.query('delete from public.candidates where id = any($1)', [cands]);
  await db.query('delete from public.openings where id = any($1)', [ops]);
  await db.query('alter table public.audit_log disable trigger no_delete');
  try {
    await db.query('delete from public.audit_log where row_id = any($1)', [[...cands, ...apps, ...ops, ...offers]]);
    // putting the company settings back is a console change with no person behind it; only this run's own are removed
    await db.query("delete from public.audit_log where table_name = 'company_settings' and actor_id is null and at >= $1", [startedAt]);
  } finally {
    await db.query('alter table public.audit_log enable trigger no_delete');
  }
}

const original = await one('select company, signatory from public.company_settings');
let page;
try {
  await removeTestRecords();
  await removeTestAccounts(db, tag);
  await createTestAdmin(db, tag, PW, 'Test Admin');
  await db.query("select app.create_login($1, $2, 'Test Recruiter', 'recruiter'::public.app_role)", [REC, PW]);

  /* ---- an admin does a day's work ---- */
  page = await freshPage();
  await signIn(page, ADMIN);
  const made = await page.evaluate((t) => {
    const op = saveOpening({ id: uid('OP'), title: `Zed Opening ${t}`, dept: 'Engineering', positions: 1, location: 'Pune', mode: 'Hybrid', type: 'Full-time', expMin: 1, expMax: 3, salMin: 5, salMax: 9,
      education: 'Graduate', mandatory: ['Java'], preferred: ['SQL'], desc: 'd', resp: 'r', req: 'q', recruiter: 'Test Recruiter', manager: 'Test Admin', opened: today(), target: addDays(30), priority: 'High', status: 'Open' });
    const fields = { name: `Zed Candidate ${t}`, designation: 'Engineer', company: 'Acme', exp: 2, location: 'Pune', education: 'Graduate', eduField: 'General', university: 'X', gradYear: 2022, skills: ['Java', 'SQL'],
      curSal: 6, expSal: 8, notice: 30, reloc: false, email: `${t}@example.com`, phone: '+91 9000000000', certifications: [], achievements: [], documents: [{ name: 'Resume.pdf', status: 'Received' }], notes: [],
      source: 'Referral', created: today(), history: [], resumeText: 'Zed' };
    const { cid, aid } = createCandidateApplication(fields, op.id);
    moveStage(aid, 'Shortlisted');
    recordScreening(aid, { outcome: 'Qualified', answers: ['Yes'], notes: 'Good call', duration: 95 });
    moveStage(aid, 'Screening');
    schedulePersonalInterview({ appId: aid, round: 'Technical', date: today(), time: '10:30', duration: 60, mode: 'Google Meet', link: '', location: '', interviewers: ['Test Recruiter'] });
    addCandidateNote(cid, 'Called and happy');
    requestDocument(cid, 'PAN card');
    const task = addTask({ title: `Call ${t}`, due: today(), priority: 'High', related: op.title, owner: 'Test Admin' });
    setTaskDone(task.id, true);
    const w = { id: uid('OFR'), appId: aid, designation: op.title, dept: 'Engineering', location: 'Pune', joining: addDays(30), manager: 'Test Admin', empType: 'Full-time', ctc: 800000, breakup: autoSplit(800000),
      status: 'Draft', created: today(), sent: null, custom: null, probation: 6, validity: 7, _new: true };
    saveOffer(w, 'Draft');
    beginOnboarding(aid);
    setOnboardingItem(aid, 0, true);
    saveMonthlyTargets([['2099-01', 'target', 5], ['2099-01', 'budget', 70000]]);
    updateSetting('signatory', `Signatory ${t}`);
    return { opId: op.id, cid, aid, taskId: task.id, offerId: w.id, onbItems: ONB_TEMPLATE.length };
  }, tag);
  await saved(page);
  check('nothing was refused while saving', (await page.evaluate(() => window.__dataErrors)).length === 0);

  const op = await one('select * from public.openings where id = $1', [made.opId]);
  check('the opening is saved with its recruiter and manager as accounts', op && op.title.includes(tag) && op.recruiter_id && op.manager_id && op.created_by);
  const cand = await one('select * from public.candidates where id = $1', [made.cid]);
  check('the candidate is saved, with the note', cand && cand.skills.join() === 'Java,SQL' && cand.notes.length === 1 && cand.notes[0].text === 'Called and happy' && cand.created_by);
  const comp = await one('select * from public.candidate_compensation where candidate_id = $1', [made.cid]);
  check('the salary is saved apart from the profile', comp && Number(comp.expected_lpa) === 8 && Number(comp.current_lpa) === 6);
  const docs = (await all('select name, status from public.candidate_documents where candidate_id = $1 order by id', [made.cid])).map((d) => `${d.name}:${d.status}`);
  check('documents are saved, including the one requested later', docs.join() === 'Resume.pdf:Received,PAN card:Pending');
  const app = await one('select * from public.applications where id = $1', [made.aid]);
  check('the application is at Onboarding (the last move) and keeps the furthest stage', app && app.stage === 'Onboarding' && app.max_stage === 9 && app.recruiter_id === op.recruiter_id);
  const scr = await one('select * from public.screenings where application_id = $1', [made.aid]);
  check('the screening call is saved with its length', scr && scr.outcome === 'Qualified' && scr.duration_seconds === 95);
  const iv = await one('select * from public.interviews where application_id = $1', [made.aid]);
  check('the interview is saved with the interviewer as an account', iv && iv.round === 'Technical' && String(iv.at_time).startsWith('10:30') && iv.interviewer_ids.length === 1);
  const task = await one('select * from public.tasks where id = $1', [made.taskId]);
  check('the task is saved, assigned and ticked off', task && task.done === true && task.owner_id && task.created_by);
  const offer = await one('select * from public.offers where id = $1', [made.offerId]);
  check('the offer is saved with its breakup', offer && Number(offer.ctc) === 800000 && Object.keys(offer.breakup).length > 2 && offer.status === 'Draft');
  const items = await all('select done from public.onboarding_items where application_id = $1 order by position', [made.aid]);
  check('the onboarding checklist is saved with the ticked item', items.length === made.onbItems && items[0].done === true && items[1].done === false);
  const tgt = await one('select * from public.monthly_targets where month = $1', [MONTH]);
  check('monthly targets are saved', tgt && tgt.target === 5 && Number(tgt.budget) === 70000);
  const set = await one('select signatory from public.company_settings');
  check('a company setting is saved', set.signatory === `Signatory ${tag}`);
  const stages = (await all('select to_stage from public.stage_events where application_id = $1 order by id', [made.aid])).map((r) => r.to_stage);
  check('the database recorded every stage move in order, none lost', stages.join() === 'New,Shortlisted,Screening,Personal Interview,Offer,Onboarding');   // the use cases above move the candidate on by scheduling the interview and saving the offer
  check('the opening is Filled once its one position reaches onboarding (the database rule)', (await one('select status from public.openings where id = $1', [made.opId])).status === 'Filled');
  const act = await all('select actor_id from public.activity where application_id = $1', [made.aid]);
  check('the activity feed is saved with who did it', act.length >= 3 && act.every((a) => a.actor_id));
  check('no business data is kept in this browser', await page.evaluate(() => ['ecoste-ats', 'spectra-ats-v3'].every((k) => localStorage.getItem(k) === null)));

  /* ---- reload: everything comes back ---- */
  page = await freshPage();
  await signIn(page, ADMIN);
  const back = await page.evaluate((m) => {
    const c = getC(m.cid), a = getA(m.aid), o = getOp(m.opId);
    return { op: o && o.recruiter, note: c && c.notes[0] && c.notes[0].text, docs: c && c.documents.map((d) => d.name).join(), stage: a && a.stage, screening: a && a.screening && a.screening.outcome,
      iv: S.interviews.filter((i) => i.appId === m.aid).map((i) => i.interviewers.join()).join(), task: S.tasks.find((t) => t.id === m.taskId)?.done, ctc: S.offers.find((f) => f.id === m.offerId)?.ctc,
      onb: S.onboarding.find((x) => x.appId === m.aid)?.items.filter((i) => i.done).length, target: S.monthly['2099-01']?.target, sig: S.settings.signatory };
  }, made);
  check('after a reload everything comes back as it was left',
    back.op === 'Test Recruiter' && back.note === 'Called and happy' && back.docs === 'Resume.pdf,PAN card' && back.stage === 'Onboarding' && back.screening === 'Qualified' && back.iv === 'Test Recruiter'
    && back.task === true && back.ctc === 800000 && back.onb === 1 && back.target === 5 && back.sig === `Signatory ${tag}`);

  // changes after a reload are saved too (the first one made in this session)
  await page.evaluate((m) => { moveStage(m.aid, 'Group Interview'); updateCandidateProfile(m.cid, { notice: 60 }); }, made);
  await saved(page);
  check('changes made after a reload are saved',
    (await one('select stage from public.applications where id = $1', [made.aid])).stage === 'Group Interview' && (await one('select notice_days from public.candidates where id = $1', [made.cid])).notice_days === 60);

  /* ---- a recruiter: allowed work is saved, a forbidden change is refused in plain words ---- */
  page = await freshPage();
  await signIn(page, REC);
  await page.evaluate((t) => { addTask({ title: `Recruiter task ${t}`, due: today(), priority: 'Low', related: 'x', owner: 'Test Recruiter' }); }, tag);
  await saved(page);
  check('a recruiter can add a task', (await all('select 1 from public.tasks where title = $1', [`Recruiter task ${tag}`])).length === 1);
  await page.evaluate((t) => updateSetting('signatory', `Hacked ${t}`), tag);
  await saved(page);
  const refused = await page.evaluate(() => window.__dataErrors);
  check('a recruiter changing company settings is refused with a plain sentence', refused.length === 1 && /Could not save the settings\. You do not have permission/.test(refused[0]));
  check('the refused change did not reach the database', (await one('select signatory from public.company_settings')).signatory === `Signatory ${tag}`);
  check('page errors', page.errors.length === 0 || (console.error(page.errors), false));
} catch (e) {
  check(`unexpected failure: ${String(e.message).split('\n')[0]}`, false);
  console.error(e);
  if (page) await page.screenshot({ path: resolve(root, 'dist/writes-failure.png') }).catch(() => {});
} finally {
  try { await browser.close(); } catch { /* already closed */ }
  try {
    await db.query('update public.company_settings set company = $1, signatory = $2', [original.company, original.signatory]);
    await removeTestRecords();
    await removeTestAccounts(db, tag);
  } finally { await db.end(); }
}

for (const [n, ok] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`);
if (results.some(([, ok]) => !ok)) { console.error('FAIL', target); process.exit(1); }
console.log(`OK ${target}: ${results.length} write checks`);
