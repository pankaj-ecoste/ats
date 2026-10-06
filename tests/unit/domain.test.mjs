import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const app = loadApp({ expose: ['S', 'STAGES', 'match', 'matchA', 'parseResume', 'autoSplit', 'getC', 'getOp'] });

test('seed data is internally consistent', () => {
  const { S, getC, getOp, STAGES } = app;
  assert.ok(S.openings.length > 0 && S.candidates.length > 0 && S.applications.length > 0);
  for (const a of S.applications) {
    assert.ok(getC(a.cid), `application ${a.id} points at a missing candidate`);
    assert.ok(getOp(a.opId), `application ${a.id} points at a missing opening`);
    assert.ok([...STAGES, 'Rejected', 'On Hold'].includes(a.stage), `unknown stage ${a.stage}`);
  }
});

test('match score is a whole number from 0 to 100 for every application', () => {
  for (const a of app.S.applications) {
    const { score } = app.matchA(a);
    assert.ok(Number.isInteger(score) && score >= 0 && score <= 100, `score ${score} for ${a.id}`);
  }
});

test('salary components always add up to the CTC', () => {
  for (const ctc of [300000, 1234567, 2500000, 999999]) {
    const b = app.autoSplit(ctc);
    assert.equal(Object.values(b).reduce((s, v) => s + v, 0), ctc);
  }
});

test('resume parser pulls contact details out of plain text', () => {
  const r = app.parseResume('Asha Verma\nSenior Java Developer\nasha.verma@example.com | +91 98765 43210\nBengaluru\nSkills: Java, Spring Boot, SQL');
  assert.equal(r.email, 'asha.verma@example.com');
  assert.match(r.phone, /98765/);
  assert.ok(r.skills.includes('Java'));
});
