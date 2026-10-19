# Deploying on Vercel

Production is the Vercel link (no company domain for now). The app, the careers page and one small function are served from one project.

## One-time setup (yours)
1. Vercel → Add New → Project → import `pankaj-ecoste/ats`. Framework: Other. `vercel.json` already sets install, build and output.
2. Project → Settings → Environment Variables (Production and Preview):

| Name | Value | Needed for |
|---|---|---|
| `SUPABASE_URL` | the project URL | the build writes it into the app; the summary function reads it |
| `SUPABASE_ANON_KEY` | the anon (public) key | same |
| `ANTHROPIC_API_KEY` | your Anthropic key | draft summaries only. Leave it out and the button reports "not set up" |

Never add the service-role key or `DATABASE_URL` to Vercel; the app does not need them.
3. Deploy. The app is at `/`, the careers page at `/careers.html`, a role at `/careers.html#OP-1001`.
4. In Supabase → Authentication → URL settings, put the Vercel link as the site URL (sign-in is by username, so this is only tidiness).

## Draft summaries (Claude)
Admin: Settings → Draft summaries → Allow. Recruiters then see "Draft summary with Claude" in the match window. The function `api/summary.js` signs the caller in with their own token, refuses anyone but admins and recruiters, removes the candidate's name, email and phone from the text, and returns a short neutral summary that can be saved as a note. It never moves a candidate. Mention it in the privacy notice before switching it on.

## Daily clean-up of abandoned uploads
`.github/workflows/clean-intake.yml` runs `npm run storage:clean -- --yes` every day. It needs two GitHub repository secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Settings → Secrets and variables → Actions). Try it first by hand: `npm run storage:clean` only lists what it would remove.

## Later
Email through Brevo (digest, candidate reminders, offer letters) is planned for after the app has run well; it will add its own keys and a sender address then.
