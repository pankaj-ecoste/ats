// "Call status via app" (migration 0034): a call is a status other than NA; the database logs it with who and when; nobody writes the log by hand.
// One rolled-back transaction. The migration is applied inside it when it is not there yet.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect, loadEnv } from '../../scripts/db.mjs';

loadEnv();
const skip = process.env.DATABASE_URL ? false : 'DATABASE_URL is not set';
let c;
const q = (sql, params) => c.query(sql, params);
const U = { rec: randomUUID(), mgmt: randomUUID() };
const mig = (f) => readFileSync(new URL('../../supabase/migrations/' + f, import.meta.url), 'utf8');

async function as(who, sql, params) {
  await q('savepoint x');
  try {
    await q('set local role authenticated');
    await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: who, role: 'authenticated' }), who]);
    const r = await q(sql, params);
    await q('reset role');
    await q('release savepoint x');
    return r;
  } catch (e) { await q('rollback to savepoint x'); await q('release savepoint x'); throw e; }
}
const events = (app = 'A-CE1') => q('select * from public.call_events where application_id = $1 order by id', [app]).then((r) => r.rows);
const setCall = (who, status, at) => as(who, 'update public.applications set app_call_status = $1, app_call_at = $2 where id = $3', [status, at, 'A-CE1']);

before(async () => {
  if (skip) return;
  c = connect();
  await c.connect();
  await q('begin');
  if (!(await q("select 1 from information_schema.columns where table_name = 'applications' and column_name = 'app_call_status'")).rows.length) await q(mig('0034_call_status_via_app.sql'));
  await q("select set_config('app.allow_user_create', 'on', true)");
  for (const [id, mail, name, role] of [[U.rec, 'ce-rec', 'Call recruiter', 'recruiter'], [U.mgmt, 'ce-mgmt', 'Call manager', 'management']]) {
    await q("insert into auth.users (id, email, aud, role, raw_user_meta_data) values ($1, $2, 'authenticated', 'authenticated', $3)", [id, mail + '@ats.ecoste.in', JSON.stringify({ full_name: name })]);
    await q('update public.profiles set role = $2 where id = $1', [id, role]);
  }
  await q("select set_config('app.allow_user_create', 'off', true)");
  await q("insert into public.openings (id, title, positions, recruiter_id, status) values ('OP-CE1', 'Call events role', 1, $1, 'Open')", [U.rec]);
  await q("insert into public.candidates (id, name, email) values ('C-CE1', 'Cee One', 'ce1@example.com')");
  await q("insert into public.applications (id, candidate_id, opening_id, recruiter_id, applied_on) values ('A-CE1', 'C-CE1', 'OP-CE1', $1, current_date)", [U.rec]);
});
after(async () => { if (!c) return; await q('rollback'); await c.end(); });

test('a new lead is NA, and the status must be one of the fixed list', { skip }, async () => {
  assert.equal((await q("select app_call_status s, app_call_at a from public.applications where id = 'A-CE1'")).rows[0].s, 'NA');
  const bad = async (v) => { await q('savepoint s'); try { await q("update public.applications set app_call_status = $1 where id = 'A-CE1'", [v]); } catch (e) { await q('rollback to savepoint s'); await q('release savepoint s'); return e.message; } await q('release savepoint s'); return ''; };
  for (const ok of ['Connected', 'Busy', 'Follow-UP', 'Not okay with 15 k Salary', 'NA']) assert.equal(await bad(ok), '', ok);
  for (const no of ['connected', 'Called', '', 'Not interested ']) assert.match(await bad(no), /check|valid/i, no);
  assert.equal((await events()).length, 0, 'setting a status without the call time logs nothing');
});

const tick = () => new Promise((r) => setTimeout(r, 15));
const iso = (ms) => new Date(ms).toISOString();
const stored = async () => (await q("select app_call_at a, app_call_status s from public.applications where id = 'A-CE1'")).rows[0];

test('a call is logged by the database: the person signed in, the opening of the lead, today in India', { skip }, async () => {
  await setCall(U.rec, 'Busy', iso(Date.now()));
  const e = await events();
  assert.equal(e.length, 1);
  assert.equal(e[0].status, 'Busy');
  assert.equal(e[0].recruiter_id, U.rec);
  assert.equal(e[0].opening_id, 'OP-CE1');
  const same = (await q("select count(*)::int n from public.call_events where application_id = 'A-CE1' and called_on = (now() at time zone 'Asia/Kolkata')::date")).rows[0].n;
  assert.equal(same, 1, 'called_on is the Indian date of the database, not of the screen');
});

test('the same status again is a new call; an old screen saving something else logs nothing; NA logs nothing and the calls stay', { skip }, async () => {
  const n0 = (await events()).length;
  await tick();
  await setCall(U.rec, 'Busy', iso(Date.now()));
  assert.equal((await events()).length, n0 + 1, 'Busy again is another call');
  const st = await stored();
  await setCall(U.rec, 'Busy', st.a.toISOString());
  assert.equal((await events()).length, n0 + 1, 'an echo of the stored time logs nothing');
  await setCall(U.rec, 'Busy', iso(st.a.getTime() - 3600000));
  assert.equal((await events()).length, n0 + 1, 'an older time logs nothing');
  await tick();
  await setCall(U.rec, 'NA', iso(Date.now()));
  assert.equal((await events()).length, n0 + 1, 'NA is not a call');
  assert.equal((await stored()).s, 'NA');
  await tick();
  await setCall(U.rec, 'Connected', iso(Date.now()));
  const e = await events();
  assert.equal(e.length, n0 + 2);
  assert.equal(e[e.length - 1].status, 'Connected');
  assert.equal((await stored()).s, 'Connected');
});

test('a clock set ahead is held at the database time, so later calls are still logged', { skip }, async () => {
  const n0 = (await events()).length;
  await tick();
  await setCall(U.rec, 'High Salary', iso(Date.now() + 86400000 * 3));
  const st = (await q("select app_call_at a, clock_timestamp() n from public.applications where id = 'A-CE1'")).rows[0];
  assert.ok(st.a.getTime() <= st.n.getTime(), 'held at the database time');
  assert.equal((await events()).length, n0 + 1);
  await tick();
  await setCall(U.rec, 'Follow-UP', iso(Date.now()));
  assert.equal((await events()).length, n0 + 2, 'the next call is not blocked');
});

test('who can read and write the log: staff and management read; nobody writes, changes or deletes it by hand', { skip }, async () => {
  assert.ok((await as(U.rec, 'select count(*)::int n from public.call_events')).rows[0].n > 0, 'a recruiter reads');
  assert.ok((await as(U.mgmt, 'select count(*)::int n from public.call_events')).rows[0].n > 0, 'management reads');
  for (const who of [U.rec, U.mgmt]) {
    await assert.rejects(as(who, "insert into public.call_events (application_id, status) values ('A-CE1', 'Connected')"), /permission|policy/i, 'insert');
    await assert.rejects(as(who, "update public.call_events set status = 'Busy'"), /permission|policy/i, 'update');
    await assert.rejects(as(who, 'delete from public.call_events'), /permission|policy/i, 'delete');
  }
  await assert.rejects(q("insert into public.call_events (application_id, status) values ('A-CE1', 'NA')"), /check|valid/i, 'NA is never logged');
});
