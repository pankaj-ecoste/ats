import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const plain = (x) => JSON.parse(JSON.stringify(x));
const fresh = () => loadApp({
  until: 'services',
  expose: ['S', 'recordScreening', 'scheduleGroupInterview', 'setInviteStatus', 'sendGroupReminders', 'cancelGroupInterview', 'evaluateGroup',
    'schedulePersonalInterview', 'recordScorecard', 'markNoShow', 'cancelInterview', 'getA', 'getC', 'getOp', 'appsOfOp', 'repo', 'today'],
});

// three applications of the same opening that are still early in the pipeline
function trio(app) {
  for (const o of app.S.openings) {
    const apps = app.appsOfOp(o.id).filter((a) => ['New', 'Shortlisted', 'Screening'].includes(a.stage));
    if (apps.length >= 3) return { o, apps: apps.slice(0, 3) };
  }
  throw new Error('seed has no opening with three early applications');
}
const groupFields = (o, appIds) => ({
  opId: o.id, date: '2030-01-10', time: '11:00', duration: 90, mode: 'Office', location: 'HQ', link: '', panel: 'Panel', interviewers: ['Rahul Mehta'], appIds,
});

test('recordScreening stores the outcome with today and the duration, and logs it', () => {
  const app = fresh();
  const a = app.S.applications[0];
  app.recordScreening(a.id, { outcome: 'Connected', answers: ['Yes'], notes: 'ok', duration: 125 });
  assert.deepEqual(plain(a.screening), { outcome: 'Connected', answers: ['Yes'], notes: 'ok', date: app.today(), duration: 125 });
  assert.match(app.S.activity[0].text, /Screening call completed with .* \(Connected\)/);
});

test('scheduleGroupInterview creates the group, one interview per candidate, moves them to Group Interview and notifies', () => {
  const app = fresh();
  const { o, apps } = trio(app);
  const ids = apps.map((a) => a.id);
  const [g0, i0, n0] = [app.S.groups.length, app.S.interviews.length, app.S.notifications.length];
  const g = app.scheduleGroupInterview(groupFields(o, ids));
  assert.equal(app.S.groups.length, g0 + 1);
  assert.equal(app.S.groups.at(-1), g);
  assert.equal(g.evaluated, false);
  assert.equal(app.S.interviews.length, i0 + 3);
  const made = app.S.interviews.slice(-3);
  assert.ok(made.every((i) => i.groupId === g.id && i.kind === 'Group' && i.status === 'Scheduled' && i.invite === 'Sent'));
  assert.ok(apps.every((a) => a.stage === 'Group Interview'));
  assert.equal(app.S.notifications.length, n0 + 1);
});

test('reminders mark Pending invites as Sent and report the group size; invites can be set and the group cancelled', () => {
  const app = fresh();
  const { o, apps } = trio(app);
  const g = app.scheduleGroupInterview(groupFields(o, apps.map((a) => a.id)));
  const ints = app.S.interviews.filter((i) => i.groupId === g.id);
  app.setInviteStatus(ints[0].id, 'Pending');
  assert.equal(app.sendGroupReminders(g.id), 3);
  assert.equal(ints[0].invite, 'Sent');
  app.setInviteStatus(ints[1].id, 'Declined');
  assert.equal(ints[1].invite, 'Declined');
  app.cancelGroupInterview(g.id);
  assert.ok(ints.every((i) => i.status === 'Cancelled'));
});

test('evaluateGroup completes interviews, moves candidates by recommendation and marks the group evaluated', () => {
  const app = fresh();
  const { o, apps } = trio(app);
  const g = app.scheduleGroupInterview(groupFields(o, apps.map((a) => a.id)));
  const ints = app.S.interviews.filter((i) => i.groupId === g.id);
  const moved = app.evaluateGroup(g.id, [
    { intId: ints[0].id, scores: [4, 4, 4, 4, 4, 4, 4], rec: 'Select for Personal Interview', feedback: 'great' },
    { intId: ints[1].id, scores: [3, 3, 3, 3, 3, 3, 3], rec: 'Hold', feedback: '' },
    { intId: ints[2].id, scores: [1, 1, 1, 1, 1, 1, 1], rec: 'Reject', feedback: 'no' },
  ]);
  assert.deepEqual(plain(moved), { sel: 1, hold: 1, rej: 1 });
  assert.deepEqual(plain(apps.map((a) => a.stage)), ['Personal Interview', 'On Hold', 'Rejected']);
  assert.ok(ints.every((i) => i.status === 'Completed'));
  assert.equal(ints[0].feedback, 'great');
  assert.equal(g.evaluated, true);
  assert.match(app.S.activity[0].text, /1 advanced/);
});

test('schedulePersonalInterview adds a Scheduled interview and moves early candidates to Personal Interview', () => {
  const app = fresh();
  const { apps } = trio(app);
  const a = apps[0];
  const it = app.schedulePersonalInterview({ appId: a.id, round: 'Technical', date: '2030-02-01', time: '15:00', duration: 60, mode: 'Zoom', link: '', location: '', interviewers: ['Kavita Rao'] });
  assert.equal(app.S.interviews.at(-1), it);
  assert.deepEqual([it.kind, it.status, it.invite, it.scores, it.decision], ['Personal', 'Scheduled', 'Sent', null, null]);
  assert.equal(a.stage, 'Personal Interview');
  assert.match(app.S.activity[0].text, /Technical interview scheduled for/);
});

test('a candidate already past Personal Interview is not moved back', () => {
  const app = fresh();
  const { apps } = trio(app);
  const a = apps[0];
  app.repo.update('applications', a.id, { stage: 'Selected' });
  app.schedulePersonalInterview({ appId: a.id, round: 'HR', date: '2030-02-01', time: '15:00', duration: 30, mode: 'Phone', link: '', location: '', interviewers: ['Neha Joshi'] });
  assert.equal(a.stage, 'Selected');
});

test('recordScorecard completes the interview with the decision; no-show and cancel set their status and log', () => {
  const app = fresh();
  const { apps } = trio(app);
  const base = { appId: apps[0].id, round: 'Technical', date: '2030-02-01', time: '15:00', duration: 60, mode: 'Zoom', link: '', location: '', interviewers: ['Kavita Rao'] };
  const a = app.schedulePersonalInterview(base), b = app.schedulePersonalInterview(base), c = app.schedulePersonalInterview(base);
  app.recordScorecard(a.id, { scores: [4, 4, 4, 4, 4], rec: 'Strong', decision: 'Selected', feedback: 'good' });
  assert.deepEqual([a.status, a.rec, a.decision, a.feedback], ['Completed', 'Strong', 'Selected', 'good']);
  assert.match(app.S.activity[0].text, /interview completed for .*: Selected/);
  app.markNoShow(b.id);
  assert.equal(b.status, 'No-show');
  assert.match(app.S.activity[0].text, /did not attend the Technical interview/);
  app.cancelInterview(c.id);
  assert.equal(c.status, 'Cancelled');
  assert.match(app.S.activity[0].text, /Interview cancelled for/);
});
