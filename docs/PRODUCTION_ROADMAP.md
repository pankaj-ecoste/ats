# From prototype to production

What the prototype does not have, in the order it matters. Every item below was found in the code, not assumed.

## Blockers: it cannot be used for real hiring until these are done

| Gap | What the code does today | What production needs |
|---|---|---|
| Data lives in one browser | All state is one JSON blob in `localStorage`. Two recruiters see two different databases; clearing the browser deletes everything. | A server database with one shared source of truth, backups and migrations. |
| Silent data loss | `load()` returns the demo dataset whenever the stored version is not `3`. `save()` swallows every error, including a full storage quota. | Versioned migrations; failed writes surfaced to the user. |
| No users | No login. The "current user" is a text field in Settings. Recruiters and interviewers are hard-coded arrays in `core/constants.js`. | Authentication (Google Workspace sign-in is the natural fit), user records, and roles: admin, recruiter, interviewer, hiring manager, read-only management. |
| Candidate personal data | Names, phones, emails, current and expected salary and offer letters sit unencrypted in browser storage with no access control or audit trail. The activity log is capped at 300 entries. | Server-side access control, an append-only audit log, retention and deletion rules, and a consent notice on the application form. India's DPDP Act applies to this data; get it reviewed. |
| Nothing is actually sent | "Send" in the message composer writes to the activity log and shows a "sent" toast. No email, WhatsApp or calendar invite leaves the app. | Real email delivery, calendar invites for interviews, and a WhatsApp provider if that channel is wanted. |
| No file storage | Resume upload accepts `.txt` and `.md` only. Candidate "documents" are names with a status, not files. | Resume and document upload (PDF, DOCX) to object storage, with text extraction. |
| Integrations tied to claude.ai | Google Sheet auto-import runs through `window.claude.use('mcp')` and does nothing outside claude.ai. | A server-side Google Sheets/Forms integration (service account or OAuth), or form submissions posted straight to your API. |
| Demo content is the default | A fresh browser starts with invented candidates and the company "Northwind Technologies Pvt. Ltd.". | Empty start with a first-run setup; seed data only in development. |

## Decide before building

1. **What "AI" means here.** Match scores come from fixed keyword and weight rules (`domain/match.js`), the resume parser is regular expressions, and the AI Assistant answers from a set of hard-coded patterns. Either relabel these honestly or connect a real model on the server. If a model scores candidates, keep a human decision in the loop and record why each candidate was rejected.
2. **Google Sheets: system of record or export?** Today the workbook can be both imported and exported. With a real database, make it export and one-way intake only, otherwise two sources of truth will drift.
3. **Stack.** See the recommendation below.

## Recommended target

For an internal tool used by a small recruiting team, the least risky path:

- **Frontend:** TypeScript + React + Vite, with a real router so pages have URLs.
- **Backend and data:** PostgreSQL with row-level security, plus auth and file storage. A hosted platform such as Supabase covers all three; a small Node API in front of Postgres is the alternative if you need to self-host.
- **Jobs:** a scheduled worker for sheet intake, reminders and SLA alerts.

```
apps/
  web/                    React app
    src/features/<name>/    same feature folders as today: components, hooks, api, tests
    src/shared/             ui kit, utils, design tokens (src/styles/tokens.css moves here as is)
  api/                    routes, auth, validation, services
  worker/                 sheet intake, email, reminders
packages/
  domain/                 match, resume parsing, salary, stage rules: pure TypeScript, shared by web and api
  schema/                 database migrations and shared types
integrations/             Google Form script, email templates
```

The feature folders in this repository were named so each one maps directly onto `apps/web/src/features/<name>`, and `src/domain` onto `packages/domain`.

## Phases

**Phase 0: structure (done).** One file split into this project, behaviour verified unchanged, unit tests and a smoke test in place, single-file build kept.

**Phase 1: make the existing code safe to change.** No new features.
- Convert classic scripts to ES modules with explicit imports and exports; replace the 22 inline `onclick="..."` attributes with bound handlers so nothing depends on globals.
- Replace view wrapping and HTML `String.replace` hooks with explicit extension points (a view declares slots; features register into them). Replace the `setStage` reassignment with an event emitted from one place.
- Turn strict mode on everywhere; remove the duplicate `STAGES`; compute "today" when it is used.
- Put every mutation behind functions in one place (`createOpening`, `moveStage`, `recordInterviewFeedback`, ...) so the storage behind them can be swapped.
- Add TypeScript types for the entities in `S`, linting, formatting and CI.
- Widen tests around `domain/` and the stage rules. This is the logic that must survive the rewrite.

**Phase 2: backend.** Schema and migrations for the entities in `S`; authentication and roles; swap the mutation layer from `localStorage` to the API; import existing data once through the workbook importer; file storage for resumes and documents.

**Phase 3: real integrations.** Email and calendar invites; application form posting to the API; job-board posting where APIs exist; optional model-backed matching.

**Phase 4: frontend rewrite, feature by feature.** Move each feature to React components behind the same API. Because the mutation layer and domain package are already separate, screens can move one at a time.

**Phase 5: operations.** Environments (dev, staging, production), error monitoring, backups with a tested restore, audit log review, accessibility pass, load and security testing, self-hosted fonts and libraries instead of public CDNs.

## Smaller things worth a ticket

- Rendering builds HTML strings and assigns `innerHTML`. Escaping is applied consistently today, but every new interpolation is a possible injection point; values that reach inline `onclick` attributes need particular care. Phase 1 and 4 remove this class of bug.
- Whole-page re-render on every change loses focus and scroll position in places and will not scale to thousands of applications; lists need pagination.
- No URLs, so no deep links, no back button, no "share this candidate".
- `spectra-ats-v3` is a leftover name from an earlier version of the storage key.
