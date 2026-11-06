// Proves migration 0037 on the real database: the change stamp, the new indexes, and the log clean-up. Everything runs in one transaction that is rolled back.
//   npm run test:db        needs DATABASE_URL in .env. Skipped when it is not set.
//   Before 0037 is applied it fails (that is the point). TRY_MIGRATION=1 applies the file inside the test's own transaction first,
//   so the migration and its proof can be checked together without changing the project:  TRY_MIGRATION=1 node --test tests/db/scale.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect, loadEnv } from '../../scripts/db.mjs';

loadEnv();
const skip = process.env.DATABASE_URL ? false : 'DATABASE_URL is not set';
let c;
const q = (sql, params) => c.query(sql, params);
const rec = randomUUID();
const count = async (sql, params) => Number((await q(sql, params)).rows[0].n);

before(async () => {
  if (skip) return;
  c = connect();
  await c.connect();
  await q('begin');
  if (process.env.TRY_MIGRATION) await q(readFileSync(new URL('../../supabase/migrations/0037_scale_and_housekeeping.sql', import.meta.url), 'utf8'));
  await q("select set_config('app.allow_user_create', 'on', true)");
  await q("insert into auth.users (id, email, aud, role, raw_user_meta_data) values ($1, 'scale-rec@ats.ecoste.in', 'authenticated', 'authenticated', $2)", [rec, JSON.stringify({ full_name: 'Scale Rec' })]);
  await q("select set_config('app.allow_user_create', 'off', true)");
  await q("update public.profiles set role = 'recruiter' where id = $1", [rec]);
});
after(async () => { if (!c) return; await q('rollback'); await c.end(); });

const asRole = async (role, fn) => {
  await q('savepoint r');
  try {
    if (role === 'recruiter') await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: rec, role: 'authenticated' })]);
    await q(role === 'anon' ? 'set local role anon' : 'set local role authenticated');
    return await fn();
  } finally { await q('rollback to savepoint r'); await q('reset role'); }
};

test('data_stamp: a signed-in person gets a short fingerprint; a visitor and the public get nothing', { skip }, async () => {
  const s = await asRole('recruiter', async () => (await q('select public.data_stamp() as s')).rows[0].s);
  assert.match(s, /^[0-9a-f]{32}$/);
  await assert.rejects(() => asRole('anon', () => q('select public.data_stamp()')), /permission denied/);
});

test('data_stamp: it looks at the tables the app reads, not at the sheet-tab bookkeeping that changes with every sync', { skip }, async () => {
  const def = (await q("select pg_get_functiondef('public.data_stamp()'::regprocedure) as d")).rows[0].d;
  for (const t of ['candidates', 'applications', 'openings', 'notifications', 'intake_batches']) assert.ok(def.includes(`'${t}'`), t);
  for (const t of ['sheet_tabs', 'sheet_links', 'lead_feed', 'audit_log']) assert.ok(!def.includes(`'${t}'`), `${t} must not move the stamp`);
});

test('the foreign keys have indexes', { skip }, async () => {
  const names = ['applications_recruiter_id_idx', 'openings_recruiter_id_idx', 'openings_manager_id_idx', 'offers_manager_id_idx', 'interview_groups_opening_id_idx',
    'interviews_group_id_idx', 'messages_application_id_idx', 'messages_candidate_id_idx', 'report_events_application_id_idx', 'report_events_opening_id_idx', 'intake_batches_source_received_idx'];
  const have = (await q("select indexname from pg_indexes where schemaname = 'public'")).rows.map((r) => r.indexname);
  for (const n of names) assert.ok(have.includes(n), n);
});

test('prune_logs removes old operational logs, keeps recent ones, and never touches the audit log or the stage history', { skip }, async () => {
  await q("insert into public.intake_batches (source, rows_read, rows_skipped, error, received_at) values ('careers_page', 1, 1, 'old', now() - interval '100 days'), ('careers_page', 1, 1, 'recent', now() - interval '10 days')");
  await q("insert into public.sheet_log (at, text) values (now() - interval '200 days', 'old'), (now() - interval '20 days', 'new')");
  await q("insert into public.activity (text, type, at) values ('old', 'info', now() - interval '400 days'), ('recent', 'info', now() - interval '5 days')");
  await q("insert into public.notifications (user_id, text, read, created_at) values ($1, 'old read', true, now() - interval '90 days'), ($1, 'new read', true, now() - interval '10 days'), ($1, 'old unread', false, now() - interval '90 days'), ($1, 'ancient unread', false, now() - interval '200 days')", [rec]);
  const auditBefore = await count('select count(*) n from public.audit_log');
  const stageBefore = await count('select count(*) n from public.stage_events');
  const r = (await q('select app.prune_logs() as r')).rows[0].r;
  assert.ok(r.intake_batches >= 1 && r.activity >= 1 && r.notifications >= 2, JSON.stringify(r));
  assert.equal(await count("select count(*) n from public.intake_batches where error = 'old'"), 0);
  assert.equal(await count("select count(*) n from public.intake_batches where error = 'recent'"), 1);
  assert.equal(await count("select count(*) n from public.sheet_log where text = 'old'"), 0);
  assert.equal(await count("select count(*) n from public.sheet_log where text = 'new'"), 1);
  assert.equal(await count("select count(*) n from public.activity where text = 'old'"), 0);
  assert.equal(await count("select count(*) n from public.activity where text = 'recent'"), 1);
  const left = (await q('select text from public.notifications where user_id = $1 order by text', [rec])).rows.map((x) => x.text);
  assert.deepEqual(left, ['new read', 'old unread'], 'a read note goes after 60 days, an unread one after 180');
  assert.equal(await count('select count(*) n from public.audit_log'), auditBefore, 'the audit log is not pruned');
  assert.equal(await count('select count(*) n from public.stage_events'), stageBefore, 'the stage history is not pruned');
});

test('nobody but the database owner and the schedule can run prune_logs', { skip }, async () => {
  await assert.rejects(() => asRole('recruiter', () => q('select app.prune_logs()')), /permission denied/);
  await assert.rejects(() => asRole('anon', () => q('select app.prune_logs()')), /permission denied/);
});

test('data_stamp moves when something is really written (one log row is added and removed again)', { skip: skip || (process.env.TRY_MIGRATION ? 'needs the migration applied for real (not the dry run)' : false) }, async () => {
  // needs a committed write, so it uses its own connection; the row is removed in the end
  const w = connect();
  await w.connect();
  const stamp = async () => (await w.query('select public.data_stamp() as s')).rows[0].s;
  try {
    const before = await stamp();
    const row = (await w.query("insert into public.sheet_log (text) values ('scale test: delete me') returning id")).rows[0];
    let after = before;
    for (let i = 0; i < 20 && after === before; i++) { await new Promise((r) => setTimeout(r, 500)); after = await stamp(); }   // the counters can lag by about a second
    await w.query('delete from public.sheet_log where id = $1', [row.id]);
    assert.notEqual(after, before, 'the stamp changed after a write');
  } finally {
    await w.query("delete from public.sheet_log where text = 'scale test: delete me'");
    await w.end();
  }
});
