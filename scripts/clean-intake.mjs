// Removes résumé files that people uploaded on the careers page but never submitted (they stay under resumes/intake/ forever otherwise).
//   npm run storage:clean            shows what would be removed (nothing is deleted)
//   npm run storage:clean -- --yes   removes it
// A file is removed only when it is older than 3 days AND no candidate points at it. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// (.env, or secrets in the scheduled GitHub job). Uses the Storage API because Supabase forbids deleting storage rows with SQL.
import { pathToFileURL } from 'node:url';
import { loadEnv } from './db.mjs';

export const MAX_AGE_DAYS = 3;

// pure rule: which stored files are abandoned
export function staleFiles(files, referenced, now = Date.now(), days = MAX_AGE_DAYS) {
  const keep = new Set(referenced);
  return files.filter((f) => !keep.has(f.name) && now - new Date(f.created_at).getTime() > days * 86400000).map((f) => f.name);
}

async function api(base, key, path, init = {}) {
  const r = await fetch(base + path, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers } });
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${path} failed: ${r.status} ${await r.text()}`);
  return r.json();
}

// every file under a folder (one level of random-id folders: intake/<id>/<file>)
async function listFiles(base, key, prefix) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const page = await api(base, key, '/storage/v1/object/list/resumes', { method: 'POST', body: JSON.stringify({ prefix, limit: 100, offset }) });
    for (const e of page) {
      if (e.id === null) out.push(...(await listFiles(base, key, `${prefix}${e.name}/`)));   // a folder
      else out.push({ name: prefix + e.name, created_at: e.created_at });
    }
    if (page.length < 100) return out;
  }
}

export async function run({ yes = false, env = process.env, now = Date.now() } = {}) {
  const base = (env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed');
  const files = await listFiles(base, key, 'intake/');
  const rows = await api(base, key, '/rest/v1/candidates?select=resume_path&resume_path=like.intake/*');
  const stale = staleFiles(files, rows.map((r) => r.resume_path), now);
  console.log(`${files.length} files in intake/, ${rows.length} in use, ${stale.length} abandoned`);
  stale.forEach((n) => console.log('  ' + n));
  if (stale.length && yes) {
    for (let i = 0; i < stale.length; i += 100) await api(base, key, '/storage/v1/object/resumes', { method: 'DELETE', body: JSON.stringify({ prefixes: stale.slice(i, i + 100) }) });
    console.log('removed');
  } else if (stale.length) console.log('Nothing deleted. Run again with --yes to remove them.');
  return stale;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  run({ yes: process.argv.includes('--yes') }).catch((e) => { console.error(e.message); process.exit(1); });
}
