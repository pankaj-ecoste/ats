# Launch runbook (Vercel link as production)

Do these in order. Each step says who does it and how to know it worked. Background for each item is in `docs/SECURITY_CHECKLIST.md` and `docs/DEPLOY.md`.

| # | Step | Who | Proof it worked |
|---|---|---|---|
| 1 | Rotate the database password and the service-role/JWT key (Supabase → Settings). Put the new values in `.env`. | You | `npm run db:status` connects; `npm run test:db` passes |
| 2 | Turn off "Allow new users to sign up", leave other sign-in providers off (Supabase → Authentication). | You | `npm run test:db` (the "nobody can sign themselves up" tests) |
| 3 | Run Supabase Security Advisor; fix what it reports. Confirm daily backups. | You | Advisor shows no errors |
| 4 | Protect `main` on GitHub: pull request, passing CI, one review, no force push. Turn on secret scanning. | You | A direct push to `main` is refused |
| 5 | Open the pull request for `chore/restructure-p1` and watch CI go green once. | You, then I fix anything red | Green check on the pull request |
| 6 | Create the Vercel project (see `docs/DEPLOY.md`), set `SUPABASE_URL`, `SUPABASE_ANON_KEY`; add `ANTHROPIC_API_KEY` only when you want summaries. | You | The Vercel link shows the sign-in screen |
| 7 | Create the first admin from the server: `npm run db:create-admin -- <username>`. Sign in on the live link, fill the first-run company details. | You | You land on the dashboard with your name in the top bar |
| 8 | Create the real accounts on the Users page, one role each. Keep admins few. | You | Each person signs in and sees only their pages |
| 9 | Add the GitHub secrets for the daily clean-up; run the workflow once by hand. | You | The "Clean abandoned uploads" run is green |
| 10 | Put the consent and privacy notice live (the careers form already records consent). Mention draft summaries if you switch them on. Decide retention for rejected candidates. | You, reviewed by whoever handles DPDP | Text approved |
| 11 | Walk the recruiting team through one full case on the live link: apply on `/careers.html`, move to shortlist, interview, offer, joined. | Team, with me for fixes | The case completes with no error toast |
| 12 | Tag the release (`v1.0.0`) and note the date in `.claude/plan.md`. | Me, when you say go | Tag on GitHub |

## After go-live
- Every change goes by pull request; Vercel builds a preview link for each, and `main` goes to production.
- Roll back by redeploying the previous deployment in Vercel (one click). Database changes only go forward: a new migration undoes an old one, never an edit.
- Email through Brevo is the next addition, once the app has run well (Decision D5).
