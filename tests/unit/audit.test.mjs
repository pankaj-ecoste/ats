import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

function load(result) {
  const ops = [];
  const api = new Proxy({}, { get: (_, k) => k === 'then' ? (res) => res(result) : (...a) => { ops.push([k, ...a]); return api; } });
  const fake = { from: (t) => { ops.push(['from', t]); return api; } };
  const app = loadApp({ until: 'services', globals: { fake }, after: 'sb = fake', expose: ['listAudit', 'auditSummary'] });
  return { app, ops };
}

test('the audit log is read newest first with the chosen filters and limit', async () => {
  const { app, ops } = load({ data: [{ id: 2 }], error: null });
  const rows = await app.listAudit({ table: 'candidates', op: 'UPDATE', rowId: 'C-%2', limit: 50 });
  assert.deepEqual(rows, [{ id: 2 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(ops.find((o) => o[0] === 'order'))), ['order', 'id', { ascending: false }]);
  assert.deepEqual(ops.find((o) => o[0] === 'limit'), ['limit', 50]);
  assert.deepEqual(ops.find((o) => o[0] === 'eq' && o[1] === 'table_name'), ['eq', 'table_name', 'candidates']);
  assert.deepEqual(ops.find((o) => o[0] === 'ilike'), ['ilike', 'row_id', '%C-2%']);
});

test('a refused read becomes a sentence', async () => {
  const { app } = load({ data: null, error: { message: 'Failed to fetch' } });
  await assert.rejects(app.listAudit(), /Cannot reach the server/);
});

test('the summary shows each changed field, and says so for creates and deletes', () => {
  const { app } = load({ data: [], error: null });
  assert.equal(app.auditSummary({ op: 'INSERT' }), 'Created');
  assert.equal(app.auditSummary({ op: 'DELETE' }), 'Deleted');
  assert.equal(app.auditSummary({ op: 'UPDATE', old_data: { phone: '' }, new_data: { phone: '99999', stage: 'Offer' } }), 'phone: blank → 99999; stage: blank → Offer');
});
