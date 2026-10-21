import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const stub = { document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } }, body: { classList: { toggle() {}, add() {}, remove() {}, contains: () => false } } }, window: new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}) }) };
const app = loadApp({ until: 'src/app/url.js', expose: ['routeToHash', 'hashToRoute'], globals: stub });
const plain = (x) => JSON.parse(JSON.stringify(x));

test('a route becomes an address and back', () => {
  assert.equal(app.routeToHash({ view: 'openings' }), '#/openings');
  assert.equal(app.routeToHash({ view: 'candidate', param: 'C-1', tab: 'overview' }), '#/candidate/C-1');
  assert.equal(app.routeToHash({ view: 'candidate', param: 'C-1', tab: 'notes' }), '#/candidate/C-1/notes');
  assert.equal(app.routeToHash({ view: 'dashboard', dashTab: 'today' }), '#/dashboard/today');
  assert.deepEqual(plain(app.hashToRoute('#/candidate/C-1/notes')), { view: 'candidate', param: 'C-1', tab: 'notes' });
  assert.deepEqual(plain(app.hashToRoute('#/opening/OP-9')), { view: 'opening', param: 'OP-9', tab: 'overview' });
  assert.deepEqual(plain(app.hashToRoute('#/dashboard/report')), { view: 'dashboard', param: null, tab: 'overview', dashTab: 'report' });
});

test('odd characters in an id survive, and rubbish is refused', () => {
  const h = app.routeToHash({ view: 'candidate', param: 'a/b c', tab: 'overview' });
  assert.equal(h, '#/candidate/a%2Fb%20c');
  assert.equal(app.hashToRoute(h).param, 'a/b c');
  assert.equal(app.hashToRoute(''), null);
  assert.equal(app.hashToRoute('#OP-1001'), null);       // the careers page style of link is not ours
  assert.equal(app.hashToRoute('#/candidate'), null);    // a record page needs an id
  assert.equal(app.hashToRoute('#/candidate/%E0%A4'), null);
});
