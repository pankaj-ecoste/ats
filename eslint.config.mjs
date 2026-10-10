// ESLint for a codebase of classic <script> files that share one global scope (see index.html for the load order).
// ESLint cannot see names defined in other files, so this config reads every src file, collects its top-level
// declarations, and gives each file the names of all OTHER files as globals. Two files declaring the same name
// then shows up as a "redeclared" error, which is exactly the bug class that classic scripts hide.
import js from '@eslint/js';
import globals from 'globals';
import * as espree from 'espree';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});

function topLevelNames(code) {
  const ast = espree.parse(code, { ecmaVersion: 'latest', sourceType: 'script' });
  const names = new Map(); // name -> 'writable' (let/var, may be reassigned) or 'readonly'
  let kind = 'readonly';
  const fromPattern = (p) => {
    if (!p) return;
    if (p.type === 'Identifier') names.set(p.name, kind);
    else if (p.type === 'ObjectPattern') p.properties.forEach((x) => fromPattern(x.value || x.argument));
    else if (p.type === 'ArrayPattern') p.elements.forEach(fromPattern);
    else if (p.type === 'AssignmentPattern') fromPattern(p.left);
    else if (p.type === 'RestElement') fromPattern(p.argument);
  };
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') names.set(node.id.name, 'readonly');
    else if (node.type === 'VariableDeclaration') { kind = node.kind === 'const' ? 'readonly' : 'writable'; node.declarations.forEach((d) => fromPattern(d.id)); }
  }
  return names;
}

const srcFiles = walk('src').map((p) => relative('.', p).replaceAll('\\', '/'));
const declared = new Map(srcFiles.map((f) => [f, topLevelNames(readFileSync(f, 'utf8'))]));

const rules = {
  ...js.configs.recommended.rules,
  'no-unused-vars': 'off',                              // functions are shared across files, so "unused here" is not meaningful
  'no-empty': ['error', { allowEmptyCatch: true }],     // `try{...}catch(e){}` is used on purpose for storage and printing
  'no-useless-escape': 'off',
  'no-cond-assign': ['error', 'except-parens'],
  'no-prototype-builtins': 'off',
  'no-undef': 'error',
  'no-redeclare': ['error', { builtinGlobals: true }],  // catches the same name declared in two files
  'no-const-assign': 'error',
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
  'no-self-assign': 'error',
  'no-sparse-arrays': 'off',
  eqeqeq: 'off',
};

export default [
  { ignores: ['dist/**', 'node_modules/**', 'src/generated/**', '.claude/**'] },
  // one block per source file, so each sees the other files' declarations as globals
  ...srcFiles.map((file) => {
    const others = {};
    for (const [f, names] of declared) if (f !== file) names.forEach((kind, n) => { others[n] = kind; });
    return {
      files: [file],
      languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: { ...globals.browser, module: 'writable', SheetsIO: 'readonly', ...others } },
      rules,
    };
  }),
  // browser tests pass functions to page.evaluate(), which run inside the app and see every app global
  {
    files: ['tests/e2e/**/*.mjs'],
    languageOptions: { globals: Object.fromEntries([...declared.values()].flatMap((names) => [...names.keys()]).map((n) => [n, 'writable'])) },
  },
  // scripts and tests are ES modules run by Node
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
];
