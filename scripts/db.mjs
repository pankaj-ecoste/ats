// Database migrations for the Supabase (Postgres) project.   Needs DATABASE_URL in .env (the pooler connection string).
//   npm run db:migrate     apply every pending file in supabase/migrations/ (each in its own transaction)
//   npm run db:status      list applied and pending migrations
//   npm run db:reset       DEV ONLY: drop everything this project created and re-apply. Needs ALLOW_DB_RESET=1 and --yes
// A migration that was already applied must never be edited: its checksum is stored, and a changed file stops the run.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');

export function loadEnv() {
  try {
    for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  } catch { /* no .env: rely on the real environment (CI) */ }
}

export function connect() {
  loadEnv();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  // the Supabase pooler presents a certificate chain Node does not know; the connection is still encrypted
  return new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
}

const files = () => readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
const sha = (text) => createHash('sha256').update(text).digest('hex');

async function ensureTable(c) {
  await c.query('create schema if not exists app');
  await c.query(`create table if not exists app.schema_migrations (
    version text primary key, checksum text not null, applied_at timestamptz not null default now())`);
}

async function status(c) {
  await ensureTable(c);
  const done = new Map((await c.query('select version, checksum from app.schema_migrations order by version')).rows.map((r) => [r.version, r.checksum]));
  return files().map((f) => {
    const v = f.slice(0, 4), text = readFileSync(join(dir, f), 'utf8');
    return { file: f, version: v, applied: done.has(v), changed: done.has(v) && done.get(v) !== sha(text), text };
  });
}

export async function migrate(c, log = console.log) {
  const list = await status(c);
  const changed = list.filter((m) => m.changed);
  if (changed.length) throw new Error(`Already-applied migration was edited: ${changed.map((m) => m.file).join(', ')}. Add a new migration instead.`);
  let n = 0;
  for (const m of list.filter((x) => !x.applied)) {
    await c.query('begin');
    try {
      await c.query(m.text);
      await c.query('insert into app.schema_migrations (version, checksum) values ($1, $2)', [m.version, sha(m.text)]);
      await c.query('commit');
      log(`applied ${m.file}`);
      n++;
    } catch (e) {
      await c.query('rollback');
      throw new Error(`${m.file} failed and was rolled back: ${e.message}`);
    }
  }
  if (!n) log('database is up to date');
  return n;
}

async function reset(c) {
  if (process.env.ALLOW_DB_RESET !== '1' || !process.argv.includes('--yes')) {
    throw new Error('Refusing to reset. This deletes all data created by the migrations. Run: ALLOW_DB_RESET=1 npm run db:reset -- --yes');
  }
  // drops only what the migrations create; Supabase's own schemas (auth, storage, ...) are untouched
  await c.query('drop trigger if exists on_auth_user_created on auth.users');
  await c.query('drop schema if exists public cascade');
  await c.query('drop schema if exists app cascade');
  await c.query('create schema public');
  await c.query('grant usage on schema public to postgres, anon, authenticated, service_role');
  await c.query('grant all on schema public to postgres, service_role');
  console.log('dropped public and app schemas');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2] || 'status';
  const c = connect();
  try {
    await c.connect();
    if (cmd === 'migrate') await migrate(c);
    else if (cmd === 'reset') { await reset(c); await migrate(c); }
    else if (cmd === 'status') for (const m of await status(c)) console.log(`${m.applied ? (m.changed ? 'CHANGED ' : 'applied ') : 'pending '} ${m.file}`);
    else throw new Error(`unknown command: ${cmd}`);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
}
