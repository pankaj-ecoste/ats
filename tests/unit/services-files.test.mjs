// Duplicates by email or phone, the files behind a résumé and a checklist item, and applying again for an existing candidate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const fresh = () => loadApp({ until: 'services', expose: ['S', 'findDuplicateCandidate', 'phoneKey', 'attachResume', 'attachDocumentFile', 'applyCandidate', 'createCandidateApplication', 'getC', 'getA'] });

test('a duplicate is found by email in any letter case, or by the last 10 digits of the phone', () => {
  const app = fresh();
  const c = app.S.candidates[0];
  c.email = 'Ritika.Sen@Mail.com'; c.phone = '+91 98450 11223';
  assert.equal(app.findDuplicateCandidate({ email: ' ritika.sen@mail.com ' }).id, c.id);
  assert.equal(app.findDuplicateCandidate({ phone: '098450-11223' }).id, c.id);
  assert.equal(app.findDuplicateCandidate({ phone: '9845011223' }).id, c.id);
  assert.equal(app.findDuplicateCandidate({ email: 'other@mail.com', phone: '12345' }), null);
  assert.equal(app.findDuplicateCandidate({ email: '', phone: '' }), null, 'nothing to compare is never a duplicate');
  assert.equal(app.findDuplicateCandidate({ email: c.email }, c.id), null, 'a person is not their own duplicate');
});
test('a short or missing phone number never matches', () => {
  const app = fresh();
  assert.equal(app.phoneKey('12345'), '');
  assert.equal(app.phoneKey(null), '');
  assert.equal(app.phoneKey('+91 (984) 501-1223'), '9845011223');
});

test('attaching a résumé file records its path and name and logs it', () => {
  const app = fresh();
  const c = app.S.candidates[0];
  app.attachResume(c.id, { path: `${c.id}/F-ABC-cv.pdf`, name: 'cv.pdf' });
  assert.equal(c.resumePath, `${c.id}/F-ABC-cv.pdf`);
  assert.equal(c.resumeName, 'cv.pdf');
  assert.match(app.S.activity[0].text, /Resume file uploaded for .*: cv\.pdf/);
});

test('attaching a file to a checklist item keeps the file name; a Pending item becomes Received, a Verified one stays Verified', () => {
  const app = fresh();
  const c = app.S.candidates[0];
  c.documents = [{ name: 'PAN', status: 'Pending' }, { name: 'Degree', status: 'Verified' }];
  app.attachDocumentFile(c.id, 0, { path: `${c.id}/F-1-pan.pdf`, file: 'pan.pdf' });
  app.attachDocumentFile(c.id, 1, { path: `${c.id}/F-2-degree.pdf`, file: 'degree.pdf' });
  assert.deepEqual(JSON.parse(JSON.stringify(c.documents)), [
    { name: 'PAN', status: 'Received', path: `${c.id}/F-1-pan.pdf`, file: 'pan.pdf' },
    { name: 'Degree', status: 'Verified', path: `${c.id}/F-2-degree.pdf`, file: 'degree.pdf' },
  ]);
});

test('applying again: a new opening adds an application, the same opening adds nothing', () => {
  const app = fresh();
  const a = app.S.applications[0], c = app.getC(a.cid);
  const other = app.S.openings.find((o) => o.id !== a.opId && !app.S.applications.some((x) => x.cid === c.id && x.opId === o.id));
  const n = app.S.applications.length;
  const same = app.applyCandidate(c, a.opId);
  assert.equal(same.existing, true);
  assert.equal(same.aid, a.id);
  assert.equal(app.S.applications.length, n);
  const added = app.applyCandidate(c, other.id);
  assert.equal(added.existing, false);
  assert.equal(app.S.applications.length, n + 1);
  assert.equal(app.getA(added.aid).stage, 'New');
});
