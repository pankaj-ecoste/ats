# Changelog

Format: newest first. **Version 1** is the system handed to the HR team. **Everything after the `v1.0.0` tag is version 2**: it goes under "Version 2" below and in `.claude/plan.md` §10 (marked v2).

## Version 2 (after v1.0.0, unreleased)

Nothing yet. Candidates are listed in `.claude/plan.md` §12 (a separate staging database comes first).

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

**Known open items** (all in `docs/SECURITY_REVIEW.md` §3 and `docs/SECURITY_CHECKLIST.md`): the owner's dashboard steps, CAPTCHA on the careers form, a separate staging project, data-deletion requests (D17), server-sent e-mail (D5).
