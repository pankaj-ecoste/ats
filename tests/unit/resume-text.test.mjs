// Reading uploaded résumés: Word files (a zip, read without a library), PDF text lines, plain text, and the plain-words refusals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { loadApp } from './load-app.mjs';

const app = loadApp({
  until: 'services',
  expose: ['checkResumeFile', 'docxText', 'pdfText', 'xmlText', 'tidyResumeText', 'resumeTextFromFile'],
  globals: { Blob, Response, DecompressionStream, TextDecoder, TextEncoder, Uint8Array },
});

// a zip file with the given entries; compressed: raw deflate (method 8), otherwise stored (method 0)
function zip(entries, compressed = true) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const raw = Buffer.from(text), data = compressed ? deflateRawSync(raw) : raw, nm = Buffer.from(enc.encode(name));
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(compressed ? 8 : 0, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nm.length, 26);
    const head = Buffer.alloc(46); head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(compressed ? 8 : 0, 10); head.writeUInt32LE(data.length, 20); head.writeUInt32LE(raw.length, 24); head.writeUInt16LE(nm.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, nm, data); central.push(head, nm);
    offset += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, end]));
}
const para = (t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const docx = (body, extra = {}) => zip({ '[Content_Types].xml': '<x/>', 'word/document.xml': `<w:document><w:body>${body}</w:body></w:document>`, ...extra });
const fileOf = (name, bytes, size = bytes.length) => ({ name, size, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) });

test('a Word file gives its paragraphs, tabs, line breaks and special characters', async () => {
  const body = para('Ritika Sen') + para('Java &amp; SQL &lt;3 &#233;') + '<w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:br/><w:t>c</w:t></w:r></w:p>' + '<w:p><w:r><w:instrText> HYPERLINK "x"</w:instrText></w:r></w:p>';
  assert.equal((await app.docxText(docx(body))).trim(), 'Ritika Sen\nJava & SQL <3 é\na\tb\nc');
});
test('a Word file also gives its header, where contact details often sit, first; stored (uncompressed) entries work too', async () => {
  const bytes = zip({ 'word/document.xml': `<w:document>${para('Body line')}</w:document>`, 'word/header1.xml': `<w:hdr>${para('ritika@mail.com')}</w:hdr>` }, false);
  assert.equal((await app.docxText(bytes)).trim(), 'ritika@mail.com\n\nBody line');
});
test('a file that is not a Word document is refused in plain words', async () => {
  await assert.rejects(app.docxText(new TextEncoder().encode('just text, not a zip file at all, long enough to scan')), /not a valid Word file/);
  await assert.rejects(app.docxText(zip({ 'other.xml': '<a/>' })), /not a Word document/);
});

test('PDF text: items on one line join, a change of height starts a new line, pages are separated', async () => {
  const items = (rows) => ({ items: rows.map(([str, y, hasEOL]) => ({ str, transform: [1, 0, 0, 1, 0, y], hasEOL })) });
  const pages = [items([['Ritika ', 780], ['Sen', 780], ['Engineer', 760], ['Java, SQL', 740, true]]), items([['Page two', 780]])];
  const pdfjs = { getDocument: () => ({ promise: Promise.resolve({ numPages: 2, getPage: async (n) => ({ getTextContent: async () => pages[n - 1] }) }) }) };
  assert.equal(await app.pdfText(new Uint8Array(1), pdfjs), 'Ritika Sen\nEngineer\nJava, SQL\n\nPage two');
});

test('files are checked before they are read: type, size, emptiness, old .doc', () => {
  const chk = (name, size) => app.checkResumeFile({ name, size });
  assert.equal(chk('cv.PDF', 100).kind, 'pdf');
  assert.equal(chk('cv.docx', 100).kind, 'docx');
  assert.match(chk('cv.doc', 100).error, /\.docx or PDF/);
  assert.match(chk('cv.exe', 100).error, /PDF, Word/);
  assert.match(chk('cv.pdf', 11 * 1024 * 1024).error, /10 MB/);
  assert.match(chk('cv.pdf', 0).error, /empty/);
});

test('resumeTextFromFile: text files, Word files, tidy output, and a scan with no text is explained', async () => {
  const body = 'Ritika Sen\r\n\r\n\r\n\r\nSenior Java Engineer, Bengaluru   ritika@mail.com \u0007';
  assert.equal(await app.resumeTextFromFile(fileOf('cv.txt', new TextEncoder().encode(body)), null), 'Ritika Sen\n\nSenior Java Engineer, Bengaluru ritika@mail.com');
  const fromDocx = await app.resumeTextFromFile(fileOf('cv.docx', docx(para('Ritika Sen') + para('Senior Java Engineer in Bengaluru'))), null);
  assert.equal(fromDocx, 'Ritika Sen\nSenior Java Engineer in Bengaluru');
  const emptyPdf = { getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [] }) }) }) }) };
  await assert.rejects(app.resumeTextFromFile(fileOf('scan.pdf', new Uint8Array(5)), async () => emptyPdf), /scanned PDF/);
  await assert.rejects(app.resumeTextFromFile(fileOf('cv.docx', new Uint8Array(40)), null), /not a valid Word file/);
  await assert.rejects(app.resumeTextFromFile(fileOf('cv.pdf', new Uint8Array(5)), async () => ({ getDocument: () => ({ promise: Promise.reject(new Error('Invalid PDF structure')) }) })), /PDF could not be read \(Invalid PDF structure\)/);
});

test('PDFs are opened with eval turned off (protection against CVE-2024-4367 in the bundled pdf.js)', async () => {
  const app = loadApp({ until: 'src/domain/resume-text.js', expose: ['resumeTextFromFile'] });
  let seen;
  const pdfjs = { getDocument: (opts) => { seen = opts; return { promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [{ str: 'Asha Rao and a long enough line of text for the reader', transform: [1, 0, 0, 1, 0, 700] }] }) }) }) }; } };
  await app.resumeTextFromFile(new File([new Uint8Array(5)], 'cv.pdf'), async () => pdfjs);
  assert.equal(seen.isEvalSupported, false);
});
