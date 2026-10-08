import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const plain = (x) => JSON.parse(JSON.stringify(x));
const fresh = () => loadApp({
  until: 'services',
  expose: ['S', 'repo', 'updateSetting', 'updateMatchWeight', 'setMatchThreshold', 'resetMatchWeights', 'saveSla', 'resetDemoData', 'saveOpening', 'getOp',
    'DEFAULT_SETTINGS', 'recordSocialShare', 'savePosting', 'deletePosting', 'savePostingSettings', 'removeBoard', 'resetBoards', 'saveBoards', 'SOURCES', 'today'],
});

test('settings: a field, a weight and the threshold can each be changed', () => {
  const app = fresh();
  app.updateSetting('company', 'Ecoste');
  app.updateMatchWeight('skills', 55);
  app.setMatchThreshold(70);
  assert.deepEqual(plain([app.S.settings.company, app.S.settings.weights.skills, app.S.settings.threshold]), ['Ecoste', 55, 70]);
});

test('resetMatchWeights restores the default weights and a threshold of 65', () => {
  const app = fresh();
  app.updateMatchWeight('skills', 5);
  app.setMatchThreshold(10);
  app.resetMatchWeights();
  assert.deepEqual(plain(app.S.settings.weights), plain(app.DEFAULT_SETTINGS.weights));
  assert.equal(app.S.settings.threshold, 65);
});

test('saveSla stores a copy of the rules', () => {
  const app = fresh();
  const rules = { New: 2 };
  app.saveSla(rules);
  rules.New = 99;
  assert.deepEqual(plain(app.S.settings.sla), { New: 2 });
});

test('resetDemoData replaces the whole state with the sample data', () => {
  const app = fresh();
  app.saveOpening({ id: 'OP-GONE', title: 'Temporary', status: 'Open' });
  assert.ok(app.getOp('OP-GONE'));
  app.resetDemoData();
  assert.equal(app.getOp('OP-GONE'), undefined);
  assert.ok(app.getOp('OP-1001'));
});

test('postings: share, save new, save edit, delete', () => {
  const app = fresh();
  const op = app.S.openings[0], board = { id: 'linkedin', name: 'LinkedIn' };
  const n = app.S.postings.length, logs = app.S.activity.length;
  app.recordSocialShare(op, board);
  assert.equal(app.S.postings.length, n + 1);
  assert.deepEqual(plain([app.S.postings.at(-1).status, app.S.postings.at(-1).postedOn]), ['Posted', app.today()]);
  const rec = { id: 'PST-T', opId: op.id, board: 'naukri', url: '', postedOn: '2026-01-01', expires: '2026-02-01', status: 'Posted', cost: 100 };
  app.savePosting(rec, op, { id: 'naukri', name: 'Naukri' });
  assert.equal(app.S.postings.length, n + 2);
  app.savePosting({ ...rec, status: 'Paused', cost: 250 }, op, { id: 'naukri', name: 'Naukri' });
  assert.equal(app.S.postings.length, n + 2, 'same id updates in place');
  assert.deepEqual(plain([app.S.postings.at(-1).status, app.S.postings.at(-1).cost]), ['Paused', 250]);
  assert.match(app.S.activity[0].text, /paused on Naukri/);
  assert.equal(app.S.activity.length, logs + 3);
  assert.equal(app.deletePosting('PST-T'), true);
  assert.equal(app.S.postings.length, n + 1);
});

test('posting settings are merged into the stored settings', () => {
  const app = fresh();
  app.repo.root('postCfg', { formUrl: '', applyEmail: '', applyLink: '', showSalary: true, about: '', hashtags: '#hiring' });
  app.savePostingSettings({ formUrl: 'https://forms.example/x', showSalary: false });
  assert.deepEqual(plain([app.S.postCfg.formUrl, app.S.postCfg.showSalary, app.S.postCfg.hashtags]), ['https://forms.example/x', false, '#hiring']);
});

test('boards: edit urls and sources, add a site before the social ones, remove, restore', () => {
  const app = fresh();
  app.repo.root('boards', [
    { id: 'a', name: 'A', type: 'board', url: 'u1', src: 'A' },
    { id: 'b', name: 'B', type: 'social', url: 'u2', src: 'B' },
  ]);
  app.saveBoards({ urls: [[0, 'new-url']], srcs: [[0, ''], [1, 'Bee']], added: { id: 'c', name: 'WorkIndia', type: 'board', src: 'WorkIndia', url: '' } });
  assert.deepEqual(plain(app.S.boards.map((b) => b.id)), ['a', 'c', 'b']);
  assert.deepEqual(plain([app.S.boards[0].url, app.S.boards[0].src, app.S.boards[2].src]), ['new-url', 'A', 'Bee']);
  assert.ok(app.SOURCES.includes('WorkIndia'));
  app.removeBoard(1);
  assert.deepEqual(plain(app.S.boards.map((b) => b.id)), ['a', 'b']);
  app.resetBoards([{ id: 'z' }]);
  assert.deepEqual(plain(app.S.boards), [{ id: 'z' }]);
});
