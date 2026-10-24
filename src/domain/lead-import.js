/* Reading a list of leads from a spreadsheet: CSV text, which column is which, phone numbers and dates as people type them. No DOM. */
"use strict";

// A spreadsheet cell as plain text. Excel gives numbers, dates, links and formatted text; a phone number must never turn into 9.87E+9.
function leadCellText(v){
 if(v==null)return '';
 if(Object.prototype.toString.call(v)==='[object Date]')return isNaN(v)?'':v.toISOString().slice(0,10);
 if(typeof v==='number')return Number.isInteger(v)||Math.abs(v)>=1e6?String(Math.round(v)):String(v);
 if(typeof v==='boolean')return v?'Yes':'No';
 if(typeof v==='object'){
  if(Array.isArray(v.richText))return v.richText.map(t=>t.text).join('').trim();
  if('result' in v)return leadCellText(v.result);
  if('text' in v)return leadCellText(v.text);
  if('hyperlink' in v)return String(v.hyperlink).replace(/^mailto:/i,'');
  return '';
 }
 return String(v).trim();
}

// CSV text -> rows of cells. Handles quotes, doubled quotes, line breaks inside quotes, a leading BOM, and , ; tab or | as the separator.
function parseCsv(text){
 let s=String(text||'').replace(/^\uFEFF/,'');
 const first=s.split(/\r?\n/,1)[0]||'';
 const sep=[',',';','\t','|'].map(c=>[c,first.split(c).length]).sort((a,b)=>b[1]-a[1])[0][0];
 const rows=[];let row=[],cell='',q=false;
 for(let i=0;i<s.length;i++){
  const ch=s[i];
  if(q){if(ch==='"'){if(s[i+1]==='"'){cell+='"';i++}else q=false}else cell+=ch}
  else if(ch==='"'&&cell==='')q=true;
  else if(ch===sep){row.push(cell);cell=''}
  else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&s[i+1]==='\n')i++;row.push(cell);cell='';rows.push(row);row=[]}
  else cell+=ch;
 }
 if(cell!==''||row.length){row.push(cell);rows.push(row)}
 return rows.map(r=>r.map(c=>c.trim()));
}

// rows of cells -> {headers, rows}. The first row with two or more filled cells is the heading row. Each row keeps its place in the file (n, 1-based) for messages.
function leadTable(matrix){
 const filled=r=>(r||[]).filter(c=>leadCellText(c)!=='').length;
 const at=matrix.findIndex(r=>filled(r)>=2);
 if(at<0)return {headers:[],rows:[]};
 const seen=new Map();
 const headers=matrix[at].map((c,i)=>{
  let h=leadCellText(c)||`Column ${i+1}`;const k=h.toLowerCase();
  if(seen.has(k)){seen.set(k,seen.get(k)+1);h=`${h} (${seen.get(k)})`}else seen.set(k,1);
  return h;
 });
 const rows=[];
 matrix.slice(at+1).forEach((r,i)=>{
  if(!filled(r))return;
  const o={n:at+i+2};headers.forEach((h,j)=>{o[h]=leadCellText((r||[])[j])});rows.push(o);
 });
 return {headers,rows};
}

// what the app can store about a lead, with the words people use for each column in a sheet (compared in lower case, letters and digits only)
const LEAD_FIELDS=[
 {key:'name',label:'Name',need:true,words:['name','fullname','candidatename','leadname','applicantname','customername','nameofcandidate']},
 {key:'phone',label:'Phone',need:true,words:['phone','mobile','mobileno','mobilenumber','phoneno','phonenumber','contact','contactno','contactnumber','whatsapp','whatsappno','whatsappnumber','cell','cellnumber']},
 {key:'email',label:'Email',words:['email','emailid','emailaddress','mail','mailid']},
 {key:'location',label:'City / location',words:['city','location','currentcity','currentlocation','place','town','district']},
 {key:'exp',label:'Experience (years)',words:['experience','exp','totalexperience','totalexp','yearsofexperience','workexperience','experienceyears']},
 {key:'designation',label:'Current job title',words:['designation','jobtitle','title','currentdesignation','currentrole','role']},
 {key:'company',label:'Current company',words:['company','currentcompany','employer','organisation','organization','companyname']},
 {key:'education',label:'Education',words:['education','qualification','degree','highestqualification']},
 {key:'skills',label:'Skills',words:['skills','skillset','keyskills','keyskill']},
 {key:'curSal',label:'Current salary',words:['currentctc','currentsalary','ctc','currentpackage','presentsalary','currentctclpa']},
 {key:'expSal',label:'Expected salary',words:['expectedctc','expectedsalary','expectedpackage','expectation','salaryexpectation','expectedctclpa']},
 {key:'notice',label:'Notice period',words:['noticeperiod','notice','noticedays','availability']},
 {key:'source',label:'Source / campaign',words:['source','leadsource','campaign','adsource','channel','platform','adname']},
 {key:'date',label:'Date of the lead',words:['date','leaddate','appliedon','appliedat','createdon','createdat','timestamp','submittedon','dateofapplication']},
 {key:'notes',label:'Remarks',words:['remarks','remark','notes','note','comment','comments','feedback']},
];
const leadWord=h=>String(h||'').toLowerCase().replace(/[^a-z0-9]/g,'');

// headers -> {field: header}. An exact word wins; then a heading that holds the word as one of its words ("Applicant's Name") or a long word inside it. One heading is used once.
function guessLeadMap(headers){
 const map={},used=new Set();
 const pick=(f,test)=>{if(map[f.key])return;const h=headers.find(x=>!used.has(x)&&test(x,f.words));if(h){map[f.key]=h;used.add(h)}};
 LEAD_FIELDS.forEach(f=>pick(f,(h,words)=>words.includes(leadWord(h))));
 LEAD_FIELDS.forEach(f=>pick(f,(h,words)=>{
  const w=leadWord(h),tokens=String(h).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.some(x=>(x.length>=6&&w.includes(x))||tokens.includes(x));
 }));
 return map;
}

// A phone number as people write it: spaces, dashes, +91, 091, 0 in front, or Excel's 9.87654321E9.
// Returns {text, key}: text is how it is stored, key is the last 10 digits used to spot repeats. A number that cannot be a phone gives {text:'', key:''}.
function cleanLeadPhone(v){
 let s=String(v==null?'':v).trim();
 if(/^\d+(\.\d+)?e\+?\d+$/i.test(s))s=String(Math.round(Number(s)));
 const lead=s.startsWith('+');
 let d=s.replace(/\D/g,'');
 if(d.length===12&&d.startsWith('91'))d=d.slice(2);
 else if(d.length===11&&d.startsWith('0'))d=d.slice(1);
 else if(d.length===13&&d.startsWith('091'))d=d.slice(3);
 if(/^[6-9]\d{9}$/.test(d))return {text:`+91 ${d.slice(0,5)} ${d.slice(5)}`,key:d};
 if(d.length>=7&&d.length<=15&&(lead||d.length!==10))return {text:(lead?'+':'')+d,key:d.slice(-10)};
 return {text:'',key:''};
}

const LEAD_EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// a date written by hand (day first, as in India) or by Excel (2026-10-12). Anything else is today's date, supplied by the caller.
function leadDate(v,fallback){
 const s=String(v||'').trim();
 let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
 if(!m){const x=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);if(x)m=[0,x[3].length===2?'20'+x[3]:x[3],x[2],x[1]]}
 if(!m)return fallback;
 const y=+m[1],mo=+m[2],d=+m[3];
 if(mo<1||mo>12||d<1||d>31||y<2000||y>2100)return fallback;
 return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
