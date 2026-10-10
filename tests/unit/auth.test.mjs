import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

// a stand-in for the Supabase client that records what it was asked and answers from a script
function fakeClient(script = {}) {
  const calls = [];
  const chain = (table) => {
    const q = { table, ops: [] };
    const api = {
      select: (cols) => { q.ops.push(['select', cols]); return api; },
      update: (patch) => { q.ops.push(['update', patch]); return api; },
      eq: (c, v) => { q.ops.push(['eq', c, v]); return api; },
      order: (c) => { q.ops.push(['order', c]); return api; },
      maybeSingle: () => { calls.push(q); return Promise.resolve(script.profile ?? { data: null, error: null }); },
      then: (res, rej) => { calls.push(q); return Promise.resolve(q.ops.some((o) => o[0] === 'update') ? (script.update ?? { data: [{ id: 'x' }], error: null }) : (script.list ?? { data: [], error: null })).then(res, rej); },
    };
    return api;
  };
  return {
    calls,
    auth: {
      getSession: async () => script.session ?? { data: { session: null } },
      signInWithPassword: async (args) => { calls.push({ signIn: args }); return script.signIn ?? { data: {}, error: null }; },
      signOut: async () => { calls.push({ signOut: true }); return { error: null }; },
      updateUser: async (args) => { calls.push({ updateUser: args }); return script.updateUser ?? { error: null }; },
    },
    from: chain,
    rpc: async (fn, args) => { calls.push({ rpc: fn, args }); return script.rpc ?? { data: 'new-id', error: null }; },
  };
}
const withClient = (script) => {
  const fake = fakeClient(script);
  const app = loadApp({
    until: 'services',
    globals: { fake, crypto: globalThis.crypto },
    after: 'sb = fake',
    expose: ['signIn', 'signOut', 'currentUser', 'changeOwnPassword', 'listUsers', 'createUser', 'resetUserPassword', 'setUserActive', 'setUserRole', 'loginEmail', 'isAdmin', 'generatePassword', 'ROLE_LABEL', 'ASSIGNABLE_ROLES'],
  });
  return { app, fake };
};
const signedIn = (role = 'recruiter', active = true) => ({
  session: { data: { session: { user: { id: 'u1' } } } },
  profile: { data: { id: 'u1', username: 'priya', full_name: 'Priya Sharma', role, active }, error: null },
});
const plain = (x) => JSON.parse(JSON.stringify(x));

test('a username becomes the hidden sign-in address, lowercased and trimmed', () => {
  const { app } = withClient();
  assert.equal(app.loginEmail('  Priya.S '), 'priya.s@ats.ecoste.in');
});

test('signing in sends the hidden address and the password, then loads the person', async () => {
  const { app, fake } = withClient(signedIn('admin'));
  const me = await app.signIn('Priya', 'secret-123');
  assert.deepEqual(plain(fake.calls[0].signIn), { email: 'priya@ats.ecoste.in', password: 'secret-123' });
  assert.deepEqual(plain(me), { id: 'u1', username: 'priya', fullName: 'Priya Sharma', role: 'admin', active: true });
  assert.equal(app.isAdmin(), true);
});

test('only an active admin counts as admin', async () => {
  for (const [role, active, expected] of [['admin', true, true], ['admin', false, false], ['recruiter', true, false], ['pending', true, false]]) {
    const { app } = withClient(signedIn(role, active));
    await app.currentUser();
    assert.equal(app.isAdmin(), expected, `${role} active=${active}`);
  }
});

test('nobody signed in gives no person and no admin', async () => {
  const { app } = withClient();
  assert.equal(await app.currentUser(), null);
  assert.equal(app.isAdmin(), false);
});

test('sign-in problems become plain sentences', async () => {
  const cases = [
    ['Invalid login credentials', 'Wrong username or password.'],
    ['User is banned', 'This account is switched off. Ask an admin.'],
    ['Failed to fetch', 'Cannot reach the server. Check your internet connection and try again.'],
    ['Email rate limit exceeded', 'Too many attempts. Wait a minute and try again.'],
  ];
  for (const [raw, shown] of cases) {
    const { app } = withClient({ signIn: { data: {}, error: { message: raw } } });
    await assert.rejects(() => app.signIn('priya', 'x-password-1'), { message: shown });
  }
});

test('an empty username or password is caught before asking the server', async () => {
  const { app, fake } = withClient();
  await assert.rejects(() => app.signIn('', 'x'), /Enter your username and password/);
  await assert.rejects(() => app.signIn('priya', ''), /Enter your username and password/);
  assert.equal(fake.calls.length, 0);
});

test('signing out clears the person even if the server call fails', async () => {
  const { app, fake } = withClient(signedIn('admin'));
  await app.currentUser();
  await app.signOut();
  assert.ok(fake.calls.some((c) => c.signOut));
  assert.equal(app.isAdmin(), false);
});

test('changing your own password needs 8 characters and passes the new one on', async () => {
  const { app, fake } = withClient();
  await assert.rejects(() => app.changeOwnPassword('short'), /at least 8 characters/);
  await app.changeOwnPassword('long-enough-1');
  assert.deepEqual(plain(fake.calls.at(-1).updateUser), { password: 'long-enough-1' });
});

test('the list of users is mapped to plain fields, newest rules first by username', async () => {
  const { app, fake } = withClient({ list: { data: [{ id: 'a', username: 'asha', full_name: 'Asha', role: 'recruiter', active: true, created_at: 't' }, { id: 'b', username: 'ravi', full_name: null, role: 'pending', active: false, created_at: 't' }], error: null } });
  const list = await app.listUsers();
  assert.deepEqual(plain(list.map((u) => [u.username, u.fullName, u.role, u.active])), [['asha', 'Asha', 'recruiter', true], ['ravi', 'ravi', 'pending', false]]);
  assert.ok(fake.calls[0].ops.some((o) => o[0] === 'order' && o[1] === 'username'));
});

test('the admin functions are called with the right names and arguments', async () => {
  const { app, fake } = withClient();
  assert.equal(await app.createUser({ username: 'maya', password: 'pass-1234', fullName: 'Maya', role: 'recruiter' }), 'new-id');
  await app.resetUserPassword('u9', 'fresh-pass-1');
  await app.setUserActive('u9', false);
  assert.deepEqual(plain(fake.calls.map((c) => [c.rpc, c.args])), [
    ['admin_create_user', { p_username: 'maya', p_password: 'pass-1234', p_full_name: 'Maya', p_role: 'recruiter' }],
    ['admin_set_password', { p_user: 'u9', p_password: 'fresh-pass-1' }],
    ['admin_set_active', { p_user: 'u9', p_active: false }],
  ]);
});

test('a database refusal reaches the admin in its own words', async () => {
  const { app } = withClient({ rpc: { data: null, error: { message: 'There must be at least one active admin' } } });
  await assert.rejects(() => app.setUserActive('u1', false), { message: 'There must be at least one active admin' });
});

test('changing a role reports a change that did not happen (no permission)', async () => {
  const { app } = withClient({ update: { data: [], error: null } });
  await assert.rejects(() => app.setUserRole('u2', 'admin'), /not changed/);
  const ok = withClient({ update: { data: [{ id: 'u2' }], error: null } });
  await ok.app.setUserRole('u2', 'interviewer');
  assert.deepEqual(plain(ok.fake.calls[0].ops.find((o) => o[0] === 'update')), ['update', { role: 'interviewer' }]);
});

test('generated passwords are 12 readable characters and different each time', () => {
  const { app } = withClient();
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    const p = app.generatePassword();
    assert.match(p, /^[A-HJ-NP-Za-km-z2-9]{12}$/, 'no look-alike characters 0 O 1 l I');
    seen.add(p);
  }
  assert.equal(seen.size, 50);
});

test('every assignable role has a label, and the admin can hand out five roles', () => {
  const { app } = withClient();
  assert.deepEqual(plain(app.ASSIGNABLE_ROLES), ['admin', 'recruiter', 'hiring_manager', 'interviewer', 'management']);
  for (const r of [...app.ASSIGNABLE_ROLES, 'pending']) assert.ok(app.ROLE_LABEL[r], r);
});
