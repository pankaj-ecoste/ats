# Changelog

Format: newest first. **Version 1** is the system handed to the HR team. **Everything after the `v1.0.0` tag is version 2**: it goes under "Version 2" below and in `.claude/plan.md` §10 (marked v2).

## Version 2 (after v1.0.0, unreleased)

Candidates are listed in `.claude/plan.md` §12 (a separate staging database comes first).

**Calling queue (2026-11-06)**
- A new **Calling** page for admins and recruiters: one lead at a time, a big tap-to-call link and a WhatsApp link, the facts needed for the call, a note box, seven big status buttons (keys 1 to 7) with *More* for the rest. One tap logs the call and shows the next lead. *To call* (never called, oldest application first) and *Call again* (busy, not connected, call back, follow-up), only my leads by default, filter by opening, and a called-today count.
- Undo that writes nothing: the status is held for 5 seconds and recorded afterwards, because calls are a permanent record. A connected call asks what next (screen now, shortlist, next lead). Works on a phone.

**Speed and smoothness (2026-11-06)**
- Faster start: the data download begins as soon as a session exists, in parallel with the profile lookup and the change check; the connection to the database is opened while the scripts download; hashed scripts are kept by the browser for a year; the first paint is a loading screen and then an app-shaped skeleton instead of a blank frame. Measured live over a 150 ms connection: sign in to a ready app 1.41 s to about 0.9 s, reload while signed in 1.32 s to 0.5 s (`npm run test:e2e:startup`).
- The top bar's save word now has four states (All saved, Saving…, Offline with the number of waiting changes, Not saved), explains itself on hover, does not flicker for quick saves and follows the browser going offline and online.
- Fixed two colour names in the sign-in card and the save word that did not exist in the theme.

## Version 1.0.0 — 2026-11-06

The whole hiring case in one shared system. Built from the intern's browser-only prototype in 8 phases (see `.claude/plan.md` §4 and §10 for the detail of each step).

**What it does**
- Openings, ad request to marketing with a brief and results (leads, cost per lead and per hire), a public careers page with a form each opening can customise.
- Leads from Google Sheet tabs (live script with a secret token), from CSV/Excel, from the careers page; duplicates found by phone and e-mail; each tab linked to an opening with its own columns and screening questions.
- Applications with *Call status via app* (every call logged with who and when), the pipeline control centre with SLA rules, screening calls, group and personal interviews with scorecards, offers with hiring-manager approval and a kept copy of the sent letter, onboarding checklists.
- Management: a recruiter-wise call report (daily, weekly, monthly), the management report with ads and cost.
- Accounts by username and password, five roles plus pending, access rules enforced by the database on every table, an audit log.
- Daily reminders (stuck candidates, tomorrow's interviews, missing feedback), résumé reading from PDF and Word in the browser, optional draft summaries by Claude.

**Hardening and scale (the last step of version 1, migration 0037)**
- Security: the deployed site has no inline script (`script-src 'self'`) and may talk to our database project only; offer-letter text is cleaned and stored letters open locked; summary calls are limited per person; CI workflows have least rights; Dependabot and an audit step in CI. Full review: `docs/SECURITY_REVIEW.md`.
- Scale: one small "has anything changed?" question a minute instead of a full download; indexed lookups (20,000 leads: Applications 12.3 s → 0.19 s, Pipeline 9.7 s → 0.37 s, Reports 4.4 s → 0.21 s); the long lists show 100 rows at a time; pages of a big table are read together; nightly clean-up of old logs; missing database indexes. Measurements and limits: `docs/SCALING.md`.
- Handover: `docs/HANDOVER.md` (running it), `docs/SECURITY_REVIEW.md`, `docs/SCALING.md`.

**Tests at the tag:** 259 unit tests; browser tests in demo mode and against the live project; 108 database tests; policy test `test:e2e:csp` (17 checks); scale test `test:e2e:scale`.

**Known test debt at the tag:** five older live tests were already failing and are listed in plan §12.

**Known open items** (all in `docs/SECURITY_REVIEW.md` §3 and `docs/SECURITY_CHECKLIST.md`): the owner's dashboard steps, CAPTCHA on the careers form, a separate staging project, data-deletion requests (D17), server-sent e-mail (D5).
