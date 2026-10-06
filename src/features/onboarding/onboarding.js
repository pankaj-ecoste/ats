/* Joining and onboarding checklists */
/* ---------- joining & onboarding ---------- */
function scheduleJoining(aid){
 const a=getA(aid),c=getC(a.cid),f=offerOfA(aid);
 modal({title:'Schedule joining',body:`<div class="row" style="margin-bottom:14px">${av(c.name)}<div><b>${esc(c.name)}</b><div class="muted small">${esc(getOp(a.opId).title)}</div></div></div>
 <div class="fgrid"><label class="f">Joining date<input class="inp" type="date" id="jd" value="${a.joining||(f&&f.joining)||addDays(15)}"></label><label class="f">Reporting time<input class="inp" type="time" id="jt" value="09:30"></label>
 <label class="f full">Reporting location<input class="inp" id="jl" value="${esc(S.settings.companyAddr)}"></label>
 <label class="f full"><span><input type="checkbox" class="chk" id="jk" checked style="vertical-align:-3px"> Send joining kit and document checklist to ${esc(c.email)}</span></label></div>`,
 foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="jS">Confirm joining</button>`,
 onMount:el=>$('#jS',el).onclick=()=>{a.joining=val(el,'#jd');if(f)f.joining=a.joining;setStage(aid,'Joining',true);log(`Joining confirmed for ${c.name} on ${fmtD(a.joining)}`,'schedule',aid);save();closeModal();toast(`Joining set for ${fmtD(a.joining)}`);refresh()}});
}
function startOnboarding(aid){if(!S.onboarding.some(o=>o.appId===aid))S.onboarding.push({appId:aid,start:today(),items:ONB_TEMPLATE.map(t=>({cat:t[0],t:t[1],done:false}))});setStage(aid,'Onboarding',true);save();go('onboarding');toast('Onboarding started')}
function markJoined(aid){const c=getC(getA(aid).cid);confirmBox('Mark as joined',`Confirm ${esc(c.name)} reported on day 1? This starts the onboarding checklist.`,'Mark joined',()=>{log(`${c.name} joined`,'joined',aid);notify(`${c.name} joined today`,['onboarding']);startOnboarding(aid)})}
function vOnboarding(){
 const upcoming=S.applications.filter(a=>['Offer Accepted','Joining'].includes(a.stage)).sort((x,y)=>(x.joining||'9').localeCompare(y.joining||'9'));
 const ob=S.onboarding.slice().reverse();
 return `<div class="page-h"><div><h1>Onboarding</h1><p>${upcoming.length} joining soon · ${ob.filter(o=>o.items.some(i=>!i.done)).length} checklists in progress</p></div></div>
 <section class="panel" style="margin-bottom:16px"><header><h3>Joining pipeline</h3></header>${upcoming.length?`<div class="tbl-wrap"><table><thead><tr><th>Candidate</th><th>Position</th><th>Joining date</th><th>Days left</th><th>Documents</th><th>Stage</th><th></th></tr></thead><tbody>${upcoming.map(a=>{const c=getC(a.cid);const docs=c.documents.filter(d=>d.status!=='Pending').length;const dl=a.joining?daysBetween(today(),a.joining):null;
  return `<tr><td><div class="who">${av(c.name)}<b>${esc(c.name)}</b></div></td><td>${esc(getOp(a.opId).title)}</td><td>${fmtD(a.joining)}</td><td>${dl==null?'—':dl<0?`<span class="pill red">${-dl}d overdue</span>`:dl===0?'<span class="pill green">Today</span>':dl+' days'}</td><td>${docs}/${c.documents.length}</td><td>${stagePill(a.stage)}</td><td>${nextBtn(a)}</td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">No upcoming joiners.</div>'}</section>
 <div class="grid g2">${ob.map(o=>{const a=getA(o.appId),c=getC(a.cid);const d=o.items.filter(i=>i.done).length,t=o.items.length,pct=Math.round(d/t*100);const cats=[...new Set(o.items.map(i=>i.cat))];
  return `<section class="panel"><header><div class="who">${av(c.name)}<div><b>${esc(c.name)}</b><small>${esc(getOp(a.opId).title)} · started ${fmtDs(o.start)}</small></div></div>${a.stage==='Employee Ready'?'<span class="pill green">Employee ready</span>':`<b>${pct}%</b>`}</header>
  <div class="pbody"><div class="bar" style="height:8px;margin-bottom:12px"><i style="width:${pct}%;background:${pct===100?'var(--green)':'var(--blue)'}"></i></div>
  ${cats.map(cat=>`<div class="small muted" style="margin-top:8px;font-weight:600">${cat}</div>${o.items.map((i,k)=>i.cat!==cat?'':`<label class="checkl ${i.done?'done':''}"><input type="checkbox" class="chk" data-ob="${o.appId}" data-k="${k}" ${i.done?'checked':''} ${a.stage==='Employee Ready'?'disabled':''}><span>${esc(i.t)}</span></label>`).join('')}`).join('')}
  ${a.stage!=='Employee Ready'?`<div style="margin-top:14px"><button class="btn ${pct===100?'ok':''}" data-ready="${o.appId}" ${pct<100?'disabled title="Complete every step first"':''}>${ic('check')}Mark employee ready</button></div>`:''}</div></section>`}).join('')||'<div class="empty"><b>No onboarding yet</b>Mark a joiner as joined to start their checklist.</div>'}</div>`;
}
function bindOnboarding(root){
 $$('[data-ob]',root).forEach(cb=>cb.onchange=()=>{const o=S.onboarding.find(x=>x.appId===cb.dataset.ob);o.items[+cb.dataset.k].done=cb.checked;if(cb.checked)log(`${getC(getA(o.appId).cid).name}: ${o.items[+cb.dataset.k].t}`,'onboarding',o.appId);save();render()});
 $$('[data-ready]',root).forEach(b=>b.onclick=()=>{const a=getA(b.dataset.ready),c=getC(a.cid);setStage(a.id,'Employee Ready',true);log(`${c.name} is employee ready`,'joined',a.id);notify(`${c.name} completed onboarding`,['onboarding']);save();render();
  modal({title:'Employee ready',body:`<div style="text-align:center">${av(c.name,'lg')}<h2 style="margin:12px 0 4px">${esc(c.name)} is ready to go</h2><p class="muted">From application on ${fmtD(a.date)} to employee ready in ${daysBetween(a.date,today())} days.</p>${journey(a)}</div>`,foot:'<button class="btn pri" data-close>Done</button>'})});
 bindNext(root);
}
