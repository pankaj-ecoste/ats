# Database

The data lives in a Supabase project (PostgreSQL 17). The schema is defined only by the numbered files in `supabase/migrations/`. The app does not use it yet (Phase 2.3); today's app still keeps its data in the browser.

## Commands

```bash
npm run db:status      # which migrations are applied or pending
npm run db:migrate     # apply pending migrations, each in its own transaction
npm run test:db        # access-rule tests (rolled back) and real sign-in tests against the live project
npm run db:create-admin -- priya   # create the first admin, or a new one after a lockout
ALLOW_DB_RESET=1 npm run db:reset -- --yes   # DEV ONLY: drop and rebuild. Never against real data.
```

Needs `DATABASE_URL` in `.env` (the Supabase pooler string). `DATABASE_URL`, the service-role key and the password are server-side secrets and never go in the browser app or in git.

## Changing the schema

1. Add a new file `supabase/migrations/NNNN_short_name.sql` with the next number. Never edit a file that has been applied: its checksum is stored and `db:migrate` refuses to run if it changed.
2. Every new table: enable row level security in the same file, add policies, and grant to `authenticated`. A table without policies is invisible to everyone, which is the safe default.
3. Add a case to `tests/db/rls.test.mjs` for who can and cannot see the new table.
4. `npm run db:migrate`, then `npm run test:db`.

## Roles

| Role | Can do |
|---|---|
| `admin` | Everything. Only admins read the audit log, delete people's data, change roles, edit company settings. |
| `recruiter` | Day-to-day: create and edit openings, candidates, applications, interviews, offers, tasks. Sees salary. Cannot approve their own offers. |
| `hiring_manager` | Sees only the openings they manage, and the applications, candidates, interviews and offers on them. Approves or rejects those offers (and can change nothing else on an offer). No salary. |
| `interviewer` | Sees only the interviews they are on, and the application, candidate and opening of those. Writes their own scorecard. No offers, no salary. |
| `management` | Read-only: openings, applications, stage history, postings and the report tables. No candidate details, no salary, no offers. |
| `pending` | A new sign-up waiting for an admin. Sees nothing but their own profile. |

A switched-off account sees and changes nothing, even with a token it already holds (a restrictive policy on every table, migration 0006). Someone not signed in (`anon`) can read nothing at all; the public application form will go through a server function using the service key.

Guards that restrict a user (profile changes, offer approval, task edits) apply to signed-in app users only. A change from the server or the database console is trusted, which is how an admin recovers if they lock themselves out.

## Signing in

People sign in with a **username and a password** that an admin sets. There is no sign-up page, no email and no Google. Supabase Auth identifies users by an email field, so each username maps to a hidden internal address `<username>@ats.ecoste.in` (nothing is ever sent to it; the app adds the suffix). Usernames are 3 to 30 characters: lowercase letters, digits, dot, dash, underscore. Passwords need at least 8 characters.

| Who | Can do | How |
|---|---|---|
| Server (you, once) | Create the first admin, or a new one after a lockout | `npm run db:create-admin -- <username>` (prints a generated password once) |
| Admin | Create an account with a role | `rpc admin_create_user(username, password, full name, role)` |
| Admin | Reset someone's password; this also signs them out everywhere | `rpc admin_set_password(user id, new password)` |
| Admin | Switch an account off or on (off = cannot sign in, sees nothing, signed out) | `rpc admin_set_active(user id, true/false)` |
| Admin | Change a role | update `profiles.role` |
| Anyone signed in | Change their own password | Supabase Auth `updateUser({ password })` |

The database refuses every account that was not made through these functions, so the public sign-up endpoint cannot be used even if it is left on. There must always be at least one active admin. An admin cannot switch off their own account. The very first account is always an admin, whatever role was asked for. A switched-off account is banned for 100 years (Supabase's login service cannot read the date `infinity` and answers with a server error), so sign-in answers "This account is switched off".

**One limit to know:** a password reset or a switch-off ends the person's sessions and stops new sign-ins at once, and a switched-off account is blind straight away because every table checks the account is active. A *password reset alone* does not cancel an access token already issued; it expires on its own (one hour by default, a Supabase setting; see `docs/SECURITY_CHECKLIST.md`). To cut someone off immediately, switch the account off.

## Tables

| Group | Tables |
|---|---|
| People and settings | `profiles` (one per login), `company_settings` (one row; also holds SLA days, report alert levels, posting config and the Google Sheet connection in `config`) |
| Hiring | `openings`, `candidates`, `candidate_compensation` (salary, kept apart so it can be hidden), `candidate_documents`, `applications`, `screenings` |
| Interviews | `interview_groups`, `interviews`, `interview_scores` (one scorecard per interviewer) |
| Offers and joining | `offers`, `onboarding_checklists`, `onboarding_items` |
| Work and messages | `tasks`, `notifications` (private to each user), `messages` |
| History | `stage_events` (every stage change, append only), `activity` (the readable feed), `audit_log` (who changed what, append only) |
| Posting and reporting | `job_boards`, `postings`, `report_events`, `call_log`, `monthly_targets` |
| Intake | `intake_batches`, `sheet_log` |

Ids are text and keep the app's own style (`OP-1001`, `C-2001`, `APP-3101`). Rows that belong to a login use the login's uuid. Salary is in two units on purpose: candidates' current and expected pay in lakh per annum, offers' CTC in rupees per year, as in the app.

## Rules the database enforces (so no client can skip them)

- **Stage bookkeeping.** Changing an application's stage updates the furthest stage reached and the date it entered the stage, and writes a row to `stage_events`.
- **Opening status.** An opening's status follows its furthest candidate: Screening from Shortlisted, Interviewing from Group Interview, Offer from Offer, Filled when enough people reach Joining. Draft, On Hold, Closed and Filled openings are left alone.
- **Offer approval.** Only the opening's hiring manager or an admin can approve or reject. The approver is recorded. An offer waiting for approval, or rejected, cannot be marked Sent.
- **Append only.** `audit_log` and `stage_events` cannot be edited, and cannot be deleted directly. Deleting an application (a candidate's data-deletion request) removes its stage events with it.
- **Audit.** Changes to candidates, salary, applications, offers, profiles and company settings are written to `audit_log` with who, when, and only the fields that changed.

## Known gaps (tracked in `.claude/plan.md`)

- `audit_log.old_data` keeps copies of changed personal data. A real deletion request must also remove those rows; that needs a dedicated, logged function (Phase 7, DPDP review).
- The app has no login screen and does not read or write these tables yet (Phase 2.2 and 2.3).
