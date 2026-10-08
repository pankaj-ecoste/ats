import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const fresh = () => loadApp({
  until: 'services',
  expose: ['S', 'repo', 'repoOnChange', 'onEvent', 'moveStage', 'log', 'notify', 'markNotificationRead', 'markAllNotificationsRead',
    'addTask', 'setTaskDone', 'deleteTask', 'getA', 'getOp', 'appsOfOp', 'STAGES', 'today'],
});

// an opening that is still "live", with an application sitting at New
function liveOpening(app) {
  for (const o of app.S.openings) {
    if (['Draft', 'On Hold', 'Closed', 'Filled'].includes(o.status)) continue;
    const a = app.appsOfOp(o.id).find((x) => x.stage === 'New');
    if (a) return { o, a };
  }
  throw new Error('seed has no live opening with a New application');
}

test('moveStage writes the stage, date, furthest stage and an activity entry', () => {
  const app = fresh();
  const { a } = liveOpening(app);
  const before = app.S.activity.length;
  const r = app.moveStage(a.id, 'Shortlisted');
  assert.equal(r.prev, 'New');
  assert.equal(a.stage, 'Shortlisted');
  assert.equal(a.stageSince, app.today());
  assert.equal(a.maxStage, app.STAGES.indexOf('Shortlisted'));
  assert.equal(app.S.activity.length, before + 1);
  assert.equal(app.S.activity[0].type, 'shortlist');
});

test('moveStage to the current stage does nothing', () => {
  const app = fresh();
  const { a } = liveOpening(app);
  const before = app.S.activity.length;
  assert.equal(app.moveStage(a.id, 'New'), null);
  assert.equal(app.S.activity.length, before);
});

test('moving to a later stage never lowers maxStage', () => {
  const app = fresh();
  const { a } = liveOpening(app);
  app.moveStage(a.id, 'Personal Interview');
  const high = a.maxStage;
  app.moveStage(a.id, 'Rejected');
  assert.equal(a.maxStage, high);
});

test('opening status follows its furthest application', () => {
  const app = fresh();
  const { o, a } = liveOpening(app);
  app.moveStage(a.id, 'Offer');
  assert.equal(o.status, 'Offer');
});

test('Draft, On Hold, Closed and Filled openings keep their status', () => {
  const app = fresh();
  const { o, a } = liveOpening(app);
  o.status = 'On Hold';
  app.moveStage(a.id, 'Offer');
  assert.equal(o.status, 'On Hold');
});

test('stage:changing fires before the stage is written, with the previous stage', () => {
  const app = fresh();
  const { a } = liveOpening(app);
  const seen = [];
  app.onEvent('stage:changing', (e) => seen.push({ ...e, stageAtFire: a.stage }));
  app.moveStage(a.id, 'Shortlisted');
  assert.deepEqual(seen, [{ aid: a.id, stage: 'Shortlisted', prev: 'New', stageAtFire: 'New' }]);
});

test('repo reports every change to listeners', () => {
  const app = fresh();
  const changes = [];
  app.repoOnChange((c) => changes.push(`${c.op}:${c.coll}`));
  const t = app.addTask({ title: 'x', due: app.today(), priority: 'Low', related: 'General', owner: 'Me' });
  app.setTaskDone(t.id, true);
  app.deleteTask(t.id);
  assert.deepEqual(changes, ['insert:tasks', 'update:tasks', 'remove:tasks']);
});

test('tasks: add puts the newest first, done is saved, delete removes', () => {
  const app = fresh();
  const n = app.S.tasks.length;
  const t = app.addTask({ title: 'Call back', due: app.today(), priority: 'High', related: 'General', owner: 'Me' });
  assert.equal(app.S.tasks[0], t);
  assert.equal(t.done, false);
  app.setTaskDone(t.id, true);
  assert.equal(app.S.tasks[0].done, true);
  assert.equal(app.deleteTask(t.id), true);
  assert.equal(app.S.tasks.length, n);
  assert.equal(app.deleteTask('nope'), false);
});

test('notifications: mark one and mark all', () => {
  const app = fresh();
  app.notify('a', ['offers']);
  app.notify('b');
  const [b, a] = app.S.notifications;
  assert.equal(app.markNotificationRead(a.id).go[0], 'offers');
  assert.equal(a.read, true);
  assert.equal(b.read, false);
  app.markAllNotificationsRead();
  assert.ok(app.S.notifications.every((n) => n.read));
});

test('activity log keeps only the newest 300 entries', () => {
  const app = fresh();
  for (let i = 0; i < 320; i++) app.log('entry ' + i);
  assert.equal(app.S.activity.length, 300);
  assert.equal(app.S.activity[0].text, 'entry 319');
});

test('repo.update throws for a record that does not exist', () => {
  const app = fresh();
  assert.throws(() => app.repo.update('tasks', 'missing', { done: true }), /not found/);
});
