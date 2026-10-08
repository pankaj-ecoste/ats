// Browser check that user actions end up in the data through the services (src/services/).
//   npm run test:e2e:flows            (add `-- dist` to test the single-file build)
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.argv[2] === 'dist' ? 'dist/Ecoste_Recruit_Tracker.html' : 'index.html';
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(resolve(root, target)).href);

const results = [];
const check = (name, ok) => results.push([name, !!ok]);
const ev = (fn, arg) => page.evaluate(fn, arg);

// ---- openings
await ev(() => openingForm());
await page.fill('#opF [name="title"]', 'Flow Test Role');
await page.click('#opSave');
await page.waitForSelector('.scrim', { state: 'detached' });
check('openings: create saves a new opening and opens it', await ev(() => S.openings[0].title === 'Flow Test Role' && R.view === 'opening' && R.param === S.openings[0].id));
check('openings: creation is logged', await ev(() => S.activity[0].text.includes('Flow Test Role')));
await ev(() => openingForm(S.openings[0].id));
await page.fill('#opF [name="title"]', 'Flow Test Role 2');
await page.click('#opSave');
await page.waitForSelector('.scrim', { state: 'detached' });
check('openings: edit updates in place', await ev(() => S.openings[0].title === 'Flow Test Role 2' && S.openings.filter((o) => o.title.startsWith('Flow Test')).length === 1));

// ---- add candidate from resume
const before = await ev(() => ({ c: S.candidates.length, a: S.applications.length }));
await ev(() => addCandidate());
await page.click('#acParse');
await page.click('#acSave');
await page.waitForSelector('.scrim', { state: 'detached' });
const after = await ev(() => ({ c: S.candidates.length, a: S.applications.length, v: R.view, newest: S.applications[0].stage }));
check('add candidate: one candidate and one New application are created', after.c === before.c + 1 && after.a === before.a + 1 && after.newest === 'New');
check('add candidate: lands on the candidate page', after.v === 'candidate');

// ---- candidate profile: notes, documents
await page.click('[data-tab="notes"]');
await page.fill('#noteIn', 'Flow note');
await page.click('#noteAdd');
check('candidate notes: a note is added', await ev(() => getC(R.param).notes[0].text === 'Flow note'));
await page.click('[data-tab="documents"]');
await page.selectOption('[data-doc="1"]', 'Verified');
check('candidate documents: status can be changed', await ev(() => getC(R.param).documents[1].status === 'Verified'));
await page.click('#addDoc');
await page.fill('#dn', 'Payslips');
await page.click('#dS');
await page.waitForSelector('.scrim', { state: 'detached' });
check('candidate documents: a document request is added', await ev(() => getC(R.param).documents.slice(-1)[0].name === 'Payslips'));

// ---- applications: bulk assign
await page.click('[data-go="applications"]');
const ids = await ev(() => S.applications.slice(0, 2).map((a) => a.id));
await ev((l) => { l.forEach((i) => R.sel.add(i)); render(); }, ids);
await page.selectOption('#bulkRec', 'Sneha Kapoor');
check('applications: bulk assign sets the recruiter on every selected row', await ev((l) => l.every((i) => getA(i).recruiter === 'Sneha Kapoor'), ids));

await browser.close();
for (const [n, ok] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`);
if (errors.length || results.some(([, ok]) => !ok)) { console.error('FAIL', target, errors); process.exit(1); }
console.log(`OK ${target}: ${results.length} flow checks`);
