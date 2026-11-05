import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const plain = (x) => JSON.parse(JSON.stringify(x));
const app = loadApp({ until: 'services', expose: ['formOf', 'newQuestion', 'newQuestionId', 'formToStore', 'formProblem', 'formSummary', 'FORM_FIELDS', 'FORM_TYPES', 'TO_ROW', 'FROM_ROW', 'makePeople'] });
const Q = (label, type = 'text', over = {}) => ({ id: 'q' + Math.random().toString(36).slice(2, 7), label, type, required: false, options: [], ...over });

test('an opening with no form has the usual form: nothing off, no question of its own', () => {
  assert.deepEqual(plain(app.formOf({})), { hide: [], questions: [] });
  assert.deepEqual(plain(app.formOf({ form: {} })), { hide: [], questions: [] });
  assert.deepEqual(plain(app.formToStore({ hide: [], questions: [] })), {}, 'the plain form is stored as nothing');
  assert.equal(app.formSummary({}), 'Standard form');
});

test('a draft is a copy: editing it does not touch the opening', () => {
  const o = { form: { hide: ['cur'], questions: [{ id: 'a1', label: 'Bike?', type: 'yesno', required: true, options: [] }] } };
  const d = app.formOf(o);
  d.hide.push('exp'); d.questions[0].label = 'Changed'; d.questions.push(Q('More'));
  assert.deepEqual(plain(o.form.hide), ['cur']);
  assert.equal(o.form.questions[0].label, 'Bike?');
  assert.equal(o.form.questions.length, 1);
});

test('what is stored is tidy: spaces trimmed, options only for a choice, only known switches', () => {
  const stored = plain(app.formToStore({ hide: ['cur', 'name', 'cur', 'edu'], questions: [
    { id: 'a1', label: '  Bike?  ', type: 'yesno', required: 1, options: ['x'] },
    { id: 'b2', label: 'Area', type: 'choice', required: false, options: [' North ', '', 'South'] }] }));
  assert.deepEqual(stored, { hide: ['cur', 'edu'], questions: [
    { id: 'a1', label: 'Bike?', type: 'yesno', required: true, options: [] },
    { id: 'b2', label: 'Area', type: 'choice', required: false, options: ['North', 'South'] }] });
  assert.deepEqual(plain(app.formToStore({ hide: ['resume'], questions: [] })), { hide: ['resume'] });
});

test('what is wrong with a draft is said in words, and a good one passes', () => {
  const p = (questions, hide = []) => app.formProblem({ hide, questions });
  assert.equal(p([]), '');
  assert.equal(p([Q('Bike?', 'yesno'), Q('Area', 'choice', { options: ['N', 'S'] })]), '');
  assert.equal(p([Q('')]), 'Question 1 has no text');
  assert.equal(p([Q('ok'), Q('   ')]), 'Question 2 has no text');
  assert.equal(p([Q('x'.repeat(201))]), 'Question 1 is too long (at most 200 characters)');
  assert.match(p([Q('Same'), Q('same')]), /asked twice/);
  assert.match(p([Q('Area', 'choice', { options: ['only'] })]), /needs at least two options/);
  assert.match(p([Q('Area', 'choice', { options: ['', ' '] })]), /needs at least two options/);
  assert.match(p([Q('Area', 'choice', { options: Array.from({ length: 11 }, (_, i) => 'o' + i) })]), /too many options/);
  assert.match(p([Q('Area', 'choice', { options: ['a', 'A'] })]), /same option twice/);
  assert.match(p(Array.from({ length: 16 }, (_, i) => Q('Question ' + i))), /at most 15/);
  assert.equal(p(Array.from({ length: 15 }, (_, i) => Q('Question ' + i))), '');
});

test('a new question has a fresh id the database accepts, and a blank text', () => {
  const have = [];
  for (let i = 0; i < 200; i++) { const q = app.newQuestion(have); assert.match(q.id, /^[a-z0-9]{1,12}$/); assert.ok(!have.some((x) => x.id === q.id)); assert.deepEqual(plain({ l: q.label, t: q.type, r: q.required, o: q.options }), { l: '', t: 'text', r: false, o: [] }); have.push(q); }
});

test('a form is summed up in a line for a list', () => {
  assert.equal(app.formSummary({ form: { hide: ['cur', 'expected'] } }), '2 usual questions off');
  assert.equal(app.formSummary({ form: { hide: ['cur'], questions: [Q('a')] } }), '1 usual question off, 1 of your own');
  assert.equal(app.formSummary({ form: { questions: [Q('a'), Q('b')] } }), '2 of your own');
});

test('every usual question that can be switched off is one the careers page knows', () => {
  assert.deepEqual(plain(app.FORM_FIELDS.map((f) => f.key)), ['location', 'exp', 'notice', 'cur', 'expected', 'edu', 'skills', 'resume']);
  assert.deepEqual(plain(app.FORM_TYPES.map((t) => t[0])), ['text', 'long', 'number', 'yesno', 'choice']);
});

test('an opening\'s form goes to the database and comes back; an opening without one stays as it was', () => {
  const P = app.makePeople([]);
  const o = { id: 'OP-1', title: 'T', mode: 'Remote', type: 'Full-time', status: 'Open', opened: '2026-01-01', priority: 'P3' };
  assert.deepEqual(plain(app.TO_ROW.opening(o, P).openings.form), {}, 'no form is stored as an empty one');
  const form = { hide: ['cur'], questions: [{ id: 'a1', label: 'Bike?', type: 'yesno', required: true, options: [] }] };
  assert.deepEqual(plain(app.TO_ROW.opening({ ...o, form }, P).openings.form), form);
  const row = { id: 'OP-1', title: 'T', dept: '', positions: 1, location: '', mode: 'Remote', type: 'Full-time', exp_min: 0, exp_max: 0, sal_min: 0, sal_max: 0, education: '', mandatory: [], preferred: [],
    description: '', responsibilities: '', requirements: '', recruiter_id: null, manager_id: null, opened_on: '2026-01-01', target_on: null, priority: 'P3', status: 'Open' };
  assert.equal('form' in app.FROM_ROW.opening({ ...row, form: {} }, P), false, 'an empty form does not appear on the record');
  assert.deepEqual(plain(app.FROM_ROW.opening({ ...row, form }, P).form), form);
});
