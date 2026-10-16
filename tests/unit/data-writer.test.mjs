// The writer: each change the services make becomes the right database calls, in order, with retries and plain error messages.
// A fake client records every call instead of talking to Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const app = loadApp({ until: 'services', expose: ['S', 'repo', 'createWriter', 'writeError', 'makePeople', 'onEvent', 'saveOpening', 'createCandidateApplication', 'moveStage', 'addTask', 'setTaskDone', 'deleteTask'] });
const plain = (x) => JSON.parse(JSON.stringify(x));

const profiles = [{ id: 'u-me', username: 'priya', full_name: 'Priya Sharma', role: 'recruiter', active: true }];
const people = app.makePeople(profiles);

// a client that records calls; `fail(step)` may return an error for a call; `stored` feeds select (for syncing whole collections)
function fakeClient({ fail, stored = {} } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const step = { table };
      const b = {
        insert(rows) { step.op = 'insert'; step.rows = rows; return b; },
        update(rows) { step.op = 'update'; step.rows = rows; return b; },
        upsert(rows, opt) { step.op = 'upsert'; step.rows = rows; step.opt = opt; return b; },
        delete() { step.op = 'delete'; return b; },
        select() { if (!step.op) step.op = 'select'; step.sel = true; return b; },
        order() { return b; },
        range(a, z) { step.range = [a, z]; return b; },
        eq(c, v) { (step.where = step.where || []).push(['eq', c, v]); return b; },
        neq(c, v) { (step.where = step.where || []).push(['neq', c, v]); return b; },
        in(c, v) { (step.where = step.where || []).push(['in', c, v]); return b; },
        then(res, rej) {
          calls.push(step);
          const error = fail && fail(step);
          const data = step.op === 'select' ? (stored[table] || []).slice(step.range[0], step.range[1] + 1) : step.sel ? (fakeClient.noRows ? [] : [{}]) : [];
          return Promise.resolve(error ? { error } : { error: null, data }).then(res, rej);
        },
      };
      return b;
    },
  };
}
const newWriter = (client, extra = {}) => app.createWriter(client, { meId: 'u-me', people, retryMs: [1, 1, 1], ...extra });
const ops = (client) => client.calls.map((c) => `${c.op} ${c.table}`);

const cand = { id: 'C-1', name: 'Zed', email: 'z@example.com', skills: ['Java'], curSal: 10, expSal: 14, documents: [{ name: 'Resume.pdf', status: 'Received' }], notes: [], history: [], certifications: [], achievements: [], created: '2026-01-01' };

test('a new candidate writes the profile with its creator, then salary, then documents', async () => {
  const client = fakeClient(), w = newWriter(client);
  await w.enqueue({ op: 'insert', coll: 'candidates', id: 'C-1', record: cand });
  assert.deepEqual(ops(client), ['insert candidates', 'upsert candidate_compensation', 'insert candidate_documents']);
  assert.equal(client.calls[0].rows.created_by, 'u-me');
  assert.equal(client.calls[0].rows.id, 'C-1');
  assert.deepEqual(plain(client.calls[1].opt), { onConflict: 'candidate_id' });
  assert.deepEqual(plain(client.calls[2].rows), [{ candidate_id: 'C-1', name: 'Resume.pdf', status: 'Received' }]);
});

test('an update changes the row by id without sending the id, and rewrites documents only when they changed', async () => {
  const client = fakeClient(), w = newWriter(client);
  await w.enqueue({ op: 'update', coll: 'candidates', id: 'C-1', record: cand });
  assert.deepEqual(ops(client), ['update candidates', 'upsert candidate_compensation', 'delete candidate_documents', 'insert candidate_documents']);
  assert.ok(!('id' in client.calls[0].rows));
  assert.deepEqual(plain(client.calls[0].where), [['eq', 'id', 'C-1']]);
  client.calls.length = 0;
  await w.enqueue({ op: 'update', coll: 'candidates', id: 'C-1', record: { ...cand, name: 'Zed Z' } });
  assert.deepEqual(ops(client), ['update candidates'], 'salary and documents were the same, so they are not sent again');
  client.calls.length = 0;
  await w.enqueue({ op: 'update', coll: 'candidates', id: 'C-1', record: { ...cand, documents: [] } });
  assert.deepEqual(ops(client), ['update candidates', 'delete candidate_documents']);
});

test('an application with a screening writes both tables; names become account ids', async () => {
  const client = fakeClient(), w = newWriter(client);
  const a = { id: 'A-1', cid: 'C-1', opId: 'OP-1', date: '2026-01-01', stage: 'Screening', maxStage: 2, recruiter: 'Priya Sharma', stageSince: '2026-01-02', screening: { outcome: 'Call Back', answers: [], notes: '', date: '2026-01-03', duration: 120 } };
  await w.enqueue({ op: 'update', coll: 'applications', id: 'A-1', record: a });
  assert.deepEqual(ops(client), ['update applications', 'upsert screenings']);
  assert.equal(client.calls[0].rows.recruiter_id, 'u-me');
  assert.equal(client.calls[1].rows.duration_seconds, 120);
});

test('remove deletes by id; records without an id column (activity) are only ever inserted, with who did it', async () => {
  const client = fakeClient(), w = newWriter(client);
  await w.enqueue({ op: 'remove', coll: 'tasks', id: 'T-1' });
  await w.enqueue({ op: 'insert', coll: 'activity', id: undefined, record: { ts: 1760000000000, text: 'Hello', type: 'info' } });
  assert.deepEqual(ops(client), ['delete tasks', 'insert activity']);
  assert.deepEqual(plain(client.calls[0].where), [['eq', 'id', 'T-1']]);
  assert.equal(client.calls[1].rows.actor_id, 'u-me');
});

test('changes are written one after another, in the order they were made', async () => {
  const client = fakeClient(), w = newWriter(client);
  w.enqueue({ op: 'insert', coll: 'openings', id: 'OP-1', record: { id: 'OP-1', title: 'T', mode: 'Remote', type: 'Full-time', priority: 'Low', status: 'Open', opened: '2026-01-01' } });
  w.enqueue({ op: 'insert', coll: 'candidates', id: 'C-1', record: cand });
  w.enqueue({ op: 'insert', coll: 'applications', id: 'A-1', record: { id: 'A-1', cid: 'C-1', opId: 'OP-1', date: '2026-01-01', stage: 'New', stageSince: '2026-01-01' } });
  assert.ok(w.pending() > 0);
  await w.idle();
  assert.equal(w.pending(), 0);
  assert.deepEqual(ops(client).filter((o) => /^insert (openings|candidates|applications)$/.test(o)), ['insert openings', 'insert candidates', 'insert applications']);
});

test('settings: only a change to what is stored goes to the server', async () => {
  const client = fakeClient(), w = newWriter(client);
  // the first call has nothing to compare with, so it writes; a repeat with the same stored values does not
  await w.enqueue({ op: 'root', coll: 'settings', id: null, record: app.S.settings });
  assert.deepEqual(ops(client), ['update company_settings']);
  assert.deepEqual(plain(client.calls[0].where), [['eq', 'singleton', true]]);
  app.S.settings.user = 'Somebody Else';   // lives only in this browser
  await w.enqueue({ op: 'root', coll: 'settings', id: null, record: app.S.settings });
  assert.equal(client.calls.length, 1, 'the signed-in name is not stored on the server');
  app.S.settings.signatory = 'New Signatory';
  await w.enqueue({ op: 'root', coll: 'settings', id: null, record: app.S.settings });
  assert.equal(client.calls.length, 2);
  assert.equal(client.calls[1].rows.signatory, 'New Signatory');
});

test('a whole-collection change removes what is no longer there and saves the rest', async () => {
  const client = fakeClient({ stored: { tasks: [{ id: 'T-1' }, { id: 'T-2' }, { id: 'T-3' }] } });
  const w = newWriter(client);
  app.S.tasks = [{ id: 'T-2', title: 'Keep', due: '2026-01-01', related: 'x', priority: 'Low', done: false, owner: 'Priya Sharma' }];
  await w.enqueue({ op: 'root', coll: 'tasks', id: null, record: app.S.tasks });
  assert.deepEqual(ops(client), ['select tasks', 'delete tasks', 'upsert tasks']);
  assert.deepEqual(plain(client.calls[1].where), [['in', 'id', ['T-1', 'T-3']]]);
  assert.equal(client.calls[2].rows[0].owner_id, 'u-me');
});

test('a network drop is retried and then succeeds, with nothing reported', async () => {
  let n = 0;
  const client = fakeClient({ fail: (s) => (s.op === 'delete' && n++ < 2 ? { message: 'TypeError: Failed to fetch' } : null) });
  const heard = [];
  app.onEvent('data:error', (e) => heard.push(e));
  const w = newWriter(client);
  await w.enqueue({ op: 'remove', coll: 'tasks', id: 'T-9' });
  assert.equal(client.calls.filter((c) => c.op === 'delete').length, 3);
  assert.equal(heard.length, 0);
});

test('a refusal is reported once in plain words and later changes still go through; a success afterwards says so', async () => {
  const events = [];
  app.onEvent('data:error', (e) => events.push(['error', e.message]));
  app.onEvent('data:ok', () => events.push(['ok']));
  const client = fakeClient({ fail: (s) => (s.table === 'offers' ? { code: '42501', message: 'new row violates row-level security policy for table "offers"' } : null) });
  const w = newWriter(client);
  w.enqueue({ op: 'remove', coll: 'offers', id: 'O-1' });
  w.enqueue({ op: 'remove', coll: 'offers', id: 'O-2' });
  w.enqueue({ op: 'remove', coll: 'tasks', id: 'T-1' });
  await w.idle();
  assert.equal(client.calls.filter((c) => c.table === 'offers').length, 2, 'a permission refusal is not retried');
  assert.equal(client.calls.filter((c) => c.table === 'tasks').length, 1, 'the next change still ran');
  const errors = events.filter((e) => e[0] === 'error');
  assert.equal(errors.length, 1, 'one message for a run of failures');
  assert.match(errors[0][1], /Could not save the offer\. You do not have permission/);
  assert.deepEqual(events.map((e) => e[0]), ['error', 'ok']);
});

test('database messages become sentences', () => {
  assert.match(app.writeError({ code: '23505', message: 'duplicate key' }, 'the candidate').message, /already exists/);
  assert.match(app.writeError({ code: 'P0001', message: 'An offer waiting for approval cannot be marked Sent.' }, 'the offer').message, /waiting for approval cannot be marked Sent/);
  assert.equal(app.writeError({ message: 'Failed to fetch' }, 'x').retryable, true);
  assert.equal(app.writeError({ code: '42501', message: 'denied' }, 'x').retryable, false);
});

test('an update that changes no row (hidden by access rules, or gone) is reported, not treated as saved', async () => {
  const events = [];
  app.onEvent('data:error', (e) => events.push(e.message));
  fakeClient.noRows = true;
  try {
    const w = newWriter(fakeClient());
    await w.enqueue({ op: 'update', coll: 'tasks', id: 'T-1', record: { id: 'T-1', title: 'x', due: '', related: '', priority: 'Low', done: true, owner: '' } });
    await w.enqueue({ op: 'remove', coll: 'tasks', id: 'T-2' });
  } finally { fakeClient.noRows = false; }
  assert.equal(events.length, 1, 'one message for the run');
  assert.match(events[0], /Could not save the task\. You do not have permission to change it/);
});

test('each change keeps the record as it was when the change was made', async () => {
  const client = fakeClient(), w = newWriter(client);
  const a = { id: 'A-1', cid: 'C-1', opId: 'OP-1', date: '2026-01-01', stage: 'New', maxStage: 0, stageSince: '2026-01-01' };
  w.enqueue({ op: 'update', coll: 'applications', id: 'A-1', record: a });
  a.stage = 'Shortlisted';
  w.enqueue({ op: 'update', coll: 'applications', id: 'A-1', record: a });
  a.stage = 'Screening';
  w.enqueue({ op: 'update', coll: 'applications', id: 'A-1', record: a });
  await w.idle();
  assert.deepEqual(client.calls.filter((c) => c.op === 'update').map((c) => c.rows.stage), ['New', 'Shortlisted', 'Screening']);
});
