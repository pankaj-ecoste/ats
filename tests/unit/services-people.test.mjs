import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

// objects built inside the vm context have another realm's prototypes, so compare them as JSON
const plain = (x) => JSON.parse(JSON.stringify(x));

const fresh = () => loadApp({
  until: 'services',
  expose: ['S', 'repoOnChange', 'saveOpening', 'createCandidateApplication', 'assignRecruiter', 'addCandidateNote', 'setDocumentStatus',
    'requestDocument', 'updateCandidateProfile', 'recordMessage', 'getA', 'getC', 'getOp', 'today'],
});

const candidateFields = (over = {}) => ({
  name: 'Test Person', designation: 'Engineer', company: 'Acme', exp: 4, location: 'Pune', education: 'B.Tech', eduField: 'Computer Science',
  university: '—', gradYear: 2022, skills: ['Java', 'SQL'], curSal: 10, expSal: 14, notice: 30, reloc: false, email: 't@example.com',
  phone: '9999999999', certifications: [], achievements: [], documents: [{ name: 'Resume.pdf', status: 'Received' }], notes: [],
  source: 'Referral', created: '2026-01-01', history: [], resumeText: 'Test Person\nEngineer', ...over,
});

test('createCandidateApplication adds the candidate, a New application, an activity entry and a notification', () => {
  const app = fresh();
  const op = app.S.openings[0];
  const counts = ['candidates', 'applications', 'activity', 'notifications'].map((k) => app.S[k].length);
  const r = app.createCandidateApplication(candidateFields(), op.id);
  assert.match(r.cid, /^C-\d+$/);
  assert.match(r.aid, /^APP-\d+$/);
  assert.equal(app.getC(r.cid).name, 'Test Person');
  const a = app.getA(r.aid);
  assert.deepEqual(plain([a.cid, a.opId, a.stage, a.maxStage, a.recruiter, a.stageSince]), [r.cid, op.id, 'New', 0, op.recruiter, app.today()]);
  assert.ok(Number.isInteger(r.score) && r.score >= 0 && r.score <= 100);
  assert.deepEqual(['candidates', 'applications', 'activity', 'notifications'].map((k) => app.S[k].length), counts.map((n) => n + 1));
  assert.deepEqual(plain(app.S.notifications[0].go), ['candidate', r.cid]);
});

test('saveOpening creates a new opening and logs it, or updates an existing one', () => {
  const app = fresh();
  const n = app.S.openings.length, logs = app.S.activity.length;
  const o = app.saveOpening({ id: 'OP-TEST', title: 'Tester', status: 'Open' });
  assert.equal(app.S.openings[0], o);
  assert.equal(app.S.openings.length, n + 1);
  assert.equal(app.S.activity.length, logs + 1);
  app.saveOpening({ title: 'Senior Tester' }, 'OP-TEST');
  assert.equal(app.getOp('OP-TEST').title, 'Senior Tester');
  assert.equal(app.S.openings.length, n + 1);
  assert.equal(app.S.activity.length, logs + 1, 'editing does not log a creation');
});

test('assignRecruiter changes every selected application', () => {
  const app = fresh();
  const ids = app.S.applications.slice(0, 3).map((a) => a.id);
  app.assignRecruiter(ids, 'Sneha Kapoor');
  assert.ok(ids.every((id) => app.getA(id).recruiter === 'Sneha Kapoor'));
});

test('candidate notes go first and are logged under the candidate', () => {
  const app = fresh();
  const c = app.S.candidates[0];
  app.addCandidateNote(c.id, 'Strong communicator');
  assert.equal(c.notes[0].text, 'Strong communicator');
  assert.equal(c.notes[0].by, app.S.settings.user);
  assert.match(app.S.activity[0].text, new RegExp(c.name));
});

test('documents: request adds a Pending one, status can be changed', () => {
  const app = fresh();
  const c = app.S.candidates[0];
  const n = c.documents.length;
  app.requestDocument(c.id, 'Payslips');
  assert.deepEqual(plain(c.documents[n]), { name: 'Payslips', status: 'Pending' });
  app.setDocumentStatus(c.id, n, 'Verified');
  assert.equal(c.documents[n].status, 'Verified');
});

test('updateCandidateProfile applies the fields and keeps the resume heading in step with the name', () => {
  const app = fresh();
  const c = app.S.candidates[0];
  app.updateCandidateProfile(c.id, { name: 'Renamed Person', skills: ['Go'], exp: 9 });
  assert.equal(c.name, 'Renamed Person');
  assert.deepEqual(plain(c.skills), ['Go']);
  assert.equal(c.resumeText.split('\n')[0], 'Renamed Person');
  assert.match(app.S.activity[0].text, /Resume data edited for Renamed Person/);
});

test('recordMessage writes a message entry against the application', () => {
  const app = fresh();
  const a = app.S.applications[0];
  app.recordMessage({ cid: a.cid, aid: a.id, channel: 'Email', template: 'Interview invite' });
  assert.equal(app.S.activity[0].type, 'message');
  assert.equal(app.S.activity[0].appId, a.id);
});
