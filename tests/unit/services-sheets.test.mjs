import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const plain = (x) => JSON.parse(JSON.stringify(x));
const fresh = () => loadApp({
  until: 'services',
  globals: { SheetsIO: { readDate: (v) => (v ? String(v) : null) } },
  expose: ['S', 'repo', 'importSheetRows', 'markSheetRowsSeen', 'saveAutoSyncConfig', 'recordSheetConnected', 'recordSyncRun', 'recordSyncFailure',
    'setAutoSyncEnabled', 'disconnectAutoSync', 'applyWorkbookImport', 'logSheetEvent', 'getA', 'appsOfC', 'today', 'h36', 'toLPA', 'toNotice', 'numIn'],
});
const baseCfg = () => ({ fileId: 'f', url: '', title: '', tab: 'T', map: {}, defaultOp: '', interval: 5, enabled: true, seen: [], lastRun: null, last: null, log: [] });
const newRow = (op, over = {}) => ({
  status: 'new', key: 'k1', op,
  r: { name: ' Asha Rao ', email: 'asha@example.com', phone: '98765 43210', skills: 'Java, SQL; Kafka', exp: '4 years', curSal: '10 LPA', expSal: '15', notice: '1 month', source: 'Naukri', date: '2026-10-01', position: 'x', ...over },
});

test('sheet values: salary, notice and number reading', () => {
  const app = fresh();
  assert.equal(app.toLPA('10 LPA'), 10);
  assert.equal(app.toLPA('50000 per month'), 6);
  assert.equal(app.toLPA(''), 0);
  assert.equal(app.toNotice('1 month'), 30);
  assert.equal(app.toNotice('2 weeks'), 14);
  assert.equal(app.toNotice('immediate'), 0);
  assert.equal(app.toNotice(''), 30);
  assert.equal(app.numIn('about 4.5 yrs'), 4.5);
  assert.equal(app.h36('same'), app.h36('same'));
  assert.notEqual(app.h36('a'), app.h36('b'));
});

test('importSheetRows adds a candidate and an application from a new row and remembers the row', () => {
  const app = fresh();
  app.repo.root('autoSync', baseCfg());
  const op = app.S.openings[0];
  const [nc, na, logs] = [app.S.candidates.length, app.S.applications.length, app.S.activity.length];
  const res = app.importSheetRows([newRow(op)]);
  assert.deepEqual(plain(res), { added: 1, names: ['Asha Rao'] });
  const c = app.S.candidates[0];
  assert.match(c.id, /^C-G/);
  assert.deepEqual(plain([c.name, c.exp, c.curSal, c.expSal, c.notice, c.source, c.skills]), ['Asha Rao', 4, 10, 15, 30, 'Naukri', ['Java', 'SQL', 'Kafka']]);
  assert.equal(c.documents[0].status, 'Pending');
  const a = app.S.applications[0];
  assert.match(a.id, /^APP-G/);
  assert.deepEqual(plain([a.cid, a.opId, a.stage, a.date, a.recruiter]), [c.id, op.id, 'New', '2026-10-01', op.recruiter]);
  assert.deepEqual([app.S.candidates.length, app.S.applications.length, app.S.activity.length], [nc + 1, na + 1, logs + 1]);
  assert.match(app.S.activity[0].text, /Asha Rao applied for .* \(Google Sheet\)/);
  assert.deepEqual(plain(app.S.autoSync.seen), ['k1']);
});

test('importSheetRows reuses an existing candidate and only remembers duplicates', () => {
  const app = fresh();
  app.repo.root('autoSync', baseCfg());
  const op = app.S.openings[0], ex = app.S.candidates[0];
  const nc = app.S.candidates.length;
  app.importSheetRows([{ ...newRow(op, { name: ex.name }), key: 'k2', ex }, { status: 'dup', key: 'k3' }, { status: 'skip', key: 'k4' }, { status: 'seen', key: 'k5' }]);
  assert.equal(app.S.candidates.length, nc, 'no new candidate');
  assert.equal(app.appsOfC(ex.id).filter((x) => x.id.startsWith('APP-G')).length, 1);
  assert.deepEqual(plain(app.S.autoSync.seen), ['k2', 'k3']);
});

test('importSheetRows gives a new id when the hash is already taken', () => {
  const app = fresh();
  app.repo.root('autoSync', baseCfg());
  const op = app.S.openings[0];
  app.importSheetRows([newRow(op)]);
  app.importSheetRows([{ ...newRow(op, { phone: '' }), key: 'k1' }]);
  const ids = app.S.applications.filter((a) => a.id.startsWith('APP-G')).map((a) => a.id);
  assert.equal(new Set(ids).size, 2);
});

test('auto-import config: save, reset seen, run results, failures, enable, disconnect', () => {
  const app = fresh();
  app.repo.root('autoSync', { ...baseCfg(), seen: ['old'] });
  app.saveAutoSyncConfig({ fileId: 'g', tab: 'Sheet1', enabled: true }, { resetSeen: true });
  assert.deepEqual(plain([app.S.autoSync.fileId, app.S.autoSync.seen]), ['g', []]);
  app.markSheetRowsSeen(['a', 'b']);
  assert.deepEqual(plain(app.S.autoSync.seen), ['a', 'b']);
  app.recordSheetConnected({ title: 'Leads', tab: 'Sheet1', read: 5, added: 3 });
  assert.match(app.S.autoSync.log[0].text, /Connected .Leads. \(Sheet1\); imported 3/);
  app.recordSyncRun({ title: 'Leads 2', read: 9, added: 2, skipped: 1, dup: 4 });
  assert.deepEqual(plain([app.S.autoSync.title, app.S.autoSync.last]), ['Leads 2', { read: 9, added: 2, skipped: 1, dup: 4 }]);
  for (let i = 0; i < 30; i++) app.recordSyncRun({ read: i, added: 0, skipped: 0, dup: 0 });
  assert.equal(app.S.autoSync.log.length, 20);
  app.recordSyncFailure('Google Drive connection expired', false);
  assert.equal(app.S.autoSync.enabled, true);
  app.recordSyncFailure('Needs sign-in', true);
  assert.deepEqual(plain([app.S.autoSync.enabled, app.S.autoSync.log[0].text]), [false, 'Needs sign-in']);
  app.setAutoSyncEnabled(true);
  assert.equal(app.S.autoSync.enabled, true);
  app.disconnectAutoSync();
  assert.equal(app.S.autoSync, null);
});

test('applyWorkbookImport: replace swaps whole tabs, merge keeps what the sheet lacks', () => {
  const app = fresh();
  const n = app.applyWorkbookImport({ out: { tasks: [{ id: 'T-NEW', title: 'From sheet' }] }, settings: null, mode: 'replace', fname: 'a.xlsx' });
  assert.equal(n, 1);
  assert.deepEqual(plain(app.S.tasks.map((t) => t.id)), ['T-NEW']);

  const app2 = fresh();
  const first = app2.S.tasks[0];
  const total = app2.S.tasks.length;
  app2.applyWorkbookImport({ out: { tasks: [{ id: first.id, title: 'Renamed' }, { id: 'T-NEW', title: 'Added' }] }, settings: null, mode: 'merge', fname: 'b.xlsx' });
  assert.equal(app2.S.tasks.length, total + 1);
  assert.equal(app2.S.tasks.find((t) => t.id === first.id).title, 'Renamed');
  assert.ok(app2.S.tasks.find((t) => t.id === first.id).priority, 'merge keeps fields the sheet does not carry');
});

test('applyWorkbookImport: settings ignore empty values and all-zero weights; the load is logged and notified', () => {
  const app = fresh();
  const before = plain(app.S.settings.weights);
  const [sheetLog, logs, notes] = [(app.S.sheetLog || []).length, app.S.activity.length, app.S.notifications.length];
  app.applyWorkbookImport({ out: {}, settings: { company: 'Sheet Co', signatory: '', weights: { skills: 0, experience: 0 } }, mode: 'merge', fname: 'c.xlsx' });
  assert.equal(app.S.settings.company, 'Sheet Co');
  assert.notEqual(app.S.settings.signatory, '');
  assert.deepEqual(plain(app.S.settings.weights), before);
  assert.equal(app.S.sheetLog.length, sheetLog + 1);
  assert.equal(app.S.activity.length, logs + 1);
  assert.equal(app.S.notifications.length, notes + 1);
  app.logSheetEvent('Downloaded blank template');
  assert.equal(app.S.sheetLog[0].text, 'Downloaded blank template');
});
