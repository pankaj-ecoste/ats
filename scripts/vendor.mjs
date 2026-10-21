// Copies the Supabase browser library out of node_modules into src/vendor/, so the app loads it from its own files
// (no public CDN) and the single-file build can inline it.   Run after changing the @supabase/supabase-js version:  npm run vendor
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'node_modules/@supabase/supabase-js/package.json'), 'utf8'));
const out = resolve(root, 'src/vendor/supabase.js');
mkdirSync(dirname(out), { recursive: true });
copyFileSync(resolve(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), out);
const code = readFileSync(out, 'utf8');
if (/<\/script/i.test(code)) throw new Error('The library contains "</script" and cannot be inlined into the single-file build');
writeFileSync(out, `/* @supabase/supabase-js ${pkg.version} (UMD build, MIT licence). Third-party code, copied by scripts/vendor.mjs: do not edit. */\n${code}`);
console.log(`src/vendor/supabase.js  (supabase-js ${pkg.version}, ${(code.length / 1024).toFixed(0)} kB)`);

// PDF reading (Mozilla pdf.js, Apache-2.0). Loaded only when someone uploads a PDF résumé: see loadLazy() and the data-lazy tags in index.html.
const pdfVersion = JSON.parse(readFileSync(resolve(root, 'node_modules/pdfjs-dist/package.json'), 'utf8')).version;
for (const [from, to] of [['pdf.min.js', 'pdf.min.js'], ['pdf.worker.min.js', 'pdf.worker.min.js']]) {
  const text = readFileSync(resolve(root, 'node_modules/pdfjs-dist/build', from), 'utf8');
  if (/<\/script/i.test(text)) throw new Error(`${from} contains "</script" and cannot be inlined into the single-file build`);
  writeFileSync(resolve(root, 'src/vendor', to), `/* pdf.js ${pdfVersion} (Apache-2.0 licence). Third-party code, copied by scripts/vendor.mjs: do not edit. */\n${text}`);
  console.log(`src/vendor/${to}  (pdf.js ${pdfVersion}, ${(text.length / 1024).toFixed(0)} kB)`);
}

// Spreadsheet export and import (ExcelJS, MIT). Loaded only when someone opens the Sheets page or exports: see loadExcel() and the data-lazy tags in index.html.
{
  const v = JSON.parse(readFileSync(resolve(root, 'node_modules/exceljs/package.json'), 'utf8')).version;
  const text = readFileSync(resolve(root, 'node_modules/exceljs/dist/exceljs.min.js'), 'utf8');
  if (/<\/script/i.test(text)) throw new Error('exceljs.min.js contains "</script" and cannot be inlined into the single-file build');
  writeFileSync(resolve(root, 'src/vendor/exceljs.min.js'), `/* ExcelJS ${v} (MIT licence). Third-party code, copied by scripts/vendor.mjs: do not edit. */\n${text}`);
  console.log(`src/vendor/exceljs.min.js  (ExcelJS ${v}, ${(text.length / 1024).toFixed(0)} kB)`);
}

// The Figtree font (SIL Open Font Licence), latin letters, one variable file for every weight, written as a stylesheet with the font inside it
// so the app needs no font server and the single-file build stays one file.
{
  const dir = resolve(root, 'node_modules/@fontsource-variable/figtree');
  const v = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')).version;
  const b64 = readFileSync(resolve(dir, 'files/figtree-latin-wght-normal.woff2')).toString('base64');
  writeFileSync(resolve(root, 'src/vendor/figtree.css'), `/* Figtree ${v} (SIL OFL 1.1), latin, variable weight. Copied by scripts/vendor.mjs: do not edit. */\n@font-face{font-family:Figtree;font-style:normal;font-display:swap;font-weight:300 900;src:url(data:font/woff2;base64,${b64}) format("woff2")}\n`);
  console.log(`src/vendor/figtree.css  (Figtree ${v}, ${(b64.length / 1024).toFixed(0)} kB)`);
}
