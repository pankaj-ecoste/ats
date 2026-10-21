import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stored = { v: 3, settings: { user: 'Legacy User' }, openings: [], candidates: [], applications: [], interviews: [], groups: [], offers: [], onboarding: [], tasks: [], activity: [], notifications: [], postings: [] };

test('data saved under the legacy key is still loaded', () => {
  const app = loadApp({ expose: ['S'], storage: { 'spectra-ats-v3': JSON.stringify(stored) } });
  assert.equal(app.S.settings.user, 'Legacy User');
});

test('the new key wins over the legacy key', () => {
  const app = loadApp({ expose: ['S'], storage: { 'spectra-ats-v3': JSON.stringify(stored), 'ecoste-ats': JSON.stringify({ ...stored, settings: { user: 'New User' } }) } });
  assert.equal(app.S.settings.user, 'New User');
});

test('data with an unknown version is backed up before it can be overwritten', () => {
  const old = JSON.stringify({ v: 2, anything: true });
  const app = loadApp({ expose: ['S'], storage: { 'ecoste-ats': old } });
  assert.equal(app._storage.get('ecoste-ats-backup'), old);
  assert.ok(app.S.openings.length > 0, 'falls back to the demo data');
});

test('save writes to the new key and leaves the legacy key alone', async () => {
  const app = loadApp({ expose: ['save'], storage: { 'spectra-ats-v3': JSON.stringify(stored) } });
  app.save();
  await wait(260);
  assert.ok(app._storage.has('ecoste-ats'));
  assert.equal(app._storage.get('spectra-ats-v3'), JSON.stringify(stored));
});

test('a failed save is reported once, not silently dropped', async () => {
  const toasts = [];
  const app = loadApp({ expose: ['save'], failWrites: true, globals: { toast: (m) => toasts.push(m) } });
  app.save(); await wait(260);
  app.save(); await wait(260);
  assert.equal(toasts.length, 1);
});
