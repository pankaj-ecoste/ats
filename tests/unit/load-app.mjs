// Loads the app's classic scripts into a Node vm context so pure logic can be unit-tested without a browser.
// Files are taken from index.html (the single source of truth for load order), up to and including `until`.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function loadApp({ until = 'src/domain/resume-parser.js', expose = [], storage = {}, failWrites = false, globals = {}, after = '' } = {}) {
  // third-party code in src/vendor/ is browser-only and not needed by the logic under test
  const files = [...readFileSync(resolve(root, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)">/g)].map((m) => m[1]).filter((f) => !f.startsWith('src/vendor/'));
  // until: 'services' loads everything up to and including the last file in src/services/
  const end = until === 'services' ? files.findLastIndex((f) => f.startsWith('src/services/')) : files.indexOf(until);
  if (end < 0) throw new Error(`${until} is not listed in index.html`);
  const store = new Map(Object.entries(storage));
  const context = vm.createContext({
    console,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { if (failWrites) throw new Error('QuotaExceededError'); store.set(k, String(v)); } },
    setTimeout, clearTimeout, ...globals,
  });
  for (const f of files.slice(0, end + 1)) vm.runInContext(readFileSync(resolve(root, f), 'utf8'), context, { filename: f });
  if (after) vm.runInContext(after, context); // e.g. swap in a fake Supabase client
  // top-level const/let are not properties of the context object, so read them out explicitly
  return { ...vm.runInContext(`({${expose.join(',')}})`, context), _storage: store };
}
