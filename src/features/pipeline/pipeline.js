/* ---------- Recruitment Pipeline Control Center ---------- */
const DEFAULT_SLA={app:2,ai:2,short:2,screen:3,gi:5,pi:7,sel:2,offer:5,onb:10};
const PC_COLS=[
 {k:'app',label:'Application',c:'var(--tx3)',drop:'New',test:a=>a.stage==='New'&&matchA(a).score<S.settings.threshold},
 {k:'ai',label:'AI Matched',c:'var(--ai)',drop:'New',test:a=>a.stage==='New'&&matchA(a).score>=S.settings.threshold},
 {k:'short',label:'Shortlisted',c:'var(--blue)',drop:'Shortlisted',st:['Shortlisted']},
 {k:'screen',label:'Screening Call',c:'var(--blue)',drop:'Screening',st:['Screening']},
 {k:'gi',label:'Group Interview',c:'var(--cyan)',drop:'Group Interview',st:['Group Interview']},
 {k:'pi',label:'Personal Interview',c:'var(--cyan)',drop:'Personal Interview',st:['Personal Interview']},
 {k:'sel',label:'Selected',c:'var(--green)',drop:'Selected',st:['Selected']},
 {k:'offer',label:'Offer',c:'var(--orange)',drop:'Offer',st:['Offer','Offer Accepted']},
 {k:'onb',label:'Onboarding',c:'var(--green)',drop:'Onboarding',st:['Joining','Onboarding']},
 {k:'joined',label:'Joined',c:'var(--green)',drop:'Employee Ready',st:['Employee Ready']},
];
const PARKED={k:'parked',label:'Rejected / On hold',c:'var(--red)',drop:'On Hold',st:['Rejected','On Hold']};
const slaOf=k=>{const s=S.settings.sla||DEFAULT_SLA;return k==='joined'||k==='parked'?null:(s[k]??DEFAULT_SLA[k])};
const colOf=a=>[...PC_COLS,PARKED].find(c=>c.test?c.test(a):c.st.includes(a.stage));
R.pc={q:'',op:'',rec:'',owner:'',min:0,flag:'',focus:'',view:'board',parked:false,tab:'today',sort:'days',dir:-1};

function lastActivityMap(){
 const m={};const nameToApps={};S.applications.forEach(a=>{const n=getC(a.cid).name;(nameToApps[n]=nameToApps[n]||[]).push(a.id)});
 S.activity.forEach(x=>{let ids=x.appId?[x.appId]:[];if(!ids.length)for(const n in nameToApps)if(x.text.includes(n)){ids=nameToApps[n];break}
  ids.forEach(id=>{if(!m[id]||m[id].ts<x.ts)m[id]=x})});return m;
}
function pcInfo(a,lam){
 const col=colOf(a);const days=Math.max(0,daysBetween(a.stageSince||a.date,today()));const sla=slaOf(col.k);
 const ints=intsOfA(a.id).filter(i=>i.status!=='Cancelled');
 const pf=ints.find(i=>intStatus(i)==='Pending Feedback');
 const up=ints.filter(i=>intStatus(i)==='Scheduled').sort((x,y)=>(x.date+x.time).localeCompare(y.date+y.time))[0];
 const of=offerOfA(a.id);
 let pending=true,owner=a.recruiter,reason='',waiting='',due=sla!=null?addDays(sla,parseD(a.stageSince||a.date)):null;
 switch(a.stage){
  case 'New':reason='Review AI match and shortlist';break;
  case 'Shortlisted':reason='Run screening call';break;
  case 'Screening':reason=a.screening&&a.screening.outcome==='Call Back'?'Call back candidate':'Complete screening call';break;
  case 'Group Interview':case 'Personal Interview':
   if(pf){owner=pf.interviewers.join(', ');reason=(pf.kind==='Group'?'Group evaluation':'Scorecard')+' pending';due=pf.date}
   else if(up){pending=false;waiting=`${up.kind==='Group'?'Group interview':up.round+' round'} on ${fmtDs(up.date)}, ${fmtT(up.time)}`}
   else reason=a.stage==='Group Interview'?'Schedule group interview':'Schedule next round';break;
  case 'Selected':reason='Create offer letter';owner=a.recruiter;break;
  case 'Offer':
   if(!of||['Draft','Generated'].includes(of.status))reason=of?'Send offer to candidate':'Create offer letter';
   else if(['Sent','Negotiation'].includes(of.status)){const ds=of.sent?daysBetween(of.sent,today()):0;if(of.status==='Negotiation'){reason='Revise offer after negotiation'}else if(ds>3){reason=`Follow up — offer sent ${ds} days ago`;due=addDays(3,parseD(of.sent))}else{pending=false;owner='Candidate';waiting=`Offer sent ${ds?ds+' day'+(ds>1?'s':'')+' ago':'today'}, awaiting reply`}}
   else if(of.status==='Declined'){reason='Offer declined — close or re-offer'}
   break;
  case 'Offer Accepted':reason='Schedule joining date';break;
  case 'Joining':if(a.joining&&a.joining>today()){pending=false;waiting=`Joins ${fmtDs(a.joining)} (${daysBetween(today(),a.joining)}d)`}else{reason='Confirm day-1 joining';due=a.joining||today()}break;
  case 'Onboarding':{const o=S.onboarding.find(x=>x.appId===a.id);const left=o?o.items.filter(i=>!i.done).length:10;reason=left?`${left} onboarding step${left>1?'s':''} left`:'Mark employee ready';owner='HR · '+a.recruiter;break}
  case 'Employee Ready':pending=false;waiting='Joined';break;
  case 'Rejected':pending=false;waiting='Rejected';break;
  case 'On Hold':reason='Decide: reopen or reject';break;
 }
 const stuck=sla!=null&&days>sla;
 const overdue=pending&&(!!pf||(due&&due<today())||(a.stage==='Joining'&&a.joining&&a.joining<today()));
 const isToday=pending&&(overdue||(due&&due<=today()));
 const la=lam[a.id];
 return {a,c:getC(a.cid),o:getOp(a.opId),m:matchA(a),col,days,sla,pending,overdue,stuck,today:isToday,owner,reason,waiting,due,up,pf,of,last:la?{text:la.text,ts:la.ts}:{text:'Stage updated',ts:parseD(a.stageSince||a.date).getTime()}};
}
function pcAll(){const lam=lastActivityMap();return S.applications.map(a=>pcInfo(a,lam))}
function pcFilter(list){
 const f=R.pc;return list.filter(x=>{
  if(!f.parked&&x.col.k==='parked'&&f.focus!=='parked')return false;
  if(f.op&&x.a.opId!==f.op)return false;if(f.rec&&x.a.recruiter!==f.rec)return false;
  if(f.owner&&!x.owner.includes(f.owner))return false;if(x.m.score<f.min)return false;
  if(f.q&&!(x.c.name+x.o.title+x.c.skills.join(' ')+x.a.id).toLowerCase().includes(f.q.toLowerCase()))return false;
  if(f.flag==='action'&&!x.pending)return false;if(f.flag==='overdue'&&!x.overdue)return false;if(f.flag==='stuck'&&!x.stuck)return false;
  if(f.flag==='today'&&!x.today)return false;if(f.flag==='waiting'&&(x.pending||!x.waiting||x.col.k==='joined'||x.col.k==='parked'))return false;
  return true});
}
function daysCls(x){if(x.sla==null)return 'ok';return x.days>x.sla?'bad':x.days>=x.sla?'warn':'ok'}
function pcCard(x){
 const st=x.overdue?'od':x.pending?'pend':x.col.k==='joined'?'done':'wait';
 const flags=[];if(x.overdue)flags.push('<span class="pill red">Overdue</span>');if(x.stuck&&!x.overdue)flags.push('<span class="pill orange">Stuck</span>');if(x.today&&!x.overdue)flags.push('<span class="pill orange">Due today</span>');if(x.pf)flags.push('<span class="pill orange">Feedback pending</span>');
 if(x.a.stage!==x.col.drop&&x.col.k!=='app'&&x.col.k!=='ai')flags.push(stagePill(x.a.stage));
 const [lbl]=nextAction(x.a);
 return `<article class="pcc ${st}" draggable="true" data-pdrag="${x.a.id}" tabindex="0" aria-label="${esc(x.c.name)}, ${esc(x.o.title)}">
 <div class="top">${av(x.c.name)}<div style="min-width:0"><b>${esc(x.c.name)}</b><small title="${esc(x.o.title)}">${esc(x.o.title)}</small></div>${ring(x.m.score)}</div>
 <dl><dt>Experience</dt><dd>${x.c.exp} yrs · ${esc(x.c.location)}</dd><dt>Recruiter</dt><dd>${esc(x.a.recruiter)}</dd>
 <dt>In stage</dt><dd><span class="days ${daysCls(x)}">${x.days} day${x.days===1?'':'s'}</span>${x.sla!=null?`<span class="muted"> / ${x.sla}d SLA</span>`:''}</dd>
 ${x.up?`<dt>Interview</dt><dd>${fmtDs(x.up.date)}, ${fmtT(x.up.time)} · ${esc(x.up.kind==='Group'?'Group':x.up.round)}</dd>`:''}
 <dt>Last activity</dt><dd title="${esc(x.last.text)}">${timeAgo(x.last.ts)}</dd></dl>
 ${flags.length?`<div class="flags">${flags.join('')}</div>`:''}
 <div class="na"><div>${x.pending?`<b>${esc(x.reason)}</b><span class="muted">Owner: ${esc(x.owner)}</span>`:`<b style="font-weight:600;color:var(--tx2)">${esc(x.waiting)}</b><span class="muted">${x.col.k==='joined'?'Complete':'Waiting on '+esc(x.owner==='Candidate'?'candidate':x.up?'interview date':'candidate')}</span>`}</div>
 ${x.col.k!=='joined'?`<button class="btn sm ${x.pending?(x.overdue?'pri':''):'ghost'}" data-next="${x.a.id}">${esc(lbl)}</button>`:''}</div></article>`;
}
function vPipeline(){
 const all=pcAll();const active=all.filter(x=>x.col.k!=='parked');const T=S.settings.threshold;
 const f=R.pc;const list=pcFilter(all);
 const cnt=k=>active.filter(x=>x.col.k===k).length;
 const kpis=[['openings','Total openings',S.openings.filter(o=>!['Closed','Filled','Draft'].includes(o.status)).length,`${S.openings.reduce((s,o)=>s+(['Closed','Filled','Draft'].includes(o.status)?0:o.positions),0)} positions`],
  ['','Total applications',all.length,`${all.filter(x=>x.col.k==='parked').length} parked`],
  ['ai','AI matched',cnt('ai'),`≥ ${T}% match`],['short','Shortlisted',cnt('short')],['screen','Screening',cnt('screen')],['gi','Group interview',cnt('gi')],['pi','Personal interview',cnt('pi')],
  ['sel','Selected',cnt('sel')],['offer','Offer',cnt('offer')],['onb','Onboarding',cnt('onb')],['joined','Joined',cnt('joined')]];
 const hot=k=>{const n=active.filter(x=>x.col.k===k&&x.overdue).length;return n?`<em class="hot">${n} overdue</em>`:''};
 const cols=[...PC_COLS,...(f.parked||f.focus==='parked'?[PARKED]:[])];
 const tot=active.length||1;
 const board=`<div class="pc-board" id="pcBoard">${cols.map(col=>{const inCol=list.filter(x=>x.col.k===col.k);const allCol=all.filter(x=>x.col.k===col.k);
  const pend=allCol.filter(x=>x.pending).length,od=allCol.filter(x=>x.overdue).length,sla=slaOf(col.k);
  const ok=allCol.filter(x=>daysCls(x)==='ok').length,wn=allCol.filter(x=>daysCls(x)==='warn').length,bd=allCol.filter(x=>daysCls(x)==='bad').length;
  const avg=allCol.length?(allCol.reduce((s,x)=>s+x.days,0)/allCol.length).toFixed(1):0;
  inCol.sort((p,q)=>(q.overdue-p.overdue)||(q.pending-p.pending)||(q.days-p.days));
  return `<section class="pc-col ${f.focus&&f.focus!=='openings'?(f.focus===col.k?'focus':'dim'):''}" data-pcol="${col.k}" aria-label="${col.label}">
  <div class="pc-head" style="--c:${col.c}"><h4>${col.label.toUpperCase()}<small>${sla!=null?'SLA '+sla+'d':''}</small></h4>
  <div class="pc-count">${allCol.length}<span>candidate${allCol.length===1?'':'s'} · ${col.k==='parked'?'':Math.round(allCol.length/tot*100)+'%'}</span></div>
  <div class="pc-meta">${pend?`<span class="pill orange">${pend} pending action</span>`:'<span class="pill">0 pending</span>'}${od?`<span class="pill red">${od} overdue</span>`:''}</div>
  ${allCol.length&&sla!=null?`<div class="pc-age" title="Within SLA ${ok} · At limit ${wn} · Over SLA ${bd} · Avg ${avg} days"><i style="width:${ok/allCol.length*100}%;background:var(--green)"></i><i style="width:${wn/allCol.length*100}%;background:var(--orange)"></i><i style="width:${bd/allCol.length*100}%;background:var(--red)"></i></div><div class="small muted" style="margin-top:4px">Avg ${avg} days in stage</div>`:''}
  ${inCol.length!==allCol.length?`<div class="small" style="margin-top:4px;color:var(--blue)">Showing ${inCol.length} of ${allCol.length} (filtered)</div>`:''}</div>
  <div class="pc-cards">${inCol.map(pcCard).join('')||`<div class="empty" style="padding:18px 8px;font-size:12px">${allCol.length?'No matches for the filters':'Nobody here'}</div>`}</div></section>`}).join('')}</div>`;
 const th=(k,l)=>`<th class="sort" data-psort="${k}">${l}${f.sort===k?(f.dir>0?' ▲':' ▼'):''}</th>`;
 const key={days:x=>x.days,match:x=>x.m.score,name:x=>x.c.name,stage:x=>PC_COLS.findIndex(c=>c.k===x.col.k),owner:x=>x.owner,last:x=>x.last.ts}[f.sort];
 const sorted=[...list].sort((p,q)=>{const a=key(p),b=key(q);return (a>b?1:a<b?-1:0)*f.dir});
 const table=`<section class="panel"><div class="tbl-wrap"><table><thead><tr>${th('name','Candidate')}<th>Opening</th>${th('stage','Stage')}${th('match','AI match')}${th('days','Days in stage')}${th('last','Last activity')}<th>Next action</th>${th('owner','Owner')}<th>Interview</th><th>Status</th><th></th></tr></thead><tbody>
  ${sorted.map(x=>`<tr class="click" data-pcand="${x.c.id}"><td><div class="who">${av(x.c.name)}<div><b>${esc(x.c.name)}</b><small>${x.c.exp} yrs · ${esc(x.a.recruiter)}</small></div></div></td><td>${esc(x.o.title)}</td><td>${stagePill(x.a.stage)}</td><td>${ring(x.m.score)}</td>
  <td><span class="days ${daysCls(x)}">${x.days}d</span>${x.sla!=null?`<span class="muted small"> / ${x.sla}d</span>`:''}</td><td class="small" title="${esc(x.last.text)}">${timeAgo(x.last.ts)}</td>
  <td class="wrap small" style="min-width:170px">${esc(x.pending?x.reason:x.waiting)}</td><td class="small">${esc(x.owner)}</td><td class="small">${x.up?fmtDs(x.up.date)+', '+fmtT(x.up.time):'—'}</td>
  <td>${x.overdue?'<span class="pill red">Overdue</span>':x.stuck?'<span class="pill orange">Stuck</span>':x.pending?'<span class="pill orange">Action</span>':x.col.k==='joined'?'<span class="pill green">Joined</span>':'<span class="pill blue">Waiting</span>'}</td><td>${x.col.k!=='joined'?nextBtn(x.a):''}</td></tr>`).join('')}
 </tbody></table>${sorted.length?'':'<div class="empty"><b>No candidates match</b>Clear a filter to see more.</div>'}</div></section>`;
 const opt=(arr,v,all)=>`<option value="">${all}</option>`+arr.map(x=>`<option value="${esc(x[0])}" ${x[0]===v?'selected':''}>${esc(x[1])}</option>`).join('');
 const owners=[...new Set(all.filter(x=>x.pending).flatMap(x=>x.owner.replace('HR · ','').split(', ')))].sort();
 const flags=[['','Everyone'],['today','Needs action today'],['overdue','Overdue'],['stuck','Stuck over SLA'],['action','Any pending action'],['waiting','Waiting on others']];
 const anyF=f.q||f.op||f.rec||f.owner||f.min||f.flag||f.focus;
 return `<div class="page-h"><div><h1>Pipeline control center</h1><p>${active.length} candidates in play · <b style="color:var(--orange)">${active.filter(x=>x.today).length} need action today</b> · <b style="color:var(--red)">${active.filter(x=>x.overdue).length} overdue</b> · ${active.filter(x=>x.stuck).length} stuck over SLA</p></div>
 <div class="row"><button class="btn" id="pcSla">SLA rules</button><div class="seg"><button class="${f.view==='board'?'on':''}" data-pv="board">${ic('board','style="width:14px;vertical-align:-2px"')} Board</button><button class="${f.view==='table'?'on':''}" data-pv="table">${ic('list','style="width:14px;vertical-align:-2px"')} Table</button></div></div></div>
 <div class="pc-kpis" role="toolbar" aria-label="Pipeline filters">${kpis.map(k=>`<button class="pc-kpi ${f.focus===k[0]&&(k[0]||!anyF)?'on':''}" data-pk="${k[0]}"><span>${k[1]}</span><b>${k[2]}</b>${hot(k[0])||(k[3]?`<em>${k[3]}</em>`:'<em>&nbsp;</em>')}</button>`).join('')}</div>
 <section class="panel" style="margin-bottom:12px"><div class="filters" style="border-bottom:none">
  <input class="inp" id="pcq" placeholder="Search candidate, opening, skill" value="${esc(f.q)}" style="min-width:210px">
  <select class="inp" data-pf="flag">${flags.map(x=>`<option value="${x[0]}" ${x[0]===f.flag?'selected':''}>${x[1]}</option>`).join('')}</select>
  <select class="inp" data-pf="op">${opt(S.openings.map(o=>[o.id,o.title]),f.op,'All openings')}</select>
  <select class="inp" data-pf="rec">${opt(RECRUITERS.map(s=>[s,s]),f.rec,'All recruiters')}</select>
  <select class="inp" data-pf="owner">${opt(owners.map(s=>[s,s]),f.owner,'Any action owner')}</select>
  <label class="small" style="display:flex;align-items:center;gap:6px;color:var(--tx2)">Match ≥ <input type="range" min="0" max="95" step="5" data-pf="min" value="${f.min}" style="width:80px;accent-color:var(--ai)"><b>${f.min}%</b></label>
  <label class="small" style="display:flex;align-items:center;gap:6px;color:var(--tx2)"><input type="checkbox" class="chk" id="pcParked" ${f.parked?'checked':''}>Show rejected &amp; on hold</label>
  ${anyF?'<button class="btn sm ghost" id="pcClear">Clear filters</button>':''}
  <span class="grow"></span><span class="small muted">Drag a card to another stage to move it</span></div></section>
 ${f.view==='board'?board:table}
 ${actionCenter(all)}`;
}
function actionCenter(all){
 const active=all.filter(x=>x.col.k!=='parked');const T=R.pc.tab;
 const todayList=active.filter(x=>x.today).sort((a,b)=>(b.overdue-a.overdue)||(b.days-a.days));
 const stuck=active.filter(x=>x.stuck).sort((a,b)=>(b.days-b.sla)-(a.days-a.sla));
 const upInts=S.interviews.filter(i=>intStatus(i)==='Scheduled'&&i.date>=today()&&i.date<=addDays(7)).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
 const fb=S.interviews.filter(i=>intStatus(i)==='Pending Feedback');
 const offers=S.offers.filter(o=>['Draft','Generated','Sent','Negotiation'].includes(o.status));
 const joining=S.applications.filter(a=>['Offer Accepted','Joining'].includes(a.stage)).sort((a,b)=>(a.joining||'9').localeCompare(b.joining||'9'));
 const opsLow=S.openings.filter(o=>!['Closed','Filled','Draft'].includes(o.status)).map(o=>{const ap=appsOfOp(o.id);const act=ap.filter(a=>!['Rejected','On Hold','Employee Ready'].includes(a.stage)).length;const need=o.positions*4;const wk=ap.filter(a=>a.date>=addDays(-7)).length;return {o,act,need,cov:Math.round(act/need*100),wk,strong:ap.filter(a=>matchA(a).score>=S.settings.threshold&&a.stage!=='Rejected').length}}).filter(x=>x.cov<100).sort((a,b)=>a.cov-b.cov);
 const tabs=[['today','Action today',todayList.length],['stuck','Stuck',stuck.length],['interviews','Interviews pending',upInts.length],['feedback','Awaiting feedback',fb.length],['offers','Offers pending',offers.length],['joining','Joining soon',joining.length],['openings','Low pipeline',opsLow.length]];
 const who=(c,sub)=>`<div class="who">${av(c.name)}<div><b>${esc(c.name)}</b><small>${esc(sub)}</small></div></div>`;
 const tbl=(head,rows,empty)=>rows.length?`<div class="tbl-wrap"><table><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`:`<div class="empty"><b>${empty}</b></div>`;
 let body='';
 if(T==='today')body=tbl(['Candidate','Stage','Why','Owner','Due',''],todayList.map(x=>`<tr class="click" data-pcand="${x.c.id}"><td>${who(x.c,x.o.title)}</td><td>${stagePill(x.a.stage)}</td><td class="wrap small">${esc(x.reason)}</td><td class="small">${esc(x.owner)}</td><td>${x.overdue?`<span class="pill red">${x.due?daysBetween(x.due,today())+'d late':'Late'}</span>`:'<span class="pill orange">Today</span>'}</td><td>${nextBtn(x.a)}</td></tr>`),'Nothing needs action today');
 if(T==='stuck')body=tbl(['Candidate','Stage','Days in stage','SLA','Over by','Owner',''],stuck.map(x=>`<tr class="click" data-pcand="${x.c.id}"><td>${who(x.c,x.o.title)}</td><td>${stagePill(x.a.stage)}</td><td><span class="days bad">${x.days}d</span></td><td>${x.sla}d</td><td><b>${x.days-x.sla}d</b></td><td class="small">${esc(x.owner)}</td><td>${nextBtn(x.a)}</td></tr>`),'No one is stuck past their SLA');
 if(T==='interviews')body=tbl(['When','Candidate','Round','Interviewer','Invitation'],upInts.map(i=>{const a=getA(i.appId),c=getC(a.cid);return `<tr class="click" data-pint="${i.id}"><td><b>${i.date===today()?'Today':fmtDs(i.date)}</b> ${fmtT(i.time)}</td><td>${who(c,getOp(a.opId).title)}</td><td>${i.kind==='Group'?'<span class="pill cyan">Group</span>':esc(i.round)}</td><td class="small">${esc(i.interviewers.join(', '))}</td><td><span class="pill ${i.invite==='Confirmed'?'green':i.invite==='Declined'?'red':'blue'}">${i.invite}</span></td></tr>`}),'No interviews in the next 7 days');
 if(T==='feedback')body=tbl(['Candidate','Round','Held on','Waiting','Interviewer',''],fb.map(i=>{const a=getA(i.appId),c=getC(a.cid);return `<tr class="click" data-pint="${i.id}"><td>${who(c,getOp(a.opId).title)}</td><td>${i.kind==='Group'?'Group':esc(i.round)}</td><td>${fmtDs(i.date)}</td><td><span class="pill ${daysBetween(i.date,today())>1?'red':'orange'}">${Math.max(0,daysBetween(i.date,today()))}d</span></td><td class="small">${esc(i.interviewers.join(', '))}</td><td><button class="btn sm pri" data-peval="${i.id}">Evaluate</button></td></tr>`}),'All feedback is in');
 if(T==='offers')body=tbl(['Candidate','Designation','CTC','Status','Age',''],offers.map(o=>{const a=getA(o.appId),c=getC(a.cid);const age=daysBetween(o.sent||o.created,today());return `<tr class="click" data-poffer="${o.id}"><td>${who(c,o.dept)}</td><td>${esc(o.designation)}</td><td>${inr(o.ctc)}</td><td><span class="pill ${OFFER_COLOR[o.status]}">${o.status}</span></td><td><span class="${age>3?'days bad':''}">${age}d</span></td><td>${nextBtn(a)}</td></tr>`}),'No offers pending');
 if(T==='joining')body=tbl(['Candidate','Position','Joining date','Countdown','Documents',''],joining.map(a=>{const c=getC(a.cid);const dl=a.joining?daysBetween(today(),a.joining):null;const docs=c.documents.filter(d=>d.status!=='Pending').length;return `<tr class="click" data-pcand="${c.id}"><td>${who(c,a.stage)}</td><td>${esc(getOp(a.opId).title)}</td><td>${fmtD(a.joining)}</td><td>${dl==null?'<span class="pill orange">Not set</span>':dl<0?`<span class="pill red">${-dl}d overdue</span>`:dl===0?'<span class="pill green">Today</span>':dl+' days'}</td><td>${docs}/${c.documents.length}</td><td>${nextBtn(a)}</td></tr>`}),'No one is joining soon');
 if(T==='openings')body=tbl(['Opening','Positions','Active pipeline','Target','Coverage','Strong matches','New this week',''],opsLow.map(x=>`<tr class="click" data-pop="${x.o.id}"><td><b>${esc(x.o.title)}</b><div class="muted small">${x.o.id} · ${esc(x.o.recruiter)}</div></td><td>${x.o.positions}</td><td>${x.act}</td><td>${x.need}</td><td><div class="row" style="flex-wrap:nowrap"><div class="bar" style="width:70px"><i style="width:${Math.min(100,x.cov)}%;background:${x.cov<40?'var(--red)':'var(--orange)'}"></i></div><b style="color:${x.cov<40?'var(--red)':'var(--orange)'}">${x.cov}%</b></div></td><td>${x.strong}</td><td>${x.wk}</td><td><button class="btn sm" data-psrc="${x.o.id}">Add candidates</button></td></tr>`),'Every opening has enough candidates');
 // owner workload
 const load={};active.filter(x=>x.pending).forEach(x=>x.owner.replace('HR · ','').split(', ').forEach(o=>{load[o]=load[o]||{p:0,od:0};load[o].p++;if(x.overdue)load[o].od++}));
 const wl=Object.entries(load).sort((a,b)=>b[1].od-a[1].od||b[1].p-a[1].p);const mx=Math.max(1,...wl.map(w=>w[1].p));
 return `<div class="pc-lower" id="pcAction"><section class="panel"><header><div><h3>Action center</h3><p>Everything that needs a person to move it forward</p></div></header>
 <div class="pc-tabs" role="tablist">${tabs.map(t=>`<button class="${T===t[0]?'on':''}" data-ptab="${t[0]}">${t[1]}<span class="ct">${t[2]}</span></button>`).join('')}</div>${body}</section>
 <section class="panel"><header><div><h3>Who owns the next action</h3><p>Pending actions per person · red is overdue</p></div></header>
 <div class="wl small muted" style="font-weight:600;border-bottom:1px solid var(--line)"><span>Owner</span><span>Load</span><span>Open</span><span>Late</span></div>
 ${wl.map(([o,v])=>`<div class="wl" data-powner="${esc(o)}" style="cursor:pointer" title="Filter the pipeline to ${esc(o)}"><div class="who" style="min-width:0">${av(o)}<b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o)}</b></div><div class="bar"><i style="width:${(v.p-v.od)/mx*100}%;background:var(--orange)"></i><i style="width:${v.od/mx*100}%;background:var(--red)"></i></div><b>${v.p}</b><b style="color:${v.od?'var(--red)':'var(--tx3)'}">${v.od}</b></div>`).join('')||'<div class="empty">No pending actions</div>'}
 </section></div>`;
}
function bindPipeline(root){
 const f=R.pc;
 const q=$('#pcq',root);q.oninput=()=>{f.q=q.value;const p=q.selectionStart;render();const n=$('#pcq');n.focus();n.setSelectionRange(p,p)};
 $$('[data-pf]',root).forEach(el=>el.onchange=()=>{f[el.dataset.pf]=el.type==='range'?+el.value:el.value;render()});
 $('#pcParked',root).onchange=e=>{f.parked=e.target.checked;render()};
 const cl=$('#pcClear',root);if(cl)cl.onclick=()=>{Object.assign(f,{q:'',op:'',rec:'',owner:'',min:0,flag:'',focus:''});render()};
 $$('[data-pv]',root).forEach(b=>b.onclick=()=>{f.view=b.dataset.pv;render()});
 $$('[data-pk]',root).forEach(b=>b.onclick=()=>{const k=b.dataset.pk;
  if(k==='openings'){f.focus='openings';f.tab='openings';render();$('#pcAction').scrollIntoView({behavior:'smooth'});return}
  if(!k){Object.assign(f,{focus:'',flag:'',q:'',op:'',rec:'',owner:'',min:0});render();return}
  f.focus=f.focus===k?'':k;render();
  const col=$(`[data-pcol="${f.focus}"]`);if(col&&f.view==='board')col.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'})});
 $$('[data-ptab]',root).forEach(b=>b.onclick=()=>{f.tab=b.dataset.ptab;render()});
 $$('[data-powner]',root).forEach(el=>el.onclick=()=>{f.owner=el.dataset.powner;f.flag='action';render();$('#content').scrollTo({top:0,behavior:'smooth'})});
 $('#pcSla',root).onclick=slaModal;
 $$('[data-psort]',root).forEach(t=>t.onclick=()=>{const k=t.dataset.psort;if(f.sort===k)f.dir*=-1;else{f.sort=k;f.dir=k==='name'||k==='owner'?1:-1}render()});
 $$('[data-pcand]',root).forEach(el=>el.onclick=e=>{if(e.target.closest('button'))return;go('candidate',el.dataset.pcand)});
 $$('[data-pint]',root).forEach(el=>el.onclick=e=>{if(e.target.closest('button'))return;interviewDetail(el.dataset.pint)});
 $$('[data-peval]',root).forEach(b=>b.onclick=e=>{e.stopPropagation();const i=S.interviews.find(x=>x.id===b.dataset.peval);i.kind==='Group'?groupEval(i.groupId):piScorecard(i.id)});
 $$('[data-poffer]',root).forEach(el=>el.onclick=e=>{if(e.target.closest('button'))return;offerEditor(el.dataset.poffer)});
 $$('[data-pop]',root).forEach(el=>el.onclick=e=>{if(e.target.closest('button'))return;go('opening',el.dataset.pop)});
 $$('[data-psrc]',root).forEach(b=>b.onclick=e=>{e.stopPropagation();addCandidate(b.dataset.psrc)});
 bindNext(root);
 // cards: open, keyboard, drag
 $$('[data-pdrag]',root).forEach(k=>{
  k.onclick=e=>{if(e.target.closest('button'))return;go('candidate',getA(k.dataset.pdrag).cid)};
  k.onkeydown=e=>{if(e.key==='Enter'&&e.target===k)go('candidate',getA(k.dataset.pdrag).cid)};
  k.ondragstart=e=>{e.dataTransfer.setData('text/plain',k.dataset.pdrag);k.classList.add('drag')};k.ondragend=()=>k.classList.remove('drag')});
 $$('[data-pcol]',root).forEach(col=>{col.ondragover=e=>{e.preventDefault();col.classList.add('over')};col.ondragleave=e=>{if(!col.contains(e.relatedTarget))col.classList.remove('over')};
  col.ondrop=e=>{e.preventDefault();col.classList.remove('over');const id=e.dataTransfer.getData('text/plain');if(!id)return;const target=[...PC_COLS,PARKED].find(c=>c.k===col.dataset.pcol);const a=getA(id);
   if(target.st&&target.st.includes(a.stage))return;if((target.k==='app'||target.k==='ai')&&a.stage==='New')return;
   if(target.k==='onb')ensureOnboardingChecklist(id);
   setStage(id,target.drop)}});
}
function slaModal(){
 const s={...DEFAULT_SLA,...(S.settings.sla||{})};
 modal({title:'Stage SLA rules',body:`<p style="margin-top:0" class="muted">How many days a candidate can sit in each stage before they count as stuck. Pending actions past the SLA show as overdue.</p>
 <div class="fgrid">${PC_COLS.filter(c=>c.k!=='joined').map(c=>`<label class="f">${c.label}<div class="row" style="flex-wrap:nowrap"><input class="inp" type="number" min="0" max="60" data-sla="${c.k}" value="${s[c.k]}"><span class="small muted">days</span></div></label>`).join('')}</div>`,
 foot:`<button class="btn ghost" id="slaDef">Restore defaults</button><span class="grow"></span><button class="btn" data-close>Cancel</button><button class="btn pri" id="slaSave">Save rules</button>`,
 onMount:el=>{$('#slaDef',el).onclick=()=>$$('[data-sla]',el).forEach(i=>i.value=DEFAULT_SLA[i.dataset.sla]);
  $('#slaSave',el).onclick=()=>{const rules={};$$('[data-sla]',el).forEach(i=>rules[i.dataset.sla]=Math.max(0,+i.value||0));saveSla(rules);closeModal();toast('SLA rules saved');render()}}});
}
VIEWS.pipeline=[vPipeline,bindPipeline];
addNav(['pipeline','Pipeline control','board'],'dashboard');
