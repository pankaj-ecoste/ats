// Importing leads against the real database: 2,000 leads (set LEADS_N=5000 for 5,000) read from CSV text, planned, imported through the app's own writer, and
// saved as a recruiter would (row-level security on). Also: who may not import, and what a repeated email does. Rolled back at the end.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect, loadEnv } from '../../scripts/db.mjs';
import { loadApp } from '../unit/load-app.mjs';

loadEnv();
const skip = process.env.DATABASE_URL ? false : 'DATABASE_URL is not set';
const app = loadApp({ until: 'services', expose: ['S', 'createWriter', 'makePeople', 'parseCsv', 'leadTable', 'guessLeadMap', 'planLeads', 'importLeads', 'leadCounts', 'repoOnChange'] });
let c, W = null, insertMs = 0;   // the writer of the test that is running; one listener serves every test
const q = (sql, params) => c.query(sql, params);
const U = { rec: randomUUID(), iv: randomUUID(), admin: randomUUID() };
const JSON_COLUMNS = new Set(['candidates.history', 'candidates.notes', 'applications.match_reasons', 'notifications.link']);

before(async () => {
  if (skip) return;
  c = connect();
  await c.connect();
  await q('begin');
  await q("select set_config('app.allow_user_create', 'on', true)");
  for (const [n, id] of Object.entries(U)) await q("insert into auth.users (id, email, aud, role, raw_user_meta_data) values ($1, $2, 'authenticated', 'authenticated', $3)", [id, `ld${n}@ats.ecoste.in`, JSON.stringify({ full_name: 'Lia ' + n })]);
  await q("select set_config('app.allow_user_create', 'off', true)");
  await q("update public.profiles set role = 'admin' where id = $1", [U.admin]);
  await q("update public.profiles set role = 'recruiter' where id = $1", [U.rec]);
  await q("update public.profiles set role = 'interviewer' where id = $1", [U.iv]);
  await q("insert into public.openings (id, title, positions, recruiter_id) values ('OP-L1', 'Lead role', 3, $1)", [U.rec]);
});
after(async () => { if (!c) return; await q('rollback'); await c.end(); });

// a client that runs each insert as the given person (row-level security applies), the way the browser library would through the API
function clientAs(userId) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        insert(given) {
          const rows = [].concat(given);
          calls.push({ table, n: rows.length });
          return {
            then: async (res, rej) => {
              try {
                const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))], vals = [];
                const groups = rows.map((r) => '(' + cols.map((k) => { vals.push(JSON_COLUMNS.has(`${table}.${k}`) && r[k] != null ? JSON.stringify(r[k]) : r[k] ?? null); return '$' + vals.length; }).join(',') + ')');
                await q('savepoint ins');
                try {
                  await q('set local role authenticated');
                  await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: userId, role: 'authenticated' }), userId]);
                  const t1 = Date.now();
                  await q(`insert into public.${table} (${cols.map((x) => `"${x}"`).join(',')}) values ${groups.join(',')}`, vals);
                  insertMs += Date.now() - t1;
                  await q('reset role');
                } catch (e) {
                  if (process.env.LEADS_DEBUG) console.log('insert refused:', table, e.message);
                  await q('rollback to savepoint ins');   // also undoes the role change made after the savepoint
                  await q('release savepoint ins');
                  return res({ error: { message: e.message, code: e.code } });
                }
                await q('release savepoint ins');
                return res({ error: null, data: [] });
              } catch (e) { return rej(e); }
            },
          };
        },
      };
    },
  };
}
app.repoOnChange((ch) => { if (W) W.enqueue(ch); });
const people = () => app.makePeople([
  { id: U.rec, username: 'ldrec', full_name: 'Lia rec', role: 'recruiter', active: true },
  { id: U.iv, username: 'ldiv', full_name: 'Lia iv', role: 'interviewer', active: true },
  { id: U.admin, username: 'ldadmin', full_name: 'Lia admin', role: 'admin', active: true },
]);

const csv = (n, p = 'Lead') => 'Name,Mobile,Email,City,Experience,Source\n' + Array.from({ length: n }, (_, i) =>
  `${p} ${i},${6000000000 + i * 7919},${i % 4 ? '' : `${p.toLowerCase()}${i}@example.com`},Pune,${i % 9},Facebook Ad`).join('\n');

function prepare(text) {
  const table = app.leadTable(app.parseCsv(text));
  const map = app.guessLeadMap(table.headers);
  app.S.openings.length = 0;
  app.S.openings.push({ id: 'OP-L1', title: 'Lead role', recruiter: 'Lia rec', mandatory: [], preferred: [], status: 'Open' });
  app.S.candidates.length = 0; app.S.applications.length = 0;
  return { table, map };
}

test('a large import is saved in batches of 200 by a recruiter and read back (LEADS_N=5000 for the full size)', { skip }, async () => {
  const N = +process.env.LEADS_N || 2000;
  const { table, map } = prepare(csv(N));
  assert.equal(map.name, 'Name'); assert.equal(map.phone, 'Mobile'); assert.equal(map.email, 'Email'); assert.equal(map.exp, 'Experience'); assert.equal(map.source, 'Source');
  const client = clientAs(U.rec), w = W = app.createWriter(client, { meId: U.rec, people: people(), retryMs: [1] });
  const t0 = Date.now();
  const plan = app.planLeads(table, map, 'OP-L1');
  assert.deepEqual(JSON.parse(JSON.stringify(app.leadCounts(plan))), { new: N, existing: 0, dup: 0, skip: 0 });
  const r = app.importLeads(plan, { opId: 'OP-L1', source: 'Ad campaign' });
  await w.idle();
  const ms = Date.now() - t0;
  assert.equal(r.added, N);
  // only this test's rows are counted: the database may hold other people's data
  const mine = "select id from public.candidates where created_by = '" + U.rec + "' and name like 'Lead %'";
  const n = (sql) => q(sql).then((x) => x.rows[0].n);
  assert.equal(await n(`select count(*)::int n from (${mine}) x`), N);
  assert.equal(await n("select count(*)::int n from public.applications where opening_id = 'OP-L1'"), N);
  assert.equal(await n(`select count(*)::int n from public.candidate_compensation where candidate_id in (${mine})`), N);
  assert.equal(await n(`select count(*)::int n from public.candidate_documents where candidate_id in (${mine})`), N);
  assert.equal(await n("select count(*)::int n from public.applications where opening_id = 'OP-L1' and recruiter_id = '" + U.rec + "' and stage = 'New'"), N);
  assert.equal(await n("select count(*)::int n from public.candidates where created_by = '" + U.rec + "' and source = 'Facebook Ad' and phone like '+91 %'"), N);
  // each table is written 200 rows at a time
  const batches = Math.ceil(N / 200);
  assert.equal(client.calls.filter((x) => x.table === 'candidates').length, batches);
  assert.equal(client.calls.filter((x) => x.table === 'applications').length, batches);
  console.log(`      ${N} leads: ${ms} ms in all, of which ${insertMs} ms inside the database inserts`);
  assert.ok(insertMs < 60000, `the inserts took ${insertMs} ms`);
});

test('a second import of the same sheet adds nothing, so repeats never reach the database', { skip }, async () => {
  const { table, map } = prepare(csv(40, 'Twice'));
  const client = clientAs(U.rec), w = W = app.createWriter(client, { meId: U.rec, people: people(), retryMs: [1] });
  assert.equal(app.importLeads(app.planLeads(table, map, 'OP-L1'), { opId: 'OP-L1', source: 'x' }).added, 40);
  await w.idle();
  const before = client.calls.length;
  const again = app.planLeads(table, map, 'OP-L1');
  assert.deepEqual(JSON.parse(JSON.stringify(app.leadCounts(again))), { new: 0, existing: 0, dup: 40, skip: 0 });
  app.importLeads(again, { opId: 'OP-L1', source: 'x' });
  await w.idle();
  assert.equal(client.calls.length, before);
});

test('only staff may import: an interviewer is refused by the database and nothing is saved', { skip }, async () => {
  const { table, map } = prepare(csv(10, 'Zed'));
  const client = clientAs(U.iv), w = W = app.createWriter(client, { meId: U.iv, role: 'interviewer', staff: false, people: people(), retryMs: [1] });
  app.importLeads(app.planLeads(table, map, 'OP-L1'), { opId: 'OP-L1', source: 'x' });
  await w.idle();
  assert.equal((await q("select count(*)::int n from public.candidates where name like 'Zed %'")).rows[0].n, 0);
  assert.equal((await q("select count(*)::int n from public.applications a join public.candidates c on c.id = a.candidate_id where c.name like 'Zed %'")).rows[0].n, 0);
});
