// Proves the access rules in supabase/migrations against a real database.
//   npm run test:db        needs DATABASE_URL in .env. Skipped when it is not set.
// Everything runs inside ONE transaction that is rolled back at the end, so no data is left behind.
// Users are created in auth.users (which fires the real sign-up trigger) and then impersonated by setting the same
// session values Supabase sets from a login token.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect, loadEnv } from '../../scripts/db.mjs';

loadEnv();
const skip = process.env.DATABASE_URL ? false : 'DATABASE_URL is not set';
let c;
const q = (sql, params) => c.query(sql, params);

// run one statement; a failure is returned (not thrown) and undone, so the transaction stays usable
async function attempt(sql, params) {
  await q('savepoint a');
  try {
    const r = await q(sql, params);
    await q('release savepoint a');
    return { rows: r.rows, rowCount: r.rowCount };
  } catch (e) {
    await q('rollback to savepoint a');
    await q('release savepoint a');
    return { error: e.message, rows: [], rowCount: 0 };
  }
}
// act as a signed-in user (or anon) for the length of fn; everything fn changes is undone afterwards
async function as(id, fn) {
  await q('savepoint u');
  try {
    await q(id ? 'set local role authenticated' : 'set local role anon');
    if (id) await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
    return await fn();
  } finally {
    await q('rollback to savepoint u');
    await q('release savepoint u');
  }
}
const ids = (r) => r.rows.map((x) => x.id).sort();

const U = Object.fromEntries(['admin', 'recruiter', 'interviewer', 'hm1', 'hm2', 'management', 'pending'].map((n) => [n, randomUUID()]));
const ROLE = { admin: 'admin', recruiter: 'recruiter', interviewer: 'interviewer', hm1: 'hiring_manager', hm2: 'hiring_manager', management: 'management', pending: 'pending' };

before(async () => {
  if (skip) return;
  c = connect();
  await c.connect();
  await q('begin');
  // start from an empty set of profiles so the "first user becomes admin" rule can be tested
  await q('delete from public.profiles');
  for (const [name, id] of Object.entries(U)) {
    await q("insert into auth.users (id, email, aud, role, raw_user_meta_data) values ($1, $2, 'authenticated', 'authenticated', $3)", [id, `${name}@ecoste.in`, JSON.stringify({ full_name: name })]);
  }
  // give each user their role (a console change with no signed-in user is trusted, so the guard does not apply)
  for (const [name, id] of Object.entries(U)) await q('update public.profiles set role = $1 where id = $2', [ROLE[name], id]);

  // fixtures: two openings with different hiring managers, one candidate each, one interview for our interviewer
  await q(`insert into public.openings (id, title, recruiter_id, manager_id, positions) values
           ('OP-T1', 'Test role one', $1, $2, 1), ('OP-T2', 'Test role two', $1, $3, 1)`, [U.recruiter, U.hm1, U.hm2]);
  await q(`insert into public.candidates (id, name, email) values ('C-T1', 'Cand One', 'one@example.com'), ('C-T2', 'Cand Two', 'two@example.com')`);
  await q(`insert into public.candidate_compensation (candidate_id, current_lpa, expected_lpa) values ('C-T1', 10, 14), ('C-T2', 8, 11)`);
  await q(`insert into public.applications (id, candidate_id, opening_id, recruiter_id) values ('A-T1', 'C-T1', 'OP-T1', $1), ('A-T2', 'C-T2', 'OP-T2', $1)`, [U.recruiter]);
  await q(`insert into public.interviews (id, application_id, kind, round, on_date, at_time, interviewer_ids) values
           ('I-T1', 'A-T1', 'Personal', 'Technical', current_date, '10:00', $1), ('I-T2', 'A-T2', 'Personal', 'Technical', current_date, '11:00', '{}')`, [[U.interviewer]]);
  await q(`insert into public.offers (id, application_id, ctc, approval_status) values ('OF-T1', 'A-T1', 1200000, 'Pending'), ('OF-T2', 'A-T2', 900000, 'Pending')`);
  await q(`insert into public.tasks (id, title, owner_id) values ('T-1', 'Interviewer task', $1), ('T-2', 'Recruiter task', $2)`, [U.interviewer, U.recruiter]);
});
after(async () => {
  if (!c) return;
  await q('rollback');
  await c.end();
});

/* ---------- sign-up ---------- */
test('the first account becomes admin, later ones wait as pending', { skip }, async () => {
  // done in a savepoint: removing every profile also clears the manager and owner links on the fixtures
  await q('savepoint first');
  await q('delete from public.profiles');
  await q("insert into auth.users (id, email, aud, role) values ($1, 'first@ecoste.in', 'authenticated', 'authenticated')", [randomUUID()]);
  await q("insert into auth.users (id, email, aud, role) values ($1, 'second@ecoste.in', 'authenticated', 'authenticated')", [randomUUID()]);
  const roles = Object.fromEntries((await q('select email, role from public.profiles')).rows.map((x) => [x.email, x.role]));
  await q('rollback to savepoint first');
  await q('release savepoint first');
  assert.deepEqual(roles, { 'first@ecoste.in': 'admin', 'second@ecoste.in': 'pending' });
});

test('sign-up is refused for an email outside the company domain', { skip }, async () => {
  const r = await attempt("insert into auth.users (id, email, aud, role) values ($1, 'someone@gmail.com', 'authenticated', 'authenticated')", [randomUUID()]);
  assert.match(r.error, /company email addresses/);
});

/* ---------- not signed in, and pending ---------- */
test('a visitor who is not signed in can read nothing', { skip }, async () => {
  await as(null, async () => {
    for (const t of ['openings', 'candidates', 'applications', 'offers', 'profiles']) {
      const r = await attempt(`select * from public.${t}`);
      assert.match(r.error, /permission denied/, t);
    }
  });
});

test('a pending user sees nothing except their own profile', { skip }, async () => {
  await as(U.pending, async () => {
    for (const t of ['openings', 'candidates', 'applications', 'offers', 'tasks', 'company_settings']) {
      assert.equal((await attempt(`select * from public.${t}`)).rows.length, 0, t);
    }
    assert.deepEqual((await attempt('select email from public.profiles')).rows.map((x) => x.email), ['pending@ecoste.in']);
  });
});

/* ---------- staff ---------- */
test('admin and recruiter see all the data, including salary', { skip }, async () => {
  for (const who of [U.admin, U.recruiter]) {
    await as(who, async () => {
      assert.deepEqual(ids(await attempt("select id from public.openings where id like 'OP-T%'")), ['OP-T1', 'OP-T2']);
      assert.deepEqual(ids(await attempt("select id from public.candidates where id like 'C-T%'")), ['C-T1', 'C-T2']);
      assert.equal((await attempt("select 1 from public.candidate_compensation where candidate_id like 'C-T%'")).rows.length, 2);
      assert.equal((await attempt("select 1 from public.offers where id like 'OF-T%'")).rows.length, 2);
    });
  }
});

test('only an admin can read the audit log or delete candidates', { skip }, async () => {
  await as(U.recruiter, async () => {
    assert.equal((await attempt('select * from public.audit_log')).rows.length, 0);
    assert.equal((await attempt("delete from public.candidates where id = 'C-T1'")).rowCount, 0);
  });
  await as(U.admin, async () => {
    assert.equal((await attempt("delete from public.candidates where id = 'C-T1'")).rowCount, 1);
  });
});

/* ---------- management ---------- */
test('management reads openings and applications but no candidate details, salary or offers', { skip }, async () => {
  await as(U.management, async () => {
    assert.deepEqual(ids(await attempt("select id from public.openings where id like 'OP-T%'")), ['OP-T1', 'OP-T2']);
    assert.deepEqual(ids(await attempt("select id from public.applications where id like 'A-T%'")), ['A-T1', 'A-T2']);
    for (const t of ['candidates', 'candidate_compensation', 'offers', 'interviews', 'tasks', 'audit_log', 'activity']) {
      assert.equal((await attempt(`select * from public.${t}`)).rows.length, 0, t);
    }
    assert.equal((await attempt("update public.openings set title = 'x' where id = 'OP-T1'")).rowCount, 0);
    assert.match((await attempt("insert into public.openings (id, title) values ('OP-X', 'x')")).error, /row-level security/);
  });
});

/* ---------- hiring managers ---------- */
test('a hiring manager sees only their own opening, its applications, candidates and offers', { skip }, async () => {
  await as(U.hm1, async () => {
    assert.deepEqual(ids(await attempt("select id from public.openings where id like 'OP-T%'")), ['OP-T1']);
    assert.deepEqual(ids(await attempt("select id from public.applications where id like 'A-T%'")), ['A-T1']);
    assert.deepEqual(ids(await attempt("select id from public.candidates where id like 'C-T%'")), ['C-T1']);
    assert.deepEqual(ids(await attempt("select id from public.offers where id like 'OF-T%'")), ['OF-T1']);
    assert.equal((await attempt('select * from public.candidate_compensation')).rows.length, 0, 'no salary');
  });
});

test('a hiring manager cannot create or edit openings, candidates or applications', { skip }, async () => {
  await as(U.hm1, async () => {
    assert.match((await attempt("insert into public.openings (id, title) values ('OP-X', 'x')")).error, /row-level security/);
    assert.equal((await attempt("update public.openings set title = 'x' where id = 'OP-T1'")).rowCount, 0);
    assert.equal((await attempt("update public.applications set stage = 'Offer' where id = 'A-T1'")).rowCount, 0);
    assert.equal((await attempt("update public.candidates set name = 'x' where id = 'C-T1'")).rowCount, 0);
  });
});

/* ---------- offer approval ---------- */
test('a hiring manager approves offers on their own opening, and only the approval fields', { skip }, async () => {
  await as(U.hm1, async () => {
    assert.match((await attempt("update public.offers set ctc = 2000000 where id = 'OF-T1'")).error, /only change the approval/);
    const ok = await attempt("update public.offers set approval_status = 'Approved' where id = 'OF-T1' returning approved_by");
    assert.equal(ok.rows[0].approved_by, U.hm1, 'approver is recorded');
    assert.equal((await attempt("update public.offers set approval_status = 'Approved' where id = 'OF-T2'")).rowCount, 0, 'not their opening');
  });
});

test('the recruiter who prepared an offer cannot approve it, and an unapproved offer cannot be sent', { skip }, async () => {
  await as(U.recruiter, async () => {
    assert.match((await attempt("update public.offers set approval_status = 'Approved' where id = 'OF-T1'")).error, /hiring manager/);
    assert.match((await attempt("update public.offers set status = 'Sent' where id = 'OF-T1'")).error, /needs approval/);
  });
  await as(U.admin, async () => {
    assert.equal((await attempt("update public.offers set approval_status = 'Approved' where id = 'OF-T1'")).rowCount, 1);
    assert.equal((await attempt("update public.offers set status = 'Sent' where id = 'OF-T1'")).rowCount, 1);
  });
});

/* ---------- interviewers ---------- */
test('an interviewer sees only the interviews they are on and what belongs to them', { skip }, async () => {
  await as(U.interviewer, async () => {
    assert.deepEqual(ids(await attempt("select id from public.interviews where id like 'I-T%'")), ['I-T1']);
    assert.deepEqual(ids(await attempt("select id from public.applications where id like 'A-T%'")), ['A-T1']);
    assert.deepEqual(ids(await attempt("select id from public.candidates where id like 'C-T%'")), ['C-T1']);
    assert.deepEqual(ids(await attempt("select id from public.openings where id like 'OP-T%'")), ['OP-T1']);
    for (const t of ['offers', 'candidate_compensation', 'candidate_documents', 'audit_log']) assert.equal((await attempt(`select * from public.${t}`)).rows.length, 0, t);
    assert.equal((await attempt("update public.interviews set feedback = 'x' where id = 'I-T1'")).rowCount, 0, 'cannot edit the interview itself');
  });
});

test('an interviewer writes their own scorecard, only for their own interview', { skip }, async () => {
  await as(U.interviewer, async () => {
    const mine = await attempt("insert into public.interview_scores (interview_id, interviewer_id, scores, decision) values ('I-T1', $1, '{4,4,5,4,4}', 'Next Round')", [U.interviewer]);
    assert.equal(mine.rowCount, 1);
    assert.match((await attempt("insert into public.interview_scores (interview_id, interviewer_id, scores) values ('I-T2', $1, '{3,3,3,3,3}')", [U.interviewer])).error, /row-level security/, 'not on that interview');
    assert.match((await attempt("insert into public.interview_scores (interview_id, interviewer_id, scores) values ('I-T1', $1, '{1,1,1,1,1}')", [U.hm1])).error, /row-level security/, 'not as someone else');
    assert.equal((await attempt("select * from public.interview_scores where interview_id = 'I-T1'")).rows.length, 1);
  });
  // the interviewer's hiring manager can read the scores of their own opening, another manager cannot
  await q("insert into public.interview_scores (interview_id, interviewer_id, scores) values ('I-T1', $1, '{4,4,4,4,4}')", [U.interviewer]);
  await as(U.hm1, async () => assert.equal((await attempt("select * from public.interview_scores where interview_id = 'I-T1'")).rows.length, 1));
  await as(U.hm2, async () => assert.equal((await attempt("select * from public.interview_scores where interview_id = 'I-T1'")).rows.length, 0));
});

/* ---------- tasks, notifications, profiles, settings ---------- */
test('a task owner sees their own tasks and can tick them but not rewrite them', { skip }, async () => {
  await as(U.interviewer, async () => {
    assert.deepEqual(ids(await attempt("select id from public.tasks where id like 'T-%'")), ['T-1']);
    assert.equal((await attempt("update public.tasks set done = true where id = 'T-1'")).rowCount, 1);
    assert.match((await attempt("update public.tasks set title = 'changed' where id = 'T-1'")).error, /mark your own task/);
    assert.equal((await attempt("update public.tasks set done = true where id = 'T-2'")).rowCount, 0, 'not theirs');
  });
});

test('notifications are private to each user', { skip }, async () => {
  await q("insert into public.notifications (user_id, text) values ($1, 'for recruiter'), ($2, 'for admin')", [U.recruiter, U.admin]);
  await as(U.recruiter, async () => assert.deepEqual((await attempt('select text from public.notifications')).rows.map((x) => x.text), ['for recruiter']));
  await as(U.hm1, async () => assert.equal((await attempt('select * from public.notifications')).rows.length, 0));
});

test('a user cannot make themselves admin; they can rename themselves; an admin can change roles', { skip }, async () => {
  await as(U.recruiter, async () => {
    assert.match((await attempt("update public.profiles set role = 'admin' where id = $1", [U.recruiter])).error, /Only an admin/);
    assert.equal((await attempt("update public.profiles set full_name = 'New Name' where id = $1", [U.recruiter])).rowCount, 1);
    assert.equal((await attempt("update public.profiles set full_name = 'x' where id = $1", [U.hm1])).rowCount, 0, 'not someone else');
  });
  await as(U.admin, async () => assert.equal((await attempt("update public.profiles set role = 'recruiter' where id = $1", [U.pending])).rowCount, 1));
});

test('company settings: every member reads them, only an admin changes them', { skip }, async () => {
  await as(U.hm2, async () => assert.equal((await attempt('select * from public.company_settings')).rows.length, 1));
  await as(U.recruiter, async () => assert.equal((await attempt("update public.company_settings set company = 'x'")).rowCount, 0));
  await as(U.admin, async () => assert.equal((await attempt("update public.company_settings set company = 'Ecoste'")).rowCount, 1));
});

/* ---------- rules enforced by triggers ---------- */
test('moving an application records the stage, the furthest stage, history and the opening status', { skip }, async () => {
  await as(U.recruiter, async () => {
    await attempt("update public.applications set stage = 'Shortlisted' where id = 'A-T1'");
    await attempt("update public.applications set stage = 'Offer' where id = 'A-T1'");
    const a = (await attempt("select stage, max_stage, stage_since from public.applications where id = 'A-T1'")).rows[0];
    assert.deepEqual([a.stage, a.max_stage], ['Offer', 6]);
    assert.equal((await attempt("select status from public.openings where id = 'OP-T1'")).rows[0].status, 'Offer');
    const ev = (await attempt("select from_stage, to_stage from public.stage_events where application_id = 'A-T1' order by id")).rows;
    assert.deepEqual(ev.map((e) => `${e.from_stage}>${e.to_stage}`), ['null>New', 'New>Shortlisted', 'Shortlisted>Offer']);
    await attempt("update public.applications set stage = 'Rejected' where id = 'A-T1'");
    const after = (await attempt("select max_stage from public.applications where id = 'A-T1'")).rows[0];
    assert.equal(after.max_stage, 6, 'rejecting does not lower the furthest stage');
    assert.equal((await attempt("select status from public.openings where id = 'OP-T1'")).rows[0].status, 'Open', 'opening falls back when nobody is in play');
  });
});

test('an opening fills when enough people have reached Joining, and parked openings keep their status', { skip }, async () => {
  await as(U.recruiter, async () => {
    await attempt("update public.applications set stage = 'Joining' where id = 'A-T1'");
    assert.equal((await attempt("select status from public.openings where id = 'OP-T1'")).rows[0].status, 'Filled');
    await attempt("update public.openings set status = 'On Hold' where id = 'OP-T2'");
    await attempt("update public.applications set stage = 'Offer' where id = 'A-T2'");
    assert.equal((await attempt("select status from public.openings where id = 'OP-T2'")).rows[0].status, 'On Hold');
  });
});

test('history cannot be edited or deleted directly', { skip }, async () => {
  await as(U.admin, async () => {
    await attempt("update public.applications set stage = 'Shortlisted' where id = 'A-T1'");
    assert.match((await attempt('update public.stage_events set to_stage = $1', ['x'])).error, /permission denied|append only/);
    assert.match((await attempt('delete from public.audit_log')).error, /permission denied|append only/);
  });
  // even the table owner cannot rewrite history
  assert.match((await attempt("update public.stage_events set to_stage = 'x'")).error, /append only/);
  assert.match((await attempt('delete from public.stage_events')).error, /append only/);
  assert.match((await attempt("update public.audit_log set op = 'INSERT'")).error, /append only/);
});

test('deleting an application removes its history with it (for data-deletion requests)', { skip }, async () => {
  assert.ok((await attempt("select 1 from public.stage_events where application_id = 'A-T2'")).rows.length > 0);
  assert.equal((await attempt("delete from public.applications where id = 'A-T2'")).rowCount, 1);
  assert.equal((await attempt("select 1 from public.stage_events where application_id = 'A-T2'")).rows.length, 0);
});

test('the audit log records who changed what, with only the fields that changed', { skip }, async () => {
  await q("select set_config('request.jwt.claim.sub', $1, true)", [U.recruiter]);
  await attempt("update public.candidates set phone = '99999' where id = 'C-T2'");
  await q("select set_config('request.jwt.claim.sub', '', true)");
  const r = (await attempt("select actor_id, op, old_data, new_data from public.audit_log where table_name = 'candidates' and row_id = 'C-T2' and op = 'UPDATE'")).rows;
  assert.equal(r.length, 1);
  assert.equal(r[0].actor_id, U.recruiter);
  assert.deepEqual(r[0].new_data, { phone: '99999' });
  assert.deepEqual(r[0].old_data, { phone: '' });
});
