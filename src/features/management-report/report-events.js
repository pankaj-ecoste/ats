/* ===================== Management hiring report ===================== */
const REP_DEF={offerAlert:70,noShowAlert:25,dueSoon:7};
const repCfg=()=>{if(!S.settings.report)S.settings.report={...REP_DEF};return S.settings.report};
R.rep={date:TODAY};
const mondayOf=s=>{const d=parseD(s);d.setDate(d.getDate()-((d.getDay()+6)%7));return iso(d)};
const monthStart=s=>s.slice(0,8)+'01';
const monthEnd=s=>{const d=parseD(monthStart(s));d.setMonth(d.getMonth()+1);d.setDate(0);return iso(d)};
const shiftMonth=(s,n)=>{const d=parseD(monthStart(s));d.setMonth(d.getMonth()+n);return iso(d)};
const ym=s=>s.slice(0,7);
const inR=(d,a,b)=>d&&d>=a&&d<=b;
function addEvent(t,aid,extra={}){if(!S.events)S.events=[];const a=aid?getA(aid):null;S.events.push({d:TODAY,t,aid:aid||null,op:a?a.opId:extra.op||null,...extra})}

/* demo history so the report has 8+ weeks to show */
function seedHistory(){
 let x=20260928;const rnd=()=>{x=(x*1103515245+12345)%2147483648;return x/2147483648};const ri=(a,b)=>a+Math.floor(rnd()*(b-a+1));
 S.events=[];S.callLog=[];const ops=S.openings.filter(o=>o.status!=='Draft');const srcs=['Naukri','Indeed','Referral','LinkedIn','Walk-in','Apna'];
 const thisMon=mondayOf(TODAY);
 for(let w=9;w>=0;w--){const mon=addDays(-7*w,parseD(thisMon));
  ops.forEach((o,k)=>{const scale=o.positions>=5?1.4:o.positions>=3?1:.6;const day=n=>{const d=addDays(n,parseD(mon));return d>TODAY?null:d};
   const made=Math.round(ri(18,60)*scale),conn=Math.round(made*(.35+rnd()*.15));const d0=day(ri(0,4));if(d0)S.callLog.push({id:uid('CL'),d:d0,op:o.id,made,conn,demo:1});
   const ev=(t,n,extra)=>{for(let i=0;i<n;i++){const d=day(ri(0,5));if(d)S.events.push({d,t,aid:null,op:o.id,demo:1,...(extra||{})})}};
   ev('shortlist',Math.round(ri(1,6)*scale));ev('gi',rnd()<.5?ri(1,3):0);ev('interview',Math.round(ri(1,5)*scale));ev('noshow',rnd()<.3?1:0);
   const sel=rnd()<.6*scale?1:0;ev('selected',sel);ev('offer',sel&&rnd()<.9?1:0);ev('accepted',sel&&rnd()<.75?1:0);
   if(w>0&&rnd()<.42*scale)ev('joined',1,{days:ri(26,44),src:srcs[ri(0,srcs.length-1)]});ev('backup',rnd()<.35?ri(1,2):0);});}
 S.demoHistory=true;
 // monthly targets and costs (demo)
 S.monthly={};[-2,-1,0].forEach((n,i)=>{S.monthly[ym(shiftMonth(TODAY,n))]={target:[4,6,8][i],budget:[50000,60000,60000][i],other:[12000,15000,9000][i]}});
 // demo posting costs
 if(!S.postings.some(p=>p.cost)){const m0=monthStart(TODAY),m1=shiftMonth(TODAY,-1);[['OP-1002','naukri',m1,9000],['OP-1001','linkedin_jobs',m1,14000],['OP-1002','indeed',m0,6000],['OP-1001','naukri',m0,12000],['OP-1004','indeed',m0,4000]].forEach(([op,b,d,c])=>{if(getOp(op))S.postings.push({id:uid('PST'),opId:op,board:b,status:'Posted',postedOn:addDays(3,parseD(d))>TODAY?d:addDays(3,parseD(d)),url:'',expires:addDays(30),cost:c,demo:1})})}
 // backups on some upcoming joiners
 S.applications.filter(a=>['Offer','Offer Accepted','Joining'].includes(a.stage)).forEach((a,i)=>{if(a.dropRisk)return;a.dropRisk=['Low','High','Med','Low'][i%4];
  if(i%2===0){const alt=S.applications.find(b=>b.opId===a.opId&&b.id!==a.id&&['Personal Interview','Group Interview','On Hold','Selected'].includes(b.stage));if(alt)a.backup={aid:alt.id,status:'Ready'}}});
 save();
}
if(!S.events)seedHistory();
if(!S.callLog)S.callLog=[];if(!S.monthly)S.monthly={};

/* hook stage changes into events */
{const _set=setStage;setStage=function(aid,stage,quiet){const a=getA(aid);const prev=a&&a.stage;
 if(a&&prev!==stage){const map={Shortlisted:'shortlist',Selected:'selected','Offer Accepted':'accepted'};if(map[stage])addEvent(map[stage],aid);
  if(stage==='Onboarding'&&!a.joinedOn){a.joinedOn=TODAY;const c=getC(a.cid);addEvent('joined',aid,{days:daysBetween(a.date,TODAY),src:c.source})}
  if(stage==='Rejected'&&['Offer Accepted','Joining'].includes(prev)){a.dropped=TODAY;addEvent('dropped',aid)}}
 return _set(aid,stage,quiet)}}
