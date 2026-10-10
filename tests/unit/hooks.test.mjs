import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const fresh = () => loadApp({
  until: 'src/core/hooks.js',
  globals: { NAV: [['dashboard'], ['openings'], ['sep']], VIEWS: {} },
  expose: ['registerAction', 'runAction', 'fillSlot', 'slotHTML', 'onBind', 'runBindHooks', 'onEvent', 'emitEvent', 'addNav', 'decorateView', 'NAV', 'VIEWS'],
});

test('actions: a registered action runs with its arguments, an unknown one throws', () => {
  const app = fresh();
  const calls = [];
  app.registerAction('go', (view, param) => calls.push([view, param]));
  app.runAction('go', ['posting', 'OP-1']);
  app.runAction('go', ['openings']);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['posting', 'OP-1'], ['openings', undefined]].map((c) => c.map((x) => x ?? null)));
  assert.throws(() => app.runAction('missing'), /Unknown action: missing/);
});

test('slots: fillers are joined in registration order, an empty slot is an empty string', () => {
  const app = fresh();
  assert.equal(app.slotHTML('nothing.here'), '');
  app.fillSlot('top', () => '<a>');
  app.fillSlot('top', () => '<b>');
  assert.equal(app.slotHTML('top'), '<a><b>');
});

test('bind hooks run for the named view only', () => {
  const app = fresh();
  const seen = [];
  app.onBind('sheets', (root) => seen.push(['sheets', root]));
  app.onBind('tasks', (root) => seen.push(['tasks', root]));
  app.runBindHooks('sheets', 'ROOT');
  assert.deepEqual(JSON.parse(JSON.stringify(seen)), [['sheets', 'ROOT']]);
});

test('events: every listener hears the payload; an event nobody listens to is fine', () => {
  const app = fresh();
  const got = [];
  app.onEvent('x', (p) => got.push(['a', p]));
  app.onEvent('x', (p) => got.push(['b', p]));
  app.emitEvent('x', 7);
  app.emitEvent('nobody', 1);
  assert.deepEqual(JSON.parse(JSON.stringify(got)), [['a', 7], ['b', 7]]);
});

test('addNav puts an item after the named one, or at the end when the name is unknown', () => {
  const app = fresh();
  app.addNav(['pipeline'], 'dashboard');
  app.addNav(['last'], 'does-not-exist');
  assert.deepEqual(JSON.parse(JSON.stringify(app.NAV.map((n) => n[0]))), ['dashboard', 'pipeline', 'openings', 'sep', 'last']);
});

test('decorateView changes the output and the binder while keeping the original reachable', () => {
  const app = fresh();
  const log = [];
  app.VIEWS.page = [() => 'orig', () => log.push('orig-bind')];
  app.decorateView('page', { view: (orig) => '[' + orig() + ']', bind: (root, orig) => { log.push('wrap'); orig(root); } });
  const [v, b] = app.VIEWS.page;
  assert.equal(v(), '[orig]');
  b('root');
  assert.deepEqual(JSON.parse(JSON.stringify(log)), ['wrap', 'orig-bind']);
});
