# The application form of an opening

People who apply through your job posts fill the app's own form (the careers page, `careers.html`). Each opening has its **own form**: the recruiter chooses which of the usual questions it asks and adds questions of their own.

## Where

**Openings → the opening → Application form** (admin and recruiter, with the database connected).

## Usual questions

Always asked, because the person is found again by them: **name, email, mobile number** and the **consent**.

These can be switched off for an opening: current city, total experience, notice period, current salary, expected salary, highest qualification, key skills, resume upload. A short form gets more people to finish it. Whatever is switched off is simply not asked; the database then uses its usual defaults (notice period 30 days, no salary, and so on).

## Your own questions

Up to 15 per opening. Each has:

| | |
|---|---|
| Question | the words people see, up to 200 characters. Every question on a form needs different words. |
| Answer | **Short answer**, **Long answer**, **Number**, **Yes or No**, or **Choose one** (two to ten options, one per line) |
| Must be answered | the form cannot be sent without it |

The answers are kept with the application, question and answer, and shown on the candidate's page under **Form answers**. They are only shown for now: they do not change the match score or move anyone between stages.

Move a question up or down to change the order. **Save the form** when you are done; **Test the form** opens the page people see. Changes apply to people who apply after you save.

## Good to know

- The form is the one people reach through the links on **Job posting** (one per site, so each applicant is tagged with where they came from). A form of the company's own, set in Posting settings, is not affected.
- The database checks every answer again: a required question left empty, a number that is not a number, a Yes/No that is neither, or a choice that is not one of the options is turned back in plain words.
- An answer to a question that is not on the form is ignored.
- Someone who applies again for the same opening keeps their first answers. Someone already in the pool who applies for another opening gives that opening's answers.
- Changing a question's words later means older answers stay under the old words.
