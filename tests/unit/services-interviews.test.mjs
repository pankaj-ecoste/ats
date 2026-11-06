import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const plain = (x) => JSON.parse(JSON.stringify(x));
const fresh = () => loadApp({
  until: 'services',
  expose: ['S', 'recordScreening', 'scheduleGroupInterview', 'setInviteStatus', 'sendGroupReminders', 'cancelGroupInterview', 'evaluateGroup',
    'schedulePersonalInterview', 'recordScorecard', 'markNoShow', 'cancelInterview', 'getA', 'getC', 'getOp', 'appsOfOp', 'repo', 'today', 'setScreenQuestions', 'requestAd', 'saveAdRequest', 'dropAdRequest', 'hasAd', 'recordAdBrief', 'adBrief', 'saveMarketingContact', 'saveAdFields', 'adFieldList', 'setAppCall', 'APP_CALL_STATUS'],
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

test('the questions of an opening are tidy, at most 10, and the answers are kept on the application by question', () => {
  const app = fresh();
  const a = app.S.applications[0];
  const o = app.getOp(a.opId);
  app.setScreenQuestions(o.id, ['  Can you join   in 15 days? ', 'can you join in 15 days?', '', 'Own bike?']);
  assert.deepEqual(plain(o.screenQ), ['Can you join in 15 days?', 'Own bike?']);
  assert.throws(() => app.setScreenQuestions(o.id, Array.from({ length: 11 }, (_, i) => 'Q' + i)), /At most 10/);
  app.recordScreening(a.id, { outcome: 'Connected', answers: [], notes: '', duration: 1, custom: { 'Own bike?': ' Yes ', 'Can you join in 15 days?': '' } });
  assert.deepEqual(plain(a.custom), { 'Own bike?': 'Yes' });
  app.recordScreening(a.id, { outcome: 'Connected', answers: [], notes: '', duration: 1, custom: { 'Own bike?': '' } });
  assert.deepEqual(plain(a.custom), {}, 'an emptied answer is removed');
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

test('the ad request of an opening is optional: ask, fill in, tidy, remove; other openings are untouched', () => {
  const app = fresh();
  const [o, other] = app.S.openings;
  assert.equal(app.hasAd(o), false, 'no ad unless asked for');
  const ad = app.requestAd(o.id);
  assert.deepEqual(plain(ad), { status: 'Requested', raisedOn: app.today(), raisedBy: app.S.settings.user, withSalary: false });
  assert.equal(app.requestAd(o.id), o.ad, 'asking again keeps the first request');
  assert.match(app.S.activity[0].text, /Ad requested for /);
  const saved = app.saveAdRequest(o.id, { status: 'Running', startOn: '2026-11-08', endOn: '', platform: '  Meta   Ads ', budget: '20000', spend: '', link: '', notes: ' hello ', withSalary: true });
  assert.deepEqual(plain(saved), { status: 'Running', raisedOn: ad.raisedOn, raisedBy: ad.raisedBy, startOn: '2026-11-08', endOn: '', platform: 'Meta Ads', link: '', notes: 'hello', withSalary: true, budget: 20000 });
  assert.match(app.S.activity[0].text, /is now Running/);
  assert.throws(() => app.saveAdRequest(o.id, { status: 'Live' }), /Choose a status/);
  assert.throws(() => app.saveAdRequest(o.id, { status: 'Running', budget: '-5' }), /Budget/);
  assert.throws(() => app.saveAdRequest(o.id, { status: 'Running', startOn: 'soon' }), /not a date/);
  assert.throws(() => app.saveAdRequest(o.id, { status: 'Closed', startOn: '2026-11-09', endOn: '2026-11-08' }), /end date is before/);
  assert.equal(o.ad.status, 'Running', 'a refused save changes nothing');
  assert.throws(() => app.saveAdRequest(other.id, { status: 'Running' }), /No ad was asked for/);
  assert.equal(app.hasAd(other), false);
  app.dropAdRequest(o.id);
  assert.equal(app.hasAd(o), false);
});

test('the brief to marketing carries the opening, leaves the salary out unless ticked, and every handover is kept on the ad', () => {
  const app = fresh();
  const o = app.S.openings[0];
  app.requestAd(o.id);
  const b = app.adBrief(o, { to: 'Shivam', from: 'Priya' });
  assert.equal(b.subject, `Ad request: ${o.title} (${o.id})`);
  assert.match(b.body, /^Hi Shivam,/);
  assert.ok(b.body.includes('Position: ' + o.title) && b.body.includes('Experience: '));
  assert.doesNotMatch(b.body, /Salary range/);
  assert.match(app.adBrief(o, { withSalary: true }).body, /Salary range: /);
  assert.match(app.adBrief(o, {}).body, /^Hi team,/);
  app.recordAdBrief(o.id, { channel: 'Email', to: 'shivam@x.test', ...b });
  app.recordAdBrief(o.id, { channel: 'Copied', ...b });
  assert.deepEqual(plain(o.ad.sent).map((x) => x.channel), ['Email', 'Copied']);
  assert.equal(o.ad.sent[0].body, b.body, 'the exact text is kept');
  assert.match(app.S.activity[0].text, /copied/);
  const kept = app.saveAdRequest(o.id, { status: 'Running' });
  assert.equal(kept.sent.length, 2, 'saving the ad details keeps the history');
  for (let i = 0; i < 25; i++) app.recordAdBrief(o.id, { channel: 'Email', ...b });
  assert.equal(o.ad.sent.length, 20, 'only the newest 20 are kept');
  assert.throws(() => app.recordAdBrief(o.id, { channel: 'Pigeon' }), /Unknown way/);
  assert.throws(() => app.recordAdBrief(app.S.openings[1].id, { channel: 'Email' }), /No ad was asked for/);
});

test('the marketing contact is tidy, checked, kept in the settings, and emptied when all three are blank', () => {
  const app = fresh();
  app.saveMarketingContact({ name: '  Shivam  ', email: ' shivam@x.test ', phone: '98765 43210' });
  assert.deepEqual(plain(app.S.settings.marketing), { name: 'Shivam', email: 'shivam@x.test', phone: '98765 43210' });
  assert.throws(() => app.saveMarketingContact({ email: 'not an email' }), /email/);
  assert.throws(() => app.saveMarketingContact({ phone: '123' }), /phone/);
  assert.equal(app.S.settings.marketing.email, 'shivam@x.test', 'a refused save changes nothing');
  app.saveMarketingContact({ name: '', email: '', phone: '' });
  assert.equal(app.S.settings.marketing, undefined);
});

test('fields of their own on the ad: the names are tidy and at most 12; the values are kept, tidied, and survive other edits', () => {
  const app = fresh();
  app.saveAdFields(['  Creative   link ', 'creative link', '', 'Target CPL', 'x'.repeat(41)]);
  assert.deepEqual(plain(app.adFieldList()), ['Creative link', 'Target CPL'], 'tidy, no repeat in any case, nothing over 40 characters');
  app.saveAdFields(Array.from({ length: 15 }, (_, i) => 'F' + i));
  assert.equal(app.adFieldList().length, 12);
  app.saveAdFields([]);
  assert.deepEqual(plain(app.adFieldList()), []);
  const o = app.S.openings[0];
  app.requestAd(o.id);
  app.saveAdRequest(o.id, { status: 'Running', custom: { ' Creative link ': '  https://x.test/a  ', 'Target CPL': '', '': 'no name' } });
  assert.deepEqual(plain(o.ad.custom), { 'Creative link': 'https://x.test/a' }, 'blank values and nameless fields are dropped');
  app.saveAdRequest(o.id, { status: 'Paused' });
  assert.deepEqual(plain(o.ad.custom), { 'Creative link': 'https://x.test/a' }, 'an edit that does not touch the fields keeps them');
  app.saveAdRequest(o.id, { status: 'Paused', custom: {} });
  assert.equal(o.ad.custom, undefined, 'emptied fields leave no trace');
  const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => ['F' + i, 'v']));
  assert.throws(() => app.saveAdRequest(o.id, { status: 'Paused', custom: many }), /At most 20/);
});

test('call status via app: NA until a call is logged; any other value is a call, again and again; NA only clears; a screening call sets it too', () => {
  const app = fresh();
  const a = app.S.applications[0];
  assert.equal(a.appCall, undefined, 'a lead starts at NA');
  assert.equal(app.APP_CALL_STATUS[0], 'NA');
  assert.equal(app.APP_CALL_STATUS.length, 13);
  assert.equal(new Set(app.APP_CALL_STATUS.map((s) => s.toLowerCase())).size, 13, 'no repeat in any letter case');
  const t0 = Date.now();
  app.setAppCall(a.id, 'Busy');
  assert.equal(a.appCall, 'Busy');
  assert.ok(a.appCallAt >= t0);
  assert.match(app.S.activity[0].text, /Call logged on .*: Busy/);
  const first = a.appCallAt;
  const spin = Date.now() + 3; while (Date.now() < spin);
  app.setAppCall(a.id, 'Busy');
  assert.ok(a.appCallAt > first, 'the same status again carries a newer time, so the database logs another call');
  const logged = app.S.activity.length;
  app.setAppCall(a.id, 'NA');
  assert.equal(a.appCall, null);
  assert.equal(app.S.activity.length, logged, 'clearing is not a call');
  assert.throws(() => app.setAppCall(a.id, 'Called'), /Choose a call status/);
  assert.throws(() => app.setAppCall('nope', 'Busy'), /not found/);
  for (const [outcome, status] of [['Connected', 'Connected'], ['Interested', 'Connected'], ['Not Connected', 'Call not connected'], ['Not Interested', 'Not Interested'], ['Call Back', 'Call Back Requested']]) {
    app.recordScreening(a.id, { outcome, answers: [], notes: '', duration: 1 });
    assert.equal(a.appCall, status, outcome);
  }
});
