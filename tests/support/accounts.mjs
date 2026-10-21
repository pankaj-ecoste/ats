// Shared by the tests that sign in for real (tests/db/login.test.mjs, tests/e2e/auth.mjs).
// Test accounts are named  zz<random>_<name>  so they can never be mistaken for a real person's account,
// and everything they leave behind (profiles, sessions, audit rows) is removed again.
import { randomBytes } from 'node:crypto';

export const DOMAIN = 'ats.ecoste.in';
export const newTag = () => 'zz' + randomBytes(3).toString('hex');

// the server creates an admin, as `npm run db:create-admin` does
export async function createTestAdmin(db, tag, password, fullName = 'Test Admin') {
  const r = await db.query("select app.create_login($1, $2, $3, 'admin'::public.app_role) as id", [`${tag}_admin`, password, fullName]);
  return r.rows[0].id;
}

export async function removeTestAccounts(db, tag) {
  const ids = (await db.query('select id from auth.users where email like $1', [`${tag}\\_%@${DOMAIN}`])).rows.map((r) => r.id);
  if (!ids.length) return;
  await db.query('delete from auth.users where id = any($1::uuid[])', [ids]);   // profiles go with them, and that writes audit rows too
  // so the audit rows are removed last. Only this run's own accounts are touched.
  await db.query('alter table public.audit_log disable trigger no_delete');
  try {
    await db.query("delete from public.audit_log where actor_id = any($1::uuid[]) or row_id = any($2::text[]) or (table_name = 'profiles' and (coalesce(old_data, new_data) ->> 'id') = any($2::text[]))", [ids, ids]);
  } finally {
    await db.query('alter table public.audit_log enable trigger no_delete');
  }
}
