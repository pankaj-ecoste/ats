// Importing leads in a real browser: upload a CSV and an Excel file, check the column guesses and the preview, import, see the people in the list,
// and meet the refusals (repeat, wrong file, no name column).
//   npm run test:e2e:leads            (add `-- dist` to test the single-file build)
import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.argv[2] === 'dist' ? 'dist/Ecoste_Recruit_Tracker.html' : 'index.html';
const base = pathToFileURL(resolve(root, target)).href;
const dir = mkdtempSync(join(tmpdir(), 'leads-'));
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage();
await page.addInitScript(() => { globalThis.__APP_CONFIG_OVERRIDE = { supabaseUrl: '', anonKey: '' }; });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base);

const results = [];
const check = (name, ok) => results.push([name, !!ok]);
const settle = (ms = 200) => page.waitForTimeout(ms);
const text = (sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);

// someone already in the pool, and an opening they have not applied to
const known = await page.evaluate(() => {
  const c = S.candidates[0];
  const op = S.openings.find((o) => o.status !== 'Closed' && !S.applications.some((a) => a.cid === c.id && a.opId === o.id));
  return { name: c.name, phone: c.phone, opId: op.id, opTitle: op.title };
});
const before = await page.evaluate(() => ({ c: S.candidates.length, a: S.applications.length }));

const csv = [
  'S.No,Candidate Name,Mobile Number,Email ID,City,Total Experience,Current CTC,Lead Date,Campaign,Remarks',
  '1,Lead One,98765 43210,one@example.com,Pune,3,6 LPA,12/10/2026,Instagram Ad,Call after 6',
  '2,Lead Two,+91-97000-11111,,Nagpur,,,,,',
  '3,"Lead, Three",09811122233,three@example.com,Delhi,5,,,,',
  `4,Lead One Again,+91 98765 43210,,Pune,,,,,`,
  '5,,99999 88888,,,,,,,',
  `6,Known Person,${known.phone},,,,,,,`,
].join('\n');
const csvPath = join(dir, 'ad-leads.csv');
writeFileSync(csvPath, csv);

await page.evaluate(() => go('candidates')); await settle();
check('the Candidates page has an Import leads button', (await page.locator('[data-act="importLeads"]').count()) === 1);
await page.click('[data-act="importLeads"]'); await settle();
check('the window opens on choosing a file', (await page.locator('#ldFile').count()) === 1 && !(await page.locator('#ldGo').isVisible()));

// a wrong kind of file is refused in words, and the window stays on step one
writeFileSync(join(dir, 'notes.pdf'), '%PDF-1.4 fake');
await page.setInputFiles('#ldFile', join(dir, 'notes.pdf')); await settle();
check('a PDF is refused with a plain message', (await text('.toast')).includes('.csv or .xlsx') && (await page.locator('#ldFile').count()) === 1);

await page.setInputFiles('#ldFile', csvPath);
await page.waitForSelector('#ldOp'); await settle();
const guessed = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-ldf]')].map((s) => [s.dataset.ldf, s.value])));
check('the columns are matched from the headings', guessed.name === 'Candidate Name' && guessed.phone === 'Mobile Number' && guessed.email === 'Email ID' && guessed.location === 'City'
  && guessed.exp === 'Total Experience' && guessed.curSal === 'Current CTC' && guessed.date === 'Lead Date' && guessed.source === 'Campaign' && guessed.notes === 'Remarks');
check('the first row of each column is shown next to it', (await text('[data-lds="name"]')) === 'Lead One' && (await text('[data-lds="phone"]')) === '98765 43210');

await page.selectOption('#ldOp', known.opId); await settle();
const sum = await text('#ldSum');
check('the preview counts new, existing, repeated and unusable rows', /3 new/.test(sum) && /1 already in the system/.test(sum) && /1 duplicates? left out/.test(sum) && /1 cannot be used/.test(sum));
await page.locator('#ldSum summary').click();
const left = await text('#ldSum details');
check('the rows left out are listed with their row number and reason', left.includes('Row 5') && left.includes('Repeated in this file') && left.includes('Row 6') && left.includes('No name'));
check('the Import button says how many', (await text('#ldGo')) === 'Import 4 leads');

await page.fill('#ldSrc', 'Facebook Ad');
await page.click('#ldGo'); await settle(400);
const after = await page.evaluate(() => ({ c: S.candidates.length, a: S.applications.length, view: R.view }));
check('the new people and their applications are added', after.c === before.c + 3 && after.a === before.a + 4);
check('the Candidates page shows them', after.view === 'candidates' && (await text('#content')).includes('Lead One') && (await text('#content')).includes('Lead, Three'));
const saved = await page.evaluate(() => {
  const o = S.candidates.find((c) => c.name === 'Lead One'), t = S.candidates.find((c) => c.name === 'Lead Two'), th = S.candidates.find((c) => c.name === 'Lead, Three');
  const apps = S.applications.filter((a) => a.cid === o.id);
  return { o: { phone: o.phone, email: o.email, loc: o.location, exp: o.exp, sal: o.curSal, src: o.source, created: o.created, note: (o.notes[0] || {}).text },
    t: { phone: t.phone, src: t.source, loc: t.location }, th: th.phone, apps: apps.map((a) => [a.opId, a.stage]) };
});
check('a lead is saved with its own phone, email, city, experience, salary, source, date and remark',
  saved.o.phone === '+91 98765 43210' && saved.o.email === 'one@example.com' && saved.o.loc === 'Pune' && saved.o.exp === 3 && saved.o.sal === 6 && saved.o.src === 'Instagram Ad' && saved.o.created === '2026-10-12' && saved.o.note === 'Call after 6');
check('a lead without a source takes the one typed for the batch; numbers are tidied', saved.t.src === 'Facebook Ad' && saved.t.phone === '+91 97000 11111' && saved.th === '+91 98111 22233');
check('every lead starts as New in the chosen opening', saved.apps.length === 1 && saved.apps[0][0] === known.opId && saved.apps[0][1] === 'New');
check('the person already in the pool got an application, not a second profile',
  (await page.evaluate((n) => S.candidates.filter((c) => c.name === n).length, known.name)) === 1
  && (await page.evaluate(([n, op]) => { const c = S.candidates.find((x) => x.name === n); return S.applications.some((a) => a.cid === c.id && a.opId === op); }, [known.name, known.opId])));

// the same file again adds nothing
await page.click('[data-act="importLeads"]'); await settle();
await page.setInputFiles('#ldFile', csvPath); await page.waitForSelector('#ldOp');
await page.selectOption('#ldOp', known.opId); await settle();
check('the same sheet again is all repeats and cannot be imported', /0 new/.test(await text('#ldSum')) && (await text('#ldGo')) === 'Nothing to import' && await page.locator('#ldGo').isDisabled());

// without a name column there is nothing to import
await page.selectOption('[data-ldf="name"]', ''); await settle();
check('without a name column the window asks for one', (await text('#ldSum')).includes('Choose the column that holds the name') && await page.locator('#ldGo').isDisabled());
await page.click('#ldBack'); await settle();
check('Back returns to choosing a file', (await page.locator('#ldFile').count()) === 1);
await page.keyboard.press('Escape'); await settle();

// an Excel file: phone numbers as numbers, a real date, an email link, a blank row, and a second sheet that is smaller
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('October leads');
ws.addRow(['Name', 'Phone', 'Email', 'Location', 'Date']);
ws.addRow(['Excel One', 9876501234, { text: 'x1@example.com', hyperlink: 'mailto:x1@example.com' }, 'Mumbai', new Date(Date.UTC(2026, 9, 5))]);
ws.addRow([]);
ws.addRow(['Excel Two', '98765 01235', 'x2@example.com', 'Thane', '2026-10-06']);
wb.addWorksheet('Notes').addRow(['just', 'a note']);
const xlsxPath = join(dir, 'leads.xlsx');
await wb.xlsx.writeFile(xlsxPath);
await page.click('[data-act="importLeads"]'); await settle();
await page.setInputFiles('#ldFile', xlsxPath); await page.waitForSelector('#ldOp'); await settle();
check('an Excel file is read, with the biggest sheet chosen and a sheet picker', (await text('#ldSheet')).includes('October leads') && /2 new/.test(await text('#ldSum')));
await page.fill('#ldSrc', 'Newspaper Ad'); await page.click('#ldGo'); await settle(400);
const x = await page.evaluate(() => { const a = S.candidates.find((c) => c.name === 'Excel One'), b = S.candidates.find((c) => c.name === 'Excel Two'); return [a.phone, a.email, a.created, a.source, b.phone, b.created]; });
check('Excel numbers, links and dates come through as text', x[0] === '+91 98765 01234' && x[1] === 'x1@example.com' && x[2] === '2026-10-05' && x[3] === 'Newspaper Ad' && x[4] === '+91 98765 01235' && x[5] === '2026-10-06');

// the lead list can be searched and a lead can be opened and called
await page.fill('#cq', 'Excel One'); await settle();
check('a lead can be found by name', (await page.locator('[data-cand]').count()) === 1);
await page.click('[data-cand]'); await settle();
check('a lead opens as a candidate in the New stage', (await text('#content')).includes('Excel One') && (await page.evaluate(() => primaryApp(R.param).stage)) === 'New');

check('no errors in the page', errors.length === 0 || (console.error(errors), false));
await browser.close();
let bad = 0;
for (const [name, ok] of results) { console.log((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) bad++; }
console.log(bad ? `FAIL ${target}` : `OK ${target}: ${results.length} lead import checks`);
process.exit(bad ? 1 : 0);
