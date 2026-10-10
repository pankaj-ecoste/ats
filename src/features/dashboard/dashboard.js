/* Dashboard and funnel */
/* ---------- dashboard ---------- */
"use strict";
function funnelData(apps){
 const reached=i=>apps.filter(a=>a.maxStage>=i).length;
 const T=S.settings.threshold;
 return [['Applications',apps.length],['AI matched',apps.filter(a=>matchA(a).score>=T).length],['Shortlisted',reached(1)],['Screened',reached(3)],['Group interview',reached(3)&&apps.filter(a=>a.maxStage>=3&&(S.interviews.some(i=>i.appId===a.id&&i.kind==='Group')||a.maxStage>=4)).length],['Personal interview',reached(4)],['Selected',reached(5)],['Offer',reached(6)],['Joined',reached(8)]];
}
function funnelHTML(apps){
 const d=funnelData(apps);const max=d[0][1]||1;
 return `<div class="funnel">${d.map((x,k)=>{const prev=k?d[k-1][1]:null;const conv=k&&prev?Math.round(x[1]/prev*100)+'%':'';
  const col=k===1?'var(--ai)':k>=6?'var(--green)':'var(--blue)';
  return `<div class="fn"><span class="lbl">${x[0]}</span><div class="track"><i style="width:${Math.max(4,x[1]/max*100)}%;background:${col}">${x[1]}</i></div><span class="conv" title="Conversion from previous stage">${conv}</span></div>`}).join('')}</div>`;
}
function vDashboard(){
 const A=S.applications;const wk=addDays(7);
 const k=[
  ['Open positions',S.openings.filter(o=>!['Filled','Closed','Draft'].includes(o.status)).reduce((s,o)=>s+o.positions,0),'var(--blue)',`${S.openings.filter(o=>!['Filled','Closed','Draft'].includes(o.status)).length} active openings`,()=>go('openings')],
  ['New applications',A.filter(a=>a.stage==='New').length,'var(--ai)',`${A.filter(a=>a.date===today()).length} received today`,()=>{R.af.status='New';go('applications')}],
  ['Shortlisted',A.filter(a=>['Shortlisted','Screening'].includes(a.stage)).length,'var(--blue)','awaiting screening',()=>{R.af.status='Shortlisted';go('applications')}],
  ['Interviews today',S.interviews.filter(i=>i.date===today()&&i.status!=='Cancelled').length,'var(--cyan)','group and personal',()=>{R.calView='day';R.calDate=today();go('interviews')}],
  ['Selected',A.filter(a=>a.stage==='Selected').length,'var(--green)','ready for offer',()=>{R.af.status='Selected';go('applications')}],
  ['Offers pending',S.offers.filter(o=>['Draft','Generated','Sent','Negotiation'].includes(o.status)).length,'var(--orange)','awaiting send or reply',()=>go('offers')],
  ['Joining this week',A.filter(a=>a.joining&&a.joining>=today()&&a.joining<=wk&&['Offer Accepted','Joining'].includes(a.stage)).length,'var(--green)','confirmed dates',()=>go('onboarding')],
  ['Onboarding pending',S.onboarding.filter(o=>o.items.some(i=>!i.done)).length,'var(--orange)','checklists open',()=>go('onboarding')],
 ];
 const todays=S.interviews.filter(i=>i.date===today()).sort((a,b)=>a.time.localeCompare(b.time));
 const startOfDay=new Date(now().getFullYear(),now().getMonth(),now().getDate()).getTime();
 const todayAct=S.activity.filter(x=>x.ts>=startOfDay);
 const cnt=t=>todayAct.filter(x=>x.type===t).length;
 const act=[['Applications received',cnt('application'),'apps'],['Calls completed',cnt('call'),'phone'],['Candidates shortlisted',cnt('shortlist'),'check'],['Interviews completed',cnt('interview'),'users'],['Offers created',cnt('offer'),'offer'],['Candidates joined',cnt('joined'),'onb']];
 const attention=S.openings.filter(o=>!['Filled','Closed','Draft'].includes(o.status)).map(o=>{
  const ap=appsOfOp(o.id),flags=[];const age=daysBetween(o.opened,today());
  if(ap.length<4)flags.push(['Low applications ('+ap.length+')','red']);
  const pf=S.interviews.filter(i=>ap.some(a=>a.id===i.appId)&&intStatus(i)==='Pending Feedback').length;if(pf)flags.push([pf+' feedback pending','orange']);
  const nw=ap.filter(a=>a.stage==='New').length;if(nw>=2)flags.push([nw+' awaiting review','ai']);
  const sh=ap.filter(a=>a.stage==='Shortlisted').length;if(sh)flags.push([sh+' to screen','blue']);
  if(age>30)flags.push(['Open '+age+' days','red']);
  return {o,flags,age};
 }).filter(x=>x.flags.length).sort((a,b)=>b.flags.length-a.flags.length);
 const hr=now().getHours();
 return `<div class="page-h"><div><h1>Good ${hr<12?'morning':hr<17?'afternoon':'evening'}, ${esc(S.settings.user.split(' ')[0])}</h1><p>${fmtD(today())}. ${todays.filter(i=>i.status!=='Cancelled').length} interviews today and ${S.tasks.filter(t=>!t.done&&t.due<=today()).length} tasks due.</p></div>
 <div class="row"><button class="btn" data-act="addCandidate">${ic('upload')}Add candidate</button><button class="btn pri" data-act="openingForm">${ic('plus')}New opening</button></div></div>
 <div class="kpis">${k.map((x,i)=>`<div class="kpi" tabindex="0" data-kpi="${i}"><span><i style="background:${x[2]}"></i>${x[0]}</span><b>${x[1]}</b><em>${x[3]}</em></div>`).join('')}</div>
 <div class="grid g-dash">
  <section class="panel"><header><div><h3>Recruitment funnel</h3><p>All openings. Percentages show conversion from the previous stage.</p></div><button class="btn sm" data-act="go" data-a1="pipeline">${ic('board')}Pipeline control</button></header><div class="pbody">${funnelHTML(A)}</div></section>
  <section class="panel"><header><h3>Today's activity</h3></header><div>${act.map(x=>`<div class="list-it"><span style="color:var(--tx3);width:18px">${ic(x[2])}</span><span class="grow">${x[0]}</span><b style="font-size:16px">${x[1]}</b></div>`).join('')}</div></section>
 </div>
 <div class="grid g-dash" style="margin-top:16px">
  <section class="panel"><header><div><h3>Today's interviews</h3><p>${todays.length} scheduled</p></div><button class="btn sm ghost" data-act="showTodayCalendar">Open calendar</button></header>
  <div class="tbl-wrap">${todays.length?`<table><thead><tr><th>Candidate</th><th>Position</th><th>Type</th><th>Time</th><th>Interviewer</th><th>Status</th></tr></thead><tbody>${todays.map(i=>{const a=getA(i.appId),c=getC(a.cid),st=intStatus(i);return `<tr class="click" data-int="${i.id}"><td><div class="who">${av(c.name)}<div><b>${esc(c.name)}</b></div></div></td><td>${esc(getOp(a.opId).title)}</td><td>${i.kind==='Group'?'<span class="pill cyan">Group</span>':esc(i.round)}</td><td>${fmtT(i.time)}</td><td>${esc(i.interviewers.join(', '))}</td><td><span class="pill ${INT_COLOR[st]}">${st}</span></td></tr>`}).join('')}</tbody></table>`:'<div class="empty"><b>No interviews today</b>Schedule one from Interviews.</div>'}</div></section>
  <section class="panel"><header><div><h3>Openings needing attention</h3><p>Low volume, pending feedback or ageing</p></div></header><div>${attention.map(x=>`<div class="list-it click" style="cursor:pointer;align-items:flex-start" data-op="${x.o.id}"><div class="grow"><b>${esc(x.o.title)}</b> <span class="muted small">${x.o.id}</span><div style="margin-top:4px">${x.flags.map(f=>`<span class="pill ${f[1]}" style="margin:2px 4px 2px 0">${f[0]}</span>`).join('')}</div></div><span class="pill ${OP_COLOR[x.o.status]}">${x.o.status}</span></div>`).join('')||'<div class="empty">All openings are on track.</div>'}</div></section>
 </div>`;
}
function bindDashboard(root){
 const k=[()=>go('openings'),()=>{R.af.status='New';go('applications')},()=>{R.af.status='Shortlisted';go('applications')},()=>{R.calView='day';R.calDate=today();go('interviews')},()=>{R.af.status='Selected';go('applications')},()=>go('offers'),()=>go('onboarding'),()=>go('onboarding')];
 $$('[data-kpi]',root).forEach(el=>{el.onclick=()=>k[el.dataset.kpi]();el.onkeydown=e=>{if(e.key==='Enter')k[el.dataset.kpi]()}});
 $$('[data-int]',root).forEach(el=>el.onclick=()=>interviewDetail(el.dataset.int));
 $$('[data-op]',root).forEach(el=>el.onclick=()=>go('opening',el.dataset.op));
}
