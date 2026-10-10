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
