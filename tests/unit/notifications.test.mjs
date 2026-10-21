// Who is told what: each use case names the people who need to know; only the signed-in person's own notification joins this browser's list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const app = loadApp({ until: 'services', expose: ['S', 'repoOnChange', 'createCandidateApplication', 'schedulePersonalInterview', 'scheduleGroupInterview', 'addTask', 'markOfferSent', 'saveOffer', 'recordOfferResponse'] });

const fields = { name: 'Notified Person', designation: '', company: '', exp: 1, location: '', education: '', eduField: '', university: '', gradYear: 2020, skills: [], curSal: 1, expSal: 2, notice: 30, reloc: false,
  email: '', phone: '', certifications: [], achievements: [], documents: [], notes: [], source: '', history: [], resumeText: '' };
const heard = [];
app.repoOnChange((c) => { if (c.op === 'send') heard.push([c.recipient, c.record.text]); });
const told = (who, re) => heard.some(([w, t]) => w === who && re.test(t));

test('the recruiter of the opening hears of a new application', () => {
  const op = app.S.openings.find((o) => o.recruiter !== app.S.settings.user);
  const r = app.createCandidateApplication({ ...fields, created: app.S.openings[0].opened }, op.id);
  assert.ok(told(op.recruiter, /New application: Notified Person/));
  heard.length = 0;
  app.schedulePersonalInterview({ appId: r.aid, round: 'Technical', date: '2030-01-01', time: '10:00', duration: 60, mode: 'Google Meet', link: '', location: '', interviewers: ['Vikram Singh'] });
  assert.ok(told('Vikram Singh', /Technical interview with Notified Person/), 'the interviewer hears of the interview');
});

test('a group interview tells the recruiter and the panel', () => {
  heard.length = 0;
  const op = app.S.openings[0];
  const apps = app.S.applications.filter((a) => a.opId === op.id).slice(0, 2).map((a) => a.id);
  app.scheduleGroupInterview({ opId: op.id, date: '2030-01-01', time: '11:00', duration: 60, mode: 'Office', location: '', link: '', panel: 'P', interviewers: ['Kavita Rao', 'Farah Khan'], appIds: apps });
  for (const who of ['Kavita Rao', 'Farah Khan']) assert.ok(told(who, /Group interview set for/), who);
});

test('a task given to someone else tells them; one for yourself does not', () => {
  heard.length = 0;
  app.addTask({ title: 'Mine', due: '2030-01-01', priority: 'Low', related: 'x', owner: app.S.settings.user });
  assert.equal(heard.length, 0);
  app.addTask({ title: 'Yours', due: '2030-01-01', priority: 'Low', related: 'x', owner: 'Arjun Nair' });
  assert.ok(told('Arjun Nair', /New task for you: Yours/));
});
