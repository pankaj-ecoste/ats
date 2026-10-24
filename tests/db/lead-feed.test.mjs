// The live lead sheet (migration 0018): the database reads phones, salaries, notice periods and dates exactly as the Import leads screen does,
// accepts rows only with the right token, adds each row once, and tells an admin from everyone else. One rolled-back transaction.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect, loadEnv } from '../../scripts/db.mjs';
import { loadApp } from '../unit/load-app.mjs';

loadEnv();
const skip = process.env.DATABASE_URL ? false : 'DATABASE_URL is not set';
const app = loadApp({ until: 'services', expose: ['cleanLeadPhone', 'toLPA', 'toNotice', 'leadDate'] });
let c;
const q = (sql, params) => c.query(sql, params);
const U = { admin: randomUUID(), rec: randomUUID() };

before(async () => {
  if (skip) return;
  c = connect();
  await c.connect();
  await q('begin');
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
const ingest = (token, rows, who = null) => as(who, 'select public.ingest_leads($1, $2::jsonb) as r', [token, JSON.stringify(rows)]).then((x) => x.rows[0].r);
const one = (sql, p) => q(sql, p).then((x) => x.rows[0]);
let TOKEN;

test('reading phones, salaries, notice periods and dates: the database and the app agree', { skip }, async () => {
  const phones = ['98765 43210', '+91-98765-43210', '919876543210', '09876543210', '0919876543210', '9.87654321E9', '9876543210', '+44 20 7946 0958', '12345', '1234567890', '', '  ', '98765abc43210', '+91 (98765) 43210'];
  for (const p of phones) {
    const js = JSON.parse(JSON.stringify(app.cleanLeadPhone(p)));
    const db = await one('select shown, key from app.lead_phone($1)', [p]);
    assert.deepEqual({ text: db.shown, key: db.key }, js, `phone "${p}"`);
  }
  for (const s of ['10 LPA', '50000 per month', '', '12', '8 lakhs', '1200000', 'abc', '25k', '1.5 Lac', '40000 pm', '6']) {
    assert.equal(Number((await one('select app.lead_lpa($1) as v', [s])).v), app.toLPA(s), `salary "${s}"`);
  }
  for (const s of ['1 month', '2 weeks', 'immediate', '', '45', 'serving notice', '0', '15 days', 'abc', '3 months']) {
    assert.equal((await one('select app.lead_notice($1) as v', [s])).v, app.toNotice(s), `notice "${s}"`);
  }
  for (const s of ['2026-10-12', '2026-10-12 14:30:00', '12/10/2026', '5.1.26', '13/13/2026', 'yesterday', '', '1999-01-01']) {
    const db = (await one("select to_char(app.lead_date($1, date '2000-01-01'), 'YYYY-MM-DD') as v", [s])).v;
    assert.equal(db, app.leadDate(s, '2000-01-01'), `date "${s}"`);
  }
  // the one difference: the app keeps a date that does not exist (31/02), the database cannot store it and uses the fallback
  assert.equal((await one("select to_char(app.lead_date('31/02/2026', date '2000-01-01'), 'YYYY-MM-DD') as v")).v, '2000-01-01');
});

test('only an admin sees or changes the lead sheet settings; nobody can read the table', { skip }, async () => {
  await assert.rejects(as(U.rec, 'select public.lead_feed_status()'), /Only an admin/);
  await assert.rejects(as(U.rec, "select public.lead_feed_save('OP-F1', 'x', true)"), /Only an admin/);
  await assert.rejects(as(null, 'select public.lead_feed_status()'), /permission denied/);
  await assert.rejects(as(U.admin, 'select * from public.lead_feed'), /permission denied/, 'the table is closed even to an admin; only the functions open it');
  await assert.rejects(as(U.admin, "select public.lead_feed_save('OP-NOPE', 'x', true)"), /does not exist/);
});

test('setting it up makes a token once, keeps only its hash, and a new token ends the old one', { skip }, async () => {
  const st0 = (await as(U.admin, 'select public.lead_feed_status() as s')).rows[0].s;
  assert.equal(st0.set_up, false);
  const r1 = (await as(U.admin, "select public.lead_feed_save('OP-F1', 'Facebook Ad', true) as r")).rows[0].r;
  TOKEN = r1.token;
  assert.match(TOKEN, /^[0-9a-f]{64}$/);
  const row = await one('select token_hash, opening_id, source, enabled from public.lead_feed');
  assert.notEqual(row.token_hash, TOKEN);
  assert.match(row.token_hash, /^[0-9a-f]{64}$/);
  assert.deepEqual({ o: row.opening_id, s: row.source, e: row.enabled }, { o: 'OP-F1', s: 'Facebook Ad', e: true });
  const st = (await as(U.admin, 'select public.lead_feed_status() as s')).rows[0].s;
  assert.deepEqual({ set_up: st.set_up, enabled: st.enabled, opening: st.opening, source: st.source }, { set_up: true, enabled: true, opening: 'OP-F1', source: 'Facebook Ad' });
  assert.equal(JSON.stringify(st).includes(TOKEN), false);
  assert.equal(JSON.stringify(st).includes('token_hash'), false);
  // changing the settings does not change the token
  const r2 = (await as(U.admin, "select public.lead_feed_save('OP-F1', 'Facebook Ad', true) as r")).rows[0].r;
  assert.equal(r2.token, null);
  assert.equal((await ingest(TOKEN, [])).ok, true);
  // a new token: the old one stops working
  const r3 = (await as(U.admin, "select public.lead_feed_save('OP-F1', 'Facebook Ad', true, true) as r")).rows[0].r;
  assert.notEqual(r3.token, TOKEN);
  assert.equal((await ingest(TOKEN, [])).ok, false);
  TOKEN = r3.token;
  assert.equal((await ingest(TOKEN, [])).ok, true);
});

test('a wrong token, a missing token or a switched-off sheet is refused and noted, but the log cannot be flooded', { skip }, async () => {
  const bad = await ingest('nope', [{ name: 'Sneaky', phone: '98765 43210' }]);
  assert.equal(bad.ok, false);
  assert.match(bad.message, /not valid|switched off/);
  assert.equal((await ingest(null, [])).ok, false);
  assert.equal((await one("select count(*)::int n from public.candidates where name = 'Sneaky'")).n, 0);
  for (let i = 0; i < 10; i++) await ingest('nope' + i, []);
  assert.ok((await one("select count(*)::int n from public.intake_batches where source = 'sheet' and error like 'Refused%'")).n <= 5);
  await as(U.admin, "select public.lead_feed_save('OP-F1', 'Facebook Ad', false)");
  assert.equal((await ingest(TOKEN, [{ name: 'Off', phone: '98765 43210' }])).ok, false);
  await as(U.admin, "select public.lead_feed_save('OP-F1', 'Facebook Ad', true)");
  assert.equal((await ingest(TOKEN, [])).ok, true);
});

test('rows are checked and added: new, existing, repeated and unusable', { skip }, async () => {
  await q("insert into public.candidates (id, name, email, phone) values ('C-OLD1', 'Meena Iyer', 'meena@example.com', '+91 91111 22222')");
  const rows = [
    { name: ' Asha Rao ', phone: '98765 43210', email: 'ASHA@Example.com', location: 'Pune', exp: '4 years', skills: 'Java, SQL; Kafka', curSal: '10 LPA', expSal: '15', notice: '1 month', source: 'Instagram Ad', date: '12/10/2026', notes: 'Call after 6', designation: 'Engineer', company: 'Acme' },
    { name: 'Ravi K', phone: '97000 11111' },
    { name: 'Ravi again', phone: '+91-97000-11111' },                         // the same phone, same batch
    { name: 'Meena I', phone: '9111122222' },                                 // in the system, never applied here
    { name: 'Dev', phone: '98000 00001', email: 'meena@example.com', position: 'Second feed role' },   // same email as an existing person; a different opening by title
    { name: '', phone: '99999 88888' },
    { name: 'Nobody', phone: '123', email: 'not-an-email' },
    { name: 'Kiran' },
    { name: 'Closed Co', phone: '98111 11111', position: 'OP-F3' },          // a closed opening named in the row: the sheet's own opening is used
    { name: 'Gita', email: 'gita@example.com' },                              // an email alone is enough
  ];
  const r = await ingest(TOKEN, rows);
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows.map((x) => x.status), ['added', 'added', 'duplicate', 'existing', 'existing', 'skipped', 'skipped', 'skipped', 'added', 'added']);
  assert.deepEqual({ added: r.added, existing: r.existing, duplicates: r.duplicates, skipped: r.skipped }, { added: 4, existing: 2, duplicates: 1, skipped: 3 });
  assert.match(r.rows[2].why, /Already applied for this opening \(Ravi K\)/);
  assert.equal(r.rows[5].why, 'No name');
  assert.equal(r.rows[6].why, 'Phone or email is not valid');
  assert.equal(r.rows[7].why, 'No phone or email');

  const a = await one("select * from public.candidates where name = 'Asha Rao'");
  assert.deepEqual({ email: a.email, phone: a.phone, loc: a.location, exp: Number(a.exp_years), skills: a.skills, notice: a.notice_days, src: a.source, desig: a.designation, co: a.company },
    { email: 'asha@example.com', phone: '+91 98765 43210', loc: 'Pune', exp: 4, skills: ['Java', 'SQL', 'Kafka'], notice: 30, src: 'Instagram Ad', desig: 'Engineer', co: 'Acme' });
  assert.equal((await one("select to_char(created_on, 'YYYY-MM-DD') as d from public.candidates where id = $1", [a.id])).d, '2026-10-12');
  assert.equal(a.notes[0].text, 'Call after 6');
  assert.equal(a.notes[0].by, 'Lead sheet');
  const comp = await one('select current_lpa, expected_lpa from public.candidate_compensation where candidate_id = $1', [a.id]);
  assert.deepEqual({ c: Number(comp.current_lpa), e: Number(comp.expected_lpa) }, { c: 10, e: 15 });
  assert.deepEqual((await q('select name, status from public.candidate_documents where candidate_id = $1', [a.id])).rows, [{ name: 'Resume', status: 'Pending' }]);
  const ravi = await one("select * from public.candidates where name = 'Ravi K'");
  assert.deepEqual({ src: ravi.source, loc: ravi.location, desig: ravi.designation, edu: ravi.education, notice: ravi.notice_days }, { src: 'Facebook Ad', loc: '—', desig: '—', edu: '—', notice: 30 });
  assert.equal((await one("select count(*)::int n from public.candidates where name = 'Ravi again'")).n, 0);
  assert.equal((await one("select count(*)::int n from public.candidates where lower(name) like 'meena%'")).n, 1, 'Meena was not created twice');

  const apps = (await q("select a.stage, a.recruiter_id, a.opening_id, c.name from public.applications a join public.candidates c on c.id = a.candidate_id where c.name in ('Asha Rao','Ravi K','Meena Iyer','Gita','Closed Co') order by c.name, a.opening_id")).rows;
  assert.deepEqual(apps.map((x) => [x.name, x.opening_id, x.stage]), [['Asha Rao', 'OP-F1', 'New'], ['Closed Co', 'OP-F1', 'New'], ['Gita', 'OP-F1', 'New'], ['Meena Iyer', 'OP-F1', 'New'], ['Meena Iyer', 'OP-F2', 'New'], ['Ravi K', 'OP-F1', 'New']]);
  assert.ok(apps.every((x) => x.recruiter_id === U.rec));
  const batch = await one("select * from public.intake_batches where source = 'sheet' and rows_read = 10");
  assert.deepEqual({ read: batch.rows_read, added: batch.rows_added, skipped: batch.rows_skipped }, { read: 10, added: 6, skipped: 4 });
  assert.deepEqual(batch.detail, { added: 4, existing: 2, duplicates: 1, skipped: 3 });
  const notes = (await q("select text from public.notifications where user_id = $1 order by text", [U.rec])).rows.map((x) => x.text);
  assert.ok(notes.some((t) => t.startsWith('5 new leads from the lead sheet for Feed role')), notes.join('|'));
  assert.ok(notes.some((t) => t.startsWith('1 new lead from the lead sheet for Second feed role')), notes.join('|'));
  assert.ok((await one("select count(*)::int n from public.activity where text like '%added from the lead sheet%'")).n >= 2);
  assert.ok((await one('select last_received_at from public.lead_feed')).last_received_at);
});

test('the same rows sent again add nothing, so a script that resends is harmless', { skip }, async () => {
  const before = (await one('select (select count(*) from public.candidates)::int c, (select count(*) from public.applications)::int a')) ;
  const r = await ingest(TOKEN, [{ name: 'Ravi K', phone: '97000 11111' }, { name: 'Asha Rao', phone: '98765 43210', email: 'asha@example.com' }, { name: 'Gita', email: 'gita@example.com' }]);
  assert.deepEqual(r.rows.map((x) => x.status), ['duplicate', 'duplicate', 'duplicate']);
  assert.deepEqual(await one('select (select count(*) from public.candidates)::int c, (select count(*) from public.applications)::int a'), before);
});

test('bad input is refused as a whole: not a list, or more than 500 rows', { skip }, async () => {
  assert.equal((await as(null, "select public.ingest_leads($1, '{\"a\":1}'::jsonb) as r", [TOKEN])).rows[0].r.ok, false);
  const big = Array.from({ length: 501 }, (_, i) => ({ name: 'N' + i, phone: String(6000000000 + i) }));
  const r = await ingest(TOKEN, big);
  assert.equal(r.ok, false);
  assert.match(r.message, /at most 500/);
});

test('500 rows go in together, with a repeat inside the batch, in a few seconds', { skip }, async () => {
  const rows = Array.from({ length: 500 }, (_, i) => ({ name: 'Bulk ' + i, phone: String(6100000000 + i * 7919), email: i % 4 ? '' : `bulk${i}@example.com`, location: 'Pune', exp: String(i % 9) }));
  rows[499] = { ...rows[0], name: 'Bulk repeat' };
  const t0 = Date.now();
  const r = await ingest(TOKEN, rows);
  const ms = Date.now() - t0;
  assert.deepEqual({ added: r.added, duplicates: r.duplicates }, { added: 499, duplicates: 1 });
  assert.equal((await one("select count(*)::int n from public.candidates where name like 'Bulk %'")).n, 499);
  console.log(`      500 rows ingested in ${ms} ms`);
  assert.ok(ms < 30000, `took ${ms} ms`);
});

test('a row the database cannot save is skipped with a reason and the others still go in', { skip }, async () => {
  await q("alter table public.candidate_compensation add constraint cc_test_block check (current_lpa <> 77)");
  const r = await ingest(TOKEN, [{ name: 'Fine One', phone: '98700 00001' }, { name: 'Broken One', phone: '98700 00002', curSal: '77 LPA' }, { name: 'Fine Two', phone: '98700 00003' }]);
  assert.deepEqual(r.rows.map((x) => x.status), ['added', 'skipped', 'added']);
  assert.match(r.rows[1].why, /Could not save this row/);
  assert.equal((await one("select count(*)::int n from public.candidates where name = 'Broken One'")).n, 0, 'nothing of the broken row is left behind');
  await q('alter table public.candidate_compensation drop constraint cc_test_block');
});
