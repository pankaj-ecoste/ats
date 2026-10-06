/* Lookups over state: getOp, getC, getA, intStatus ... */
"use strict";
/* ---------- lookups ---------- */
const getOp=id=>S.openings.find(o=>o.id===id);
const getC=id=>S.candidates.find(c=>c.id===id);
const getA=id=>S.applications.find(a=>a.id===id);
const appsOfC=cid=>S.applications.filter(a=>a.cid===cid);
const appsOfOp=opId=>S.applications.filter(a=>a.opId===opId);
const intsOfA=aid=>S.interviews.filter(i=>i.appId===aid);
const offerOfA=aid=>S.offers.filter(o=>o.appId===aid).slice(-1)[0];
const primaryApp=cid=>{const l=appsOfC(cid);return l.sort((a,b)=>stageRank(b)-stageRank(a))[0]};
const stageRank=a=>a.stage==='Rejected'||a.stage==='On Hold'?-1:STAGES.indexOf(a.stage);
function intStatus(i){
 if(i.status==='Scheduled'){const end=new Date(parseD(i.date));const [h,m]=i.time.split(':').map(Number);end.setHours(h,m+i.duration);if(end<now())return 'Pending Feedback';}
 return i.status;
}
