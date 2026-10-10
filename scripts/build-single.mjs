// Bundles index.html + every linked CSS/JS file + assets into one self-contained HTML file
// (dist/Ecoste_Recruit_Tracker.html) that can be shared or published as a Claude artifact.
// index.html is the only manifest: files are inlined in the order they are listed there.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

// 'assets/…' string literals in JS become data URIs
const inlineAssets = (js) => js.replace(/(['"])(assets\/[\w./-]+)\1/g, (m, q, p) => {
  const mime = MIME[extname(p).toLowerCase()];
  if (!mime) throw new Error(`No MIME type for asset ${p}`);
  return `${q}data:${mime};base64,${readFileSync(resolve(root, p)).toString('base64')}${q}`;
});

let css = 0, js = 0;
let html = read('index.html')
  .replace(/<link rel="stylesheet" href="(src\/[^"]+)">/g, (m, p) => { css++; return `<style>\n${read(p).trim()}\n</style>`; })
  .replace(/<script src="(src\/[^"]+)"><\/script>/g, (m, p) => {
    const code = inlineAssets(read(p)).trim();
    if (/<\/script/i.test(code)) throw new Error(`${p} contains "</script" and cannot be inlined safely`);
    js++; return `<script>\n${code}\n</script>`;
  });

const left = html.match(/(?:href|src)="src\/[^"]+"/);
if (left) throw new Error(`Not inlined: ${left[0]}`);

// Secret guard: the built file is sent to every browser, so it must never contain a database URL with a password
// or a service-role key. Public values (project URL, anon key) are fine.
const leaks = [];
if (/postgres(?:ql)?:\/\/[^\s"'<>]+:[^\s"'<>@]+@/i.test(html)) leaks.push('a database connection string with a password');
for (const jwt of html.match(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g) || []) {
  try {
    const role = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')).role;
    if (role && role !== 'anon') leaks.push(`a Supabase key with role "${role}"`);
  } catch { /* not a token */ }
}
if (leaks.length) throw new Error(`Refusing to build: the output contains ${leaks.join(' and ')}. Remove it from the sources.`);

const out = resolve(root, 'dist/Ecoste_Recruit_Tracker.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`dist/Ecoste_Recruit_Tracker.html  (${css} stylesheets, ${js} scripts, ${(Buffer.byteLength(html) / 1024).toFixed(0)} kB)`);
