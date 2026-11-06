// The calling queue against the live project: a temporary admin signs in through the real screen (the deployed folder under the real headers),
// works three temporary leads, and the database must show exactly the calls that were meant, in the call record and in the management report.
//   npm run test:e2e:calling-live            needs DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY in .env; skips quietly without them
// Everything it makes carries the prefix zz<tag> (account, opening, people, applications) and is removed at the end.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { connect, loadEnv } from '../../scripts/db.mjs';
import { createTestAdmin, newTag, removeTestAccounts } from '../support/accounts.mjs';

loadEnv();
if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) { console.log('SKIP calling-live: .env is not complete'); process.exit(0); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = resolve(root, 'dist/site');
const headers = Object.fromEntries(JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')).headers[0].headers.map((h) => [h.key, h.value]));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = createServer((q, r) => {
  const p = q.url.split('?')[0];
  const f = resolve(SITE, '.' + (p === '/' ? '/index.html' : p));
  if (!f.startsWith(SITE) || !existsSync(f)) { r.writeHead(404).end(); return; }
  r.writeHead(200, { ...headers, 'Content-Type': TYPES[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream' }).end(readFileSync(f));
}).listen(0);
const base = `http://localhost:${server.address().port}`;
const cfg = { supabaseUrl: process.env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''), anonKey: process.env.SUPABASE_ANON_KEY };

const tag = newTag(), PW = 'admin-pass-1', ADMIN = `${tag}_admin`;
const OP = `OP-${tag}`, C = [1, 2, 3].map((i) => `C-${tag}${i}`), A = [1, 2, 3].map((i) => `APP-${tag}${i}`);
const db = connect();
await db.connect();
const startedAt = new Date();
const results = [];
const check = (name, ok) => results.push([name, !!ok]);
const q = async (sql, params) => (await db.query(sql, params)).rows;
// the writer saves in the background: wait until the database says what is expected (or give up)
const until = async (fn, ms = 9000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await new Promise((r) => setTimeout(r, 300)); } };

async function cleanUp() {
  await db.query('delete from public.activity where text like $1', [`%${tag}%`]);
  await db.query('delete from public.candidates where id = any($1)', [C]);
  await db.query('delete from public.openings where id = $1', [OP]);
  await db.query('alter table public.audit_log disable trigger no_delete');
  try {
    await db.query("delete from public.audit_log where at >= $1 and (row_id like $2 or (new_data ->> 'application_id') like $2 or (new_data ->> 'candidate_id') like $2 or (new_data ->> 'opening_id') like $2)", [startedAt, `%${tag}%`]);
  } finally { await db.query('alter table public.audit_log enable trigger no_delete'); }
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
try {
  await cleanUp();
  await removeTestAccounts(db, tag);
  const adminId = await createTestAdmin(db, tag, PW, 'Test Caller');
  await db.query("insert into public.openings (id, title, dept, recruiter_id, manager_id, positions, status) values ($1, 'Calling check role', 'Test', $2, $2, 1, 'Open')", [OP, adminId]);
  for (let i = 0; i < 3; i++) {
    await db.query('insert into public.candidates (id, name, email, phone, skills) values ($1, $2, $3, $4, $5)', [C[i], `Call ${tag} ${['One', 'Two', 'Three'][i]}`, `${tag}${i}@example.com`, `98${String(Number(String(Date.now()).slice(-7)) * 10 + i).padStart(8, '0')}`, '{Java}']);
    await db.query("insert into public.applications (id, candidate_id, opening_id, stage, recruiter_id, applied_on) values ($1, $2, $3, 'New', $4, $5)", [A[i], C[i], OP, adminId, `2026-10-0${i + 1}`]);
  }

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((c) => { globalThis.__APP_CONFIG_OVERRIDE = c; globalThis.__csp = []; document.addEventListener('securitypolicyviolation', (e) => globalThis.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); }, cfg);
  await page.goto(base + '/');
  await page.waitForSelector('#loginForm', { state: 'visible', timeout: 20000 });
  await page.fill('#loginForm [name="username"]', ADMIN);
  await page.fill('#loginForm [name="password"]', PW);
  await page.click('#loginBtn');
  await page.waitForSelector('.app', { state: 'visible', timeout: 25000 });
  await page.click('[data-go="calling"]');
  await page.waitForSelector('[data-cq]', { timeout: 15000 });
  const shown = () => page.evaluate(() => { const c = document.querySelector('[data-cq]'); return c ? c.dataset.cq : null; });
  const settle = () => page.waitForTimeout(150);
  const callOf = async (id) => (await q('select app_call_status s from public.applications where id = $1', [id]))[0].s;
  const events = async (id) => q('select status, recruiter_id, opening_id from public.call_events where application_id = $1 order by id', [id]);

  check('the calling page shows my oldest lead first, from the live data', (await shown()) === A[0]);
  check('only my three leads are in the queue (the name is mine alone)', /3 to call/.test(await page.locator('.page-h p').innerText()));

  // undo: nothing may reach the database
  await page.click('[data-cqs="Busy"]'); await settle();
  await page.click('[data-cqundo]'); await settle();
  await new Promise((r) => setTimeout(r, 1500));
  check('Undo: no call status and no call record in the database', (await callOf(A[0])) === 'NA' && (await events(A[0])).length === 0);

  // a held call is written after five seconds, once
  await page.click('[data-cqs="Busy"]'); await settle();
  check('during the five seconds the database has nothing', (await callOf(A[0])) === 'NA');
  const wrote = await until(async () => (await callOf(A[0])) === 'Busy');
  check('after five seconds the status is in the database', wrote);
  const e0 = await events(A[0]);
  check('exactly one call record, by me, on this opening, with the status', e0.length === 1 && e0[0].status === 'Busy' && e0[0].recruiter_id === adminId && e0[0].opening_id === OP);

  // a connected call, with a note typed after the tap, then the next lead
  check('the second lead is on screen', (await shown()) === A[1]);
  await page.click('[data-cqs="Connected"]'); await settle();
  await page.fill('#cqNote', `Called ${tag}: interested`);
  await page.click('[data-cqnext]');
  check('a connected call reaches the call record once', await until(async () => (await events(A[1])).length === 1) && (await events(A[1]))[0].status === 'Connected');
  check('the note is saved on the person', await until(async () => JSON.stringify((await q('select notes from public.candidates where id = $1', [C[1]]))[0].notes).includes('interested')));

  // leaving the page writes what is held
  check('the third lead is on screen', (await shown()) === A[2]);
  await page.click('[data-cqs="Not Interested"]'); await settle();
  await page.click('[data-go="dashboard"]');
  check('leaving the page writes the held call', await until(async () => (await callOf(A[2])) === 'Not Interested'));

  // the management report counts exactly these three calls, and not the undone one
  const today = (await q("select to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD') d"))[0].d;   // as text: a JavaScript date can shift by a day
  const report = await page.evaluate(async ([d, op]) => { const r = await sb.rpc('call_report', { p_from: d, p_to: d, p_opening: op }); return r.error ? { error: r.error.message } : r.data; }, [today, OP]);   // as the signed-in person, as the app does
  if (report.error) console.error(report.error);
  const total = (Array.isArray(report) ? report : []).reduce((s, x) => s + Number(x.n), 0);
  check('the management report counts three calls on this opening: Busy, Connected, Not Interested', total === 3 && ['Busy', 'Connected', 'Not Interested'].every((s) => (report || []).some((x) => x.status === s && Number(x.n) === 1)));
  check('they are all on one recruiter, the temporary admin', Array.isArray(report) && report.length > 0 && report.every((x) => x.recruiter_id === adminId));

  // back on the page: nothing is left to call, and the save word is calm
  await page.click('[data-go="calling"]');
  await page.waitForSelector('.page-h');
  check('the queue is empty now: nothing to call, one lead to call again (the busy one)', /0 to call · 1 to call again/.test(await page.locator('.page-h p').innerText()));
  const word = await page.evaluate(() => { const e = document.getElementById('saveState'); return e ? e.textContent : null; });
  check('the save word says All saved', word === 'All saved');
  check('no policy violations and no script errors', (await page.evaluate(() => globalThis.__csp)).length === 0 && errors.length === 0 || (console.error(errors, await page.evaluate(() => globalThis.__csp)), false));
  await ctx.close();
} finally {
  await cleanUp();
  await removeTestAccounts(db, tag);
  await db.end();
  await browser.close();
  server.close();
}
let bad = 0;
for (const [n, ok] of results) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) bad++; }
console.log(bad ? 'FAIL calling-live' : `OK calling-live: ${results.length} checks`);
process.exit(bad ? 1 : 0);
