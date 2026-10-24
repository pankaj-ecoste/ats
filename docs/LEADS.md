# Importing leads

For the recruiting team. This is how a sheet of leads from an ad campaign gets into the app.

## Before you start

1. **There must be an opening.** Every lead is added to one opening (Openings → New opening). If one ad is for one job, make that opening first. If the ad is general, make one opening for it, for example "Ad leads October".
2. **Get the sheet as a file.** In Google Sheets: File → Download → *Comma Separated Values (.csv)* or *Microsoft Excel (.xlsx)*. In Excel, just use the .xlsx file.
3. **The first row must be the column headings** (Name, Phone, City and so on). Extra columns are ignored.

## Steps

1. Candidates → **Import leads**.
2. Choose the file. The app reads it and guesses which column is which.
3. **Check the table.** Each field (name, phone, email, city, experience, and so on) has a drop-down with the columns of your file. Fix any wrong guess. Choose "not in my file" for a field you do not have. **Name** and **Phone** (or Email) are needed.
4. Choose the **opening**, and type where the leads came from (for example "Facebook Ad"). A lead that has its own source column keeps that source.
5. Read the preview before saving:
   - **new**: a person not in the system. A candidate and an application are added.
   - **already in the system**: they are in the pool but never applied to this opening. Only an application is added, so nobody gets two profiles.
   - **duplicates left out**: they already applied to this opening, or the same phone or email is on two rows of your file.
   - **cannot be used**: no name, or no usable phone or email. Open "Rows left out" to see each row number and the reason, and fix them in your sheet if you want them.
6. Click **Import**. The leads are in the Candidates list straight away as **New**, and are saved to the server in the background. **Keep the tab open until the "Saving" notice goes** (about a minute for 5,000 leads). If you close it early, the browser warns you.

## After importing

- The same sheet can be imported again safely. Everyone already imported shows as a duplicate and is left out, so you can add new rows to the sheet and import it again.
- Start calling from the **Candidates** list: open a lead, then **Screening call**. After each call choose the outcome and "Save & next candidate".
- A phone number is stored as `+91 98765 43210`. Numbers with spaces, dashes, +91 or a 0 in front are tidied. A number that cannot be a phone is treated as missing.
- Dates in a "date" column are read day first (12/10/2026 is 12 October). If a lead has no date, today's date is used.

## Limits

- 10,000 leads in one import. Split bigger files.
- File up to 15 MB. Old `.xls` files are not read: save as `.xlsx` or CSV.
- Only an admin or a recruiter can import.
