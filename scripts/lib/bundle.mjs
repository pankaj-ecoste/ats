// Helpers shared by the two builds: build-single.mjs (one self-contained file, for tests and sharing)
// and build-site.mjs (the folder that is deployed, with scripts in files so the page policy can forbid inline script).
import { readFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const read = (p) => readFileSync(resolve(root, p), 'utf8');

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

// 'assets/…' string literals in JS become data URIs
export const inlineAssets = (js) => js.replace(/(['"])(assets\/[\w./-]+)\1/g, (m, q, p) => {
  const mime = MIME[extname(p).toLowerCase()];
  if (!mime) throw new Error(`No MIME type for asset ${p}`);
  return `${q}data:${mime};base64,${readFileSync(resolve(root, p)).toString('base64')}${q}`;
});

// the file must never close a script tag by accident when it is placed inside one
export const assertInlineSafe = (p, code) => {
  if (/<\/script/i.test(code)) throw new Error(`${p} contains "</script" and cannot be inlined safely`);
};

// Secret guard: the built output is sent to every browser, so it must never contain a database URL with a password
// or a service-role key. Public values (project URL, anon key) are fine.
export function assertNoSecrets(text) {
  const leaks = [];
  if (/postgres(?:ql)?:\/\/[^\s"'<>]+:[^\s"'<>@]+@/i.test(text)) leaks.push('a database connection string with a password');
  for (const jwt of text.match(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g) || []) {
    try {
      const role = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')).role;
      if (role && role !== 'anon') leaks.push(`a Supabase key with role "${role}"`);
    } catch { /* not a token */ }
  }
  if (leaks.length) throw new Error(`Refusing to build: the output contains ${leaks.join(' and ')}. Remove it from the sources.`);
}

// true when the file runs in strict mode: "use strict" is its first statement (comments may come before it)
export const isStrict = (code) => /^(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)*["']use strict["']/.test(code);
