// Picking up other people's changes: only when this browser has nothing waiting to be saved, and only when something really differs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const app = loadApp({
  until: 'services',
  expose: ['getS', 'refreshFromServer', 'loadFromServer', 'dataFingerprint', 'fetchAll', 'LOG_TABLES', 'LOG_KEEP', 'READ_TABLES', 'createWriter', 'startWriting', 'writesPending', 'repo', 'addTask'],
  after: 'var getS=()=>S',
});
const me = { id: 'u1', fullName: 'Priya Sharma', role: 'admin' };
const profiles = [{ id: 'u1', username: 'priya', full_name: 'Priya Sharma', role: 'admin', active: true }];

// a stand-in for the database: tables live in `db`; every read is counted
function fakeClient(db, seen = []) {
  return {
    from: (t) => ({
      select: () => ({
        order: (col, opts) => ({
          range: async (a, b) => { seen.push(['range', t]); return { data: (db[t] || []).slice(a, b + 1), error: null }; },
          limit: async (n) => { seen.push(['limit', t, n, opts && opts.ascending]); return { data: (db[t] || []).slice(0, n), error: null }; },
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
  assert.equal(limited.map((s) => s[1]).sort().join(), 'activity,sheet_log');
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
