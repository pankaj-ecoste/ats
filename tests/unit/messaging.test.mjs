// Messages handed to the person's own email or WhatsApp, kept in a record, and calendar invites.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const app = loadApp({ until: 'services', expose: ['S', 'mailtoLink', 'whatsappNumber', 'whatsappLink', 'interviewIcs', 'recordMessage', 'TO_ROW', 'FROM_ROW', 'stateFromRows', 'makePeople', 'dataFingerprint'] });

test('an email link carries the address, subject and body, safely encoded', () => {
  assert.equal(app.mailtoLink({ to: ' a@b.com ', subject: 'Java role & you', body: 'Hi,\nline two?' }), 'mailto:a%40b.com?subject=Java%20role%20%26%20you&body=Hi%2C%0Aline%20two%3F');
});
test('a WhatsApp number is digits with the country code; a 10-digit number is Indian; rubbish gives no link', () => {
  assert.equal(app.whatsappNumber('+91 98450 11223'), '919845011223');
  assert.equal(app.whatsappNumber('98450-11223'), '919845011223');
  assert.equal(app.whatsappNumber('098450 11223'), '919845011223');
  assert.equal(app.whatsappNumber('0044 7911 123456'), '447911123456');
  assert.equal(app.whatsappNumber('12345'), '');
  assert.equal(app.whatsappLink({ phone: '', text: 'x' }), '');
  assert.equal(app.whatsappLink({ phone: '9845011223', text: 'Hi there' }), 'https://wa.me/919845011223?text=Hi%20there');
});

test('a calendar invite has the right times, an end from the length, escaped text, folded long lines and a reminder', () => {
  const ics = app.interviewIcs({ id: 'INT-1', title: 'Technical interview: Zed, Java; round 1', date: '2026-10-20', time: '23:30', minutes: 60, location: 'Meet https://meet.google.com/abc', description: 'Line one\nLine two ' + 'x'.repeat(120), organizer: 'rec@ats.ecoste.in', attendees: ['z@example.com', ''] }, new Date('2026-10-17T10:00:00Z'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0'));
  assert.match(ics, /DTSTART:20261020T233000\r\n/);
  assert.match(ics, /DTEND:20261021T003000\r\n/, 'an hour later, over midnight');
  assert.match(ics, /DTSTAMP:20261017T100000Z/);
  assert.ok(ics.includes('SUMMARY:Technical interview: Zed\\, Java\\; round 1'));
  assert.ok(ics.includes('DESCRIPTION:Line one\\nLine two '));
  assert.match(ics, /UID:INT-1@ats\.ecoste\.in/);
  assert.match(ics, /ATTENDEE;RSVP=TRUE:mailto:z@example\.com/);
  assert.equal((ics.match(/ATTENDEE/g) || []).length, 1, 'a blank address is dropped');
  assert.ok(ics.includes('BEGIN:VALARM') && ics.trim().endsWith('END:VCALENDAR'));
  assert.ok(ics.split('\r\n').every((l) => l.length <= 75), 'no line longer than 75 characters');
});

test('recordMessage keeps the message with who sent it, and logs it', () => {
  const a = app.S.applications[0];
  const m = app.recordMessage({ cid: a.cid, aid: a.id, channel: 'Email', template: 'Interview invite', subject: 'Hello', body: 'Body text' });
  assert.equal(app.S.messages[0], m);
  assert.equal(m.status, 'Sent');
  assert.equal(m.by, app.S.settings.user);
  assert.match(m.id, /^[0-9a-f-]{36}$/);
  assert.match(app.S.activity[0].text, /Email sent to .*: Interview invite/);
  const draft = app.recordMessage({ cid: a.cid, channel: 'WhatsApp', template: 'Regret', body: 'x', status: 'Composed' });
  assert.equal(draft.aid, null);
  assert.match(app.S.activity[0].text, /WhatsApp drafted to/);
});

test('a message goes to its table with its id, candidate, application and channel, and comes back the same', () => {
  const P = app.makePeople([{ id: 'u1', username: 'priya', full_name: 'Priya Sharma', role: 'recruiter', active: true }]);
  const m = { id: '11111111-1111-4111-8111-111111111111', cid: 'C-1', aid: 'APP-1', channel: 'Email', template: 'Regret', subject: 'S', body: 'B', status: 'Sent', by: 'Priya Sharma', ts: Date.parse('2026-10-17T10:00:00Z') };
  const row = JSON.parse(JSON.stringify(app.TO_ROW.message(m, P))).messages;
  assert.deepEqual(row, { id: m.id, candidate_id: 'C-1', application_id: 'APP-1', channel: 'Email', template: 'Regret', subject: 'S', body: 'B', status: 'Sent', created_at: '2026-10-17T10:00:00.000Z' });
  const back = app.stateFromRows({ messages: [{ ...row, sent_by: 'u1' }] }, P);
  assert.deepEqual(JSON.parse(JSON.stringify(back.messages)), [{ ...m, aid: 'APP-1' }]);
});
