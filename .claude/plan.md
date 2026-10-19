# Ecoste Recruit Tracker — Project Plan & Log

Single source of truth for **what exists, what was done, what is pending, and how changes are made**.
Lives at `.claude/plan.md`. Update this file in the same change as the work it describes (see §9).

- **Last updated:** 2026-10-16
- **Current phase:** Phase 1 (Foundations) in progress: P1.1 (git), P1.2 and the extension-point and mutation-layer parts of P1.3 are done. Tooling (lint, CI, hook, conventions) is written. **Phase 2 has started:** the database schema, rules and access policies are built and tested; the login screen and Users page are in. **P2.3 (data layer) core is done:** ids are collision-proof, the app reads everything from Supabase after sign-in, and every change is saved back in the background. Two recruiters can now share data in connected mode. Notifications reach the right people and every role sees only the pages it may use. Left in P2.3: loading and error states, pagination, interviewer scorecards, realtime refresh (see Phase 2). Left in Phase 1: protect `main`, see CI green once, inline onclick, ES modules, strict mode, constants out of code. Then Phase 2 (backend core).
- **Branch:** `chore/restructure-p1` (off `main`, baseline tag `v0.1.0-prototype`)
- **Status of the app:** working browser-only prototype. Not production-ready (see §6).

---

## 1. What this is

An ATS (applicant tracking system) for Ecoste's recruiting team. It was built by an intern from the department's requirements as one HTML file, then split into a maintainable project. The intern captured the team's workflow well. The work now is to turn it into a real, shared, deployed system.

Covers: openings, job posting, applications + AI-style match scoring, candidates + resume parsing, screening calls, group and personal interviews, offers (CTC breakup, letters), onboarding checklists, tasks, pipeline control (SLA), management report, Excel import/export, Google Sheet auto-import, Google Form generator, rule-based assistant, settings.

## 2. Current state (verified 2026-10-06)

| Check | Result |
|---|---|
| `npm test` (node:test, no deps) | 154/154 pass |
| `npm run build` | OK. `dist/Ecoste_Recruit_Tracker.html`, 12 stylesheets + 43 scripts inlined, 381 kB |
| Browser tests (`test:e2e`, `test:e2e:hooks`, `test:e2e:flows`, `test:e2e:auth`, `test:e2e:data`, `test:e2e:writes`) | Pass on source and on `dist`: 14 pages, 13 hook checks, 67 flow checks; against the live project: 27 sign-in, 43 data (admin setup, recruiter, management, interviewer with scorecard, hiring manager with offer approval, refresh), 29 write 24 file and 19 careers checks (run with installed Chrome via `CHROME_PATH`) |
| Git repository | Pushed to `github.com/pankaj-ecoste/ats`: `main` baseline, branch `chore/restructure-p1`, tag `v0.1.0-prototype` |
| Linter / CI / hooks | ESLint clean; CI workflow written (first run on next push); pre-commit hook on. No formatter (see P1.4) |
| Database / backend | Supabase project has the full schema, rules, access policies and username login (15 migrations; 63 database tests pass: 32 access, 11 real sign-in, 16 round trip). In connected mode the app reads from the database after sign-in and saves every change back in the background (a red message appears if a save is refused or fails). Demo mode still uses browser `localStorage` |
| Deployment | **None.** Runs from `index.html` or the single-file build |
| Size | ~1.9k dense lines across `src/features/**`; largest: `pipeline.js` (27 kB), `sheets-io.js` (29 kB), `posting.js` (27 kB), `auto-import.js` (23 kB), `report.js` (22 kB) |

## 3. Architecture in one page

Client-only SPA, plain JavaScript, no framework, no bundler. Full detail in `docs/ARCHITECTURE.md`.

- **State:** one global object `S` (`src/core/store.js`) saved as one JSON blob in `localStorage` key `spectra-ats-v3`. Entities: `settings, openings, candidates, applications, interviews, groups, offers, onboarding, tasks, activity, notifications, postings, boards, postCfg, autoSync, events, callLog, monthly, sheetLog`.
- **Routing:** in-memory `R` + `go(view, param, tab)`; no URLs.
- **Rendering:** each view is `[viewFn → HTML string, bindFn(root)]` registered in `VIEWS`; whole page re-renders on every change.
- **Mutations:** code edits `S` directly then calls `save()` + `render()`. Main shared mutation: `setStage()` (`src/app/actions.js`).
- **Load order (strict):** classic scripts in one global scope. `core → data → domain → services → app → features → app/main.js`. `index.html` is the only manifest; the build and the unit-test loader both read it.

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
| `supabase/migrations/0001..0015_*.sql` | The database schema, rules and access policies (see `docs/DATABASE.md`) |
| `scripts/gen-config.mjs`, `scripts/vendor.mjs` | Write `src/generated/config.js` (public URL and anon key from `.env`; empty means demo mode); copy the Supabase library into `src/vendor/` |
| `src/generated/config.js` (not committed), `src/vendor/supabase.js` | The two values the browser needs to reach Supabase; the vendored Supabase library (no public CDN) |
| `src/data/mapping.js` | Pure translation between database rows and the app's records, both directions: `makePeople` (names to profile ids and back), `stateFromRows`, `TO_ROW`, `rowsFromState` |
| `src/data/api.js` | Reading: `fetchTable` (pages of 1000), `fetchAll`, `loadFromServer(client, me)` replaces `S`. Writing: `createWriter` (ordered queue, retries, one error message per run of failures), `applyChange`, `writeRecord`, `syncCollection`, `startWriting`, `stopWriting`, `writesPending` |
| `tests/db/roundtrip.test.mjs` | 16 tests: the sample data goes into every table, comes back, and must be identical (found 4 real mismatches, see log) |
| `tests/e2e/writes.mjs` | Live browser test, 23 checks: use cases run as a signed-in admin, rows checked in the project, reload brings it all back, a recruiter's forbidden change is refused in plain words; removes everything it made |
| `tests/unit/data-writer.test.mjs` | 12 tests of the writer with a fake database client |
| `tests/e2e/data.mjs` | Live browser test: records put in the project, a person signs in, pages show them; no business data in browser storage; each person sees only their own notifications |
| `tests/unit/data-mapping.test.mjs`, `ids.test.mjs` | Mapping, paging and id format |
| `src/core/supabase.js` | Creates the browser's Supabase client, or none in demo mode (`CONNECTED`, `sb`) |
| `src/services/auth.js` | Sign in and out, change own password, list and manage accounts (admin), password generator. Turns Supabase errors into plain sentences |
| `src/features/auth/` | Sign-in screen, pending/switched-off screen, account menu, change-password dialog, boot sequence |
| `src/features/users/users.js` | Users page for admins |
| `tests/support/accounts.mjs` | Create and fully remove the `zz...` test accounts |
| `scripts/db.mjs` | Migration runner and server tools: `db:migrate`, `db:status`, `db:create-admin`, `db:reset` (dev only) |
| `tests/db/rls.test.mjs` | 29 access-rule and account-management tests against the real database, all rolled back (`npm run test:db`) |
| `tests/db/login.test.mjs` | 11 real sign-in tests over HTTP against Supabase Auth; creates `zz...` accounts and removes them afterwards |
| `docs/SECURITY_CHECKLIST.md` | What to do on the Supabase, GitHub and hosting side before go-live (yours to action) |
| `docs/DATABASE.md` | Roles, tables, rules, how to change the schema |
| `eslint.config.mjs` | Lint rules; derives cross-file globals from `src` automatically |
| `CONTRIBUTING.md` | How to set up, the rules of the code, branches, commits, checklists |
| `.github/workflows/ci.yml`, `.github/pull_request_template.md` | CI on every push and pull request; PR checklist |
| `.githooks/pre-commit`, `scripts/setup-hooks.mjs` | Lint + unit tests before each commit; the script enables the hook on `npm install` |
| `.editorconfig`, `.gitattributes`, `.gitignore` | UTF-8/LF/2 spaces; force LF in git; ignore `node_modules/`, `dist/`, `.env*` (except `.env.example`), logs |
| `.env` (git-ignored, local only) | Real Supabase URL, anon key, service-role key, pooler `DATABASE_URL` |
| `.env.example` | Committed template with empty placeholders |
| `.claude/plan.md` | This file (project plan and log) |
| `README.md`, `docs/ARCHITECTURE.md`, `docs/PRODUCTION_ROADMAP.md` | Run guide and layout; how the runtime works and its quirks; gap analysis to production |
| `assets/img/logo.jpg` | Logo (the build inlines it) |
| `src/core/utils.js` | DOM (`$`, `$$`), `esc`, dates (`today()`, `now()`, `addDays`, `fmtD`), money (`inr`, `lpa`), avatars |
| `src/core/icons.js` | SVG icon set |
| `src/core/constants.js` | `STAGES`, `JOURNEY`, status lists and colours, recruiters, interviewers, sources, criteria, screening questions, onboarding template, skill dictionary |
| `src/core/store.js` | Global state `S`, `DEFAULT_SETTINGS`, `load()` / `save()` (localStorage `spectra-ats-v3`) |
| `src/core/repo.js` | The only code that inserts, updates, removes records in `S`; notifies listeners (`repoOnChange`) so a Supabase adapter can mirror changes |
| `src/core/selectors.js` | `getOp`, `getC`, `getA`, `appsOfC`, `appsOfOp`, `intsOfA`, `offerOfA`, `stageRank`, `intStatus` |
| `src/core/assets.js` | Asset paths |
| `src/data/seed.js` | Demo dataset (openings, candidates, applications, interviews, offers) and `buildResume` |
| `src/domain/match.js` | Resume-to-opening scoring with configurable weights |
| `src/domain/resume-parser.js` | Plain-text resume parser |
| `src/domain/salary.js` | CTC breakup |
| `src/domain/sheet-values.js` | Reading loose spreadsheet values: `h36` hash, `numIn`, `toLPA`, `toNotice` |
| `src/app/router.js` | Route state `R`, `NAV`, `go()`, previous/next record navigation (Alt+Left/Right) |
| `src/app/shell.js` | Sidebar, top bar, global search, quick add, notifications |
| `src/app/ui.js` | `modal`, `toast`, `confirmBox`, form helpers |
| `src/services/activity.js` | `log`, `notify`, `markNotificationRead`, `markAllNotificationsRead` |
| `src/services/tasks.js` | `addTask`, `setTaskDone`, `deleteTask` |
| `src/services/stages.js` | `moveStage`: writes the stage, logs it, derives the opening status, fires `stage:changing` |
| `src/services/openings.js` | `saveOpening` |
| `src/services/candidates.js` | `addCandidateNote`, `setDocumentStatus`, `requestDocument`, `updateCandidateProfile`, `recordMessage` |
| `src/services/applications.js` | `createCandidateApplication`, `assignRecruiter` |
| `src/services/interviews.js` | `recordScreening`; group: `scheduleGroupInterview`, `setInviteStatus`, `sendGroupReminders`, `cancelGroupInterview`, `evaluateGroup`; personal: `schedulePersonalInterview`, `recordScorecard`; `markNoShow`, `cancelInterview` |
| `src/services/offers.js` | `saveOffer`, `markOfferSent`, `recordOfferResponse` |
| `src/services/onboarding.js` | `confirmJoining`, `recordJoined`, `ensureOnboardingChecklist`, `beginOnboarding`, `setOnboardingItem`, `markEmployeeReady` |
| `src/services/posting.js` | `recordSocialShare`, `savePosting`, `deletePosting`, `savePostingSettings`, `removeBoard`, `resetBoards`, `saveBoards` |
| `src/services/settings.js` | `updateSetting`, `updateMatchWeight`, `setMatchThreshold`, `resetMatchWeights`, `saveSla`, `resetDemoData` |
| `src/services/report.js` | `addEvent`, the stage-change event recorder, `setReportThreshold`, `clearDemoHistory`, call log, monthly targets, `setDropRisk`, `setBackup`, `recordDropout` |
| `src/services/sheets.js` | `applyWorkbookImport`, `logSheetEvent`, `importSheetRows`, auto-import config (`saveAutoSyncConfig`, `recordSyncRun`, `recordSyncFailure`, `setAutoSyncEnabled`, `disconnectAutoSync`) |
| `src/app/actions.js` | `setStage` (UI wrapper over `moveStage`: toast + re-render), `nextAction`, `journey` |
| `src/core/hooks.js` | Extension points: `fillSlot`/`slotHTML`, `onBind`, `decorateView`, `onEvent`/`emitEvent`, `addNav`, `registerAction`/`runAction` |
| `src/app/ui-actions.js` | Table of button actions (`go`, `addCandidate`, `openingForm`, ...) and the one click listener that runs them |
| `src/app/render.js` | `VIEWS` registry and `render()` (runs bind hooks) |
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
| `tests/e2e/hooks.mjs` | Playwright: slots, bind hooks, dashboard decorator, stage event, nav order, tasks and notifications wiring (13 checks) |
| `tests/e2e/auth.mjs` | Playwright against the live project: sign-in, wrong password, Users page, add user, change and reset password, role change, switch off and on, pending account (27 checks) |
| `tests/unit/auth.test.mjs` | 14 tests of the auth service with a fake Supabase client |
| `tests/e2e/flows.mjs` | Playwright: 47 checks that user actions reach the data (openings, candidates, interviews, offers to employee-ready, posting, settings, report, Google Sheet auto-import with the connector stubbed) |
| `tests/unit/services.test.mjs`, `services-people`, `services-interviews`, `services-offers`, `services-settings`, `services-report`, `services-sheets` | Unit tests for every service: stage rules, opening-status derivation, interviews, offers, onboarding, posting, settings, report events, sheet import |
| `tests/unit/hooks.test.mjs` | Actions, slots, bind hooks, events, nav, decorators |
| `tests/unit/architecture.test.mjs` | Fails if app/feature code writes `S` or calls `save()`, or if a service touches the UI |
| `tests/unit/store.test.mjs` | Storage key migration, backup of unknown versions, failed-save reporting |

**Not in the tree yet (planned):** `CHANGELOG.md`.

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
| ~~1~~ | ~~Features extend others by wrapping views and `String.replace` on HTML~~ — fixed (`hooks.js`) | `sheets/auto-import.js:144-145`, `posting/posting.js:160`, `management-report/report.js:116` | If host markup changes, injected UI silently disappears | P1.3 |
| ~~2~~ | ~~`setStage` reassigned globally~~ — fixed (event) | `management-report/report-events.js:39` | Order-dependent; hard to reason about | P1.3 |
| ~~3~~ | ~~`NAV.splice` at load time~~ — fixed (`addNav`) | `pipeline.js:211`, `posting.js:155` | Sidebar order depends on script order | P1.3 |
| ~~4~~ | ~~`STAGES` defined twice~~ — fixed | `core/constants.js:4`, `sheets/sheets-io.js:6` | Will drift; breaks import/export | P1.2 (quick win) |
| ~~5~~ | ~~`TODAY` frozen at page load~~ — fixed | `core/utils.js` | Tab open overnight shows wrong date | P1.2 |
| ~~6~~ | ~~`save()` swallows all errors~~ — fixed; still open: `load()` falls back to demo data; `load()` returns demo data if version ≠ 3 | `core/store.js` | Silent data loss | P1.4 / P2 |
| 7 | 15 inline `onclick="..."` attributes | router, dashboard, openings, candidates, … | Globals dependency; injection risk | P1.3 |
| ~~8~~ | ~~Strict mode only in `core/data/domain`~~ — fixed, all files strict | | | |
| 9 | Whole-page `innerHTML` render | `app/render.js` | Loses focus/scroll; no pagination | P4 |
| ~~10~~ | ~~Storage key `spectra-ats-v3`~~ — migrated | `core/store.js` | Cosmetic, but migrate carefully | P1.4 |
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

## 7. The whole-app plan and phased roadmap

Legend: ☐ pending · ◐ in progress · ☑ done. Effort: S = days, M = 1-2 weeks, L = 3-6 weeks (one developer, rough).

### 7.1 Goal, scope, non-goals

**Goal.** One shared, secure ATS for Ecoste's recruiting team that replaces spreadsheets and the browser-only prototype: every opening, candidate, interview, offer and joining is in one database, with the right people seeing the right data and real emails and invites going out.

**In scope (v1).** Everything the prototype shows today, made real: openings, applications, candidates and resumes, screening, group and personal interviews, offers, onboarding, tasks, pipeline control, management report, job posting, Excel and Google Sheet intake, user login and roles, audit log.

**Out of scope for v1.** Payroll or HRMS sync, candidate self-service portal, mobile app, multi-company (multi-tenant) use, video interviewing. Revisit after launch (Phase 8).

### 7.2 Users and roles

| Role | Who | Can do |
|---|---|---|---|
| `admin` | Head of TA, developer | Everything, including users, settings, delete, audit log |
| `recruiter` | Recruiting team | Create and edit openings, candidates, applications, interviews, offers (send needs approval if enabled), tasks |
| `interviewer` | Panel members | See only interviews assigned to them and those candidates' résumés; submit scorecards |
| `hiring_manager` | Department heads | Read their own openings and pipelines; approve offers; give feedback |
| `management` | Leadership | Read-only dashboards and management report; no candidate contact details or salary unless granted |

Rules enforced in the database (row-level security), never only in the UI. Salary and offer fields are visible to `admin`, `recruiter` and approving `hiring_manager` only.

### 7.3 Modules: today and target

| Module | Today | Target |
|---|---|---|---|
| Dashboard, Reports, Management report | Computed in the browser from `S` | SQL views and functions; same screens; export to PDF/Excel |
| Openings, Job posting | CRUD in browser; "posting" is text and links | Same, plus public careers page and job-board links |
| Applications, AI match | Keyword scoring in `domain/match.js` | Same rules in a shared domain package; stored score with reasons; optional model-assisted score later |
| Candidates, Resume viewer, Add candidate | `.txt` and `.md` only | PDF/DOCX upload to storage, text extraction, duplicate detection |
| Screening, Group and Personal interviews | Forms writing to `S` | Same forms; scorecards stored per interviewer; calendar invites |
| Offers | Editor and printable letter | Approval step, letter PDF stored, send by email, response tracked |
| Onboarding, Tasks | Checklists in `S` | Same, assigned to real users, reminders |
| Pipeline control (SLA) | Computed in browser | Scheduled job raises alerts and notifications |
| Sheets (export, import, auto-import) | ExcelJS in browser; auto-import only inside claude.ai | Export stays; Google Form posts to the API; Sheets are intake or export only |
| AI assistant | Hard-coded patterns | Relabel as "search and shortcuts" until a model is connected |
| Settings | Text fields in `S` | Company settings table; users and roles screen |

### 7.4 Target data model (PostgreSQL on Supabase)

All tables have `id uuid`, `created_at`, `updated_at`, `created_by`. Existing short ids (`OP-…`, `A-…`) are kept as a `code` column for continuity with the workbook importer.

| Table | Replaces in `S` | Notes |
|---|---|---|---|
| `profiles` | recruiter and interviewer arrays, `settings.user` | One row per auth user; `role`, `active` |
| `company_settings` | `settings` | Single row; match threshold and weights as `jsonb` |
| `openings` | `openings` | `status` derived by a trigger from applications, as `setStage` does today |
| `candidates` | `candidates` | Personal data; unique on normalised email and phone |
| `candidate_documents` | `candidate.documents` | Metadata; the file is in Storage; status of verification |
| `applications` | `applications` | `candidate_id`, `opening_id`, `stage`, `max_stage`, `stage_since`, match score and reasons |
| `stage_events` | `events`, part of `activity` | Append-only; every stage move with who and when; feeds the management report |
| `screenings` | `callLog`, `application.screening` | Answers as `jsonb`, outcome, notes |
| `interview_groups`, `interviews`, `interview_scores` | `groups`, `interviews` | One score row per interviewer per criterion |
| `offers` | `offers` | Status, CTC breakup `jsonb`, approval, sent and response dates |
| `onboarding_items` | `onboarding` | Checklist rows per application |
| `tasks` | `tasks` | Assignee is a `profiles` row |
| `notifications` | `notifications` | Per user, read flag |
| `audit_log` | `activity` (capped at 300 today) | Append-only, never capped; who changed what |
| `postings`, `job_boards` | `postings`, `boards`, `postCfg` | Where each opening is advertised |
| `messages` | composer "send" | Every email sent, template, status from the provider |
| `intake_batches` | `sheetLog`, `autoSync` | One row per sheet or form import, with counts and errors |

Migrations live in `supabase/migrations/` as numbered SQL files. Every table gets row-level security in the same migration that creates it.

**As built (2026-10-10), where it differs from the table above.**
- **Ids stay text** (`OP-1001`, `C-2001`, `APP-3101`) instead of uuid plus a `code` column. It keeps the app and the database speaking the same ids. Rows that belong to a login use the login's uuid. **Done 2026-10-16 (P2.3 step 1):** new ids are collision-proof, a prefix plus 8 random characters from `crypto` (`uid('APP')` gives `APP-K7M2QX9D`; no look-alike letters). Candidates, applications, notifications and every other `uid()` call use it. The old counter-plus-random ids could collide when two people added records at the same moment.
- **Salary is its own table** (`candidate_compensation`) so it can be hidden from roles that may see the rest of the profile.
- **Scorecards:** `interview_scores` has one row per interviewer (arrays of scores); the interview row keeps the final result, as in the app.
- **Settings:** `company_settings` is a single row. SLA days, report alert levels, the posting config and the Google Sheet connection sit in its `config` column. Recruiters and interviewers come from `profiles`.
- **Extra tables** the app needed: `screenings`, `interview_groups`, `onboarding_checklists`, `report_events`, `call_log`, `monthly_targets`, `job_boards`, `sheet_log`, `activity` (the readable feed, separate from the audit log).
- **Audit log** is filled by triggers, not by the app, and records only changed fields.

### 7.5 Target architecture

```
Browser app (today's vanilla JS, then modules, optionally React later)
   │  supabase-js (anon key + user session)
   ▼
Supabase: Auth (username + password, accounts made by an admin)  ·  Postgres + RLS  ·  Storage (resumes, letters)
   │                                   ▲
   ├─ Edge Functions: public application form intake, email send, résumé text extraction, calendar invites
   └─ Scheduled jobs (pg_cron): SLA alerts, reminders, sheet intake
```

- **Service-role key and database URL are server-only** (Edge Functions, CI, migrations). The browser only ever has the project URL and anon key.
- **One data-access module** (`src/data/api.js` after P2) is the only code that talks to Supabase. Features call named functions (`moveStage`, `createOffer`), never raw queries. An in-memory adapter with the same interface keeps tests and the demo working.
- **Domain rules** (`match`, `salary`, `resume-parser`, stage rules) stay pure and shared, tested in Node.

### 7.6 Cross-cutting rules (apply to every phase)

- **Security and privacy:** RLS on every table; no secrets in the repo; candidate data access logged; consent text on the application form; retention and deletion rules; India DPDP review before go-live.
- **Testing:** unit tests for domain and data layer; the smoke test on every page; SQL tests for RLS (each role can and cannot do what the matrix says); one end-to-end happy path (apply → hire → onboard).
- **Environments:** `dev` (local or a dev Supabase project), `staging`, `prod`. Today's single project becomes `dev`; create the other two before Phase 7.
- **Definition of done for any change:** tests pass, lint passes, build passes, smoke test passes, `.claude/plan.md` updated, reviewed in a pull request, no new global state.

### 7.7 Phase overview

| # | Phase | Outcome | Effort | Depends on |
|---|---|---|---|---|
| 1 | Foundations | Safe to change: git workflow, tooling, CI, modules, one mutation layer | M-L | none |
| 2 | Backend core | Real shared database, login, roles; app reads and writes Supabase | L | 1 |
| 3 | Files and messaging | Resumes and letters stored; real email and calendar invites | M | 2 |
| 4 | Intake and integrations | Application form and sheets feed the API; careers page; job boards | M | 2, 3 |
| 5 | Automation and insight | Scheduled SLA alerts, reminders, SQL-backed reports, optional model assist | M | 2, 3 |
| 6 | Frontend modernisation (gate) | Real URLs, Vite build, TypeScript; React only if the gate says yes | L | 2 |
| 7 | Hardening and launch | Staging and prod, monitoring, backups, security and DPDP review, UAT, go-live | M | 2-5 |
| 8 | Post-launch | Feedback loop, v2 features | ongoing | 7 |

Phases 3, 4 and 5 can overlap once Phase 2 is done. Phase 6 can run in parallel with 3-5 if there is a second developer; otherwise do it after launch.

### Phase 1: Foundations (in progress; no new features)

*Goal:* any developer can change the code safely, and every change is reviewed, tested and traceable.

**P1.1 Code management**
- ☑ `git init`, baseline commit, tag `v0.1.0-prototype` (2026-10-06)
- ☑ Remote repo `pankaj-ecoste/ats` live and pushed over SSH (2026-10-06)
- ☐ Protect `main`: pull request and one review required, no force push
- ☑ Branching rules written in `CONTRIBUTING.md` (`main` ← short-lived `feat/*`, `fix/*`, `chore/*` via pull request; squash merge). Enforcement on GitHub still pending (protect `main`).
- ☑ Commit style: Conventional Commits, written in `CONTRIBUTING.md`
- ☑ PR template and checklist (`.github/pull_request_template.md`)
- ☐ Version tags and `CHANGELOG.md`

**P1.2 Quick safety wins** *(behaviour unchanged)*
- ☑ Remove duplicate `STAGES`; `sheets-io.js` receives the one from `core/constants.js`
- ☑ `today()` / `now()` replace the `TODAY` / `NOW` constants
- ☑ `save()` failures are reported to the user (once per failure streak)
- ☑ Storage key renamed to `ecoste-ats`: legacy key read once and never deleted; unknown versions backed up to `ecoste-ats-backup` before they can be overwritten (5 unit tests)

**P1.3 Make code safe to change**
- ☑ Explicit extension points in `src/core/hooks.js` (`fillSlot`/`slotHTML`, `onBind`, `decorateView`): `auto-import.js` and `posting.js` no longer patch HTML or wrap views; `report.js` uses `decorateView`
- ☑ `setStage` emits `stage:changing`; `report-events.js` subscribes (no global reassignment)
- ☑ `addNav(item, afterKey)` replaces `NAV.splice` (sidebar order unchanged)
- ☑ **Mutation layer: see §7.9.** Handlers call services; services write only through `repo`. Enforced by `architecture.test.mjs`. **This is the seam Phase 2 swaps for Supabase.**
- ☑ All 22 inline `onclick` attributes (and the `onsubmit`) are gone. Buttons carry `data-act` / `data-a1` / `data-a2`; the actions are registered in `src/app/ui-actions.js` and run by one capture-phase listener. 21 browser checks click each kind of button.
- ☑ Strict mode is on in every `src` file (`scripts/add-strict.mjs` did the rollout; all tests pass).
- ⏸ **Decision: ES modules move to Phase 6**, together with the Vite build and TypeScript. Converting about 60 files to explicit imports now would be a large mechanical rewrite with a real risk of load-order bugs, and its benefits (no undefined or duplicate names, layer rules) are already enforced by ESLint and `architecture.test.mjs`. The conversion becomes cheap later because the cross-file dependencies are now explicit: screens call services, services call `repo`.
- ◐ Recruiters and interviewers now come from `S.settings.team` through `recruiters()` / `interviewers()` (selectors), editable in Settings → Team; the built-in names are only defaults. In Phase 2 this becomes the `profiles` table. Company name and signatory defaults still wait for decision D6.

**P1.4 Tooling**
- ☑ ESLint 9 (`eslint.config.mjs`, `npm run lint`): the config reads every `src` file and gives each file the other files' top-level names as globals, so it catches undefined names and the same name declared in two files. **Prettier deliberately not added yet:** the code is written as dense one-liners and a reformat would rewrite every file and bury the history. Revisit after the ES-module conversion.
- ◐ GitHub Actions CI (`.github/workflows/ci.yml`): install, lint, unit tests, build, all browser tests on source and on `dist`, keeps the built file as an artifact. Written; first run happens on the first push.
- ☑ Pre-commit hook (`.githooks/pre-commit`, enabled by `npm install` through `scripts/setup-hooks.mjs`): lint + unit tests
- ☑ Widened unit tests (70): stage rules, opening-status derivation, every service, store migration, architecture guard. Still open: `nextAction` and the workbook export/import round-trip (needs ExcelJS).

**P1.5 Conventions** (written in `CONTRIBUTING.md`)
- ☑ File naming and folder rules; layer rule `core → data → domain → services → app → features`
- ☑ Generated files are never hand-edited
- ☑ New-feature and new-action checklists
- ☑ Secrets only in `.env`; `.env.example` committed

*Exit criteria:* CI green on every pull request; no global reassignments or HTML patching left; all writes go through the mutation layer; the app behaves identically (smoke test and manual check).

### 7.9 Mutation layer: design and migration checklist

**Problem.** 65 `save()` call sites in 23 files. UI handlers change `S` directly, mixed with DOM, toasts and navigation, so the rules cannot be tested and cannot be redirected to a database.

**Design (built, 2026-10-08).**
- `src/core/repo.js`: the only code that may `insert`, `update`, `remove`, `trim` or change a `root` object (settings, postCfg, monthly targets). Each change calls `save()` and notifies `repoOnChange` listeners with `{op, coll, id, record}`.
- `src/services/*.js`: named use cases (`moveStage`, `addTask`, `log`, ...). DOM-free: no `toast`, `modal`, `render`, `go`. They return what happened.
- Handlers: parse the form, call a service, then show the toast and re-render.
- Layer order: `core → data → domain → services → app → features`. `hooks.js` moved to `core` so services can emit events.
- Rule for reviewers: a pull request that adds `S.<collection>.push/unshift/splice`, `S.x=...`, or `save()` outside `repo`/`store` is rejected. (Enforced by lint in P1.4.)

**Decision D15 (for Phase 2): how the Supabase adapter sync works.**
- *Option A, recommended:* keep `S` as an in-memory cache loaded from Supabase at start. A `repoOnChange` listener sends each change to Supabase in the background (write-behind queue with retry and an error toast). UI code stays synchronous, so no screen changes. Add Supabase Realtime to refresh other users' changes. Weakness: last write wins if two people edit the same record at once; acceptable for a small team, revisit with `updated_at` checks.
- *Option B:* make every service `async` and render from query results. Cleaner for correctness, but every handler changes at once.
- Decide at the start of Phase 2. Both use the same services; only `repo` changes.

**Migration checklist: all areas done (2026-10-08).**

| Area | Sites to migrate (file: what it writes) | Service to create |
|---|---|---|
| Openings | `openings.js`: create/edit opening | `saveOpening`, `setOpeningStatus` |
| Candidates | `add-candidate.js` create; `candidates.js` documents status, request document, notes, message sent; `resume-viewer.js` resume edit | `addCandidate`, `setDocumentStatus`, `requestDocument`, `addCandidateNote`, `recordMessage`, `updateResume` |
| Applications | `applications.js` bulk assign recruiter; `ai-match.js` note | `assignRecruiter`, `addApplicationNote` |
| Screening | `screening-call.js` call outcome, call log | `recordScreening` |
| Interviews | `group-interview.js` schedule, invite status, reminder, cancel, evaluate; `personal-interview.js` schedule, scorecard; `interviews.js` no-show, cancel | `scheduleGroup`, `setInvite`, `cancelGroup`, `evaluateGroup`, `schedulePersonal`, `recordScorecard`, `markNoShow`, `cancelInterview` |
| Offers | `offers.js` save draft, send, response | `saveOffer`, `sendOffer`, `recordOfferResponse` |
| Onboarding | `onboarding.js` joining date, start, checklist item, mark ready | `scheduleJoining`, `startOnboarding`, `setOnboardingItem`, `markEmployeeReady` |
| Posting | `posting.js` post, edit, delete, boards, settings | `savePosting`, `deletePosting`, `saveBoards`, `savePostingSettings` |
| Sheets | `sheets.js` log, import; `auto-import.js` config, log, applied rows | `logSheetEvent`, `importRows`, `saveAutoSyncConfig` |
| Settings | `settings.js` fields, weights, threshold, reset | `updateSetting`, `resetWeights`, `resetDemoData` |
| Pipeline | `pipeline.js` SLA rules | `saveSla` |
| Management report | `report.js` targets, call log, drop risk, backup, dropped; `report-events.js` seed history | `saveTargets`, `logCalls`, `setDropRisk`, `setBackup`, `markDropped` |

Each area was its own commit: writes moved into a service, unit tests added for the rules, browser flow checks added, and the whole suite run on source and `dist`.

**Known exceptions (listed in `architecture.test.mjs`).** (1) `management-report/report-events.js` generates sample history by writing `S` directly; it is demo data and goes away when production starts empty (Phase 2.4). (2) Four lazy defaults create state on first read: `boards()`, `postCfg()`, `asCfg()` and `S.postings`; Phase 2 replaces them with schema defaults. (3) The Google Sheet preview now takes its draft as a parameter (`planImport(tab, cfg)`) instead of swapping `S.autoSync`.

**Found on the way.** The modal autofocus put the cursor in a read-only field (Opening ID); typing within the first 30 ms was lost. Fixed in `app/ui.js`: autofocus now skips read-only and disabled fields. Also removed a duplicate copy of the onboarding-checklist creation in the pipeline drag-and-drop.

### Phase 2: Backend core (the database link)

*Goal:* one shared database; people log in; the app reads and writes Supabase instead of `localStorage`.

**P2.1 Schema and migrations** (M)
- ☑ `supabase/migrations/` with 4 migrations applied to the dev project (2026-10-10): `0001_foundation`, `0002_domain_tables`, `0003_rules_and_audit`, `0004_row_level_security`. 27 tables, 59 policies, row security on every table. Runner: `scripts/db.mjs` (`db:migrate`, `db:status`, `db:reset` for dev only; checksums stop anyone editing an applied file). Full description in `docs/DATABASE.md`.
- ☑ Foreign keys, indexes, check constraints for stages and statuses; triggers for furthest stage, date in stage, `stage_events`, opening status, audit trail, offer approval; append-only history
- ☐ Seed script for development only; production starts empty

**P2.2 Auth and roles** (M)
- ☑ **Login is username + password, set by an admin (decided 2026-10-10; no Google, no email, no sign-up page).** Each username maps to a hidden internal address `<username>@ats.ecoste.in`. The admin creates accounts, resets passwords (which also signs the person out) and switches accounts off or on, through `admin_create_user`, `admin_set_password` and `admin_set_active`. The database refuses any account not made that way. A user can change their own password. The first admin is created from the server: `npm run db:create-admin -- <username>`.
- ☑ **Sign-in screen, account menu and Users screen are in the app** (2026-10-10). While signed out the app is hidden behind the sign-in form; a signed-in person has an account menu (change password, sign out); an admin has a Users page (list, add user with a suggested password shown once, reset password, change role, switch off or on). A pending or switched-off account gets a plain message and no app. 27 browser checks run this against the live project (`npm run test:e2e:auth`). **Two modes:** with Supabase configured the app is *connected* and needs sign-in; with nothing configured it is in *demo mode* (data in this browser, no sign-in), which is what the other tests and CI use. Until the data layer (P2.3) lands, a connected app still shows the browser's own demo data behind the sign-in, so sign-in is not yet protecting real records.
- ☑ RLS policies per §7.2, tested against the real database (`npm run test:db`): 29 access tests (every role, offer approval, tasks, notifications, profiles, settings, triggers, append-only history, account management, last-admin protection) and 11 real sign-in tests over HTTP against Supabase's login service (create, sign in, wrong password, no self sign-up, change own password, admin reset ends the old session, switch off cuts access immediately). Writing them found and fixed two real bugs: guards blocking trusted server changes, and a switched-off interviewer or manager keeping access to their own records (migration 0006).

**P2.3 Data layer** (L)
- ☑ Collision-proof ids (2026-10-16): `uid()` uses `crypto`; `ids.test.mjs` checks the format and 100,000 unique ids
- ☑ **Read path (2026-10-16):** after sign-in the app loads every table the person may read (`src/data/api.js`), maps rows to the app's records (`src/data/mapping.js`) and replaces `S`. Connected mode never saves business data to `localStorage`. Proven by 16 round-trip tests (sample data through every table and back, identical) and 14 live browser checks.
- ☑ **Write path (2026-10-16):** a `repoOnChange` listener turns each change into database calls (`src/data/api.js`). Changes are copied when made and written one at a time in order; a network drop is retried (1, 3, 8, 20 s); a refusal is shown once in plain words and later changes carry on; closing the tab with saves pending asks first; sign-out waits for pending saves. An update or delete that access rules hide (zero rows changed, which the database does not report as an error) is detected and reported. Covers openings, candidates (profile, salary, documents), applications (with screening), group and personal interviews, offers, onboarding, tasks, notifications, activity, postings, report events, call log, monthly targets, job sites, company settings and the Google Sheet connection, and whole-collection workbook imports.
- ☑ People who are not accounts: in connected mode the recruiter, manager and interviewer pickers offer accounts only (`PEOPLE.names(...)`); the demo-only parts of Settings (typed team lists, signed-in picker, demo reset) are hidden; `repo.reset` refuses. The theme stays in this browser.
- ☑ **Notifications reach the right people (2026-10-16):** `notify(text, go, to)` takes the names to tell. The signed-in person's own joins this browser's list; others are sent with `repo.send` and written for their account (a name with no account is skipped). Recipients: the opening's recruiter for a new application, offer sent or accepted, joined, onboarding finished and "selected"; the recruiter and the panel for a group interview; the interviewers for a personal interview; the owner of a task given to someone else. The person who did it is not told about their own actions.
- ☑ **Each role sees only its pages (2026-10-16):** `ROLE_PAGES` / `roleCanSee` / `canSee` / `canEdit` in `services/auth.js`. Management: dashboard, openings, report. Interviewer: interviews, candidates, tasks. Hiring manager: dashboard, openings, applications, candidates, interviews, offers, tasks. Admin and recruiter: everything. The sidebar, global search and quick-add follow it, a page the role may not open sends the person to their first page, and the start page is that first page. Management gets a marked "Candidate (hidden)" placeholder where an application's candidate cannot be read, so no screen meets a missing record. Salary that is not visible is `null` and shows as a dash (`lpa()`).
- ☑ **Migration 0009:** staff (admin and recruiter) may change the working configuration in `company_settings.config` (SLA days, report alert levels, posting setup, Google Sheet connection); company name, address, signatory and match scoring stay admin-only, enforced by a trigger. Found when a recruiter's SLA change was silently refused.
- ☑ **Interviewer scorecards (2026-10-17):** a panel member who is not staff saves their own row in `interview_scores` (the writer redirects an `interviews` update to it); migration 0010's trigger `roll_up` copies the result onto the interview (average score per criterion, latest recommendation, decision and feedback, status Completed when the whole panel has scored). Staff listed on a panel also save their own row. Scheduling, cancel, no-show and group evaluation are hidden from non-staff (`canScore`); after scoring, the recruiter is told instead of the stage moving. Migration 0010 also lets any active member write activity (own `actor_id`) and notifications for others.
- ☑ **Offer approval (2026-10-17):** `requestOfferApproval`, `decideOffer`, `canApprove`, `offerApproval` in `services/offers.js`. The recruiter sends an offer for approval from the editor (the opening's manager is told); the hiring manager or an admin approves or rejects from the Offers table or a read-only offer view (the recruiter is told); a Pending or Rejected offer cannot be sent (service and database both refuse); changing the CTC of an approved offer asks again. For a hiring manager the writer saves only `approval_status`, because the database lets them change nothing else.
- ☑ **Unique names (migration 0011, 2026-10-17):** a unique index on the lower-cased full name (or username when none), with a plain sentence when an admin picks a taken name.
- ☑ **Loading, saving and error states (2026-10-17):** a "Try again" button when the first load fails; a small word in the top bar (Saving…, All saved, Not saved) driven by a `data:pending` event from the writer; the existing error toasts stay.
- ☑ **Other people's changes (2026-10-17):** `refreshFromServer` reads everything quietly every minute and when the tab is opened again; it only replaces the screen's data when nothing is waiting to be saved, no window is open, nobody is typing, and the content really differs (`dataFingerprint`, order-insensitive). Concurrent edits of the same record are still last write wins (realtime push is a later choice).
- ☑ **Lighter loading and lists (2026-10-17):** the loader reads only the newest 300 activity and sheet-log rows; the Applications table and the Candidates list show 100 rows with "Show more" (`pageRows`, `moreRows`, `bindMoreRows`). The data is in memory, so this is about screen weight; server paging would only be needed at tens of thousands of rows.
- ☑ **P2.3 is complete.** What is left of Phase 2 is P2.4 (first-run setup, import of real data, dev seed).
- ☐ Loading and error states in the UI; replace whole-state `save()` with per-record writes
- ☐ Pagination on applications and candidates

**P2.4 Data migration and cutover** (S)
- ◐ One-time import of existing real data through the workbook importer: the importer already writes through the database (`syncCollection`); waits for the real workbook (Settings → Import)
- ☑ First-run setup screen: the first admin of a company with no name is asked for company, address, signatory and title (`src/features/auth/setup.js`, 2026-10-17); connected mode starts with empty company details, no "Northwind"
- ☑ Remove `localStorage` as the source of truth (connected mode keeps only the theme)
- ☑ Dev seed: `ALLOW_DB_SEED=1 npm run db:seed` loads the sample data into an empty development project (refuses when openings or candidates exist; never for production)

*Exit criteria:* two recruiters on two computers see the same data; a user with the wrong role is blocked at the database; tests cover RLS; no business data left in `localStorage`.

**Design notes for the write path (found while building the read path; the first and the theme note are now done).**
- **People are names in the app, ids in the database.** `makePeople` translates through `profiles.full_name` (or the username). A name with no matching account becomes `null` in the database and is lost on the next load. So in connected mode the pickers for recruiter, manager and interviewer must offer only accounts (`PEOPLE.names(role)`), not typed names or the built-in default lists. If two accounts share a full name the first wins; the Users page should refuse duplicate full names.
- **Notifications are per person in the database, shared in the app.** The loader gives each person only their own (the database policy). `notify()` creates one entry for the person who caused it; one row per recipient (the opening's recruiter, the task owner...) is still to do, decided per kind of message. Notification ids are uuids.
- **Salary is `null`, not 0, when hidden or not entered** (hiring managers, interviewers and candidates with no salary row). Screens that show salary should show "—" for `null`; `match()` already treats it as no expectation.
- **Sample report history** (`seedHistory`) must not run when connected (production starts empty, P2.4). Today it only runs on the empty in-memory state before sign-in and is replaced by the load.
- **`management` role** reads applications but not candidates: done, see the placeholder above.
- **Theme** is per browser, not per company: keep it in `localStorage`, not in the database.
- **Opening status** comes back as the database computed it (the same rule as `moveStage`), not as the screen last showed it.

### Phase 3: Files and messaging

*Goal:* real documents and real communication.

- ☑ **Storage buckets (2026-10-17, migration 0012):** private `resumes` (10 MB: pdf, docx, doc, txt, md), `documents` (10 MB: pdf, jpg, png, docx, doc) and `offer-letters` (5 MB: html, pdf). The first folder of a path is the candidate id (résumés, documents) or the application id (letters), and the access rules read it: résumés follow `sees_candidate` (staff, the opening's manager, the panel), documents are staff only, letters are staff and the opening's manager. Management, anonymous and other managers see nothing. Tested in `tests/db/rls.test.mjs` (31 access tests).
- ☑ **Upload and text extraction (decision: in the browser, not an Edge Function):** PDF text is read with pdf.js 3.11.174 (loaded only when a PDF is chosen: `src/app/lazy.js`, `data-lazy` tags in `index.html`, inlined as inert text in the single-file build, 2.0 MB); Word `.docx` is read with a 60-line zip reader and no library (`src/domain/resume-text.js`); `.txt` and `.md` directly. Refusals in plain words: type, 10 MB, empty, old `.doc`, broken file, a scan with no text. The original file is stored (`src/data/files.js`, `uploadFile`, `fileLink`: a signed link valid for 2 minutes, never public) and recorded on the candidate (`resume_path`, `resume_name`). A Resume tab bar opens, replaces or uploads the original (the replaced file is removed). Why not an Edge Function: nothing to deploy or pay for, the file never has to be re-downloaded, and it works the same in the single-file build.
- ☑ **Duplicate detection:** email (any case) or the last 10 digits of the phone; the add-candidate flow shows "Already in your pool" with Open profile or Apply to this opening instead of making a second profile (the database also refuses a repeated email). `findDuplicateCandidate`, `applyCandidate`.
- ☑ **Document checklist with real files:** each item can hold a file (`candidate_documents.storage_path`, `file_name`); uploading marks a Pending item Received; staff can Open and Replace; the status selector (Pending, Received, Verified) stays the verification step.
- ☑ **Messages are recorded and handed to the person's own tools (2026-10-17):** the composer (Email, WhatsApp) fills a template, then "Open in email app" (`mailto:`) or "Open in WhatsApp" (`wa.me`) with the message ready; the person presses send there. Every message is kept in `messages` (who, channel, template, subject, body, status Sent or Composed, time) and listed on a Messages tab of the candidate (staff only). `src/domain/messaging.js`: `mailtoLink`, `whatsappNumber`, `whatsappLink`. Why: nothing leaves the building from our server without an account and a key, and a recruiter's own mailbox is also where candidates reply.
- ☑ **Calendar invites:** an interview's detail has "Calendar (.ics)", a standards file (`interviewIcs`: start, end from the length, location or link, candidate as attendee, a 30-minute reminder) that Google Calendar, Outlook and Apple Calendar import; available to interviewers too.
- ☑ **The offer letter as sent is kept:** when an offer is sent, its letter is stored as HTML in `offer-letters/<application id>/` and linked from the offers table ("Sent letter"); opened from a blob, because the storage service shows HTML as plain text. Printing to PDF stays with the browser.
- ☐ **Waiting for the company (Decision D5, needs accounts and keys, cannot be built or tested without them):** (a) email sent by our server through Resend or Postmark, with delivery status written to `messages` (an Edge Function and its API key); (b) Google Calendar invites created through Google's API with the recruiter as organiser; (c) the WhatsApp Business API. The tables and screens are ready for (a): a `Queued` status already exists in `messages`.
- ☐ A true PDF file of the offer letter (today: the HTML copy plus the browser's Save as PDF). Needs a PDF library or a rendering service: small decision.

*Exit criteria:* a resume uploaded in the browser is stored, parsed and visible to the right people; an interview invite reaches the candidate's calendar; every outgoing message is traceable.

### Phase 4: Intake and integrations

*Goal:* applications arrive without manual copying.

- ☑ **Public intake without an Edge Function (2026-10-19, migrations 0013 and 0014):** a database function `submit_application` is the one door. It is callable by anyone, runs with the owner's rights, and does all the checking itself: the opening must be open, name, email and phone must be valid, the consent box must be ticked, a hidden field must be empty (a robot is told it worked and nothing is created), at most 5 tries an hour per email and 200 per 10 minutes overall. It creates the candidate (source "Careers Page", consent time and wording recorded) with salary kept apart, the default checklist and a New application for the opening's recruiter, writes the activity entry, notifies the recruiter and logs the try (accepted or refused) in `intake_batches`. An email already in the pool gets only a new application: the existing profile is never rewritten. Why this and not an Edge Function: no deployment access or cost, the rules live next to the data, and it is tested with the rest of the database tests.
- ☑ **Public careers page:** `careers.html` (built into one file, `dist/careers.html`, hostable anywhere). Reads the view `careers_openings` (open roles only; no salary, budget, manager or recruiter), with search and filters, a role detail, deep links (`careers.html#OP-1001`), and an application form with consent, résumé upload (PDF, Word, text; 5 MB) and a hidden trap field. Light and dark, works on a phone.
- ☑ **Résumé upload by the public:** anonymous people may add one file under `resumes/intake/<random id>/` and nothing else (cannot read, list, replace or delete). Staff see it on the candidate; "Read the file" in the Resume tab extracts its text in the browser and fills only what the applicant left empty (`applyResumeText`).
- ☑ **Intake log and error screen:** Settings → Careers page lists the latest tries: added, applied before, or refused with the reason. The profile shows when consent was given.
- ☑ **Google Form and Sheets stay as they are** (the Apps Script setup and the Sheet importer still work and write through the same data layer). The careers page replaces them as the main way in; they can be retired when the company chooses.
- ☐ Job-board links and posting status where APIs exist (needs board accounts)
- ☐ Abandoned uploads: files uploaded but never submitted stay in `intake/`; Supabase forbids deleting storage rows with SQL, so the clean-up needs the Storage API from a server job (still open)
- ☐ Where the careers page is published (company website or any static host): needs the company's choice. Until it is hosted, test it by opening `dist/careers.html`.

*Exit criteria:* a candidate applies on the careers page or the form and appears in New within a minute, with consent recorded.

### Phase 5: Automation and insight

*Goal:* the system nudges people instead of waiting to be looked at.

- ☑ **Daily nudges inside the database (2026-10-19, migration 0015):** `app.run_nudges()` runs every morning at 09:00 India time through pg_cron (if the extension is unavailable it can be called from any scheduler). It notifies the recruiter once per stay when a candidate is past the SLA (company SLA settings, same defaults as the app), reminds the panel and the recruiter the day before an interview, and flags interviews whose date passed with no outcome. `app.nudge_log` makes each nudge once-only. Only the database owner can run it. 4 tests in `tests/db/nudges.test.mjs` (63 database tests in all).
- ☐ Daily digest email and reminders to candidates (need the email account, Decision D5)
- ☐ Dashboard and management report backed by SQL views; export to PDF and Excel
- ☐ Match scoring moved to the shared domain package and stored with reasons; relabel "AI" honestly
- ☐ Optional: model-assisted summaries or scoring behind a setting, human decision required, rejection reason always recorded
- ☐ Audit log screen for admins

*Exit criteria:* SLA alerts arrive without anyone opening the app; management report numbers match the database.

### Phase 6: Frontend modernisation (decision gate after Phase 2)

*Goal:* fix the structural limits of the UI (no URLs, whole-page re-render).

- ☐ **Gate decision (D8):** stay on vanilla JS with modules and a small router, or move to React. Decide using real pain after Phase 2, not before.
- ☐ Vite build replaces `build-single.mjs` and the hand-ordered manifest
- ☐ Real router: URLs, deep links, back button, "share this candidate"
- ☐ TypeScript types generated from the database schema
- ☐ Targeted re-rendering or components; virtualised long lists
- ☐ If React: migrate one feature at a time behind the same data layer, smoke test after each

*Exit criteria:* every page has a URL; refresh keeps you where you are; no page loses focus or scroll on edit.

### Phase 7: Hardening and launch

- ☐ Create `staging` and `prod` Supabase projects; separate keys; secrets in CI and host, never in the repo
- ☐ Hosting: static frontend (Vercel, Netlify, Cloudflare Pages) on `ats.ecoste.in` with HTTPS and security headers
- ☐ Deploy flow: PR → CI → preview URL → merge to `main` → auto-deploy to staging → manual promote to prod
- ☐ Rollback rehearsed (redeploy previous tag; migration rollback notes)
- ☐ Backups with a tested restore; point-in-time recovery turned on
- ☐ Error monitoring, uptime check, log retention
- ☐ Self-host fonts and ExcelJS; CSP without public CDNs
- ☐ Security review (RLS audit, key handling, dependency scan) and DPDP review (consent, retention, deletion, access requests)
- ☐ Accessibility pass; load test with realistic volume
- ☐ User acceptance test with the recruiting team; training notes; go-live and cutover checklist

*Exit criteria:* a written go-live checklist signed off by the owner; a restore has been rehearsed; the team has used staging for real work for at least a week.

### Phase 8: Post-launch

- ☐ Two-week stabilisation window: bug triage daily
- ☐ Collect feedback; prioritise v2 (candidate portal, HRMS sync, richer analytics, multi-user approvals)
- ☐ Quarterly: dependency updates, access review, backup restore drill

### 7.8 Immediate next steps (in order)

1. ☐ Rotate the Supabase database password and `service_role` key (they were shared in chat)
2. ☐ Protect `main` on GitHub
3. ☑ Finish P1.2 (`save()` errors, storage-key migration)
4. ☑ P1.3 done except company defaults (waits on D6) and ES modules (moved to Phase 6)
5. ◐ P1.4 lint and CI: written, waiting for the first CI run
6. ☐ Open a pull request for `chore/restructure-p1`; merge; start Phase 2 on a new branch

## 8. Open decisions (need an owner)

| # | Question | Default if no answer | Needed by |
|---|---|---|---|
| D1 | Database platform: **decided, Supabase** (region Seoul; moving to Mumbai would need a new project) | done | n/a |
| D2 | Repo location: **decided, github.com/pankaj-ecoste/ats** | done | n/a |
| ~~D3~~ | ~~Sign-in method~~ — **decided: username + password created by an admin; the admin can reset passwords** | done | n/a |
| D4 | Is Google Sheet staying as intake only, or still a system of record? | Intake/export only | P4 |
| D5 | Which channels must really send: email, calendar, WhatsApp? | Email + calendar | P3 |
| D6 | Real company name/address/signatory to replace "Northwind Technologies" defaults? | Ask HR | P2.4 |
| D7 | Is the current "AI" wording acceptable internally, or relabel as "rule-based"? | Relabel until a model is connected | P5 |
| D8 | Stay on vanilla JS with modules, or move to React? | Decide after Phase 2 | P6 gate |
| D9 | Does an offer need approval by a hiring manager before sending? | Yes | P3 |
| D10 | Which roles may see salary and offer data? | admin, recruiter, approving hiring manager | P2.2 |
| D11 | Email provider (Resend, Postmark, or Google Workspace SMTP)? | Resend | P3 |
| D12 | Data retention: how long are rejected candidates kept? | 12 months, then anonymise (confirm with legal) | P7 |
| D13 | Who is the product owner who signs off each phase? | Head of Talent Acquisition | all |
| D16 | Role scoping as built: management sees no candidate names, contact details, salary or offers; interviewers see only their own interviews; hiring managers only their own openings. Right for you? | As built (see `docs/DATABASE.md`) | P2.2 |
| D17 | Data-deletion requests: `audit_log` keeps copies of changed personal data. Delete or anonymise those rows when a candidate asks to be erased? | Yes, through one logged admin function | P7 |
| D14 | Staging and prod Supabase projects: same region as dev (Seoul) or Mumbai? | Mumbai for prod if data-residency matters | P7 |
| D15 | Supabase sync style: cache + background write queue (A) or async everywhere (B)? | A (see §7.9) | start of P2 |

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
|---|---|---|---|
| 2026-10-06 | Branch `chore/restructure-p1`: git, SSH key and host alias, `.env` and `.env.example`, Supabase project linked in `.env`, single `STAGES`, `today()` and `now()`; tests, build and smoke test green; plan.md expanded with file inventory | Claude Code |
| 2026-10-16 | **Notifications for other people, role-aware screens, staff settings:** `notify(..., to)` and `repo.send`; `ROLE_PAGES` with sidebar, search, quick-add and start page following the role; hidden-candidate placeholder for management; migration 0009 (staff change `config`, admins keep company details; trigger guard); 7 new notification and 7 role unit tests (126 total); live checks grew to 29 data (management, interviewer and hiring-manager sign-ins, their pages, no salary, no candidates for management) and 29 write checks (delivery of notifications, recipient rules, recruiter SLA change allowed and signatory change refused) | Claude Code |
| 2026-10-16 | **Write path:** the writer in `src/data/api.js` (ordered queue, snapshot of each change, retries, one plain error per run of failures, detection of changes that access rules silently drop), settings parts that only suit the demo hidden when connected, accounts-only pickers, `repo.reset` refused when connected, new openings get collision-proof ids (the last counter id), notification ids are uuids, theme kept in the browser. 12 writer unit tests (114 total) and 23 live write checks. **Found and fixed by the tests:** (1) updates hidden by access rules changed zero rows and looked like success; (2) three quick stage moves were written as three copies of the last stage, losing history, until each change was copied when made; (3) test cleanup left audit rows behind | Claude Code |
| 2026-10-16 | **Read path:** `src/data/mapping.js` (rows to records and back, people by name), `src/data/api.js` (paged loader), sign-in now loads the data and shows "Loading your data…", connected mode no longer writes to `localStorage`, temporary red notice that changes are not saved yet. 16 round-trip tests and 14 live browser checks. **Found and fixed:** (1) `match()` produced `NaN` for a candidate with no salary, which crashed the Pipeline page; (2) interview status `Pending Feedback` was stored by the sample data and the Excel dropdown but the database (rightly) refuses it, because the app derives it from a past Scheduled interview, so it is now saved as `Scheduled`; (3) the sample data had openings whose status disagreed with the stage rule, the database fixed them; (4) `link` and `notes` mean different column types in different tables (test helper) | Claude Code |
| 2026-10-16 | **P2.3 started:** collision-proof ids (`uid()` on `crypto`, 8 characters), applied to candidates, applications and notifications; 2 new unit tests (95 total), browser tests green | Claude Code |
| 2026-10-10 | **App-side login:** sign-in screen, account menu, change password, Users page; demo vs connected mode; Supabase library vendored; build refuses to output a service key or a database URL; migrations 0007 (create a login in one step) and 0008 (switched-off accounts get a clean refusal; 'infinity' made Supabase return a server error); 14 unit tests + 27 live browser checks | Claude Code |
| 2026-10-10 | **Username login:** migrations 0005 (username accounts, admin functions, last-admin guard, no self sign-up) and 0006 (switched-off accounts see nothing); `db:create-admin`; 11 real sign-in tests; `docs/SECURITY_CHECKLIST.md`; D3 decided (no Google) | Claude Code |
| 2026-10-10 | **Phase 2.1 and the database half of 2.2:** 4 migrations applied to the dev Supabase project (27 tables, 59 policies, triggers for stage history, opening status, audit trail and offer approval); `scripts/db.mjs`; 22 access tests on the real database; `docs/DATABASE.md`; decisions D16, D17 | Claude Code |
| 2026-10-10 | Inline `onclick` removed (`data-act` + `ui-actions.js`); recruiter and interviewer lists moved into settings (`recruiters()`, `interviewers()`, Settings → Team); `hooks.test.mjs`; 20 new browser checks | Claude Code |
| 2026-10-10 | Tooling: ESLint with auto-derived cross-file globals (clean), CI workflow, pre-commit hook, PR template, `CONTRIBUTING.md`, new scripts `lint`, `check`, `test:e2e:all`, `test:e2e:dist` | Claude Code |
| 2026-10-08 | Mutation layer finished: every write now goes through `repo` via 13 service files (openings, candidates, applications, screening and interviews, offers, onboarding, posting, settings, report, sheets); `domain/sheet-values.js`; autofocus fix in `ui.js`; 70 unit tests, 47 browser flow checks, architecture guard test | Claude Code |
| 2026-10-08 | Mutation layer started: `core/repo.js`, `services/` (activity, tasks, stages), `hooks.js` moved to `core/`; handlers for notifications and tasks and `setStage` now go through services; 11 new unit tests, 5 new browser checks; design and per-area checklist in §7.9; decision D15 added | Claude Code |
| 2026-10-06 | P1.2 finished (storage key migration, save errors) and extension points added (`hooks.js`): no more HTML patching, `setStage` reassignment or `NAV.splice`; 5 new unit tests, new `hooks.mjs` browser test | Claude Code |
| 2026-10-06 | Whole-app plan written: scope, roles, module map, data model, target architecture, 8 phases with exit criteria, new decisions D9-D14 | Claude Code |
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
