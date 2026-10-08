import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const plain = (x) => JSON.parse(JSON.stringify(x));
const fresh = () => loadApp({
  until: 'services',
  expose: ['S', 'saveOffer', 'markOfferSent', 'recordOfferResponse', 'confirmJoining', 'recordJoined', 'beginOnboarding', 'setOnboardingItem',
    'markEmployeeReady', 'getA', 'getC', 'repo', 'today', 'offerOfA', 'ONB_TEMPLATE'],
});

// an application with no offer yet, early in the pipeline
const bareApp = (app) => app.S.applications.find((a) => !app.offerOfA(a.id) && ['New', 'Shortlisted', 'Screening', 'Personal Interview'].includes(a.stage));
const draft = (a, over = {}) => ({ id: 'OFR-TEST', appId: a.id, designation: 'Dev', ctc: 1200000, breakup: {}, status: 'Draft', created: '2026-01-01', sent: null, custom: null, _new: true, ...over });

test('saveOffer stores a new offer as given, logs it and moves the candidate to Offer', () => {
  const app = fresh();
  const a = bareApp(app);
  const n = app.S.offers.length;
  const w = draft(a);
  const f = app.saveOffer(w, 'Draft');
  assert.equal(f, w);
  assert.equal(app.S.offers.length, n + 1);
  assert.equal(app.S.offers.at(-1), w);
  assert.equal(w.status, 'Draft');
  assert.ok(!('_new' in w));
  assert.equal(a.stage, 'Offer');
  assert.match(app.S.activity.find((x) => x.type === 'offer').text, /Offer drafted for/);
});

test('saveOffer on an existing offer copies the edits across without adding a record or a second log', () => {
  const app = fresh();
  const a = bareApp(app);
  const stored = app.saveOffer(draft(a), 'Draft');
  const logs = app.S.activity.length, n = app.S.offers.length;
  const copy = { ...plain(stored), ctc: 1500000 };
  const f = app.saveOffer(copy, 'Generated');
  assert.equal(f, stored);
  assert.equal(app.S.offers.length, n);
  assert.deepEqual(plain([stored.ctc, stored.status]), [1500000, 'Generated']);
  assert.equal(app.S.activity.length, logs, 'no stage move (already at Offer) and no creation log');
});

test('markOfferSent stamps the date, notifies and creates a follow-up task for the user', () => {
  const app = fresh();
  const a = bareApp(app);
  const f = app.saveOffer(draft(a), 'Sent');
  const [t, n] = [app.S.tasks.length, app.S.notifications.length];
  app.markOfferSent(f.id);
  assert.equal(f.sent, app.today());
  assert.equal(app.S.tasks.length, t + 1);
  assert.match(app.S.tasks[0].title, /^Follow up with .* on offer$/);
  assert.equal(app.S.tasks[0].priority, 'High');
  assert.equal(app.S.tasks[0].owner, app.S.settings.user);
  assert.equal(app.S.notifications.length, n + 1);
});

test('offer response: Accepted moves the candidate on and notifies; Declined and Negotiation only record', () => {
  const app = fresh();
  const [a1, a2, a3] = app.S.applications.filter((a) => !app.offerOfA(a.id) && ['New', 'Shortlisted', 'Screening'].includes(a.stage)).slice(0, 3);
  const mk = (a, id) => app.saveOffer(draft(a, { id }), 'Sent');
  const [f1, f2, f3] = [mk(a1, 'OFR-1'), mk(a2, 'OFR-2'), mk(a3, 'OFR-3')];
  const n = app.S.notifications.length;
  app.recordOfferResponse(f1.id, 'Accepted');
  assert.deepEqual(plain([f1.status, a1.stage]), ['Accepted', 'Offer Accepted']);
  assert.equal(app.S.notifications.length, n + 1);
  app.recordOfferResponse(f2.id, 'Declined');
  assert.deepEqual(plain([f2.status, a2.stage]), ['Declined', 'Offer']);
  app.recordOfferResponse(f3.id, 'Negotiation');
  assert.equal(f3.status, 'Negotiation');
  assert.match(app.S.activity[0].text, /asked to negotiate the offer/);
  assert.equal(app.S.notifications.length, n + 1, 'only acceptance notifies');
});

test('confirmJoining sets the date on the application and its offer and moves to Joining', () => {
  const app = fresh();
  const a = bareApp(app);
  const f = app.saveOffer(draft(a), 'Sent');
  app.confirmJoining(a.id, '2030-03-01');
  assert.deepEqual(plain([a.joining, f.joining, a.stage]), ['2030-03-01', '2030-03-01', 'Joining']);
  assert.match(app.S.activity.find((x) => x.type === 'schedule').text, /Joining confirmed for/);
});

test('beginOnboarding creates the checklist once and moves to Onboarding', () => {
  const app = fresh();
  const a = bareApp(app);
  const n = app.S.onboarding.length;
  app.beginOnboarding(a.id);
  app.beginOnboarding(a.id);
  assert.equal(app.S.onboarding.length, n + 1);
  const o = app.S.onboarding.at(-1);
  assert.deepEqual(plain([o.appId, o.items.length, o.items.every((i) => !i.done)]), [a.id, app.ONB_TEMPLATE.length, true]);
  assert.equal(a.stage, 'Onboarding');
});

test('checklist items log when ticked, not when cleared; mark employee ready finishes the journey', () => {
  const app = fresh();
  const a = bareApp(app);
  app.beginOnboarding(a.id);
  const logs = app.S.activity.length;
  app.setOnboardingItem(a.id, 0, true);
  assert.equal(app.S.activity.length, logs + 1);
  assert.equal(app.repo.find('onboarding', a.id).items[0].done, true);
  app.setOnboardingItem(a.id, 0, false);
  assert.equal(app.S.activity.length, logs + 1);
  app.recordJoined(a.id);
  app.markEmployeeReady(a.id);
  assert.equal(a.stage, 'Employee Ready');
  assert.match(app.S.notifications[0].text, /completed onboarding/);
});
