import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const app = loadApp({ until: 'services', expose: ['adStats', 'isAdSource'] });
const apply = (date, source, maxStage = 0, stage = 'New') => ({ date, source, maxStage, stage });

test('a source counts as an ad when its name says so; job boards and referrals do not', () => {
  for (const s of ['Facebook Ad', 'Google Ad', 'Instagram Ad', 'Ad campaign', 'Meta Ads', 'Diwali campaign']) assert.equal(app.isAdSource(s), true, s);
  for (const s of ['LinkedIn', 'Naukri', 'Referral', 'Careers Page', 'Google Sheet', 'Shad Corp', 'Unknown', '', undefined]) assert.equal(app.isAdSource(s), false, String(s));
});

test('the ad counts its own leads from the day it started, and the funnel and costs follow from them', () => {
  const o = { ad: { status: 'Running', raisedOn: '2026-11-01', startOn: '2026-11-05', endOn: '', spend: 10000 } };
  const apps = [
    apply('2026-11-04', 'Facebook Ad', 7, 'Offer Accepted'),   // before the ad started: not the ad's
    apply('2026-11-05', 'Facebook Ad', 0),
    apply('2026-11-06', 'Google Ad', 3, 'Group Interview'),
    apply('2026-11-07', 'Facebook Ad', 4, 'Personal Interview'),
    apply('2026-11-08', 'Ad campaign', 7, 'Offer Accepted'),
    apply('2026-11-08', 'Facebook Ad', 7, 'Rejected'),         // accepted, then dropped: not hired
    apply('2026-11-09', 'Referral', 8, 'Joining'),             // another source
    apply('2026-11-09', 'Naukri', 0),
  ];
  const s = app.adStats(o, apps);
  assert.deepEqual({ ...s }, { from: '2026-11-05', to: '', leads: 5, screened: 4, interviewed: 3, hired: 1, costPerLead: 2000, costPerHire: 10000, other: 3 });
});

test('before the ad starts the count runs from the day it was requested; after it ends it stops that day', () => {
  const apps = [apply('2026-10-31', 'Facebook Ad'), apply('2026-11-01', 'Facebook Ad'), apply('2026-11-10', 'Facebook Ad'), apply('2026-11-11', 'Facebook Ad')];
  assert.equal(app.adStats({ ad: { raisedOn: '2026-11-01' } }, apps).leads, 3);
  const ended = app.adStats({ ad: { raisedOn: '2026-11-01', startOn: '2026-11-01', endOn: '2026-11-10' } }, apps);
  assert.equal(ended.leads, 2);
  assert.equal(ended.to, '2026-11-10');
});

test('no spend, or nobody yet, gives no cost rather than a wrong one; the source is read the way the caller says', () => {
  const o = { ad: { raisedOn: '2026-11-01' } };
  assert.equal(app.adStats(o, [apply('2026-11-02', 'Facebook Ad')]).costPerLead, null, 'no spend filled in');
  const s = app.adStats({ ad: { raisedOn: '2026-11-01', spend: 500 } }, [apply('2026-11-02', 'Facebook Ad')]);
  assert.equal(s.costPerLead, 500);
  assert.equal(s.costPerHire, null, 'nobody hired yet');
  const none = app.adStats({ ad: { raisedOn: '2026-11-01', spend: 500 } }, []);
  assert.deepEqual({ ...none }, { from: '2026-11-01', to: '', leads: 0, screened: 0, interviewed: 0, hired: 0, costPerLead: null, costPerHire: null, other: 0 });
  const viaCandidate = app.adStats(o, [{ date: '2026-11-02', maxStage: 0, stage: 'New', cand: 'Google Ad' }], (a) => a.cand);
  assert.equal(viaCandidate.leads, 1);
});
