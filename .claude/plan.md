# Ecoste Recruit Tracker — Project Plan & Log

Single source of truth for **what exists, what was done, what is pending, and how changes are made**.
Lives at `.claude/plan.md`. Update this file in the same change as the work it describes (see §9).

- **Last updated:** 2026-10-06
- **Current phase:** Phase 1 (Foundations) in progress: P1.1 (git), P1.2 and the extension-point and mutation-layer parts of P1.3 are done. Tooling (lint, CI, hook, conventions) is written. Left in Phase 1: protect `main`, see CI green once, inline onclick, ES modules, strict mode, constants out of code. Then Phase 2 (backend core).
- **Branch:** `chore/restructure-p1` (off `main`, baseline tag `v0.1.0-prototype`)
- **Status of the app:** working browser-only prototype. Not production-ready (see §6).

---

## 1. What this is

An ATS (applicant tracking system) for Ecoste's recruiting team. It was built by an intern from the department's requirements as one HTML file, then split into a maintainable project. The intern captured the team's workflow well. The work now is to turn it into a real, shared, deployed system.

Covers: openings, job posting, applications + AI-style match scoring, candidates + resume parsing, screening calls, group and personal interviews, offers (CTC breakup, letters), onboarding checklists, tasks, pipeline control (SLA), management report, Excel import/export, Google Sheet auto-import, Google Form generator, rule-based assistant, settings.

## 2. Current state (verified 2026-10-06)

| Check | Result |
|---|---|
| `npm test` (node:test, no deps) | 78/78 pass |
| `npm run build` | OK. `dist/Ecoste_Recruit_Tracker.html`, 12 stylesheets + 43 scripts inlined, 381 kB |
| Browser tests (`test:e2e`, `test:e2e:hooks`, `test:e2e:flows`) | Pass on source and on `dist`: 14 pages, 13 hook checks, 67 flow checks (run with installed Chrome via `CHROME_PATH`) |
| Git repository | Pushed to `github.com/pankaj-ecoste/ats`: `main` baseline, branch `chore/restructure-p1`, tag `v0.1.0-prototype` |
| Linter / CI / hooks | ESLint clean; CI workflow written (first run on next push); pre-commit hook on. No formatter (see P1.4) |
| Database / backend | Supabase project exists but is **empty and not connected**; the app still uses browser `localStorage` |
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
| `tests/e2e/flows.mjs` | Playwright: 47 checks that user actions reach the data (openings, candidates, interviews, offers to employee-ready, posting, settings, report, Google Sheet auto-import with the connector stubbed) |
| `tests/unit/services.test.mjs`, `services-people`, `services-interviews`, `services-offers`, `services-settings`, `services-report`, `services-sheets` | Unit tests for every service: stage rules, opening-status derivation, interviews, offers, onboarding, posting, settings, report events, sheet import |
| `tests/unit/hooks.test.mjs` | Actions, slots, bind hooks, events, nav, decorators |
| `tests/unit/architecture.test.mjs` | Fails if app/feature code writes `S` or calls `save()`, or if a service touches the UI |
| `tests/unit/store.test.mjs` | Storage key migration, backup of unknown versions, failed-save reporting |

**Not in the tree yet (planned):** `supabase/migrations/`, `CHANGELOG.md`.

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

### 7.5 Target architecture

```
Browser app (today's vanilla JS, then modules, optionally React later)
   │  supabase-js (anon key + user session)
   ▼
Supabase: Auth (Google SSO)  ·  Postgres + RLS  ·  Storage (resumes, letters)
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
- ☐ `supabase/` folder and CLI set up; migrations for every table in §7.4, in dependency order
- ☐ Foreign keys, indexes, enums for stages and statuses; trigger for opening status; `stage_events` filled by trigger
- ☐ Seed script for development only; production starts empty

**P2.2 Auth and roles** (M)
- ☐ Google Workspace sign-in for `@ecoste.in`; `profiles` row created on first login
- ☐ Admin screen to invite users and set roles
- ☐ RLS policies per §7.2, with SQL tests for every role

**P2.3 Data layer** (L)
- ☐ `src/data/api.js` implementing the mutation layer against Supabase; in-memory adapter kept for tests and demo
- ☐ Read paths first (lists, detail), then writes one feature at a time: openings → candidates → applications → interviews → offers → onboarding → tasks
- ☐ Loading and error states in the UI; replace whole-state `save()` with per-record writes
- ☐ Pagination on applications and candidates

**P2.4 Data migration and cutover** (S)
- ☐ One-time import of existing real data through the workbook importer
- ☐ First-run setup screen (company, signatory) replaces demo defaults
- ☐ Remove `localStorage` as the source of truth

*Exit criteria:* two recruiters on two computers see the same data; a user with the wrong role is blocked at the database; tests cover RLS; no business data left in `localStorage`.

### Phase 3: Files and messaging

*Goal:* real documents and real communication.

- ☐ Storage buckets (private) with access policies: `resumes`, `documents`, `offer-letters`
- ☐ PDF/DOCX upload; Edge Function extracts text and feeds the existing parser; duplicate detection on email and phone
- ☐ Document checklist with real files and verification status
- ☐ Email through a provider (Resend or Postmark): templates for invite, rejection, offer; every send recorded in `messages` with delivery status
- ☐ Google Calendar invites for interviews (organiser = recruiter), reschedule and cancel
- ☐ Offer letter saved as PDF; offer approval step
- ☐ WhatsApp only if Decision D5 asks for it

*Exit criteria:* a resume uploaded in the browser is stored, parsed and visible to the right people; an interview invite reaches the candidate's calendar; every outgoing message is traceable.

### Phase 4: Intake and integrations

*Goal:* applications arrive without manual copying.

- ☐ Public Edge Function receives application-form posts (consent checkbox, spam protection, file upload); creates candidate and application; replaces `window.claude` auto-import
- ☐ Google Form script updated to post to that function; Sheets become export and optional one-way intake
- ☐ Public careers page listing open openings (static page reading a public view)
- ☐ Job-board links and posting status where APIs exist
- ☐ Intake log and error screen for rejected submissions

*Exit criteria:* a candidate applies on the careers page or the form and appears in New within a minute, with consent recorded.

### Phase 5: Automation and insight

*Goal:* the system nudges people instead of waiting to be looked at.

- ☐ Scheduled job computes SLA breaches and writes notifications; daily digest email to recruiters
- ☐ Interview reminders to candidates and panel; feedback-overdue reminders
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
| D3 | Sign-in method: Google Workspace SSO for `@ecoste.in`? | Yes | P2.2 |
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
