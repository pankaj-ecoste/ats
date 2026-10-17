// Résumés and documents as real files: upload a PDF and a Word file in the browser, read their text, keep the originals in private storage,
// open them again through a short-lived link, refuse bad files in plain words, and catch a candidate who is already in the pool.
//   npm run test:e2e:files            (add `-- dist` to test the built file)
// Needs DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY in .env. Skips quietly when they are missing.
// Everything it creates carries the tag zz<tag> and is removed at the end, files included.
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { connect, loadEnv } from '../../scripts/db.mjs';
import { createTestAdmin, newTag, removeTestAccounts } from '../support/accounts.mjs';
import { makeDocx, makePdf } from '../support/files.mjs';

loadEnv();
if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.log('SKIP files: DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY are not all set');
  process.exit(0);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.argv[2] === 'dist' ? 'dist/Ecoste_Recruit_Tracker.html' : 'index.html';
const url = process.env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const cfg = { supabaseUrl: url, anonKey: process.env.SUPABASE_ANON_KEY };
const tag = newTag();
const ADMIN = `${tag}_admin`, PW = 'admin-pass-1', OP = `OP-${tag}`;
const EMAIL = `${tag}@example.com`;

const db = connect();
await db.connect();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const results = [];
const check = (name, ok) => results.push([name, !!ok]);
const all = async (sql, params) => (await db.query(sql, params)).rows;
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
const saved = (page) => page.waitForFunction(() => writesPending() === 0, null, { timeout: 30000 });
const toasts = (page) => page.locator('.toast').allInnerTexts();
const lines = (n) => [`Zed Candidate ${tag}${n}`, `Senior Java Engineer - Pune - ${n ? `${tag}${n}` : tag}@example.com - +91 90000 12345`, 'SKILLS', 'Java, Spring Boot, SQL, AWS'];

const startedAt = new Date();
const original = (await all('select company, address, signatory, sign_title from public.company_settings'))[0];

// the files this run stored, removed through the storage service as the admin who made them
async function removeTestFiles() {
  const cands = (await all('select id from public.candidates where name like $1', [`%${tag}%`])).map((r) => r.id);
  if (!cands.length) return;
  const apps = (await all('select id from public.applications where candidate_id = any($1)', [cands])).map((r) => r.id);
  const objs = await all("select bucket_id, name from storage.objects where bucket_id in ('resumes', 'documents', 'offer-letters') and split_part(name, '/', 1) = any($1)", [[...cands, ...apps]]);
  if (!objs.length) return;
  const client = createClient(url, process.env.SUPABASE_ANON_KEY);
  const { error } = await client.auth.signInWithPassword({ email: `${ADMIN}@ats.ecoste.in`, password: PW });
  if (error) throw new Error(`could not remove the test files: ${error.message}`);
  for (const b of ['resumes', 'documents', 'offer-letters']) {
    const names = objs.filter((o) => o.bucket_id === b).map((o) => o.name);
    if (names.length) await client.storage.from(b).remove(names);
  }
}
async function removeTestRecords() {
  const cands = (await all('select id from public.candidates where name like $1', [`%${tag}%`])).map((r) => r.id);
  const apps = cands.length ? (await all('select id from public.applications where candidate_id = any($1)', [cands])).map((r) => r.id) : [];
  if (apps.length) {
    await db.query('delete from public.report_events where application_id = any($1)', [apps]);
    await db.query('delete from public.activity where application_id = any($1)', [apps]);
  }
  await db.query('delete from public.activity where text like $1 or actor_id in (select id from public.profiles where username like $2)', [`%${tag}%`, `${tag}\\_%`]);
  await db.query('delete from public.notifications where text like $1', [`%${tag}%`]);
  await db.query('delete from public.candidates where id = any($1)', [cands]);
  await db.query('delete from public.openings where id = $1', [OP]);
  await db.query('alter table public.audit_log disable trigger no_delete');
  try {
    await db.query('delete from public.audit_log where row_id = any($1)', [[...cands, ...apps, OP]]);
    await db.query("delete from public.audit_log where table_name = 'company_settings' and at >= $1", [startedAt]);
  } finally {
    await db.query('alter table public.audit_log enable trigger no_delete');
  }
}

let page;
try {
  await removeTestRecords();
  await removeTestAccounts(db, tag);
  await createTestAdmin(db, tag, PW, 'Test Admin');
  await db.query('update public.company_settings set company = $1', [`Test Co ${tag}`]);   // set up already, so the first-run window stays closed
  await db.query("insert into public.openings (id, title, positions, mandatory, preferred) values ($1, $2, 1, '{Java,SQL}', '{AWS}')", [OP, `Java role ${tag}`]);

  page = await freshPage();
  await signIn(page, ADMIN);

  /* ---- a PDF résumé: read, parsed, saved with its original ---- */
  await page.evaluate((op) => addCandidate(op), OP);
  await page.setInputFiles('#acFile', { name: 'cv.pdf', mimeType: 'application/pdf', buffer: makePdf(lines('')) });
  await page.waitForFunction((t) => document.querySelector('#acTxt').value.includes(t), tag, { timeout: 30000 });
  const txt = await page.inputValue('#acTxt');
  check('a PDF is read into the text box, line by line', txt.includes(`Zed Candidate ${tag}`) && txt.includes('Java, Spring Boot, SQL, AWS') && txt.split('\n').length >= 4);
  check('the person is told the original file is kept', (await page.locator('#acNote').innerText()).includes('cv.pdf was read'));
  await page.click('#acParse');
  check('the parser finds the email and phone in the PDF text', (await page.inputValue('[data-p="email"]')) === EMAIL && (await page.inputValue('[data-p="phone"]')).includes('90000 12345'));
  await page.click('#acSave');
  await page.waitForFunction(() => R.view === 'candidate' && getC(R.param).resumePath, null, { timeout: 30000 });
  await saved(page);
  const cid = await page.evaluate(() => R.param);
  const cand = (await all('select resume_path, resume_name from public.candidates where id = $1', [cid]))[0];
  check('the original file is recorded on the candidate', cand.resume_path.startsWith(`${cid}/F-`) && cand.resume_path.endsWith('-cv.pdf') && cand.resume_name === 'cv.pdf');
  const stored = await all("select name, metadata ->> 'mimetype' as mime, (metadata ->> 'size')::int as size from storage.objects where bucket_id = 'resumes' and name = $1", [cand.resume_path]);
  check('the file is in the private resumes bucket', stored.length === 1 && stored[0].mime === 'application/pdf' && stored[0].size > 300);
  const opened = await page.evaluate(async () => {
    const c = getC(R.param), link = await fileLink(sb, FILE_BUCKETS.resume, c.resumePath), r = await fetch(link);
    const publicTry = await fetch(`${APP_SETTINGS.supabaseUrl}/storage/v1/object/public/resumes/${c.resumePath}`);
    return { status: r.status, start: (await r.text()).slice(0, 5), publicStatus: publicTry.status };
  });
  check('a short-lived link opens the real PDF', opened.status === 200 && opened.start === '%PDF-');
  check('the same file is not reachable without that link', opened.publicStatus !== 200);

  /* ---- replacing it with a Word file removes the old one ---- */
  await page.evaluate(() => { R.tab = 'resume'; render(); });
  const chooser = page.waitForEvent('filechooser');
  await page.click('[data-rfup]');
  await (await chooser).setFiles({ name: 'cv-new.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: makeDocx(lines('')) });
  await page.waitForFunction(() => getC(R.param).resumeName === 'cv-new.docx', null, { timeout: 30000 });
  await saved(page);
  const swapped = (await all('select resume_path, resume_name from public.candidates where id = $1', [cid]))[0];
  check('the new file is recorded and the old one is gone from storage', swapped.resume_name === 'cv-new.docx'
    && (await all("select 1 from storage.objects where bucket_id = 'resumes' and name = $1", [swapped.resume_path])).length === 1
    && (await all("select 1 from storage.objects where bucket_id = 'resumes' and name = $1", [cand.resume_path])).length === 0);

  /* ---- a document for the checklist ---- */
  await page.evaluate(() => { R.tab = 'documents'; render(); });
  const chooser2 = page.waitForEvent('filechooser');
  await page.click('[data-dfu="1"]');
  await (await chooser2).setFiles({ name: 'id proof.pdf', mimeType: 'application/pdf', buffer: makePdf(['ID proof']) });
  await page.waitForFunction(() => getC(R.param).documents[1].path, null, { timeout: 30000 });
  await saved(page);
  const doc = (await all('select name, status, storage_path, file_name from public.candidate_documents where candidate_id = $1 order by id', [cid]))[1];
  check('a checklist document is stored, marked Received, and keeps its file name', doc.status === 'Received' && doc.file_name === 'id proof.pdf' && doc.storage_path.startsWith(`${cid}/F-`)
    && (await all("select 1 from storage.objects where bucket_id = 'documents' and name = $1", [doc.storage_path])).length === 1);
  check('the row now offers to open the file', (await page.locator('[data-dfo="1"]').count()) === 1);

  /* ---- bad files are refused in plain words ---- */
  await page.evaluate((op) => { go('candidates'); addCandidate(op); }, OP);
  await page.setInputFiles('#acFile', { name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
  check('an unsupported type is refused', (await toasts(page)).some((t) => /Upload a PDF, Word/.test(t)));
  await page.setInputFiles('#acFile', { name: 'old.doc', mimeType: 'application/msword', buffer: Buffer.from('x'.repeat(50)) });
  check('an old .doc is refused with advice', (await toasts(page)).some((t) => /Save it as .docx or PDF/.test(t)));
  await page.setInputFiles('#acFile', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: makePdf([]) });
  await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => /No readable text/.test(t.textContent)), null, { timeout: 15000 });
  check('a PDF without text is explained as a scan', true);
  await page.setInputFiles('#acFile', { name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('this is not a pdf at all, just words') });
  await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => /PDF could not be read/.test(t.textContent)), null, { timeout: 15000 });
  check('a broken PDF is refused in plain words', true);
  check('the text box is still empty after refused files', (await page.inputValue('#acTxt')) === '');

  /* ---- the same person again: open or apply, never a second profile ---- */
  await page.setInputFiles('#acFile', { name: 'again.txt', mimeType: 'text/plain', buffer: Buffer.from(lines('').join('\n') + '\nMore text so this is long enough to parse.') });
  await page.waitForFunction((t) => document.querySelector('#acTxt').value.includes(t), tag, { timeout: 15000 });
  await page.click('#acParse');
  await page.click('#acSave');
  await page.waitForSelector('#dpOpen', { timeout: 10000 });
  check('the same email opens "Already in your pool"', (await page.locator('.modal').innerText()).includes(`Zed Candidate ${tag}`) && (await page.locator('.modal').innerText()).includes('already applied'));
  check('no second profile was created', (await all('select id from public.candidates where lower(email) = $1', [EMAIL])).length === 1);
  await page.click('#dpOpen');
  check('Open profile goes to the existing candidate', (await page.evaluate(() => R.view === 'candidate' && R.param)) === cid);
  /* ---- messages: handed to the person's own email app and WhatsApp, and recorded ---- */
  const aid = await page.evaluate(() => S.applications.find((a) => a.cid === R.param).id);
  await page.evaluate(({ c, a }) => composeMsg(c, a, 'Email'), { c: cid, a: aid });
  await page.fill('#sub', `Hello ${tag}`);
  await page.click('#snd');
  await saved(page);
  await page.evaluate(({ c, a }) => composeMsg(c, a, 'WhatsApp'), { c: cid, a: aid });
  await page.click('#snd');
  await saved(page);
  const msgs = await all('select channel, template, subject, status, sent_by is not null as by, left(body, 10) as body from public.messages where candidate_id = $1 order by created_at', [cid]);
  check('both messages are recorded as sent, with who sent them', msgs.length === 2 && msgs.every((m) => m.status === 'Sent' && m.by) && msgs[0].channel === 'Email' && msgs[0].subject === `Hello ${tag}` && msgs[1].channel === 'WhatsApp');
  check('the message body is the template text', msgs[0].body.startsWith('Hi Zed'));
  await page.evaluate(() => { R.tab = 'messages'; render(); });
  check('the Messages tab lists them', (await page.locator('#content .list-it').count()) >= 2 && (await page.locator('#content').innerText()).includes(`Hello ${tag}`));

  /* ---- the offer letter as sent is kept ---- */
  const ofr = await page.evaluate((a) => {
    const op = getOp(getA(a).opId);
    const w = { id: uid('OFR'), appId: a, designation: op.title, dept: 'Engineering', location: 'Pune', joining: addDays(30), manager: 'Test Admin', empType: 'Full-time', ctc: 800000, breakup: autoSplit(800000),
      status: 'Draft', created: today(), sent: null, custom: null, probation: 6, validity: 7, _new: true };
    saveOffer(w, 'Sent'); markOfferSent(w.id);
    return w.id;
  }, aid);
  await page.evaluate((id) => saveSentLetter(id), ofr);
  await saved(page);
  const lp = (await all('select letter_path from public.offers where id = $1', [ofr]))[0].letter_path;
  check('the letter is stored under its application and recorded on the offer', lp && lp.startsWith(`${aid}/F-`) && (await all("select 1 from storage.objects where bucket_id = 'offer-letters' and name = $1", [lp])).length === 1);
  const letter = await page.evaluate(async (id) => { const f = S.offers.find((x) => x.id === id); return (await (await fetch(await fileLink(sb, FILE_BUCKETS.letter, f.letterPath))).text()); }, ofr);
  check('the stored letter is the letter that was sent', letter.includes('<!doctype html>') && letter.includes(`Zed Candidate ${tag}`) && letter.includes(`Test Co ${tag}`));
  check('no page error happened during the whole run', page.errors.length === 0 || (console.error(page.errors), false));
} catch (e) {
  check(`unexpected failure: ${String(e.message).split('\n')[0]}`, false);
  if (page) await page.screenshot({ path: resolve(root, 'dist/files-failure.png') }).catch(() => {});
} finally {
  try { await browser.close(); } catch { /* already closed */ }
  try {
    await removeTestFiles();
    await db.query('update public.company_settings set company = $1, address = $2, signatory = $3, sign_title = $4', [original.company, original.address, original.signatory, original.sign_title]);
    await removeTestRecords();
    await removeTestAccounts(db, tag);
  } finally { await db.end(); }
}

for (const [n, ok] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`);
if (results.some(([, ok]) => !ok)) { console.error('FAIL', target); process.exit(1); }
console.log(`OK ${target}: ${results.length} file checks`);
