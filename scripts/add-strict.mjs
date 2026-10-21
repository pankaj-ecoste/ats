// One-off helper used for the strict-mode rollout: adds "use strict"; as the first statement of every src file that lacks it.
// Safe to re-run; files that already have it are left alone. Generated files are skipped.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as espree from 'espree';

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});

let changed = 0;
for (const file of walk('src')) {
  if (/src\/(generated|vendor)\//.test(file.replaceAll('\\', '/'))) continue;
  const code = readFileSync(file, 'utf8');
  const ast = espree.parse(code, { ecmaVersion: 'latest', sourceType: 'script', comment: true, range: true });
  const first = ast.body[0];
  if (first && first.type === 'ExpressionStatement' && first.directive === 'use strict') continue;
  // insert after the leading comments that come before the first statement
  const limit = first ? first.range[0] : code.length;
  const lead = ast.comments.filter((c) => c.range[1] <= limit);
  const at = lead.length ? lead[lead.length - 1].range[1] : 0;
  const next = at ? '\n"use strict";' : '"use strict";\n';
  writeFileSync(file, code.slice(0, at) + next + code.slice(at), 'utf8');
  changed++;
}
console.log(`added "use strict" to ${changed} files`);
