// The call status of a lead (migration 0027): a tab column can be chosen for it, it is kept on the application, and nothing else changes.
// One rolled-back transaction. Pending migrations are applied inside it.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect, loadEnv } from '../../scripts/db.mjs';

loadEnv();
const skip = process.env.DATABASE_URL ? false : 'DATABASE_URL is not set';
let c;
const PW = 'test-pass-1';
const q = (sql, params) => c.query(sql, params);
const U = { admin: randomUUID() };
const mig = (f) => readFileSync(new URL('../../supabase/migrations/' + f, import.meta.url), 'utf8');

before(async () => {
  if (skip) return;
  c = connect();
  await c.connect();
  await q('begin');
  if (!(await q("select to_regproc('public.sheet_sync_plan') as f")).rows[0].f) await q(mig('0023_sheet_links.sql'));
  if (!(await q("select has_table_privilege('authenticated', 'public.sheet_links', 'select') as g")).rows[0].g) await q(mig('0024_sheet_links_read_grant.sql'));
  if (!(await q("select 1 from information_schema.columns where table_name = 'applications' and column_name = 'call_status'")).rows.length) await q(mig('0027_call_status.sql'));
  if (!(await q("select 1 from pg_proc where proname = 'ingest_one_lead' and prosrc like '%Call status updated%'")).rows.length && !(await q("select 1 from information_schema.columns where table_name = 'applications' and column_name = 'custom'")).rows.length) await q(mig('0028_call_status_refresh.sql'));
  if (!(await q("select 1 from information_schema.columns where table_name = 'applications' and column_name = 'custom'")).rows.length) await q(mig('0029_custom_columns.sql'));
  if (!(await q("select 1 from information_schema.columns where table_name = 'sheet_tabs' and column_name = 'book_name'")).rows.length) await q(mig('0038_workbooks_and_script.sql'));
  if (!(await q("select 1 from information_schema.columns where table_name = 'lead_feed' and column_name = 'panel_pass_hash'")).rows.length) await q(mig('0039_lead_feed_password.sql'));
  await q('delete from public.lead_feed');
  await q("insert into public.lead_feed (singleton, panel_pass_hash) values (true, extensions.crypt('test-pass-1', extensions.gen_salt('bf')))");   // the connection password of the test
  await q("select set_config('app.allow_user_create', 'on', true)");
  await q("insert into auth.users (id, email, aud, role, raw_user_meta_data) values ($1, 'cs-admin@ats.ecoste.in', 'authenticated', 'authenticated', $2)", [U.admin, JSON.stringify({ full_name: 'Call admin' })]);
  await q("select set_config('app.allow_user_create', 'off', true)");
  await q("update public.profiles set role = 'admin' where id = $1", [U.admin]);
  await q("insert into public.openings (id, title, positions, recruiter_id, status) values ('OP-CS1', 'Call status role', 2, $1, 'Open')", [U.admin]);
});
after(async () => { if (!c) return; await q('rollback'); await c.end(); });

async function as(who, sql, params) {
  await q('savepoint x');
  try {
    await q(who ? 'set local role authenticated' : 'set local role anon');
    if (who) await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: who, role: 'authenticated' }), who]);
    const r = await q(sql, params);
    await q('reset role');
    await q('release savepoint x');
    return r;
  } catch (e) { await q('rollback to savepoint x'); await q('release savepoint x'); throw e; }
}
const rpc = (who, fn, ...args) => as(who, `select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(', ')}) as r`, args).then((x) => x.rows[0].r);
const HEAD = ['Full Name', 'Mobile', 'Call staus'];

test('a call status column can be chosen, and the status is kept on the application', { skip }, async () => {
  const token = (await rpc(U.admin, 'lead_feed_connect', true, false, PW)).token;
  await rpc(null, 'sheet_sync_plan', token, JSON.stringify([{ key: 'cs/1', name: 'Tab', headings: HEAD }]));
  await rpc(U.admin, 'sheet_link_save', 'OP-CS1', 'cs/1', 'Facebook Ad', JSON.stringify({ name: 'Full Name', phone: 'Mobile', callStatus: 'Call staus' }), '[]');
  const res = await rpc(null, 'ingest_tab_leads', token, 'cs/1', JSON.stringify([
    { name: 'Asha', phone: '98765 43210', callStatus: '  Connected ', answers: {} },
    { name: 'Ravi', phone: '98111 22233', callStatus: '', answers: {} },
    { name: 'Meena', phone: '98222 33344', callStatus: 'x'.repeat(200), answers: {} }]));
  assert.equal(res.added, 3);
  const rows = (await q("select c.name, a.call_status from public.applications a join public.candidates c on c.id = a.candidate_id where a.opening_id = 'OP-CS1' order by c.name")).rows;
  assert.deepEqual(rows.map((r) => [r.name, r.call_status.length > 60 ? 'LONG' : r.call_status]), [['Asha', 'Connected'], ['Meena', 'x'.repeat(60)], ['Ravi', '']]);
});

test('the same column cannot be used for a field and the call status', { skip }, async () => {
  await assert.rejects(rpc(U.admin, 'sheet_link_save', 'OP-CS1', 'cs/1', 'Facebook Ad', JSON.stringify({ name: 'Full Name', phone: 'Mobile', callStatus: 'Mobile' }), '[]'), /already linked|chosen for two fields/);
});

test('a row sent again refreshes the call status of the person already there, and nothing else', { skip }, async () => {
  const token = (await rpc(U.admin, 'lead_feed_connect', true, true, PW)).token;
  const rows = (s) => JSON.stringify([{ name: 'Asha', phone: '98765 43210', callStatus: s, answers: {} }]);
  const r1 = await rpc(null, 'ingest_tab_leads', token, 'cs/1', rows('Not Interested'));
  assert.equal(r1.duplicates, 1);
  assert.match(r1.rows[0].why, /Updated from the sheet/);
  assert.equal((await q("select a.call_status from public.applications a join public.candidates c on c.id = a.candidate_id where c.name = 'Asha'")).rows[0].call_status, 'Not Interested');
  const r2 = await rpc(null, 'ingest_tab_leads', token, 'cs/1', rows('Not Interested'));
  assert.doesNotMatch(r2.rows[0].why, /updated/, 'the same status again changes nothing');
  await rpc(null, 'ingest_tab_leads', token, 'cs/1', rows(''));
  assert.equal((await q("select a.call_status from public.applications a join public.candidates c on c.id = a.candidate_id where c.name = 'Asha'")).rows[0].call_status, 'Not Interested', 'an empty cell does not clear it');
  assert.equal((await q("select count(*)::int n from public.applications where opening_id = 'OP-CS1'")).rows[0].n, 3, 'no second application');
});

test('your own columns: matched from a tab, kept on the application, refreshed when sent again, and checked', { skip }, async () => {
  const token = (await rpc(U.admin, 'lead_feed_connect', true, true, PW)).token;
  await rpc(null, 'sheet_sync_plan', token, JSON.stringify([{ key: 'cs/2', name: 'Tab two', headings: ['Full Name', 'Mobile', 'VI DOne or not'] }]));
  await q("insert into public.openings (id, title, positions, recruiter_id, status) values ('OP-CS2', 'Second role', 1, $1, 'Open')", [U.admin]);
  await rpc(U.admin, 'sheet_link_save', 'OP-CS2', 'cs/2', 'Facebook Ad', JSON.stringify({ name: 'Full Name', phone: 'Mobile', 'x:VI done': 'VI DOne or not' }), '[]');
  await assert.rejects(rpc(U.admin, 'sheet_link_save', 'OP-CS2', 'cs/2', 'Facebook Ad', JSON.stringify({ name: 'Full Name', phone: 'Mobile', 'x:': 'Mobile' }), '[]'), /not a field|already linked/);
  const send = (v, extra = {}) => rpc(null, 'ingest_tab_leads', token, 'cs/2', JSON.stringify([{ name: 'Dev', phone: '98000 11122', 'x:VI done': v, 'x:Other': 'z'.repeat(300), ...extra, answers: {} }]));
  const r1 = await send('Done');
  assert.equal(r1.added, 1);
  const get = async () => (await q("select a.custom from public.applications a join public.candidates c on c.id = a.candidate_id where c.name = 'Dev'")).rows[0].custom;
  const c1 = await get();
  assert.equal(c1['VI done'], 'Done');
  assert.equal(c1.Other.length, 120, 'a value is cut at 120 characters');
  const r2 = await send('Pending');
  assert.match(r2.rows[0].why, /Updated from the sheet/);
  assert.equal((await get())['VI done'], 'Pending');
  await send('');
  assert.equal((await get())['VI done'], 'Pending', 'an empty cell does not clear it');
  assert.equal((await q("select count(*)::int n from public.applications where opening_id = 'OP-CS2'")).rows[0].n, 1);
});

test('screening questions of an opening: a list of up to 10 distinct texts, nothing else', { skip }, async () => {
  if (!(await q("select 1 from information_schema.columns where table_name = 'openings' and column_name = 'screen_questions'")).rows.length) await q(mig('0030_screening_questions.sql'));
  const set = (v) => q("update public.openings set screen_questions = $1 where id = 'OP-CS1'", [JSON.stringify(v)]);
  const bad = async (v) => { await q('savepoint s'); try { await set(v); } catch (e) { await q('rollback to savepoint s'); await q('release savepoint s'); return e.message; } await q('release savepoint s'); return ''; };
  assert.equal(await bad(['Own bike?', 'Join in 15 days?']), '');
  assert.match(await bad(['A', 'a ']), /valid|check/i, 'the same question twice (any case) is refused');
  assert.match(await bad(['']), /valid|check/i);
  assert.match(await bad([1]), /valid|check/i);
  assert.match(await bad({ a: 1 }), /valid|check/i);
  assert.match(await bad(['x'.repeat(201)]), /valid|check/i);
  assert.match(await bad(Array.from({ length: 11 }, (_, i) => 'Q' + i)), /valid|check/i);
});
