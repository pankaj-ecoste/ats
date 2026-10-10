/* Domain constants: stages, statuses, criteria, templates */
"use strict";
/* ---------- domain constants ---------- */
const STAGES=['New','Shortlisted','Screening','Group Interview','Personal Interview','Selected','Offer','Offer Accepted','Joining','Onboarding','Employee Ready'];
const JOURNEY=['Applied','AI Matched','Shortlisted','Screening Call','Group Interview','Personal Interview','Selected','Offer Letter','Offer Accepted','Joining','Onboarding','Employee Ready'];
// map stage index -> journey index
const stageToJourney=i=>i===0?1:i+1;
const STAGE_COLOR={'New':'ai','Shortlisted':'blue','Screening':'blue','Group Interview':'cyan','Personal Interview':'cyan','Selected':'green','Offer':'orange','Offer Accepted':'green','Joining':'green','Onboarding':'green','Employee Ready':'green','Rejected':'red','On Hold':'orange'};
const OP_STATUS=['Draft','Open','Screening','Interviewing','Offer','Filled','On Hold','Closed'];
const OP_COLOR={Draft:'',Open:'blue',Screening:'ai',Interviewing:'cyan',Offer:'orange',Filled:'green','On Hold':'orange',Closed:'red'};
const OFFER_STATUS=['Draft','Generated','Sent','Accepted','Declined','Negotiation','Withdrawn'];
const OFFER_COLOR={Draft:'',Generated:'ai',Sent:'blue',Accepted:'green',Declined:'red',Negotiation:'orange',Withdrawn:'red'};
const INT_COLOR={Scheduled:'blue',Completed:'green','Pending Feedback':'orange',Cancelled:'red','No-show':'red'};
const DEFAULT_RECRUITERS=['Priya Sharma','Arjun Nair','Sneha Kapoor'];
const DEFAULT_INTERVIEWERS=['Rahul Mehta','Kavita Rao','Vikram Singh','Neha Joshi','Aman Gupta','Farah Khan'];
const SOURCES=['LinkedIn','Naukri','Referral','Careers Page','Indeed','foundit','Shine','Apna','Glassdoor','Internshala','WhatsApp','Google Sheet','Walk-in'];
const EDU_LEVEL={'12th':0,'Graduate':1,'B.Com':1,'B.A.':1,'BBA':1,'B.Sc':1,'B.Tech':2,'B.E.':2,'BCA':1,'B.Des':2,'MBA':3,'M.Tech':3,'MCA':3,'M.Sc':3,'M.Des':3,'MA HR':3};
const GI_CRIT=['Communication','Confidence','Technical Knowledge','Problem Solving','Teamwork','Relevant Experience','Overall Impression'];
const PI_CRIT=['Technical Knowledge','Communication','Problem Solving','Experience','Culture/Team Fit'];
const SCREEN_Q=['Are you currently looking for a job?','What is your current salary?','What salary are you expecting?','What is your notice period?','Are you comfortable with the location?','Why are you looking for a change?','Are you available for the interview?'];
const ONB_TEMPLATE=[['Documents','ID proof & PAN collected'],['Documents','Education certificates verified'],['Documents','Relieving letter from last employer'],['Compliance','Background verification cleared'],['Compliance','Policy handbook acknowledged'],['IT & Assets','Laptop and accessories allocated'],['IT & Assets','Email and system access created'],['People','Buddy assigned'],['People','Day-1 orientation completed'],['Payroll','Bank details & payroll setup']];
const SKILL_DICT=['Java','Spring Boot','SQL','REST API','Microservices','AWS','Kubernetes','Kafka','Docker','CI/CD','Terraform','Linux','Python','Hibernate','JavaScript','React','Node.js','Communication','CRM','MS Excel','Excel','Customer Service','Zoho CRM','Salesforce','Hindi','English','Figma','User Research','Prototyping','Design Systems','HTML','CSS','Motion Design','Power BI','Tableau','Statistics','Employee Relations','HR Policies','Talent Management','HRIS','Labour Law','Payroll','Cold Calling','Lead Generation','Jenkins','Git','Azure','GCP','Pandas','Machine Learning','Adobe XD','Wireframing','Negotiation','Team Leadership','Angular','MongoDB','PostgreSQL'];
