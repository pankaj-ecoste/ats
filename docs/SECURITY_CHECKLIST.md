# Security checklist (to action on the Supabase, GitHub and hosting side)

These are the things only the account owner can do, in the dashboards. The code side is already enforced and tested (`docs/DATABASE.md`). Tick each item and note the date. Do all of it before real candidate data goes in.

## 1. Secrets that were shared during development (do first)

- [ ] **Reset the database password** (Supabase → Project Settings → Database → Reset database password). Update `DATABASE_URL` in `.env`.
- [ ] **Rotate the service-role key and the JWT secret** (Project Settings → API → JWT settings). This also changes the anon key; update `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`. They appeared in a chat transcript, so treat them as exposed.
- [ ] Confirm `.env` is not in git: `git ls-files | grep "^.env$"` must print nothing.
- [ ] Delete the GitHub deploy key if you no longer need it, or keep it read-only unless pushing.

## 2. Supabase project settings

- [ ] **Authentication → Providers → Email:** turn **off** "Allow new users to sign up". The database already refuses self sign-up (tested), but switch it off as well. The admin creates every account with its address already confirmed, so "Confirm email" does not matter; leave email sending unconfigured.
- [ ] Authentication → Providers: leave every other provider (Google, etc.) **off**.
- [ ] **Authentication → Sessions / JWT expiry:** consider 3600 seconds or less (shorter means a password reset takes effect sooner). A switched-off account is cut off immediately regardless.
- [ ] **Authentication → Rate limits:** keep the defaults for sign-in attempts. Optionally set a minimum password length of 8 or more and require mixed characters.
- [ ] Authentication → Attack protection: enable CAPTCHA on sign-in if the site is public on the internet.
- [ ] **Project Settings → API → Exposed schemas:** only `public` (not `app`, not `auth`).
- [ ] **Database → Backups:** confirm daily backups and, on a paid plan, point-in-time recovery. Do one test restore before go-live.
- [ ] **Database → Network restrictions / SSL:** enforce SSL; restrict database connections to your office or server IPs if you can.
- [ ] **Project region:** the project is in Seoul. If data residency or speed for India matters, create the production project in Mumbai (`ap-south-1`) before launch (decision D14).
- [ ] Turn on **MFA for your own Supabase and GitHub accounts**, and keep the owner list short.
- [ ] Supabase **Security Advisor** (Database → Advisors): run it and fix anything it reports.

## 3. GitHub

- [ ] **Branch protection on `main`:** require a pull request, require the CI check to pass, require at least one review, block force-push.
- [ ] Turn on **secret scanning and push protection** (Settings → Code security).
- [ ] Keep the repository private; remove people who left.
- [ ] Add repository secrets for CI only when needed (never commit them).

## 4. Hosting and the live site (Phase 7)

- [ ] HTTPS only, with security headers (`Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`).
- [ ] The browser app contains only the project URL and the **anon** key. Confirm the **service-role key and `DATABASE_URL` are not in any file served to the browser** (search the built `dist/` file for `service_role` and `postgresql://`).
- [ ] Self-host the fonts and the Excel library instead of public CDNs.

## 5. People and data

- [ ] Create the real admin accounts with `npm run db:create-admin -- <username>`; give each person a strong password and ask them to change it at first sign-in.
- [ ] Remove any test accounts (usernames starting `zz` are only ever created by the automated tests and removed again).
- [ ] Review who has which role; keep the number of admins small.
- [ ] Decide how long rejected candidates' data is kept, and how a deletion request is handled, including the copies kept in `audit_log` (decisions D12 and D17).
- [ ] Add the consent notice to the application form (DPDP Act); have it reviewed.

## 6. After go-live

- [ ] Quarterly: review roles and switched-off accounts, rotate keys, test a backup restore, run `npm run test:db` after any Supabase change.
- [ ] If an account may be compromised: **switch it off first** (immediate), then reset the password, then switch it back on.
