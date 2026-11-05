// Linking a Google Sheet tab to an opening (migrations 0018 to 0023): the database reads phones, salaries, notice periods and dates exactly as the
// Import leads screen does, accepts rows only with the right token, adds each row once to the linked opening with its source, campaign and form
// answers, and tells an admin or recruiter from everyone else. One rolled-back transaction. If 0023 is not applied yet, it is applied inside the transaction.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
  if (!(await q("select to_regproc('public.sheet_sync_plan') as f")).rows[0].f) await q(readFileSync(new URL('../../supabase/migrations/0023_sheet_links.sql', import.meta.url), 'utf8'));
  await q('delete from public.lead_feed');   // the real project may already be set up; the test starts from nothing, and the transaction is rolled back
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

const rpc = (who, fn, ...args) => as(who, `select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(', ')}) as r`, args).then((x) => x.rows[0].r);
const tabs = (list) => JSON.stringify(list.map(([key, name, headings]) => ({ key, name, headings })));
const sync = (token, list) => rpc(null, 'sheet_sync_plan', token, tabs(list));
const send = (token, key, rows) => rpc(null, 'ingest_tab_leads', token, key, JSON.stringify(rows));
const HEAD = ['Date', 'Full Name', 'Mobile', 'Email ID', 'City', 'Do you have a bike?', 'Years in sales', 'ad_id'];
const MAP = { name: 'Full Name', phone: 'Mobile', email: 'Email ID', location: 'City', date: 'Date' };
const EXTRA = ['Do you have a bike?', 'Years in sales'];
const link = (who, op, key, source = 'Facebook Ad', map = MAP, extra = EXTRA) => rpc(who, 'sheet_link_save', op, key, source, JSON.stringify(map), JSON.stringify(extra));

test('only an admin sees or changes the connection; nobody can read the table', { skip }, async () => {
  await assert.rejects(as(U.rec, 'select public.lead_feed_status()'), /Only an admin/);
  await assert.rejects(as(U.rec, 'select public.lead_feed_connect(true)'), /Only an admin/);
  await assert.rejects(as(null, 'select public.lead_feed_status()'), /permission denied/);
  await assert.rejects(as(U.admin, 'select * from public.lead_feed'), /permission denied/, 'the table is closed even to an admin; only the functions open it');
});

test('setting it up makes a token once, keeps only its hash, and a new token ends the old one', { skip }, async () => {
  assert.equal((await rpc(U.admin, 'lead_feed_status')).set_up, false);
  TOKEN = (await rpc(U.admin, 'lead_feed_connect', true)).token;
  assert.match(TOKEN, /^[0-9a-f]{64}$/);
  const row = await one('select token_hash, enabled from public.lead_feed');
  assert.notEqual(row.token_hash, TOKEN);
  assert.match(row.token_hash, /^[0-9a-f]{64}$/);
  const st = await rpc(U.admin, 'lead_feed_status');
  assert.deepEqual({ set_up: st.set_up, enabled: st.enabled, tabs_seen: st.tabs_seen }, { set_up: true, enabled: true, tabs_seen: 0 });
  assert.equal(JSON.stringify(st).includes(TOKEN), false);
  assert.equal((await rpc(U.admin, 'lead_feed_connect', true)).token, null, 'changing the switch does not change the token');
  assert.equal((await sync(TOKEN, [])).ok, true);
  const t2 = (await rpc(U.admin, 'lead_feed_connect', true, true)).token;
  assert.notEqual(t2, TOKEN);
  assert.equal((await sync(TOKEN, [])).ok, false);
  TOKEN = t2;
  assert.equal((await sync(TOKEN, [])).ok, true);
});

test('a wrong token, a missing token or a switched-off connection is refused and noted, but the log cannot be flooded', { skip }, async () => {
  const bad = await sync('nope', [['k', 'T', HEAD]]);
  assert.equal(bad.ok, false);
  assert.match(bad.message, /not valid|switched off/);
  assert.equal((await sync(null, [])).ok, false);
  assert.equal((await send('nope', 'k', [{ name: 'Sneaky', phone: '98765 43210' }])).ok, false);
  assert.equal((await one("select count(*)::int n from public.sheet_tabs where tab_name = 'T'")).n, 0, 'a refused call saves nothing');
  for (let i = 0; i < 10; i++) await sync('nope' + i, []);
  assert.ok((await one("select count(*)::int n from public.intake_batches where source = 'sheet' and error like 'Refused%'")).n <= 5);
  await rpc(U.admin, 'lead_feed_connect', false);
  assert.equal((await sync(TOKEN, [])).ok, false);
  await rpc(U.admin, 'lead_feed_connect', true);
  assert.equal((await sync(TOKEN, [])).ok, true);
});

test('the script reports its tabs; nothing is linked yet, so nothing is to be sent', { skip }, async () => {
  const r = await sync(TOKEN, [['bk/1', 'Sales Executive Jammu', HEAD], ['bk/2', 'CRM Delhi', ['Name', 'Phone']], ['bk/3', 'Sheet18', []]]);
  assert.deepEqual({ ok: r.ok, links: r.links }, { ok: true, links: [] });
  assert.equal((await one('select count(*)::int n from public.sheet_tabs')).n, 3);
  assert.deepEqual((await one("select headings from public.sheet_tabs where tab_key = 'bk/1'")).headings, HEAD);
  assert.equal((await rpc(U.admin, 'lead_feed_status')).tabs_seen, 3);
  assert.equal((await rpc(null, 'sheet_sync_plan', TOKEN, '{"a":1}')).ok, false, 'not a list');
});

test('linking: staff only; the columns are checked; one tab belongs to one opening, an opening may have several tabs', { skip }, async () => {
  await assert.rejects(link(null, 'OP-F1', 'bk/1'), /permission denied/);
  await assert.rejects(link(U.rec, 'OP-NOPE', 'bk/1'), /does not exist/);
  await assert.rejects(link(U.rec, 'OP-F3', 'bk/1'), /is closed/);
  await assert.rejects(link(U.rec, 'OP-F1', 'bk/1', '  '), /Choose where/);
  await assert.rejects(link(U.rec, 'OP-F1', 'bk/unseen'), /has not been seen yet/);
  await assert.rejects(link(U.rec, 'OP-F1', 'bk/1', 'Facebook Ad', { phone: 'Mobile' }), /Choose the Name column/);
  await assert.rejects(link(U.rec, 'OP-F1', 'bk/1', 'Facebook Ad', { name: 'Full Name' }), /Phone column or the Email column/);
  await assert.rejects(link(U.rec, 'OP-F1', 'bk/1', 'Facebook Ad', { ...MAP, phone: 'Cell' }), /no column called "Cell"/);
  await assert.rejects(link(U.rec, 'OP-F1', 'bk/1', 'Facebook Ad', { ...MAP, email: 'Mobile' }), /chosen for two fields/);
  await assert.rejects(link(U.rec, 'OP-F1', 'bk/1', 'Facebook Ad', { ...MAP, bogus: 'City' }), /not a field/);
  await assert.rejects(link(U.rec, 'OP-F1', 'bk/1', 'Facebook Ad', MAP, ['Full Name']), /already used for a field/);
  await assert.rejects(link(U.rec, 'OP-F1', 'bk/1', 'Facebook Ad', MAP, ['Nope']), /no column called "Nope"/);
  const id = await link(U.rec, 'OP-F1', 'bk/1');
  assert.match(id, /^[0-9a-f-]{36}$/);
  await assert.rejects(link(U.rec, 'OP-F2', 'bk/1'), /already linked to "Feed role"/);
  await assert.rejects(link(U.rec, 'OP-F1', 'bk/1'), /already linked to "Feed role"/);
  await link(U.rec, 'OP-F1', 'bk/2', 'Naukri', { name: 'Name', phone: 'Phone' }, []);
  const l = await one("select * from public.sheet_links where tab_key = 'bk/1'");
  assert.deepEqual({ op: l.opening_id, name: l.tab_name, src: l.source, extra: l.extra, known: l.known, on: l.enabled }, { op: 'OP-F1', name: 'Sales Executive Jammu', src: 'Facebook Ad', extra: EXTRA, known: HEAD, on: true });
  assert.equal((await one("select count(*)::int n from public.sheet_links where opening_id = 'OP-F1'")).n, 2);
  assert.ok((await one("select count(*)::int n from public.activity where text like 'Sheet tab%linked%'")).n >= 1);
  assert.ok((await one("select count(*)::int n from public.audit_log where table_name = 'sheet_links'")).n >= 1, 'a link is audited');
  await assert.rejects(rpc(U.rec, 'lead_feed_status'), /Only an admin/);
});

test('the plan lists only enabled links of tabs just reported, on an open opening; a renamed tab keeps its link', { skip }, async () => {
  let r = await sync(TOKEN, [['bk/1', 'Sales Executive Jammu', HEAD]]);
  assert.deepEqual(r.links.map((x) => x.key), ['bk/1'], 'bk/2 was not reported this time');
  assert.deepEqual(r.links[0], { key: 'bk/1', name: 'Sales Executive Jammu', source: 'Facebook Ad', map: MAP, extra: EXTRA });
  r = await sync(TOKEN, [['bk/1', 'Jammu sales (renamed)', HEAD], ['bk/2', 'CRM Delhi', ['Name', 'Phone']]]);
  assert.deepEqual(r.links.map((x) => x.name).sort(), ['CRM Delhi', 'Jammu sales (renamed)']);
  assert.equal((await one("select tab_name from public.sheet_links where tab_key = 'bk/1'")).tab_name, 'Jammu sales (renamed)');
  assert.equal((await one("select count(*)::int n from public.sheet_links where tab_key = 'bk/1'")).n, 1);
});

test('rows go to the linked opening with the link source, the tab as campaign and the extra columns as answers', { skip }, async () => {
  await q("insert into public.candidates (id, name, email, phone) values ('C-OLD1', 'Meena Iyer', 'meena@example.com', '+91 91111 22222')");
  const long = 'x'.repeat(600);
  const rows = [
    { name: ' Asha Rao ', phone: '98765 43210', email: 'ASHA@Example.com', location: 'Pune', date: '12/10/2026', answers: { 'Do you have a bike?': 'Yes', 'Years in sales': '3', 'Empty one': '  ', 'Long one': long } },
    { name: 'Ravi K', phone: '97000 11111' },
    { name: 'Ravi again', phone: '+91-97000-11111' },
    { name: 'Meena I', phone: '9111122222', answers: { 'Do you have a bike?': 'No' } },
    { name: '', phone: '99999 88888' },
    { name: 'Nobody', phone: '123', email: 'not-an-email' },
    { name: 'Kiran' },
    { name: 'Gita', email: 'gita@example.com', answers: 'not an object' },
  ];
  const r = await send(TOKEN, 'bk/1', rows);
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows.map((x) => x.status), ['added', 'added', 'duplicate', 'existing', 'skipped', 'skipped', 'skipped', 'added']);
  assert.deepEqual({ added: r.added, existing: r.existing, duplicates: r.duplicates, skipped: r.skipped }, { added: 3, existing: 1, duplicates: 1, skipped: 3 });
  assert.match(r.rows[2].why, /Already applied for this opening \(Ravi K\)/);
  const a = await one("select c.source as csrc, a.* from public.applications a join public.candidates c on c.id = a.candidate_id where c.name = 'Asha Rao'");
  assert.deepEqual({ op: a.opening_id, src: a.source, camp: a.campaign, csrc: a.csrc, stage: a.stage, rec: a.recruiter_id }, { op: 'OP-F1', src: 'Facebook Ad', camp: 'Jammu sales (renamed)', csrc: 'Facebook Ad', stage: 'New', rec: U.rec });
  assert.equal(a.answers['Do you have a bike?'], 'Yes');
  assert.equal(a.answers['Years in sales'], '3');
  assert.equal('Empty one' in a.answers, false, 'an empty answer is left out');
  assert.equal(a.answers['Long one'].length, 500, 'a long answer is cut');
  const m = await one("select a.source, a.answers from public.applications a where a.candidate_id = 'C-OLD1'");
  assert.deepEqual({ src: m.source, ans: m.answers }, { src: 'Facebook Ad', ans: { 'Do you have a bike?': 'No' } }, 'a person already in the system gets an application with this link source');
  assert.equal((await one("select source from public.candidates where id = 'C-OLD1'")).source, '', 'and keeps their own first source');
  assert.deepEqual((await one("select a.answers from public.applications a join public.candidates c on c.id = a.candidate_id where c.name = 'Gita'")).answers, {});
  const batch = await one("select * from public.intake_batches where source = 'sheet' and rows_read = 8");
  assert.deepEqual(batch.detail, { added: 3, existing: 1, duplicates: 1, skipped: 3, tab: 'Jammu sales (renamed)', opening: 'Feed role' });
  const notes = (await q('select text from public.notifications where user_id = $1', [U.rec])).rows.map((x) => x.text);
  assert.ok(notes.some((t) => t.startsWith('4 new leads from Jammu sales (renamed) for Feed role')), notes.join('|'));
  assert.ok((await one("select last_received_at from public.sheet_links where tab_key = 'bk/1'")).last_received_at);
});

test('the same person arriving through another tab of the same opening is a duplicate, and the activity says so', { skip }, async () => {
  const r = await send(TOKEN, 'bk/2', [{ name: 'Ravi K', phone: '97000 11111' }, { name: 'Asha', email: 'asha@example.com' }]);
  assert.deepEqual(r.rows.map((x) => x.status), ['duplicate', 'duplicate']);
  const hits = (await q("select text from public.activity where text like '% also came through Naukri (CRM Delhi)'")).rows.map((x) => x.text);
  assert.deepEqual(hits.sort(), ['Asha Rao also came through Naukri (CRM Delhi)', 'Ravi K also came through Naukri (CRM Delhi)']);
  const again = await send(TOKEN, 'bk/1', [{ name: 'Ravi K', phone: '97000 11111' }]);
  assert.equal(again.rows[0].status, 'duplicate');
  assert.equal((await one("select count(*)::int n from public.activity where text like 'Ravi K also came through Facebook Ad%'")).n, 0, 'the same source and tab is not noted');
});

test('a tab that is not linked, a switched-off link and a closed opening take no rows', { skip }, async () => {
  assert.equal((await send(TOKEN, 'bk/3', [{ name: 'X', phone: '98765 00000' }])).ok, false);
  assert.match((await send(TOKEN, 'bk/none', [])).message, /not linked/);
  const id = (await one("select id from public.sheet_links where tab_key = 'bk/2'")).id;
  const nm = JSON.stringify({ name: 'Name', phone: 'Phone' });
  await rpc(U.rec, 'sheet_link_update', id, 'Naukri', nm, '[]', false);
  assert.equal((await send(TOKEN, 'bk/2', [{ name: 'Off', phone: '98765 00001' }])).ok, false);
  assert.deepEqual((await sync(TOKEN, [['bk/2', 'CRM Delhi', ['Name', 'Phone']]])).links, [], 'a switched-off link is not in the plan');
  await rpc(U.rec, 'sheet_link_update', id, 'Naukri', nm, '[]', true);
  await q("update public.openings set status = 'Closed' where id = 'OP-F1'");
  assert.deepEqual((await sync(TOKEN, [['bk/1', 'x', HEAD], ['bk/2', 'y', ['Name', 'Phone']]])).links, [], 'a closed opening is not in the plan');
  assert.equal((await send(TOKEN, 'bk/1', [{ name: 'Late', phone: '98765 00002' }])).rows[0].why, 'The opening is closed');
  await q("update public.openings set status = 'Open' where id = 'OP-F1'");
});

test('changing a link: source, columns and the new-columns mark; unlinking keeps the leads and frees the tab', { skip }, async () => {
  await sync(TOKEN, [['bk/1', 'Jammu sales (renamed)', [...HEAD, 'Budget']]]);
  const id = (await one("select id from public.sheet_links where tab_key = 'bk/1'")).id;
  assert.deepEqual((await one('select known from public.sheet_links where id = $1', [id])).known, HEAD, 'the new column is not known yet');
  await assert.rejects(rpc(U.rec, 'sheet_link_update', id, 'Facebook Ad', JSON.stringify(MAP), JSON.stringify(['Budget', 'Nope']), true), /no column called "Nope"/);
  await rpc(U.rec, 'sheet_link_update', id, 'Instagram Ad', JSON.stringify(MAP), JSON.stringify([...EXTRA, 'Budget']), true);
  const l = await one('select source, extra, known from public.sheet_links where id = $1', [id]);
  assert.deepEqual({ s: l.source, e: l.extra, k: l.known }, { s: 'Instagram Ad', e: [...EXTRA, 'Budget'], k: [...HEAD, 'Budget'] });
  await assert.rejects(as(U.rec, 'delete from public.sheet_links'), /permission denied/);
  await assert.rejects(rpc(null, 'sheet_link_remove', id), /permission denied/);
  const leads = (await one('select count(*)::int n from public.applications where campaign = $1', ['Jammu sales (renamed)'])).n;
  await rpc(U.rec, 'sheet_link_remove', id);
  assert.equal((await one('select count(*)::int n from public.sheet_links where id = $1', [id])).n, 0);
  assert.equal((await one('select count(*)::int n from public.applications where campaign = $1', ['Jammu sales (renamed)'])).n, leads, 'the leads stay');
  assert.equal((await send(TOKEN, 'bk/1', [{ name: 'After', phone: '98765 00003' }])).ok, false);
  await link(U.rec, 'OP-F2', 'bk/1', 'Google Ad');
  assert.equal((await one("select opening_id from public.sheet_links where tab_key = 'bk/1'")).opening_id, 'OP-F2', 'the tab can now belong to another opening');
});

test('deleting an opening removes its links; the tabs seen stay', { skip }, async () => {
  await q("insert into public.openings (id, title, positions, status) values ('OP-F9', 'Temp', 1, 'Open')");
  await sync(TOKEN, [['bk/3', 'Sheet18', ['Name', 'Phone']]]);
  await link(U.rec, 'OP-F9', 'bk/3', 'Referral', { name: 'Name', phone: 'Phone' }, []);
  await q("delete from public.openings where id = 'OP-F9'");
  assert.equal((await one("select count(*)::int n from public.sheet_links where tab_key = 'bk/3'")).n, 0);
  assert.equal((await one("select count(*)::int n from public.sheet_tabs where tab_key = 'bk/3'")).n, 1);
});

test('500 rows go in together, with a repeat inside the batch, in a few seconds; 501 are refused', { skip }, async () => {
  const rows = Array.from({ length: 500 }, (_, i) => ({ name: 'Bulk ' + i, phone: String(6100000000 + i * 7919), email: i % 4 ? '' : `bulk${i}@example.com`, location: 'Pune', exp: String(i % 9), answers: { Q: 'a' + i } }));
  rows[499] = { ...rows[0], name: 'Bulk repeat' };
  const t0 = Date.now();
  const r = await send(TOKEN, 'bk/2', rows);
  const ms = Date.now() - t0;
  assert.deepEqual({ added: r.added, duplicates: r.duplicates }, { added: 499, duplicates: 1 });
  console.log(`      500 rows ingested in ${ms} ms`);
  assert.ok(ms < 30000, `took ${ms} ms`);
  const big = await send(TOKEN, 'bk/2', Array.from({ length: 501 }, (_, i) => ({ name: 'N' + i, phone: String(6000000000 + i) })));
  assert.equal(big.ok, false);
  assert.match(big.message, /at most 500/);
  assert.equal((await rpc(null, 'ingest_tab_leads', TOKEN, 'bk/2', '{"a":1}')).ok, false, 'not a list');
});

test('a row the database cannot save is skipped with a reason and the others still go in', { skip }, async () => {
  await q('alter table public.candidate_compensation add constraint cc_test_block check (current_lpa <> 77)');
  const r = await send(TOKEN, 'bk/2', [{ name: 'Fine One', phone: '98700 00001' }, { name: 'Broken One', phone: '98700 00002', curSal: '77 LPA' }, { name: 'Fine Two', phone: '98700 00003' }]);
  assert.deepEqual(r.rows.map((x) => x.status), ['added', 'skipped', 'added']);
  assert.match(r.rows[1].why, /Could not save this row/);
  assert.equal((await one("select count(*)::int n from public.candidates where name = 'Broken One'")).n, 0, 'nothing of the broken row is left behind');
  await q('alter table public.candidate_compensation drop constraint cc_test_block');
});
