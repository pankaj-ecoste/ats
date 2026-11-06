// Picking up other people's changes: only when this browser has nothing waiting to be saved, and only when something really differs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const app = loadApp({
  until: 'services',
  expose: ['getS', 'refreshFromServer', 'loadFromServer', 'dataFingerprint', 'fetchAll', 'LOG_TABLES', 'LOG_KEEP', 'READ_TABLES', 'createWriter', 'startWriting', 'writesPending', 'repo', 'addTask', 'fetchTable', 'ageStamp'],
  after: 'var getS=()=>S; var ageStamp=(ms)=>{STAMP_AT-=ms}',
});
const me = { id: 'u1', fullName: 'Priya Sharma', role: 'admin' };
const profiles = [{ id: 'u1', username: 'priya', full_name: 'Priya Sharma', role: 'admin', active: true }];

// a stand-in for the database: tables live in `db`; every read is counted
function fakeClient(db, seen = [], { stamp, countRows = true } = {}) {
  return {
    rpc: async (name) => { seen.push(['rpc', name]); if (!stamp) return { data: null, error: { message: 'function does not exist' } }; return { data: stamp(), error: null }; },
    from: (t) => ({
      select: (cols, opts) => ({
        order: (col, o) => ({
          range: async (a, b) => { seen.push(['range', t, a, b]); return { data: (db[t] || []).slice(a, b + 1), count: countRows && opts && opts.count ? (db[t] || []).length : undefined, error: null }; },
          limit: async (n) => { seen.push(['limit', t, n, o && o.ascending]); return { data: (db[t] || []).slice(0, n), error: null }; },
        }),
      }),
      insert: async () => ({ error: null }),
    }),
  };
}
const task = (id, title) => ({ id, title, due_on: '2026-10-20', related: 'General', priority: 'Low', owner_id: 'u1', done: false, created_at: '2026-10-17T10:00:00Z' });

test('the activity and sheet logs are read newest first and limited, everything else in full', async () => {
  const seen = [];
  await app.fetchAll(fakeClient({ profiles }, seen));
  const limited = seen.filter((s) => s[0] === 'limit');
  assert.equal(limited.map((s) => s[1]).sort().join(), 'activity,intake_batches,sheet_log');
  assert.ok(limited.every((s) => s[2] === 300 && s[3] === false), 'newest first, 300');
  assert.ok(!seen.some((s) => s[0] === 'range' && ['activity', 'sheet_log'].includes(s[1])));
});

test('the fingerprint ignores the order of records and what stays in this browser', () => {
  const a = { settings: { company: 'X', user: 'A', theme: 'dark' }, tasks: [{ id: 1 }, { id: 2 }] };
  const b = { settings: { company: 'X', user: 'B', theme: 'light' }, tasks: [{ id: 2 }, { id: 1 }] };
  assert.equal(app.dataFingerprint(a), app.dataFingerprint(b));
  assert.notEqual(app.dataFingerprint(a), app.dataFingerprint({ ...b, tasks: [{ id: 1 }] }));
  assert.notEqual(app.dataFingerprint(a), app.dataFingerprint({ ...b, settings: { company: 'Y' } }));
});

test('a change made by someone else replaces the data once; nothing changing replaces nothing', async () => {
  const db = { profiles, tasks: [task('T-1', 'First')] };
  const client = fakeClient(db);
  await app.loadFromServer(client, me);
  const before = app.getS();
  assert.equal(await app.refreshFromServer(client, me), false, 'nothing differs');
  assert.equal(app.getS(), before, 'the same object is kept');
  db.tasks.push(task('T-2', 'Added by someone else'));
  assert.equal(await app.refreshFromServer(client, me), true);
  assert.equal(app.getS().tasks.map((t) => t.title).sort().join(), 'Added by someone else,First');
  assert.equal(app.getS().settings.user, 'Priya Sharma', 'the signed-in name is kept');
  assert.equal(await app.refreshFromServer(client, me), false, 'and a second look finds nothing new');
});

test('while this browser has changes waiting to be saved, nothing is replaced', async () => {
  const db = { profiles, tasks: [task('T-1', 'First')] };
  const client = fakeClient(db);
  await app.loadFromServer(client, me);
  app.startWriting(client, me);
  const mine = app.addTask({ title: 'Mine', due: '2026-10-21', priority: 'Low', related: 'x', owner: 'Priya Sharma' });
  assert.ok(app.writesPending() > 0, 'the change is queued');
  db.tasks.push(task('T-2', 'Theirs'));
  assert.equal(await app.refreshFromServer(client, me), false);
  assert.ok(app.getS().tasks.some((t) => t.id === mine.id), 'my own change is still there');
});

test('when the database says nothing was written, nothing is downloaded; when it says something was, everything is read once', async () => {
  const db = { profiles, tasks: [task('T-1', 'First')] };
  let stamp = 'a';
  const seen = [];
  const client = fakeClient(db, seen, { stamp: () => stamp });
  await app.loadFromServer(client, me);
  seen.length = 0;
  assert.equal(await app.refreshFromServer(client, me), false);
  assert.deepEqual(seen, [['rpc', 'data_stamp']], 'only the one small question was asked');
  db.tasks.push(task('T-2', 'Added by someone else')); stamp = 'b';
  assert.equal(await app.refreshFromServer(client, me), true);
  assert.ok(seen.some((s) => s[0] === 'range'), 'the data was read');
  seen.length = 0;
  assert.equal(await app.refreshFromServer(client, me), false);
  assert.deepEqual(seen, [['rpc', 'data_stamp']], 'and the new stamp is remembered');
});

test('a database without the stamp function (or one that errors) is read in full every time, as before', async () => {
  const db = { profiles, tasks: [task('T-1', 'First')] };
  const seen = [];
  const client = fakeClient(db, seen);      // rpc answers with an error
  await app.loadFromServer(client, me);
  seen.length = 0;
  assert.equal(await app.refreshFromServer(client, me), false);
  assert.ok(seen.filter((s) => s[0] === 'range').length >= 10, 'the tables were read');
});

test('even with an unchanged stamp, everything is read again after ten minutes', async () => {
  const db = { profiles, tasks: [task('T-1', 'First')] };
  const seen = [];
  const client = fakeClient(db, seen, { stamp: () => 'same' });
  await app.loadFromServer(client, me);
  seen.length = 0;
  await app.refreshFromServer(client, me);
  assert.ok(!seen.some((s) => s[0] === 'range'), 'not yet');
  app.ageStamp(10 * 60000 + 1);
  await app.refreshFromServer(client, me);
  assert.ok(seen.some((s) => s[0] === 'range'), 'now');
});

const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: 'R' + String(i).padStart(6, '0') }));

test('a big table is read as parallel pages and comes back complete and in order', async () => {
  const db = { big: rows(2500) }, seen = [];
  const out = await app.fetchTable(fakeClient(db, seen), 'big', 'id');
  assert.equal(out.length, 2500);
  assert.equal(JSON.stringify(out.map((r) => r.id)), JSON.stringify(db.big.map((r) => r.id)));
  assert.deepEqual(seen.map((s) => s[2]), [0, 1000, 2000], 'first page, then the other two together');
});

test('rows added while reading, or a missing count, still give everything', async () => {
  const db = { big: rows(3000) };
  // the count said 2000 but 3000 exist by the time the pages are read
  const stale = fakeClient(db);
  const real = stale.from;
  stale.from = (t) => { const f = real(t); const sel = f.select; f.select = (c, o) => { const s = sel(c, o); const r = s.order; s.order = (...a) => { const x = r(...a); const rg = x.range; x.range = async (a1, b1) => { const v = await rg(a1, b1); return { ...v, count: v.count === undefined ? undefined : 2000 }; }; return x; }; return s; }; return f; };
  assert.equal((await app.fetchTable(stale, 'big', 'id')).length, 3000);
  assert.equal((await app.fetchTable(fakeClient(db, [], { countRows: false }), 'big', 'id')).length, 3000, 'no count: page after page');
  assert.equal((await app.fetchTable(fakeClient({ big: rows(1000) }), 'big', 'id')).length, 1000, 'exactly one full page');
  assert.equal((await app.fetchTable(fakeClient({ big: [] }), 'big', 'id')).length, 0);
});
