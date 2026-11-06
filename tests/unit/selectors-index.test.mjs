// The lookups by id are indexed (a plain search made every page slower with the square of the list). The index must never show anything
// but the truth: these tests change the data in every way the app does and ask again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const app = loadApp({
  until: 'services',
  expose: ['getC', 'getA', 'getOp', 'appsOfC', 'appsOfOp', 'repo', 'setS', 'getS'],
  after: 'var setS=(s)=>{S=s}; var getS=()=>S',
});
const cand = (id) => ({ id, name: 'N-' + id });
const appl = (id, cid, opId) => ({ id, cid, opId, stage: 'New' });
function fresh() {
  app.setS({
    candidates: ['C1', 'C2', 'C3'].map(cand),
    applications: [appl('A1', 'C1', 'O1'), appl('A2', 'C1', 'O2'), appl('A3', 'C2', 'O1')],
    openings: [{ id: 'O1' }, { id: 'O2' }],
    settings: {}, activity: [],
  });
}

test('a lookup finds the record, and nothing for an id that is not there', () => {
  fresh();
  assert.equal(app.getC('C2').name, 'N-C2');
  assert.equal(app.getA('A3').cid, 'C2');
  assert.equal(app.getOp('O2').id, 'O2');
  assert.equal(app.getC('nope'), undefined);
  assert.equal(app.getC(undefined), undefined);
});

test('applications of a person or of an opening come back in list order', () => {
  fresh();
  assert.equal(app.appsOfC('C1').map((a) => a.id).join(), 'A1,A2');
  assert.equal(app.appsOfOp('O1').map((a) => a.id).join(), 'A1,A3');
  assert.equal(app.appsOfC('C3').length, 0);
});

test('the list handed back is a copy: sorting it does not reorder the data', () => {
  fresh();
  app.appsOfC('C1').sort((a, b) => b.id.localeCompare(a.id)).reverse();
  assert.equal(app.getS().applications.map((a) => a.id).join(), 'A1,A2,A3');
  const l = app.appsOfC('C1'); l.length = 0;
  assert.equal(app.appsOfC('C1').length, 2, 'emptying the copy does not empty the index');
});

test('every change made through repo shows at once', () => {
  fresh();
  assert.equal(app.appsOfC('C3').length, 0);                       // warm the index
  app.repo.insert('applications', appl('A4', 'C3', 'O2'));
  assert.equal(app.appsOfC('C3').map((a) => a.id).join(), 'A4');
  assert.equal(app.getA('A4').opId, 'O2');
  app.repo.update('applications', 'A4', (a) => { a.cid = 'C2'; });  // an application moved to another person
  assert.equal(app.appsOfC('C3').length, 0);
  assert.equal(app.appsOfC('C2').map((a) => a.id).sort().join(), 'A3,A4');
  app.repo.remove('applications', 'A3');
  assert.equal(app.getA('A3'), undefined);
  assert.equal(app.appsOfC('C2').map((a) => a.id).join(), 'A4');
  app.repo.insertMany('candidates', [cand('C8'), cand('C9')]);
  assert.equal(app.getC('C9').name, 'N-C9');
  app.repo.remove('candidates', 'C1'); app.repo.insert('candidates', cand('C1b'));   // same length as before, different member
  assert.equal(app.getC('C1'), undefined);
  assert.equal(app.getC('C1b').id, 'C1b');
});

test('replacing all the data (a refresh from the server, a reset) is seen at once', () => {
  fresh();
  assert.equal(app.getC('C1').id, 'C1');
  app.setS({ candidates: [cand('X1')], applications: [appl('Z1', 'X1', 'O9')], openings: [], settings: {}, activity: [] });
  assert.equal(app.getC('C1'), undefined);
  assert.equal(app.getC('X1').id, 'X1');
  assert.equal(app.appsOfC('X1').length, 1);
  assert.equal(app.appsOfOp('O1').length, 0);
});

test('with the same id twice, the first record wins, as a plain search would', () => {
  fresh();
  app.getS().candidates.push({ id: 'C2', name: 'the other C2' });
  app.repo.insert('tasks', { id: 'T1' });                           // any change drops the index
  assert.equal(app.getC('C2').name, 'N-C2');
});

test('a record changed in place by the data layer is still found by its id (a stale index would be caught)', () => {
  fresh();
  app.getC('C1');                                                    // warm
  const list = app.getS().candidates;
  list[0] = cand('C1z');                                             // replaced behind repo's back, same length
  assert.equal(app.getC('C1z').id, 'C1z', 'a miss falls back to a plain search');
  assert.equal(app.getC('C1'), undefined, 'a hit is checked against the record, so the old one is not returned');
});
