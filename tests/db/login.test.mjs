// Real sign-in against the live Supabase project, over HTTP, exactly as the app will do it.
//   npm run test:db        needs SUPABASE_URL, SUPABASE_ANON_KEY and DATABASE_URL in .env. Skipped when they are not set.
// Unlike rls.test.mjs this commits: Supabase's login service is a separate process and cannot see an open transaction.
// Every account it makes has a username starting "zz" plus a random tag, and all of them (and their audit rows) are removed at the end.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect, loadEnv } from '../../scripts/db.mjs';
import { createTestAdmin, DOMAIN, newTag, removeTestAccounts } from '../support/accounts.mjs';

loadEnv();
const skip = process.env.DATABASE_URL && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? false : 'DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY are not all set';
const base = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const anon = process.env.SUPABASE_ANON_KEY;
const tag = newTag();
const name = (n) => `${tag}_${n}`;
let db;
const S = {};   // shared between the steps: tokens, ids

const post = async (path, body, token) => {
  const res = await fetch(base + path, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${token || anon}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, ok: res.ok, json: await res.json().catch(() => null) };
};
const get = async (path, token) => {
  const res = await fetch(base + path, { headers: { apikey: anon, Authorization: `Bearer ${token || anon}` } });
  return { status: res.status, ok: res.ok, json: await res.json().catch(() => null) };
};
const signIn = (user, password) => post('/auth/v1/token?grant_type=password', { email: `${user}@${DOMAIN}`, password });
const rpc = (fn, args, token) => post(`/rest/v1/rpc/${fn}`, args, token);
const message = (r) => JSON.stringify(r.json || '');

before(async () => {
  if (skip) return;
  db = connect();
  await db.connect();
  await removeTestAccounts(db, tag);
  S.adminId = await createTestAdmin(db, tag, 'admin-pass-1');
});
after(async () => {
  try { if (db) await removeTestAccounts(db, tag); } finally { if (db) await db.end(); }
});

test('an admin account made by the server can sign in with its username and password', { skip }, async () => {
  const r = await signIn(name('admin'), 'admin-pass-1');
  assert.equal(r.status, 200, message(r));
  assert.ok(r.json.access_token);
  assert.equal(r.json.user.id, S.adminId);
  S.admin = r.json.access_token;
});

test('a wrong password and an unknown username are both refused', { skip }, async () => {
  assert.equal((await signIn(name('admin'), 'not-the-password')).ok, false);
  assert.equal((await signIn(name('nobody'), 'whatever-123')).ok, false);
});

test('the app can read its own profile, role and username after signing in', { skip }, async () => {
  const r = await get(`/rest/v1/profiles?select=username,full_name,role,active&id=eq.${S.adminId}`, S.admin);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, [{ username: name('admin'), full_name: 'Test Admin', role: 'admin', active: true }]);
});

test('without signing in, the public key reads nothing', { skip }, async () => {
  const r = await get('/rest/v1/profiles?select=id');
  assert.equal(r.ok, false);
  assert.equal((await get('/rest/v1/candidates?select=id')).ok, false);
});

test('nobody can sign themselves up through the public sign-up endpoint', { skip }, async () => {
  const r = await post('/auth/v1/signup', { email: `${name('self')}@${DOMAIN}`, password: 'self-signup-1' });
  assert.equal(r.ok, false, 'sign-up must not succeed: ' + message(r));
  const exists = (await db.query('select 1 from auth.users where email = $1', [`${name('self')}@${DOMAIN}`])).rows.length;
  assert.equal(exists, 0);
});

test('the admin creates a recruiter from the app; the recruiter signs in', { skip }, async () => {
  const c = await rpc('admin_create_user', { p_username: name('rec'), p_password: 'rec-pass-1234', p_full_name: 'Test Recruiter', p_role: 'recruiter' }, S.admin);
  assert.equal(c.status, 200, message(c));
  S.recId = c.json;
  const r = await signIn(name('rec'), 'rec-pass-1234');
  assert.equal(r.status, 200, message(r));
  S.rec = r.json.access_token;
  S.recRefresh = r.json.refresh_token;
});

test('a recruiter cannot create accounts, reset passwords or switch accounts off', { skip }, async () => {
  assert.match(message(await rpc('admin_create_user', { p_username: name('x'), p_password: 'x-pass-1234', p_full_name: '', p_role: 'recruiter' }, S.rec)), /Only an admin/);
  assert.match(message(await rpc('admin_set_password', { p_user: S.adminId, p_password: 'hijack-1234' }, S.rec)), /Only an admin/);
  assert.match(message(await rpc('admin_set_active', { p_user: S.adminId, p_active: false }, S.rec)), /Only an admin/);
  assert.equal((await signIn(name('admin'), 'admin-pass-1')).status, 200, 'the admin is untouched');
});

test('a signed-in user can change their own password', { skip }, async () => {
  const res = await fetch(`${base}/auth/v1/user`, { method: 'PUT', headers: { apikey: anon, Authorization: `Bearer ${S.rec}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'rec-own-pass-9' }) });
  assert.equal(res.status, 200, await res.text());
  assert.equal((await signIn(name('rec'), 'rec-pass-1234')).ok, false, 'old password stops working');
  assert.equal((await signIn(name('rec'), 'rec-own-pass-9')).status, 200);
});

test('an admin password reset replaces the password and ends the old session', { skip }, async () => {
  const fresh = await signIn(name('rec'), 'rec-own-pass-9');
  const oldRefresh = fresh.json.refresh_token;
  const r = await rpc('admin_set_password', { p_user: S.recId, p_password: 'reset-by-admin-1' }, S.admin);
  assert.equal(r.status, 204, message(r));
  assert.equal((await signIn(name('rec'), 'rec-own-pass-9')).ok, false, 'the old password is refused');
  assert.equal((await signIn(name('rec'), 'reset-by-admin-1')).status, 200, 'the new password works');
  const again = await post('/auth/v1/token?grant_type=refresh_token', { refresh_token: oldRefresh });
  assert.equal(again.ok, false, 'the old session cannot be refreshed');
});

test('switching an account off blocks sign-in and cuts off data access immediately', { skip }, async () => {
  const live = (await signIn(name('rec'), 'reset-by-admin-1')).json.access_token;
  assert.equal((await get('/rest/v1/profiles?select=id', live)).json.length >= 2, true, 'a member sees colleagues');
  assert.equal((await rpc('admin_set_active', { p_user: S.recId, p_active: false }, S.admin)).status, 204);
  const refused = await signIn(name('rec'), 'reset-by-admin-1');
  assert.equal(refused.status, 400, 'a clean refusal, not a server error: ' + message(refused));
  assert.match(message(refused), /banned/i);
  const stillValid = await get('/rest/v1/profiles?select=id', live);   // a token issued earlier is still a valid token ...
  assert.deepEqual(stillValid.json, [{ id: S.recId }], '... but the database shows it only its own row');
  assert.deepEqual((await get('/rest/v1/openings?select=id', live)).json, []);
  assert.equal((await rpc('admin_set_active', { p_user: S.recId, p_active: true }, S.admin)).status, 204);
  assert.equal((await signIn(name('rec'), 'reset-by-admin-1')).status, 200, 'switched back on');
});

test('the admin cannot lock themselves out', { skip }, async () => {
  assert.match(message(await rpc('admin_set_active', { p_user: S.adminId, p_active: false }, S.admin)), /your own account/);
});
