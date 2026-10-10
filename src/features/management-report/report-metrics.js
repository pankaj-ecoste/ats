/* Management report: metric calculations */
/* ---- metrics ---- */
"use strict";
function metrics(a,b){
 const ev=t=>S.events.filter(e=>e.t===t&&inR(e.d,a,b)).length;
 const realInt=(kind)=>S.interviews.filter(i=>i.kind===kind&&i.status==='Completed'&&inR(i.date,a,b)).length;
 const calls=S.callLog.filter(c=>inR(c.d,a,b));const scr=S.applications.filter(x=>x.screening&&inR(x.screening.date,a,b));
 const m={calls:calls.reduce((s,c)=>s+c.made,0)+scr.length,conn:calls.reduce((s,c)=>s+c.conn,0)+scr.filter(x=>['Connected','Interested','Call Back'].includes(x.screening.outcome)).length,
  short:ev('shortlist'),gi:ev('gi')+realInt('Group'),int:ev('interview')+realInt('Personal'),noshow:ev('noshow')+S.interviews.filter(i=>i.status==='No-show'&&inR(i.date,a,b)).length,
  sel:ev('selected'),offer:ev('offer')+S.offers.filter(o=>o.sent&&inR(o.sent,a,b)).length,acc:ev('accepted'),join:ev('joined'),backup:ev('backup')};
 m.r_conn=m.calls?m.conn/m.calls:0;m.r_sel=m.int?m.sel/m.int:0;m.r_acc=m.offer?m.acc/m.offer:0;m.r_join=m.acc?Math.min(1,m.join/m.acc):0;m.r_ns=(m.int+m.noshow)?m.noshow/(m.int+m.noshow):0;
 const j=S.events.filter(e=>e.t==='joined'&&inR(e.d,a,b)&&e.days!=null);m.tth=j.length?Math.round(j.reduce((s,e)=>s+e.days,0)/j.length):0;
 return m;
}
const ROWS=[['calls','Position calls made'],['conn','Calls connected / interested'],['short','CVs shortlisted'],['gi','Group interviews done'],['int','Interviews done'],['noshow','No-shows'],['sel','Selected'],['offer','Offer letters released'],['acc','Offers accepted'],['join','Joined'],['backup','Backup candidates lined up']];
const RATES=[['r_conn','Calls → interested %'],['r_sel','Interview → selected %'],['r_acc','Offer acceptance %'],['r_join','Accepted → joined %'],['r_ns','No-show rate % (of scheduled)']];
const pct=v=>Math.round(v*100)+'%';
function joinedCount(o){return appsOfOp(o.id).filter(a=>a.joinedOn||['Onboarding','Employee Ready'].includes(a.stage)).length}
function positionRows(rd){const c=repCfg();return S.openings.filter(o=>o.status!=='Draft').map(o=>{const j=joinedCount(o);const pend=['Closed','Filled'].includes(o.status)?0:Math.max(o.positions-j,0);
 const days=Math.max(0,daysBetween(o.opened,rd));const st=pend===0?'Closed':o.target<rd?'Overdue':daysBetween(rd,o.target)<=c.dueSoon?'Due soon':'On track';return {o,j,pend,days,st}})}
function upcoming(){return S.applications.filter(a=>['Offer','Offer Accepted','Joining'].includes(a.stage)).map(a=>{const of=offerOfA(a.id);return {a,c:getC(a.cid),o:getOp(a.opId),join:a.joining||(of&&of.joining)||'',offer:a.stage==='Offer'?'Pending':'Accepted',risk:a.dropRisk||'Low',backup:a.backup&&getA(a.backup.aid)?a.backup:null}})}
function monthCost(mStart){const mE=monthEnd(mStart);const post=S.postings.filter(p=>p.cost&&inR(p.postedOn,mStart,mE)).reduce((s,p)=>s+(+p.cost||0),0);const m=S.monthly[ym(mStart)]||{};return {post,other:+m.other||0,total:post+(+m.other||0),target:+m.target||0,budget:+m.budget||0}}
function sourceRows(mS){const mE=monthEnd(mS);const srcOf=a=>getC(a.cid).source;const all=new Set();
 const apps=S.applications.filter(a=>inR(a.date,mS,mE));apps.forEach(a=>all.add(srcOf(a)));
 const intA=new Set(S.interviews.filter(i=>i.status==='Completed'&&inR(i.date,mS,mE)).map(i=>i.appId));
 const jn=S.events.filter(e=>e.t==='joined'&&inR(e.d,mS,mE));jn.forEach(e=>all.add(e.src||(e.aid&&getA(e.aid)?srcOf(getA(e.aid)):'Other')));
 const bmap=Object.fromEntries(boards().map(b=>[b.id,b.src]));const cost={};S.postings.filter(p=>p.cost&&inR(p.postedOn,mS,mE)).forEach(p=>{const s=bmap[p.board]||'Other';cost[s]=(cost[s]||0)+(+p.cost||0);all.add(s)});
 return [...all].map(s=>{const cv=apps.filter(a=>srcOf(a)===s).length;const it=S.applications.filter(a=>intA.has(a.id)&&srcOf(a)===s).length;const j=jn.filter(e=>(e.src||(e.aid&&getA(e.aid)?srcOf(getA(e.aid)):'Other'))===s).length;const c=cost[s]||0;return {s,cv,it,j,c}}).sort((a,b)=>b.j-a.j||b.cv-a.cv)}
