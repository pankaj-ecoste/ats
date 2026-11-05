import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadApp } from './load-app.mjs';

const app = loadApp({ until: 'src/domain/apply-link.js', globals: { URL }, expose: ['careersUrl', 'applyLinkFor', 'SOURCES'] });
const BASE = 'https://ats.example.com/careers.html';

test('the careers page is next to the app, whatever path, hash or query the app was opened with', () => {
  assert.equal(app.careersUrl('https://ats.example.com/'), BASE);
  assert.equal(app.careersUrl('https://ats.example.com/Ecoste_Recruit_Tracker.html#/openings?x=1'), BASE);
  assert.equal(app.careersUrl('https://ats.example.com/app/index.html'), 'https://ats.example.com/app/careers.html');
  assert.equal(app.careersUrl('not an address'), '');
});

test('a post links to the careers page with the platform in the link', () => {
  assert.equal(app.applyLinkFor(BASE, 'OP-A1B2', 'LinkedIn'), BASE + '#OP-A1B2?src=LinkedIn');
  assert.equal(app.applyLinkFor(BASE, 'OP-A1B2', 'Facebook Ad'), BASE + '#OP-A1B2?src=Facebook%20Ad');
  assert.equal(app.applyLinkFor(BASE, 'OP-A1B2', 'foundit'), BASE + '#OP-A1B2?src=foundit');
});

test('the careers page itself and a link with no platform need no source in the link', () => {
  assert.equal(app.applyLinkFor(BASE, 'OP-A1B2', 'Careers Page'), BASE + '#OP-A1B2');
  assert.equal(app.applyLinkFor(BASE, 'OP-A1B2'), BASE + '#OP-A1B2');
  assert.equal(app.applyLinkFor(BASE, 'OP-A1B2', ''), BASE + '#OP-A1B2');
});

test('an opening id that needs encoding is encoded, and there is no link without an address or an opening', () => {
  assert.equal(app.applyLinkFor(BASE, 'OP 1/2', 'Indeed'), BASE + '#OP%201%2F2?src=Indeed');
  assert.equal(app.applyLinkFor('', 'OP-1', 'Indeed'), '');
  assert.equal(app.applyLinkFor(BASE, '', 'Indeed'), '');
});

// the posting screen cannot be loaded here (it needs a browser), so its list of sites is read as text
test('every site of the built-in list tags its applicants with a source the app and the database both know', () => {
  const text = readFileSync(new URL('../../src/features/posting/posting.js', import.meta.url), 'utf8');
  const block = text.slice(text.indexOf('const DEFAULT_BOARDS=['), text.indexOf('function boards()'));
  const srcs = [...block.matchAll(/src:'([^']+)'/g)].map((m) => m[1]);
  assert.ok(srcs.length >= 14, 'found the built-in sites');
  for (const s of new Set(srcs)) assert.ok(app.SOURCES.includes(s), `a site uses the source "${s}", which is not in the list of sources`);
});
