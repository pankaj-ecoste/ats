import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const plain = (x) => JSON.parse(JSON.stringify(x));
// a fake Supabase client: rpc answers with `rpc`, table reads answer with `rows`
function load({ rpc = { data: null, error: null }, rows = { data: [], error: null } } = {}) {
  const ops = [];
  const table = new Proxy({}, { get: (_, k) => (k === 'then' ? (res) => res(rows) : (...a) => { ops.push([k, ...a]); return table; }) });
  const fake = { rpc: async (name, args) => { ops.push(['rpc', name, args]); return rpc; }, from: (t) => { ops.push(['from', t]); return table; } };
  const app = loadApp({ until: 'services', globals: { fake }, after: 'sb = fake', expose: ['leadFeedStatus', 'leadFeedSave', 'leadFeedBatches', 'leadFeedScriptFor', 'APP_SETTINGS'] });
  return { app, ops };
}

test('the settings come back in plain fields, with times as numbers', async () => {
  const { app, ops } = load({ rpc: { data: { set_up: true, enabled: true, opening: 'OP-1', source: 'Facebook Ad', token_made_at: '2026-10-24T09:30:00Z', last_received_at: null }, error: null } });
  const s = plain(await app.leadFeedStatus());
  assert.deepEqual(s, { setUp: true, enabled: true, opening: 'OP-1', source: 'Facebook Ad', tokenMadeAt: Date.parse('2026-10-24T09:30:00Z'), lastReceivedAt: null });
  assert.deepEqual(ops[0].slice(0, 2), ['rpc', 'lead_feed_status']);
});

test('nothing set up yet reads as off with the default source', async () => {
  const { app } = load({ rpc: { data: { set_up: false, enabled: false, opening: null, source: null }, error: null } });
  assert.deepEqual(plain(await app.leadFeedStatus()), { setUp: false, enabled: false, opening: '', source: 'Ad campaign', tokenMadeAt: null, lastReceivedAt: null });
});

test('saving sends the settings and returns the token only when a new one was made', async () => {
  const a = load({ rpc: { data: { token: 'abc123' }, error: null } });
  assert.equal(await a.app.leadFeedSave({ opening: 'OP-1', source: 'Ad', enabled: true, newToken: true }), 'abc123');
  assert.deepEqual(plain(a.ops[0]), ['rpc', 'lead_feed_save', { p_opening: 'OP-1', p_source: 'Ad', p_enabled: true, p_new_token: true }]);
  const b = load({ rpc: { data: { token: null }, error: null } });
  assert.equal(await b.app.leadFeedSave({ opening: 'OP-1', source: 'Ad', enabled: false }), null);
  assert.deepEqual(plain(b.ops[0])[2], { p_opening: 'OP-1', p_source: 'Ad', p_enabled: false, p_new_token: false });
});

test('a refusal reaches the admin in its own words', async () => {
  const { app } = load({ rpc: { data: null, error: { message: 'Only an admin can change the lead sheet settings' } } });
  await assert.rejects(app.leadFeedSave({ opening: 'OP-1', enabled: true }), /Only an admin can change the lead sheet settings/);
  await assert.rejects(app.leadFeedStatus(), /Only an admin/);
  const net = load({ rpc: { data: null, error: { message: 'Failed to fetch' } } });
  await assert.rejects(net.app.leadFeedSave({ opening: 'OP-1' }), /Cannot reach the server/);
});

test('the recent batches are the sheet\'s own, newest first, as plain fields', async () => {
  const { app, ops } = load({ rows: { data: [{ received_at: '2026-10-24T10:00:00Z', rows_read: 4, rows_added: 2, rows_skipped: 2, error: null, detail: { added: 2, duplicates: 1, skipped: 1 } },
    { received_at: '2026-10-24T09:00:00Z', rows_read: 0, rows_added: 0, rows_skipped: 0, error: 'Refused: the token is wrong', detail: null }], error: null } });
  const b = plain(await app.leadFeedBatches(5));
  assert.equal(b[0].read, 4);
  assert.deepEqual(b[0].detail, { added: 2, duplicates: 1, skipped: 1 });
  assert.equal(b[1].error, 'Refused: the token is wrong');
  assert.deepEqual(b[1].detail, {});
  assert.deepEqual(plain(ops.find((o) => o[0] === 'eq')), ['eq', 'source', 'sheet']);
  assert.deepEqual(plain(ops.find((o) => o[0] === 'order')), ['order', 'received_at', { ascending: false }]);
  assert.deepEqual(plain(ops.find((o) => o[0] === 'limit')), ['limit', 5]);
});

test('the script for the sheet carries this app\'s own address and public key, and the token', () => {
  const { app } = load();
  const s = app.leadFeedScriptFor('t'.repeat(64));
  assert.ok(s.includes(JSON.stringify(app.APP_SETTINGS.supabaseUrl || '')));
  assert.ok(s.includes('var APP_TOKEN = "' + 't'.repeat(64) + '"'));
});
