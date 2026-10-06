# Ecoste Recruit Tracker — Project Plan & Log

Single source of truth for **what exists, what was done, what is pending, and how changes are made**.
Update this file in the same change as the work it describes (see §9).

- **Last updated:** 2026-10-06
- **Current phase:** Phase 0 complete. Phase 1 in progress: git, env and Supabase project done; restructure step 1 done; pushed to GitHub.
- **Branch:** `chore/restructure-p1` (off `main`, baseline tag `v0.1.0-prototype`)
- **Status of the app:** working browser-only prototype. Not production-ready (see §6).

---

## 1. What this is

An ATS (applicant tracking system) for Ecoste's recruiting team. It was built by an intern from the department's requirements as one HTML file, then split into a maintainable project. The intern captured the team's workflow well. The work now is to turn it into a real, shared, deployed system.

Covers: openings, job posting, applications + AI-style match scoring, candidates + resume parsing, screening calls, group and personal interviews, offers (CTC breakup, letters), onboarding checklists, tasks, pipeline control (SLA), management report, Excel import/export, Google Sheet auto-import, Google Form generator, rule-based assistant, settings.

## 2. Current state (verified 2026-10-06)

| Check | Result |
|---|---|
| `npm test` (node:test, no deps) | 7/7 pass |
| `npm run build` | OK. `dist/Ecoste_Recruit_Tracker.html`, 12 stylesheets + 43 scripts inlined, 381 kB |
| Browser smoke test (`npm run test:e2e`) | Passes: 14 pages, no errors (run with installed Chrome via `CHROME_PATH`) |
| Git repository | Pushed to `github.com/pankaj-ecoste/ats`: `main` baseline, branch `chore/restructure-p1`, tag `v0.1.0-prototype` |
| Linter / formatter / CI | **None** (only `.editorconfig`) |
| Database / backend | Supabase project exists but is **empty and not connected**; the app still uses browser `localStorage` |
| Deployment | **None.** Runs from `index.html` or the single-file build |
| Size | ~1.9k dense lines across `src/features/**`; largest: `pipeline.js` (27 kB), `sheets-io.js` (29 kB), `posting.js` (27 kB), `auto-import.js` (23 kB), `report.js` (22 kB) |

## 3. Architecture in one page

Client-only SPA, plain JavaScript, no framework, no bundler. Full detail in `docs/ARCHITECTURE.md`.

- **State:** one global object `S` (`src/core/store.js`) saved as one JSON blob in `localStorage` key `spectra-ats-v3`. Entities: `settings, openings, candidates, applications, interviews, groups, offers, onboarding, tasks, activity, notifications, postings, boards, postCfg, autoSync, events, callLog, monthly, sheetLog`.
- **Routing:** in-memory `R` + `go(view, param, tab)`; no URLs.
- **Rendering:** each view is `[viewFn → HTML string, bindFn(root)]` registered in `VIEWS`; whole page re-renders on every change.
- **Mutations:** code edits `S` directly then calls `save()` + `render()`. Main shared mutation: `setStage()` (`src/app/actions.js`).
- **Load order (strict):** classic scripts in one global scope. `core → data → domain → app → features → app/main.js`. `index.html` is the only manifest; the build and the unit-test loader both read it.

### Folder map

```
index.html                 shell + ordered CSS/JS manifest (only place load order is maintained)
assets/img/                static images
src/core/                  utils, icons, constants (STAGES etc.), store (S, load/save), selectors, assets
src/data/seed.js           demo dataset (invented candidates; company "Northwind Technologies")
src/domain/                pure business rules: match.js, resume-parser.js, salary.js (no DOM)
src/app/                   router, shell (sidebar/top bar/search), ui (modal/toast), actions, render, main
src/features/<name>/       one folder per screen; CSS beside its JS
src/styles/                shared CSS in cascade order
src/generated/             form-script.js  ← generated, never edit
integrations/google-form/  Apps Script source of truth (.gs)
scripts/                   serve.mjs, build-single.mjs, gen-form-script.mjs
tests/unit, tests/e2e      node:test suites; Playwright smoke test
docs/                      ARCHITECTURE.md, PRODUCTION_ROADMAP.md
```

Feature folders were named so each maps 1:1 onto a future `apps/web/src/features/<name>`; `src/domain` maps onto a shared `packages/domain`.

### Pipeline model (business core)

`STAGES`: New → Shortlisted → Screening → Group Interview → Personal Interview → Selected → Offer → Offer Accepted → Joining → Onboarding → Employee Ready; plus terminal/side states `Rejected`, `On Hold`. Opening status (`Draft/Open/Screening/Interviewing/Offer/Filled/On Hold/Closed`) is derived from the furthest application stage inside `setStage()`. These rules are what must survive any rewrite.

### Full file inventory

| Path | Purpose |
|---|---|
| `index.html` | App shell; ordered list of 12 stylesheets and 43 scripts (the manifest the build and tests read) |
| `package.json`, `package-lock.json` | Scripts `dev`, `gen`, `build`, `test`, `test:e2e`. Only dependency: `playwright` (dev) |
| `.editorconfig`, `.gitattributes`, `.gitignore` | UTF-8/LF/2 spaces; force LF in git; ignore `node_modules/`, `dist/`, `.env*` (except `.env.example`), logs |
| `.env` (git-ignored, local only) | Real Supabase URL, anon key, service-role key, pooler `DATABASE_URL` |
| `.env.example` | Committed template with empty placeholders |
| `plan.md` | This file |
| `README.md`, `docs/ARCHITECTURE.md`, `docs/PRODUCTION_ROADMAP.md` | Run guide and layout; how the runtime works and its quirks; gap analysis to production |
| `assets/img/logo.jpg` | Logo (the build inlines it) |
| `src/core/utils.js` | DOM (`$`, `$$`), `esc`, dates (`today()`, `now()`, `addDays`, `fmtD`), money (`inr`, `lpa`), avatars |
| `src/core/icons.js` | SVG icon set |
| `src/core/constants.js` | `STAGES`, `JOURNEY`, status lists and colours, recruiters, interviewers, sources, criteria, screening questions, onboarding template, skill dictionary |
| `src/core/store.js` | Global state `S`, `DEFAULT_SETTINGS`, `load()` / `save()` (localStorage `spectra-ats-v3`) |
| `src/core/selectors.js` | `getOp`, `getC`, `getA`, `appsOfC`, `appsOfOp`, `intsOfA`, `offerOfA`, `stageRank`, `intStatus` |
| `src/core/assets.js` | Asset paths |
| `src/data/seed.js` | Demo dataset (openings, candidates, applications, interviews, offers) and `buildResume` |
| `src/domain/match.js` | Resume-to-opening scoring with configurable weights |
| `src/domain/resume-parser.js` | Plain-text resume parser |
| `src/domain/salary.js` | CTC breakup |
| `src/app/router.js` | Route state `R`, `NAV`, `go()`, previous/next record navigation (Alt+Left/Right) |
| `src/app/shell.js` | Sidebar, top bar, global search, quick add, notifications |
| `src/app/ui.js` | `modal`, `toast`, `confirmBox`, form helpers |
| `src/app/actions.js` | `log`, `notify`, `setStage` (also derives opening status), `nextAction`, `journey` |
| `src/app/render.js` | `VIEWS` registry and `render()` |
| `src/app/main.js` | Bootstrap, loads last |
| `src/features/dashboard/` | Dashboard |
| `src/features/openings/` | Openings list and opening detail with tabs |
| `src/features/applications/` | Applications table; `ai-match.js` match modal |
| `src/features/candidates/` | Candidate list and profile; `resume-viewer.js`; `add-candidate.js` (resume paste or upload) |
| `src/features/screening/` | Screening call form |
| `src/features/interviews/` | Calendar and lists; `group-interview.js` and `personal-interview.js` scorecards |
| `src/features/offers/` | Offer editor, letter, responses |
| `src/features/onboarding/` | Onboarding checklists |
| `src/features/tasks/`, `reports/`, `assistant/`, `settings/` | Tasks; standard reports; rule-based AI assistant; company, user and match-weight settings |
| `src/features/pipeline/` | Pipeline control centre and SLA rules (+ `pipeline.css`) |
| `src/features/posting/` | Job-board and social posting (+ `posting.css`) |
| `src/features/sheets/` | `sheets-io.js` Excel workbook schema, build, parse; `sheets.js` Sheets view; `auto-import.js` Google Sheet auto-import (+ css) |
| `src/features/management-report/` | `report-events.js`, `report-metrics.js`, `report-charts.js`, `report.js` (+ css) |
| `src/generated/form-script.js` | **Generated** from `integrations/`; never edit |
| `src/styles/` | `tokens`, `base`, `layout`, `components`, `widgets`, `utilities`, `responsive`, `print` (cascade order) |
| `integrations/google-form/setup.template.gs` | Apps Script that builds the application form (source of truth) |
| `scripts/serve.mjs`, `build-single.mjs`, `gen-form-script.mjs` | Dev server; single-file build; Apps Script generator |
| `tests/unit/` | `domain.test.mjs`, `sheets-io.test.mjs`, `load-app.mjs` (loads app scripts into a Node `vm`) |
| `tests/e2e/smoke.mjs` | Playwright: opens all 14 pages, fails on any uncaught error |

**Not in the tree yet (planned):** `supabase/migrations/`, `.github/workflows/`, `CONTRIBUTING.md`, `CHANGELOG.md`, ESLint and Prettier config, `src/app/registry.js` (extension points).

## 4. Done (log)

### Phase 0 — structure (complete)
- [x] Single-file prototype split into the layered project above; behaviour verified identical (125 DOM/state snapshots, 9 screenshots, 0 errors; per-line assertion that all CSS/JS landed in exactly one file).
- [x] Zero-dependency dev server (`npm run dev`), single-file build (`npm run build`), Apps Script generator (`npm run gen`).
- [x] Unit tests for seed integrity, match score range, salary sums, resume parser, sheet schema, date/time readers.
- [x] Playwright smoke test of every sidebar page (also runnable against `dist`).
- [x] Docs: `README.md`, `docs/ARCHITECTURE.md`, `docs/PRODUCTION_ROADMAP.md`.
- [x] `.editorconfig` (UTF-8, LF, 2-space), `.gitignore` (`node_modules`, `dist`, `.env*`).

### Phase 1: foundations (in progress, 2026-10-06)
- [x] **Git:** repository initialised on `main`; baseline commit; tag `v0.1.0-prototype`; `.gitattributes` forces LF.
- [x] **Secrets handling:** `.env` (git-ignored, verified not tracked) holds the Supabase keys and database URL; `.env.example` is tracked. `.gitignore` fixed so `.env.example` is not swallowed by `.env.*`.
- [x] **Supabase project created** (ref `zrzxmsttnmiteamjcwjh`, pooler region `ap-northeast-2`, Seoul). Credentials stored locally only. No schema, auth or RLS created yet.
- [x] **GitHub remote:** `origin` is `git@github-ecoste-ats:pankaj-ecoste/ats.git`, using a dedicated SSH key (`~/.ssh/id_ed25519_ecoste_ats`) and a host alias in `~/.ssh/config`. The laptop's existing default key and `github.com` entry are untouched. Authentication works.
- [x] **Branch** `chore/restructure-p1` created for restructuring work.
- [x] **Refactor 1:** single `STAGES` source; `TODAY` and `NOW` constants replaced by `today()` and `now()` (about 90 call sites); fixed two local `today` variables in `pipeline.js` that would have shadowed the new function.
- [x] **Verification after refactor:** `npm test` 7/7, `npm run build` OK, `npm run test:e2e` passes on all 14 pages.
- [x] `npm install` run; `package-lock.json` committed.

### Blocked or waiting
- [x] **Push to GitHub:** done 2026-10-06 after the key was re-added with write access. `main`, `chore/restructure-p1` and tag `v0.1.0-prototype` are on `origin`.
- [ ] **Rotate secrets:** the database password and `service_role` key were pasted into a chat. Reset the DB password and roll the JWT secret in Supabase (this also changes the anon key), then update `.env`.

### Review pass (2026-10-06)
- [x] Read the whole structure, all of `app/` and `core/` store/selectors, scripts, tests, docs.
- [x] Ran tests and build: green.
- [x] **Decision: do not move or rewrite code now.** The layout is already sound and verified; reshuffling before git/tests/CI exist would remove the safety net. Structural change happens in Phase 1 under version control.
- [x] Wrote this plan.

## 5. Known code issues (found in code, ranked)

| # | Issue | Where | Why it matters | Fix in |
|---|---|---|---|---|
| 1 | Features extend others by **wrapping views and `String.replace` on HTML** | `sheets/auto-import.js:144-145`, `posting/posting.js:160`, `management-report/report.js:116` | If host markup changes, injected UI silently disappears | P1.3 |
| 2 | `setStage` **reassigned globally** to record events | `management-report/report-events.js:39` | Order-dependent; hard to reason about | P1.3 |
| 3 | `NAV.splice` at load time | `pipeline.js:211`, `posting.js:155` | Sidebar order depends on script order | P1.3 |
| ~~4~~ | ~~`STAGES` defined twice~~ — fixed | `core/constants.js:4`, `sheets/sheets-io.js:6` | Will drift; breaks import/export | P1.2 (quick win) |
| ~~5~~ | ~~`TODAY` frozen at page load~~ — fixed | `core/utils.js` | Tab open overnight shows wrong date | P1.2 |
| 6 | `save()` swallows all errors; `load()` returns demo data if version ≠ 3 | `core/store.js` | Silent data loss | P1.4 / P2 |
| 7 | 15 inline `onclick="..."` attributes | router, dashboard, openings, candidates, … | Globals dependency; injection risk | P1.3 |
| 8 | Strict mode only in `core/data/domain` | rest of `src/` | Hidden global leaks | P1.3 |
| 9 | Whole-page `innerHTML` render | `app/render.js` | Loses focus/scroll; no pagination | P4 |
| 10 | Storage key `spectra-ats-v3` is a leftover name | `core/store.js` | Cosmetic, but migrate carefully | P1.4 |
| 11 | `window.claude.use('mcp')` for Sheet auto-import (no fallback) | `sheets/auto-import.js` | Does nothing outside claude.ai | P3 |
| 12 | ExcelJS + Figtree font from public CDNs | `index.html`, sheets | Offline/privacy/availability | P5 |

## 6. Production blockers (summary of `docs/PRODUCTION_ROADMAP.md`)

1. Data in one browser — no shared database, no backup.
2. No users/auth/roles — "current user" is a text field; recruiters/interviewers are hard-coded in `core/constants.js`.
3. Candidate personal data (salary, phone, email, offers) unprotected; no audit trail. India DPDP Act applies — needs review.
4. "Send" (email/WhatsApp/invite) only writes to the activity log; nothing is delivered.
5. Resume upload is `.txt/.md` only; documents are names, not files.
6. Demo seed data is the default for new users.
7. "AI" = keyword rules + regex + canned replies. Relabel or back with a real model (human decision stays in the loop; record rejection reasons).

## 7. Roadmap — pending work

Legend: ☐ pending · ◐ in progress · ☑ done

### Phase 1 — Foundations (next; no new features)

**P1.1 Code management** *(do first; everything else depends on it)*
- ☑ `git init`, baseline commit, tag `v0.1.0-prototype` (2026-10-06)
- ◐ Remote repo `pankaj-ecoste/ats` live and pushed; still to do: protect `main`, require PR review
- ☐ Branching: `main` (deployable) ← short-lived `feat/*`, `fix/*`, `chore/*` via pull request; squash merge
- ☐ Commit style: Conventional Commits (`feat(offers): …`, `fix(pipeline): …`)
- ☐ PR template + checklist (tests pass, plan.md updated, no secrets, load order checked)
- ☐ CODEOWNERS / reviewer rule: at least 1 review before merge
- ☐ Version tags + `CHANGELOG.md`

**P1.2 Quick safety wins** *(low risk, behaviour unchanged)*
- ☑ Remove duplicate `STAGES` in `sheets-io.js`; it now receives the one from `core/constants.js` (test loads constants first)
- ☑ Compute "today" on use: `today()` / `now()` replace the `TODAY` / `NOW` constants (also fixed two local `today` variables in `pipeline.js` that would have shadowed it)
- ☐ Surface `save()` failures to the user (toast) instead of swallowing
- ☐ Rename storage key via a one-time migration (`spectra-ats-v3` → `ecoste-ats`), keep old key as fallback

**P1.3 Make code safe to change**
- ☐ Convert classic scripts to ES modules (explicit imports/exports); keep `index.html` manifest working until a bundler replaces it
- ☐ Replace inline `onclick` with bound handlers (15 sites)
- ☐ Replace view-wrapping/`String.replace` hooks with explicit slots; `setStage` emits an event instead of being reassigned; NAV declared in one place
- ☐ Strict mode everywhere
- ☐ One mutation layer (`createOpening`, `moveStage`, `recordFeedback`, …) — the seam where the database plugs in
- ☐ Move candidate-facing/company constants (recruiters, interviewers, company defaults) out of code into settings/data

**P1.4 Tooling**
- ☐ ESLint + Prettier configured to match `.editorconfig`
- ☐ Add `npm run lint`, `npm run format`
- ☐ CI (GitHub Actions): install, lint, unit tests, build, Playwright smoke on `dist`; upload `dist` as artifact
- ☐ Pre-commit hook (lint + unit tests)
- ☐ Widen unit tests: stage transitions & opening-status derivation (`setStage`), `nextAction`, salary, import/export round-trip, store migrations

**P1.5 Conventions (written down in `CONTRIBUTING.md`)**
- ☐ File naming: `src/features/<name>/<name>.js`, kebab-case, CSS beside JS
- ☐ Layer rule: a layer may only use layers to its left (`core → data → domain → app → features`); `domain/` stays DOM-free and test-covered
- ☐ Generated files are never hand-edited; header comment says how to regenerate
- ☐ Every new feature: view + bind, NAV entry, manifest entry, at least one test, line in `plan.md`
- ☐ No secrets in repo; config via `.env` (git-ignored) with a committed `.env.example`

### Phase 2 — Database & backend (the "database link")

**P2.0 Decisions needed from you (blockers for this phase)** — see §8.

- ☑ Stack chosen: **Supabase (PostgreSQL + auth + storage)**; project created (see §4)
- ☐ Schema + migrations for each entity in `S` (openings, candidates, applications, interviews, groups, offers, onboarding, tasks, activity, notifications, settings, postings, events, call_log, …) with foreign keys matching `cid` / `opId` / `appId` links
- ☐ Environments: `dev`, `staging`, `prod`, each with its own database and keys
- ☐ Authentication (Google Workspace SSO) + roles: admin, recruiter, interviewer, hiring manager, read-only management; row-level security
- ☐ Replace `localStorage` in the mutation layer with API calls; keep an offline-demo adapter for tests
- ☐ One-time import of existing data via the workbook importer
- ☐ Resume/document upload (PDF/DOCX) to object storage + text extraction
- ☐ Append-only audit log; retention/deletion rules; consent text on the application form
- ☐ Backups with a tested restore

### Phase 3 — Real integrations
- ☐ Email delivery and calendar invites for interviews (WhatsApp only if wanted)
- ☐ Application form posts straight to the API (replace Google Sheet + `window.claude` auto-import; Sheets become export/one-way intake)
- ☐ Job-board posting where APIs exist
- ☐ Optional model-backed matching (with human decision + rejection reasons)

### Phase 4 — Frontend modernisation (feature by feature)
- ☐ TypeScript types for entities; then React + Vite with a real router (URLs, deep links, back button)
- ☐ Pagination/virtualised lists; stop whole-page re-render
- ☐ Migrate one feature at a time behind the same API

### Phase 5 — Deployment & operations
- ☐ Hosting: static frontend (Vercel/Netlify/Cloudflare Pages/S3+CDN) + API/DB host; custom domain (e.g. `ats.ecoste.in`) with HTTPS
- ☐ Deploy flow: PR → CI → preview URL → merge to `main` → auto-deploy to **staging** → manual promote to **prod**
- ☐ Rollback procedure (redeploy previous tag) documented and rehearsed
- ☐ Error monitoring, uptime check, log retention
- ☐ Self-host fonts and ExcelJS (remove CDNs); security headers/CSP
- ☐ Accessibility pass, load test, security test, DPDP review

## 8. Open decisions (need an owner)

| # | Question | Default if no answer |
|---|---|---|
| D1 | Database platform: **decided, Supabase** (region Seoul; moving to Mumbai would need a new project) | done |
| D2 | Repo location: **decided, github.com/pankaj-ecoste/ats** | done |
| D3 | Sign-in method: Google Workspace SSO for `@ecoste.in`? | Yes |
| D4 | Is Google Sheet staying as intake only, or still a system of record? | Intake/export only |
| D5 | Which channels must really send: email, calendar, WhatsApp? | Email + calendar |
| D6 | Real company name/address/signatory to replace "Northwind Technologies" defaults? | Ask HR |
| D7 | Is the current "AI" wording acceptable internally, or relabel as "rule-based"? | Relabel until a model is connected |
| D8 | Keep React rewrite (Phase 4) or stay vanilla JS + modules? | Decide after Phase 2 |

## 9. How every future change is made (update process)

1. **Start from `main`**, create `feat/<short-name>` or `fix/<short-name>`.
2. **Small change, one concern.** Follow the layer rule and file naming in §7 P1.5.
3. **Adding a screen:** `src/features/<name>/<name>.js` (+ `.css`) → register `VIEWS.<name>=[view,bind]` → add `NAV` entry → add files to `index.html` after their dependencies, before `src/app/main.js` → add a test → add the page to the smoke test (automatic via `NAV`).
4. **Editing the Google Form script:** edit `integrations/google-form/setup.template.gs`, run `npm run gen`. Never edit `src/generated/`.
5. **Before the PR:** `npm test`, `npm run build`, `npm run test:e2e` (once lint/CI exist: `npm run lint`).
6. **Update `plan.md`:** tick items in §7, add a dated line to §10, adjust §5 if an issue is fixed or found.
7. **PR → review → squash merge → CI deploys to staging → promote to prod.**
8. **Data/schema changes** (after Phase 2): migration file only, never manual edits to prod; every migration reversible and tested on staging first.
9. **Releases:** tag `vX.Y.Z`, update `CHANGELOG.md`.

## 10. Change log

| Date | Change | By |
|---|---|---|
| 2026-10-06 | Branch `chore/restructure-p1`: git, SSH key and host alias, `.env` and `.env.example`, Supabase project linked in `.env`, single `STAGES`, `today()` and `now()`; tests, build and smoke test green; plan.md expanded with file inventory | Claude Code |
| 2026-10-06 | Reviewed codebase, verified tests/build, wrote `plan.md` with issues list, roadmap, process | Claude Code |
| (earlier) | Phase 0: prototype split into layered project, tests, docs, build | Intern / project setup |

## 11. Quick reference

```bash
npm run dev          # http://localhost:5173
npm test             # unit tests (no deps)
npm run build        # dist/Ecoste_Recruit_Tracker.html (single file)
npm run gen          # regenerate src/generated/form-script.js
npm install && npx playwright install chromium && npm run test:e2e
```

Requires Node 20+ (tested on 24). Related docs: `README.md`, `docs/ARCHITECTURE.md`, `docs/PRODUCTION_ROADMAP.md`.
