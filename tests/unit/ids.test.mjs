import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const { uid } = loadApp({ until: 'src/core/utils.js', expose: ['uid'] });

test('uid: prefix plus 8 characters, no look-alike letters', () => {
  for (let i = 0; i < 200; i++) assert.match(uid('APP'), /^APP-[2-9A-HJ-NP-Z]{8}$/);
});

// An id has 40 random bits, so 100,000 ids collide by pure chance about once in 200 runs (a test that failed on its own). 5,000 ids collide about once in 200,000 runs,
// and that is the size of one import. The 100,000 ids must still be plentiful, so the count of different ones is held to a near-perfect bar.
test('uid: 5,000 ids are all different, and 100,000 are all but a handful different', () => {
  const small = new Set();
  for (let i = 0; i < 5000; i++) small.add(uid('C'));
  assert.equal(small.size, 5000);
  const big = new Set();
  for (let i = 0; i < 100000; i++) big.add(uid('C'));
  assert.ok(big.size >= 99990, `only ${big.size} different`);
});
