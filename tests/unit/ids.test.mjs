import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const { uid } = loadApp({ until: 'src/core/utils.js', expose: ['uid'] });

test('uid: prefix plus 8 characters, no look-alike letters', () => {
  for (let i = 0; i < 200; i++) assert.match(uid('APP'), /^APP-[2-9A-HJ-NP-Z]{8}$/);
});

test('uid: 100,000 ids are all different', () => {
  const seen = new Set();
  for (let i = 0; i < 100000; i++) seen.add(uid('C'));
  assert.equal(seen.size, 100000);
});
