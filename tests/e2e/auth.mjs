// The sign-in screen and the Users screen, clicked through in a real browser against the live Supabase project.
//   npm run test:e2e:auth            (add `-- dist` to test the built file)
// Needs DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY in .env. Skips quietly when they are missing.
// It creates test accounts named zz<tag>_... and removes them again at the end.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { connect, loadEnv } from '../../scripts/db.mjs';
import { createTestAdmin, newTag, removeTestAccounts } from '../support/accounts.mjs';

loadEnv();
if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.log('SKIP auth: DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY are not all set');
  process.exit(0);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.argv[2] === 'dist' ? 'dist/Ecoste_Recruit_Tracker.html' : 'index.html';
const cfg = { supabaseUrl: process.env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''), anonKey: process.env.SUPABASE_ANON_KEY };
const tag = newTag();
const ADMIN = `${tag}_admin`, REC = `${tag}_rec`, ADMIN_PW = 'admin-pass-1';

const db = connect();
await db.connect();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const results = [];
const check = (name, ok) => results.push([name, !!ok]);
let context;

async function freshPage() {
  if (context) await context.close();
  context = await browser.newContext();
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript((c) => { globalThis.__APP_CONFIG_OVERRIDE = c; }, cfg);
  await page.goto(pathToFileURL(resolve(root, target)).href);
  return page;
}
const loginShown = (page) => page.waitForSelector('#loginForm', { state: 'visible', timeout: 15000 });
const appShown = (page) => page.waitForSelector('.app', { state: 'visible', timeout: 15000 });
async function signIn(page, user, password) {
  await loginShown(page);
  await page.fill('#loginForm [name="username"]', user);
  await page.fill('#loginForm [name="password"]', password);
  await page.click('#loginBtn');
}
async function signOut(page) {
  await page.click('#meBtn');
  await page.click('#meDD [data-act="signOut"]');
  await loginShown(page);
}
const topName = (page) => page.locator('#top .me-btn b').innerText();
const topRole = (page) => page.locator('#top .me-btn small').innerText();
const hasNav = (page, view) => page.locator(`#side [data-go="${view}"]`).count().then((n) => n > 0);
const closeModals = (page) => page.evaluate(() => { while (modalStack.length) closeModal(); });
const row = (page, user) => page.locator(`#content tr:has(b:text-is("${user}"))`);

let page;
try {
  await removeTestAccounts(db, tag);
  await createTestAdmin(db, tag, ADMIN_PW, 'Test Admin');

  /* ---- signed out ---- */
  page = await freshPage();
  await loginShown(page);
  check('signed out: the sign-in screen shows and the app is hidden', (await page.locator('.app').isHidden()) && (await page.locator('#loginForm').isVisible()));
  await signIn(page, ADMIN, 'wrong-password');
  await page.waitForFunction(() => document.getElementById('authErr').textContent.length > 0);
  check('wrong password: a plain message and the app stays hidden', (await page.locator('#authErr').innerText()) === 'Wrong username or password.' && (await page.locator('.app').isHidden()));
  await page.fill('#loginForm [name="username"]', `${tag}_nobody`);
  await page.fill('#loginForm [name="password"]', 'whatever-123');
  await page.click('#loginBtn');
  await page.waitForFunction(() => document.getElementById('authErr').textContent.length > 0);
  check('unknown username: the same message, nothing revealed', (await page.locator('#authErr').innerText()) === 'Wrong username or password.');

  /* ---- admin ---- */
  await page.fill('#loginForm [name="username"]', ADMIN);
  await page.fill('#loginForm [name="password"]', ADMIN_PW);
  await page.click('#loginBtn');
  await appShown(page);
  check('admin signs in: the app shows, with their name and role in the top bar', (await topName(page)) === 'Test Admin' && (await topRole(page)) === 'Admin');
  check('admin sees the Users page in the menu', await hasNav(page, 'users'));
  await page.reload();
  await appShown(page);
  check('reloading keeps the person signed in', (await topName(page)) === 'Test Admin');

  await page.click('#side [data-go="users"]');
  await row(page, ADMIN).waitFor();
  check('users: the admin sees themselves, cannot change their own role or switch themselves off', (await row(page, ADMIN).locator('select[data-urole]').isDisabled()) && (await row(page, ADMIN).locator('[data-act="userToggle"]').count()) === 0);

  /* ---- create a user from the screen ---- */
  await page.click('[data-act="userNew"]');
  await page.fill('#nuU', REC);
  await page.fill('#nuN', 'Test Recruiter');
  await page.selectOption('#nuR', 'recruiter');
  const recPw = await page.inputValue('#nuP');
  check('add user: a readable password is suggested', recPw.length >= 12 && !/[0O1lI]/.test(recPw));
  await page.click('#nuS');
  await page.waitForSelector('#cpy');
  check('add user: the username and password are shown once', (await page.locator('.modal dl.kv dd b').nth(0).innerText()) === REC && (await page.locator('.modal dl.kv dd b').nth(1).innerText()) === recPw);
  await page.click('.modal [data-close]');
  await row(page, REC).waitFor();
  check('add user: the new account appears in the table as an active recruiter', (await row(page, REC).innerText()).includes('Active') && (await row(page, REC).locator('select[data-urole]').inputValue()) === 'recruiter');
  await page.click('[data-act="userNew"]');
  await page.fill('#nuU', REC);
  await page.fill('#nuP', 'long-enough-1');
  await page.click('#nuS');
  await page.waitForFunction(() => document.getElementById('nuE').textContent.length > 0);
  check('add user: a taken username is refused with a plain message', /already taken/.test(await page.locator('#nuE').innerText()));
  await page.fill('#nuU', `${tag}_other`);
  await page.fill('#nuP', 'short');
  await page.click('#nuS');
  await page.waitForFunction(() => /8 characters/.test(document.getElementById('nuE').textContent));
  check('add user: a short password is refused with a plain message', /at least 8 characters/.test(await page.locator('#nuE').innerText()));
  await closeModals(page);

  /* ---- the new user ---- */
  await signOut(page);
  check('sign out: back to the sign-in screen', await page.locator('.app').isHidden());
  await signIn(page, REC, recPw);
  await appShown(page);
  check('recruiter signs in with the password the admin gave', (await topName(page)) === 'Test Recruiter' && (await topRole(page)) === 'Recruiter');
  check('recruiter does not see the Users page', !(await hasNav(page, 'users')));
  await page.evaluate(() => go('users'));
  check('recruiter who opens the Users page directly gets "No access"', (await page.locator('#content').innerText()).includes('No access'));

  /* ---- change own password ---- */
  await page.click('#meBtn');
  await page.click('#meDD [data-act="changePassword"]');
  await page.fill('#pw1', 'my-new-pass-77');
  await page.fill('#pw2', 'something-else-1');
  await page.click('#pwSave');
  check('change password: two different entries are refused', (await page.locator('#pwErr').innerText()).includes('not the same'));
  await page.fill('#pw1', 'short');
  await page.fill('#pw2', 'short');
  await page.click('#pwSave');
  await page.waitForFunction(() => /8 characters/.test(document.getElementById('pwErr').textContent));
  await page.fill('#pw1', 'my-new-pass-77');
  await page.fill('#pw2', 'my-new-pass-77');
  await page.click('#pwSave');
  await page.waitForSelector('.modal', { state: 'detached' });
  await signOut(page);
  await signIn(page, REC, recPw);
  await page.waitForFunction(() => document.getElementById('authErr').textContent.length > 0);
  check('change password: the old password stops working', (await page.locator('#authErr').innerText()) === 'Wrong username or password.');
  await page.fill('#loginForm [name="password"]', 'my-new-pass-77');
  await page.click('#loginBtn');
  await appShown(page);
  check('change password: the new password works', (await topName(page)) === 'Test Recruiter');
  await signOut(page);

  /* ---- the admin resets it ---- */
  await signIn(page, ADMIN, ADMIN_PW);
  await appShown(page);
  await page.click('#side [data-go="users"]');
  await row(page, REC).waitFor();
  await row(page, REC).locator('[data-act="userReset"]').click();
  const resetPw = await page.inputValue('#rpP');
  await page.click('#rpS');
  await page.waitForSelector('#cpy');
  check('reset password: the new password is shown once', (await page.locator('.modal dl.kv dd b').nth(1).innerText()) === resetPw);
  await page.click('.modal [data-close]');
  await signOut(page);
  await signIn(page, REC, 'my-new-pass-77');
  await page.waitForFunction(() => document.getElementById('authErr').textContent.length > 0);
  check('reset password: the password they chose is replaced', (await page.locator('#authErr').innerText()) === 'Wrong username or password.');
  await page.fill('#loginForm [name="password"]', resetPw);
  await page.click('#loginBtn');
  await appShown(page);
  check('reset password: the admin-set password works', (await topName(page)) === 'Test Recruiter');
  await signOut(page);

  /* ---- role change, switch off and on ---- */
  await signIn(page, ADMIN, ADMIN_PW);
  await appShown(page);
  await page.click('#side [data-go="users"]');
  await row(page, REC).waitFor();
  await row(page, REC).locator('select[data-urole]').selectOption('interviewer');
  await page.waitForFunction((u) => [...document.querySelectorAll('#content tr')].some((r) => r.textContent.includes(u) && r.querySelector('select').value === 'interviewer'), REC);
  await row(page, REC).locator('[data-act="userToggle"]').click();
  await page.click('#cOK');
  await page.waitForFunction((u) => [...document.querySelectorAll('#content tr')].some((r) => r.textContent.includes(u) && r.textContent.includes('Switched off')), REC);
  check('switch off: the row shows Switched off', true);
  await signOut(page);
  await signIn(page, REC, resetPw);
  await page.waitForFunction(() => document.getElementById('authErr').textContent.length > 0);
  check('switch off: the person cannot sign in and is told why', (await page.locator('#authErr').innerText()) === 'This account is switched off. Ask an admin.');
  await page.fill('#loginForm [name="username"]', ADMIN);
  await page.fill('#loginForm [name="password"]', ADMIN_PW);
  await page.click('#loginBtn');
  await appShown(page);
  await page.click('#side [data-go="users"]');
  await row(page, REC).locator('[data-act="userToggle"]').click();
  await page.waitForFunction((u) => [...document.querySelectorAll('#content tr')].some((r) => r.textContent.includes(u) && r.textContent.includes('Active')), REC);
  await signOut(page);
  await signIn(page, REC, resetPw);
  await appShown(page);
  check('switch on again and change role: the person signs in as an interviewer', (await topRole(page)) === 'Interviewer');
  await signOut(page);

  /* ---- waiting for approval ---- */
  await db.query("update public.profiles set role = 'pending' where username = $1", [REC]);
  await signIn(page, REC, resetPw);
  await page.waitForSelector('.auth-card [data-act="signOut"]');
  check('a pending account is told to wait and sees no app', (await page.locator('.auth-card').innerText()).includes('waiting for an admin') && (await page.locator('.app').isHidden()));
  await page.click('.auth-card [data-act="signOut"]');
  await loginShown(page);
  check('page errors', page.errors.length === 0 || (console.error(page.errors), false));
} catch (e) {
  check(`unexpected failure: ${String(e.message).split('\n')[0]}`, false);
  if (page) await page.screenshot({ path: resolve(root, 'dist/auth-failure.png') }).catch(() => {});
} finally {
  try { await browser.close(); } catch { /* already closed */ }
  try { await removeTestAccounts(db, tag); } finally { await db.end(); }
}

for (const [n, ok] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`);
if (results.some(([, ok]) => !ok)) { console.error('FAIL', target); process.exit(1); }
console.log(`OK ${target}: ${results.length} sign-in checks`);
