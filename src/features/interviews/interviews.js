/* Interviews page, calendar and detail */
/* ---------- interviews page ---------- */
function intTable(l){
 if(!l.length)return '<div class="empty"><b>No interviews yet</b>Schedule one to see it here.</div>';
 return `<div class="tbl-wrap"><table><thead><tr><th>Candidate</th><th>Opening</th><th>Round</th><th>Date</th><th>Interviewer</th><th>Mode</th><th>Status</th><th>Result</th><th></th></tr></thead><tbody>${l.sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time)).map(i=>{const a=getA(i.appId),c=getC(a.cid),st=intStatus(i);
  return `<tr class="click" data-int="${i.id}"><td><div class="who">${av(c.name)}<b>${esc(c.name)}</b></div></td><td>${esc(getOp(a.opId).title)}</td><td>${i.kind==='Group'?'<span class="pill cyan">Group</span>':esc(i.round)}</td><td>${fmtDs(i.date)}, ${fmtT(i.time)}</td><td>${esc(i.interviewers.join(', '))}</td><td>${esc(i.mode)}</td><td><span class="pill ${INT_COLOR[st]}">${st}</span></td><td class="small">${esc(i.decision||i.rec||'—')}</td>
  <td>${st==='Pending Feedback'||(st==='Scheduled'&&i.date<=today())?`<button class="btn sm" data-eval="${i.id}">Evaluate</button>`:''}</td></tr>`}).join('')}</tbody></table></div>`;
}
function bindIntTable(root){$$('[data-int]',root).forEach(el=>el.onclick=e=>{if(e.target.closest('button'))return;interviewDetail(el.dataset.int)});$$('[data-eval]',root).forEach(b=>b.onclick=e=>{e.stopPropagation();const i=S.interviews.find(x=>x.id===b.dataset.eval);i.kind==='Group'?groupEval(i.groupId):piScorecard(i.id)})}
function interviewDetail(iid){
 const i=S.interviews.find(x=>x.id===iid),a=getA(i.appId),c=getC(a.cid),o=getOp(a.opId),st=intStatus(i);
 modal({title:`${i.kind==='Group'?'Group interview':esc(i.round)+' interview'}`,body:`<div class="row" style="margin-bottom:14px">${av(c.name)}<div class="grow"><b>${esc(c.name)}</b><div class="muted small">${esc(o.title)}</div></div><span class="pill ${INT_COLOR[st]}">${st}</span></div>
 <dl class="kv">${[['When',fmtD(i.date)+', '+fmtT(i.time)+' · '+i.duration+' min'],['Mode',i.mode],['Link / location',i.link||i.location||'—'],['Interviewers',i.interviewers.join(', ')],['Invitation',i.invite]].map(r=>`<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}
 ${i.scores?`<dt>Scores</dt><dd>${(i.kind==='Group'?GI_CRIT:PI_CRIT).map((cr,k)=>`${cr}: <b>${i.scores[k]||'–'}</b>`).join(' · ')}</dd><dt>Result</dt><dd>${esc(i.decision||i.rec)}</dd><dt>Feedback</dt><dd>${esc(i.feedback||'—')}</dd>`:''}</dl>`,
 foot:`${st!=='Cancelled'&&st!=='Completed'&&st!=='No-show'?'<button class="btn bad" id="iCan">Cancel</button><button class="btn" id="iNs">No-show</button>':''}<span class="grow"></span><button class="btn" id="iProf">Open profile</button>${i.kind==='Group'?'<button class="btn" id="iGrp">Group details</button>':''}${st!=='Cancelled'?`<button class="btn pri" id="iEv">${st==='Completed'?'Edit evaluation':'Evaluate'}</button>`:''}`,
 onMount:el=>{const b=(s,f)=>{const x=$(s,el);if(x)x.onclick=f};
  b('#iNs',()=>{markNoShow(i.id);closeModal();toast('Marked as no-show','var(--red)');refresh()});
  b('#iCan',()=>{cancelInterview(i.id);closeModal();toast('Interview cancelled','var(--red)');refresh()});
  b('#iProf',()=>{closeModal();go('candidate',c.id)});b('#iGrp',()=>{closeModal();groupDetail(i.groupId)});
  b('#iEv',()=>{closeModal();i.kind==='Group'?groupEval(i.groupId):piScorecard(i.id)})}});
}
function vInterviews(){
 const tabs=[['calendar','Calendar'],['list','All interviews'],['groups','Group interviews'],['feedback','Pending feedback']];
 let body='';
 if(R.intTab==='calendar')body=calendarHTML();
 else if(R.intTab==='list')body=`<section class="panel">${intTable([...S.interviews])}</section>`;
 else if(R.intTab==='feedback')body=`<section class="panel">${intTable(S.interviews.filter(i=>intStatus(i)==='Pending Feedback'))}</section>`;
 else body=`<div class="grid g2">${S.groups.slice().reverse().map(g=>{const o=getOp(g.opId),ints=S.interviews.filter(i=>i.groupId===g.id);const conf=ints.filter(i=>i.invite==='Confirmed').length;const cancelled=ints.every(i=>i.status==='Cancelled');
  return `<section class="panel"><header><div><h3>${esc(o.title)}</h3><p>${fmtD(g.date)}, ${fmtT(g.time)} · ${esc(g.mode)} · ${ints.length} candidates</p></div><span class="pill ${cancelled?'red':g.evaluated?'green':'blue'}">${cancelled?'Cancelled':g.evaluated?'Evaluated':'Scheduled'}</span></header>
  <div class="pbody"><div class="row" style="margin-bottom:10px">${['Confirmed','Sent','Pending','Declined'].map(s=>{const n=ints.filter(i=>i.invite===s).length;return n?`<span class="pill ${s==='Confirmed'?'green':s==='Declined'?'red':s==='Sent'?'blue':'orange'}">${n} ${s.toLowerCase()}</span>`:''}).join('')}</div>
  <div>${ints.map(i=>{const c=getC(getA(i.appId).cid);return `<span title="${esc(c.name)}" style="margin-right:-6px;display:inline-block;border:2px solid var(--surface);border-radius:50%">${av(c.name)}</span>`}).join('')}</div>
  <div class="row" style="margin-top:12px"><button class="btn sm" data-gd="${g.id}">Invitations</button>${cancelled?'':`<button class="btn sm pri" data-ge="${g.id}">${g.evaluated?'Review evaluation':'Evaluate'}</button>`}<span class="muted small">${conf}/${ints.length} confirmed · ${esc(g.interviewers.join(', '))}</span></div></div></section>`}).join('')||'<div class="empty"><b>No group interviews yet</b>Select several shortlisted candidates and schedule one.</div>'}</div>`;
 return `<div class="page-h"><div><h1>Interviews</h1><p>${S.interviews.filter(i=>i.status==='Scheduled'&&i.date>=today()).length} upcoming · ${S.interviews.filter(i=>intStatus(i)==='Pending Feedback').length} awaiting feedback</p></div>
 <div class="row"><button class="btn" onclick="scheduleGI()">${ic('users')}Group interview</button><button class="btn pri" onclick="schedulePI()">${ic('plus')}Personal interview</button></div></div>
 <div class="tabs">${tabs.map(t=>`<button class="${R.intTab===t[0]?'on':''}" data-it="${t[0]}">${t[1]}</button>`).join('')}</div>${body}`;
}
function calendarHTML(){
 const d=parseD(R.calDate);const v=R.calView;
 const evs=day=>S.interviews.filter(i=>i.date===day).sort((a,b)=>a.time.localeCompare(b.time));
 const chip=i=>{const a=getA(i.appId),c=getC(a.cid),st=intStatus(i);const cls=st==='Pending Feedback'?'s-Pending':'s-'+st;return `<button class="ev ${cls}" data-ev="${i.id}" title="${esc(c.name)} · ${esc(getOp(a.opId).title)} · ${esc(i.round)} · ${esc(i.interviewers.join(', '))} · ${st}"><b>${fmtT(i.time)}</b> ${esc(c.name)}${v!=='month'?`<br><span class="muted">${esc(getOp(a.opId).title)} · ${i.kind==='Group'?'Group':esc(i.round)}<br>${esc(i.interviewers.join(', '))}</span>`:''}</button>`};
 let title='',grid='';
 if(v==='month'){const first=new Date(d.getFullYear(),d.getMonth(),1);const start=new Date(first);start.setDate(1-((first.getDay()+6)%7));title=MONTHS[d.getMonth()]+' '+d.getFullYear();
  grid=`<div class="cal-month">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<div class="hd">${x}</div>`).join('')}${Array.from({length:42},(_,k)=>{const x=new Date(start);x.setDate(start.getDate()+k);const s=iso(x);const e=evs(s);return `<div class="${x.getMonth()!==d.getMonth()?'off':''} ${s===today()?'today':''}"><span class="dn">${x.getDate()}</span>${e.slice(0,3).map(chip).join('')}${e.length>3?`<button class="ev" data-day="${s}" style="background:none;border-left-color:transparent">+${e.length-3} more</button>`:''}</div>`}).join('')}</div>`}
 else if(v==='week'){const start=new Date(d);start.setDate(d.getDate()-((d.getDay()+6)%7));const end=new Date(start);end.setDate(start.getDate()+6);title=`${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
  grid=`<div class="cal-week">${Array.from({length:7},(_,k)=>{const x=new Date(start);x.setDate(start.getDate()+k);const s=iso(x);return `<div class="dcol ${s===today()?'today':''}"><div style="font-weight:700;font-size:13px;margin-bottom:6px;cursor:pointer" data-day="${s}">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][k]} ${x.getDate()}</div>${evs(s).map(chip).join('')||'<div class="muted small">—</div>'}</div>`}).join('')}</div>`}
 else {title=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()]+', '+fmtD(R.calDate);const e=evs(R.calDate);
  grid=Array.from({length:11},(_,k)=>{const h=9+k;const inH=e.filter(i=>+i.time.split(':')[0]===h);return `<div class="slot"><span>${fmtT(pad(h)+':00')}</span><div>${inH.map(chip).join('')}</div></div>`}).join('')}
 return `<section class="panel"><header><div class="row"><button class="btn sm" data-nav="-1" aria-label="Previous">‹</button><button class="btn sm" data-nav="0">Today</button><button class="btn sm" data-nav="1" aria-label="Next">›</button><h3 style="margin-left:8px">${title}</h3></div>
 <div class="row"><span class="row small muted" style="gap:10px"><span><span class="pill blue">Scheduled</span></span><span class="pill green">Completed</span><span class="pill orange">Pending feedback</span><span class="pill red">Cancelled</span></span><div class="seg">${['day','week','month'].map(x=>`<button class="${v===x?'on':''}" data-cv="${x}">${x[0].toUpperCase()+x.slice(1)}</button>`).join('')}</div></div></header><div class="pbody">${grid}</div></section>`;
}
function bindInterviews(root){
 $$('[data-it]',root).forEach(b=>b.onclick=()=>{R.intTab=b.dataset.it;render()});
 $$('[data-cv]',root).forEach(b=>b.onclick=()=>{R.calView=b.dataset.cv;render()});
 $$('[data-nav]',root).forEach(b=>b.onclick=()=>{const n=+b.dataset.nav;if(!n){R.calDate=today()}else{const d=parseD(R.calDate);if(R.calView==='month')d.setMonth(d.getMonth()+n,1);else d.setDate(d.getDate()+n*(R.calView==='week'?7:1));R.calDate=iso(d)}render()});
 $$('[data-ev]',root).forEach(b=>b.onclick=()=>interviewDetail(b.dataset.ev));
 $$('[data-day]',root).forEach(b=>b.onclick=()=>{R.calDate=b.dataset.day;R.calView='day';render()});
 $$('[data-gd]',root).forEach(b=>b.onclick=()=>groupDetail(b.dataset.gd));$$('[data-ge]',root).forEach(b=>b.onclick=()=>groupEval(b.dataset.ge));
 bindIntTable(root);
}
