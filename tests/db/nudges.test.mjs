// Proves the daily nudges (migration 0015) on the real database. Everything runs in one transaction that is rolled back.
//   npm run test:db        needs DATABASE_URL in .env. Skipped when it is not set.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect, loadEnv } from '../../scripts/db.mjs';

loadEnv();
const skip = process.env.DATABASE_URL ? false : 'DATABASE_URL is not set';
let c;
const q = (sql, params) => c.query(sql, params);
const adm = randomUUID(), rec = randomUUID(), pan = randomUUID();
const notes = async (user) => (await q('select text from public.notifications where user_id = $1 order by text', [user])).rows.map((x) => x.text);

before(async () => {
  if (skip) return;
  c = connect();
  await c.connect();
  await q('begin');
  await q("select set_config('app.allow_user_create', 'on', true)");
  for (const [id, n] of [[adm, 'nadm'], [rec, 'nrec'], [pan, 'npan']]) await q("insert into auth.users (id, email, aud, role, raw_user_meta_data) values ($1, $2, 'authenticated', 'authenticated', $3)", [id, `${n}@ats.ecoste.in`, JSON.stringify({ full_name: n })]);
  await q("select set_config('app.allow_user_create', 'off', true)");
  await q("update public.profiles set role = 'admin' where id = $1", [adm]);
  await q("update public.profiles set role = 'recruiter' where id = $1", [rec]);
  await q("update public.profiles set role = 'interviewer' where id = $1", [pan]);
  await q("insert into public.openings (id, title, recruiter_id, positions) values ('OP-N1', 'Nudge role', $1, 1)", [rec]);
  await q("insert into public.candidates (id, name, email) values ('C-N1', 'Nina Nudge', 'nina@example.com'), ('C-N2', 'Omar Other', 'omar@example.com')");
  // N1 has sat in Screening for 10 days (limit 3); N2 is fresh
  await q("insert into public.applications (id, candidate_id, opening_id, recruiter_id, stage, stage_since) values ('A-N1', 'C-N1', 'OP-N1', $1, 'Screening', current_date - 10), ('A-N2', 'C-N2', 'OP-N1', $1, 'Screening', current_date)", [rec]);
  const day = "(now() at time zone 'Asia/Kolkata')::date";
  await q(`insert into public.interviews (id, application_id, kind, round, on_date, at_time, interviewer_ids) values
           ('I-N1', 'A-N2', 'Personal', 'Tech', ${day} + 1, '10:00', $1), ('I-N2', 'A-N2', 'Personal', 'HR', ${day} - 2, '11:00', $1)`, [[pan]]);
});
after(async () => { if (!c) return; await q('rollback'); await c.end(); });

test('stuck candidates, tomorrow\'s interviews and missing outcomes each raise one nudge', { skip }, async () => {
  const r = (await q('select app.run_nudges() as r')).rows[0].r;
  assert.ok(r.sla >= 1 && r.reminders >= 1 && r.feedback >= 1, JSON.stringify(r));
  assert.ok((await notes(rec)).includes('Nina Nudge has been in Screening for 10 days (limit 3)'));
  assert.ok(!(await notes(rec)).some((t) => t.startsWith('Omar Other has been')));
  assert.ok((await notes(pan)).some((t) => t.startsWith('Interview tomorrow at 10:00 with Omar Other')));
  assert.ok((await notes(pan)).some((t) => t.includes('has no outcome yet')));
  assert.ok((await notes(rec)).some((t) => t.startsWith('Interview tomorrow')), 'the recruiter is reminded too');
});

test('running again the same day sends nothing new', { skip }, async () => {
  const before = (await q('select count(*)::int n from public.notifications')).rows[0].n;
  const r = (await q('select app.run_nudges() as r')).rows[0].r;
  assert.deepEqual(r, { sla: 0, reminders: 0, feedback: 0 });
  assert.equal((await q('select count(*)::int n from public.notifications')).rows[0].n, before);
});

test('a company SLA setting changes the limit', { skip }, async () => {
  await q("delete from app.nudge_log where key like 'sla:A-N2%'");
  await q("update public.applications set stage_since = current_date - 2 where id = 'A-N2'");
  await q(`update public.company_settings set config = jsonb_set(config, '{sla}', '{"screen":1}')`);
  const r = (await q('select app.run_nudges() as r')).rows[0].r;
  assert.ok(r.sla >= 1);
  assert.ok((await notes(rec)).includes('Omar Other has been in Screening for 2 days (limit 1)'));
});

test('signed-in people cannot run it', { skip }, async () => {
  await q('savepoint s');
  await q('set local role authenticated');
  await assert.rejects(q('select app.run_nudges()'), /permission denied/);
  await q('rollback to savepoint s');
});
