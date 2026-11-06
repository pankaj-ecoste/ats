// What the top bar says about saving: nothing saved is never called saved, and being offline is said plainly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const app = loadApp({ until: 'src/domain/save-state.js', expose: ['saveStateOf'] });
const say = (o) => JSON.parse(JSON.stringify(app.saveStateOf(o)));

test('nothing waiting and a connection: all saved', () => {
  assert.equal(say({}).text, 'All saved');
  assert.equal(say({ pending: 0, online: true }).key, 'ok');
});

test('changes waiting: saving', () => {
  assert.deepEqual([say({ pending: 2 }).key, say({ pending: 2 }).text], ['busy', 'Saving…']);
});

test('a refused or failed change is not saved, whatever else is true', () => {
  assert.equal(say({ failing: true, pending: 0 }).text, 'Not saved');
  assert.equal(say({ failing: true, pending: 3, online: false }).key, 'bad');
  assert.match(say({ failing: true }).hint, /Reload/);
});

test('offline is said plainly, with the number of changes waiting, and never "all saved"', () => {
  assert.equal(say({ online: false }).text, 'Offline');
  assert.equal(say({ online: false, pending: 4 }).text, 'Offline · 4 waiting');
  assert.match(say({ online: false, pending: 1 }).hint, /Do not close the tab/);
});

test('every state has a hint for the tooltip', () => {
  for (const o of [{}, { pending: 1 }, { failing: true }, { online: false }]) assert.ok(say(o).hint.length > 10);
});
