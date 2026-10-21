// DEV ONLY: fills the database with the app's sample data (the same demo set the offline version shows), so a development or staging
// project has something to look at.   npm run db:seed
// It refuses to run unless ALLOW_DB_SEED=1 is set, and refuses when the project already holds openings or candidates, so it cannot
// bury real data. People in the sample (recruiters, managers) become real only where an account has the same full name; otherwise the
// field is left empty. Never run it against production.
import { connect, loadEnv } from './db.mjs';
import { loadApp } from '../tests/unit/load-app.mjs';
import pg from 'pg';

loadEnv();
if (process.env.ALLOW_DB_SEED !== '1') {
  console.error('Refusing to seed: set ALLOW_DB_SEED=1 to confirm this is a development project.');
  process.exit(1);
}
pg.types.setTypeParser(1082, (v) => v);

const app = loadApp({ until: 'services', expose: ['S', 'rowsFromState', 'makePeople'] });
const JSON_COLUMNS = new Set(['candidates.history', 'candidates.notes', 'screenings.answers', 'offers.breakup', 'notifications.link', 'company_settings.match_weights', 'company_settings.config']);
const ORDER = ['openings', 'candidates', 'candidate_compensation', 'candidate_documents', 'applications', 'screenings', 'interview_groups', 'interviews', 'offers',
  'onboarding_checklists', 'onboarding_items', 'tasks', 'activity', 'job_boards', 'postings', 'report_events', 'call_log', 'monthly_targets', 'sheet_log'];

const c = connect();
await c.connect();
const q = (sql, params) => c.query(sql, params);
try {
  const held = (await q('select (select count(*) from public.openings) + (select count(*) from public.candidates) as n')).rows[0].n;
  if (Number(held) > 0) throw new Error('The project already holds openings or candidates. Seeding stops so nothing real is mixed with the sample.');
  const people = app.makePeople((await q('select id, username, full_name, role, active from public.profiles')).rows);
  const admin = (await q("select id from public.profiles where role = 'admin' and active order by created_at limit 1")).rows[0];
  const rows = app.rowsFromState(app.S, people, admin ? admin.id : null);

  await q('begin');
  // backup links point at other applications, so they are added once every application exists
  const backups = rows.applications.filter((a) => a.backup_application_id).map((a) => [a.id, a.backup_application_id, a.backup_status]);
  rows.applications.forEach((a) => { a.backup_application_id = null; a.backup_status = null; });
  for (const t of ORDER) {
    const list = rows[t] || [];
    if (!list.length) continue;
    const cols = [...new Set(list.flatMap((r) => Object.keys(r)))];
    const per = Math.floor(60000 / cols.length);
    for (let from = 0; from < list.length; from += per) {
      const vals = [];
      const groups = list.slice(from, from + per).map((r) => '(' + cols.map((k) => {
        vals.push(JSON_COLUMNS.has(`${t}.${k}`) && r[k] !== undefined && r[k] !== null ? JSON.stringify(r[k]) : r[k] ?? null);
        return '$' + vals.length;
      }).join(', ') + ')');
      await q(`insert into public.${t} (${cols.join(', ')}) values ${groups.join(', ')}`, vals);
    }
    console.log(`${t}: ${list.length}`);
  }
  for (const [id, to, st] of backups) await q('update public.applications set backup_application_id = $2, backup_status = $3 where id = $1', [id, to, st]);
  const s = rows.company_settings[0];
  await q('update public.company_settings set company=$1, address=$2, signatory=$3, sign_title=$4, match_threshold=$5, match_weights=$6, config=$7',
    [s.company, s.address, s.signatory, s.sign_title, s.match_threshold, JSON.stringify(s.match_weights), JSON.stringify(s.config)]);
  await q('commit');
  console.log('Sample data loaded.');
} catch (e) {
  await q('rollback').catch(() => {});
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
