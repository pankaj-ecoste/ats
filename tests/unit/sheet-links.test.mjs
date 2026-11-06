import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const plain = (x) => JSON.parse(JSON.stringify(x));
// a fake Supabase client: rpc answers with `rpc`, table reads answer with `rows`
function load({ rpc = { data: null, error: null }, rows = { data: [], error: null } } = {}) {
  const ops = [];
  const table = new Proxy({}, { get: (_, k) => (k === 'then' ? (res) => res(rows) : (...a) => { ops.push([k, ...a]); return table; }) });
  const fake = { rpc: async (name, args) => { ops.push(['rpc', name, args]); return rpc; }, from: (t) => { ops.push(['from', t]); return table; } };
  const app = loadApp({ until: 'services', globals: { fake }, after: 'sb = fake',
    expose: ['leadFeedStatus', 'leadFeedConnect', 'leadFeedBatches', 'leadFeedScriptFor', 'APP_SETTINGS', 'sheetTabs', 'sheetLinks', 'sheetLinkSave', 'sheetLinkUpdate', 'sheetLinkRemove',
      'guessLink', 'linkProblem', 'newHeadings', 'missingHeadings', 'isNoiseHeading', 'LINK_FIELDS'] });
  return { app, ops };
}

/* ---------- the connection (Settings) ---------- */
test('the connection status comes back in plain fields, with times as numbers', async () => {
  const { app, ops } = load({ rpc: { data: { set_up: true, enabled: true, token_made_at: '2026-10-24T09:30:00Z', last_received_at: null, tabs_seen: 46, last_seen_at: '2026-10-24T10:00:00Z' }, error: null } });
  assert.deepEqual(plain(await app.leadFeedStatus()), { setUp: true, enabled: true, tokenMadeAt: Date.parse('2026-10-24T09:30:00Z'), lastReceivedAt: null, tabsSeen: 46, lastSeenAt: Date.parse('2026-10-24T10:00:00Z') });
  assert.deepEqual(ops[0].slice(0, 2), ['rpc', 'lead_feed_status']);
});

test('nothing set up yet reads as off', async () => {
  const { app } = load({ rpc: { data: { set_up: false, enabled: false }, error: null } });
  assert.deepEqual(plain(await app.leadFeedStatus()), { setUp: false, enabled: false, tokenMadeAt: null, lastReceivedAt: null, tabsSeen: 0, lastSeenAt: null });
});

test('switching the connection sends the switch and returns the token only when a new one was made', async () => {
  const a = load({ rpc: { data: { token: 'abc123' }, error: null } });
  assert.equal(await a.app.leadFeedConnect({ enabled: true, newToken: true }), 'abc123');
  assert.deepEqual(plain(a.ops[0]), ['rpc', 'lead_feed_connect', { p_enabled: true, p_new_token: true }]);
  const b = load({ rpc: { data: { token: null }, error: null } });
  assert.equal(await b.app.leadFeedConnect({ enabled: false }), null);
  assert.deepEqual(plain(b.ops[0])[2], { p_enabled: false, p_new_token: false });
});

test('a refusal reaches the admin in its own words', async () => {
  const { app } = load({ rpc: { data: null, error: { message: 'Only an admin can change the lead sheet settings' } } });
  await assert.rejects(app.leadFeedConnect({ enabled: true }), /Only an admin can change the lead sheet settings/);
  await assert.rejects(app.leadFeedStatus(), /Only an admin/);
  const net = load({ rpc: { data: null, error: { message: 'Failed to fetch' } } });
  await assert.rejects(net.app.leadFeedConnect({ enabled: true }), /Cannot reach the server/);
});

test('the recent batches are the workbook own, newest first, as plain fields', async () => {
  const { app, ops } = load({ rows: { data: [{ received_at: '2026-10-24T10:00:00Z', rows_read: 4, rows_added: 2, rows_skipped: 2, error: null, detail: { added: 2, duplicates: 1, skipped: 1, tab: 'CRM Delhi', opening: 'CRM' } },
    { received_at: '2026-10-24T09:00:00Z', rows_read: 0, rows_added: 0, rows_skipped: 0, error: 'Refused: the token is wrong', detail: null }], error: null } });
  const b = plain(await app.leadFeedBatches(5));
  assert.equal(b[0].read, 4);
  assert.equal(b[0].detail.tab, 'CRM Delhi');
  assert.equal(b[1].error, 'Refused: the token is wrong');
  assert.deepEqual(b[1].detail, {});
  assert.deepEqual(plain(ops.find((o) => o[0] === 'eq')), ['eq', 'source', 'sheet']);
  assert.deepEqual(plain(ops.find((o) => o[0] === 'limit')), ['limit', 5]);
});

test('the script for the workbook carries this app address and public key, and the token', () => {
  const { app } = load();
  const s = app.leadFeedScriptFor('t'.repeat(64));
  assert.ok(s.includes(JSON.stringify(app.APP_SETTINGS.supabaseUrl || '')));
  assert.ok(s.includes('var APP_TOKEN = "' + 't'.repeat(64) + '"'));
});

/* ---------- tabs and links ---------- */
test('the tabs seen lately come back by name, with their headings', async () => {
  const { app, ops } = load({ rows: { data: [{ tab_key: 'B/1', tab_name: 'CRM Delhi', headings: ['Name', 'Phone'], seen_at: '2026-11-05T10:00:00Z' }], error: null } });
  assert.deepEqual(plain(await app.sheetTabs()), [{ key: 'B/1', name: 'CRM Delhi', headings: ['Name', 'Phone'], seenAt: Date.parse('2026-11-05T10:00:00Z') }]);
  assert.deepEqual(plain(ops[0]), ['from', 'sheet_tabs']);
  assert.equal(plain(ops.find((o) => o[0] === 'gte'))[1], 'seen_at');
  assert.deepEqual(plain(ops.find((o) => o[0] === 'order')), ['order', 'tab_name']);
});

test('the links come back as plain records', async () => {
  const { app } = load({ rows: { data: [{ id: 'L1', opening_id: 'OP-1', tab_key: 'B/1', tab_name: 'CRM Delhi', source: 'Naukri', map: { name: 'Name' }, extra: ['Q'], known: ['Name', 'Q'], enabled: true, last_received_at: null }], error: null } });
  assert.deepEqual(plain(await app.sheetLinks()), [{ id: 'L1', opening: 'OP-1', tabKey: 'B/1', tabName: 'CRM Delhi', source: 'Naukri', map: { name: 'Name' }, extra: ['Q'], known: ['Name', 'Q'], enabled: true, lastReceivedAt: null }]);
});

test('linking, changing and unlinking call the database functions with the right names', async () => {
  const a = load({ rpc: { data: 'uuid-1', error: null } });
  assert.equal(await a.app.sheetLinkSave({ opening: 'OP-1', tabKey: 'B/1', source: 'Naukri', map: { name: 'Name' }, extra: ['Q'] }), 'uuid-1');
  assert.deepEqual(plain(a.ops[0]), ['rpc', 'sheet_link_save', { p_opening: 'OP-1', p_tab_key: 'B/1', p_source: 'Naukri', p_map: { name: 'Name' }, p_extra: ['Q'] }]);
  await a.app.sheetLinkUpdate({ id: 'uuid-1', source: 'X', map: { name: 'N' }, extra: [], enabled: false });
  assert.deepEqual(plain(a.ops[1]), ['rpc', 'sheet_link_update', { p_id: 'uuid-1', p_source: 'X', p_map: { name: 'N' }, p_extra: [], p_enabled: false }]);
  await a.app.sheetLinkRemove('uuid-1');
  assert.deepEqual(plain(a.ops[2]), ['rpc', 'sheet_link_remove', { p_id: 'uuid-1' }]);
});

test('a database refusal reaches the person in its own words', async () => {
  const { app } = load({ rpc: { data: null, error: { message: 'This tab is already linked to "Feed role". One tab can belong to one opening only' } } });
  await assert.rejects(app.sheetLinkSave({ opening: 'OP-2', tabKey: 'B/1', source: 'x', map: {}, extra: [] }), /already linked to "Feed role"/);
  await assert.rejects(app.sheetLinkRemove('x'), /already linked/);
});

/* ---------- guessing and checking the columns ---------- */
test('the first guess uses the usual headings and keeps the other columns as answers, but not the platform own', () => {
  const { app } = load();
  const g = plain(app.guessLink(['created_time', 'ad_id', 'form_name', 'Full Name', 'Mobile Number', 'Email ID', 'City', 'Do you have a bike?', 'Years in sales', 'platform', 'Synced to ATS', '']));
  assert.deepEqual(g.map, { name: 'Full Name', phone: 'Mobile Number', email: 'Email ID', location: 'City' });
  assert.deepEqual(g.extra, ['Do you have a bike?', 'Years in sales']);
});

test('a campaign or source column is an answer, not a field: the source is chosen when linking', () => {
  const { app } = load();
  const g = plain(app.guessLink(['Name', 'Phone', 'Campaign', 'Source']));
  assert.equal('source' in g.map, false);
  assert.deepEqual(g.extra, ['Campaign', 'Source']);
  assert.ok(!app.LINK_FIELDS.some((f) => f.key === 'source'));
});

test('platform bookkeeping headings are recognised', () => {
  const { app } = load();
  for (const h of ['id', 'Lead ID', 'ad_id', 'adset_name', 'campaign_name', 'form_id', 'platform', 'is_organic', 'created_time', 'lead_status']) assert.equal(app.isNoiseHeading(h), true, h);
  for (const h of ['Name', 'Do you have a bike?', 'City', 'Budget']) assert.equal(app.isNoiseHeading(h), false, h);
});

test('what is wrong with the chosen columns is said in words', () => {
  const { app } = load();
  assert.equal(app.linkProblem({ phone: 'P' }), 'Choose the Name column');
  assert.equal(app.linkProblem({ name: 'N' }), 'Choose the Phone column or the Email column');
  assert.equal(app.linkProblem({ name: 'N', phone: 'P' }), '');
  assert.equal(app.linkProblem({ name: 'N', email: 'E' }), '');
  assert.equal(app.linkProblem({ name: 'N', phone: 'N' }), 'The column "N" is chosen for two fields');
});

test('new and missing columns are told apart', () => {
  const { app } = load();
  const link = { known: ['Name', 'Phone', 'Q1'], map: { name: 'Name', phone: 'Phone' }, extra: ['Q1'] };
  assert.deepEqual(plain(app.newHeadings(link, ['Name', 'Phone', 'Q1', 'Budget', 'Synced to ATS'])), ['Budget']);
  assert.deepEqual(plain(app.missingHeadings(link, ['Name', 'Q1'])), ['Phone']);
  assert.deepEqual(plain(app.missingHeadings(link, ['Name', 'Phone', 'Q1'])), []);
});

test('a call status column is guessed from the heading, and lead_status is not mistaken for it', () => {
  const { app } = load();
  const g = (hs) => plain(app.guessLink(hs));
  assert.equal(g(['Full Name', 'Mobile', 'Call staus ', 'lead_status']).map.callStatus, 'Call staus ');
  assert.equal(g(['Full Name', 'Mobile', 'Call Status']).map.callStatus, 'Call Status');
  assert.equal(g(['Full Name', 'Mobile', 'lead_status', 'Remark']).map.callStatus, undefined);
  assert.ok(app.LINK_FIELDS.some((f) => f.key === 'callStatus'));
  assert.equal(app.linkProblem({ name: 'A', phone: 'B', callStatus: 'B' }), 'The column "B" is chosen for two fields');
});
