// The calling queue: the right leads, in the right order, for the right person.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const app = loadApp({ until: 'src/domain/call-queue.js', expose: ['callQueue', 'calledOn', 'telLink', 'callMore', 'CALL_QUICK', 'CALL_AGAIN', 'APP_CALL_STATUS'] });
const A = (id, o = {}) => ({ id, stage: 'New', recruiter: 'Priya', opId: 'O1', date: '2026-11-01', ...o });
const ids = (l) => l.map((a) => a.id).join();

test('never-called new leads, the oldest application first', () => {
  const apps = [A('a3', { date: '2026-11-03' }), A('a1', { date: '2026-11-01' }), A('a2', { date: '2026-11-02' })];
  assert.equal(ids(app.callQueue(apps)), 'a1,a2,a3');
});

test('a lead already called, or no longer new, is not in the first list', () => {
  const apps = [A('x1', { appCall: 'Busy' }), A('x2', { stage: 'Rejected' }), A('x3', { stage: 'Shortlisted' }), A('ok')];
  assert.equal(ids(app.callQueue(apps)), 'ok');
});

test('NA counts as never called, however it is stored', () => {
  assert.equal(ids(app.callQueue([A('n1', { appCall: 'NA' }), A('n2', { appCall: null }), A('n3')])), 'n1,n2,n3');
});

test('the call-again list holds calls that did not settle, still in play, the oldest attempt first', () => {
  const apps = [
    A('b', { appCall: 'Busy', appCallAt: 2000 }), A('c', { appCall: 'Call Back Requested', appCallAt: 1000 }), A('d', { appCall: 'Follow-UP', appCallAt: 3000, stage: 'Screening' }),
    A('e', { appCall: 'Connected', appCallAt: 500 }), A('f', { appCall: 'Busy', appCallAt: 100, stage: 'Rejected' }), A('g', { appCall: 'Wrong Number', appCallAt: 100 }),
  ];
  assert.equal(ids(app.callQueue(apps, { mode: 'again' })), 'c,b,d');
});

test('mine, one opening, and leads set aside', () => {
  const apps = [A('m1'), A('m2', { recruiter: 'Ravi' }), A('m3', { opId: 'O2' }), A('m4')];
  assert.equal(ids(app.callQueue(apps, { who: 'Priya' })), 'm1,m3,m4');
  assert.equal(ids(app.callQueue(apps, { who: 'Priya', opId: 'O1' })), 'm1,m4');
  assert.equal(ids(app.callQueue(apps, { skip: new Set(['m1', 'm3']) })), 'm2,m4');
  assert.equal(ids(app.callQueue(apps)), 'm1,m2,m3,m4', 'no filter: everyone');
});

test('the queue does not change the list it is given', () => {
  const apps = [A('z2', { date: '2026-11-02' }), A('z1', { date: '2026-11-01' })];
  app.callQueue(apps);
  assert.equal(ids(apps), 'z2,z1');
});

test('called today counts the calls logged on that day, for the person and opening asked', () => {
  const at = (iso) => new Date(iso + 'T10:00:00').getTime();
  const apps = [A('t1', { appCall: 'Busy', appCallAt: at('2026-11-06') }), A('t2', { appCall: 'Connected', appCallAt: at('2026-11-06'), recruiter: 'Ravi' }),
    A('t3', { appCall: 'Busy', appCallAt: at('2026-11-05') }), A('t4')];
  assert.equal(app.calledOn(apps, '2026-11-06'), 2);
  assert.equal(app.calledOn(apps, '2026-11-06', { who: 'Priya' }), 1);
  assert.equal(app.calledOn(apps, '2026-11-06', { opId: 'O9' }), 0);
});

test('a phone link has the plus sign and country code; an unusable number gives none', () => {
  assert.equal(app.telLink('98765 43210'), 'tel:+919876543210');
  assert.equal(app.telLink('+91 98765-43210'), 'tel:+919876543210');
  assert.equal(app.telLink('12'), '');
  assert.equal(app.telLink(''), '');
});

test('the seven big buttons and "More" together are exactly the statuses a person can set, and call again is a part of them', () => {
  const all = app.APP_CALL_STATUS.filter((s) => s !== 'NA');
  assert.equal([...app.CALL_QUICK, ...app.callMore(app.APP_CALL_STATUS)].sort().join(), [...all].sort().join());
  assert.ok(app.CALL_QUICK.every((s) => all.includes(s)) && app.CALL_AGAIN.every((s) => all.includes(s)));
  assert.equal(app.CALL_QUICK.length, 7);
});
