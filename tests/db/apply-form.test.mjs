// The application form of an opening (migration 0026): which usual questions it asks, extra questions of the recruiter's own, the rules that keep a form
// well-formed, what the public may read of it, and the check of every answer on submit. One rolled-back transaction; 0025 and 0026 are applied inside it if needed.
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

before(async () => {
  if (skip) return;
  c = connect();
  await c.connect();
  await q('begin');
  if (!(await q("select to_regproc('app.pick_source') as f")).rows[0].f) await q(readFileSync(new URL('../../supabase/migrations/0025_apply_source.sql', import.meta.url), 'utf8'));
  if (!(await q("select to_regproc('app.valid_apply_form') as f")).rows[0].f) await q(readFileSync(new URL('../../supabase/migrations/0026_application_form.sql', import.meta.url), 'utf8'));
  await q("select set_config('app.allow_user_create', 'on', true)");
  for (const [n, id] of Object.entries(U)) await q("insert into auth.users (id, email, aud, role, raw_user_meta_data) values ($1, $2, 'authenticated', 'authenticated', $3)", [id, `lf${n}@ats.ecoste.in`, JSON.stringify({ full_name: 'Feed ' + n })]);
  await q("select set_config('app.allow_user_create', 'off', true)");
  await q("update public.profiles set role = 'admin' where id = $1", [U.admin]);
  await q("update public.profiles set role = 'recruiter' where id = $1", [U.rec]);
  await q("insert into public.openings (id, title, positions, recruiter_id, status) values ('OP-F1', 'Feed role', 3, $1, 'Open'), ('OP-F2', 'Second feed role', 1, $1, 'Open'), ('OP-F3', 'Closed feed role', 1, $1, 'Closed')", [U.rec]);
});
after(async () => { if (!c) return; await q('rollback'); await c.end(); });

// run one statement as a role (anon, or a signed-in person) and go back to the owner; the work is kept inside the transaction
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

const one = (sql, p) => q(sql, p).then((x) => x.rows[0]);
const Q = (id, label, type = 'text', extra = {}) => ({ id, label, type, required: false, ...extra });
const setForm = (op, form) => q('update public.openings set form = $2::jsonb where id = $1', [op, JSON.stringify(form)]);
const tryForm = async (form) => {
  await q('savepoint f');
  try { await q('update public.openings set form = $1::jsonb where id = $2', [JSON.stringify(form), 'OP-F1']); await q('release savepoint f'); return 'ok'; }
  catch (e) { await q('rollback to savepoint f'); await q('release savepoint f'); return e.message; }
};
const apply = (over = {}, answers = {}) => {
  const a = { opening: 'OP-F1', name: 'Asha Rao', email: 'asha@example.com', phone: '+91 98450 11223', ...over };
  return as(null, 'select public.submit_application($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb) as r',
    [a.opening, a.name, a.email, a.phone, 'Pune', 3, 30, 6, 9, ['Java'], 'B.Tech', null, null, true, '', 'LinkedIn', JSON.stringify(answers)]).then((x) => x.rows[0].r);
};
const answersOf = (email, op = 'OP-F1') => one('select a.answers from public.applications a join public.candidates c on c.id = a.candidate_id where lower(c.email) = $1 and a.opening_id = $2', [email, op]).then((x) => x && x.answers);

test('an opening with no form is the form as it always was', { skip }, async () => {
  assert.deepEqual((await one("select form from public.openings where id = 'OP-F1'")).form, {});
  const r = await apply({ email: 'plain@example.com', name: 'Plain Person' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(await answersOf('plain@example.com'), {});
});

test('the rules that keep a form well-formed: only the known switches and question types, at most 15 questions, no duplicates', { skip }, async () => {
  const good = { hide: ['cur', 'expected'], questions: [Q('a1', 'Do you have a bike?', 'yesno', { required: true }), Q('b2', 'City you live in', 'text'), Q('c3', 'Pick one', 'choice', { options: ['A', 'B'] })] };
  assert.equal(await tryForm(good), 'ok');
  assert.equal(await tryForm({}), 'ok');
  const bad = async (form, why) => assert.match(await tryForm(form), /openings_form_valid|violates check/, why);
  await bad('not an object', 'a form must be an object');
  await bad({ hide: ['name'] }, 'name cannot be switched off');
  await bad({ hide: 'cur' }, 'hide is a list');
  await bad({ other: 1 }, 'no unknown keys');
  await bad({ questions: [Q('a1', 'x', 'date')] }, 'unknown type');
  await bad({ questions: [Q('A1!', 'x')] }, 'a plain id');
  await bad({ questions: [Q('a1', '')] }, 'an empty label');
  await bad({ questions: [Q('a1', ' padded ')] }, 'a label without spaces at its ends');
  await bad({ questions: [Q('a1', 'x'.repeat(201))] }, 'a long label');
  await bad({ questions: [Q('a1', 'One'), Q('a1', 'Two')] }, 'two questions with one id');
  await bad({ questions: [Q('a1', 'Same'), Q('a2', 'same')] }, 'two questions with one label, in any letter case');
  await bad({ questions: [Q('a1', 'Pick', 'choice', { options: ['only'] })] }, 'a choice needs two options');
  await bad({ questions: [Q('a1', 'Pick', 'choice', { options: Array.from({ length: 11 }, (_, i) => 'o' + i) })] }, 'at most ten options');
  await bad({ questions: [Q('a1', 'Pick', 'choice', { options: ['a', ''] })] }, 'no empty option');
  await bad({ questions: [Q('a1', 'Text', 'text', { options: ['a', 'b'] })] }, 'options only for a choice');
  await bad({ questions: [Q('a1', 'Text', 'text', { colour: 'red' })] }, 'no unknown question keys');
  await bad({ questions: Array.from({ length: 16 }, (_, i) => Q('q' + i, 'Question ' + i)) }, 'at most 15 questions');
  assert.equal(await tryForm({ questions: Array.from({ length: 15 }, (_, i) => Q('q' + i, 'Question ' + i)) }), 'ok');
});

test('the public reads the form of an open role, and of nothing else', { skip }, async () => {
  const form = { hide: ['cur'], questions: [Q('a1', 'Do you have a bike?', 'yesno')] };
  await setForm('OP-F1', form);
  const rows = (await as(null, "select id, form from public.careers_openings where id in ('OP-F1', 'OP-F3') order by id")).rows;
  assert.deepEqual(rows.map((r) => r.id), ['OP-F1'], 'a closed role is not listed');
  assert.deepEqual(rows[0].form, form);
  await assert.rejects(as(null, 'select form from public.openings'), /permission denied/);
});

test('every answer is checked against the opening\'s own questions', { skip }, async () => {
  await setForm('OP-F1', { questions: [
    Q('bike', 'Do you have a bike?', 'yesno', { required: true }),
    Q('yrs', 'Years in sales', 'number', { required: true }),
    Q('area', 'Preferred area', 'choice', { options: ['North', 'South', 'East'], required: true }),
    Q('why', 'Why this role?', 'long'),
    Q('nick', 'Nickname', 'text'),
  ] });
  const ok = { bike: 'yes', yrs: '3.5', area: 'South', why: 'x'.repeat(1500), nick: '  Ash  ' };
  const refused = async (answers, text, who = 'r' + Math.random().toString(36).slice(2, 7)) => {
    const r = await apply({ email: `${who}@example.com`, name: 'Refused Person' }, answers);
    assert.equal(r.ok, false, JSON.stringify(answers));
    assert.match(r.message, text);
    assert.equal((await one('select count(*)::int n from public.candidates where lower(email) = $1', [`${who}@example.com`])).n, 0, 'a refused try creates nothing');
  };
  await refused({ ...ok, bike: '' }, /Please answer: Do you have a bike\?/);
  await refused({ ...ok, yrs: undefined }, /Please answer: Years in sales/);
  await refused({ ...ok, bike: 'maybe' }, /Please answer Yes or No: Do you have a bike\?/);
  await refused({ ...ok, yrs: 'three' }, /Please enter a number for: Years in sales/);
  await refused({ ...ok, yrs: '1e9' }, /Please enter a number/);
  await refused({ ...ok, area: 'West' }, /Please choose one of the options for: Preferred area/);
  await refused({ ...ok, area: 'south' }, /Please choose one of the options/);
  await refused('not an object', /Please answer: Do you have a bike\?/);
  const r = await apply({ email: 'good@example.com', name: 'Good Person' }, ok);
  assert.equal(r.ok, true, JSON.stringify(r));
  const a = await answersOf('good@example.com');
  assert.deepEqual({ ...a, 'Why this role?': a['Why this role?'].length }, { 'Do you have a bike?': 'Yes', 'Years in sales': '3.5', 'Preferred area': 'South', 'Why this role?': 1000, Nickname: 'Ash' });
  assert.ok((await one("select count(*)::int n from public.intake_batches where error like 'Refused: Please answer%'")).n >= 1, 'a refusal is logged');
});

test('answers to a question that is not on the form are ignored, and an optional question may stay empty', { skip }, async () => {
  const r = await apply({ email: 'extra@example.com', name: 'Extra Person' }, { bike: 'No', yrs: '0', area: 'North', hacker: 'x', '<b>': 'y' });
  assert.equal(r.ok, true);
  assert.deepEqual(await answersOf('extra@example.com'), { 'Do you have a bike?': 'No', 'Years in sales': '0', 'Preferred area': 'North' });
});

test('a repeat applicant keeps the first answers; a person already in the pool applying to another role gives that role\'s answers', { skip }, async () => {
  const again = await apply({ email: 'good@example.com', name: 'Good Person' }, { bike: 'No', yrs: '9', area: 'East' });
  assert.match(again.message, /already applied/);
  assert.equal((await answersOf('good@example.com'))['Do you have a bike?'], 'Yes');
  await setForm('OP-F2', { questions: [Q('lang', 'Languages you speak', 'text', { required: true })] });
  const r = await apply({ opening: 'OP-F2', email: 'good@example.com', name: 'Good Person' }, { lang: 'Hindi, English' });
  assert.equal(r.ok, true);
  assert.deepEqual(await answersOf('good@example.com', 'OP-F2'), { 'Languages you speak': 'Hindi, English' });
});

test('switching usual questions off changes nothing for the database: the person is still found by name, email and phone', { skip }, async () => {
  await setForm('OP-F2', { hide: ['location', 'exp', 'notice', 'cur', 'expected', 'edu', 'skills', 'resume'] });
  const r = await as(null, "select public.submit_application('OP-F2', 'Short Form', 'short@example.com', '+91 98450 99887', null, null, null, null, null, null, null, null, null, true, '', '', '{}') as r");
  assert.equal(r.rows[0].r.ok, true, JSON.stringify(r.rows[0].r));
  const c = await one("select name, location, exp_years, notice_days, education, skills from public.candidates where email = 'short@example.com'");
  assert.deepEqual({ ...c, exp_years: Number(c.exp_years) }, { name: 'Short Form', location: '', exp_years: 0, notice_days: 30, education: '', skills: [] });
});

test('the old 15, 16 argument calls still work', { skip }, async () => {
  const r15 = (await as(null, "select public.submit_application('OP-F2', 'Old Caller', 'old15@example.com', '+91 98450 22334', 'Pune', 1, 30, 1, 1, '{}', 'x', null, null, true, '') as r")).rows[0].r;
  assert.equal(r15.ok, true);
  const r16 = (await as(null, "select public.submit_application('OP-F2', 'Old Caller 2', 'old16@example.com', '+91 98450 22335', 'Pune', 1, 30, 1, 1, '{}', 'x', null, null, true, '', 'Naukri') as r")).rows[0].r;
  assert.equal(r16.ok, true);
});

test('a recruiter can save a form through the same rules the app uses; a bad one is refused', { skip }, async () => {
  const ok = await as(U.rec, "update public.openings set form = '{\"questions\": [{\"id\": \"z9\", \"label\": \"Bike?\", \"type\": \"yesno\", \"required\": true, \"options\": []}]}'::jsonb where id = 'OP-F1' returning form");
  assert.equal(ok.rows[0].form.questions[0].label, 'Bike?');
  await assert.rejects(as(U.rec, "update public.openings set form = '{\"questions\": [{\"id\": \"z9\"}]}'::jsonb where id = 'OP-F1'"), /openings_form_valid|violates check/);
});
