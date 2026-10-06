/* Demo dataset and resume text builder (replace with real data source) */
"use strict";
function seed(){
 const ops=[
  {id:'OP-1001',title:'Senior Java Developer',dept:'Engineering',positions:3,location:'Bengaluru',mode:'Hybrid',type:'Full-time',expMin:5,expMax:8,salMin:18,salMax:28,education:'B.Tech',mandatory:['Java','Spring Boot','SQL','REST API','Microservices'],preferred:['AWS','Kubernetes','Kafka'],desc:'Build and scale the payment orchestration platform used by 4M+ merchants.',resp:'Design microservices, own services end-to-end, review code, mentor juniors.',req:'5+ years of Java backend work, strong SQL, experience shipping REST APIs at scale.',recruiter:'Priya Sharma',manager:'Rahul Mehta',opened:addDays(-34),target:addDays(40),priority:'High',status:'Interviewing'},
  {id:'OP-1002',title:'CRM Executive',dept:'Sales',positions:10,location:'Delhi',mode:'Onsite',type:'Full-time',expMin:1,expMax:3,salMin:3,salMax:5,education:'Graduate',mandatory:['Communication','CRM','MS Excel','Customer Service'],preferred:['Zoho CRM','Hindi','Salesforce'],desc:'Manage customer relationships for our SME accounts across North India.',resp:'Handle inbound queries, update CRM records, run renewal follow-ups.',req:'Graduate with 1–3 years in customer-facing roles, fluent Hindi and English.',recruiter:'Arjun Nair',manager:'Kavita Rao',opened:addDays(-21),target:addDays(20),priority:'Urgent',status:'Interviewing'},
  {id:'OP-1003',title:'UI/UX Designer',dept:'Product',positions:2,location:'Remote',mode:'Remote',type:'Full-time',expMin:3,expMax:6,salMin:12,salMax:20,education:'Graduate',mandatory:['Figma','User Research','Prototyping','Design Systems'],preferred:['HTML','CSS','Motion Design'],desc:'Shape the merchant dashboard experience from research through high-fidelity UI.',resp:'Run research, design flows, maintain the design system.',req:'3+ years product design with a portfolio of shipped SaaS work.',recruiter:'Sneha Kapoor',manager:'Neha Joshi',opened:addDays(-12),target:addDays(45),priority:'Medium',status:'Screening'},
  {id:'OP-1004',title:'Data Analyst',dept:'Analytics',positions:2,location:'Gurugram',mode:'Hybrid',type:'Full-time',expMin:2,expMax:4,salMin:8,salMax:14,education:'Graduate',mandatory:['SQL','Python','Power BI','Excel'],preferred:['Tableau','Statistics'],desc:'Turn product and revenue data into weekly decisions for leadership.',resp:'Build dashboards, write analyses, partner with finance and product.',req:'2+ years analytics, strong SQL and Python.',recruiter:'Priya Sharma',manager:'Aman Gupta',opened:addDays(-6),target:addDays(50),priority:'Medium',status:'Open'},
  {id:'OP-1005',title:'HR Business Partner',dept:'Human Resources',positions:1,location:'Mumbai',mode:'Onsite',type:'Full-time',expMin:6,expMax:10,salMin:15,salMax:22,education:'MBA',mandatory:['Employee Relations','HR Policies','Talent Management'],preferred:['HRIS','Labour Law'],desc:'Partner with business leaders on org design, performance and people programs.',resp:'Own ER cases, drive performance cycles, advise leaders.',req:'MBA/MA HR with 6+ years HRBP experience.',recruiter:'Sneha Kapoor',manager:'Farah Khan',opened:addDays(-52),target:addDays(10),priority:'High',status:'Offer'},
  {id:'OP-1006',title:'DevOps Engineer',dept:'Engineering',positions:1,location:'Pune',mode:'Hybrid',type:'Full-time',expMin:4,expMax:7,salMin:16,salMax:26,education:'B.Tech',mandatory:['AWS','Kubernetes','Docker','CI/CD','Terraform'],preferred:['Linux','Python'],desc:'Own cloud infrastructure, reliability and deployment pipelines.',resp:'Run Kubernetes clusters, IaC, on-call rotation.',req:'4+ years DevOps on AWS.',recruiter:'Arjun Nair',manager:'Vikram Singh',opened:addDays(-47),target:addDays(15),priority:'High',status:'Open'},
 ];
 // [name, designation, company, exp, city, edu, skills, cur, exp sal, notice, opening, stage, reloc, source, daysAgo]
 const raw=[
  ['Aditya Verma','Senior Software Engineer','Infosys',6.2,'Bengaluru','B.Tech','Java,Spring Boot,SQL,REST API,Microservices,Hibernate,Git',19,25,30,'OP-1001','Personal Interview',0,'LinkedIn',18],
  ['Meera Iyer','Backend Engineer','Razorpay',5.5,'Bengaluru','B.E.','Java,Spring Boot,SQL,REST API,Microservices,AWS,Kafka,Docker',22,29,60,'OP-1001','Selected',0,'Referral',25],
  ['Rohit Khanna','Java Developer','TCS',7.1,'Hyderabad','B.Tech','Java,Spring Boot,SQL,Hibernate,REST API,Jenkins',16,22,90,'OP-1001','Shortlisted',1,'Naukri',9],
  ['Sana Qureshi','Software Engineer II','Flipkart',5.0,'Bengaluru','M.Tech','Java,Microservices,SQL,REST API,Kubernetes,AWS,Kafka',24,31,60,'OP-1001','Offer',0,'LinkedIn',28],
  ['Karan Malhotra','Associate Consultant','Capgemini',4.1,'Pune','B.E.','Java,SQL,JavaScript,React,Git',11,16,30,'OP-1001','New',0,'Careers Page',2],
  ['Divya Menon','Tech Lead','Wipro',8.4,'Chennai','B.Tech','Java,Spring Boot,Microservices,AWS,Team Leadership,SQL,REST API',27,34,90,'OP-1001','Screening',1,'Naukri',11],
  ['Nikhil Rao','Java Developer','HCL',5.8,'Bengaluru','MCA','Java,Spring Boot,REST API,SQL,Docker',15,21,30,'OP-1001','New',0,'Indeed',0],
  ['Pooja Sharma','Customer Support Executive','Airtel',2.1,'Delhi','B.Com','Communication,Customer Service,MS Excel,CRM,Hindi,English',3.2,4.2,15,'OP-1002','Group Interview',0,'Naukri',8],
  ['Rahul Yadav','Sales Coordinator','Bajaj Finserv',2.8,'Noida','BBA','Communication,CRM,Salesforce,MS Excel,Hindi,Lead Generation',3.8,4.8,30,'OP-1002','Group Interview',1,'Referral',7],
  ['Anjali Singh','Telecaller','JustDial',1.4,'Delhi','B.A.','Communication,Customer Service,Hindi,Cold Calling',2.4,3.4,15,'OP-1002','Group Interview',0,'Careers Page',6],
  ['Mohit Gupta','CRM Associate','Zomato',1.9,'Gurugram','B.Com','Communication,CRM,Zoho CRM,MS Excel,Customer Service,Hindi',3.5,4.5,30,'OP-1002','Group Interview',1,'LinkedIn',8],
  ['Simran Kaur','Relationship Executive','HDFC Bank',3.0,'Delhi','MBA','Communication,Customer Service,CRM,MS Excel,Negotiation,Hindi,English',4.6,5.6,60,'OP-1002','Personal Interview',0,'Naukri',12],
  ['Faizan Ali','Customer Care Associate','Teleperformance',1.1,'Ghaziabad','B.Sc','Communication,Customer Service,English',2.2,3.2,0,'OP-1002','Shortlisted',1,'Indeed',4],
  ['Neelam Chauhan','Front Office Executive','Max Healthcare',2.3,'Delhi','B.A.','Communication,MS Excel,Customer Service,Hindi',2.9,3.8,15,'OP-1002','New',0,'Careers Page',0],
  ['Tanvi Deshpande','Product Designer','Swiggy',4.5,'Pune','B.Des','Figma,User Research,Prototyping,Design Systems,Motion Design',16,21,60,'OP-1003','Screening',1,'LinkedIn',6],
  ['Arnav Bose','UX Designer','Zoho',3.2,'Chennai','B.Des','Figma,Wireframing,Prototyping,User Research,Adobe XD,HTML,CSS',11,15,30,'OP-1003','Shortlisted',1,'Careers Page',5],
  ['Ishita Jain','Visual Designer','Freelance',2.4,'Jaipur','B.A.','Figma,Adobe XD,Motion Design',6,10,0,'OP-1003','New',1,'Indeed',2],
  ['Varun Sethi','Business Analyst','EY',2.9,'Gurugram','B.Tech','SQL,Python,Power BI,Excel,Statistics',9,12.5,30,'OP-1004','Shortlisted',0,'LinkedIn',4],
  ['Riya Paul','Data Analyst','Mu Sigma',2.2,'Bengaluru','B.Sc','SQL,Python,Tableau,Excel,Pandas',7.5,11,60,'OP-1004','New',1,'Naukri',3],
  ['Harsh Vardhan','MIS Executive','Genpact',3.4,'Noida','B.Com','Excel,SQL,Power BI',6,9,30,'OP-1004','New',1,'Careers Page',0],
  ['Lakshmi Pillai','HR Manager','Godrej',8.0,'Mumbai','MA HR','Employee Relations,HR Policies,Talent Management,HRIS,Labour Law',18,22,60,'OP-1005','Offer Accepted',0,'Referral',40],
  ['Sameer Kulkarni','Senior HRBP','Mahindra',7.2,'Pune','MBA','Employee Relations,Talent Management,HR Policies,Payroll',17,23,90,'OP-1005','Rejected',1,'LinkedIn',38],
  ['Gaurav Mishra','Cloud Engineer','Accenture',5.1,'Pune','B.Tech','AWS,Docker,Kubernetes,Linux,Python,Jenkins',15,22,60,'OP-1006','Screening',0,'Naukri',10],
  ['Deepak Reddy','SRE','PhonePe',6.3,'Bengaluru','B.E.','AWS,Kubernetes,Terraform,Docker,CI/CD,Linux',25,32,90,'OP-1006','New',0,'LinkedIn',3],
  ['Kriti Arora','Java Developer','Paytm',6.0,'Noida','B.Tech','Java,Spring Boot,SQL,REST API,Microservices,Kafka',20,26,30,'OP-1001','Onboarding',1,'Referral',55],
  ['Abhinav Tiwari','CRM Executive','Urban Company',2.6,'Delhi','BBA','Communication,CRM,Zoho CRM,MS Excel,Customer Service,Hindi',3.9,4.7,0,'OP-1002','Joining',0,'Naukri',30],
 ];
 const cands=[],apps=[];
 raw.forEach((r,i)=>{
  const [name,desig,company,exp,city,edu,skills,cur,expSal,notice,opId,stage,reloc,source,ago]=r;
  const cid='C-'+(2001+i);
  const first=name.split(' ')[0].toLowerCase();
  const c={id:cid,name,designation:desig,company,exp,location:city,education:edu,eduField:edu.match(/Tech|B\.E|MCA/)?'Computer Science':edu.match(/Des/)?'Design':edu.match(/HR|MBA/)?'Human Resources':edu.match(/Com|BBA/)?'Commerce':'General',
   university:['Delhi University','VIT Vellore','Pune University','Anna University','Mumbai University','IIIT Hyderabad','Amity University'][i%7],gradYear:2026-Math.ceil(exp)-1,
   skills:skills.split(','),curSal:cur,expSal:expSal,notice,reloc:!!reloc,email:first+'.'+name.split(' ')[1].toLowerCase()+'@mail.com',phone:'+91 9'+String(812345670+i*7919).slice(0,9),
   certifications:skills.includes('AWS')?['AWS Certified Solutions Architect – Associate']:skills.includes('Salesforce')?['Salesforce Administrator']:skills.includes('Figma')?['Google UX Design Certificate']:skills.includes('Power BI')?['Microsoft PL-300 Power BI Data Analyst']:[],
   achievements:[],documents:[],notes:[],source,created:addDays(-ago)};
  c.achievements=[`Recognised as top performer at ${company} in ${2026-1}`,`Delivered ${skills.split(',')[0]} initiative that improved team output by ${12+i%20}%`];
  c.history=[{company,designation:desig,from:String(2026-Math.min(3,Math.ceil(exp/2))),to:'Present',summary:`Working on ${c.skills.slice(0,3).join(', ')} for enterprise clients.`},
   {company:['Tech Mahindra','Mindtree','Cognizant','LTI','Mphasis','Hexaware'][i%6],designation:desig.replace(/Senior |Lead |Tech /,''),from:String(2026-Math.ceil(exp)),to:String(2026-Math.min(3,Math.ceil(exp/2))),summary:`Built foundations in ${c.skills.slice(-3).join(', ')}.`}];
  c.documents=[{name:'Resume.pdf',status:'Received'},{name:'ID proof',status:['Offer Accepted','Joining','Onboarding'].includes(stage)?'Received':'Pending'},{name:'Education certificates',status:'Pending'},{name:'Last 3 payslips',status:'Pending'}];
  c.resumeText=buildResume(c);
  cands.push(c);
  const idx=stage==='Rejected'?3:STAGES.indexOf(stage);
  apps.push({id:'APP-'+(3001+i),cid,opId,date:addDays(-ago),stage,maxStage:idx,recruiter:ops.find(o=>o.id===opId).recruiter,screening:null,stageSince:addDays(-Math.min(ago,3+i%5))});
 });
 // second application
 apps.push({id:'APP-3099',cid:'C-2023',opId:'OP-1001',date:addDays(-2),stage:'New',maxStage:0,recruiter:'Priya Sharma',screening:null,stageSince:addDays(-2)});
 const A=cid=>apps.find(a=>a.cid===cid&&a.opId!=='OP-1001'||a.cid===cid);
 const appOf=name=>apps.find(a=>a.cid===cands.find(c=>c.name===name).id);
 const interviews=[],groups=[],offers=[],onboarding=[];
 // group interview today for CRM
 const gid='GI-501';
 const giApps=['Pooja Sharma','Rahul Yadav','Anjali Singh','Mohit Gupta'].map(appOf);
 groups.push({id:gid,opId:'OP-1002',date:TODAY,time:'11:00',duration:90,mode:'Office',location:'Northwind Office, Connaught Place, Delhi',link:'',panel:'Sales hiring panel',interviewers:['Kavita Rao','Farah Khan'],appIds:giApps.map(a=>a.id),evaluated:false});
 giApps.forEach((a,k)=>interviews.push({id:'INT-'+(701+k),appId:a.id,kind:'Group',round:'Group Interview',groupId:gid,date:TODAY,time:'11:00',duration:90,mode:'Office',location:'Northwind Office, Connaught Place, Delhi',link:'',interviewers:['Kavita Rao','Farah Khan'],status:'Scheduled',invite:['Confirmed','Confirmed','Sent','Confirmed'][k],scores:null,rec:null,feedback:''}));
 const pi=(name,round,date,time,ivr,status,extra={})=>{const a=appOf(name);interviews.push(Object.assign({id:uid('INT'),appId:a.id,kind:'Personal',round,date,time,duration:60,mode:'Google Meet',location:'',link:'https://meet.google.com/abc-defg-hij',interviewers:[ivr],status,invite:'Confirmed',scores:null,rec:null,decision:null,feedback:''},extra))};
 pi('Aditya Verma','Technical',TODAY,'15:00','Rahul Mehta','Scheduled');
 pi('Aditya Verma','HR',addDays(-3),'12:00','Priya Sharma','Completed',{scores:[4,4,4,4,5],rec:'Good',decision:'Next Round',feedback:'Clear communicator, strong ownership mindset.'});
 pi('Simran Kaur','Managerial',TODAY,'17:30','Kavita Rao','Scheduled');
 pi('Meera Iyer','Final',addDays(-2),'16:00','Rahul Mehta','Completed',{scores:[5,4,5,5,4],rec:'Strong',decision:'Selected',feedback:'Excellent system design depth. Strongly recommend.'});
 pi('Sana Qureshi','Technical',addDays(-6),'11:00','Vikram Singh','Completed',{scores:[5,4,4,4,4],rec:'Strong',decision:'Selected',feedback:'Very strong on distributed systems.'});
 pi('Divya Menon','Technical',addDays(2),'10:30','Rahul Mehta','Scheduled');
 pi('Tanvi Deshpande','HR',addDays(1),'14:00','Neha Joshi','Scheduled');
 pi('Gaurav Mishra','Technical',addDays(-1),'12:30','Vikram Singh','Pending Feedback');
 pi('Lakshmi Pillai','Final',addDays(-12),'15:00','Farah Khan','Completed',{scores:[5,5,4,5,5],rec:'Strong',decision:'Selected',feedback:'Ideal HRBP profile.'});
 pi('Sameer Kulkarni','Managerial',addDays(-14),'11:00','Farah Khan','Completed',{scores:[3,3,2,3,2],rec:'Average',decision:'Rejected',feedback:'Limited ER depth for our scale.'});
 pi('Rohit Khanna','HR',addDays(4),'11:30','Priya Sharma','Scheduled');
 pi('Varun Sethi','Technical',addDays(7),'16:00','Aman Gupta','Scheduled');
 const mkOffer=(name,status,join,extra={})=>{const a=appOf(name),c=cands.find(x=>x.id===a.cid),o=ops.find(x=>x.id===a.opId);const ctc=Math.round(c.expSal*100000);offers.push(Object.assign({id:uid('OFR'),appId:a.id,designation:o.title,dept:o.dept,location:o.location,joining:join,manager:o.manager,empType:o.type,ctc,breakup:autoSplit(ctc),status,created:addDays(-3),sent:status==='Sent'||status==='Accepted'?addDays(-2):null,custom:null,probation:6,validity:7},extra))};
 mkOffer('Sana Qureshi','Sent',addDays(35));
 mkOffer('Lakshmi Pillai','Accepted',addDays(8));
 mkOffer('Abhinav Tiwari','Accepted',addDays(3));
 mkOffer('Kriti Arora','Accepted',addDays(-4));
 const ka=appOf('Kriti Arora');
 onboarding.push({appId:ka.id,start:addDays(-4),items:ONB_TEMPLATE.map((t,k)=>({cat:t[0],t:t[1],done:k<6}))});
 appOf('Abhinav Tiwari').joining=addDays(3);
 appOf('Lakshmi Pillai').joining=addDays(8);
 appOf('Divya Menon').screening={outcome:'Call Back',answers:['Yes','₹27 LPA','₹34 LPA','90 days','Open to relocate','Looking for architecture role','Next week'],notes:'Asked to call back Thursday evening.',date:addDays(-1)};
 const tasks=[
  {id:uid('T'),title:'Submit feedback for Gaurav Mishra (Technical)',due:TODAY,related:'DevOps Engineer',priority:'High',done:false,owner:'Vikram Singh'},
  {id:uid('T'),title:'Call back Divya Menon about notice buyout',due:addDays(1),related:'Senior Java Developer',priority:'Medium',done:false,owner:'Priya Sharma'},
  {id:uid('T'),title:'Follow up with Sana Qureshi on offer',due:TODAY,related:'Senior Java Developer',priority:'High',done:false,owner:'Priya Sharma'},
  {id:uid('T'),title:'Post DevOps opening on 2 more job boards',due:addDays(-1),related:'DevOps Engineer',priority:'High',done:false,owner:'Arjun Nair'},
  {id:uid('T'),title:'Share group interview shortlist with Kavita',due:addDays(1),related:'CRM Executive',priority:'Medium',done:false,owner:'Arjun Nair'},
  {id:uid('T'),title:'Collect relieving letter from Kriti Arora',due:addDays(2),related:'Onboarding',priority:'Low',done:false,owner:'Sneha Kapoor'},
  {id:uid('T'),title:'Publish UI/UX Designer JD on Dribbble',due:addDays(-3),related:'UI/UX Designer',priority:'Low',done:true,owner:'Sneha Kapoor'},
 ];
 const t=h=>new Date(NOW.getFullYear(),NOW.getMonth(),NOW.getDate(),h,Math.floor(Math.random()*59)).getTime();
 const activity=[
  {ts:t(9),text:'Nikhil Rao applied for Senior Java Developer',type:'application',appId:'APP-3007'},
  {ts:t(9),text:'Neelam Chauhan applied for CRM Executive',type:'application'},
  {ts:t(9),text:'Harsh Vardhan applied for Data Analyst',type:'application'},
  {ts:t(10),text:'Screening call completed with Tanvi Deshpande',type:'call'},
  {ts:t(10),text:'Faizan Ali shortlisted for CRM Executive',type:'shortlist'},
  {ts:t(10),text:'Screening call completed with Gaurav Mishra',type:'call'},
  {ts:t(8),text:'Arnav Bose shortlisted for UI/UX Designer',type:'shortlist'},
  {ts:t(8),text:'Offer generated for Sana Qureshi',type:'offer'},
  {ts:t(8),text:'Kriti Arora completed 6 of 10 onboarding steps',type:'onboarding'},
  {ts:NOW.getTime()-864e5*2,text:'Meera Iyer selected after Final round',type:'interview'},
 ].sort((a,b)=>b.ts-a.ts);
 const notifications=[
  {id:1,text:'Group interview for CRM Executive starts at 11:00 AM today',ts:t(8),read:false,go:['interviews']},
  {id:2,text:'Feedback pending: Gaurav Mishra — Technical round',ts:t(9),read:false,go:['interviews']},
  {id:3,text:'Sana Qureshi opened the offer letter',ts:t(10),read:false,go:['offers']},
  {id:4,text:'3 new applications scored above 70% AI match',ts:t(9),read:true,go:['applications']},
 ];
 return {v:3,postings:[],settings:JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),openings:ops,candidates:cands,applications:apps,interviews,groups,offers,onboarding,tasks,activity,notifications};
}
function buildResume(c){
 return `${c.name}
${c.designation} · ${c.location} · ${c.email} · ${c.phone}

PROFESSIONAL SUMMARY
${c.designation} with ${c.exp} years of experience. Hands-on with ${c.skills.slice(0,4).join(', ')}. ${c.reloc?'Open to relocation.':'Prefers current city.'} Notice period: ${c.notice} days.

EXPERIENCE
${c.history.map(h=>`${h.designation} — ${h.company} (${h.from}–${h.to})
${h.summary}`).join('\n')}

EDUCATION
${c.education} (${c.eduField}), ${c.university}, ${c.gradYear}

SKILLS
${c.skills.join(', ')}

CERTIFICATIONS
${c.certifications.length?c.certifications.join('\n'):'—'}

ACHIEVEMENTS
${c.achievements.join('\n')}`;
}
