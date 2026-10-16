// The app reading real data: rows are put into the live Supabase project, a person signs in through the screen, and the pages must show them.
//   npm run test:e2e:data            (add `-- dist` to test the built file)
// Needs DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY in .env. Skips quietly when they are missing.
// Everything it creates carries the prefix zz<tag> (accounts and records) and is removed at the end.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { connect, loadEnv } from '../../scripts/db.mjs';
import { createTestAdmin, newTag, removeTestAccounts } from '../support/accounts.mjs';

loadEnv();
if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.log('SKIP data: DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY are not all set');
  process.exit(0);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.argv[2] === 'dist' ? 'dist/Ecoste_Recruit_Tracker.html' : 'index.html';
const cfg = { supabaseUrl: process.env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''), anonKey: process.env.SUPABASE_ANON_KEY };
const tag = newTag();
const ADMIN = `${tag}_admin`, REC = `${tag}_rec`, PW = 'admin-pass-1';
const OP = `OP-${tag}`, C1 = `C-${tag}a`, C2 = `C-${tag}b`, A1 = `APP-${tag}a`, A2 = `APP-${tag}b`, GI = `GI-${tag}`, I1 = `INT-${tag}`, OF = `OFR-${tag}`, T1 = `T-${tag}`;

const db = connect();
await db.connect();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const results = [];
const check = (name, ok) => results.push([name, !!ok]);
let context;

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
}

// removes this run's records (the audit trail is append-only, so its rows for them need the guard lifted briefly, as removeTestAccounts does)
async function removeTestRecords() {
  await db.query('delete from public.tasks where id = $1', [T1]);
  await db.query('delete from public.candidates where id = any($1)', [[C1, C2]]);
  await db.query('delete from public.openings where id = $1', [OP]);
  await db.query('alter table public.audit_log disable trigger no_delete');
  try {
    await db.query("delete from public.audit_log where row_id like $1 or row_id like $2 or (new_data ->> 'application_id') like $2 or (new_data ->> 'candidate_id') like $3", [`%${tag}%`, `%${tag}%`, `%${tag}%`]);
  } finally {
    await db.query('alter table public.audit_log enable trigger no_delete');
  }
}

// opens each page and names the ones that threw
async function openEach(page, views) {
  const broken = [];
  for (const v of views) {
    page.errors.length = 0;
    await page.click(`#side [data-go="${v}"]`);
    if (page.errors.length) broken.push(`${v}: ${page.errors[0]}`);
  }
  return broken;
}

let page;
try {
  await removeTestRecords();
  await removeTestAccounts(db, tag);
  const adminId = await createTestAdmin(db, tag, PW, 'Test Admin');
  const recId = (await db.query("select app.create_login($1, $2, 'Test Recruiter', 'recruiter'::public.app_role) as id", [REC, PW])).rows[0].id;

  await db.query("insert into public.openings (id, title, dept, recruiter_id, manager_id, positions) values ($1, 'Zed Engineer', 'Engineering', $2, $3, 2)", [OP, recId, adminId]);
  await db.query("insert into public.candidates (id, name, email, skills) values ($1, 'Zed Candidate', $3, '{Java,SQL}'), ($2, 'Second Candidate', $4, '{}')", [C1, C2, `${tag}a@example.com`, `${tag}b@example.com`]);
  await db.query('insert into public.candidate_compensation (candidate_id, current_lpa, expected_lpa) values ($1, 12, 15)', [C1]);
  await db.query("insert into public.candidate_documents (candidate_id, name, status) values ($1, 'Resume.pdf', 'Received'), ($1, 'ID proof', 'Pending')", [C1]);
  await db.query("insert into public.applications (id, candidate_id, opening_id, stage, recruiter_id) values ($1, $3, $5, 'Offer', $6), ($2, $4, $5, 'New', $6)", [A1, A2, C1, C2, OP, recId]);
  await db.query("insert into public.interview_groups (id, opening_id, on_date, at_time, interviewer_ids) values ($1, $2, current_date, '11:30', $3)", [GI, OP, [recId]]);
  await db.query("insert into public.interviews (id, application_id, kind, round, group_id, on_date, at_time, interviewer_ids) values ($1, $2, 'Group', 'Group Interview', $3, current_date, '15:00:00', $4)", [I1, A1, GI, [recId]]);
  await db.query("insert into public.offers (id, application_id, ctc, status) values ($1, $2, 1500000, 'Draft')", [OF, A1]);
  await db.query("insert into public.tasks (id, title, owner_id, due_on) values ($1, 'Call Zed', $2, current_date)", [T1, recId]);
  await db.query("insert into public.notifications (user_id, text) values ($1, 'For the admin only'), ($2, 'For the recruiter only')", [adminId, recId]);

  /* ---- the admin ---- */
  page = await freshPage();
  await signIn(page, ADMIN);
  const s = await page.evaluate((ids) => ({
    op: S.openings.find((o) => o.id === ids.op),
    cands: S.candidates.filter((c) => [ids.c1, ids.c2].includes(c.id)).map((c) => ({ id: c.id, name: c.name, cur: c.curSal, exp: c.expSal, docs: c.documents.map((d) => d.name) })),
    app: S.applications.find((a) => a.id === ids.a1),
    iv: S.interviews.find((i) => i.id === ids.i1),
    gi: S.groups.find((g) => g.id === ids.gi),
    of: S.offers.find((o) => o.id === ids.of),
    task: S.tasks.find((t) => t.id === ids.t1),
    notes: S.notifications.map((n) => n.text),
    user: S.settings.user,
    stored: ['ecoste-ats', 'spectra-ats-v3', 'ecoste-ats-backup'].filter((k) => localStorage.getItem(k) !== null),
  }), { op: OP, c1: C1, c2: C2, a1: A1, i1: I1, gi: GI, of: OF, t1: T1 });
  check('the opening comes from the database, with the recruiter and manager shown by name', s.op && s.op.title === 'Zed Engineer' && s.op.recruiter === 'Test Recruiter' && s.op.manager === 'Test Admin');
  check('the opening status follows its furthest application (the database rule)', s.op && s.op.status === 'Offer');
  check('candidates, salary and documents are there', s.cands.length === 2 && s.cands.find((c) => c.id === C1).exp === 15 && s.cands.find((c) => c.id === C1).docs.join() === 'Resume.pdf,ID proof');
  check('the application and its stage are there', s.app && s.app.stage === 'Offer' && s.app.cid === C1 && s.app.recruiter === 'Test Recruiter');
  check('the interview time and interviewer name are readable, and the group lists its member', s.iv && s.iv.time === '15:00' && s.iv.interviewers[0] === 'Test Recruiter' && s.gi && s.gi.time === '11:30' && s.gi.appIds[0] === A1);
  check('the offer and the task are there', s.of && s.of.ctc === 1500000 && s.task && s.task.owner === 'Test Recruiter');
  check('the admin sees their own notification and not the recruiter\'s', s.notes.includes('For the admin only') && !s.notes.includes('For the recruiter only'));
  check('the signed-in name is the account\'s name', s.user === 'Test Admin');
  check('no business data is kept in this browser', s.stored.length === 0);

  // the pages draw this data
  await page.click('#side [data-go="openings"]');
  check('the Openings page lists the opening', (await page.locator('#content').innerText()).includes('Zed Engineer'));
  await page.click('#side [data-go="candidates"]');
  check('the Candidates page lists the candidate', (await page.locator('#content').innerText()).includes('Zed Candidate'));
  const views = await page.locator('#side [data-go]').evaluateAll((els) => els.map((e) => e.dataset.go));
  const broken = await openEach(page, views);
  check(`every page opens with real data (${views.length} pages) without an error`, broken.length === 0 || (console.error(broken), false));

  /* ---- the recruiter ---- */
  page = await freshPage();
  await signIn(page, REC);
  const r = await page.evaluate(() => ({ notes: S.notifications.map((n) => n.text), user: S.settings.user, ops: S.openings.length }));
  check('the recruiter sees only their own notification', r.notes.length === 1 && r.notes[0] === 'For the recruiter only' && r.user === 'Test Recruiter' && r.ops >= 1);
  for (const v of await page.locator('#side [data-go]').evaluateAll((els) => els.map((e) => e.dataset.go))) await page.click(`#side [data-go="${v}"]`);
  check('the recruiter\'s pages open without an error', page.errors.length === 0 || (console.error(page.errors), false));
} catch (e) {
  check(`unexpected failure: ${String(e.message).split('\n')[0]}`, false);
  if (page) await page.screenshot({ path: resolve(root, 'dist/data-failure.png') }).catch(() => {});
} finally {
  try { await browser.close(); } catch { /* already closed */ }
  try { await removeTestRecords(); await removeTestAccounts(db, tag); } finally { await db.end(); }
}

for (const [n, ok] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`);
if (results.some(([, ok]) => !ok)) { console.error('FAIL', target); process.exit(1); }
console.log(`OK ${target}: ${results.length} data checks`);
