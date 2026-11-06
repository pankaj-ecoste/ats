// More than one workbook (migration 0038): the workbook's name travels with each tab, the status lists the workbooks, and an admin can read the script key again.
// One rolled-back transaction. Pending migrations are applied inside it.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect, loadEnv } from '../../scripts/db.mjs';

loadEnv();
const skip = process.env.DATABASE_URL ? false : 'DATABASE_URL is not set';
let c;
const q = (sql, params) => c.query(sql, params);
const U = { admin: randomUUID(), rec: randomUUID() };
const mig = (f) => readFileSync(new URL('../../supabase/migrations/' + f, import.meta.url), 'utf8');

before(async () => {
  if (skip) return;
  c = connect();
  await c.connect();
  await q('begin');
  if (!(await q("select 1 from information_schema.columns where table_name = 'sheet_tabs' and column_name = 'book_name'")).rows.length) await q(mig('0038_workbooks_and_script.sql'));
  await q('delete from public.sheet_links');
  await q('delete from public.sheet_tabs');
  await q('delete from public.lead_feed');
  await q('delete from public.intake_batches');
  await q("select set_config('app.allow_user_create', 'on', true)");
  for (const [n, id] of Object.entries(U)) await q("insert into auth.users (id, email, aud, role, raw_user_meta_data) values ($1, $2, 'authenticated', 'authenticated', $3)", [id, `wb${n}@ats.ecoste.in`, JSON.stringify({ full_name: 'Book ' + n })]);
  await q("select set_config('app.allow_user_create', 'off', true)");
  await q("update public.profiles set role = 'admin' where id = $1", [U.admin]);
  await q("update public.profiles set role = 'recruiter' where id = $1", [U.rec]);
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
let TOKEN;

test('the key is kept so an admin can read it again, and nobody else can', { skip }, async () => {
  TOKEN = (await rpc(U.admin, 'lead_feed_connect', true)).token;
  assert.match(TOKEN, /^[0-9a-f]{64}$/);
  assert.equal(await rpc(U.admin, 'lead_feed_token'), TOKEN, 'the same key comes back');
  assert.equal((await rpc(U.admin, 'lead_feed_status')).can_show_script, true);
  await assert.rejects(rpc(U.rec, 'lead_feed_token'), /Only an admin/);
  await assert.rejects(rpc(null, 'lead_feed_token'), /permission denied/);
  await assert.rejects(as(U.admin, 'select token_text from public.lead_feed'), /permission denied/, 'the table stays closed');
  assert.equal((await rpc(U.admin, 'lead_feed_connect', true)).token, null, 'changing the switch keeps the key');
  assert.equal(await rpc(U.admin, 'lead_feed_token'), TOKEN);
  const next = (await rpc(U.admin, 'lead_feed_connect', true, true)).token;
  assert.notEqual(next, TOKEN);
  assert.equal(await rpc(U.admin, 'lead_feed_token'), next, 'a new key replaces the kept one');
  TOKEN = next;
});

test('two workbooks: the name of each travels with its tabs, and an old script that sends no name keeps the name', { skip }, async () => {
  const tabs = (book, list) => JSON.stringify(list.map(([key, name]) => ({ key, name, book, headings: ['Name', 'Phone'] })));
  assert.equal((await rpc(null, 'sheet_sync_plan', TOKEN, tabs('Leads A', [['A1/1', 'Sales'], ['A1/2', 'CRM']]))).ok, true);
  assert.equal((await rpc(null, 'sheet_sync_plan', TOKEN, tabs('Leads B', [['B2/1', 'Sales']]))).ok, true, 'a second workbook with a tab of the same name');
  const rows = (await q('select tab_key, tab_name, book_name from public.sheet_tabs order by tab_key')).rows;
  assert.deepEqual(rows.map((r) => [r.tab_key, r.tab_name, r.book_name]), [['A1/1', 'Sales', 'Leads A'], ['A1/2', 'CRM', 'Leads A'], ['B2/1', 'Sales', 'Leads B']]);
  await rpc(null, 'sheet_sync_plan', TOKEN, JSON.stringify([{ key: 'A1/1', name: 'Sales', headings: ['Name', 'Phone'] }]));
  assert.equal((await q("select book_name from public.sheet_tabs where tab_key = 'A1/1'")).rows[0].book_name, 'Leads A', 'no name sent: the known name stays');
  await rpc(null, 'sheet_sync_plan', TOKEN, tabs('Leads A renamed', [['A1/1', 'Sales']]));
  assert.equal((await q("select book_name from public.sheet_tabs where tab_key = 'A1/1'")).rows[0].book_name, 'Leads A renamed', 'a renamed workbook shows its new name');
});

test('the status lists the workbooks with their tabs, and says when the workbook was refused', { skip }, async () => {
  const st = await rpc(U.admin, 'lead_feed_status');
  assert.deepEqual(st.workbooks.map((w) => [w.id, w.name, w.tabs]).sort(), [['A1', 'Leads A renamed', 2], ['B2', 'Leads B', 1]]);
  assert.equal(st.refused_recently, 0);
  assert.equal((await rpc(null, 'sheet_sync_plan', 'a-wrong-token', '[]')).ok, false);
  assert.equal((await rpc(U.admin, 'lead_feed_status')).refused_recently, 1);
  await assert.rejects(rpc(U.rec, 'lead_feed_status'), /Only an admin/);
});
