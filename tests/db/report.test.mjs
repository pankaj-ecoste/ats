// The management report's totals counted by the database (migration 0016) must equal the browser's own counting
// (metrics() in report-metrics.js) on the same data, and only staff and management may ask. One rolled-back transaction.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect, loadEnv } from '../../scripts/db.mjs';
import { loadApp } from '../unit/load-app.mjs';

loadEnv();
const skip = process.env.DATABASE_URL ? false : 'DATABASE_URL is not set';
let c;
const q = (sql, params) => c.query(sql, params);
const U = { admin: randomUUID(), mgmt: randomUUID(), iv: randomUUID() };
const A = '2026-03-01', B = '2026-03-31';

before(async () => {
  if (skip) return;
  c = connect();
  await c.connect();
  await q('begin');
  await q("select set_config('app.allow_user_create', 'on', true)");
  for (const [n, id] of Object.entries(U)) await q("insert into auth.users (id, email, aud, role, raw_user_meta_data) values ($1, $2, 'authenticated', 'authenticated', $3)", [id, `rp${n}@ats.ecoste.in`, JSON.stringify({ full_name: 'rp' + n })]);
  await q("select set_config('app.allow_user_create', 'off', true)");
  await q("update public.profiles set role = 'admin' where id = $1", [U.admin]);
  await q("update public.profiles set role = 'management' where id = $1", [U.mgmt]);
  await q("update public.profiles set role = 'interviewer' where id = $1", [U.iv]);
  // start from nothing in the report tables so the totals are only ours (rolled back at the end)
  for (const t of ['report_events', 'call_log', 'screenings', 'interviews', 'offers']) await q(`delete from public.${t}`);
  await q("insert into public.openings (id, title, positions) values ('OP-R1', 'Report role', 1)");
  await q("insert into public.candidates (id, name, email) values ('C-R1', 'R One', 'r1@example.com'), ('C-R2', 'R Two', 'r2@example.com')");
  await q("insert into public.applications (id, candidate_id, opening_id) values ('A-R1', 'C-R1', 'OP-R1'), ('A-R2', 'C-R2', 'OP-R1')");
  await q(`insert into public.call_log (id, on_date, made, connected) values ('CL-1', '2026-03-05', 10, 4), ('CL-2', '2026-04-05', 5, 1)`);
  await q(`insert into public.screenings (application_id, outcome, screened_on) values ('A-R1', 'Interested', '2026-03-06'), ('A-R2', 'Not Interested', '2026-03-07')`);
  const ev = [['shortlist', '2026-03-02'], ['shortlist', '2026-03-03'], ['shortlist', '2026-02-27'], ['gi', '2026-03-04'], ['interview', '2026-03-05'], ['noshow', '2026-03-06'],
    ['selected', '2026-03-07'], ['offer', '2026-03-08'], ['accepted', '2026-03-09']];
  for (const [t, d] of ev) await q('insert into public.report_events (type, on_date) values ($1, $2)', [t, d]);
  await q("insert into public.report_events (type, on_date, days) values ('joined', '2026-03-10', 30), ('joined', '2026-03-11', 41)");
  await q(`insert into public.interviews (id, application_id, kind, round, on_date, at_time, status) values
    ('I-R1', 'A-R1', 'Group', 'G', '2026-03-12', '10:00', 'Completed'), ('I-R2', 'A-R1', 'Personal', 'P', '2026-03-13', '10:00', 'Completed'),
    ('I-R3', 'A-R2', 'Personal', 'P', '2026-03-14', '10:00', 'Completed'), ('I-R4', 'A-R2', 'Personal', 'P2', '2026-03-15', '10:00', 'No-show')`);
  await q("insert into public.offers (id, application_id, ctc, sent_on) values ('OF-R1', 'A-R1', 100000, '2026-03-16')");
});
after(async () => { if (!c) return; await q('rollback'); await c.end(); });

async function asUser(id, sql) {
  await q('savepoint u');
  try {
    await q(id ? 'set local role authenticated' : 'set local role anon');
    if (id) await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
    return await q(sql);
  } finally { await q('rollback to savepoint u'); await q('release savepoint u'); }
}
const EXPECT = { calls: 12, conn: 5, short: 2, gi: 2, int: 3, noshow: 2, sel: 1, offer: 2, acc: 1, join: 2, backup: 0, tth: 36 };

test('the database counts the report totals for a date range', { skip }, async () => {
  const r = (await asUser(U.admin, `select public.report_counts('${A}', '${B}') as r`)).rows[0].r;
  assert.deepEqual(r, EXPECT);
});

test('management gets the totals although it cannot read interviews, offers or screenings', { skip }, async () => {
  assert.equal((await asUser(U.mgmt, 'select count(*)::int n from public.interviews')).rows[0].n, 0);
  assert.deepEqual((await asUser(U.mgmt, `select public.report_counts('${A}', '${B}') as r`)).rows[0].r, EXPECT);
});

test('an interviewer is refused', { skip }, async () => {
  await assert.rejects(asUser(U.iv, `select public.report_counts('${A}', '${B}')`), /Only staff and management/);
});

test('nobody signed out can ask', { skip }, async () => {
  await assert.rejects(asUser(null, `select public.report_counts('${A}', '${B}')`), /permission denied/);
});

test('the browser counts the same totals from the same data', () => {
  const app = loadApp({ until: 'src/features/management-report/report-metrics.js', expose: ['S', 'metrics'], globals: { document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } }, body: { classList: { toggle() {}, add() {}, remove() {} } } }, window: new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}) }) } });
  const d = (x) => `2026-03-${x}`;
  const S = app.S;
  S.events = [['shortlist', '02'], ['shortlist', '03'], ['gi', '04'], ['interview', '05'], ['noshow', '06'], ['selected', '07'], ['offer', '08'], ['accepted', '09']].map(([t, x]) => ({ t, d: d(x) }))
    .concat([{ t: 'shortlist', d: '2026-02-27' }, { t: 'joined', d: d('10'), days: 30 }, { t: 'joined', d: d('11'), days: 41 }]);
  S.callLog = [{ d: d('05'), made: 10, conn: 4 }, { d: '2026-04-05', made: 5, conn: 1 }];
  S.applications = [{ id: 'A-R1', screening: { date: d('06'), outcome: 'Interested' } }, { id: 'A-R2', screening: { date: d('07'), outcome: 'Not Interested' } }];
  S.interviews = [{ kind: 'Group', status: 'Completed', date: d('12') }, { kind: 'Personal', status: 'Completed', date: d('13') }, { kind: 'Personal', status: 'Completed', date: d('14') }, { kind: 'Personal', status: 'No-show', date: d('15') }];
  S.offers = [{ sent: d('16') }];
  const m = JSON.parse(JSON.stringify(app.metrics(A, B)));
  for (const [k, v] of Object.entries(EXPECT)) assert.equal(m[k], v, k);
});
