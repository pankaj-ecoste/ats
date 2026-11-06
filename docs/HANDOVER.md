# Handover guide: running the Recruit Tracker (version 1)

For the HR team and whoever looks after the system. No coding needed for anything on this page. Anything that needs code is listed at the end under "Who to ask".

## 1. What it is, and where it lives

One place for the whole hiring case: an ad brings leads, the team calls every lead, then a group interview, one personal interview, an offer, and onboarding.

| What | Address |
|---|---|
| The app (sign in with the username and password an admin gave you) | `https://ats-gamma.vercel.app` |
| The public careers page (what candidates see; a role link is `/careers.html#<opening id>`) | `https://ats-gamma.vercel.app/careers.html` |
| Source code and history | `github.com/pankaj-ecoste/ats` (private) |
| Data, accounts, files, backups | the Supabase project (owner's login) |
| Hosting | the Vercel project (owner's login) |

## 2. Who can do what

| Role | Sees | Does |
|---|---|---|
| **Admin** | everything, including Users, Settings and the Audit log | everything; keep admins to two or three people |
| **Recruiter** | all openings, leads, interviews, offers, tasks, reports | creates and edits all of it; logs calls; sends offers for approval |
| **Hiring manager** | only their own openings and those pipelines | approves offers, gives feedback |
| **Interviewer** | only the interviews they are on | fills their own scorecard |
| **Management** | Dashboard (its *Management report* tab: recruiter-wise calls, ads, cost), Openings, Reports; no candidate names, contact details or salary | reads |
| **Pending** | nothing: a new account waits for an admin to give it a role | |

The rules are enforced by the database, not only by what the screen shows.

## 3. The routine

**Every day (recruiter).** **Calling** → work through the leads one at a time: tap *Call* (on a phone it opens the dialer) or *WhatsApp*, then tap what happened (Connected, Busy, Not connected, ...). The next lead appears at once; *Undo* for five seconds if you tapped the wrong one. After *Connected* choose *Screen now*, *Shortlist* or *Next lead*. Keys 1 to 7 do the same on a laptop. *Call again* holds the leads that were busy, not connected or asked for a call back. Then Dashboard → today's interviews and activity. **Pipeline** → the *Action center*: "Action today", "Stuck" and "Awaiting feedback" say exactly who needs a nudge. **Applications** → set *Call status via app* after every call (this is what the management report counts; an admin or management user reads the recruiter-wise call report). At 09:00 India time the system also sends each person a reminder for stuck candidates, tomorrow's interviews and missing feedback.

**When a vacancy arrives.** Openings → New opening. For a position that needs an ad, use the opening's *Ad request* and send the brief to marketing; the panel later shows leads, cost per lead and cost per hire.

**Leads.** They arrive on their own from the linked Google Sheet tabs (Settings → *Lead sheet connection*, and on each opening the *Lead sheets* tab) and from the careers page. A CSV or Excel file can also be loaded with **Import leads** on Candidates.

**Every week.** Sheets → *Download workbook with app data* (a full Excel copy, kept outside the system as a second copy).

## 4. Admin tasks

| Task | How |
|---|---|
| New person | Users → *Add user*. Give a username, a role and a first password (the page can generate one); tell them to change it at first sign-in. |
| Someone leaves | Users → **Switch off** first (they are signed out and see nothing at once). Do not delete: their name stays on the records they touched. |
| Forgot password | Users → Reset password. |
| Change a role | Users → role list. The last active admin cannot be removed or switched off. |
| Lead sheet stopped sending | Settings → Lead sheet connection shows when the last rows arrived. If the script was lost or shared by mistake, **Make a new script**: the old one stops working at once; paste the new one into the Google workbook. |
| Careers form questions | the opening's *Application form* tab. |
| Draft summaries (AI) | Settings → switch on/off. They need the Anthropic key in Vercel (see `docs/DEPLOY.md`); at most 6 a minute per person. |
| Who changed what | Audit log (admins only). |

## 5. If something looks wrong

| You see | Likely cause | Do this |
|---|---|---|
| The small word in the top bar says **Not saved** or **Offline** (green dot = All saved, orange = Saving…) | Offline: no connection, your changes stay in the window and are saved when it returns, so do not close the tab. Not saved: a change was refused | Offline: wait, or check the connection. Not saved: reload to see what is saved and tell the developer what you did |
| A red message "could not save" | Network blip or an action the role may not do | Wait a minute; changes are retried. If it stays, copy the message and tell the developer. Do not close the tab while it shows. |
| "The data could not be loaded" at sign-in | The database or the network is down | Reload; check `status.supabase.com`. |
| Someone sees an empty app | Role is *pending*, or the account is switched off | Users page. |
| Careers page says the role is closed | The opening's status is not Open/Screening/Interviewing | Change the status on the opening. |
| A lead did not arrive | The tab is not linked, the link is switched off, or the sheet row has no phone or e-mail | the opening's *Lead sheets* tab; Settings → Lead sheet connection shows refused or skipped rows. |
| The site is down or broken after a change | A bad deploy | Vercel → Deployments → the last good one → **Promote / Redeploy**. Data is not affected. |
| An applicant says they were asked to wait | The public form allows 5 tries per e-mail per hour and 200 in 10 minutes overall | Ask them to retry later. |

## 6. Safety net

- **Backups:** Supabase makes daily backups. Do one test restore before real use and then every quarter (`docs/SECURITY_CHECKLIST.md`). The weekly Excel export is the second copy.
- **Rollback of the site:** one click in Vercel (above). Database changes only move forward; a mistake is fixed by a new change, never by editing an old one.
- **Automatic housekeeping:** nightly removal of abandoned résumé uploads (GitHub job) and of old logs (database job); neither touches candidates, offers or the audit log.
- **Limits:** comfortable to about 5,000 leads, workable to about 20,000, see `docs/SCALING.md`. Watch Supabase → *Usage* monthly.

## 7. Recurring checks for the owner

| When | What |
|---|---|
| Monthly | Merge the Dependabot pull requests once the checks are green; look at Supabase *Usage* (size, traffic) |
| Quarterly | Review roles and switched-off accounts; rotate keys; restore a backup into a scratch project; run `npm run check`, `npm run test:db` |
| Before every release | `npm run check`; `npm run test:e2e:all`; `npm run test:e2e:dist` |
| Once, before real use | the open items in `docs/SECURITY_CHECKLIST.md` (rotate the shared keys, switch off sign-up, protect `main`, Anthropic spending limit) |

## 8. Version 1 and version 2

Version 1 is what this guide describes; it is tagged `v1.0.0`. **Every change made after the tag is version 2** and is recorded under "Version 2" in `.claude/plan.md` and `CHANGELOG.md`. The next ones worth doing are listed in plan §12 (first: a separate staging database so tests never run next to real data).

## 9. Who to ask

The developer for: a new feature, a new report, a bug, a database change, a new key. Give them the message you saw and what you clicked. The files to read first are `.claude/plan.md` (what exists and why), `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY_REVIEW.md`, `docs/SCALING.md`.
