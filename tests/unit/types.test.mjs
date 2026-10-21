import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, typeOf } from '../../scripts/gen-types.mjs';
import { loadApp } from './load-app.mjs';

test('column types: numbers, text, lists, enums and nullable columns', () => {
  const enums = { app_role: ['admin', 'pending'] };
  assert.equal(typeOf('int4', enums), 'number');
  assert.equal(typeOf('_text', enums), 'string[]');
  assert.equal(typeOf('app_role', enums), "'admin' | 'pending'");
  const out = render({ candidate_notes: [{ name: 'id', udt: 'uuid', nullable: false }, { name: 'body', udt: 'text', nullable: true }] }, enums);
  assert.ok(out.includes(['export interface CandidateNotes {', '  id: string;', '  body: string | null;', '}'].join('\n')));
  assert.match(out, /candidate_notes: CandidateNotes;/);
});

test('the committed types describe every table the app reads and the columns added by recent migrations', () => {
  const types = readFileSync(new URL('../../src/types/database.d.ts', import.meta.url), 'utf8');
  const app = loadApp({ until: 'services', expose: ['READ_TABLES'] });
  for (const [t] of app.READ_TABLES) assert.match(types, new RegExp(`^  ${t}: `, 'm'), `${t} is missing: run npm run types`);
  assert.match(types, /match_reasons: Json \| null/);
  assert.match(types, /rejection_reason: string \| null/);
});
