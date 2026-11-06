# Lead sheets: link a tab of your Google workbook to an opening

The ad leads land in a Google workbook with many tabs, one per ad or opening, and each tab has its own columns. With this set up, **each tab is linked to an opening**, and every new row in a linked tab reaches that opening by itself, about a minute after it is added, as a **New** application ready to call. Nobody downloads or uploads anything.

(To load a sheet once by hand instead, see [LEADS.md](LEADS.md).)

## How it works

1. **Once:** an admin connects the workbook (Settings → *Lead sheet connection*). The app gives a **script** with a secret in it. Someone pastes it into the workbook (Extensions → Apps Script) and runs `installLeadSync`.
2. The script wakes every minute and tells the app the name and headings of **every tab**. That is how the tabs appear in the app. It changes nothing in a tab that is not linked.
3. **On each opening:** its **Lead sheets** tab → **Link a sheet**. Choose the tab, where the leads come from (the source), and which column is what. Columns that are not standard fields can be kept with the lead as **form answers**.
4. From then on the script sends the new rows of that tab, with the opening, source and columns you chose. It writes the result in a **Synced to ATS** column (added to linked tabs only): *Added*, *Added to the opening (already in the app)*, *Duplicate: …* or *Skipped: …*.
5. The database checks the secret, tidies phone numbers, finds repeats (same email, or same last 10 digits of the phone) and adds the people as **New** in the opening. The opening's recruiter gets a notification.

## The rules

- **One tab belongs to one opening.** A tab already linked is shown as taken ("linked to …") and cannot be chosen for another opening.
- **An opening may have several tabs**, for example a Facebook tab and a Naukri tab for the same job.
- **The link follows the tab, not its name.** Renaming a tab in Google does not break the link.
- **Source and campaign.** Every lead's application carries the *source* you chose for the link (for example Facebook Ad) and the *campaign*, which is the tab's name (for example "CRM Updated ad"). The person keeps their own first source.
- **The same person through another tab or platform** for the same opening is a duplicate: nothing is added twice, the first source stays, and the activity log says "Name also came through Naukri (tab name)".
- **A new column** added to a linked tab later is shown as "1 new column". It is not brought in until you choose it (Edit the link).
- **Unlinking** keeps the leads already received and frees the tab, which can then be linked to another opening.
- A closed opening takes no new leads: the rows stay unmarked in the sheet and go in if the opening is opened again.

## Setting it up (about five minutes, once)

1. **Settings → Lead sheet connection → Set up and get the script.**
2. **Copy the script now.** It is shown once and holds the secret. Keep it private. (If it is lost, make a new one: the old one stops working.)
3. Open the Google workbook → **Extensions → Apps Script**. Delete what is there, paste the script, save.
4. In the function list at the top choose **installLeadSync** and click **Run**. Google asks for permission once (Review permissions → your account → Advanced → Go to the project → Allow). This is normal for your own script.
5. Within a minute **Settings** shows how many tabs were reported. Open an opening → **Lead sheets** → **Link a sheet**.

If an older single-tab script is already pasted in the workbook, replace it with the new one: the old one stops working.

## Choosing the columns

The app guesses from the headings (Name, Mobile, Email ID, City …) and you can change any of them. **Name** and a **Phone or an Email** are needed; the rest are optional.

| Field | Notes |
|---|---|
| Name | needed |
| Phone | needed unless Email is given. `98765 43210`, `+91-98765-43210`, `09876543210`, a number cell: all become `+91 98765 43210` |
| Email | used to find repeats |
| City, Experience, Current job title, Current company, Education, Skills | optional. Experience is years: `3` or `3 years` |
| Current salary, Expected salary | optional. `6 LPA`, `50000 per month`, `600000` |
| Notice period | optional. `1 month`, `2 weeks`, `immediate` |
| Date of the lead | optional. `12/10/2026` (day first) or `2026-10-12`; today if missing |
| Remarks | kept as a note on the candidate |
| Call status | the team's call result (Connected, Not Interested ...). Kept on the application, shown in the Applications list and the candidate page, and can be filtered. It is what the sheet said **when the row arrived**, and it never moves a stage |
| Your own columns | an admin or a recruiter names more columns (Settings → Lead columns, or **Add column** in the link window). Each tab matches one of its sheet columns to each of them. They show in the Applications list and can be filtered; sending a row again refreshes the values |

**Other columns to keep with the lead** become "form answers" on the candidate's page (question and answer). They are ticked for you, except the columns a platform adds for itself (`id`, `ad_id`, `form_name`, `platform`, `created_time` …). You decide.

## What can go wrong, and what you see

| You see | Meaning |
|---|---|
| In the sheet: `Duplicate: Already applied for this opening (Name)` | that person is already in the app for this opening. Nothing added. |
| In the sheet: `Skipped: No name` / `No phone or email` / `Phone or email is not valid` | the row cannot be used. Fix it, clear the cell in **Synced to ATS**, and it is sent again. |
| In the sheet: `Skipped: The opening is closed` | open the opening again, clear the cell, and it goes in. |
| In the sheet: `Added to the opening (already in the app)` | the person was in the app from another opening; only an application was added. |
| Opening → Lead sheets: **N new columns** | the tab has columns the link did not know. Edit the link to bring them in, or leave them. |
| Opening → Lead sheets: **N columns missing** | a column the link uses is gone from the tab. Edit the link and choose again. The script reports this in the Apps Script *Executions* page and carries on with the other tabs. |
| Opening → Lead sheets: **Tab not seen lately** | the script has not reported that tab for a few days (deleted, or the script stopped). |
| Settings: "no tab reported yet" | the script is not running in the workbook. Check steps 3 and 4. |
| Settings: "Refused: the token is wrong" | the script is old (a new one was made) or the connection is switched off. |

## Safety

- The secret is stored as a one-way hash. The app cannot show it again, only make a new one.
- Anyone who can open the script (everyone who can edit the workbook) can read the secret. A new script ends the old one at once.
- The database accepts at most 500 rows per call, and the script sends 100. A wrong token is refused, noted, and cannot fill the log.
- The workbook can only report its tabs and add leads to linked tabs. It cannot read anything from the app except which tabs are linked and with which columns.
- Only an admin or a recruiter can link, change or unlink a tab. Only an admin can set up the connection.
