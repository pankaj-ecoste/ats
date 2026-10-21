// Proves the app's data survives a trip through the database: the sample dataset is written to every table, read back and
// turned into app records again, and the two must be the same. Catches a field the mapping forgets, a column the database
// rejects, and a trigger that quietly changes a value.
//   npm run test:db        needs DATABASE_URL in .env. Skipped when it is not set. Everything is rolled back.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { connect, loadEnv } from '../../scripts/db.mjs';
import { loadApp } from '../unit/load-app.mjs';

loadEnv();
const skip = process.env.DATABASE_URL ? false : 'DATABASE_URL is not set';
// give the same shapes the browser library gets from the API: dates as text, numbers as numbers
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

const app = loadApp({ until: 'services', expose: ['S', 'STAGES', 'stateFromRows', 'rowsFromState', 'makePeople', 'READ_TABLES', 'LOG_TABLES'] });
let c;
const q = (sql, params) => c.query(sql, params);

// names in the sample data -> the role they would hold
const PEOPLE = { 'Priya Sharma': 'recruiter', 'Arjun Nair': 'recruiter', 'Sneha Kapoor': 'recruiter', 'Rahul Mehta': 'hiring_manager', 'Kavita Rao': 'hiring_manager',
  'Neha Joshi': 'hiring_manager', 'Aman Gupta': 'hiring_manager', 'Farah Khan': 'hiring_manager', 'Vikram Singh': 'interviewer' };
// `notes` and `link` are JSON in one table and plain text in another, so columns are named with their table
const JSON_COLUMNS = new Set(['candidates.history', 'candidates.notes', 'screenings.answers', 'offers.breakup', 'notifications.link', 'company_settings.match_weights', 'company_settings.config']);
const ORDER = ['openings', 'candidates', 'candidate_compensation', 'candidate_documents', 'applications', 'screenings', 'interview_groups', 'interviews', 'offers',
  'onboarding_checklists', 'onboarding_items', 'tasks', 'notifications', 'activity', 'job_boards', 'postings', 'report_events', 'call_log', 'monthly_targets', 'sheet_log'];

// one statement per table (a row at a time is slow over the network); chunks keep under the 65,535 parameter limit
async function insertRows(table, rows) {
  if (!rows.length) return;
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const per = Math.floor(60000 / cols.length);
  for (let from = 0; from < rows.length; from += per) {
    const chunk = rows.slice(from, from + per), vals = [];
    const groups = chunk.map((r) => '(' + cols.map((k) => {
      vals.push(JSON_COLUMNS.has(`${table}.${k}`) && r[k] !== undefined && r[k] !== null ? JSON.stringify(r[k]) : r[k] ?? null);
      return '$' + vals.length;
    }).join(', ') + ')');
    await q(`insert into public.${table} (${cols.join(', ')}) values ${groups.join(', ')}`, vals);
  }
}

// what must be the same on both sides. Fields the database adds (defaults for things the app never set) are dropped from the read-back.
const STAGES = app.STAGES;
const plain = (x) => JSON.parse(JSON.stringify(x));
function tidy(state) {
  const s = plain(state);
  s.offers.forEach((o) => { if (o.approval === 'Not required') delete o.approval; if (o.letterPath === null) delete o.letterPath; });
  s.interviews.forEach((i) => { if (i.decision === null) delete i.decision; if (i.groupId === null) delete i.groupId; });
  s.interviews.forEach((i) => { if (i.status === 'Pending Feedback') i.status = 'Scheduled'; });   // derived on screen, never stored
  // the opening's status is worked out by the database from its furthest application, with the rule moveStage uses; the sample was written by hand
  s.openings.forEach((o) => {
    if (['Draft', 'On Hold', 'Closed', 'Filled'].includes(o.status)) return;
    const apps = s.applications.filter((a) => a.opId === o.id);
    const rank = (a) => (a.stage === 'Rejected' || a.stage === 'On Hold' ? -1 : STAGES.indexOf(a.stage));
    const furthest = Math.max(...apps.map(rank));
    const hired = apps.filter((a) => STAGES.indexOf(a.stage) >= STAGES.indexOf('Joining')).length;
    o.status = hired >= o.positions ? 'Filled' : furthest >= 6 ? 'Offer' : furthest >= 3 ? 'Interviewing' : furthest >= 1 ? 'Screening' : 'Open';
  });
  s.applications.forEach((a) => { if (a.backup === null) delete a.backup; if (a.screening === null) delete a.screening; });
  return s;
}
const byText = (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b));

let original, rebuilt, userId;
before(async () => {
  if (skip) return;
  c = connect();
  await c.connect();
  await q('begin');
  await q("select set_config('app.allow_user_create', 'on', true)");
  const ids = {};
  // the database refuses to leave itself without an admin, so one exists for the whole test
  for (const name of ['Test Admin', ...Object.keys(PEOPLE)]) {
    ids[name] = randomUUID();
    await q("insert into auth.users (id, email, aud, role, raw_user_meta_data) values ($1, $2, 'authenticated', 'authenticated', $3)", [ids[name], `zz${ids[name].slice(0, 8)}@ats.ecoste.in`, JSON.stringify({ full_name: name })]);
  }
  await q("select set_config('app.allow_user_create', 'off', true)");
  await q("update public.profiles set role = 'admin' where id = $1", [ids['Test Admin']]);
  for (const [name, role] of Object.entries(PEOPLE)) await q('update public.profiles set role = $1 where id = $2', [role, ids[name]]);
  userId = ids['Priya Sharma'];

  // the sample data, with the browser's counter ids for notifications swapped for the uuids the database uses
  original = tidy(app.S);
  original.notifications.forEach((n) => { n.id = randomUUID(); });
  // the parts of the app's state the sample does not fill in when only the services are loaded
  original.events = [
    { d: '2026-10-01', t: 'shortlist', aid: null, op: 'OP-1001', demo: 1 },
    { d: '2026-10-02', t: 'joined', aid: 'APP-3001', op: 'OP-1001', days: 31, src: 'Referral' },
  ];
  original.callLog = [{ id: 'CL-AAAA2222', d: '2026-10-01', op: 'OP-1002', made: 40, conn: 18, demo: 1 }, { id: 'CL-BBBB3333', d: '2026-10-02', op: 'OP-1002', made: 25, conn: 11 }];
  original.sheetLog = [{ ts: 1760000000000, text: 'Loaded team.xlsx (merge, 12 rows)' }];
  original.monthly = { '2026-10': { target: 8, budget: 60000, other: 9000 }, '2026-09': { target: 6, budget: 50000, other: 12000 } };
  original.boards = [
    { id: 'naukri', name: 'Naukri', type: 'board', fmt: 'full', color: '#275DF5', src: 'Naukri', url: 'https://recruit.naukri.com/' },
    { id: 'B-XXXX2222', name: 'Local site', type: 'board', fmt: 'full', color: '#123456', src: 'Local', url: '', custom: true },
  ];
  original.postCfg = { formUrl: 'https://forms.example/apply', applyEmail: 'jobs@example.com', applyLink: '', showSalary: true, about: 'About us', hashtags: '#hiring' };
  original.autoSync = { fileId: 'f1', url: '', title: 'Sheet', tab: 'Form responses', map: { Name: 'name' }, defaultOp: 'OP-1001', interval: 5, enabled: true, seen: ['a', 'b'], lastRun: null, last: null, log: [] };
  Object.assign(original.settings, { sla: { New: 2, Screening: 5 }, report: { offerAlert: 70, noShowAlert: 25, dueSoon: 7 }, team: { recruiters: ['Priya Sharma'], interviewers: ['Vikram Singh'] } });
  // only this test's own openings, candidates etc. may exist in the tables it reads back, so it works on a database that holds other data
  await q('delete from public.openings');
  await q('delete from public.candidates');
  await q('delete from public.job_boards');
  await q('delete from public.monthly_targets');
  await q('delete from public.activity');
  await q('delete from public.report_events');
  await q('delete from public.call_log');
  await q('delete from public.sheet_log');
  await q('delete from public.notifications');
  await q('delete from public.tasks');
  const people = app.makePeople((await q('select id, username, full_name, role, active from public.profiles')).rows);
  const rows = app.rowsFromState(original, people, userId);

  // backup links point at other applications, so they are added after every application exists
  const backups = rows.applications.filter((a) => a.backup_application_id).map((a) => [a.id, a.backup_application_id, a.backup_status]);
  rows.applications.forEach((a) => { a.backup_application_id = null; a.backup_status = null; });
  for (const t of ORDER) await insertRows(t, rows[t] || []);
  for (const [id, to, st] of backups) await q('update public.applications set backup_application_id = $2, backup_status = $3 where id = $1', [id, to, st]);
  const s = rows.company_settings[0];
  await q('update public.company_settings set company=$1, address=$2, signatory=$3, sign_title=$4, match_threshold=$5, match_weights=$6, config=$7',
    [s.company, s.address, s.signatory, s.sign_title, s.match_threshold, JSON.stringify(s.match_weights), JSON.stringify(s.config)]);

  // read everything back the way the loader does, then rebuild the app's state
  const back = {};
  for (const [t] of [...app.READ_TABLES, ...app.LOG_TABLES]) back[t] = (await q(`select * from public.${t}`)).rows;
  const profiles = (await q('select id, username, full_name, role, active from public.profiles')).rows;
  rebuilt = tidy(app.stateFromRows(back, app.makePeople(profiles)));
});
after(async () => {
  if (!c) return;
  await q('rollback');
  await c.end();
});

// collections where the app's order is meaningful and the database keeps it (by creation time)
for (const k of ['openings', 'candidates', 'applications', 'groups', 'interviews', 'offers', 'onboarding', 'tasks', 'postings']) {
  test(`round trip: ${k} come back the same`, { skip }, () => {
    const key = (x) => x.id || x.appId;
    const a = original[k].slice().sort((x, y) => String(key(x)).localeCompare(String(key(y))));
    const b = rebuilt[k].slice().sort((x, y) => String(key(x)).localeCompare(String(key(y))));
    assert.deepEqual(b, a);
  });
}
// collections where rows can share a timestamp, so only the content is compared
for (const k of ['activity', 'notifications', 'events', 'callLog', 'sheetLog']) {
  test(`round trip: ${k} come back the same`, { skip }, () => {
    assert.deepEqual(rebuilt[k].slice().sort(byText), original[k].slice().sort(byText));
  });
}
test('round trip: monthly targets, boards, posting setup, sheet connection and settings come back the same', { skip }, () => {
  assert.deepEqual(rebuilt.monthly, original.monthly);
  assert.deepEqual(rebuilt.boards, original.boards);
  assert.deepEqual(rebuilt.postCfg, original.postCfg);
  assert.deepEqual(rebuilt.autoSync, original.autoSync);
  for (const k of Object.keys(rebuilt.settings)) assert.deepEqual(rebuilt.settings[k], original.settings[k], `settings.${k}`);
});
test('round trip: people are matched by name in both directions', { skip }, () => {
  assert.ok(original.openings.every((o) => o.recruiter && o.manager), 'sample openings name a recruiter and a manager');
  assert.deepEqual(rebuilt.openings.map((o) => o.recruiter).sort(), original.openings.map((o) => o.recruiter).sort());
});
