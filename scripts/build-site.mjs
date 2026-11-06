// Builds the folder that is deployed: dist/site/  (index.html, careers.html, js/*.js, src/vendor/* for the on-demand libraries).
//
// Why it exists: the page policy (vercel.json) can only forbid inline script when every script is a file. The single-file build
// (build-single.mjs) keeps every script inline, which is handy for tests and sharing but needs 'unsafe-inline', and that would let
// injected text run as code. Same sources, same order, same behaviour: only the packaging differs.
//
// Scripts are written as a few files, one per run of files that are all strict-mode or all not, so each file keeps the mode it has today
// (a "use strict" only counts at the start of a script).
// Stylesheets stay inline: the policy allows inline style (the app sets style attributes), and style cannot run code.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { root, read, inlineAssets, assertInlineSafe, assertNoSecrets, isStrict } from './lib/bundle.mjs';

const OUT = resolve(root, 'dist/site');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(resolve(OUT, 'js'), { recursive: true });

const DB_URL = (read('src/generated/config.js').match(/"supabaseUrl":"([^"]*)"/) || [])[1] || '';
const SCRIPT = /<script src="(src\/[^"]+)"><\/script>/g;
const LAZY = /<script type="text\/x-lazy" data-lazy="(src\/[^"]+)"><\/script>/g;
const written = [];

function buildPage(inFile, name) {
  let html = read(inFile);
  let css = 0;
  html = html.replace(/<link rel="stylesheet" href="(src\/[^"]+)">/g, (m, p) => { css++; return `<style>\n${read(p).trim()}\n</style>`; });

  // group consecutive scripts of the same mode
  const paths = [...html.matchAll(SCRIPT)].map((m) => m[1]);
  const groups = [];
  for (const p of paths) {
    const code = inlineAssets(read(p)).trim();
    assertInlineSafe(p, code);
    const strict = isStrict(code);
    const last = groups[groups.length - 1];
    if (last && last.strict === strict) { last.parts.push(code); last.paths.push(p); } else groups.push({ strict, parts: [code], paths: [p] });
  }
  const tagOf = new Map();   // first path of each group -> its <script src> tag
  groups.forEach((g, i) => {
    const body = g.parts.join('\n;\n') + '\n';   // a lone ; keeps a file that ends without one from joining the next
    const hash = createHash('sha256').update(body).digest('hex').slice(0, 10);
    const file = `js/${name}-${i + 1}.${hash}.js`;
    writeFileSync(resolve(OUT, file), body);
    written.push([file, body]);
    tagOf.set(g.paths[0], `<script src="${file}"></script>`);
  });
  const placed = new Set();
  html = html.replace(SCRIPT, (m, p) => {
    const g = groups.find((x) => x.paths.includes(p));
    if (g.paths[0] === p && !placed.has(p)) { placed.add(p); return tagOf.get(p); }
    return '';   // folded into the group's file
  });

  // on-demand libraries: the tag stays empty, loadLazy() fetches the file, so the file must be served next to the page
  for (const [, p] of html.matchAll(LAZY)) {
    mkdirSync(dirname(resolve(OUT, p)), { recursive: true });
    copyFileSync(resolve(root, p), resolve(OUT, p));
  }

  const left = html.match(/(?:href|src)="src\/(?!vendor\/)[^"]+"/);
  if (left) throw new Error(`Not built: ${left[0]}`);
  // open the connection to the database while the scripts are still downloading: DNS, TCP and TLS are about three round trips, and the first
  // request would otherwise pay for them after everything is parsed. The address is public (it is in the policy and in the app anyway).
  if (name === 'index' && DB_URL) html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<link rel="preconnect" href="${new URL(DB_URL).origin}" crossorigin>`);
  html = html.replace(/\n{3,}/g, '\n\n');
  assertNoSecrets(html);
  writeFileSync(resolve(OUT, name + '.html'), html);
  console.log(`dist/site/${name}.html  (${css} stylesheets inline, ${groups.length} script files from ${paths.length} sources)`);
}

buildPage('index.html', 'index');
buildPage('careers.html', 'careers');
written.forEach(([, body]) => assertNoSecrets(body));

// The policy lets the page talk to one database address only. If the project moves, vercel.json has to change with it:
// refuse to build a site whose own address the policy would block.
const url = DB_URL;
if (url) {
  const csp = JSON.parse(read('vercel.json')).headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  const connect = (csp.match(/connect-src ([^;]*)/) || [])[1] || '';
  if (!connect.split(/\s+/).includes(new URL(url).origin)) {
    throw new Error(`Refusing to build: vercel.json connect-src does not allow ${new URL(url).origin}, so the deployed app could not reach its database. Add it there.`);
  }
}
