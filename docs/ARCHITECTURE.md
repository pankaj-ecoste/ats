# Architecture (as it stands today)

## Runtime model

The app is a client-only, single-page application written in plain JavaScript with no framework and no build step.

- **State.** One object, `S` (`src/core/store.js`), holds everything: `settings`, `openings`, `candidates`, `applications`, `interviews`, `groups`, `offers`, `onboarding`, `tasks`, `activity`, `notifications`, `postings`, `boards`, `postCfg`, `autoSync`, `events`, `callLog`, `monthly`, `sheetLog`. It is read from and written to `localStorage` under the key `ecoste-ats` (older data under `spectra-ats-v3` is read once and copied; unknown versions are backed up to `ecoste-ats-backup`) as a single JSON blob.
- **Routing.** `R` (`src/app/router.js`) is in-memory UI state (current view, tab, filters). `go(view, param, tab)` changes it and re-renders. There are no URLs, so pages cannot be linked or refreshed into.
- **Rendering.** Each view is a pair `[viewFn, bindFn]` in `VIEWS` (`src/app/render.js`). `viewFn()` returns an HTML string, `render()` assigns it to `#content`, then `bindFn(root)` attaches handlers. Every change re-renders the whole page.
- **Mutations.** Code mutates `S` directly, then calls `save()` and `render()`. `setStage()` in `src/app/actions.js` is the main shared mutation; it emits `stage:changing` before writing.

## Layers and dependency direction

```
core  ->  data  ->  domain  ->  app  ->  features  ->  app/main.js
```

A layer may use layers to its left. `core`, `data` and `domain` never touch the DOM at load time, which is what lets `tests/unit/load-app.mjs` run them in Node.

All files are classic scripts in one global scope. Only `core/`, `data/` and `domain/` run in strict mode, because only that part of the prototype did. Turning strict mode on elsewhere is a separate, deliberate change.

## Things that will surprise you

Carried over from the prototype. Each has a matching item in `.claude/plan.md`.

1. **Extension points live in `src/app/hooks.js`.** A host view declares a slot (`slotHTML('sheets.top')`) and a feature fills it (`fillSlot`); extra handlers go through `onBind`; a view can be changed with `decorateView`; stage changes are announced with `emitEvent('stage:changing')` and heard with `onEvent`; sidebar items are added with `addNav(item, afterKey)`. Do not patch another feature's HTML or reassign its functions. The one remaining decorator is the dashboard (`management-report/report.js`).
2. **Two integrations only work inside claude.ai.** Google Sheet auto-import calls `window.claude.use('mcp')` and file saving tries `window.claude.use('downloads')` first. Saving falls back to a normal browser download; auto-import has no fallback.
3. **ExcelJS and the Figtree font load from public CDNs at runtime.**

## How the split was verified

The prototype and this project were loaded side by side in headless Chromium with the clock frozen and `Math.random` seeded, so both generate identical demo data. A script then walked every sidebar page, every tab of three openings and six candidates, the calendar and board variants, a stage change, and three modals, and compared:

- 125 DOM and state snapshots: identical
- 9 screenshots (desktop, dark theme, mobile width): pixel-identical
- uncaught errors: none

The same comparison passes for `dist/Ecoste_Recruit_Tracker.html`. In addition, the splitter asserted that every line of the prototype's CSS and JS landed in exactly one file, and the extracted logo and Apps Script are byte-identical to the embedded originals.

Deliberate differences from the prototype: the logo is a file instead of a base64 string (the build inlines it again), the Apps Script lives in a `.gs` file, and a few small blocks were regrouped so each file holds one concern (default settings with the store; the posting tab hook with posting; the sync start-up with auto-import).

Not covered by that comparison: flows that need the network or claude.ai (Excel export/import via ExcelJS, Google Sheet auto-import) and most form submissions.
