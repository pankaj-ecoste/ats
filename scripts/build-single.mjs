// Bundles index.html + every linked CSS/JS file + assets into one self-contained HTML file
// (dist/Ecoste_Recruit_Tracker.html) that can be shared or published as a Claude artifact.
// This is the build the browser tests run against. The deployed site uses build-site.mjs instead (scripts in files, so the
// page policy can forbid inline script).
// index.html is the only manifest: files are inlined in the order they are listed there.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { root, read, inlineAssets, assertInlineSafe, assertNoSecrets } from './lib/bundle.mjs';

function bundle(inFile, outFile) {
  let css = 0, js = 0;
  let html = read(inFile)
    .replace(/<link rel="stylesheet" href="(src\/[^"]+)">/g, (m, p) => { css++; return `<style>\n${read(p).trim()}\n</style>`; })
    .replace(/<script src="(src\/[^"]+)"><\/script>/g, (m, p) => {
      const code = inlineAssets(read(p)).trim();
      assertInlineSafe(p, code);
      js++; return `<script>\n${code}\n</script>`;
    });

  // scripts that only load on demand (the PDF reader): their code travels inside the page as inert text, and loadLazy() runs it when first needed
  html = html.replace(/<script type="text\/x-lazy" data-lazy="(src\/[^"]+)"><\/script>/g, (m, p) => {
    const code = read(p).trim();
    assertInlineSafe(p, code);
    return `<script type="text/x-lazy" data-lazy="${p}">
  ${code}
  </script>`;
  });

  const left = html.match(/(?:href|src)="src\/[^"]+"/);
  if (left) throw new Error(`Not inlined: ${left[0]}`);
  assertNoSecrets(html);

  const out = resolve(root, outFile);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`${outFile}  (${css} stylesheets, ${js} scripts, ${(Buffer.byteLength(html) / 1024).toFixed(0)} kB)`);
}

bundle('index.html', 'dist/Ecoste_Recruit_Tracker.html');
bundle('careers.html', 'dist/careers.html');   // the public careers page: one file, host it anywhere
