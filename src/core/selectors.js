/* Lookups over state: getOp, getC, getA, intStatus ... */
"use strict";
/* ---------- lookups ---------- */
// the team lives in settings (S.settings.team) so it can be edited; the built-in names are only the starting point
// connected: only people with an account can be picked, because a typed name has no account to save against
const recruiters=()=>{if(CONNECTED)return PEOPLE.names(['admin','recruiter']);const t=S.settings.team;return t&&t.recruiters&&t.recruiters.length?t.recruiters:DEFAULT_RECRUITERS};
const interviewers=()=>{if(CONNECTED)return PEOPLE.names(['admin','recruiter','hiring_manager','interviewer']);const t=S.settings.team;return t&&t.interviewers&&t.interviewers.length?t.interviewers:DEFAULT_INTERVIEWERS};
// the list of places a lead can come from: the one an admin saved in Settings, else the built-in list
const customColumns=()=>S.settings.columns||[];
const adFieldList=()=>S.settings.adFields||[];   // the fields of their own an admin or recruiter added to every ad request
const sourceList=()=>{const s=S.settings.sources;return s&&s.length?s:SOURCES};
// where an application came from: its own source, else the person's first source
const appSource=a=>a.source||(getC(a.cid)||{}).source||'Unknown';
/* Lookups by id and "all of this person's applications" are asked once per table row. A plain search made every page slower the longer
   the list was (20,000 leads: the Applications page took 12 seconds), so they go through an index that is rebuilt whenever the list changes.
   The index never decides what is true: a hit is checked against the list, a miss falls back to a plain search, and an index is thrown away
   when the list is another list, has another length, or repo has changed anything (INDEX_EPOCH). */
let INDEX_EPOCH=0;
const INDEXES=new WeakMap();
function indexOf(list,name,build){
 let slot=INDEXES.get(list);if(!slot){slot={};INDEXES.set(list,slot)}
 const x=slot[name];
 if(x&&x.epoch===INDEX_EPOCH&&x.len===list.length)return x.map;
 const map=build(list);slot[name]={epoch:INDEX_EPOCH,len:list.length,map};return map;
}
const byId=(list,id)=>{
 const map=indexOf(list,'id',l=>{const m=new Map();l.forEach((r,i)=>{if(!m.has(r.id))m.set(r.id,i)});return m});     // id -> position
 const r=list[map.get(id)];
 return r&&r.id===id?r:list.find(x=>x.id===id);     // the position is checked against the list itself; anything doubtful is searched for
};
const groupBy=(list,name,key,k)=>{
 const map=indexOf(list,name,l=>{const m=new Map();l.forEach(r=>{const g=m.get(r[key]);g?g.push(r):m.set(r[key],[r])});return m});
 return (map.get(k)||[]).slice();     // a copy: callers sort what they get
};
const getOp=id=>byId(S.openings,id);
const getC=id=>byId(S.candidates,id);
const getA=id=>byId(S.applications,id);
const appsOfC=cid=>groupBy(S.applications,'cid','cid',cid);
const appsOfOp=opId=>groupBy(S.applications,'opId','opId',opId);
const intsOfA=aid=>S.interviews.filter(i=>i.appId===aid);
const offerOfA=aid=>S.offers.filter(o=>o.appId===aid).slice(-1)[0];
const primaryApp=cid=>{const l=appsOfC(cid);return l.sort((a,b)=>stageRank(b)-stageRank(a))[0]};
const stageRank=a=>a.stage==='Rejected'||a.stage==='On Hold'?-1:STAGES.indexOf(a.stage);
function intStatus(i){
 if(i.status==='Scheduled'){const end=new Date(parseD(i.date));const [h,m]=i.time.split(':').map(Number);end.setHours(h,m+i.duration);if(end<now())return 'Pending Feedback';}
 return i.status;
}
