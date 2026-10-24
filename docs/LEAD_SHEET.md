# Live lead sheet

The ad leads land in a Google Sheet. With this switched on, every new row in that sheet reaches the app by itself, about a minute after it is added, as a **New** application ready to call. Nobody has to download or upload anything, and the app does not need to be open.

(To load a sheet once by hand instead, see [LEADS.md](LEADS.md).)

## How it works, in four lines

1. An admin sets it up once in **Settings → Live lead sheet**: which opening the leads go to, and where they came from.
2. The app gives a **script** with a secret in it. Someone pastes it into the Google Sheet (Extensions → Apps Script) and runs `installLeadSync` once.
3. The script wakes every minute, sends the rows that have nothing in the **Synced to ATS** column, and writes the result there: *Added*, *Added to the opening (already in the app)*, *Duplicate: …* or *Skipped: …*.
4. The database checks the secret, tidies the phone numbers, finds repeats (same email, or same last 10 digits of the phone), and adds the people as **New** in the opening. The opening's recruiter gets a notification.

## Setting it up (about five minutes)

1. Create the opening the leads belong to (Openings → New opening). One opening for all ad leads is fine.
2. **Settings → Live lead sheet**: choose the opening, type the source (for example "Facebook Ad"), click **Set up and get the script**.
3. **Copy the script now.** It is shown once and holds the secret. Keep it private. (If it is lost, make a new one: the old one stops working.)
4. Open the Google Sheet → **Extensions → Apps Script**. Delete what is there, paste the script, save.
5. In the function list at the top choose **installLeadSync** and click **Run**. Google asks for permission once (Review permissions → your account → Advanced → Go to the project → Allow). This is normal for your own script.
6. Within a minute a **Synced to ATS** column appears and the rows start arriving. **Settings → Live lead sheet** shows when leads last arrived and what each batch did.

## The format of the sheet

The first row holds the column headings. The app finds each column **by its heading**, so the order does not matter and extra columns are ignored. Download a starting sheet from Settings (CSV).

| Heading (any of the usual names) | Needed | Notes |
|---|---|---|
| Name | yes | |
| Phone / Mobile / WhatsApp number | yes, unless Email is given | `98765 43210`, `+91-98765-43210`, `09876543210`, a number cell: all become `+91 98765 43210` |
| Email | optional | used to find repeats |
| City / Location | optional | |
| Experience | optional | years, `3` or `3 years` |
| Current company, Designation | optional | |
| Current CTC, Expected CTC | optional | `6 LPA`, `50000 per month`, `600000` |
| Notice period | optional | `1 month`, `2 weeks`, `immediate` |
| Campaign / Source | optional | a row with its own source keeps it; otherwise the source set in Settings |
| Date | optional | `12/10/2026` (day first) or `2026-10-12`; today if missing |
| Position / Job applied for | optional | the id or exact title of an open opening sends that row there; otherwise the opening set in Settings |
| Remarks | optional | kept as a note on the candidate |

A heading the script does not recognise can be named at the top of the script: `var MAP = { phone: 'Contact 1' };`.

## What can go wrong, and what you see

| You see in the sheet | Meaning |
|---|---|
| `Duplicate: Already applied for this opening (Name)` | that person is already in the app for this opening. Nothing added. |
| `Skipped: No name` / `No phone or email` / `Phone or email is not valid` | the row cannot be used. Fix it, clear the cell in **Synced to ATS**, and it is sent again. |
| `Added to the opening (already in the app)` | the person was already in the app from another opening; only an application was added. |
| nothing is added and Settings shows "Refused: the token is wrong" | the script is old (a new one was made) or the live sheet is switched off. Make a new script or switch it on. |
| Apps Script **Executions** page shows an error | read it: it names the problem (for example the Name column could not be found, with the headings it saw). |

## Safety

- The secret is stored as a one-way hash. The app cannot show it again, only make a new one.
- Anyone who can open the script (everyone who can edit the sheet) can read the secret. A new script ends the old one at once.
- The database accepts at most 500 rows per call, and the script sends 100. A wrong token is refused, noted, and cannot fill the log.
- The sheet can only add leads. It cannot read anything from the app.
