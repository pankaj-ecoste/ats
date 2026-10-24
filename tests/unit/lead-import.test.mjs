import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const plain = (x) => JSON.parse(JSON.stringify(x));
const fresh = () => loadApp({
  until: 'services',
  expose: ['S', 'repo', 'repoOnChange', 'parseCsv', 'leadTable', 'leadCellText', 'LEAD_FIELDS', 'guessLeadMap', 'cleanLeadPhone', 'leadDate',
    'planLeads', 'leadCounts', 'importLeads', 'getOp', 'LEAD_IMPORT_MAX'],
});

test('a CSV is read with quotes, doubled quotes, line breaks inside quotes, a BOM and other separators', () => {
  const app = fresh();
  assert.deepEqual(plain(app.parseCsv('﻿Name,City\r\n"Rao, Asha","Pune ""East"""\r\nRavi,"Del\nhi"\r\n')),
    [['Name', 'City'], ['Rao, Asha', 'Pune "East"'], ['Ravi', 'Del\nhi']]);
  assert.deepEqual(plain(app.parseCsv('Name;City\nA;B')), [['Name', 'City'], ['A', 'B']]);
  assert.deepEqual(plain(app.parseCsv('Name\tCity\nA\tB')), [['Name', 'City'], ['A', 'B']]);
  assert.deepEqual(plain(app.parseCsv('')), []);
});

test('the heading row is the first row with two filled cells; blank rows are skipped but keep their place; repeated headings are told apart', () => {
  const app = fresh();
  const t = plain(app.leadTable([['Leads from October'], [''], ['Name', 'Phone', 'Name', ''], ['Asha', '98765 43210', 'x', ''], ['', '', '', ''], ['Ravi', '99999 11111', '', '']]));
  assert.deepEqual(t.headers, ['Name', 'Phone', 'Name (2)', 'Column 4']);
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[0].n, 4);
  assert.equal(t.rows[1].n, 6);
  assert.equal(t.rows[1].Name, 'Ravi');
  assert.deepEqual(plain(app.leadTable([['only one'], ['cell']])), { headers: [], rows: [] });
});

test('spreadsheet cells become plain text: whole numbers, dates, links, rich text and formula results', () => {
  const app = fresh();
  assert.equal(app.leadCellText(9876543210), '9876543210');
  assert.equal(app.leadCellText(9.87654321e9), '9876543210');
  assert.equal(app.leadCellText(4.5), '4.5');
  assert.equal(app.leadCellText(new Date('2026-10-12T00:00:00Z')), '2026-10-12');
  assert.equal(app.leadCellText({ text: 'a@b.com', hyperlink: 'mailto:a@b.com' }), 'a@b.com');
  assert.equal(app.leadCellText({ richText: [{ text: 'Asha ' }, { text: 'Rao' }] }), 'Asha Rao');
  assert.equal(app.leadCellText({ formula: 'A1', result: 42 }), '42');
  assert.equal(app.leadCellText(null), '');
  assert.equal(app.leadCellText('  hi '), 'hi');
});

test('phone numbers: spaces, dashes, +91, 0 and 091 in front, Excel exponent form; rubbish gives nothing', () => {
  const app = fresh();
  const k = (v) => plain(app.cleanLeadPhone(v));
  const ok = { text: '+91 98765 43210', key: '9876543210' };
  assert.deepEqual(k('98765 43210'), ok);
  assert.deepEqual(k('+91-98765-43210'), ok);
  assert.deepEqual(k('919876543210'), ok);
  assert.deepEqual(k('09876543210'), ok);
  assert.deepEqual(k('0919876543210'), ok);
  assert.deepEqual(k('9.87654321E9'), ok);
  assert.deepEqual(k(9876543210), ok);
  assert.deepEqual(k('+44 20 7946 0958'), { text: '+442079460958', key: '2079460958' });
  assert.deepEqual(k('12345'), { text: '', key: '' });
  assert.deepEqual(k('1234567890'), { text: '', key: '' });   // an Indian mobile starts with 6 to 9
  assert.deepEqual(k(''), { text: '', key: '' });
  assert.deepEqual(k(null), { text: '', key: '' });
});

test('columns are guessed from the usual headings, each heading used once, without false hits', () => {
  const app = fresh();
  const m = plain(app.guessLeadMap(['S.No', 'Candidate Name', 'Mobile Number', 'Email ID', 'City', 'Total Experience', 'Current CTC', 'Expected CTC', 'Notice Period', 'Remarks', 'Lead Date', 'Campaign']));
  assert.deepEqual(m, { name: 'Candidate Name', phone: 'Mobile Number', email: 'Email ID', location: 'City', exp: 'Total Experience', curSal: 'Current CTC', expSal: 'Expected CTC', notice: 'Notice Period', notes: 'Remarks', date: 'Lead Date', source: 'Campaign' });
  // "Candidate ID" holds the word "date" inside "candidate"; "Excellent" holds "cell"
  const m2 = plain(app.guessLeadMap(['Candidate ID', 'Excellent', "Applicant's Name", 'Alternate Phone']));
  assert.equal(m2.date, undefined);
  assert.equal(m2.phone, 'Alternate Phone');
  assert.equal(m2.name, "Applicant's Name");
  assert.deepEqual(plain(app.guessLeadMap(['foo', 'bar'])), {});
  assert.ok(app.LEAD_FIELDS.filter((f) => f.need).map((f) => f.key).join() === 'name,phone');
});

test('dates: Excel and typed forms, day first, anything else is the fallback', () => {
  const app = fresh();
  assert.equal(app.leadDate('2026-10-12', 'x'), '2026-10-12');
  assert.equal(app.leadDate('2026-10-12 14:30:00', 'x'), '2026-10-12');
  assert.equal(app.leadDate('12/10/2026', 'x'), '2026-10-12');
  assert.equal(app.leadDate('5.1.26', 'x'), '2026-01-05');
  assert.equal(app.leadDate('31/02/2026', 'x'), '2026-02-31');   // the calendar is not checked, only the range
  assert.equal(app.leadDate('13/13/2026', 'x'), 'x');
  assert.equal(app.leadDate('yesterday', 'x'), 'x');
  assert.equal(app.leadDate('', 'x'), 'x');
});

// a small sheet and a state with one known person
const sheet = (rows) => ({ rows: rows.map((r, i) => ({ n: i + 2, ...r })) });
const MAP = { name: 'Name', phone: 'Phone', email: 'Email', location: 'City', skills: 'Skills', exp: 'Exp', curSal: 'CTC', notice: 'Notice', source: 'Src', date: 'Date', notes: 'Remarks' };
function withPeople() {
  const app = fresh();
  const op = app.S.openings.find((o) => o.status !== 'Closed');
  const other = app.S.openings.find((o) => o.id !== op.id);
  app.S.candidates.length = 0; app.S.applications.length = 0;
  app.S.candidates.push({ id: 'C-OLD', name: 'Meena Iyer', email: 'meena@example.com', phone: '+91 91111 22222', notes: [], skills: [], documents: [], history: [] });
  app.S.applications.push({ id: 'A-OLD', cid: 'C-OLD', opId: other.id, stage: 'New' });
  return { app, op };
}

test('a plan sorts rows into new, existing, duplicate and unusable', () => {
  const { app, op } = withPeople();
  const t = sheet([
    { Name: 'Asha Rao', Phone: '98765 43210', Email: '', City: 'Pune' },                  // new
    { Name: 'Asha R', Phone: '+91 98765 43210', Email: '' },                               // same phone again in the file
    { Name: 'Meena I', Phone: '9111122222', Email: '' },                                   // in the system, never applied here
    { Name: 'Ravi', Phone: '', Email: 'ravi@example.com' },                                // email only is enough
    { Name: '', Phone: '99999 88888' },                                                    // no name
    { Name: 'Nobody', Phone: '123', Email: 'not-an-email' },                               // nothing usable
    { Name: 'Kiran', Phone: '', Email: '' },                                               // nothing at all
    { Name: 'Dev', Phone: '98000 00001', Email: 'MEENA@example.com' },                     // email of an existing person, different phone
  ]);
  const plan = plain(app.planLeads(t, MAP, op.id));
  assert.deepEqual(plan.map((p) => p.status), ['new', 'dup', 'existing', 'new', 'skip', 'skip', 'skip', 'existing']);
  assert.equal(plan[1].why, 'Repeated in this file');
  assert.equal(plan[2].ex, 'C-OLD');
  assert.equal(plan[4].why, 'No name');
  assert.equal(plan[5].why, 'Phone or email is not valid');
  assert.equal(plan[6].why, 'No phone or email');
  assert.equal(plan[0].phone, '+91 98765 43210');
  assert.deepEqual(plain(app.leadCounts(plan)), { new: 2, existing: 2, dup: 1, skip: 3 });
});

test('someone who already applied for this opening is a duplicate; a second import of the same sheet adds nothing', () => {
  const { app, op } = withPeople();
  const t = sheet([{ Name: 'Asha Rao', Phone: '98765 43210' }, { Name: 'Ravi K', Phone: '97000 11111' }]);
  const r1 = app.importLeads(app.planLeads(t, MAP, op.id), { opId: op.id, source: 'Facebook Ad' });
  assert.equal(r1.added, 2);
  const again = app.planLeads(t, MAP, op.id);
  assert.deepEqual(plain(app.leadCounts(again)), { new: 0, existing: 0, dup: 2, skip: 0 });
  assert.match(again[0].why, /Already applied/);
  assert.equal(app.importLeads(again, { opId: op.id, source: 'x' }).added, 0);
});

test('an import adds candidates and applications to the opening, in one batch each, with what the sheet knew', () => {
  const { app, op } = withPeople();
  const heard = [];
  app.repoOnChange((c) => heard.push(`${c.op}:${c.coll}:${(c.records || []).length}`));
  const t = sheet([
    { Name: ' Asha Rao ', Phone: '98765 43210', Email: 'ASHA@Example.com', City: 'Pune', Skills: 'Java, SQL; Kafka', Exp: '4 years', CTC: '10 LPA', Notice: '1 month', Src: 'Instagram Ad', Date: '12/10/2026', Remarks: 'Calls after 6pm' },
    { Name: 'Ravi K', Phone: '97000 11111' },
    { Name: 'Meena I', Phone: '9111122222' },
  ]);
  const r = app.importLeads(app.planLeads(t, MAP, op.id), { opId: op.id, source: 'Facebook Ad' });
  assert.deepEqual({ added: r.added, existing: r.existing }, { added: 3, existing: 1 });
  assert.ok(heard.includes('insertMany:candidates:2'), heard.join());
  assert.ok(heard.includes('insertMany:applications:3'), heard.join());
  assert.ok(heard.indexOf('insertMany:candidates:2') < heard.indexOf('insertMany:applications:3'), 'candidates are announced before their applications');

  const asha = app.S.candidates.find((c) => c.name === 'Asha Rao');
  assert.equal(asha.email, 'asha@example.com');
  assert.equal(asha.phone, '+91 98765 43210');
  assert.equal(asha.location, 'Pune');
  assert.deepEqual(plain(asha.skills), ['Java', 'SQL', 'Kafka']);
  assert.equal(asha.exp, 4);
  assert.equal(asha.curSal, 10);
  assert.equal(asha.notice, 30);
  assert.equal(asha.source, 'Instagram Ad');
  assert.equal(asha.created, '2026-10-12');
  assert.equal(asha.notes[0].text, 'Calls after 6pm');
  const ravi = app.S.candidates.find((c) => c.name === 'Ravi K');
  assert.equal(ravi.source, 'Facebook Ad');             // the batch source fills in where the sheet has none
  assert.equal(ravi.location, '—');
  assert.equal(ravi.designation, '—');
  assert.equal(ravi.notice, 30);
  assert.equal(app.S.candidates.filter((c) => c.name === 'Meena Iyer').length, 1);   // not created twice

  const apps = app.S.applications.filter((a) => a.opId === op.id);
  assert.equal(apps.length, 3);
  assert.ok(apps.every((a) => a.stage === 'New' && a.maxStage === 0 && a.recruiter === app.getOp(op.id).recruiter && !a.screening));
  assert.ok(apps.some((a) => a.cid === 'C-OLD'));
  assert.ok(app.S.activity[0].text.includes('Imported 3 leads'));
});

test('an import with nothing usable changes nothing; an opening is required; the size is limited', () => {
  const { app, op } = withPeople();
  const before = app.S.candidates.length;
  assert.equal(app.importLeads([], { opId: op.id, source: 'x' }).added, 0);
  assert.throws(() => app.importLeads(app.planLeads(sheet([{ Name: 'A', Phone: '98765 43210' }]), MAP, op.id), { opId: 'OP-NONE', source: 'x' }), /Choose the opening/);
  assert.equal(app.S.candidates.length, before);
  const many = Array.from({ length: app.LEAD_IMPORT_MAX + 1 }, (_, i) => ({ status: 'new', name: 'N' + i, phone: '', email: '', v: { skills: [] } }));
  assert.throws(() => app.importLeads(many, { opId: op.id, source: 'x' }), /at most/);
});

test('5,000 rows are planned and imported quickly', () => {
  const { app, op } = withPeople();
  const rows = Array.from({ length: 5000 }, (_, i) => ({ Name: 'Lead ' + i, Phone: String(6000000000 + i * 7919), Email: i % 3 ? '' : `lead${i}@example.com`, City: 'Pune' }));
  const t0 = Date.now();
  const plan = app.planLeads(sheet(rows), MAP, op.id);
  const r = app.importLeads(plan, { opId: op.id, source: 'Ad' });
  const ms = Date.now() - t0;
  assert.equal(r.added, 5000);
  assert.equal(new Set(app.S.candidates.map((c) => c.id)).size, 5001);
  assert.ok(ms < 3000, `took ${ms} ms`);
});
