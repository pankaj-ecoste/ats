import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const plain = (x) => JSON.parse(JSON.stringify(x));
const fresh = () => loadApp({
  until: 'services',
  expose: ['S', 'repo', 'addEvent', 'moveStage', 'setReportThreshold', 'clearDemoHistory', 'logCalls', 'deleteCallLog', 'saveMonthlyTargets', 'setDropRisk',
    'setBackup', 'recordDropout', 'getA', 'getC', 'appsOfOp', 'today'],
});
const types = (app) => plain((app.S.events || []).map((e) => e.t));
const earlyApp = (app) => app.S.applications.find((a) => a.stage === 'New');

test('addEvent appends a dated event with the opening of the application', () => {
  const app = fresh();
  const a = earlyApp(app);
  app.addEvent('interview', a.id);
  assert.deepEqual(plain(app.S.events.at(-1)), { d: app.today(), t: 'interview', aid: a.id, op: a.opId });
});

test('stage changes record report events: shortlist, selected, accepted', () => {
  const app = fresh();
  const a = earlyApp(app);
  app.moveStage(a.id, 'Shortlisted');
  app.moveStage(a.id, 'Selected');
  app.moveStage(a.id, 'Offer Accepted');
  assert.deepEqual(types(app), ['shortlist', 'selected', 'accepted']);
});

test('reaching Onboarding records one "joined" event with days and source, and stamps joinedOn once', () => {
  const app = fresh();
  const a = earlyApp(app);
  app.moveStage(a.id, 'Onboarding');
  app.moveStage(a.id, 'Employee Ready');
  app.moveStage(a.id, 'Onboarding');
  assert.deepEqual(types(app).filter((t) => t === 'joined').length, 1);
  assert.equal(a.joinedOn, app.today());
  const e = app.S.events.find((x) => x.t === 'joined');
  assert.equal(e.src, app.getC(a.cid).source);
  assert.equal(typeof e.days, 'number');
});

test('rejecting after an accepted offer records "dropped"; rejecting earlier does not', () => {
  const app = fresh();
  const [a, b] = app.S.applications.filter((x) => x.stage === 'New');
  app.moveStage(a.id, 'Offer Accepted');
  app.moveStage(a.id, 'Rejected');
  assert.equal(a.dropped, app.today());
  assert.equal(types(app).filter((t) => t === 'dropped').length, 1);
  app.moveStage(b.id, 'Shortlisted');
  app.moveStage(b.id, 'Rejected');
  assert.equal(types(app).filter((t) => t === 'dropped').length, 1);
  assert.equal(b.dropped, undefined);
});

test('thresholds, call log, monthly targets and drop risk are stored', () => {
  const app = fresh();
  app.setReportThreshold('offerAlert', 80);
  assert.deepEqual(plain(app.S.settings.report), { offerAlert: 80, noShowAlert: 25, dueSoon: 7 });
  const c = app.logCalls({ d: '2026-10-01', op: 'OP-1001', made: 30, conn: 12 });
  assert.match(c.id, /^CL-/);
  assert.equal(app.S.callLog.length, 1);
  assert.equal(app.deleteCallLog(c.id), true);
  assert.equal(app.S.callLog.length, 0);
  app.saveMonthlyTargets([['2026-10', 'target', 8], ['2026-10', 'budget', 50000], ['2026-11', 'target', 5]]);
  assert.deepEqual(plain(app.S.monthly), { '2026-10': { target: 8, budget: 50000 }, '2026-11': { target: 5 } });
  const a = earlyApp(app);
  app.setDropRisk(a.id, 'High');
  assert.equal(a.dropRisk, 'High');
});

test('clearDemoHistory removes only generated rows', () => {
  const app = fresh();
  app.repo.root('events', [{ t: 'x', demo: 1 }, { t: 'y' }]);
  app.repo.root('callLog', [{ id: 'a', demo: 1 }, { id: 'b' }]);
  app.repo.root('postings', [{ id: 'p', demo: 1 }, { id: 'q' }]);
  app.repo.root('demoHistory', true);
  app.clearDemoHistory();
  assert.deepEqual(plain([app.S.events, app.S.callLog, app.S.postings, app.S.demoHistory]), [[{ t: 'y' }], [{ id: 'b' }], [{ id: 'q' }], false]);
});

test('setBackup records a "backup" event only the first time, logs, and an empty choice clears it', () => {
  const app = fresh();
  const [a, b, c] = app.S.applications.filter((x) => x.stage === 'New');
  app.setBackup(a.id, b.id, 'Ready');
  assert.deepEqual(plain(a.backup), { aid: b.id, status: 'Ready' });
  assert.match(app.S.activity[0].text, /Backup .* lined up for/);
  app.setBackup(a.id, c.id, 'In process');
  assert.equal(types(app).filter((t) => t === 'backup').length, 1);
  app.setBackup(a.id, '', '');
  assert.equal(a.backup, null);
});

test('recordDropout rejects the candidate, notes the reason, promotes the backup and clears it', () => {
  const app = fresh();
  const [a, b] = app.S.applications.filter((x) => x.stage === 'New');
  app.moveStage(a.id, 'Offer');
  app.setBackup(a.id, b.id, 'Ready');
  const r = app.recordDropout(a.id, { reason: 'Took another offer', promoteBackup: true });
  assert.equal(a.stage, 'Rejected');
  assert.equal(a.dropped, app.today());
  assert.equal(r.promoted, b);
  assert.equal(b.stage, 'Selected');
  assert.equal(a.backup, null);
  assert.equal(app.getC(a.cid).notes[0].text, 'Dropped after offer: Took another offer');
});

test('recordDropout without promotion leaves the backup where it was', () => {
  const app = fresh();
  const [a, b] = app.S.applications.filter((x) => x.stage === 'New');
  app.moveStage(a.id, 'Offer');
  app.setBackup(a.id, b.id, 'Ready');
  const r = app.recordDropout(a.id, { reason: '', promoteBackup: false });
  assert.equal(r.promoted, null);
  assert.equal(b.stage, 'New');
});
