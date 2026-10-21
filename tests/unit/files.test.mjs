// Files in storage: safe names, the path the access rules rely on, plain-words errors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

const app = loadApp({ until: 'services', expose: ['safeFileName', 'storagePath', 'fileError', 'uploadFile', 'fileLink', 'removeFile', 'FILE_BUCKETS'] });

function fakeStorage(result = {}) {
  const calls = [];
  const client = { storage: { from: (bucket) => ({
    upload: async (path, file, opts) => { calls.push(['upload', bucket, path, opts]); return result.upload || { data: { path }, error: null }; },
    createSignedUrl: async (path, secs) => { calls.push(['link', bucket, path, secs]); return result.link || { data: { signedUrl: 'https://x/' + path }, error: null }; },
    remove: async (paths) => { calls.push(['remove', bucket, paths]); return result.remove || { data: [], error: null }; },
  }) } };
  return { client, calls };
}

test('file names become safe: accents gone, spaces to underscores, odd characters dropped, extension kept', () => {
  assert.equal(app.safeFileName('Résumé of Zoë (final).pdf'), 'Resume_of_Zoe_final.pdf');
  assert.equal(app.safeFileName('../../etc/passwd'), '....etcpasswd');
  assert.equal(app.safeFileName('a/b\\c.pdf'), 'abc.pdf');
  assert.equal(app.safeFileName(''), 'file');
  const long = app.safeFileName('x'.repeat(200) + '.pdf');
  assert.ok(long.length <= 80 && long.endsWith('.pdf'));
});

test('a stored file lives under the folder of its candidate or application, so the access rules can read the owner from the path', () => {
  const p = app.storagePath('C-123', 'My CV.pdf');
  assert.match(p, /^C-123\/F-[2-9A-HJ-NP-Z]{8}-My_CV\.pdf$/);
  assert.notEqual(app.storagePath('C-123', 'a.pdf'), app.storagePath('C-123', 'a.pdf'), 'two uploads of the same name never overwrite each other');
});

test('upload sends the file to the right bucket, never overwriting; link lasts two minutes; remove ignores an empty path', async () => {
  const { client, calls } = fakeStorage();
  const path = await app.uploadFile(client, app.FILE_BUCKETS.resume, 'C-1', { name: 'cv.pdf', type: 'application/pdf' });
  assert.equal(calls[0][1], 'resumes');
  assert.equal(calls[0][2], path);
  assert.equal(calls[0][3].upsert, false);
  assert.equal(calls[0][3].contentType, 'application/pdf');
  assert.equal(await app.fileLink(client, 'resumes', path), 'https://x/' + path);
  assert.equal(calls[1][3], 120);
  await app.removeFile(client, 'resumes', '');
  assert.equal(calls.length, 2, 'nothing to remove, nothing sent');
  await app.removeFile(client, 'resumes', path);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[2])), ['remove', 'resumes', [path]]);
});

test('storage refusals become sentences a person can act on', async () => {
  const cases = [
    [{ message: 'new row violates row-level security policy' }, /You do not have permission/],
    [{ message: 'The object exceeded the maximum allowed size' }, /larger than the allowed size/],
    [{ message: 'mime type text/x-sh is not supported' }, /kind of file is not allowed/],
    [{ message: 'Object not found' }, /could not be found/],
    [{ message: 'Failed to fetch' }, /Cannot reach the server/],
  ];
  for (const [error, expect] of cases) {
    const { client } = fakeStorage({ upload: { data: null, error } });
    await assert.rejects(app.uploadFile(client, 'resumes', 'C-1', { name: 'a.pdf' }), expect);
  }
  const { client } = fakeStorage({ link: { data: null, error: { message: 'Object not found' } } });
  await assert.rejects(app.fileLink(client, 'resumes', 'C-1/x'), /Could not open the file\. The file could not be found/);
});
