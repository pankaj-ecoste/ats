# Architecture (version 1, as handed over 2026-11-06)

## Runtime model

The app is a client-only, single-page application written in plain JavaScript with no framework. It runs straight from the source files in development; the build only packages the same files (see "Two builds").

- **State.** One object, `S` (`src/core/store.js`), holds everything: `settings`, `openings`, `candidates`, `applications`, `interviews`, `groups`, `offers`, `onboarding`, `tasks`, `activity`, `notifications`, `postings`, `boards`, `postCfg`, `autoSync`, `events`, `callLog`, `monthly`, `sheetLog`. It is read from and written to `localStorage` under the key `ecoste-ats` (older data under `spectra-ats-v3` is read once and copied; unknown versions are backed up to `ecoste-ats-backup`) as a single JSON blob.
- **Routing.** `R` (`src/app/router.js`) is the UI state (current view, tab, filters). `go(view, param, tab)` changes it and re-renders; `src/app/url.js` keeps the address bar in step (`#/candidate/<id>`), so back, refresh and links work.
- **Rendering.** Each view is a pair `[viewFn, bindFn]` in `VIEWS` (`src/app/render.js`). `viewFn()` returns an HTML string, `render()` assigns it to `#content`, then `bindFn(root)` attaches handlers. Every change re-renders the whole page; the long lists show 100 rows at a time (`pageRows`, `moreRows` in `src/app/ui.js`).
- **Mutations.** Every user action goes through a service in `src/services/`, which changes data only through `repo` (`src/core/repo.js`: insert, update, remove, root, trim, reset) and returns the result. The handler then shows the toast and calls `render()`. `repo` saves and notifies `repoOnChange` listeners, which is where a database adapter attaches. Known exceptions, listed in `tests/unit/architecture.test.mjs`: the sample-history generator (`management-report/report-events.js`) and four lazy defaults (`boards()`, `postCfg()`, `asCfg()`, `S.postings`). `setStage()` in `src/app/actions.js` is the main shared mutation; it emits `stage:changing` before writing.

## Two modes

`core/supabase.js` creates a Supabase client only when `src/generated/config.js` holds a project URL and anon key. That is **connected mode**: the app shows a sign-in screen first (`features/auth`), and admins get a Users page. Without them the app is in **demo mode**: no sign-in, data in this browser, exactly as the prototype worked. Tests and CI run in demo mode. Until the data layer is connected (plan P2.3), connected mode still keeps the records in this browser behind the sign-in.

## Layers and dependency direction

```
core  ->  data  ->  domain  ->  services  ->  app  ->  features  ->  app/main.js
```

A layer may use layers to its left. `core`, `data`, `domain` and `services` never touch the DOM at all, which is what lets `tests/unit/load-app.mjs` run them in Node.

All files are classic scripts in one global scope and every file runs in strict mode. They become ES modules in Phase 6 (see the plan); until then ESLint gives each file the other files' top-level names as globals, so undefined and duplicate names fail the build.

## Two builds, one source

`npm run build` writes two things from the same `index.html` manifest and the same files, in the same order:

| Output | Used for | Scripts |
|---|---|---|
| `dist/Ecoste_Recruit_Tracker.html` (and `dist/careers.html`) | the browser tests, sharing one file, publishing as a Claude artifact | all inline |
| `dist/site/` (`index.html`, `careers.html`, `js/*.js`, `src/vendor/*`) | **what Vercel serves** (`outputDirectory` in `vercel.json`) | files, so the policy can say `script-src 'self'` |

`scripts/lib/bundle.mjs` holds what both builds share (asset inlining, the secret guard, the strict-mode check). `scripts/build-site.mjs` writes scripts as a few files, one per run of files of the same strictness, so each keeps the mode it had. `npm run test:e2e:csp` serves `dist/site` with the headers from `vercel.json` and fails on any violation.

## Keeping what other people changed (connected mode)

After sign-in `src/data/api.js` reads every table the person may see into `S` (big tables as parallel pages). Once a minute, and when the tab is shown again, `refreshFromServer` first asks `public.data_stamp()` (a fingerprint of the database's write counters, migration 0037). Same stamp: nothing is downloaded. New stamp, or ten minutes since the last full read, or no answer: everything is read again and the screen is redrawn only if the data really differs. Nothing is replaced while this browser still has changes waiting to be saved.

## Things that will surprise you

Carried over from the prototype. Each has a matching item in `.claude/plan.md`.

1. **Extension points live in `src/core/hooks.js`.** A host view declares a slot (`slotHTML('sheets.top')`) and a feature fills it (`fillSlot`); extra handlers go through `onBind`; a view can be changed with `decorateView`; stage changes are announced with `emitEvent('stage:changing')` and heard with `onEvent`; sidebar items are added with `addNav(item, afterKey)`. Do not patch another feature's HTML or reassign its functions. The one remaining decorator is the dashboard (`management-report/report.js`).
2. **Two integrations only work inside claude.ai.** Google Sheet auto-import calls `window.claude.use('mcp')` and file saving tries `window.claude.use('downloads')` first. Saving falls back to a normal browser download; auto-import has no fallback.
3. **ExcelJS, the PDF reader and the Figtree font are our own copies** in `src/vendor/` (`npm run vendor`), loaded on first use; nothing is fetched from a public address (the page policy would refuse it).
4. **Lookups by id are indexed.** `getC`, `getA`, `getOp`, `appsOfC`, `appsOfOp` (`src/core/selectors.js`) use an index that `repo` invalidates on every change. Use them, never `S.candidates.find(...)` inside a loop: that made every page slower with the square of the list (`docs/SCALING.md`).
5. **Every piece of text from a person is escaped** with `esc()` (or `cleanHtml()` for formatted text such as the offer letter) before it goes into `innerHTML`. The deployed page policy forbids inline script, so a forgotten `esc()` is a bug, not a break-in, but it is still a bug (`docs/SECURITY_REVIEW.md`).

## How the split was verified

The prototype and this project were loaded side by side in headless Chromium with the clock frozen and `Math.random` seeded, so both generate identical demo data. A script then walked every sidebar page, every tab of three openings and six candidates, the calendar and board variants, a stage change, and three modals, and compared:

- 125 DOM and state snapshots: identical
- 9 screenshots (desktop, dark theme, mobile width): pixel-identical
- uncaught errors: none

The same comparison passes for `dist/Ecoste_Recruit_Tracker.html`. In addition, the splitter asserted that every line of the prototype's CSS and JS landed in exactly one file, and the extracted logo and Apps Script are byte-identical to the embedded originals.

Deliberate differences from the prototype: the logo is a file instead of a base64 string (the build inlines it again), the Apps Script lives in a `.gs` file, and a few small blocks were regrouped so each file holds one concern (default settings with the store; the posting tab hook with posting; the sync start-up with auto-import).

Not covered by that comparison: flows that need the network or claude.ai (Excel export/import via ExcelJS, Google Sheet auto-import) and most form submissions.
