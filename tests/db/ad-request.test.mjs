// The ad request of an opening (migration 0031): optional, {} means none; a filled one must have a known status, real dates and non-negative money.
// One rolled-back transaction. The migration is applied inside it when it is not there yet.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { connect, loadEnv } from '../../scripts/db.mjs';

loadEnv();
const skip = process.env.DATABASE_URL ? false : 'DATABASE_URL is not set';
let c;
const q = (sql, params) => c.query(sql, params);
const mig = (f) => readFileSync(new URL('../../supabase/migrations/' + f, import.meta.url), 'utf8');

before(async () => {
  if (skip) return;
  c = connect();
  await c.connect();
  await q('begin');
  if (!(await q("select 1 from information_schema.columns where table_name = 'openings' and column_name = 'ad'")).rows.length) await q(mig('0031_ad_request.sql'));
  if (!(await q("select 1 from pg_proc where proname = 'valid_ad_request' and prosrc like '%WhatsApp%'")).rows.length) await q(mig('0032_ad_brief_history.sql'));
  await q("insert into public.openings (id, title, positions, status) values ('OP-AD1', 'Ad request role', 1, 'Open')");
});
after(async () => {
  if (!c) return;
  await q('rollback');
  await c.end();
});

test('an opening starts with no ad request, and a filled one is kept as written', { skip }, async () => {
  assert.deepEqual((await q("select ad from public.openings where id = 'OP-AD1'")).rows[0].ad, {});
  const ad = { status: 'Running', raisedOn: '2026-11-06', raisedBy: 'Recruiter', startOn: '2026-11-08', endOn: '', platform: 'Meta', budget: 20000, spend: 0, link: 'https://x.test/a', notes: 'n', withSalary: false };
  await q("update public.openings set ad = $1 where id = 'OP-AD1'", [JSON.stringify(ad)]);
  assert.deepEqual((await q("select ad from public.openings where id = 'OP-AD1'")).rows[0].ad, ad);
  await q("update public.openings set ad = '{}' where id = 'OP-AD1'");
});

test('an ad request with an unknown status, a wrong date or negative money is refused', { skip }, async () => {
  const ok = { status: 'Requested', raisedOn: '2026-11-06' };
  const set = (v) => q("update public.openings set ad = $1 where id = 'OP-AD1'", [JSON.stringify(v)]);
  const bad = async (v) => { await q('savepoint s'); try { await set(v); } catch (e) { await q('rollback to savepoint s'); await q('release savepoint s'); return e.message; } await q('release savepoint s'); return ''; };
  assert.equal(await bad(ok), '');
  assert.match(await bad({ ...ok, status: 'Live' }), /valid|check/i);
  assert.match(await bad({ raisedOn: '2026-11-06' }), /valid|check/i, 'no status');
  assert.match(await bad({ ...ok, raisedOn: 'yesterday' }), /valid|check/i);
  assert.match(await bad({ ...ok, startOn: '8 Nov' }), /valid|check/i);
  assert.match(await bad({ ...ok, budget: -1 }), /valid|check/i);
  assert.match(await bad({ ...ok, spend: 'lots' }), /valid|check/i);
  assert.match(await bad({ ...ok, notes: 'x'.repeat(2001) }), /valid|check/i);
  assert.match(await bad([]), /valid|check/i);
});

test('the briefs sent to marketing: a list of at most 20 with a known channel, a subject up to 200 and a body up to 5000 characters', { skip }, async () => {
  const ok = { status: 'Requested', raisedOn: '2026-11-06' };
  const one = { ts: 1, by: 'P', channel: 'Email', to: 'a@b.c', subject: 'S', body: 'B' };
  const set = (v) => q("update public.openings set ad = $1 where id = 'OP-AD1'", [JSON.stringify(v)]);
  const bad = async (v) => { await q('savepoint s'); try { await set(v); } catch (e) { await q('rollback to savepoint s'); await q('release savepoint s'); return e.message; } await q('release savepoint s'); return ''; };
  assert.equal(await bad({ ...ok, sent: [one, { ...one, channel: 'Copied' }, { ...one, channel: 'WhatsApp' }] }), '');
  assert.equal(await bad({ ...ok, sent: Array.from({ length: 20 }, () => one) }), '');
  assert.match(await bad({ ...ok, sent: Array.from({ length: 21 }, () => one) }), /valid|check/i);
  assert.match(await bad({ ...ok, sent: [{ ...one, channel: 'Pigeon' }] }), /valid|check/i);
  assert.match(await bad({ ...ok, sent: [{ ...one, body: 'x'.repeat(5001) }] }), /valid|check/i);
  assert.match(await bad({ ...ok, sent: [{ ...one, subject: 'x'.repeat(201) }] }), /valid|check/i);
  assert.match(await bad({ ...ok, sent: 'no' }), /valid|check/i);
  assert.match(await bad({ ...ok, sent: ['text'] }), /valid|check/i);
});
