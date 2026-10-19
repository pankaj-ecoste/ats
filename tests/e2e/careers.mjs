// The public careers page, used by someone who is not signed in: list the open roles, apply with a PDF, get turned away in plain words,
// and then the staff side: the application is there, the résumé file can be read, and the log shows what happened.
//   npm run test:e2e:careers            (add `-- dist` to test the built file: dist/careers.html and the app)
// Needs DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY in .env. Skips quietly when they are missing.
// Everything it creates carries the tag zz<tag> and is removed at the end, uploaded files included.
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { connect, loadEnv } from '../../scripts/db.mjs';
import { createTestAdmin, newTag, removeTestAccounts } from '../support/accounts.mjs';
import { makePdf } from '../support/files.mjs';

loadEnv();
if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.log('SKIP careers: DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY are not all set');
  process.exit(0);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = process.argv[2] === 'dist';
const url = process.env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const cfg = { supabaseUrl: url, anonKey: process.env.SUPABASE_ANON_KEY };
const tag = newTag();
const ADMIN = `${tag}_admin`, REC = `${tag}_rec`, PW = 'admin-pass-1', OP = `OP-${tag}`, DRAFT = `OP-${tag}d`;
const EMAIL = `${tag}@example.com`;

const db = connect();
await db.connect();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const results = [];
const check = (name, ok) => results.push([name, !!ok]);
const all = async (sql, params) => (await db.query(sql, params)).rows;
const startedAt = new Date();
const original = (await all('select company, address, signatory, sign_title from public.company_settings'))[0];

async function pageFor(file) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript((c) => { globalThis.__APP_CONFIG_OVERRIDE = c; }, cfg);
  await page.goto(pathToFileURL(resolve(root, file)).href);
  return page;
}
// a clean visit to one role's link (the same address would not reload the page)
async function openRole(page) {
  await page.goto('about:blank');
  await page.goto(pathToFileURL(resolve(root, dist ? 'dist/careers.html' : 'careers.html')).href + `#${OP}`);
}
async function fillApplication(page, over = {}) {
  const v = { name: `Asha Rao ${tag}`, email: EMAIL, phone: '+91 98450 11223', location: 'Pune', exp: '3.5', cur: '6', expected: '9', skills: 'Java, SQL', ...over };
  await page.fill('[name=name]', v.name); await page.fill('[name=email]', v.email); await page.fill('[name=phone]', v.phone); await page.fill('[name=location]', v.location);
  await page.fill('[name=exp]', v.exp); await page.fill('[name=cur]', v.cur); await page.fill('[name=expected]', v.expected); await page.fill('[name=skills]', v.skills);
}

async function removeFiles(paths) {
  if (!paths.length) return;
  const client = createClient(url, process.env.SUPABASE_ANON_KEY);
  const { error } = await client.auth.signInWithPassword({ email: `${ADMIN}@ats.ecoste.in`, password: PW });
  if (error) throw new Error(`could not remove the test files: ${error.message}`);
  await client.storage.from('resumes').remove(paths);
}
async function cleanup() {
  const cands = (await all('select id, resume_path from public.candidates where lower(email) like $1', [`${tag}%@example.com`]));
  await removeFiles(cands.map((c) => c.resume_path).filter(Boolean));
  const ids = cands.map((c) => c.id);
  const apps = ids.length ? (await all('select id from public.applications where candidate_id = any($1)', [ids])).map((r) => r.id) : [];
  await db.query('update public.company_settings set company = $1, address = $2, signatory = $3, sign_title = $4', [original.company, original.address, original.signatory, original.sign_title]);
  if (apps.length) await db.query('delete from public.activity where application_id = any($1)', [apps]);
  await db.query('delete from public.activity where text like $1 or actor_id in (select id from public.profiles where username like $2)', [`%${tag}%`, `${tag}\\_%`]);
  await db.query('delete from public.notifications where text like $1', [`%${tag}%`]);
  await db.query('delete from public.report_events where application_id = any($1)', [apps]);
  await db.query('delete from public.candidates where id = any($1)', [ids]);
  await db.query('delete from public.openings where id = any($1)', [[OP, DRAFT]]);
  await db.query('alter table public.audit_log disable trigger no_delete');
  try {
    await db.query('delete from public.audit_log where row_id = any($1)', [[...ids, ...apps, OP, DRAFT]]);
    await db.query("delete from public.audit_log where table_name = 'company_settings' and at >= $1", [startedAt]);
    await db.query("delete from public.intake_batches where detail ->> 'email' like $1", [`${tag}%@example.com`]);
  } finally {
    await db.query('alter table public.audit_log enable trigger no_delete');
  }
}

let page, app;
try {
  await cleanup();
  await removeTestAccounts(db, tag);
  await createTestAdmin(db, tag, PW, 'Test Admin');
  const rec = (await all("select app.create_login($1, $2, 'Test Recruiter', 'recruiter'::public.app_role) as id", [REC, PW]))[0].id;
  await db.query('update public.company_settings set company = $1', [`Test Co ${tag}`]);
  await db.query("insert into public.openings (id, title, dept, location, positions, mandatory, preferred, sal_min, sal_max, recruiter_id, description, status) values ($1, $2, 'Engineering', 'Pune', 1, '{Java,SQL}', '{AWS}', 8, 14, $3, 'Build the backend.', 'Open'), ($4, $5, 'Engineering', 'Pune', 1, '{}', '{}', 8, 14, $3, '', 'Draft')",
    [OP, `Java role ${tag}`, rec, DRAFT, `Secret draft ${tag}`]);

  /* ---- a visitor ---- */
  page = await pageFor(dist ? 'dist/careers.html' : 'careers.html');
  await page.waitForSelector('.card', { timeout: 15000 });
  const text = await page.locator('main').innerText();
  check('the open role is listed with its company', text.includes(`Java role ${tag}`) && (await page.locator('#co').innerText()) === `Test Co ${tag}`);
  check('a draft role is not listed', !text.includes('Secret draft'));
  await page.fill('input[type=search]', 'nomatchxyz');
  check('the search narrows the list', (await page.locator('main').innerText()).includes('No role matches'));
  await page.fill('input[type=search]', tag);
  await page.click('text=View and apply');
  check('the role shows its description and skills, and no salary', (await page.locator('main').innerText()).includes('Build the backend.') && !(await page.locator('main').innerText()).match(/14|LPA|salary range/i));
  check('the role has a link that opens it directly', (await page.evaluate(() => location.hash)) === `#${OP}`);

  // nothing is sent without consent
  await fillApplication(page);
  await page.setInputFiles('[name=resume]', { name: 'Asha CV.pdf', mimeType: 'application/pdf', buffer: makePdf([`Asha Rao ${tag}`, `Senior Java Engineer - Pune - ${EMAIL}`, 'SKILLS', 'Java, Spring Boot, SQL, AWS, Docker']) });
  await page.click('button[type=submit]');
  check('without the consent box nothing is sent', (await all('select 1 from public.candidates where lower(email) = $1', [EMAIL])).length === 0);
  await page.check('[name=consent]');
  await page.click('button[type=submit]');
  await page.waitForSelector('.ok', { timeout: 30000 });
  check('the visitor is thanked', (await page.locator('.ok').innerText()).includes('received'));

  const cand = (await all('select id, name, source, skills, resume_path, resume_name, consent_at, resume_text from public.candidates where lower(email) = $1', [EMAIL]))[0];
  check('the candidate is created from the form, with consent recorded', cand && cand.source === 'Careers Page' && cand.skills.join() === 'Java,SQL' && cand.consent_at && cand.name === `Asha Rao ${tag}`);
  check('the resume went to the private intake folder', cand.resume_path.startsWith('intake/') && cand.resume_name === 'Asha CV.pdf'
    && (await all("select 1 from storage.objects where bucket_id = 'resumes' and name = $1", [cand.resume_path])).length === 1);
  const appl = (await all('select stage, recruiter_id from public.applications where candidate_id = $1', [cand.id]));
  check('a New application is created for the recruiter of the opening', appl.length === 1 && appl[0].stage === 'New' && appl[0].recruiter_id === rec);
  check('the recruiter is notified', (await all("select 1 from public.notifications where user_id = $1 and text like $2", [rec, `%${tag}%`])).length === 1);

  // the same person again, a robot, and a role that closed
  await openRole(page);
  await page.waitForSelector('form');
  await fillApplication(page);
  await page.check('[name=consent]');
  await page.click('button[type=submit]');
  await page.waitForSelector('.ok', { timeout: 30000 });
  check('applying twice says so and adds nothing', (await page.locator('.ok').innerText()).includes('already applied')
    && (await all('select 1 from public.applications where candidate_id = $1', [cand.id])).length === 1);
  await openRole(page);
  await page.waitForSelector('form');
  await fillApplication(page, { email: `${tag}bot@example.com` });
  await page.check('[name=consent]');
  await page.evaluate(() => { document.querySelector('[name=website]').value = 'http://spam.example'; });
  await page.click('button[type=submit]');
  await page.waitForSelector('.ok', { timeout: 30000 });
  check('a robot is told it worked and nothing is created', (await all('select 1 from public.candidates where lower(email) = $1', [`${tag}bot@example.com`])).length === 0);
  await openRole(page);
  await page.waitForSelector('form');
  await db.query("update public.openings set status = 'Closed' where id = $1", [OP]);
  await fillApplication(page, { email: `${tag}late@example.com` });
  await page.check('[name=consent]');
  await page.click('button[type=submit]');
  await page.waitForSelector('.err:not(:empty)', { timeout: 30000 });
  check('a closed role is refused in plain words', (await page.locator('.err').innerText()).includes('no longer accepting'));
  await db.query("update public.openings set status = 'Open' where id = $1", [OP]);
  check('the careers page had no page errors', page.errors.length === 0 || (console.error(page.errors), false));

  /* ---- the staff side ---- */
  app = await (async () => {
    const p = await pageFor(dist ? 'dist/Ecoste_Recruit_Tracker.html' : 'index.html');
    await p.waitForSelector('#loginForm', { state: 'visible', timeout: 15000 });
    await p.fill('#loginForm [name="username"]', ADMIN); await p.fill('#loginForm [name="password"]', PW);
    await p.click('#loginBtn'); await p.waitForSelector('.app', { state: 'visible', timeout: 20000 });
    return p;
  })();
  await app.evaluate((id) => go('candidate', id), cand.id);
  await app.evaluate(() => { R.tab = 'resume'; render(); });
  check('the profile shows the consent', (await app.evaluate(() => { R.tab = 'overview'; render(); return document.querySelector('#content').innerText; })).includes('Agreed on'));
  await app.evaluate(() => { R.tab = 'resume'; render(); });
  await app.click('[data-rfread]');
  await app.waitForFunction(() => getC(R.param).resumeText.includes('Spring Boot'), null, { timeout: 40000 });
  await app.waitForFunction(() => writesPending() === 0, null, { timeout: 30000 });
  const filled = (await all('select resume_text, skills, designation from public.candidates where id = $1', [cand.id]))[0];
  check('Read the file fills the resume text and adds the skills found, keeping what was typed', filled.resume_text.includes('Senior Java Engineer') && filled.skills.includes('Spring Boot') && filled.skills.includes('Java') && filled.skills.length > 2);
  await app.evaluate(() => go('settings'));
  await app.waitForSelector('text=Careers page');
  const log = await app.locator('main, #content').first().innerText();
  check('Settings lists what arrived and what was turned away', log.includes(EMAIL) && log.includes('Added') && log.includes('Applied before') && log.includes('no longer accepting'));
  check('the staff screens had no page errors', app.errors.length === 0 || (console.error(app.errors), false));
} catch (e) {
  check(`unexpected failure: ${String(e.message).split('\n')[0]}`, false);
  for (const [n, p] of [['careers', page], ['app', app]]) if (p) await p.screenshot({ path: resolve(root, `dist/${n}-failure.png`) }).catch(() => {});
} finally {
  try { await browser.close(); } catch { /* already closed */ }
  try { await cleanup(); await removeTestAccounts(db, tag); } finally { await db.end(); }
}

for (const [n, ok] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`);
if (results.some(([, ok]) => !ok)) { console.error('FAIL', dist ? 'dist' : 'source'); process.exit(1); }
console.log(`OK ${dist ? 'dist' : 'source'}: ${results.length} careers checks`);
