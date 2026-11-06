# How far the app scales (measured 2026-11-06)

## How it works, in one paragraph

When someone signs in, the app reads every record they are allowed to see into the browser and works on that copy (fast to use, no waiting between pages). Changes go to the database in the background. Once a minute each open tab asks the database one tiny question, "has anything been written?", and downloads the data again only if the answer is yes (and in any case every ten minutes). So the size of the data matters in two places: the **download at sign-in** and the **work the browser does to draw a page**.

## What one lead costs

About **1.9 KB** per lead (the person, their salary fields, their résumé record and their application), measured on the live data. A full download is therefore:

| Leads | Download before compression | Roughly after compression |
|---|---|---|
| 1,000 | 1.9 MB | 0.3 MB |
| 5,000 | 9 MB | 1.5 MB |
| 20,000 | 37 MB | 6 MB |
| 50,000 | 94 MB | 15 MB |

## What was found and fixed in version 1

| Problem | Effect | Fix |
|---|---|---|
| Every tab re-read the whole database **every minute**. | At 1,000 leads (0.3 MB compressed), 8 tabs over an 8-hour day is about 1 GB a day of traffic: a free Supabase plan (5 GB a month) would run out within a week. | `data_stamp()` (migration 0037): one small question per minute; a full read only when something was written, or every 10 minutes. The poll is now a few hundred bytes. |
| Looking up a person or an opening was a plain search, done once per table row. | The work grew with the **square** of the list. At 20,000 leads: Applications 12.3 s, Pipeline 9.7 s, Reports 4.4 s, search box 1.5 s. | Lookups go through an index that is rebuilt after every change (`src/core/selectors.js`). One column helper on the Applications page also searched the whole list for every row; it now runs once. |
| The Pipeline board and its Action center drew a card or row for **every** lead. | 210,000 page elements at 20,000 leads. | The board columns, the table and the two big Action-center lists show 100 at a time with "Show more", like the other tables. |
| Big tables were read one page after another. | 20 round trips in a row for 20,000 rows. | The first page also says how many rows there are; the rest are asked for together. |
| Nothing deleted old logs. | The intake log (it holds applicants' e-mail addresses) grew for ever. | A nightly clean-up (`app.prune_logs()`): intake log 90 days, sheet log 180, notifications 60/180, activity 365. The audit log is kept (decision D17/D12). |
| Foreign keys without an index. | Deleting an opening or a candidate, and some joins, slow down as tables grow. | 10 indexes + one for the public door's counting (migration 0037). |

## Page times now (a normal laptop, demo mode, the page's own time)

| Page | 1,000 leads | 5,000 | 20,000 | 20,000 **before** |
|---|---|---|---|---|
| Applications | 54 ms | 80 ms | 190 ms | 12,335 ms |
| Pipeline | 182 ms | 183 ms | 366 ms | 9,722 ms |
| Reports | 15 ms | 55 ms | 205 ms | 4,434 ms |
| Openings | 17 ms | 26 ms | 73 ms | 1,277 ms |
| Candidates, Dashboard, Interviews, Tasks | under 25 ms | under 25 ms | under 25 ms | under 65 ms |
| Global search | 1 ms | 3 ms | 8 ms | 1,499 ms |

`npm run test:e2e:scale` repeats this with 5,000 and 20,000 leads and fails if any page goes over a generous budget, so the square-law cannot come back unnoticed.

Sign-in times are estimates from the download size, not yet measured against the live project with that much data (the page times above are measured). The database side is not the limit: the access rules for 21,600 rows are checked in about 5 ms on the server. It is the download and the browser.

## Start-up time (version 2, 2026-11-06)

Measured against the live project with `npm run test:e2e:startup` (a temporary admin, the deployed folder, 150 ms latency and 20 Mbit/s, median of three, 72 people in the project):

| | Before | After |
|---|---|---|
| First visit, to the sign-in screen | 0.59 s | 0.59 s |
| Sign in, to a ready app | 1.41 s | about 0.8 to 1.1 s |
| Reload while signed in (the usual morning start), to a ready app | 1.32 s | **0.50 s** |

What changed: the data, the change stamp and the profile are asked for together instead of one after another (three round trips became one), the connection to the database is opened while the scripts are still downloading, and the script files are kept by the browser. The screen is no longer blank meanwhile: a spinner from the first moment, then the shape of the app. Inside the browser every action already took under 100 ms at 5,000 leads (typing in a search 17 ms, a filter 64 ms, opening a record 15 ms).

## Comfortable limits (version 1)

| | Comfortable | Works but slower | Needs version 2 |
|---|---|---|---|
| Leads in the system | up to about **5,000** (sign-in in a couple of seconds, estimated) | up to about **20,000** (sign-in 5 to 10 seconds, estimated; pages under half a second, measured) | beyond that |
| People signed in at once | 20+ (each tab sends one tiny question a minute) | | |
| Writes | a person's clicks, one at a time in order | a lead import of 500 rows: batches of 200 | |

## When the limit comes (about 20,000 leads), in order of effort

1. **Archive.** Move leads that were rejected or closed more than 12 months ago out of the live tables (a function plus a "show archived" switch). Cheapest, and it fits the retention decision D12.
2. **Load less at sign-in.** Read only open applications and the people attached to them; fetch the rest when someone searches or opens a record.
3. **Server-side pages.** Lists ask the database for 100 rows at a time with the filter and sort applied there (the large change, and the one that removes the limit).

None of these needs the data model to change.

## Things that scale without any work

Row-level security checks, the audit trail, the stage history, the nightly nudges, file storage (a résumé is a file in a bucket, not part of the download), the public careers page (it reads one small view).

## Database growth

The audit log gets about three rows per new lead (candidate, salary record, application), roughly 4 KB. 20,000 leads a year is about 80 MB a year. The Supabase free plan holds 500 MB; watch **Settings → Usage** monthly, and move to the paid plan before 70%.
