// The live lead sheet, end to end on the real Supabase project: an admin signs in, sets it up in Settings, the generated script is run against a
// pretend Google Sheet but talks to the real database, and the leads show up in the app. Then a wrong token, a new script and switching off.
//   npm run test:e2e:lead-feed            (add `-- dist` to test the built file)
// Needs DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY in .env. Everything it creates carries the prefix zz<tag> and is removed at the end.
// It skips itself when the live lead sheet is already set up for real, so it never changes a real setup.
import { chromium } from 'playwright';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { connect, loadEnv } from '../../scripts/db.mjs';
import { createTestAdmin, newTag, removeTestAccounts } from '../support/accounts.mjs';

loadEnv();
if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.log('SKIP lead-feed: DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY are not all set');
  process.exit(0);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.argv[2] === 'dist' ? 'dist/Ecoste_Recruit_Tracker.html' : 'index.html';
const cfg = { supabaseUrl: process.env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''), anonKey: process.env.SUPABASE_ANON_KEY };
const tag = newTag();
const ADMIN = `${tag}_admin`, PW = 'admin-pass-1', OP = `OP-${tag}`, TITLE = `Lead sheet role ${tag}`;
const results = [];
const check = (name, ok) => results.push([name, !!ok]);

const db = connect();
await db.connect();
const real = (await db.query('select token_hash from public.lead_feed')).rows[0];
if (real && real.token_hash) { console.log('SKIP lead-feed: the live lead sheet is already set up, so this test will not touch it'); await db.end(); process.exit(0); }
const startedAt = new Date();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

// a pretend Google Sheet that runs the generated script; its HTTP calls go to the real project (done in a child process because Apps Script calls are synchronous)
function sheetRun(script, grid) {
  const set = (r, c, v) => { while (grid.length <= r) grid.push([]); while (grid[r].length <= c) grid[r].push(''); grid[r][c] = v; };
  const sheet = {
    getDataRange: () => ({ getValues: () => { const w = Math.max(0, ...grid.map((r) => r.length)); return grid.map((r) => Array.from({ length: w }, (_, i) => (i < r.length ? r[i] : ''))); } }),
    getRange: (r, c) => ({ setValue: (v) => set(r - 1, c - 1, v), setValues: (vs) => vs.forEach((row, i) => row.forEach((v, j) => set(r - 1 + i, c - 1 + j, v))) }),
  };
  const ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheets: () => [sheet], getSheetByName: () => sheet, getSpreadsheetTimeZone: () => 'Asia/Kolkata' }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => {} }) }) }) },
    Utilities: { formatDate: (d, tz, f) => (f === 'yyyy-MM-dd' ? d.toISOString().slice(0, 10) : 'now') },
    UrlFetchApp: { fetch: (url, opts) => {
      const out = execFileSync(process.execPath, ['-e', `
        const [url, o] = JSON.parse(process.env.REQ);
        fetch(url, { method: o.method, headers: { ...o.headers, 'Content-Type': o.contentType }, body: o.payload })
          .then(async (r) => process.stdout.write(JSON.stringify({ code: r.status, text: await r.text() })));`], { env: { ...process.env, REQ: JSON.stringify([url, opts]) }, encoding: 'utf8' });
      const r = JSON.parse(out);
      return { getResponseCode: () => r.code, getContentText: () => r.text };
    } },
  });
  vm.runInContext(script, ctx);
  return () => vm.runInContext('syncLeads()', ctx);
}

let context, page;
async function freshPage() {
  if (context) await context.close();
  context = await browser.newContext();
  page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript((c) => { globalThis.__APP_CONFIG_OVERRIDE = c; }, cfg);
  await page.goto(pathToFileURL(resolve(root, target)).href);
}
async function signIn() {
  await page.waitForSelector('#loginForm', { state: 'visible', timeout: 15000 });
  await page.fill('#loginForm [name="username"]', ADMIN);
  await page.fill('#loginForm [name="password"]', PW);
  await page.click('#loginBtn');
  await page.waitForSelector('.app', { state: 'visible', timeout: 20000 });
}
const text = (sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
const closeModals = () => page.evaluate(() => { while (typeof modalStack !== 'undefined' && modalStack.length) closeModal(); });

async function cleanup() {
  const cids = (await db.query('select id from public.candidates where name like $1', [`${tag}%`])).rows.map((r) => r.id);
  const aids = cids.length ? (await db.query('select id from public.applications where candidate_id = any($1)', [cids])).rows.map((r) => r.id) : [];
  await db.query('delete from public.candidates where id = any($1)', [cids]);
  await db.query('delete from public.openings where id = $1', [OP]);
  await db.query('delete from public.lead_feed');
  await db.query("delete from public.intake_batches where source = 'sheet' and received_at >= $1", [startedAt]);
  await db.query("delete from public.activity where at >= $1 and (text like $2 or text like 'The live lead sheet%' or text like 'A new lead sheet token%')", [startedAt, `%${TITLE}%`]).catch(() => {});
  await db.query('alter table public.audit_log disable trigger no_delete');
  try {
    await db.query("delete from public.audit_log where row_id = any($1::text[]) or row_id = $2 or (new_data ->> 'candidate_id') = any($1::text[]) or (new_data ->> 'application_id') = any($3::text[])", [cids, OP, aids]);
  } finally { await db.query('alter table public.audit_log enable trigger no_delete'); }
  await removeTestAccounts(db, tag);
}

try {
  const adminId = await createTestAdmin(db, tag, PW);
  await db.query("insert into public.openings (id, title, positions, recruiter_id, status) values ($1, $2, 2, $3, 'Open')", [OP, TITLE, adminId]);
  await freshPage();
  await signIn();

  // ---- set it up in Settings
  await page.evaluate(() => go('settings'));
  await page.waitForSelector('#lfSetup', { timeout: 15000 });
  check('Settings has the Live lead sheet panel for an admin', (await text('#content')).includes('Live lead sheet'));
  await page.selectOption('#lfOp', OP);
  await page.fill('#lfSrc', 'Zz Ad Campaign');
  await page.click('#lfSetup');
  await page.waitForSelector('#lfScript', { timeout: 15000 });
  const script1 = await page.inputValue('#lfScript');
  const token1 = (script1.match(/var APP_TOKEN = "([0-9a-f]{64})"/) || [])[1];
  check('setting up shows the script once, with the app address and a 64-character token', !!token1 && script1.includes(`var APP_URL = "${cfg.supabaseUrl}"`) && script1.includes('installLeadSync'));
  const feed = (await db.query('select token_hash, opening_id, source, enabled from public.lead_feed')).rows[0];
  check('the database keeps the settings and only the hash of the token', feed.opening_id === OP && feed.source === 'Zz Ad Campaign' && feed.enabled === true && feed.token_hash !== token1 && /^[0-9a-f]{64}$/.test(feed.token_hash));
  await closeModals();

  // ---- the script runs in a Google Sheet and talks to the real database
  const grid = [
    ['Date', 'Name', 'Mobile Number', 'Email ID', 'City', 'Campaign'],
    ['12/10/2026', `${tag} Lead A`, '98765 43210', '', 'Pune', 'Instagram Ad'],
    ['', `${tag} Lead B`, 9876500001, `${tag}.b@example.com`, 'Nagpur', ''],
    ['', `${tag} Lead A again`, '+91-98765-43210', '', '', ''],
    ['', '', '98765 00002', '', '', ''],
  ];
  const sync1 = sheetRun(script1, grid);
  sync1();
  check('the sheet marks each row: added, added, duplicate, skipped',
    grid[1][6].startsWith('Added') && grid[2][6].startsWith('Added') && grid[3][6].startsWith('Duplicate') && grid[4][6] === 'Skipped: No name');
  const a = (await db.query("select c.phone, c.location, c.source, c.email, a.stage, a.opening_id, a.recruiter_id from public.candidates c join public.applications a on a.candidate_id = c.id where c.name = $1", [`${tag} Lead A`])).rows[0];
  check('the lead is in the database as New in the chosen opening, with a tidy phone', a && a.phone === '+91 98765 43210' && a.location === 'Pune' && a.source === 'Instagram Ad' && a.stage === 'New' && a.opening_id === OP && a.recruiter_id === adminId);
  const b = (await db.query("select c.phone, c.source, c.email from public.candidates c where c.name = $1", [`${tag} Lead B`])).rows[0];
  check('a number typed as a number and a lead without a campaign take the sheet settings', b && b.phone === '+91 98765 00001' && b.source === 'Zz Ad Campaign' && b.email === `${tag}.b@example.com`);
  const note = (await db.query("select text from public.notifications where user_id = $1 and text like $2", [adminId, `%${TITLE}%`])).rows[0];
  check('the opening\'s recruiter is told', note && /^2 new leads from the lead sheet for/.test(note.text));
  sync1();
  check('running it again sends nothing new', (await db.query('select count(*)::int n from public.candidates where name like $1', [`${tag}%`])).rows[0].n === 2);

  // ---- the leads are in the app, and the panel shows what arrived
  await page.reload();
  await page.waitForSelector('.app', { state: 'visible', timeout: 20000 });
  await page.evaluate(() => go('candidates'));
  await page.waitForSelector('#cq', { timeout: 15000 });
  await page.fill('#cq', tag);
  await page.waitForFunction((n) => document.getElementById('content').textContent.includes(n), `${tag} Lead B`, { timeout: 15000 }).catch(() => {});
  check('the leads show in the Candidates list', (await text('#content')).includes(`${tag} Lead A`) && (await text('#content')).includes(`${tag} Lead B`));
  await page.evaluate(() => go('settings'));
  await page.waitForSelector('#lfOn', { timeout: 15000 });
  const panel = await text('#content');
  check('the panel shows when leads last arrived and what each batch did', /Last received:\s*just now|Last received:\s*\d+ min ago/.test(panel) && /4 rows: 2 added/.test(panel) && /1 duplicates/.test(panel) && /1 skipped/.test(panel));

  // ---- a wrong token is refused
  const wrong = script1.replace(token1, '0'.repeat(64));
  const gridWrong = [['Name', 'Phone'], [`${tag} Sneaky`, '98000 11111']];
  assert(() => sheetRun(wrong, gridWrong)(), /not valid|switched off/, 'a wrong token is refused with a plain message');
  check('a wrong token adds nothing, and the refusal is noted', (await db.query('select count(*)::int n from public.candidates where name like $1', [`${tag} Sneaky`])).rows[0].n === 0
    && (await db.query("select count(*)::int n from public.intake_batches where source = 'sheet' and error like 'Refused%' and received_at >= $1", [startedAt])).rows[0].n >= 1);

  // ---- a new script ends the old one
  await page.click('#lfNew');
  await page.click('#cOK');
  await page.waitForSelector('#lfScript', { timeout: 15000 });
  const script2 = await page.inputValue('#lfScript');
  const token2 = (script2.match(/var APP_TOKEN = "([0-9a-f]{64})"/) || [])[1];
  check('a new script has a new token', !!token2 && token2 !== token1);
  await closeModals();
  const grid3 = [['Name', 'Phone'], [`${tag} Old script`, '98000 22222']];
  assert(() => sheetRun(script1, grid3)(), /not valid|switched off/, 'the old script stops working');
  const grid4 = [['Name', 'Phone'], [`${tag} New script`, '98000 33333']];
  sheetRun(script2, grid4)();
  check('the old script is refused and the new one works', grid4[1][2].startsWith('Added')
    && (await db.query('select count(*)::int n from public.candidates where name = $1', [`${tag} Old script`])).rows[0].n === 0
    && (await db.query('select count(*)::int n from public.candidates where name = $1', [`${tag} New script`])).rows[0].n === 1);

  // ---- switching it off
  await page.evaluate(() => go('settings'));
  await page.waitForSelector('#lfOn', { timeout: 15000 });
  await page.uncheck('#lfOn');
  await page.click('#lfSave');
  await page.waitForTimeout(800);
  assert(() => sheetRun(script2, [['Name', 'Phone'], [`${tag} Off`, '98000 44444']])(), /switched off|not valid/, 'a switched-off sheet is refused');
  check('switching it off stops the leads', (await db.query('select enabled from public.lead_feed')).rows[0].enabled === false
    && (await db.query('select count(*)::int n from public.candidates where name = $1', [`${tag} Off`])).rows[0].n === 0);

  check('no errors in the page', page.errors.length === 0 || (console.error(page.errors), false));
} finally {
  await browser.close().catch(() => {});
  await cleanup().catch((e) => console.error('cleanup failed:', e.message));
  await db.end();
}

function assert(fn, pattern, name) {
  let msg = '';
  try { fn(); } catch (e) { msg = String(e.message || e); }
  check(name, pattern.test(msg));
}
let bad = 0;
for (const [name, ok] of results) { console.log((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) bad++; }
console.log(bad ? `FAIL ${target}` : `OK ${target}: ${results.length} live lead sheet checks`);
process.exit(bad ? 1 : 0);
