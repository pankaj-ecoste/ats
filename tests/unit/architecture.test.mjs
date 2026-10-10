// Guards the layering described in README.md / .claude/plan.md §7.9 until ESLint rules replace them (Phase 1.4).
//   1. Only src/core (repo, store) and src/data (seed) may write to S or call save().
//   2. src/services, src/domain and src/core never touch the UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});
const files = (sub) => walk(resolve(root, 'src', sub)).map((p) => ({ path: relative(root, p).replaceAll('\\', '/'), lines: readFileSync(p, 'utf8').split('\n') }));
const all = ['app', 'features'].flatMap(files);

const WRITE = /\bsave\(\)|\bS\.\w+(\.\w+)*\s*(=|\+=|-=)[^=>]|\bS\s*=[^=]|\bS\.\w+\.(push|unshift|splice|pop|shift|sort|reverse)\(|delete S\./;

// Known exceptions. Each is either sample-data seeding (removed in plan Phase 2.4) or a lazy default for state that does not exist yet.
const ALLOWED = [
  { file: 'src/features/management-report/report-events.js', why: 'sample history generator and report-config default' },
  { file: 'src/features/management-report/report.js', match: /seedHistory\(\)/, why: 'lazy defaults' },
  { file: 'src/features/posting/posting.js', match: /^function (boards|postCfg)\(\)|^if\(!S\.postings\)/, why: 'lazy defaults' },
  { file: 'src/features/sheets/auto-import.js', match: /^function asCfg\(\)/, why: 'lazy default' },
];
const allowed = (path, line) => ALLOWED.some((a) => a.file === path && (!a.match || a.match.test(line.trim())));

test('app and feature code do not write to S or call save() directly', () => {
  const offenders = [];
  for (const f of all) {
    f.lines.forEach((line, i) => {
      if (line.trim().startsWith('//') || line.trim().startsWith('/*')) return;
      if (WRITE.test(line) && !allowed(f.path, line)) offenders.push(`${f.path}:${i + 1}  ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(offenders, [], 'change data through a service in src/services/ (which uses repo.*), not here');
});

test('services, domain and core do not touch the UI', () => {
  const UI = /\b(toast|modal|confirmBox|closeModal|render|refresh|renderTop|renderSide|go)\(|\bdocument\.|\bwindow\.|\blocalStorage\b/;
  const offenders = [];
  for (const f of ['services', 'domain', 'core', 'data'].flatMap(files)) {
    // store.js owns localStorage; utils.js defines DOM helpers; hooks/repo are plain logic
    if (f.path.endsWith('core/store.js') || f.path.endsWith('core/utils.js') || f.path.endsWith('core/icons.js') || f.path.endsWith('core/assets.js')) continue;
    let inBlock = false;
    f.lines.forEach((line, i) => {
      let code = line.replace(/\/\/.*$/, '');
      if (inBlock) { const end = code.indexOf('*/'); if (end < 0) return; code = code.slice(end + 2); inBlock = false; }
      code = code.replace(/\/\*.*?\*\//g, '');
      const open = code.indexOf('/*');
      if (open >= 0) { code = code.slice(0, open); inBlock = true; }
      if (UI.test(code)) offenders.push(`${f.path}:${i + 1}  ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('markup has no inline event handlers (use data-act and src/app/ui-actions.js)', () => {
  const INLINE = /[\s`'"]on(click|change|input|submit|keydown|keyup|focus|blur|mouse\w+|dblclick)\s*=\s*["']/;
  const offenders = [];
  for (const f of ['app', 'features', 'core', 'services', 'domain', 'data'].flatMap(files)) {
    f.lines.forEach((line, i) => { if (INLINE.test(line.replace(/\.on[a-z]+\s*=/g, ''))) offenders.push(`${f.path}:${i + 1}  ${line.trim().slice(0, 100)}`); });
  }
  assert.deepEqual(offenders, []);
});

test('the exceptions list only names files that exist', () => {
  const have = new Set(all.map((f) => f.path));
  for (const a of ALLOWED) assert.ok(have.has(a.file), a.file);
});
