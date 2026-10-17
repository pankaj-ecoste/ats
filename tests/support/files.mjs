// Small real files for the upload tests: a PDF with text, a Word (.docx) file, and a PDF with no text (like a scan).
import { deflateRawSync } from 'node:zlib';

// a one-page PDF whose lines are plain text (Helvetica); the cross-reference table is computed so the file is valid
export function makePdf(lines) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = lines.length ? `BT /F1 12 Tf 14 TL 50 780 Td ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET` : '';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// a minimal .docx: a zip with a content-types file and the document body (one paragraph per line)
export function makeDocx(lines) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${lines.map((l) => `<w:p><w:r><w:t xml:space="preserve">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`;
  const files = { '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>', 'word/document.xml': xml };
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text), data = deflateRawSync(raw), nm = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nm.length, 26);
    const head = Buffer.alloc(46); head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(8, 10); head.writeUInt32LE(data.length, 20); head.writeUInt32LE(raw.length, 24); head.writeUInt16LE(nm.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, nm, data); central.push(head, nm);
    offset += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
