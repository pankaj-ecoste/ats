/* Domain constants: stages, statuses, criteria, templates */
"use strict";
/* ---------- domain constants ---------- */
const STAGES=['New','Shortlisted','Screening','Group Interview','Personal Interview','Selected','Offer','Offer Accepted','Joining','Onboarding','Employee Ready'];
// shown when a recruiter rejects a candidate; the chosen phrase (and any note) is kept on the application
const REJECT_REASONS=['Skills do not match','Not enough experience','Salary expectation too high','Location or relocation','Notice period too long','Not interested any more','Failed the interview','Failed the screening','Position filled','Other'];
const JOURNEY=['Applied','AI Matched','Shortlisted','Screening Call','Group Interview','Personal Interview','Selected','Offer Letter','Offer Accepted','Joining','Onboarding','Employee Ready'];
// map stage index -> journey index
const stageToJourney=i=>i===0?1:i+1;
const STAGE_COLOR={'New':'ai','Shortlisted':'blue','Screening':'blue','Group Interview':'cyan','Personal Interview':'cyan','Selected':'green','Offer':'orange','Offer Accepted':'green','Joining':'green','Onboarding':'green','Employee Ready':'green','Rejected':'red','On Hold':'orange'};
const OP_STATUS=['Draft','Open','Screening','Interviewing','Offer','Filled','On Hold','Closed'];
const OP_COLOR={Draft:'',Open:'blue',Screening:'ai',Interviewing:'cyan',Offer:'orange',Filled:'green','On Hold':'orange',Closed:'red'};
// "Call status via app": what a recruiter sets in the app when they call a lead. NA until someone calls; any other value counts as a call made (engaged).
// A fixed list (the database checks the same list in migration 0034).
const APP_CALL_STATUS=['NA','Call not connected','Connected','Busy','Switched Off','Wrong Number','Call Back Requested','Not Interested','Number Not Reachable','High Salary','Duplicate','Follow-UP','Not okay with 15 k Salary'];
const APP_CALL_COLOR={'NA':'','Call not connected':'blue','Connected':'green','Busy':'ai','Switched Off':'','Wrong Number':'red','Call Back Requested':'cyan','Not Interested':'red','Number Not Reachable':'','High Salary':'orange','Duplicate':'red','Follow-UP':'orange','Not okay with 15 k Salary':'orange'};
// the outcome picked in the screening call window, as the call status via app it stands for
const SCREEN_OUTCOME_CALL={'Connected':'Connected','Interested':'Connected','Rejected':'Connected','Not Connected':'Call not connected','Not Interested':'Not Interested','Call Back':'Call Back Requested'};
// the ad asked for an opening (optional, one per opening): Requested -> Running -> Paused -> Closed
const AD_STATUS=['Requested','Running','Paused','Closed'];
const AD_COLOR={Requested:'orange',Running:'green',Paused:'',Closed:'red'};
const OFFER_STATUS=['Draft','Generated','Sent','Accepted','Declined','Negotiation','Withdrawn'];
const OFFER_COLOR={Draft:'',Generated:'ai',Sent:'blue',Accepted:'green',Declined:'red',Negotiation:'orange',Withdrawn:'red'};
const INT_COLOR={Scheduled:'blue',Completed:'green','Pending Feedback':'orange',Cancelled:'red','No-show':'red'};
const DEFAULT_RECRUITERS=['Priya Sharma','Arjun Nair','Sneha Kapoor'];
const DEFAULT_INTERVIEWERS=['Rahul Mehta','Kavita Rao','Vikram Singh','Neha Joshi','Aman Gupta','Farah Khan'];
const SOURCES=['LinkedIn','Naukri','Referral','Careers Page','Indeed','foundit','Shine','Apna','Glassdoor','Internshala','WhatsApp','Google Sheet','Walk-in','Facebook Ad','Google Ad','Instagram Ad','Ad campaign','Facebook','X','Telegram'];
const EDU_LEVEL={'12th':0,'Graduate':1,'B.Com':1,'B.A.':1,'BBA':1,'B.Sc':1,'B.Tech':2,'B.E.':2,'BCA':1,'B.Des':2,'MBA':3,'M.Tech':3,'MCA':3,'M.Sc':3,'M.Des':3,'MA HR':3};
const GI_CRIT=['Communication','Confidence','Technical Knowledge','Problem Solving','Teamwork','Relevant Experience','Overall Impression'];
const PI_CRIT=['Technical Knowledge','Communication','Problem Solving','Experience','Culture/Team Fit'];
const SCREEN_Q=['Are you currently looking for a job?','What is your current salary?','What salary are you expecting?','What is your notice period?','Are you comfortable with the location?','Why are you looking for a change?','Are you available for the interview?'];
const ONB_TEMPLATE=[['Documents','ID proof & PAN collected'],['Documents','Education certificates verified'],['Documents','Relieving letter from last employer'],['Compliance','Background verification cleared'],['Compliance','Policy handbook acknowledged'],['IT & Assets','Laptop and accessories allocated'],['IT & Assets','Email and system access created'],['People','Buddy assigned'],['People','Day-1 orientation completed'],['Payroll','Bank details & payroll setup']];
const SKILL_DICT=['Java','Spring Boot','SQL','REST API','Microservices','AWS','Kubernetes','Kafka','Docker','CI/CD','Terraform','Linux','Python','Hibernate','JavaScript','React','Node.js','Communication','CRM','MS Excel','Excel','Customer Service','Zoho CRM','Salesforce','Hindi','English','Figma','User Research','Prototyping','Design Systems','HTML','CSS','Motion Design','Power BI','Tableau','Statistics','Employee Relations','HR Policies','Talent Management','HRIS','Labour Law','Payroll','Cold Calling','Lead Generation','Jenkins','Git','Azure','GCP','Pandas','Machine Learning','Adobe XD','Wireframing','Negotiation','Team Leadership','Angular','MongoDB','PostgreSQL'];
