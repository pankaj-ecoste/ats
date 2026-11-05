// Linking a Google Sheet tab to an opening, end to end on the real Supabase project: an admin signs in, connects the workbook in Settings, the generated script
// is run against a pretend workbook (several tabs) but talks to the real database, the admin links a tab to an opening in the app (choosing source and columns),
// the leads arrive with their source, campaign and form answers, a tab cannot be linked twice, and a wrong token, a new script and switching off behave.
//   npm run test:e2e:lead-feed            (add `-- dist` to test the built file)
// Needs DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY in .env. Everything it creates carries the prefix zz<tag> and is removed at the end.
// A real connection already set up is put aside while it runs and restored exactly at the end (the real script is refused for those few minutes).
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
const ADMIN = `${tag}_admin`, PW = 'admin-pass-1', OP = `OP-${tag}`, OP2 = `OP2-${tag}`, TITLE = `Lead sheet role ${tag}`, TITLE2 = `Second role ${tag}`;
const TAB_A = `zz ${tag} Sales`, TAB_B = `zz ${tag} CRM`;
const results = [];
const check = (name, ok) => results.push([name, !!ok]);

const db = connect();
await db.connect();
// a real setup is kept: the row is put aside while the test runs and put back exactly at the end
const real = (await db.query('select * from public.lead_feed')).rows[0] || null;
if (real) await db.query('delete from public.lead_feed');
const startedAt = new Date();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

// a pretend tab, and a pretend workbook that runs the generated script; its HTTP calls go to the real project (a child process, because Apps Script calls are synchronous)
function tab(id, name, grid) {
  const set = (r, c, v) => { while (grid.length <= r) grid.push([]); while (grid[r].length <= c) grid[r].push(''); grid[r][c] = v; };
  const width = () => Math.max(0, ...grid.map((r) => r.length));
  const cells = (r0, c0, nr, nc) => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const row = grid[r0 + i] || []; return j + c0 < row.length ? row[j + c0] : ''; }));
  return { id, name, grid, sheet: {
    getSheetId: () => id, getName: () => name, getLastRow: () => grid.length, getLastColumn: () => width(),
    getDataRange: () => ({ getValues: () => cells(0, 0, grid.length, width()) }),
    getRange: (r, c, nr, nc) => ({ getValues: () => cells(r - 1, c - 1, nr, nc), setValue: (v) => set(r - 1, c - 1, v), setValues: (vs) => vs.forEach((row, i) => row.forEach((v, j) => set(r - 1 + i, c - 1 + j, v))) }),
  } };
}
function workbookRun(script, tabs) {
  const ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getId: () => `zzbook${tag}`, getSheets: () => tabs.map((t) => t.sheet), getSpreadsheetTimeZone: () => 'Asia/Kolkata' }) },
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
  await db.query('delete from public.openings where id = any($1)', [[OP, OP2]]);
  await db.query('delete from public.sheet_links where tab_key like $1', [`zzbook${tag}/%`]);
  await db.query('delete from public.sheet_tabs where tab_key like $1', [`zzbook${tag}/%`]);
  await db.query('delete from public.lead_feed');
  if (real) await db.query('insert into public.lead_feed (singleton, token_hash, token_made_at, enabled, last_received_at) values (true, $1, $2, $3, $4)', [real.token_hash, real.token_made_at, real.enabled, real.last_received_at]);
  await db.query("delete from public.intake_batches where source = 'sheet' and received_at >= $1", [startedAt]);
  await db.query("delete from public.activity where at >= $1 and (text like $2 or text like $3 or text like 'The lead sheet connection%' or text like 'A new lead sheet token%')", [startedAt, `%${TITLE}%`, `%${TAB_A}%`]).catch(() => {});
  await db.query('alter table public.audit_log disable trigger no_delete');
  try {
    await db.query("delete from public.audit_log where row_id = any($1::text[]) or row_id = any($2::text[]) or (new_data ->> 'candidate_id') = any($1::text[]) or (new_data ->> 'application_id') = any($3::text[]) or (new_data ->> 'tab_key') like $4 or (old_data ->> 'tab_key') like $4", [cids, [OP, OP2], aids, `zzbook${tag}/%`]);
  } finally { await db.query('alter table public.audit_log enable trigger no_delete'); }
  await removeTestAccounts(db, tag);
}

try {
  const adminId = await createTestAdmin(db, tag, PW);
  await db.query("insert into public.openings (id, title, positions, recruiter_id, status) values ($1, $2, 2, $3, 'Open'), ($4, $5, 1, $3, 'Open')", [OP, TITLE, adminId, OP2, TITLE2]);
  await freshPage();
  await signIn();

  // ---- connect the workbook in Settings
  await page.evaluate(() => go('settings'));
  await page.waitForSelector('#lfSetup', { timeout: 15000 });
  check('Settings has the Lead sheet connection panel for an admin', (await text('#content')).includes('Lead sheet connection'));
  await page.click('#lfSetup');
  await page.waitForSelector('#lfScript', { timeout: 15000 });
  const script1 = await page.inputValue('#lfScript');
  const token1 = (script1.match(/var APP_TOKEN = "([0-9a-f]{64})"/) || [])[1];
  check('setting up shows the script once, with the app address and a 64-character token', !!token1 && script1.includes(`var APP_URL = "${cfg.supabaseUrl}"`) && script1.includes('installLeadSync'));
  const feed = (await db.query('select token_hash, enabled from public.lead_feed')).rows[0];
  check('the database keeps only the hash of the token', feed.enabled === true && feed.token_hash !== token1 && /^[0-9a-f]{64}$/.test(feed.token_hash));
  await closeModals();

  // ---- the script runs in a pretend workbook: it reports the tabs, nothing is linked yet, so no lead moves
  const gridA = [
    ['Date', 'Full Name', 'Mobile Number', 'Email ID', 'City', 'Do you have a bike?', 'ad_id'],
    ['12/10/2026', `${tag} Lead A`, '98765 43210', '', 'Pune', 'Yes', 'ad-1'],
    ['', `${tag} Lead B`, 9876500001, `${tag}.b@example.com`, 'Nagpur', 'No', 'ad-2'],
    ['', `${tag} Lead A again`, '+91-98765-43210', '', '', '', 'ad-3'],
    ['', '', '98765 00002', '', '', '', 'ad-4'],
  ];
  const gridB = [['Name', 'Phone'], [`${tag} Lead C`, '98765 00003']];
  const tabs = [tab(1, TAB_A, gridA), tab(2, TAB_B, gridB), tab(3, 'Sheet18', [['only one'], ['x']])];
  const sync = workbookRun(script1, tabs);
  sync();
  const seen = (await db.query('select tab_name from public.sheet_tabs where tab_key like $1 order by tab_name', [`zzbook${tag}/%`])).rows.map((r) => r.tab_name);
  check('the tabs with headings are reported, a tab without headings is not', seen.length === 2 && seen.includes(TAB_A) && seen.includes(TAB_B));
  check('nothing is linked yet, so no lead moved and no tab was changed', (await db.query('select count(*)::int n from public.candidates where name like $1', [`${tag}%`])).rows[0].n === 0 && gridA[0].length === 7);

  // ---- link a tab to an opening from the opening's page
  await page.evaluate(() => go('settings')); await page.waitForSelector('#lfRefresh', { timeout: 15000 });
  await page.click('#lfRefresh');   // what a person does after the script has run
  await page.waitForFunction(() => /2 tabs reported/.test(document.getElementById('content').textContent), null, { timeout: 15000 }).catch(() => {});
  check('Settings now counts the tabs the workbook reported', /2 tabs reported/.test(await text('#content')));
  await page.evaluate((id) => go('opening', id, 'leads'), OP);
  await page.waitForSelector('#lsLink', { timeout: 15000 });
  await page.waitForFunction(() => !document.getElementById('content').textContent.includes('Loading…'), null, { timeout: 15000 });
  check('the opening has a Lead sheets tab with nothing linked yet', (await text('#content')).includes('No sheet is linked to this opening yet'));
  await page.click('#lsLink');
  await page.waitForSelector('#lkTab', { timeout: 15000 });
  await page.selectOption('#lkTab', `zzbook${tag}/1`);
  check('choosing a tab guesses the columns from the headings', await page.evaluate(() => {
    const v = (f) => document.querySelector(`[data-lk="${f}"]`).value;
    return v('name') === 'Full Name' && v('phone') === 'Mobile Number' && v('email') === 'Email ID' && v('location') === 'City' && v('date') === 'Date';
  }));
  check('other columns are kept as answers, but the platform id column is not', await page.evaluate(() => {
    const on = [...document.querySelectorAll('[data-lx]')].map((c) => [c.parentElement.textContent.trim(), c.checked]);
    return on.some(([t, c]) => /bike/.test(t) && c) && on.some(([t, c]) => /ad_id/.test(t) && !c);
  }));
  await page.selectOption('#lkSrc', 'Facebook Ad');
  await page.click('#lkSave');
  await page.waitForSelector('#lkSure:not([hidden])', { timeout: 5000 });   // it says which tab goes where, then asks again
  await page.click('#lkSave');
  await page.waitForFunction((n) => document.getElementById('content').textContent.includes(n), TAB_A, { timeout: 15000 });
  const l = (await db.query('select opening_id, source, map, extra, enabled from public.sheet_links where tab_key = $1', [`zzbook${tag}/1`])).rows[0];
  check('the link is saved: opening, source, columns and answers', l && l.opening_id === OP && l.source === 'Facebook Ad' && l.map.name === 'Full Name' && l.extra.includes('Do you have a bike?') && !l.extra.includes('ad_id') && l.enabled);
  check('the opening lists the link', /Facebook Ad/.test(await text('#content')) && /Receiving/.test(await text('#content')));

  // ---- one tab belongs to one opening
  await page.evaluate((id) => go('opening', id, 'leads'), OP2);
  await page.waitForSelector('#lsLink', { timeout: 15000 });
  await page.waitForFunction(() => !document.getElementById('content').textContent.includes('Loading…'), null, { timeout: 15000 });
  await page.click('#lsLink');
  await page.waitForSelector('#lkTab', { timeout: 15000 });
  const taken = await page.evaluate((k) => { const o = document.querySelector(`#lkTab option[value="${k}"]`); return o && o.disabled && /linked to/.test(o.textContent); }, `zzbook${tag}/1`);
  check('in another opening that tab is shown as taken and cannot be chosen', !!taken);
  await closeModals();

  // ---- the leads arrive by themselves, with source, campaign and answers
  sync();
  check('the linked tab is marked row by row, other tabs are not touched', /^Added/.test(gridA[1][7]) && /^Added/.test(gridA[2][7]) && /^Duplicate/.test(gridA[3][7]) && gridA[4][7] === 'Skipped: No name' && gridB[0].length === 2);
  const a = (await db.query("select c.phone, c.location, c.source as csrc, a.source, a.campaign, a.answers, a.stage, a.opening_id from public.candidates c join public.applications a on a.candidate_id = c.id where c.name = $1", [`${tag} Lead A`])).rows[0];
  check('the lead is New in the linked opening with source, campaign and form answers',
    a && a.phone === '+91 98765 43210' && a.location === 'Pune' && a.source === 'Facebook Ad' && a.csrc === 'Facebook Ad' && a.campaign === TAB_A && a.answers['Do you have a bike?'] === 'Yes' && !('ad_id' in a.answers) && a.stage === 'New' && a.opening_id === OP);
  check('the unlinked tab sent nothing', (await db.query('select count(*)::int n from public.candidates where name = $1', [`${tag} Lead C`])).rows[0].n === 0);
  const note = (await db.query('select text from public.notifications where user_id = $1 and text like $2', [adminId, `%${TITLE}%`])).rows[0];
  check('the recruiter of the opening is told', note && /^2 new leads from .* for/.test(note.text));
  sync();
  check('running it again sends nothing new', (await db.query('select count(*)::int n from public.candidates where name like $1', [`${tag}%`])).rows[0].n === 2);

  // ---- the app shows them
  await page.reload();
  await page.waitForSelector('.app', { state: 'visible', timeout: 20000 });
  const cid = (await db.query('select id from public.candidates where name = $1', [`${tag} Lead A`])).rows[0].id;
  await page.evaluate((id) => go('candidate', id), cid);
  await page.waitForFunction(() => document.getElementById('content').textContent.includes('Form answers'), null, { timeout: 15000 });
  const cand = await text('#content');
  check('the candidate page shows source, campaign and the form answers', cand.includes('Facebook Ad') && cand.includes(TAB_A) && cand.includes('Do you have a bike?') && cand.includes('Yes'));
  await page.evaluate((id) => go('opening', id, 'leads'), OP);
  await page.waitForFunction(() => document.getElementById('content').textContent.includes('Leads by source'), null, { timeout: 15000 });
  check('the opening shows its leads by source and when the last lead came', /Facebook Ad 2/.test(await text('#content')));

  // ---- a new column in the tab is flagged; unlinking keeps the leads and frees the tab
  tabs[0].grid[0].push('Budget');
  sync();
  await page.evaluate((id) => go('opening', id, 'leads'), OP); await page.reload();
  await page.waitForSelector('.app', { state: 'visible', timeout: 20000 });
  await page.evaluate((id) => go('opening', id, 'leads'), OP);
  await page.waitForFunction(() => /new column/.test(document.getElementById('content').textContent), null, { timeout: 15000 }).catch(() => {});
  check('a column added later is flagged as new', /1 new column/.test(await text('#content')));
  await page.click('[data-ls-off]');
  await page.click('#cOK');
  await page.waitForFunction(() => document.getElementById('content').textContent.includes('No sheet is linked'), null, { timeout: 15000 });
  check('unlinking removes the link and keeps the leads',
    (await db.query('select count(*)::int n from public.sheet_links where tab_key = $1', [`zzbook${tag}/1`])).rows[0].n === 0
    && (await db.query('select count(*)::int n from public.candidates where name like $1', [`${tag}%`])).rows[0].n === 2);

  // ---- a wrong token is refused
  const wrong = script1.replace(token1, '0'.repeat(64));
  assert(() => workbookRun(wrong, [tab(9, TAB_A, [['Name', 'Phone'], [`${tag} Sneaky`, '98000 11111']])])(), /not valid|switched off/, 'a wrong token is refused with a plain message');
  check('a wrong token adds nothing, and the refusal is noted', (await db.query('select count(*)::int n from public.candidates where name like $1', [`${tag} Sneaky`])).rows[0].n === 0
    && (await db.query("select count(*)::int n from public.intake_batches where source = 'sheet' and error like 'Refused%' and received_at >= $1", [startedAt])).rows[0].n >= 1);

  // ---- a new script ends the old one
  await page.evaluate(() => go('settings'));
  await page.waitForSelector('#lfNew', { timeout: 15000 });
  await page.click('#lfNew');
  await page.click('#cOK');
  await page.waitForSelector('#lfScript', { timeout: 15000 });
  const script2 = await page.inputValue('#lfScript');
  const token2 = (script2.match(/var APP_TOKEN = "([0-9a-f]{64})"/) || [])[1];
  check('a new script has a new token', !!token2 && token2 !== token1);
  await closeModals();
  assert(() => workbookRun(script1, tabs)(), /not valid|switched off/, 'the old script stops working');
  workbookRun(script2, tabs)();
  check('the new script reports tabs again', (await db.query('select count(*)::int n from public.sheet_tabs where tab_key like $1', [`zzbook${tag}/%`])).rows[0].n === 2);

  // ---- switching it off
  await page.evaluate(() => go('settings'));
  await page.waitForSelector('#lfOn', { timeout: 15000 });
  await page.uncheck('#lfOn');
  await page.click('#lfSave');
  await page.waitForTimeout(800);
  assert(() => workbookRun(script2, tabs)(), /switched off|not valid/, 'a switched-off connection is refused');
  check('switching it off stops the workbook', (await db.query('select enabled from public.lead_feed')).rows[0].enabled === false);

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
console.log(bad ? `FAIL ${target}` : `OK ${target}: ${results.length} lead sheet checks`);
process.exit(bad ? 1 : 0);
