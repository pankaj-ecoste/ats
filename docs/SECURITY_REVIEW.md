# Security review: end of version 1 (2026-11-06)

What was checked before the app is handed to the HR team, what was found, what was fixed, and what is still open. The things only the account owner can do in the dashboards stay in `docs/SECURITY_CHECKLIST.md`.

**How it was checked.** The live database was queried directly (who can run which function, which tables have row-level security, which buckets are public). The front end was searched for every place that puts text into the page. The headers, the build output, the git history, the dependencies and the CI files were read. Each fix has a test that fails without it.

## 1. Found and fixed in version 1

| # | What was wrong | Why it mattered | Fix | Proof |
|---|---|---|---|---|
| 1 | The page policy allowed inline script (`'unsafe-inline'`) because the build put every script inside the page. | Text from strangers (the careers form, the lead sheet, résumés) is shown to staff. If one piece were ever shown unescaped, it would run inside a signed-in session and could read the session token. The policy was the second line of defence and it was switched off for scripts. | `npm run build` now also writes `dist/site/`: the same code as a few script files. `vercel.json` deploys that folder and says `script-src 'self'`. The single-file build still exists for tests and sharing. | `npm run test:e2e:csp` serves the folder with the real headers: every page, the PDF reader and the Excel export work, an injected inline script does not run |
| 2 | `connect-src` allowed `https://*.supabase.co`: any Supabase project, not only ours. | Injected code could send stolen data to a project the attacker owns and that the policy would have allowed. | The policy names our project only. The site build refuses to build if the configured project is not in the policy (so moving projects cannot silently break the app). | the same test connects to another project's address and is refused |
| 3 | The offer letter's edited text was kept as raw HTML and shown as it was; a stored letter is opened as a `blob:` page, which belongs to the app's own address. | A recruiter could plant script that runs for the hiring manager or admin who opens the letter (a step up in rights). | Edited letter text goes through `cleanHtml()` (a short allow-list of layout tags; no scripts, forms, frames, handlers, outside pictures or live links) every time it is shown. A stored letter is locked with its own policy before it opens, and new copies carry that policy. | `csp.mjs` checks the cleaner and the lock |
| 4 | The AI summary function had no limit per person. | Any signed-in recruiter, or a stolen sign-in, could run up the Anthropic bill. | At most 6 summaries a minute per person (`makeLimiter` in `api/summary.js`). It is a brake kept in the server's memory; the real ceiling is the spending limit on the Anthropic account (owner action, see the checklist). | `summary-api.test.mjs` |
| 5 | Avatar initials were put into the page without escaping and the function failed on an empty name. | Small: two characters cannot form a tag, but the rule "everything is escaped" had one exception. | `av()` escapes, `initials()` copes with empty and odd names. | existing page tests |
| 6 | The two GitHub workflows did not limit the automatic token; nothing watched the build tools for new advisories. | A compromised action could have written to the repository. | `permissions: contents: read` on both workflows, `npm audit --audit-level=high` in CI, Dependabot (monthly, grouped). | `.github/` |
| 7 | The public application door and the lead-sheet door count the last few minutes of `intake_batches` on every call, with no index. | A flood of fake applications would make every call slower. | Index on `(source, received_at)` in migration 0037. | `tests/db/scale.test.mjs` |
| 8 | Operational logs (the intake log holds applicants' e-mail addresses) grew for ever. | Privacy and size. | `app.prune_logs()` runs nightly (migration 0037): intake log 90 days, sheet log 180, read notifications 60 (unread 180), activity 365. The audit log and the stage history are never touched. | `tests/db/scale.test.mjs` |

## 2. Checked and found sound

- **Row-level security is on for every table** (checked live: 0 tables without it). Anonymous visitors can read one view (`careers_openings`: no salary, budget or manager) and run exactly three functions: `submit_application`, `sheet_sync_plan`, `ingest_tab_leads` (the last two need the secret token). The helper functions in the `app` schema cannot be called from outside because that schema is not exposed and `anon` has no rights on it.
- **Every `security definer` function fixes its `search_path`**, and the account-management functions check the caller's role inside. Self sign-up is refused by the database.
- **The lead-sheet token** is two random UUIDs (about 244 bits), only its SHA-256 hash is stored, a wrong token is logged at most 5 times in 10 minutes, and a new token switches the old one off at once.
- **Files:** the three buckets are private, with a size limit (10 MB, offer letters 5 MB) and a list of allowed file types. Anonymous visitors may add one file under `resumes/intake/<random id>/` and nothing else (no read, change or delete); abandoned ones are removed after 3 days by the nightly job.
- **No secrets in the repository or its history, none in `dist/`** (the build refuses to output a database URL with a password or any key that is not the public one).
- **Dependencies:** `npm audit` reports 0 vulnerabilities. The PDF reader runs with `isEvalSupported:false` (CVE-2024-4367) and the page policy forbids `eval` as a second layer.
- **Output escaping:** 299 `esc()` calls; every `confirmBox`/`modal` call that carries a person's name escapes it; no `eval`, `new Function`, `document.write`, `javascript:` link or inline `on...=` attribute anywhere in `src/`.
- **Passwords:** at least 8 characters (database and app); the admin sets and resets them; a switched-off account is cut off at once.
- **Access rules for each role** are covered by 32 access tests (`tests/db/rls.test.mjs`), 11 real sign-in tests and the browser tests per role (`npm run test:db`, `test:e2e:data`).

## 3. Open on purpose (accepted risks and what would close them)

| Risk | Why it is accepted for now | What closes it (version 2) |
|---|---|---|
| The careers form has no CAPTCHA, and anyone can upload a file to `resumes/intake/`. | Limits exist: 200 applications per 10 minutes overall, 5 per e-mail per hour, 10 MB per file, a hidden trap field, the nightly clean-up. | A CAPTCHA (Cloudflare Turnstile or hCaptcha) on the form. |
| A flood can shut the public application door for 10 minutes (the overall cap is shared). | Better than letting a flood fill the database. | The same CAPTCHA; per-address limits at the host. |
| The session token sits in the browser's storage (library default). | Needs a script to run first, which the policy in finding 1 now prevents. | Not needed unless a way to run script is found. |
| `style-src` still allows inline style. | The app sets style attributes everywhere; style cannot run code. | Move styles to classes (large, low value). |
| The audit log keeps copies of personal data. | Needed for accountability. | An admin function that deletes or anonymises a person's rows on request (decision D17), and a retention rule for rejected candidates (D12). |
| **Tests and real use share one Supabase project.** | Tests use `zz...` names and rolled-back transactions and have never touched real rows, but one mistake in a test could. | A separate staging project (Phase 7, D14). This is the most valuable next step. |
| Sign-in limits are Supabase's defaults; no forced password change at first sign-in; no MFA for username logins. | Accounts are created by an admin for a small known team. | Forced change on first sign-in; a longer minimum length; optional MFA. |
| The AI summary limit is per server instance. | Real cost cap is the Anthropic spending limit. | A small database table for the count. |

## 4. How to keep it this way

- Run `npm run check` and `npm run test:e2e:csp` before every deploy that changes `vercel.json`, `index.html` or the build scripts.
- A new place that shows text from a person must use `esc()` (or `cleanHtml()` for formatted text). A new inline `<script>`, `onclick=` or `style` that is built from data would be refused by the policy and by `tests/e2e/csp.mjs`.
- If the Supabase project ever moves, change `connect-src` in `vercel.json`: the site build stops with a clear message until it matches.
- Do the owner's dashboard steps in `docs/SECURITY_CHECKLIST.md` (key rotation, sign-up switch, backups, branch protection, Anthropic spending limit).
