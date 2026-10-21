// DEV ONLY: removes everything `npm run db:seed` loaded (and any other business data), leaving accounts, settings structure and the audit trail.
//   ALLOW_DB_SEED=1 npm run db:unseed -- --yes
// Refuses without both. The company details are blanked so the first-run setup appears again. Audit rows are never touched.
import { connect, loadEnv } from './db.mjs';

loadEnv();
if (process.env.ALLOW_DB_SEED !== '1' || !process.argv.includes('--yes')) {
  console.error('Refusing: this deletes all openings, candidates and their records. Run with ALLOW_DB_SEED=1 and --yes, on a development project only.');
  process.exit(1);
}
const c = connect();
await c.connect();
try {
  await c.query('begin');
  // candidates and openings take their applications, interviews, offers, onboarding and files' records with them; the rest are standalone
  for (const t of ['openings', 'candidates', 'tasks', 'activity', 'report_events', 'call_log', 'sheet_log', 'monthly_targets', 'job_boards', 'postings', 'notifications', 'messages']) {
    const r = await c.query(`delete from public.${t}`);
    console.log(`${t}: ${r.rowCount} removed`);
  }
  await c.query("update public.company_settings set company = '', address = '', signatory = '', sign_title = '', config = '{}'");
  await c.query('commit');
  console.log('Done. The first admin to sign in will be asked for the company details.');
} catch (e) {
  await c.query('rollback').catch(() => {});
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
