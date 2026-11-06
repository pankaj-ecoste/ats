/* The recruiter-wise call report: the days a period covers, and the database's rows turned into one line per recruiter. DOM-free. */
"use strict";
// day: that day. week: Monday to Sunday around it. month: the calendar month of it.
function callReportRange(period,date){
 if(period==='week'){const d=parseD(date);d.setDate(d.getDate()-((d.getDay()+6)%7));return {from:iso(d),to:addDays(6,d)}}
 if(period==='month'){const first=date.slice(0,8)+'01';const d=parseD(first);d.setMonth(d.getMonth()+1);d.setDate(0);return {from:first,to:iso(d)}}
 return {from:date,to:date};
}
// rows: [{recruiter_id, recruiter, status, n}]. One line per recruiter: engaged (all calls) and the count of each status; busiest first.
// A status that is not in the fixed list (or NA) is ignored, so the lines always add up to the total.
function pivotCallReport(rows){
 const statuses=APP_CALL_STATUS.filter(s=>s!=='NA');
 const zero=()=>Object.fromEntries(statuses.map(s=>[s,0]));
 const by=new Map(),totals={engaged:0,by:zero()};
 (rows||[]).forEach(r=>{
  const n=Number(r.n)||0;if(!statuses.includes(r.status)||n<=0)return;
  const k=r.recruiter_id||'?';
  if(!by.has(k))by.set(k,{id:r.recruiter_id||null,name:r.recruiter||'Unknown',engaged:0,by:zero()});
  const x=by.get(k);x.engaged+=n;x.by[r.status]+=n;totals.engaged+=n;totals.by[r.status]+=n;
 });
 const recruiters=[...by.values()].sort((a,b)=>b.engaged-a.engaged||a.name.localeCompare(b.name));
 return {statuses,recruiters,totals};
}
