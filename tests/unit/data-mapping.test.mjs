import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const app = loadApp({ until: 'services', expose: ['match', 'S', 'makePeople', 'stateFromRows', 'fetchTable', 'fetchAll', 'READ_TABLES', 'TO_ROW', 'rowsFromState'] });
const plain = (x) => JSON.parse(JSON.stringify(x));
const profiles = [
  { id: 'u1', username: 'priya', full_name: 'Priya Sharma', role: 'recruiter', active: true },
  { id: 'u2', username: 'rahul', full_name: '', role: 'hiring_manager', active: true },
  { id: 'u3', username: 'gone', full_name: 'Gone Person', role: 'recruiter', active: false },
];

test('people: names and ids both ways; no full name falls back to the username; unknown gives nothing', () => {
  const P = app.makePeople(profiles);
  assert.equal(P.name('u1'), 'Priya Sharma');
  assert.equal(P.name('u2'), 'rahul');
  assert.equal(P.id('Priya Sharma'), 'u1');
  assert.equal(P.id('Nobody'), null);
  assert.equal(P.name('zzz'), '');
  assert.equal(P.name(null), '');
  assert.deepEqual(plain(P.names('recruiter')), ['Priya Sharma']);   // switched-off people are not offered
});

test('state from rows: an empty database gives an empty, usable state', () => {
  const s = plain(app.stateFromRows({}, app.makePeople([])));
  for (const k of ['openings', 'candidates', 'applications', 'groups', 'interviews', 'offers', 'onboarding', 'tasks', 'notifications', 'activity', 'postings', 'events', 'callLog', 'sheetLog']) assert.deepEqual(s[k], [], k);
  assert.deepEqual(s.monthly, {});
  assert.equal(s.boards, undefined, 'no boards stored means the built-in list is used');
});

test('state from rows: people, times, salary and group members', () => {
  const rows = {
    openings: [{ id: 'OP-1', title: 'T', recruiter_id: 'u1', manager_id: 'u2', target_on: null, created_at: '2026-01-01' }],
    candidates: [{ id: 'C-1', name: 'A', created_at: '2026-01-02' }, { id: 'C-2', name: 'B', created_at: '2026-01-03' }],
    candidate_compensation: [{ candidate_id: 'C-1', current_lpa: 10, expected_lpa: 14 }],
    candidate_documents: [{ id: 2, candidate_id: 'C-1', name: 'ID', status: 'Pending' }, { id: 1, candidate_id: 'C-1', name: 'Resume', status: 'Received' }],
    interviews: [{ id: 'I-1', application_id: 'A-1', group_id: 'GI-1', at_time: '15:00:00', interviewer_ids: ['u1', 'u2'], created_at: '2026-01-04' }],
    interview_groups: [{ id: 'GI-1', opening_id: 'OP-1', at_time: '11:30:00', interviewer_ids: ['u1'], created_at: '2026-01-04' }],
  };
  const s = plain(app.stateFromRows(rows, app.makePeople(profiles)));
  assert.equal(s.openings[0].recruiter, 'Priya Sharma');
  assert.equal(s.openings[0].manager, 'rahul');
  assert.equal(s.openings[0].target, '');
  assert.deepEqual(s.candidates.map((c) => c.id), ['C-2', 'C-1'], 'newest first, like repo.insert');
  const c1 = s.candidates.find((c) => c.id === 'C-1'), c2 = s.candidates.find((c) => c.id === 'C-2');
  assert.deepEqual([c1.curSal, c1.expSal], [10, 14]);
  assert.deepEqual([c2.curSal, c2.expSal], [null, null], 'salary that is not known is null, not a made-up zero');
  assert.deepEqual(c1.documents.map((d) => d.name), ['Resume', 'ID'], 'documents keep their order');
  assert.equal(s.interviews[0].time, '15:00');
  assert.deepEqual(s.interviews[0].interviewers, ['Priya Sharma', 'rahul']);
  assert.equal(s.groups[0].time, '11:30');
  assert.deepEqual(s.groups[0].appIds, ['A-1'], 'a group lists the applications whose interviews belong to it');
});

test('records going out: a stored interview is never "Pending Feedback"; an unknown person is dropped, not invented', () => {
  const P = app.makePeople(profiles);
  const r = plain(app.TO_ROW.interview({ id: 'I', appId: 'A', kind: 'Personal', date: '2026-01-01', time: '10:00', status: 'Pending Feedback', interviewers: ['Priya Sharma', 'Stranger'] }, P));
  assert.equal(r.interviews.status, 'Scheduled');
  assert.deepEqual(r.interviews.interviewer_ids, ['u1']);
});

test('fetchTable reads page after page until a short page', async () => {
  const data = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
  const calls = [];
  const client = { from: () => ({ select: () => ({ order: () => ({ range: async (a, b) => { calls.push([a, b]); return { data: data.slice(a, b + 1), error: null }; } }) }) }) };
  const got = await app.fetchTable(client, 't', 'id');
  assert.equal(got.length, 2500);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('fetchTable says which table failed', async () => {
  const client = { from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: null, error: { message: 'permission denied' } }) }) }) }) };
  await assert.rejects(app.fetchTable(client, 'offers', 'id'), /Could not read offers: permission denied/);
});

test('match score is a whole number even when salary or other details are not known', () => {
  const sparse = { id: 'C', name: 'B Person', skills: [], education: '', location: '', notice: 30, reloc: false, exp: 0, curSal: null, expSal: null, certifications: [], achievements: [], history: [], documents: [], notes: [] };
  const r = app.match(sparse, app.S.openings[0]);
  assert.ok(Number.isInteger(r.score) && r.score >= 0 && r.score <= 100, `score was ${r.score}`);
  assert.ok(!/NaN|undefined/.test(r.summary), r.summary);
});
