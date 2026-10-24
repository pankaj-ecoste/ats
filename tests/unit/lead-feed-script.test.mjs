// The Google Sheet script: run against a pretend Google Sheet and a pretend app, to see which rows it sends, what it writes back, and that it never sends a row twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadApp } from './load-app.mjs';

const app = loadApp({ until: 'services', expose: ['leadFeedScript', 'guessLeadMap', 'LEAD_FIELDS', 'leadTemplateCsv', 'parseCsv', 'leadTable'] });
const plain = (x) => JSON.parse(JSON.stringify(x));
const URL_ = 'https://abcd.supabase.co', KEY = 'anon-key-123', TOKEN = 'a'.repeat(64);
const script = (over = '') => app.leadFeedScript({ url: URL_ + '/', anonKey: KEY, token: TOKEN }) + over;

// a pretend Google Sheet (a grid of cells) and a pretend app that answers like the database function
function world(grid, { server } = {}) {
  const calls = [], triggers = [], deleted = [];
  const set = (r, c, v) => { while (grid.length <= r) grid.push([]); while (grid[r].length <= c) grid[r].push(''); grid[r][c] = v; };
  const sheet = {
    getDataRange: () => ({ getValues: () => { const w = Math.max(0, ...grid.map((r) => r.length)); return grid.map((r) => Array.from({ length: w }, (_, i) => (i < r.length ? r[i] : ''))); } }),
    getRange: (r, c) => ({ setValue: (v) => set(r - 1, c - 1, v), setValues: (vs) => vs.forEach((row, i) => row.forEach((v, j) => set(r - 1 + i, c - 1 + j, v))) }),
  };
  const seen = new Set();
  const answer = server || ((body) => ({ ok: true, rows: body.p_rows.map((x) => {
    const k = x.phone || x.email;
    if (!x.name) return { status: 'skipped', why: 'No name' };
    if (seen.has(k)) return { status: 'duplicate', why: 'Already applied for this opening (' + x.name + ')' };
    seen.add(k); return { status: 'added', why: '' };
  }) }));
  const ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheets: () => [sheet], getSheetByName: (n) => (n === 'Leads' ? sheet : null), getSpreadsheetTimeZone: () => 'Asia/Kolkata' }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ScriptApp: {
      getProjectTriggers: () => [{ getHandlerFunction: () => 'syncLeads' }, { getHandlerFunction: () => 'other' }],
      deleteTrigger: (t) => deleted.push(t.getHandlerFunction()),
      newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (n) => ({ create: () => triggers.push([fn, n]) }) }) }),
    },
    UrlFetchApp: { fetch: (url, opts) => {
      const body = JSON.parse(opts.payload);
      calls.push({ url, opts, body });
      const r = answer(body, calls.length);
      return { getResponseCode: () => r.code || 200, getContentText: () => (typeof r.text === 'string' ? r.text : JSON.stringify(r)) };
    } },
    Utilities: { formatDate: (d, tz, f) => (f === 'yyyy-MM-dd' ? d.toISOString().slice(0, 10) : '24 Oct 15:02') },
  });
  const run = (src) => vm.runInContext(src, ctx);
  run(script());
  return { grid, calls, triggers, deleted, run, sync: () => run('syncLeads()'), ctx };
}
const HEAD = ['Date', 'Name', 'Mobile Number', 'Email ID', 'City', 'Campaign'];

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

test('new rows are sent with the right fields and marked, a row is never sent twice, and a new row goes alone', () => {
  const grid = [HEAD, [new Date('2026-10-12T00:00:00Z'), ' Asha Rao ', 9876543210, 'asha@example.com', 'Pune', 'Instagram Ad'], [], ['', 'Ravi K', '97000 11111', '', 'Nagpur', 'Facebook Ad']];
  const w = world(grid);
  w.sync();
  assert.equal(w.calls.length, 1);
  assert.equal(w.calls[0].url, URL_ + '/rest/v1/rpc/ingest_leads');
  assert.deepEqual(plain(w.calls[0].opts.headers), { apikey: KEY, Authorization: 'Bearer ' + KEY });
  assert.equal(w.calls[0].body.p_token, TOKEN);
  assert.deepEqual(plain(w.calls[0].body.p_rows), [
    { name: 'Asha Rao', phone: '9876543210', email: 'asha@example.com', location: 'Pune', source: 'Instagram Ad', date: '2026-10-12' },
    { name: 'Ravi K', phone: '97000 11111', email: '', location: 'Nagpur', source: 'Facebook Ad', date: '' },
  ]);
  assert.equal(grid[0][6], 'Synced to ATS', 'the status column is added');
  assert.equal(grid[1][6], 'Added 24 Oct 15:02');
  assert.equal(grid[3][6], 'Added 24 Oct 15:02');
  assert.ok(grid[2].every((c) => c === ''), 'a blank row gets no mark');

  w.sync();
  assert.equal(w.calls.length, 1, 'nothing is sent again');

  grid.push(['', 'Gita', '98111 22222', '', 'Delhi', 'Facebook Ad']);
  w.sync();
  assert.equal(w.calls.length, 2);
  assert.deepEqual(plain(w.calls[1].body.p_rows.map((r) => r.name)), ['Gita']);
  assert.equal(grid[4][6], 'Added 24 Oct 15:02');
});

test('what the app answers is written next to each row: added, already in the app, duplicate, skipped', () => {
  const grid = [HEAD, ['', 'A', '98000 00001', '', '', ''], ['', 'B', '98000 00002', '', '', ''], ['', 'C', '98000 00003', '', '', ''], ['', '', '98000 00004', '', '', '']];
  const answers = [{ status: 'added', why: '' }, { status: 'existing', why: 'Already in the system as B' }, { status: 'duplicate', why: 'Already applied for this opening (C)' }, { status: 'skipped', why: 'No name' }];
  const w = world(grid, { server: () => ({ ok: true, rows: answers }) });
  w.sync();
  assert.deepEqual(grid.slice(1).map((r) => r[6]), ['Added 24 Oct 15:02', 'Added to the opening (already in the app) 24 Oct 15:02', 'Duplicate: Already applied for this opening (C)', 'Skipped: No name']);
  w.sync();
  assert.equal(w.calls.length, 1, 'duplicates and skipped rows are not retried; clear the cell to send a row again');
});

test('a title row above the headings, a status column that already exists, and rows beyond one batch', () => {
  const grid = [['October leads from Facebook'], ['Date', 'Name', 'Phone', 'Synced to ATS'], ...Array.from({ length: 250 }, (_, i) => ['', 'Lead ' + i, String(6000000000 + i), ''])];
  grid[3][3] = 'Added earlier';
  const w = world(grid);
  w.sync();
  assert.deepEqual(w.calls.map((c) => c.body.p_rows.length), [100, 100, 49]);
  assert.equal(grid[0].length, 1);
  assert.equal(grid[1].length, 4, 'the existing status column is used, not a second one');
  assert.equal(grid[3][3], 'Added earlier', 'a row already marked is left alone');
  assert.ok(grid.slice(2).every((r) => r[3] !== ''), 'every row got a mark');
  assert.equal(w.calls.flatMap((c) => c.body.p_rows).some((r) => r.name === 'Lead 1'), false);
});

test('a failure leaves the rows unmarked so the next minute tries again; rows already sent stay marked', () => {
  const grid = [HEAD, ...Array.from({ length: 150 }, (_, i) => ['', 'N' + i, String(6000000000 + i), '', '', ''])];
  let n = 0;
  const w = world(grid, { server: (body) => (++n === 2 ? { code: 500, text: 'boom' } : { ok: true, rows: body.p_rows.map(() => ({ status: 'added', why: '' })) }) });
  assert.throws(() => w.sync(), /The app answered 500: boom/);
  assert.equal(grid.slice(1, 101).every((r) => r[6] === 'Added 24 Oct 15:02'), true, 'the first batch is marked');
  assert.equal(grid.slice(101).every((r) => r[6] === undefined || r[6] === ''), true, 'the second batch is not');
  w.sync();
  assert.deepEqual(w.calls.map((c) => c.body.p_rows.length), [100, 50, 50], 'only the rest is sent the next time');
  assert.equal(grid.slice(1).every((r) => r[6] === 'Added 24 Oct 15:02'), true);
});

test('a refused token is reported in the app\'s own words and nothing is marked', () => {
  const grid = [HEAD, ['', 'A', '98000 00001', '', '', '']];
  const w = world(grid, { server: () => ({ ok: false, message: 'This connection is not valid, or the live lead sheet is switched off. Ask an admin for a new script.' }) });
  assert.throws(() => w.sync(), /not valid, or the live lead sheet is switched off/);
  assert.equal(grid[1][6], undefined);
});

test('without a name column and a phone or email column it says which headings it found', () => {
  const w = world([['Foo', 'Bar'], ['1', '2']]);
  assert.throws(() => w.sync(), /Cannot find the Name column.*Headings found: Foo, Bar, Synced to ATS/);
  assert.equal(w.calls.length, 0);
});

test('MAP names a column the script does not recognise, and TAB picks another tab', () => {
  const grid = [['Person', 'Reach me at', 'Anything'], ['Asha', '98765 43210', 'x']];
  const w = world(grid);
  assert.throws(() => w.sync(), /Cannot find/);
  w.run("MAP = { name: 'Person', phone: 'Reach me at' };");
  w.sync();
  assert.deepEqual(plain(w.calls[0].body.p_rows), [{ name: 'Asha', phone: '98765 43210' }]);
  w.run("TAB = 'Missing';");
  assert.throws(() => w.sync(), /no tab called "Missing"/);
});

test('the heading in the Position column picks the opening, and a sheet with nothing in it does nothing', () => {
  const w = world([['Name', 'Phone', 'Job Applied For'], ['Asha', '98765 43210', 'Sales Executive']]);
  w.sync();
  assert.deepEqual(plain(w.calls[0].body.p_rows), [{ name: 'Asha', phone: '98765 43210', position: 'Sales Executive' }]);
  const empty = world([[], ['']]);
  empty.sync();
  assert.equal(empty.calls.length, 0);
});

test('installing the timer removes the old one, adds one for every minute, and syncs once', () => {
  const w = world([HEAD, ['', 'A', '98000 00001', '', '', '']]);
  w.run('installLeadSync()');
  assert.deepEqual(plain(w.deleted), ['syncLeads']);
  assert.deepEqual(plain(w.triggers), [['syncLeads', 1]]);
  assert.equal(w.calls.length, 1);
});

test('the script reads headings exactly as the Import leads screen does', () => {
  const lists = [
    ['S.No', 'Candidate Name', 'Mobile Number', 'Email ID', 'City', 'Total Experience', 'Current CTC', 'Expected CTC', 'Notice Period', 'Remarks', 'Lead Date', 'Campaign'],
    ['Candidate ID', 'Excellent', "Applicant's Name", 'Alternate Phone'],
    ['Date', 'Name', 'Phone', 'Email', 'City', 'Experience (years)', 'Current company', 'Current CTC', 'Expected CTC', 'Notice period', 'Campaign', 'Position'],
    ['Full Name', 'WhatsApp Number', 'Mail', 'Place', 'Qualification', 'Key Skills', 'Source', 'Comments'],
    ['foo', 'bar'],
  ];
  const w = world([HEAD]);
  for (const heads of lists) {
    const mine = plain(vm.runInContext(`columns_(${JSON.stringify(heads)})`, w.ctx));
    delete mine.position;
    const theirs = Object.fromEntries(Object.entries(plain(app.guessLeadMap(heads))).map(([k, h]) => [k, heads.indexOf(h)]));
    assert.deepEqual(mine, theirs, heads.join(' | '));
  }
});

test('the starting sheet has the headings the app understands and one example row, and reads back through Import leads', () => {
  const csv = app.leadTemplateCsv();
  const t = plain(app.leadTable(app.parseCsv(csv)));
  assert.equal(t.rows.length, 1);
  const map = plain(app.guessLeadMap(t.headers));
  assert.deepEqual(Object.keys(map).sort(), ['curSal', 'company', 'date', 'email', 'exp', 'expSal', 'location', 'name', 'notice', 'phone', 'source'].sort());
  assert.equal(t.rows[0][map.name], 'Asha Rao');
});
