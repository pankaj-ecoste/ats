/* Openings list, form and detail */
/* ---------- openings ---------- */
"use strict";
let opFilter={q:'',status:''};
function vOpenings(){
 const list=S.openings.filter(o=>(!opFilter.status||o.status===opFilter.status)&&(o.title+o.dept+o.location+o.id).toLowerCase().includes(opFilter.q.toLowerCase()));
 return `<div class="page-h"><div><h1>Openings</h1><p>${S.openings.length} openings, ${S.openings.reduce((s,o)=>s+o.positions,0)} positions in total</p></div><button class="btn pri" data-act="openingForm">${ic('plus')}New opening</button></div>
 <section class="panel"><div class="filters"><input class="inp" id="opq" placeholder="Search title, department, location" value="${esc(opFilter.q)}" style="min-width:240px">
 <div class="seg" role="tablist">${['',...OP_STATUS].map(s=>`<button class="${opFilter.status===s?'on':''}" data-ost="${s}">${s||'All'}</button>`).join('')}</div></div>
 <div class="tbl-wrap"><table><thead><tr><th>Opening</th><th>Department</th><th>Location</th><th>Positions</th><th>Pipeline</th><th>Best match</th><th>Recruiter</th><th>Age</th><th>Priority</th><th>Status</th></tr></thead><tbody>
 ${list.map(o=>{const ap=appsOfOp(o.id);const best=ap.length?Math.max(...ap.map(a=>matchA(a).score)):0;const active=ap.filter(a=>!['Rejected','On Hold'].includes(a.stage)).length;
  return `<tr class="click" data-op="${o.id}"><td><b>${esc(o.title)}</b><div class="muted small">${o.id} · ${o.type}, ${o.expMin}–${o.expMax} yrs</div></td><td>${esc(o.dept)}</td><td>${esc(o.location)} <span class="muted small">${o.mode}</span></td><td>${o.positions}</td><td>${active} active <span class="muted small">/ ${ap.length}</span></td><td>${ap.length?ring(best):'—'}</td><td>${esc(o.recruiter)}</td><td>${daysBetween(o.opened,today())}d</td><td><span class="pill ${o.priority==='Urgent'?'red':o.priority==='High'?'orange':''}">${o.priority}</span></td><td><span class="pill ${OP_COLOR[o.status]}">${o.status}</span></td></tr>`}).join('')}
 </tbody></table>${list.length?'':'<div class="empty"><b>No openings match</b>Clear the filter or create a new opening.</div>'}</div></section>`;
}
function bindOpenings(root){
 const q=$('#opq',root);q.oninput=()=>{opFilter.q=q.value;const p=q.selectionStart;render();const n=$('#opq');n.focus();n.setSelectionRange(p,p)};
 $$('[data-ost]',root).forEach(b=>b.onclick=()=>{opFilter.status=b.dataset.ost;render()});
 $$('[data-op]',root).forEach(el=>el.onclick=()=>go('opening',el.dataset.op));
}
function openingForm(id){
 const o=id?getOp(id):{id:'OP-'+(1000+S.openings.length+1),title:'',dept:'Engineering',positions:1,location:'',mode:'Hybrid',type:'Full-time',expMin:2,expMax:5,salMin:6,salMax:12,education:'Graduate',mandatory:[],preferred:[],desc:'',resp:'',req:'',recruiter:S.settings.user,manager:interviewers()[0],opened:today(),target:addDays(45),priority:'Medium',status:'Open'};
 const sel=(n,opts,v)=>`<select class="inp" name="${n}">${opts.map(x=>`<option ${x==v?'selected':''}>${x}</option>`).join('')}</select>`;
 modal({title:id?'Edit opening':'New opening',size:'w',body:`<form id="opF" class="fgrid g3f">
 <label class="f">Opening ID<input class="inp" name="id" value="${o.id}" readonly></label>
 <label class="f" style="grid-column:span 2">Job title<input class="inp" name="title" value="${esc(o.title)}" required placeholder="e.g. Customer Success Manager"></label>
 <label class="f">Department${sel('dept',['Engineering','Sales','Product','Analytics','Human Resources','Finance','Operations','Marketing'],o.dept)}</label>
 <label class="f">Number of positions<input class="inp" type="number" min="1" name="positions" value="${o.positions}"></label>
 <label class="f">Location<input class="inp" name="location" value="${esc(o.location)}" placeholder="City or Remote"></label>
 <label class="f">Work mode${sel('mode',['Onsite','Hybrid','Remote'],o.mode)}</label>
 <label class="f">Employment type${sel('type',['Full-time','Contract','Internship','Part-time'],o.type)}</label>
 <label class="f">Education${sel('education',['12th','Graduate','B.Tech','MBA','M.Tech'],o.education)}</label>
 <label class="f">Experience (min–max yrs)<div class="row" style="flex-wrap:nowrap"><input class="inp" type="number" step="0.5" name="expMin" value="${o.expMin}"><input class="inp" type="number" step="0.5" name="expMax" value="${o.expMax}"></div></label>
 <label class="f">Salary range (LPA)<div class="row" style="flex-wrap:nowrap"><input class="inp" type="number" step="0.5" name="salMin" value="${o.salMin}"><input class="inp" type="number" step="0.5" name="salMax" value="${o.salMax}"></div></label>
 <label class="f">Priority${sel('priority',['Low','Medium','High','Urgent'],o.priority)}</label>
 <label class="f" style="grid-column:span 3">Mandatory skills <span class="muted">(comma separated — used by AI match)</span><input class="inp" name="mandatory" value="${esc(o.mandatory.join(', '))}"></label>
 <label class="f" style="grid-column:span 3">Preferred skills<input class="inp" name="preferred" value="${esc(o.preferred.join(', '))}"></label>
 <label class="f" style="grid-column:span 3">Job description<textarea class="inp" name="desc">${esc(o.desc)}</textarea></label>
 <label class="f" style="grid-column:span 3">Responsibilities<textarea class="inp" name="resp">${esc(o.resp)}</textarea></label>
 <label class="f" style="grid-column:span 3">Requirements<textarea class="inp" name="req">${esc(o.req)}</textarea></label>
 <label class="f">Recruiter${sel('recruiter',recruiters(),o.recruiter)}</label>
 <label class="f">Hiring manager${sel('manager',interviewers(),o.manager)}</label>
 <label class="f">Status${sel('status',OP_STATUS,o.status)}</label>
 <label class="f">Opening date<input class="inp" type="date" name="opened" value="${o.opened}"></label>
 <label class="f">Target joining date<input class="inp" type="date" name="target" value="${o.target}"></label>
 </form><div style="margin-top:12px"><button class="btn sm aib" id="genJD">${ic('ai')}Draft description with AI</button></div>`,
 foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="opSave">${id?'Save changes':'Create opening'}</button>`,
 onMount:el=>{
  $('#opF',el).onsubmit=e=>e.preventDefault();
  $('#genJD',el).onclick=()=>{const f=$('#opF',el);const t=f.title.value||'this role';const m=f.mandatory.value||'the core skills';
   f.desc.value=`We're hiring a ${t} to join our ${f.dept.value} team in ${f.location.value||'our office'}. You'll work closely with the hiring manager to deliver measurable outcomes from your first quarter.`;
   f.resp.value=`Own day-to-day delivery for the ${f.dept.value} function.\nCollaborate with cross-functional partners.\nApply ${m} to solve real customer problems.\nReport progress weekly and improve processes.`;
   f.req.value=`${f.expMin.value}–${f.expMax.value} years of relevant experience.\nHands-on with ${m}.\n${f.education.value} or equivalent.`;toast('Description drafted. Review before saving.','var(--ai)')};
  $('#opSave',el).onclick=()=>{const f=$('#opF',el);if(!f.title.value.trim()){f.title.focus();toast('Add a job title to continue','var(--red)');return}
   const d=Object.fromEntries(new FormData(f));['positions','expMin','expMax','salMin','salMax'].forEach(k=>d[k]=+d[k]);
   d.mandatory=d.mandatory.split(',').map(s=>s.trim()).filter(Boolean);d.preferred=d.preferred.split(',').map(s=>s.trim()).filter(Boolean);
   saveOpening(d,id);closeModal();toast(id?'Opening saved':'Opening created');id?refresh():go('opening',d.id)}}});
}
function vOpening(){
 const o=getOp(R.param);if(!o)return '<div class="empty">Opening not found.</div>';
 const ap=appsOfOp(o.id);const tabs=['overview','applications','shortlisted','interviews','offers','posting','analytics','activity'];
 let body='';
 if(R.tab==='overview')body=`<div class="grid g2"><section class="panel"><header><h3>Details</h3><button class="btn sm" data-act="openingForm" data-a1="${o.id}">${ic('edit')}Edit</button></header><div class="pbody"><dl class="kv">
  ${[['Department',o.dept],['Positions',o.positions],['Location',o.location+' ('+o.mode+')'],['Employment type',o.type],['Experience',o.expMin+'–'+o.expMax+' years'],['Salary range',lpa(o.salMin)+' – '+lpa(o.salMax)],['Education',o.education],['Recruiter',o.recruiter],['Hiring manager',o.manager],['Opened',fmtD(o.opened)],['Target joining',fmtD(o.target)],['Priority',o.priority]].map(r=>`<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}
  </dl><div style="margin-top:14px"><div class="small muted" style="margin-bottom:4px">Mandatory skills</div>${o.mandatory.map(s=>`<span class="tag">${esc(s)}</span>`).join('')}<div class="small muted" style="margin:10px 0 4px">Preferred skills</div>${o.preferred.map(s=>`<span class="tag">${esc(s)}</span>`).join('')}</div></div></section>
  <section class="panel"><header><h3>Job description</h3></header><div class="pbody"><p style="margin-top:0">${esc(o.desc)}</p><h4 style="margin:14px 0 4px">Responsibilities</h4><p style="white-space:pre-line;margin:0">${esc(o.resp)}</p><h4 style="margin:14px 0 4px">Requirements</h4><p style="white-space:pre-line;margin:0">${esc(o.req)}</p></div></section></div>`;
 else if(R.tab==='applications'||R.tab==='shortlisted'){const l=R.tab==='shortlisted'?ap.filter(a=>a.maxStage>=1&&a.stage!=='Rejected'):ap;body=`<section class="panel">${appTable(l,true)}</section>`}
 else if(R.tab==='interviews'){const l=S.interviews.filter(i=>ap.some(a=>a.id===i.appId));body=`<section class="panel">${intTable(l)}</section>`}
 else if(R.tab==='offers'){const l=S.offers.filter(f=>ap.some(a=>a.id===f.appId));body=`<section class="panel">${offerTable(l)}</section>`}
 else if(R.tab==='analytics'){const sc=ap.map(a=>matchA(a).score);const b=[[0,50],[50,65],[65,80],[80,101]];const src={};ap.forEach(a=>{const s=getC(a.cid).source;src[s]=(src[s]||0)+1});
  body=`<div class="grid g2"><section class="panel"><header><h3>Funnel for this opening</h3></header><div class="pbody">${funnelHTML(ap)}</div></section>
  <section class="panel"><header><h3>AI match distribution</h3></header><div class="pbody hbars">${b.map(r=>{const n=sc.filter(s=>s>=r[0]&&s<r[1]).length;return `<div class="hb"><span>${r[0]}–${Math.min(100,r[1]-1)}%</span><div class="bar"><i style="width:${ap.length?n/ap.length*100:0}%;background:${scoreColor(r[0]+1)}"></i></div><b>${n}</b></div>`}).join('')}
  <h4 style="margin:18px 0 6px">Sources</h4>${Object.entries(src).map(([k,v])=>`<div class="hb"><span>${k}</span><div class="bar"><i style="width:${v/ap.length*100}%"></i></div><b>${v}</b></div>`).join('')}
  <p class="muted small" style="margin-top:14px">Average match ${sc.length?Math.round(sc.reduce((a,b)=>a+b,0)/sc.length):0}% · Opening age ${daysBetween(o.opened,today())} days · ${Math.max(0,daysBetween(today(),o.target))} days to target joining</p></div></section></div>`}
 else if(R.tab==='posting')body=postingTabHTML(o);
 else {const l=S.activity.filter(x=>x.text.includes(o.title)).slice(0,40);body=`<section class="panel">${activityList(l)}</section>`}
 return `<div class="navrow"><button class="btn ghost sm" data-act="go" data-a1="openings">${ic('back')}Openings</button>${navBar(R.opNavList||[],o.id,'opening')}</div>
 <div class="page-h"><div><h1>${esc(o.title)}</h1><p>${o.id} · ${esc(o.dept)} · ${esc(o.location)} · ${o.positions} position${o.positions>1?'s':''} · <span class="pill ${OP_COLOR[o.status]}">${o.status}</span></p></div>
 <div class="row"><button class="btn" data-act="go" data-a1="posting" data-a2="${o.id}">${ic('send')}Post job</button><button class="btn" data-act="addCandidate" data-a1="${o.id}">${ic('upload')}Add application</button><button class="btn" data-act="scheduleGI" data-a1="${o.id}">${ic('users')}Group interview</button><button class="btn pri" data-act="openingApplicationsBoard" data-a1="${o.id}">${ic('board')}Pipeline board</button></div></div>
 <div class="tabs" role="tablist">${tabs.map(t=>`<button class="${R.tab===t?'on':''}" data-tab="${t}">${t==='posting'?'Job posting':t[0].toUpperCase()+t.slice(1)}${t==='applications'?` (${ap.length})`:''}</button>`).join('')}</div>${body}`;
}
function activityList(l){return l.length?l.map(x=>`<div class="list-it"><span style="width:8px;height:8px;border-radius:50%;background:${{reject:'var(--red)',joined:'var(--green)',offer:'var(--orange)',application:'var(--ai)'}[x.type]||'var(--blue)'};flex:none"></span><span class="grow">${esc(x.text)}</span><span class="muted small">${timeAgo(x.ts)}</span></div>`).join(''):'<div class="empty">No activity yet.</div>'}
