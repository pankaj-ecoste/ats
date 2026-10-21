/* Ecoste Recruit Tracker <-> Google Sheets workbook: one schema, used by the web app and the template builder. */
"use strict";
(function(root,STAGES){
"use strict";
const MAXR=300; // rows pre-filled with formulas and dropdowns
const NAVY='FF0E1A33',AIH='FF7B4DFF',BLUE='FF2F6BFF';
const LISTS={
 'Stage':STAGES.concat(['Rejected','On Hold']),
 'Opening Status':['Draft','Open','Screening','Interviewing','Offer','Filled','On Hold','Closed'],
 'Work Mode':['Onsite','Hybrid','Remote'],
 'Employment Type':['Full-time','Contract','Internship','Part-time'],
 'Priority':['Low','Medium','High','Urgent'],
 'Education':['12th','Graduate','B.Com','B.A.','BBA','B.Sc','BCA','B.Tech','B.E.','B.Des','MBA','M.Tech','MCA','M.Sc','M.Des','MA HR'],
 'Edu Level':[0,1,1,1,1,1,1,2,2,2,3,3,3,3,3,3],
 'NCR Cities':['Delhi','Noida','Gurugram','Ghaziabad'],
 'Recruiters':['Priya Sharma','Arjun Nair','Sneha Kapoor'],
 'Interviewers':['Rahul Mehta','Kavita Rao','Vikram Singh','Neha Joshi','Aman Gupta','Farah Khan','Priya Sharma','Arjun Nair','Sneha Kapoor'],
 'Sources':['LinkedIn','Naukri','Referral','Careers Page','Indeed','foundit','Shine','Apna','Glassdoor','Internshala','WhatsApp','Google Sheet','Walk-in'],
 'Yes/No':['Yes','No'],
 'Interview Type':['Group','Personal'],
 'Round':['Group Interview','HR','Technical','Managerial','Final'],
 'Interview Status':['Scheduled','Completed','Pending Feedback','Cancelled'],
 'Invitation':['Pending','Sent','Confirmed','Declined'],
 'Recommendation':['Select for Personal Interview','Hold','Reject','Strong','Good','Average','Not Suitable'],
 'Decision':['Selected','Next Round','Hold','Rejected'],
 'Offer Status':['Draft','Generated','Sent','Accepted','Declined','Negotiation','Withdrawn'],
 'Screening Outcome':['Connected','Not Connected','Interested','Not Interested','Call Back','Rejected'],
 'Departments':['Engineering','Sales','Product','Analytics','Human Resources','Finance','Operations','Marketing'],
 'Onboarding Category':['Documents','Compliance','IT & Assets','People','Payroll'],
 'Mode':['Office','Google Meet','Zoom','MS Teams','Phone'],
};
const LIST_KEYS=Object.keys(LISTS);
const colL=n=>{let s='';n++;while(n){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s};
const listRef=name=>{const i=LIST_KEYS.indexOf(name);const L=colL(i);return `Lists!$${L}$2:$${L}$${LISTS[name].length+1}`};

/* column spec: [header, key, type, extra]  type: s text, n number, d date, t time, l list(", "), L list("; "), b yes/no, f formula */
const SCHEMA={
 Openings:[['Opening ID','id','s'],['Job Title','title','s'],['Department','dept','s',{dd:'Departments'}],['Positions','positions','n'],['Location','location','s'],['Work Mode','mode','s',{dd:'Work Mode'}],['Employment Type','type','s',{dd:'Employment Type'}],
  ['Exp Min (yrs)','expMin','n'],['Exp Max (yrs)','expMax','n'],['Salary Min (LPA)','salMin','n'],['Salary Max (LPA)','salMax','n'],['Education','education','s',{dd:'Education'}],
  ['Mandatory Skills','mandatory','l'],['Preferred Skills','preferred','l'],['Job Description','desc','s'],['Responsibilities','resp','s'],['Requirements','req','s'],
  ['Recruiter','recruiter','s',{dd:'Recruiters'}],['Hiring Manager','manager','s',{dd:'Interviewers'}],['Opening Date','opened','d'],['Target Joining Date','target','d'],['Priority','priority','s',{dd:'Priority'}],['Status','status','s',{dd:'Opening Status'}]],
 Candidates:[['Candidate ID','id','s'],['Name','name','s'],['Email','email','s'],['Phone','phone','s'],['Current Designation','designation','s'],['Current Company','company','s'],['Experience (yrs)','exp','n'],['Location','location','s'],
  ['Open to Relocate','reloc','b',{dd:'Yes/No'}],['Education','education','s',{dd:'Education'}],['Field of Study','eduField','s'],['University','university','s'],['Graduation Year','gradYear','n'],['Skills','skills','l'],
  ['Current Salary (LPA)','curSal','n'],['Expected Salary (LPA)','expSal','n'],['Notice (days)','notice','n'],['Certifications','certifications','L'],['Achievements','achievements','L'],['Source','source','s',{dd:'Sources'}],['Added On','created','d'],['Resume Text','resumeText','s']],
 Applications:[['Application ID','id','s'],['Candidate ID','cid','s',{ddRange:'Candidates!$A$2:$A$'+MAXR}],['Opening ID','opId','s',{ddRange:'Openings!$A$2:$A$200'}],
  ['Candidate Name','_cname','f',{f:r=>`IF($B${r}="","",IFERROR(INDEX(Candidates!$B:$B,MATCH($B${r},Candidates!$A:$A,0)),"Unknown ID"))`}],
  ['Opening Title','_otitle','f',{f:r=>`IF($C${r}="","",IFERROR(INDEX(Openings!$B:$B,MATCH($C${r},Openings!$A:$A,0)),"Unknown ID"))`}],
  ['Applied Date','date','d'],['Stage','stage','s',{dd:'Stage'}],['Furthest Stage','_max','s',{dd:'Stage'}],['Recruiter','recruiter','s',{dd:'Recruiters'}],['Stage Since','stageSince','d'],['Joining Date','joining','d'],
  ['Screening Outcome','_sout','s',{dd:'Screening Outcome'}],['Screening Notes','_snotes','s'],
  ['AI Match %','_ai','f',{f:r=>`IF($B${r}="","",ROUND((O${r}*Settings!$B$8+P${r}*Settings!$B$9+Q${r}*Settings!$B$10+R${r}*Settings!$B$11+S${r}*Settings!$B$12+T${r}*Settings!$B$13)/SUM(Settings!$B$8:$B$13),0))`,ai:1}],
  ['Skills %','_sk','f',{f:r=>`IF($B${r}="","",IF(AJ${r}=0,0,ROUND(AK${r}/AJ${r}*85+IF(AL${r}=0,0,AM${r}/AL${r}*15),0)))`,ai:1}],
  ['Experience %','_ex','f',{f:r=>`IF($B${r}="","",IF(X${r}<Y${r},MAX(0,ROUND(100-(Y${r}-X${r})*28,0)),IF(X${r}>Z${r},MAX(60,ROUND(100-(X${r}-Z${r})*10,0)),100)))`,ai:1}],
  ['Education %','_ed','f',{f:r=>`IF($B${r}="","",IF(AH${r}>=AI${r},100,IF(AH${r}=AI${r}-1,70,40)))`,ai:1}],
  ['Location %','_lo','f',{f:r=>`IF($B${r}="","",IF(OR(AC${r}="Remote",AB${r}="Remote"),100,IF(AA${r}=AB${r},100,IF(AND(ISNUMBER(MATCH(AA${r},${listRef('NCR Cities')},0)),ISNUMBER(MATCH(AB${r},${listRef('NCR Cities')},0))),90,IF(AD${r}="Yes",75,35)))))`,ai:1}],
  ['Salary %','_sa','f',{f:r=>`IF($B${r}="","",IF(AE${r}<=AF${r},100,MAX(20,ROUND(100-(AE${r}-AF${r})/AF${r}*220,0))))`,ai:1}],
  ['Notice %','_no','f',{f:r=>`IF($B${r}="","",IF(AG${r}<=30,100,IF(AG${r}<=60,80,55)))`,ai:1}],
  // hidden helper columns U..AN
  ['h: Mandatory','_h1','f',{f:r=>`IFERROR(INDEX(Openings!$M:$M,MATCH($C${r},Openings!$A:$A,0)),"")`,h:1}],
  ['h: Preferred','_h2','f',{f:r=>`IFERROR(INDEX(Openings!$N:$N,MATCH($C${r},Openings!$A:$A,0)),"")`,h:1}],
  ['h: Skills','_h3','f',{f:r=>`","&LOWER(SUBSTITUTE(IFERROR(INDEX(Candidates!$N:$N,MATCH($B${r},Candidates!$A:$A,0)),"")," ",""))&","`,h:1}],
  ['h: Exp','_h4','f',{f:r=>`IFERROR(INDEX(Candidates!$G:$G,MATCH($B${r},Candidates!$A:$A,0)),0)`,h:1}],
  ['h: ExpMin','_h5','f',{f:r=>`IFERROR(INDEX(Openings!$H:$H,MATCH($C${r},Openings!$A:$A,0)),0)`,h:1}],
  ['h: ExpMax','_h6','f',{f:r=>`IFERROR(INDEX(Openings!$I:$I,MATCH($C${r},Openings!$A:$A,0)),0)`,h:1}],
  ['h: CandLoc','_h7','f',{f:r=>`IFERROR(INDEX(Candidates!$H:$H,MATCH($B${r},Candidates!$A:$A,0)),"")`,h:1}],
  ['h: OpLoc','_h8','f',{f:r=>`IFERROR(INDEX(Openings!$E:$E,MATCH($C${r},Openings!$A:$A,0)),"")`,h:1}],
  ['h: Mode','_h9','f',{f:r=>`IFERROR(INDEX(Openings!$F:$F,MATCH($C${r},Openings!$A:$A,0)),"")`,h:1}],
  ['h: Reloc','_h10','f',{f:r=>`IFERROR(INDEX(Candidates!$I:$I,MATCH($B${r},Candidates!$A:$A,0)),"No")`,h:1}],
  ['h: ExpSal','_h11','f',{f:r=>`IFERROR(INDEX(Candidates!$P:$P,MATCH($B${r},Candidates!$A:$A,0)),0)`,h:1}],
  ['h: SalMax','_h12','f',{f:r=>`IFERROR(INDEX(Openings!$K:$K,MATCH($C${r},Openings!$A:$A,0)),1)`,h:1}],
  ['h: Notice','_h13','f',{f:r=>`IFERROR(INDEX(Candidates!$Q:$Q,MATCH($B${r},Candidates!$A:$A,0)),0)`,h:1}],
  ['h: CandEdu','_h14','f',{f:r=>`IFERROR(INDEX(${listRef('Edu Level')},MATCH(INDEX(Candidates!$J:$J,MATCH($B${r},Candidates!$A:$A,0)),${listRef('Education')},0)),1)`,h:1}],
  ['h: ReqEdu','_h15','f',{f:r=>`IFERROR(INDEX(${listRef('Edu Level')},MATCH(INDEX(Openings!$L:$L,MATCH($C${r},Openings!$A:$A,0)),${listRef('Education')},0)),1)`,h:1}],
  ['h: MandCount','_h16','f',{f:r=>`IF(TRIM(U${r})="",0,LEN(U${r})-LEN(SUBSTITUTE(U${r},",",""))+1)`,h:1}],
  ['h: MandHit','_h17','f',{f:r=>hit('U',r),h:1}],
  ['h: PrefCount','_h18','f',{f:r=>`IF(TRIM(V${r})="",0,LEN(V${r})-LEN(SUBSTITUTE(V${r},",",""))+1)`,h:1}],
  ['h: PrefHit','_h19','f',{f:r=>hit('V',r),h:1}],
  ['h: FurthestIdx','_h20','f',{f:r=>`IF($B${r}="","",MIN(IFERROR(MATCH(IF(H${r}="",G${r},H${r}),${listRef('Stage')},0),1),IF(IFERROR(MATCH(IF(H${r}="",G${r},H${r}),${listRef('Stage')},0),1)>11,1,99)))`,h:1}]],
 'Group Interviews':[['Group ID','id','s'],['Opening ID','opId','s',{ddRange:'Openings!$A$2:$A$200'}],['Opening Title','_ot','f',{f:r=>`IF($B${r}="","",IFERROR(INDEX(Openings!$B:$B,MATCH($B${r},Openings!$A:$A,0)),"Unknown ID"))`}],['Date','date','d'],['Time','time','t'],['Duration (min)','duration','n'],['Mode','mode','s',{dd:'Mode'}],['Location','location','s'],['Meeting Link','link','s'],['Panel','panel','s'],['Interviewers','interviewers','l'],['Application IDs','appIds','l'],['Evaluated','evaluated','b',{dd:'Yes/No'}]],
 Interviews:[['Interview ID','id','s'],['Application ID','appId','s',{ddRange:'Applications!$A$2:$A$'+MAXR}],['Candidate','_cn','f',{f:r=>`IF($B${r}="","",IFERROR(INDEX(Applications!$D:$D,MATCH($B${r},Applications!$A:$A,0)),"Unknown ID"))`}],
  ['Type','kind','s',{dd:'Interview Type'}],['Round','round','s',{dd:'Round'}],['Group ID','groupId','s'],['Date','date','d'],['Time','time','t'],['Duration (min)','duration','n'],['Mode','mode','s',{dd:'Mode'}],['Location','location','s'],['Meeting Link','link','s'],['Interviewers','interviewers','l'],
  ['Status','status','s',{dd:'Interview Status'}],['Invitation','invite','s',{dd:'Invitation'}],['Scores (1-5, comma separated)','scores','l'],['Recommendation / Overall','rec','s',{dd:'Recommendation'}],['Decision','decision','s',{dd:'Decision'}],['Feedback','feedback','s']],
 Offers:[['Offer ID','id','s'],['Application ID','appId','s',{ddRange:'Applications!$A$2:$A$'+MAXR}],['Candidate','_cn','f',{f:r=>`IF($B${r}="","",IFERROR(INDEX(Applications!$D:$D,MATCH($B${r},Applications!$A:$A,0)),"Unknown ID"))`}],
  ['Designation','designation','s'],['Department','dept','s',{dd:'Departments'}],['Location','location','s'],['Joining Date','joining','d'],['Reporting Manager','manager','s',{dd:'Interviewers'}],['Employment Type','empType','s',{dd:'Employment Type'}],
  ['Annual CTC (INR)','ctc','n',{fmt:'#,##0'}],['Basic','b_basic','n',{fmt:'#,##0'}],['HRA','b_hra','n',{fmt:'#,##0'}],['Special Allowance','b_special','n',{fmt:'#,##0'}],['Other Allowance','b_other','n',{fmt:'#,##0'}],['Bonus','b_bonus','n',{fmt:'#,##0'}],
  ['Breakup Check','_chk','f',{f:r=>`IF($B${r}="","",IF(SUM(K${r}:O${r})=J${r},"OK","Off by "&TEXT(J${r}-SUM(K${r}:O${r}),"#,##0")))`}],
  ['Status','status','s',{dd:'Offer Status'}],['Created','created','d'],['Sent On','sent','d'],['Probation (months)','probation','n'],['Validity (days)','validity','n']],
 Onboarding:[['Application ID','appId','s',{ddRange:'Applications!$A$2:$A$'+MAXR}],['Candidate','_cn','f',{f:r=>`IF($A${r}="","",IFERROR(INDEX(Applications!$D:$D,MATCH($A${r},Applications!$A:$A,0)),"Unknown ID"))`}],['Start Date','start','d'],['Category','cat','s',{dd:'Onboarding Category'}],['Step','t','s'],['Done','done','b',{dd:'Yes/No'}]],
 Tasks:[['Task ID','id','s'],['Title','title','s'],['Due','due','d'],['Related To','related','s'],['Priority','priority','s',{dd:'Priority'}],['Owner','owner','s',{dd:'Interviewers'}],['Done','done','b',{dd:'Yes/No'}]],
};
function hit(C,r){const tok=`TRIM(MID(SUBSTITUTE($${C}${r},",",REPT(" ",200)),(ROW($A$1:$A$20)-1)*200+1,200))`;
 return `SUMPRODUCT((${tok}<>"")*ISNUMBER(SEARCH(","&LOWER(SUBSTITUTE(${tok}," ",""))&",",$W${r})))`}
const SHEET_ORDER=['Openings','Candidates','Applications','Group Interviews','Interviews','Offers','Onboarding','Tasks'];

/* ---------- date helpers (UTC-safe) ---------- */
const toDate=s=>{if(!s)return null;const [y,m,d]=String(s).split('-').map(Number);if(!y||!m||!d)return null;return new Date(Date.UTC(y,m-1,d))};
const p2=n=>String(n).padStart(2,'0');
function readDate(v){
 if(v==null||v==='')return null;
 if(v instanceof Date)return v.getUTCFullYear()+'-'+p2(v.getUTCMonth()+1)+'-'+p2(v.getUTCDate());
 if(typeof v==='number'){const d=new Date(Math.round((v-25569)*864e5));return readDate(d)}
 const s=String(v).trim();let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return m[1]+'-'+p2(m[2])+'-'+p2(m[3]);
 m=s.match(/^(\d{1,2})[\/\-. ](\d{1,2}|[A-Za-z]{3})[\/\-. ](\d{2,4})$/);
 if(m){const mo=isNaN(m[2])?['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase())+1:+m[2];let y=+m[3];if(y<100)y+=2000;if(mo>0)return y+'-'+p2(mo)+'-'+p2(m[1])}
 const d=new Date(s);return isNaN(d)?null:d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());
}
function readTime(v){
 if(v==null||v==='')return '';
 if(v instanceof Date)return p2(v.getUTCHours())+':'+p2(v.getUTCMinutes());
 if(typeof v==='number'){const mins=Math.round((v%1)*1440);return p2(Math.floor(mins/60))+':'+p2(mins%60)}
 const s=String(v).trim();const m=s.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?/i);if(!m)return s;let h=+m[1];if(m[3]){const pm=m[3].toLowerCase()==='pm';if(pm&&h<12)h+=12;if(!pm&&h===12)h=0}return p2(h)+':'+m[2];
}
function cellVal(c){let v=c.value;if(v&&typeof v==='object'&&!(v instanceof Date)){if('result' in v)v=v.result;else if(v.richText)v=v.richText.map(x=>x.text).join('');else if('text' in v)v=v.text;else if(v.error)v=''}return v}

/* ---------- flatten app state -> rows ---------- */
function rowsFor(name,S){
 const byId=(arr,id)=>arr.find(x=>x.id===id);
 switch(name){
  case 'Openings':return S.openings;
  case 'Candidates':return S.candidates;
  case 'Applications':return S.applications.map(a=>({...a,_max:STAGES[a.maxStage]||a.stage,_sout:a.screening?a.screening.outcome:'',_snotes:a.screening?a.screening.notes:''}));
  case 'Group Interviews':return S.groups;
  case 'Interviews':return S.interviews;
  case 'Offers':return S.offers.map(o=>({...o,b_basic:o.breakup.basic,b_hra:o.breakup.hra,b_special:o.breakup.special,b_other:o.breakup.other,b_bonus:o.breakup.bonus}));
  case 'Onboarding':return S.onboarding.flatMap(o=>o.items.map(i=>({appId:o.appId,start:o.start,cat:i.cat,t:i.t,done:i.done})));
  case 'Tasks':return S.tasks;
 }
}

/* ---------- build workbook ---------- */
async function build(ExcelJS,S,opts={}){
 const wb=new ExcelJS.Workbook();wb.creator='Ecoste Recruit Tracker';wb.created=new Date();
 wb.calcProperties={fullCalcOnLoad:true};
 const font={name:'Arial',size:10};
 const head=(ws,cols)=>{const row=ws.getRow(1);cols.forEach((c,i)=>{const cell=row.getCell(i+1);cell.value=c[0];const isF=c[2]==='f';
   cell.font={name:'Arial',size:10,bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:isF?(c[3]&&c[3].h?'FF8A93A8':AIH):NAVY}};
   cell.alignment={vertical:'middle',wrapText:true};
   if(isF)cell.note={texts:[{text:'Calculated automatically. Do not type in this column.'}]};
   else if(c[3]&&(c[3].dd||c[3].ddRange))cell.note={texts:[{text:'Pick from the dropdown.'}]};
   else if(c[2]==='l')cell.note={texts:[{text:'Comma separated, e.g. Java, SQL, AWS'}]};
   else if(c[2]==='d')cell.note={texts:[{text:'Date, e.g. 30-Sep-2026'}]};
   else if(c[2]==='t')cell.note={texts:[{text:'24-hour time as text, e.g. 14:30'}]};});
  row.height=30;ws.views=[{state:'frozen',xSplit:name2freeze(ws.name),ySplit:1}];};
 const name2freeze=n=>({Applications:2,Candidates:2,Openings:2,Interviews:1,Offers:1}[n]||1);

 // Guide sheet
 const g=wb.addWorksheet('How to use',{properties:{tabColor:{argb:BLUE}}});
 g.getColumn(1).width=4;g.getColumn(2).width=110;
 const guide=[['Ecoste Recruit Tracker — Google Sheets edition',16,true],['',10],
  ['This workbook runs the full recruitment journey: Opening → Application → AI match → Shortlist → Screening → Group interview → Personal interview → Selected → Offer → Joining → Onboarding → Employee ready.',10],
  ['It uses the same columns as the Ecoste Recruit Tracker web app, so you can work in either place and move data between them from the web app’s Google Sheets page.',10],['',10],
  ['How to fill it in',12,true],
  ['1. Openings: one row per job. Put skills as a comma-separated list (e.g. Java, Spring Boot, SQL). These drive the AI match.',10],
  ['2. Candidates: one row per person. Give each a unique Candidate ID (e.g. C-3001). Skills are comma separated.',10],
  ['3. Applications: one row per candidate per opening. Pick the Candidate ID and Opening ID from the dropdowns; name, title and AI match fill in automatically.',10],
  ['4. Move a candidate by changing the Stage dropdown. Set Furthest Stage too if they are rejected or on hold, so the funnel stays accurate.',10],
  ['5. Interviews, Group Interviews, Offers, Onboarding and Tasks work the same way: pick the Application ID and fill the row.',10],['',10],
  ['Colour key',12,true],['Navy headers: you type here.   Purple headers: calculated automatically — leave them alone.   Grey headers (hidden helper columns): used by the AI match formulas.',10],
  ['AI match weights and the company details used in offer letters live on the Settings tab. The Dashboard tab updates by itself.',10],['',10],
  ['Moving data between the Sheet and the web app',12,true],
  ['• In the web app, open Google Sheets in the sidebar. “Send to Google Sheets” creates a fresh copy of this workbook with all current app data.',10],
  ['• “Load from Google Sheets” reads a sheet like this one (paste its link) and replaces the app’s data after you review a preview.',10],
  ['• Keep the tab names and header row unchanged so both directions keep working. Extra columns you add to the right are ignored.',10]];
 guide.forEach((x,i)=>{const c=g.getCell(i+1,2);c.value=x[0];c.font={name:'Arial',size:x[1],bold:!!x[2],color:{argb:i===0?NAVY:'FF16203A'}};c.alignment={wrapText:true,vertical:'top'}});

 // Dashboard placeholder (filled after data sheets exist)
 const dash=wb.addWorksheet('Dashboard',{properties:{tabColor:{argb:'FF12A150'}}});

 // Data sheets
 for(const name of SHEET_ORDER){
  const cols=SCHEMA[name];const ws=wb.addWorksheet(name);
  cols.forEach((c,i)=>{const col=ws.getColumn(i+1);col.width=c[2]==='f'?(c[3].h?12:13):['desc','resp','req','resumeText','feedback','_snotes','achievements'].includes(c[1])?42:['mandatory','preferred','skills','interviewers','appIds','certifications','title','name','email','link'].includes(c[1])?28:15;
   if(c[3]&&c[3].h)col.hidden=true;});
  head(ws,cols);
  const data=rowsFor(name,S)||[];
  const n=Math.max(data.length+1,MAXR);
  for(let r=2;r<=n;r++){
   const obj=data[r-2];const row=ws.getRow(r);
   cols.forEach((c,i)=>{const cell=row.getCell(i+1);cell.font=font;const [,k,t,x]=c;
    if(t==='f'){cell.value={formula:x.f(r),result:opts.results&&obj?opts.results(name,k,obj):undefined};if(x.ai)cell.font={...font,bold:k==='_ai',color:{argb:'FF5B35D6'}};return}
    if(!obj)return;let v=obj[k];
    if(v==null||v===''){return}
    if(t==='l')v=Array.isArray(v)?v.join(', '):v;
    else if(t==='L')v=Array.isArray(v)?v.join('; '):v;
    else if(t==='b')v=v?'Yes':'No';
    else if(t==='d'){v=toDate(v);cell.numFmt='dd-mmm-yyyy'}
    else if(t==='t')v=String(v);
    else if(t==='n')v=+v;
    if(x&&x.fmt)cell.numFmt=x.fmt;
    cell.value=v;});
  }
  // dropdowns + formats for all pre-filled rows
  cols.forEach((c,i)=>{const L=colL(i);const x=c[3]||{};
   if(x.dd||x.ddRange){for(let r=2;r<=n;r++)ws.getCell(L+r).dataValidation={type:'list',allowBlank:true,formulae:[x.ddRange||listRef(x.dd)],showErrorMessage:false}}
   if(c[2]==='d')for(let r=2;r<=n;r++)ws.getCell(L+r).numFmt='dd-mmm-yyyy';
   if(x.fmt)for(let r=2;r<=n;r++)ws.getCell(L+r).numFmt=x.fmt;});
  ws.autoFilter={from:{row:1,column:1},to:{row:1,column:cols.filter(c=>!(c[3]&&c[3].h)).length}};
  // conditional colours
  const idx=h=>cols.findIndex(c=>c[0]===h);
  const cf=(h,pairs)=>{const i=idx(h);if(i<0)return;const L=colL(i);ws.addConditionalFormatting({ref:`${L}2:${L}${n}`,rules:pairs.map(([txt,bg,fg],p)=>({type:'containsText',operator:'containsText',text:txt,priority:p+1,style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:bg}},font:{color:{argb:fg}}}}))})};
  const G=['FFE3F6EA','FF0B7A3B'],R=['FFFDECEC','FFC52F34'],O=['FFFFF3E0','FFB36200'],B=['FFE8EFFF','FF2150C8'],P=['FFF1ECFF','FF5B35D6'];
  if(name==='Applications'){cf('Stage',[['Rejected',...R],['On Hold',...O],['Employee Ready',...G],['Offer Accepted',...G],['Selected',...G],['Joining',...G],['Onboarding',...G],['Offer',...O],['New',...P],['Interview',...B],['Short',...B],['Screening',...B]]);
   const L=colL(idx('AI Match %'));ws.addConditionalFormatting({ref:`${L}2:${L}${n}`,rules:[{type:'cellIs',operator:'greaterThanOrEqual',formulae:['80'],priority:1,style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:G[0]}},font:{color:{argb:G[1]},bold:true}}},{type:'cellIs',operator:'between',formulae:['60','79'],priority:2,style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:P[0]}},font:{color:{argb:P[1]},bold:true}}},{type:'cellIs',operator:'between',formulae:['0','59'],priority:3,style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:O[0]}},font:{color:{argb:O[1]},bold:true}}}]})}
  if(name==='Openings')cf('Status',[['Filled',...G],['Closed',...R],['On Hold',...O],['Offer',...O],['Interviewing',...B],['Screening',...P],['Open',...B]]);
  if(name==='Interviews')cf('Status',[['Completed',...G],['Cancelled',...R],['Pending',...O],['Scheduled',...B]]);
  if(name==='Offers'){cf('Status',[['Accepted',...G],['Declined',...R],['Withdrawn',...R],['Negotiation',...O],['Sent',...B],['Generated',...P]]);cf('Breakup Check',[['Off',...R],['OK',...G]])}
  if(name==='Onboarding'||name==='Tasks')cf('Done',[['Yes',...G],['No',...O]]);
 }

 // Settings
 const st=wb.addWorksheet('Settings');st.getColumn(1).width=28;st.getColumn(2).width=52;st.getColumn(3).width=60;
 const s=S.settings,w=s.weights;
 [['Setting','Value','Notes'],['Company name',s.company,'Used in offer letters'],['Company address',s.companyAddr,''],['Signatory',s.signatory,''],['Signatory title',s.signTitle,''],['Signed-in recruiter',s.user,''],['AI matched threshold (%)',s.threshold,'Applications at or above this count as “AI matched” in the funnel'],
  ['Weight: Skills',w.skills,'AI match weights. Any numbers work; they are normalised by their total.'],['Weight: Experience',w.experience,''],['Weight: Education',w.education,''],['Weight: Location',w.location,''],['Weight: Salary',w.salary,''],['Weight: Notice',w.notice,'']]
  .forEach((r,i)=>r.forEach((v,j)=>{const c=st.getCell(i+1,j+1);c.value=v;c.font=i===0?{name:'Arial',size:10,bold:true,color:{argb:'FFFFFFFF'}}:{name:'Arial',size:10,color:{argb:j===1?'FF0000FF':'FF16203A'}};if(i===0)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};if(i>0&&j===1)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF9D6'}}}));

 // Lists
 const li=wb.addWorksheet('Lists');
 LIST_KEYS.forEach((k,i)=>{const c=li.getCell(1,i+1);c.value=k;c.font={name:'Arial',size:10,bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};li.getColumn(i+1).width=20;
  LISTS[k].forEach((v,j)=>{const d=li.getCell(j+2,i+1);d.value=v;d.font=font})});

 // Dashboard
 buildDashboard(dash,S);
 return wb;
}
function buildDashboard(ws,S){
 ws.getColumn(1).width=3;ws.getColumn(2).width=28;[3,4,5,6,7,8,9,10].forEach(i=>ws.getColumn(i).width=15);
 const T=(r,c,v,st={})=>{const cell=ws.getCell(r,c);cell.value=v;cell.font={name:'Arial',size:st.size||10,bold:!!st.bold,color:{argb:st.color||'FF16203A'}};if(st.fill)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:st.fill}};if(st.fmt)cell.numFmt=st.fmt;if(st.align)cell.alignment={horizontal:st.align};return cell};
 const F=f=>({formula:f});
 T(1,2,'Recruitment dashboard',{size:16,bold:true,color:NAVY});T(2,2,{formula:'"As of "&TEXT(today()(),"dd mmm yyyy")'},{color:'FF8A93A8'});
 const A='Applications!$G$2:$G$'+MAXR;
 const k=[['Open positions','SUMPRODUCT((Openings!$D$2:$D$200)*(Openings!$W$2:$W$200<>"Filled")*(Openings!$W$2:$W$200<>"Closed")*(Openings!$W$2:$W$200<>"Draft")*(Openings!$A$2:$A$200<>""))'],
  ['New applications',`COUNTIF(${A},"New")`],['Shortlisted',`COUNTIF(${A},"Shortlisted")+COUNTIF(${A},"Screening")`],
  ['Interviews today','COUNTIFS(Interviews!$G$2:$G$'+MAXR+',today()(),Interviews!$N$2:$N$'+MAXR+',"<>Cancelled")'],
  ['Selected',`COUNTIF(${A},"Selected")`],['Offers pending','SUMPRODUCT(COUNTIF(Offers!$Q$2:$Q$'+MAXR+',{"Draft","Generated","Sent","Negotiation"}))'],
  ['Joining this week','COUNTIFS(Applications!$K$2:$K$'+MAXR+',">="&today()(),Applications!$K$2:$K$'+MAXR+',"<="&(today()()+7))'],['Onboarding pending',`COUNTIF(${A},"Onboarding")`]];
 k.forEach((x,i)=>{const r=4+Math.floor(i/4)*3,c=2+(i%4)*2;T(r,c,x[0],{color:'FF55607A',fill:'FFF4F6FA'});T(r+1,c,F(x[1]),{size:18,bold:true,fill:'FFF4F6FA',align:'left'});ws.getCell(r,c+1).fill=ws.getCell(r+1,c+1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF4F6FA'}}});
 // funnel
 let r=11;T(r,2,'Recruitment funnel',{size:12,bold:true,color:NAVY});T(r,3,'Candidates',{bold:true});T(r,4,'Conversion',{bold:true});
 const H='Applications!$AN$2:$AN$'+MAXR;
 const fun=[['Applications',`COUNTA(Applications!$A$2:$A$${MAXR})`],['AI matched',`COUNTIF(Applications!$N$2:$N$${MAXR},">="&Settings!$B$7)`],['Shortlisted',`COUNTIF(${H},">=2")`],['Screened',`COUNTIF(${H},">=4")`],['Group interview',`COUNTIF(${H},">=4")`],['Personal interview',`COUNTIF(${H},">=5")`],['Selected',`COUNTIF(${H},">=6")`],['Offer',`COUNTIF(${H},">=7")`],['Joined',`COUNTIF(${H},">=9")`]];
 fun.forEach((x,i)=>{const rr=r+1+i;T(rr,2,x[0]);T(rr,3,F(x[1]),{bold:true});if(i)T(rr,4,F(`IF(C${rr-1}=0,"",C${rr}/C${rr-1})`),{fmt:'0%',color:'FF55607A'})});
 ws.addConditionalFormatting({ref:`C${r+1}:C${r+fun.length}`,rules:[{type:'dataBar',priority:1,cfvo:[{type:'num',value:0},{type:'max'}],color:{argb:'FF2F6BFF'},gradient:false}]});
 // stage counts
 T(r,6,'Stage',{size:12,bold:true,color:NAVY});T(r,7,'Now',{bold:true});
 LISTS.Stage.forEach((s,i)=>{T(r+1+i,6,s);T(r+1+i,7,F(`COUNTIF(${A},"${s}")`),{bold:true})});
 // by opening
 r=r+LISTS.Stage.length+3;T(r,2,'By opening',{size:12,bold:true,color:NAVY});
 ['Opening','Status','Positions','Applications','Active','Avg AI match','In interviews','Offers / joined'].forEach((h,i)=>T(r+1,2+i,h,{bold:true,color:'FFFFFFFF',fill:NAVY}));
 for(let i=0;i<30;i++){const rr=r+2+i,src=i+2;
  T(rr,2,F(`IF(Openings!$A$${src}="","",Openings!$B$${src})`));T(rr,3,F(`IF(Openings!$A$${src}="","",Openings!$W$${src})`));T(rr,4,F(`IF(Openings!$A$${src}="","",Openings!$D$${src})`));
  T(rr,5,F(`IF(Openings!$A$${src}="","",COUNTIF(Applications!$C$2:$C$${MAXR},Openings!$A$${src}))`));
  T(rr,6,F(`IF(Openings!$A$${src}="","",COUNTIFS(Applications!$C$2:$C$${MAXR},Openings!$A$${src},Applications!$G$2:$G$${MAXR},"<>Rejected",Applications!$G$2:$G$${MAXR},"<>On Hold"))`));
  T(rr,7,F(`IF(Openings!$A$${src}="","",IFERROR(ROUND(AVERAGEIF(Applications!$C$2:$C$${MAXR},Openings!$A$${src},Applications!$N$2:$N$${MAXR}),0),""))`));
  T(rr,8,F(`IF(Openings!$A$${src}="","",COUNTIFS(Applications!$C$2:$C$${MAXR},Openings!$A$${src},Applications!$G$2:$G$${MAXR},"*Interview"))`));
  T(rr,9,F(`IF(Openings!$A$${src}="","",COUNTIFS(Applications!$C$2:$C$${MAXR},Openings!$A$${src},Applications!$AN$2:$AN$${MAXR},">=7"))`));}
}

/* ---------- import workbook -> state pieces ---------- */
function parse(wb){
 const out={},warn=[],counts={};
 const all=SHEET_ORDER;
 for(const name of all){
  const ws=wb.getWorksheet(name);if(!ws){warn.push(`Tab “${name}” is missing, so it was skipped.`);out[name]=null;continue}
  const cols=SCHEMA[name];const hdr={};ws.getRow(1).eachCell({includeEmpty:false},(c,i)=>{hdr[String(cellVal(c)).trim().toLowerCase()]=i});
  const map=cols.map(c=>[c,hdr[c[0].toLowerCase()]]);
  const missing=map.filter(m=>!m[1]&&m[0][2]!=='f').map(m=>m[0][0]);if(missing.length)warn.push(`${name}: column${missing.length>1?'s':''} ${missing.join(', ')} not found.`);
  const rows=[];
  ws.eachRow({includeEmpty:false},(row,rn)=>{if(rn===1)return;const o={};let any=false;
   map.forEach(([c,ci])=>{if(!ci||c[2]==='f')return;let v=cellVal(row.getCell(ci));if(v===''||v==null)return;any=true;
    const t=c[2];
    if(t==='n'){v=typeof v==='number'?v:parseFloat(String(v).replace(/[^\d.\-]/g,''));if(isNaN(v))return}
    else if(t==='d'){v=readDate(v);if(!v)return}
    else if(t==='t')v=readTime(v);
    else if(t==='b')v=/^(y|yes|true|1|done)$/i.test(String(v).trim());
    else if(t==='l')v=String(v).split(',').map(x=>x.trim()).filter(Boolean);
    else if(t==='L')v=String(v).split(/;|\n/).map(x=>x.trim()).filter(Boolean);
    else v=String(v).trim();
    o[c[1]]=v});
   if(any)rows.push(o)});
  out[name]=rows;counts[name]=rows.length;
 }
 // settings
 const st=wb.getWorksheet('Settings');let settings=null;
 if(st){const g=r=>cellVal(st.getCell(r,2));settings={company:g(2),companyAddr:g(3),signatory:g(4),signTitle:g(5),user:g(6),threshold:+g(7)||65,weights:{skills:+g(8)||0,experience:+g(9)||0,education:+g(10)||0,location:+g(11)||0,salary:+g(12)||0,notice:+g(13)||0}}}
 return {rows:out,warn,counts,settings};
}

root.SheetsIO={SCHEMA,SHEET_ORDER,STAGES,LISTS,MAXR,build,parse,readDate,readTime};
})(typeof module!=='undefined'&&module.exports?module.exports:window,STAGES); // STAGES comes from core/constants.js, which must load first
