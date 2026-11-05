// The public application form with a source (migration 0025): the link a job post carries names the platform, the database accepts only sources on the
// company's list, tags the application, keeps the first source of a repeat applicant and says so. One rolled-back transaction; 0025 is applied inside it if needed.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect, loadEnv } from '../../scripts/db.mjs';
import { loadApp } from '../unit/load-app.mjs';

loadEnv();
const skip = process.env.DATABASE_URL ? false : 'DATABASE_URL is not set';
const app = loadApp({ until: 'services', expose: ['SOURCES'] });
let c;
const q = (sql, params) => c.query(sql, params);
const U = { admin: randomUUID(), rec: randomUUID() };

before(async () => {
  if (skip) return;
  c = connect();
  await c.connect();
  await q('begin');
  if (!(await q("select to_regproc('app.pick_source') as f")).rows[0].f) await q(readFileSync(new URL('../../supabase/migrations/0025_apply_source.sql', import.meta.url), 'utf8'));
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
const apply = (who, over = {}) => {
  const a = { opening: 'OP-F1', name: 'Asha Rao', email: 'asha@example.com', phone: '+91 98450 11223', source: 'LinkedIn', consent: true, ...over };
  return as(who, 'select public.submit_application($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) as r',
    [a.opening, a.name, a.email, a.phone, 'Pune', 3, 30, 6, 9, ['Java'], 'B.Tech', null, null, a.consent, '', a.source]).then((x) => x.rows[0].r);
};
const srcOf = (email, op) => one('select c.source as cs, a.source as asrc from public.candidates c join public.applications a on a.candidate_id = c.id where lower(c.email) = $1 and a.opening_id = $2', [email, op]);

test('the built-in list of sources in the database is the one in the app', { skip }, async () => {
  const db = (await one('select app.default_sources() as l')).l;
  assert.deepEqual([...db].sort(), [...app.SOURCES].sort());
});

test('a name is taken from the company list in any letter case; anything else is the careers page', { skip }, async () => {
  const pick = async (s) => (await one('select app.pick_source($1) as s', [s])).s;
  assert.equal(await pick('LinkedIn'), 'LinkedIn');
  assert.equal(await pick('linkedin'), 'LinkedIn');
  assert.equal(await pick('  FACEBOOK ad '), 'Facebook Ad');
  assert.equal(await pick('X'), 'X');
  assert.equal(await pick(''), 'Careers Page');
  assert.equal(await pick(null), 'Careers Page');
  assert.equal(await pick('Totally made up'), 'Careers Page');
  assert.equal(await pick('x'.repeat(500)), 'Careers Page');
  // a source an admin added in Settings, and a site added in Manage sites
  await q("insert into public.company_settings (singleton, company, config) values (true, 'T', '{\"sources\":[\"Roadshow\"]}') on conflict (singleton) do update set config = '{\"sources\":[\"Roadshow\"]}'");
  assert.equal(await pick('roadshow'), 'Roadshow');
  await q("insert into public.job_boards (id, name, source_name, custom) values ('zz1', 'Zed Jobs', 'ZedJobs', true)");
  assert.equal(await pick('zedjobs'), 'ZedJobs');
  assert.equal(await pick('Naukri'), 'Naukri', 'the built-in ones stay');
});

test('applying through a platform link tags the candidate and the application, and the recruiter hears of it', { skip }, async () => {
  const r = await apply(null);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(await srcOf('asha@example.com', 'OP-F1'), { cs: 'LinkedIn', asrc: 'LinkedIn' });
  assert.equal((await one("select count(*)::int n from public.activity where text = 'Asha Rao applied for Feed role on the careers page (LinkedIn)'")).n, 1);
  assert.equal((await one("select count(*)::int n from public.notifications where user_id = $1 and text = 'New application from the careers page (LinkedIn): Asha Rao for Feed role'", [U.rec])).n, 1);
  assert.equal((await one("select detail ->> 'source' as s from public.intake_batches where source = 'careers_page' and detail ->> 'email' = 'asha@example.com'")).s, 'LinkedIn');
});

test('no source, or a source nobody listed, is the careers page and reads like before', { skip }, async () => {
  assert.equal((await apply(null, { email: 'plain@example.com', name: 'Plain Person', source: '' })).ok, true);
  assert.deepEqual(await srcOf('plain@example.com', 'OP-F1'), { cs: 'Careers Page', asrc: 'Careers Page' });
  assert.equal((await one("select count(*)::int n from public.notifications where user_id = $1 and text = 'New application from the careers page: Plain Person for Feed role'", [U.rec])).n, 1, 'the old wording');
  assert.equal((await apply(null, { email: 'junk@example.com', name: 'Junk Source', source: '<script>alert(1)</script>' })).ok, true);
  assert.deepEqual(await srcOf('junk@example.com', 'OP-F1'), { cs: 'Careers Page', asrc: 'Careers Page' });
  // the old 15-argument call still works
  const old = (await as(null, "select public.submit_application('OP-F1', 'Old Caller', 'old@example.com', '+91 98450 22334', 'Pune', 1, 30, 1, 1, '{}', 'x', null, null, true, '') as r")).rows[0].r;
  assert.equal(old.ok, true);
  assert.equal((await srcOf('old@example.com', 'OP-F1')).asrc, 'Careers Page');
});

test('the same person through another platform link: no second application, the first source stays, the activity says so', { skip }, async () => {
  const r = await apply(null, { source: 'Naukri' });
  assert.match(r.message, /already applied/);
  assert.equal((await one("select count(*)::int n from public.applications a join public.candidates c on c.id = a.candidate_id where lower(c.email) = 'asha@example.com'")).n, 1);
  assert.deepEqual(await srcOf('asha@example.com', 'OP-F1'), { cs: 'LinkedIn', asrc: 'LinkedIn' });
  assert.equal((await one("select count(*)::int n from public.activity where text = 'Asha Rao also came through Naukri (careers page)'")).n, 1);
  await apply(null, { source: 'LinkedIn' });
  assert.equal((await one("select count(*)::int n from public.activity where text like 'Asha Rao also came through LinkedIn%'")).n, 0, 'the same source again is not noted');
});

test('a person already in the pool applying to another role by another link: the new application has its own source, their first source stays', { skip }, async () => {
  const r = await apply(null, { opening: 'OP-F2', source: 'Indeed' });
  assert.equal(r.ok, true);
  assert.deepEqual(await srcOf('asha@example.com', 'OP-F2'), { cs: 'LinkedIn', asrc: 'Indeed' });
});
