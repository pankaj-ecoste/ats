// The Google workbook script: run against a pretend workbook (several tabs) and a pretend app, to see what it reports, which rows it sends for the
// linked tabs only, what it writes back, and that it never sends a row twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadApp } from './load-app.mjs';

const app = loadApp({ until: 'services', expose: ['leadFeedScript'] });
const plain = (x) => JSON.parse(JSON.stringify(x));
const URL_ = 'https://abcd.supabase.co', KEY = 'anon-key-123', TOKEN = 'a'.repeat(64);
const script = () => app.leadFeedScript({ url: URL_ + '/', anonKey: KEY, token: TOKEN });

// a pretend tab (a grid of cells) with the calls the script makes on it
function tab(id, name, grid) {
  const writes = [];
  const set = (r, c, v) => { while (grid.length <= r) grid.push([]); while (grid[r].length <= c) grid[r].push(''); grid[r][c] = v; };
  const width = () => Math.max(0, ...grid.map((r) => r.length));
  const cells = (r0, c0, nr, nc) => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const row = grid[r0 + i] || []; return j + c0 < row.length ? row[j + c0] : ''; }));
  return {
    id, name, grid, writes,
    sheet: {
      getSheetId: () => id, getName: () => name, getLastRow: () => grid.length, getLastColumn: () => width(),
      getDataRange: () => ({ getValues: () => cells(0, 0, grid.length, width()) }),
      getRange: (r, c, nr, nc) => ({
        getValues: () => cells(r - 1, c - 1, nr, nc),
        setValue: (v) => { writes.push([name, r, c]); set(r - 1, c - 1, v); },
        setValues: (vs) => vs.forEach((row, i) => row.forEach((v, j) => { writes.push([name, r + i, c + j]); set(r - 1 + i, c - 1 + j, v); })),
      }),
    },
  };
}

// a pretend workbook and a pretend app. links: what the app answers to "which tabs are linked" (by tab id)
function world(tabs, { links = [], server } = {}) {
  const calls = [], triggers = [], deleted = [];
  const sent = new Map();
  const answer = server || ((fn, body) => {
    if (fn === 'sheet_sync_plan') {
      const have = new Set(body.p_tabs.map((t) => t.key));
      return { ok: true, links: links.filter((l) => have.has(l.key)) };
    }
    const seen = sent.get(body.p_tab_key) || new Set(); sent.set(body.p_tab_key, seen);
    return { ok: true, rows: body.p_rows.map((x) => {
      const k = x.phone || x.email;
      if (!x.name) return { status: 'skipped', why: 'No name' };
      if (seen.has(k)) return { status: 'duplicate', why: 'Already applied for this opening (' + x.name + ')' };
      seen.add(k); return { status: 'added', why: '' };
    }) };
  });
  const ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getId: () => 'BOOK', getName: () => 'Leads workbook', getSheets: () => tabs.map((t) => t.sheet), getSpreadsheetTimeZone: () => 'Asia/Kolkata' }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ScriptApp: {
      getProjectTriggers: () => [{ getHandlerFunction: () => 'syncLeads' }, { getHandlerFunction: () => 'other' }],
      deleteTrigger: (t) => deleted.push(t.getHandlerFunction()),
      newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (n) => ({ create: () => triggers.push([fn, n]) }) }) }),
    },
    UrlFetchApp: { fetch: (url, opts) => {
      const body = JSON.parse(opts.payload);
      const fn = url.split('/rpc/')[1];
      calls.push({ fn, url, opts, body });
      const r = answer(fn, body, calls.length);
      return { getResponseCode: () => r.code || 200, getContentText: () => (typeof r.text === 'string' ? r.text : JSON.stringify(r)) };
    } },
    Utilities: { formatDate: (d, tz, f) => (f === 'yyyy-MM-dd' ? d.toISOString().slice(0, 10) : '24 Oct 15:02') },
  });
  const run = (src) => vm.runInContext(src, ctx);
  run(script());
  return { tabs, calls, triggers, deleted, run, sync: () => run('syncLeads()'), of: (fn) => calls.filter((c) => c.fn === fn) };
}

const HEAD = ['Date', 'Full Name', 'Mobile', 'Email ID', 'Do you have a bike?', 'Years in sales', 'ad_id'];
const LINK = { key: 'BOOK/2', name: 'Sales Jammu', source: 'Facebook Ad', map: { name: 'Full Name', phone: 'Mobile', email: 'Email ID', date: 'Date' }, extra: ['Do you have a bike?', 'Years in sales'] };
const sales = () => tab(2, 'Sales Jammu', [
  HEAD,
  [new Date('2026-10-12T00:00:00Z'), ' Asha Rao ', 9876543210, 'ASHA@example.com', 'Yes', 3, 'ad1'],
  ['', 'Ravi K', 9700011111, '', 'No', '', 'ad2'],
  ['', '', '', '', '', '', ''],
]);
const junk = () => tab(1, 'Sheet18', [['only one'], ['x']]);
const crm = () => tab(3, 'CRM Delhi', [['Name', 'Phone'], ['Dev', '98000 00001']]);

test('the script is plain text with the address, key and token filled in, and nothing left to replace', () => {
  const s = script();
  assert.ok(s.includes(`var APP_URL = "${URL_}";`));
  assert.ok(s.includes(`var APP_KEY = "${KEY}";`));
  assert.ok(s.includes(`var APP_TOKEN = "${TOKEN}";`));
  assert.ok(!/__[A-Z]+__/.test(s), 'every placeholder was replaced');
  assert.ok(!s.includes('`'), 'no backticks, so it pastes anywhere');
  assert.ok(s.includes('function installLeadSync') && s.includes('function syncLeads'));
  assert.ok(app.leadFeedScript({ url: URL_, anonKey: KEY, token: "x'y$&z" }).includes('"x\'y$&z"'), 'odd characters in the values survive');
});

test('every tab with headings is reported with a stable key, its name and its headings; a tab without headings is left out', () => {
  const w = world([junk(), sales(), crm()]);
  w.sync();
  assert.equal(w.of('sheet_sync_plan').length, 1);
  const b = w.of('sheet_sync_plan')[0];
  assert.equal(b.url, URL_ + '/rest/v1/rpc/sheet_sync_plan');
  assert.equal(b.opts.headers.apikey, KEY);
  assert.equal(b.body.p_token, TOKEN);
  assert.deepEqual(plain(b.body.p_tabs), [
    { key: 'BOOK/2', name: 'Sales Jammu', book: 'Leads workbook', headings: HEAD },
    { key: 'BOOK/3', name: 'CRM Delhi', book: 'Leads workbook', headings: ['Name', 'Phone'] },
  ]);
});

test('nothing is linked: nothing is sent and no tab is changed', () => {
  const w = world([junk(), sales(), crm()]);
  w.sync();
  assert.equal(w.of('ingest_tab_leads').length, 0);
  assert.deepEqual(w.tabs.flatMap((t) => t.writes), []);
});

test('a linked tab sends its rows by the chosen columns, with the extra columns as answers, and writes what happened', () => {
  const t = sales();
  const w = world([junk(), t, crm()], { links: [LINK] });
  w.sync();
  const sends = w.of('ingest_tab_leads');
  assert.equal(sends.length, 1);
  assert.equal(sends[0].body.p_tab_key, 'BOOK/2');
  assert.deepEqual(plain(sends[0].body.p_rows), [
    { name: 'Asha Rao', phone: '9876543210', email: 'ASHA@example.com', date: '2026-10-12', answers: { 'Do you have a bike?': 'Yes', 'Years in sales': '3' } },
    { name: 'Ravi K', phone: '9700011111', email: '', date: '', answers: { 'Do you have a bike?': 'No' } },
  ]);
  assert.equal(t.grid[0][7], 'Synced to ATS', 'the status column is made, on this tab only');
  assert.match(t.grid[1][7], /^Added /);
  assert.match(t.grid[2][7], /^Added /);
  assert.equal(t.grid[3][7] || '', '', 'an empty row is left alone');
  assert.deepEqual(w.tabs.filter((x) => x.name !== 'Sales Jammu').flatMap((x) => x.writes), [], 'other tabs are not touched');
  assert.ok(!('ad_id' in sends[0].body.p_rows[0]) && !JSON.stringify(sends[0].body.p_rows).includes('ad1'), 'a column that was not chosen is not sent');
});

test('a row is never sent twice, and a new row goes alone', () => {
  const t = sales();
  const w = world([t], { links: [LINK] });
  w.sync();
  w.sync();
  assert.equal(w.of('ingest_tab_leads').length, 1, 'the second run found nothing new');
  t.sheet.getRange(5, 2).setValue('Kiran'); t.sheet.getRange(5, 3).setValue('98111 22222');
  w.sync();
  const s = w.of('ingest_tab_leads');
  assert.equal(s.length, 2);
  assert.deepEqual(plain(s[1].body.p_rows.map((r) => r.name)), ['Kiran']);
  // clearing a status cell sends that row again (the server says duplicate, harmlessly)
  t.sheet.getRange(2, 8).setValue('');
  w.sync();
  const again = w.of('ingest_tab_leads')[2].body.p_rows;
  assert.deepEqual(plain(again.map((r) => r.name)), ['Asha Rao']);
  assert.match(t.grid[1][7], /^Duplicate: /);
});

test('a title row above the headings, a status column that already exists, and rows beyond one batch', () => {
  const grid = [['Leads of October', ''], ['Full Name', 'Mobile', 'Synced to ATS']];
  for (let i = 0; i < 230; i++) grid.push(['Person ' + i, String(6000000000 + i * 13), i < 5 ? 'Added before' : '']);
  const t = tab(2, 'Sales Jammu', grid);
  const w = world([t], { links: [{ ...LINK, map: { name: 'Full Name', phone: 'Mobile' }, extra: [] }] });
  w.sync();
  const s = w.of('ingest_tab_leads');
  assert.deepEqual(s.map((c) => c.body.p_rows.length), [100, 100, 25], 'in batches of 100; the 5 already marked are not sent');
  assert.ok(t.grid.slice(2, 7).every((r) => r[2] === 'Added before'));
  assert.ok(t.grid.slice(7).every((r) => /^Added /.test(r[2])));
  assert.equal(t.grid[1].length, 3, 'no second status column');
});

test('a failure leaves the rows unmarked so the next minute tries again; rows already sent stay marked', () => {
  const t = sales();
  let n = 0;
  const w = world([t], { links: [LINK], server: (fn, body) => {
    if (fn === 'sheet_sync_plan') return { ok: true, links: [LINK] };
    n++;
    if (n === 1) return { code: 500, text: 'boom' };
    return { ok: true, rows: body.p_rows.map(() => ({ status: 'added', why: '' })) };
  } });
  assert.throws(() => w.sync(), /The app answered 500/);
  assert.equal(t.grid[1][7] || '', '');
  w.sync();
  assert.match(t.grid[1][7], /^Added /);
});

test('a refused token is reported in the app\'s own words and nothing is marked', () => {
  const t = sales();
  const w = world([t], { server: () => ({ ok: false, message: 'This connection is not valid, or the lead sheet is switched off. Ask an admin for a new script.' }) });
  assert.throws(() => w.sync(), /not valid, or the lead sheet is switched off/);
  assert.deepEqual(t.writes, []);
});

test('one tab with a missing column does not stop the others, and the problem names the tab and the column', () => {
  const broken = tab(2, 'Sales Jammu', [['Full Name', 'Phone Number'], ['Asha', '98765 43210']]);
  const fine = crm();
  const w = world([broken, fine], { links: [LINK, { key: 'BOOK/3', name: 'CRM Delhi', source: 'Naukri', map: { name: 'Name', phone: 'Phone' }, extra: [] }] });
  assert.throws(() => w.sync(), /"Sales Jammu": the column "Mobile" is not in this tab any more/);
  assert.equal(w.of('ingest_tab_leads').length, 1);
  assert.equal(w.of('ingest_tab_leads')[0].body.p_tab_key, 'BOOK/3');
  assert.match(fine.grid[1][2], /^Added /);
});

test('an extra column that is gone is simply not sent; an unfilled answer is left out', () => {
  const t = tab(2, 'Sales Jammu', [['Full Name', 'Mobile', 'Q1'], ['Asha', '98765 43210', ''], ['Ravi', '97000 11111', 'yes']]);
  const w = world([t], { links: [{ ...LINK, map: { name: 'Full Name', phone: 'Mobile' }, extra: ['Q1', 'Q gone'] }] });
  w.sync();
  assert.deepEqual(plain(w.of('ingest_tab_leads')[0].body.p_rows.map((r) => r.answers)), [{}, { Q1: 'yes' }]);
});

test('installing the timer removes the old one, adds one for every minute, and syncs once', () => {
  const w = world([sales()], { links: [LINK] });
  w.run('installLeadSync()');
  assert.deepEqual(w.deleted, ['syncLeads']);
  assert.deepEqual(plain(w.triggers), [['syncLeads', 1]]);
  assert.equal(w.of('sheet_sync_plan').length, 1);
});
