import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const app = loadApp({ until: 'services', expose: ['callReportRange', 'pivotCallReport', 'APP_CALL_STATUS'] });
const plain = (x) => JSON.parse(JSON.stringify(x));

test('a day is that day; a week runs Monday to Sunday around it; a month is the calendar month', () => {
  assert.deepEqual(plain(app.callReportRange('day', '2026-11-06')), { from: '2026-11-06', to: '2026-11-06' });
  assert.deepEqual(plain(app.callReportRange('week', '2026-11-06')), { from: '2026-11-02', to: '2026-11-08' }, 'a Friday');
  assert.deepEqual(plain(app.callReportRange('week', '2026-11-02')), { from: '2026-11-02', to: '2026-11-08' }, 'the Monday itself');
  assert.deepEqual(plain(app.callReportRange('week', '2026-11-08')), { from: '2026-11-02', to: '2026-11-08' }, 'the Sunday belongs to the week before');
  assert.deepEqual(plain(app.callReportRange('week', '2026-12-31')), { from: '2026-12-28', to: '2027-01-03' }, 'a week across the new year');
  assert.deepEqual(plain(app.callReportRange('month', '2026-11-06')), { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(plain(app.callReportRange('month', '2028-02-10')), { from: '2028-02-01', to: '2028-02-29' }, 'a leap February');
  assert.deepEqual(plain(app.callReportRange('month', '2026-12-31')), { from: '2026-12-01', to: '2026-12-31' });
});

test('the report has one line per recruiter, engaged is the sum of their statuses, the busiest first, and the totals add up', () => {
  const rows = [
    { recruiter_id: 'u2', recruiter: 'Bina', status: 'Connected', n: 5 },
    { recruiter_id: 'u1', recruiter: 'Asha', status: 'Connected', n: 3 },
    { recruiter_id: 'u1', recruiter: 'Asha', status: 'Busy', n: '4' },
    { recruiter_id: 'u1', recruiter: 'Asha', status: 'Wrong Number', n: 1 },
    { recruiter_id: 'u2', recruiter: 'Bina', status: 'Not Interested', n: 2 },
    { recruiter_id: 'u3', recruiter: 'Chen', status: 'Connected', n: 7 },
  ];
  const p = app.pivotCallReport(rows);
  assert.deepEqual(plain(p.recruiters.map((r) => [r.name, r.engaged])), [['Asha', 8], ['Chen', 7], ['Bina', 7]].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  const asha = p.recruiters.find((r) => r.name === 'Asha');
  assert.equal(asha.by.Connected, 3);
  assert.equal(asha.by.Busy, 4, 'a number sent as text is counted');
  assert.equal(asha.by['Wrong Number'], 1);
  assert.equal(asha.by['High Salary'], 0);
  for (const r of p.recruiters) assert.equal(Object.values(r.by).reduce((a, b) => a + b, 0), r.engaged, r.name);
  assert.equal(p.totals.engaged, 22);
  assert.equal(Object.values(p.totals.by).reduce((a, b) => a + b, 0), 22);
  assert.equal(p.totals.by.Connected, 15);
  assert.deepEqual(plain(p.statuses), plain(app.APP_CALL_STATUS).filter((s) => s !== 'NA'), 'one column per status, NA is not one of them');
});

test('NA, a status not in the list, nothing counted and no rows at all are left out, not guessed', () => {
  const p = app.pivotCallReport([
    { recruiter_id: 'u1', recruiter: 'Asha', status: 'NA', n: 9 },
    { recruiter_id: 'u1', recruiter: 'Asha', status: 'Called', n: 9 },
    { recruiter_id: 'u1', recruiter: 'Asha', status: 'Busy', n: 0 },
    { recruiter_id: null, recruiter: '', status: 'Busy', n: 2 },
  ]);
  assert.deepEqual(plain(p.recruiters.map((r) => [r.name, r.engaged])), [['Unknown', 2]], 'a call with no known person shows as Unknown and is still counted');
  assert.equal(p.totals.engaged, 2);
  assert.equal(app.pivotCallReport([]).recruiters.length, 0);
  assert.equal(app.pivotCallReport(null).totals.engaged, 0);
});
