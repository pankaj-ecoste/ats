import test from 'node:test';
import assert from 'node:assert/strict';
import { staleFiles } from '../../scripts/clean-intake.mjs';

const now = Date.parse('2026-10-19T00:00:00Z');
const f = (name, d) => ({ name, created_at: d });

test('an old file nobody points at is abandoned; a recent one or one in use is kept', () => {
  const files = [f('intake/a/old.pdf', '2026-10-10T00:00:00Z'), f('intake/b/new.pdf', '2026-10-18T00:00:00Z'), f('intake/c/used.pdf', '2026-09-01T00:00:00Z')];
  assert.deepEqual(staleFiles(files, ['intake/c/used.pdf'], now), ['intake/a/old.pdf']);
});

test('exactly three days old is still kept', () => {
  assert.deepEqual(staleFiles([f('intake/a/x.pdf', '2026-10-16T00:00:00Z')], [], now), []);
});
