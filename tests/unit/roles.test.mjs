// What each role may open, and what management sees when it may read applications but not candidates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const app = loadApp({ until: 'services', expose: ['roleCanSee', 'ROLE_PAGES', 'stateFromRows', 'makePeople'] });
const ALL = ['dashboard', 'pipeline', 'openings', 'posting', 'applications', 'candidates', 'interviews', 'offers', 'onboarding', 'tasks', 'reports', 'ai', 'sheets', 'settings', 'users'];
const pages = (role) => ALL.filter((k) => app.roleCanSee(role, k));

test('admins and recruiters open every page', () => {
  for (const role of ['admin', 'recruiter']) assert.deepEqual(pages(role), ALL);
});
test('management: dashboard, openings and the report, nothing about candidates, interviews or offers', () => {
  assert.deepEqual(pages('management').sort(), ['dashboard', 'openings', 'reports']);
});
test('interviewer: their interviews, candidates and tasks only', () => {
  assert.deepEqual(pages('interviewer').sort(), ['candidates', 'interviews', 'tasks']);
});
test('hiring manager: their openings, pipeline of applications, interviews, offers and tasks, but not the report or settings', () => {
  assert.deepEqual(pages('hiring_manager').sort(), ['applications', 'candidates', 'dashboard', 'interviews', 'offers', 'openings', 'tasks']);
});
test('a detail page counts as its list', () => {
  assert.equal(app.roleCanSee('management', 'opening'), true);
  assert.equal(app.roleCanSee('management', 'candidate'), false);
  assert.equal(app.roleCanSee('interviewer', 'candidate'), true);
  assert.equal(app.roleCanSee('interviewer', 'opening'), false);
});
test('every role that has a page list starts on a page it may open', () => {
  for (const [role, list] of Object.entries(app.ROLE_PAGES)) if (list) assert.ok(app.roleCanSee(role, list[0]));
});

test('an application whose candidate cannot be read gets a marked placeholder; known candidates are untouched', () => {
  const rows = {
    candidates: [{ id: 'C-1', name: 'Known', created_at: '2026-01-01' }],
    applications: [{ id: 'A-1', candidate_id: 'C-1', opening_id: 'OP-1', created_at: '2026-01-02' }, { id: 'A-2', candidate_id: 'C-9', opening_id: 'OP-1', created_at: '2026-01-03' }, { id: 'A-3', candidate_id: 'C-9', opening_id: 'OP-1', created_at: '2026-01-04' }],
  };
  const s = JSON.parse(JSON.stringify(app.stateFromRows(rows, app.makePeople([]))));
  assert.deepEqual(s.candidates.map((c) => c.id).sort(), ['C-1', 'C-9']);
  const hidden = s.candidates.find((c) => c.id === 'C-9');
  assert.equal(hidden.restricted, true);
  assert.equal(hidden.name, 'Candidate (hidden)');
  assert.deepEqual([hidden.skills, hidden.documents, hidden.expSal], [[], [], null]);
  assert.equal(s.candidates.find((c) => c.id === 'C-1').restricted, undefined);
});
