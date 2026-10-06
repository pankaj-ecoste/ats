/**
 * Ecoste Recruit Tracker - job application form setup
 * Run setupEcosteForm() once. It creates the Google Form (every question required),
 * a linked responses Google Sheet, and a "Setup" tab with the links to paste into the app.
 */
const COMPANY = '{{COMPANY}}';
const EDUCATION = {{EDUCATION}};

function setupEcosteForm() {
  const form = FormApp.create(COMPANY + ' - Job Application');
  form.setDescription('Apply for a role at ' + COMPANY + '. Every question is required. ' +
      'You will be asked to sign in with a Google account to upload your resume.')
    .setConfirmationMessage('Thank you for applying! Our recruitment team will review your profile and contact you soon.')
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(false);
  try { form.setRequireLogin(false); } catch (e) {} // Workspace: let people outside your company apply

  const TV = () => FormApp.createTextValidation();
  const text = (title, help, validation) => {
    const item = form.addTextItem().setTitle(title).setHelpText(help).setRequired(true);
    if (validation) item.setValidation(validation);
    return item;
  };

  text('Candidate Name', 'Your full name as on your resume',
       TV().requireTextLengthGreaterThanOrEqualTo(2).setHelpText('Please enter your full name').build());
  text('Email', 'We will send interview updates here',
       TV().requireTextIsEmail().setHelpText('Please enter a valid email address').build());
  text('Phone', '10-digit mobile number',
       TV().requireTextMatchesPattern('^[+]?[0-9][0-9 -]{8,14}$').setHelpText('Please enter a valid mobile number').build());
  const job = text('Applied For (Job Title)', 'Filled in automatically from the job post you opened. Please do not change it.', null);
  text('Total Experience (Years)', 'Number of years, e.g. 2.5 (enter 0 if you are a fresher)',
       TV().requireNumberBetween(0, 50).setHelpText('Enter a number between 0 and 50').build());
  form.addParagraphTextItem().setTitle('Skills')
      .setHelpText('Your key skills, separated by commas, e.g. Communication, CRM, MS Excel').setRequired(true);
  text('Current Location', 'The city you live in now, e.g. Delhi',
       TV().requireTextLengthGreaterThanOrEqualTo(2).setHelpText('Please enter your city').build());
  form.addListItem().setTitle('Education').setHelpText('Your highest qualification')
      .setChoiceValues(EDUCATION).setRequired(true);
  form.addListItem().setTitle('Notice Period (Days)').setHelpText('How soon you can join')
      .setChoiceValues(['Immediate', '15 days', '30 days', '45 days', '60 days', '90 days']).setRequired(true);
  text('Current CTC (LPA)', 'Annual salary in lakhs, e.g. 3.6 (enter 0 if not working)',
       TV().requireNumberBetween(0, 500).setHelpText('Enter a number in lakhs, e.g. 3.6').build());
  text('Expected CTC (LPA)', 'Annual salary in lakhs, e.g. 4.5',
       TV().requireNumberBetween(0, 500).setHelpText('Enter a number in lakhs, e.g. 4.5').build());
  const src = text('Source', 'Where you saw this job (filled in automatically)', null);

  const ss = SpreadsheetApp.create(COMPANY + ' - Job Applications (responses)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  const template = form.createResponse()
      .withItemResponse(job.createResponse('__JOB__'))
      .withItemResponse(src.createResponse('__SRC__'))
      .toPrefilledUrl();

  SpreadsheetApp.flush();
  Utilities.sleep(2000);
  const setup = ss.insertSheet('Setup', ss.getSheets().length);
  setup.getRange(1, 1, 6, 2).setValues([
    ['What', 'Link'],
    ['1. Application link template (paste into the app: Job posting > Posting settings)', template],
    ['2. Responses sheet (paste into the app: Google Sheets > Connect Google Sheet)', ss.getUrl()],
    ['3. Edit the form (add the "Resume (upload)" question here)', form.getEditUrl()],
    ['Public form link', form.getPublishedUrl()],
    ['Note', 'Do not rename the questions or the "Form Responses 1" tab, or the app cannot match the columns.']
  ]);
  setup.getRange('A1:B1').setFontWeight('bold');
  setup.setColumnWidth(1, 520);
  setup.setColumnWidth(2, 700);
  try { const s1 = ss.getSheetByName('Sheet1'); if (s1 && ss.getSheets().length > 2) ss.deleteSheet(s1); } catch (e) {}

  Logger.log('APPLICATION LINK TEMPLATE (paste into the app): ' + template);
  Logger.log('RESPONSES SHEET (connect in the app): ' + ss.getUrl());
  Logger.log('EDIT FORM (add the Resume upload question): ' + form.getEditUrl());
}
