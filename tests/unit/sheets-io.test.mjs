import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// sheets-io.js is written to run in the browser (window.SheetsIO) or under CommonJS (module.exports)
const mod = { exports: {} };
const ctx = vm.createContext({ module: mod });
// constants.js defines STAGES, which sheets-io.js receives at load time
for (const f of ['core/constants.js', 'features/sheets/sheets-io.js']) vm.runInContext(readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8'), ctx);
const { SheetsIO } = mod.exports;

test('every sheet in SHEET_ORDER has a schema', () => {
  for (const name of SheetsIO.SHEET_ORDER) assert.ok(Array.isArray(SheetsIO.SCHEMA[name]), name);
});

test('readDate normalises the formats recruiters type', () => {
  assert.equal(SheetsIO.readDate('2026-1-5'), '2026-01-05');
  assert.equal(SheetsIO.readDate('06/10/2026'), '2026-10-06'); // day first
  assert.equal(SheetsIO.readDate('6-Oct-26'), '2026-10-06');
  assert.equal(SheetsIO.readDate(''), null);
});

test('readTime normalises 12-hour and 24-hour input', () => {
  assert.equal(SheetsIO.readTime('2:30 pm'), '14:30');
  assert.equal(SheetsIO.readTime('12:05 am'), '00:05');
  assert.equal(SheetsIO.readTime('09.15'), '09:15');
});
