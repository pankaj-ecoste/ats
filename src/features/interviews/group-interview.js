/* Group interview scheduling and evaluation */
/* ---------- group interview ---------- */
function scheduleGI(opId,pre=[]){
 opId=opId||S.openings.find(o=>appsOfOp(o.id).some(a=>['Group Interview','Shortlisted','Screening'].includes(a.stage)))?.id||S.openings[0].id;
 const body=()=>{const eligible=appsOfOp(opId).filter(a=>['Group Interview','Shortlisted','Screening'].includes(a.stage)&&!S.interviews.some(i=>i.appId===a.id&&i.kind==='Group'&&!i.rec&&i.status!=='Cancelled'));
  return `<div class="fgrid g3f"><label class="f" style="grid-column:span 3">Opening<select class="inp" id="giOp">${S.openings.map(o=>`<option value="${o.id}" ${o.id===opId?'selected':''}>${esc(o.title)}</option>`).join('')}</select></label>
  <label class="f">Date<input class="inp" type="date" id="giD" value="${addDays(2)}"></label><label class="f">Time<input class="inp" type="time" id="giT" value="11:00"></label><label class="f">Duration (min)<input class="inp" type="number" id="giDur" value="90"></label>
  <label class="f">Interview mode<select class="inp" id="giM"><option>Office</option><option>Google Meet</option><option>Zoom</option><option>MS Teams</option></select></label>
  <label class="f">Location<input class="inp" id="giL" value="Northwind Office, ${esc(getOp(opId).location)}"></label><label class="f">Meeting link<input class="inp" id="giLink" placeholder="https://meet.google.com/…"></label>
  <label class="f">Panel name<input class="inp" id="giP" value="${esc(getOp(opId).dept)} hiring panel"></label>
  <label class="f" style="grid-column:span 2">Interviewers<div class="row">${INTERVIEWERS.map(n=>`<label class="small" style="display:flex;gap:5px;align-items:center"><input type="checkbox" class="chk" data-ivr value="${n}" ${n===getOp(opId).manager?'checked':''}>${n}</label>`).join('')}</div></label></div>
  <h4 style="margin:18px 0 8px;display:flex;justify-content:space-between">Candidates (${eligible.length} eligible)<label class="small" style="font-weight:500;display:flex;gap:6px;align-items:center"><input type="checkbox" class="chk" id="giAll">Select all</label></h4>
  ${eligible.length?`<div class="panel" style="box-shadow:none">${eligible.map(a=>{const c=getC(a.cid),m=matchA(a);return `<label class="list-it" style="cursor:pointer"><input type="checkbox" class="chk" data-gc="${a.id}" ${pre.includes(a.id)||a.stage==='Group Interview'?'checked':''}>${av(c.name)}<div class="grow"><b>${esc(c.name)}</b><div class="muted small">${c.exp} yrs · ${esc(c.location)} · ${a.stage}</div></div>${ring(m.score)}</label>`}).join('')}</div>`:'<div class="empty"><b>No eligible candidates</b>Shortlist or screen candidates for this opening first.</div>'}`};
 modal({title:'Schedule group interview',size:'w',body:body(),foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="giS">${ic('users')}Schedule and send invites</button>`,
 onMount:el=>{const bind=()=>{$('#giOp',el).onchange=e=>{opId=e.target.value;pre=[];$('.mb',el).innerHTML=body();bind()};const all=$('#giAll',el);all.onchange=()=>$$('[data-gc]',el).forEach(c=>c.checked=all.checked);
   $('#giM',el).onchange=e=>{if(e.target.value!=='Office'){$('#giLink',el).value='https://meet.google.com/'+Math.random().toString(36).slice(2,5)+'-'+Math.random().toString(36).slice(2,6)+'-'+Math.random().toString(36).slice(2,5)}}};bind();
  $('#giS',el).onclick=()=>{const ids=$$('[data-gc]:checked',el).map(c=>c.dataset.gc);if(!ids.length){toast('Select at least one candidate','var(--red)');return}
   const ivr=$$('[data-ivr]:checked',el).map(c=>c.value);if(!ivr.length){toast('Pick at least one interviewer','var(--red)');return}
   scheduleGroupInterview({opId,date:val(el,'#giD'),time:val(el,'#giT'),duration:+val(el,'#giDur'),mode:val(el,'#giM'),location:val(el,'#giL'),link:val(el,'#giLink'),panel:val(el,'#giP'),interviewers:ivr,appIds:ids});closeModal();toast(`${ids.length} interview records created and invites sent`);R.intTab='groups';go('interviews')}}});
}
function groupDetail(gid){
 const g=S.groups.find(x=>x.id===gid);const o=getOp(g.opId);const ints=S.interviews.filter(i=>i.groupId===gid);
 modal({title:`Group interview · ${esc(o.title)}`,size:'w',body:`<dl class="kv">${[['Date & time',fmtD(g.date)+', '+fmtT(g.time)+' ('+g.duration+' min)'],['Mode',g.mode],['Location',g.location||'—'],['Meeting link',g.link||'—'],['Panel',g.panel],['Interviewers',g.interviewers.join(', ')]].map(r=>`<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>
 <h4 style="margin:16px 0 8px">Invitations</h4><div class="panel" style="box-shadow:none">${ints.map(i=>{const c=getC(getA(i.appId).cid);return `<div class="list-it">${av(c.name)}<b class="grow">${esc(c.name)}</b>${i.rec?`<span class="pill ${i.rec==='Select for Personal Interview'?'green':i.rec==='Hold'?'orange':'red'}">${esc(i.rec)}</span>`:''}<select class="inp" data-inv="${i.id}" style="width:auto;padding:4px 8px;font-size:12px">${['Pending','Sent','Confirmed','Declined'].map(s=>`<option ${s===i.invite?'selected':''}>${s}</option>`).join('')}</select></div>`}).join('')}</div>`,
 foot:`<button class="btn bad" id="gCancel">Cancel interview</button><span class="grow"></span><button class="btn" id="gRem">${ic('send')}Send reminder</button><button class="btn pri" id="gEval">Evaluate candidates</button>`,
 onMount:el=>{$$('[data-inv]',el).forEach(s=>s.onchange=()=>{setInviteStatus(s.dataset.inv,s.value);toast('Invitation marked '+s.value)});
  $('#gRem',el).onclick=()=>{sendGroupReminders(gid);toast('Reminder sent to '+ints.length+' candidates')};
  $('#gEval',el).onclick=()=>{closeModal();groupEval(gid)};
  $('#gCancel',el).onclick=()=>confirmBox('Cancel group interview','All candidates in this group will be notified.','Cancel interview',()=>{cancelGroupInterview(gid);closeModal();toast('Group interview cancelled','var(--red)');refresh()},true)}});
}
function groupEval(gid){
 const g=S.groups.find(x=>x.id===gid);const o=getOp(g.opId);const ints=S.interviews.filter(i=>i.groupId===gid&&i.status!=='Cancelled'&&i.invite!=='Declined');
 const sc={};ints.forEach(i=>sc[i.id]=i.scores?[...i.scores]:GI_CRIT.map(()=>0));
 modal({title:`Evaluate group · ${esc(o.title)}`,size:'xw',body:`<p class="muted" style="margin-top:0">${fmtD(g.date)} · ${ints.length} candidates. Score 1–5 on each criterion, then choose a recommendation. Submitting moves each candidate to the matching stage.</p>
 <div class="tbl-wrap"><table><thead><tr><th>Candidate</th>${GI_CRIT.map(c=>`<th style="white-space:normal;min-width:74px">${c}</th>`).join('')}<th>Avg</th><th>Recommendation</th><th>Feedback</th></tr></thead><tbody>
 ${ints.map(i=>{const c=getC(getA(i.appId).cid);return `<tr><td><div class="who" style="min-width:140px">${av(c.name)}<b>${esc(c.name)}</b></div></td>${GI_CRIT.map((_,k)=>`<td><select class="inp" data-s="${i.id}" data-k="${k}" style="padding:5px;width:56px">${['–',1,2,3,4,5].map((v,j)=>`<option value="${j}" ${sc[i.id][k]===j?'selected':''}>${v}</option>`).join('')}</select></td>`).join('')}
 <td><b data-avg="${i.id}">–</b></td><td><select class="inp" data-rec="${i.id}" style="width:auto;padding:5px 8px"><option value="">Choose…</option>${['Select for Personal Interview','Hold','Reject'].map(r=>`<option ${i.rec===r?'selected':''}>${r}</option>`).join('')}</select></td><td><input class="inp" data-fb="${i.id}" value="${esc(i.feedback)}" placeholder="Short feedback" style="min-width:160px"></td></tr>`}).join('')}
 </tbody></table></div>`,
 foot:`<button class="btn" data-close>Cancel</button><button class="btn aib" id="gAuto">${ic('ai')}Suggest recommendations</button><button class="btn pri" id="gSub">Submit evaluation</button>`,
 onMount:el=>{const upd=id=>{const v=sc[id].filter(Boolean);$(`[data-avg="${id}"]`,el).textContent=v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):'–'};ints.forEach(i=>upd(i.id));
  $$('[data-s]',el).forEach(s=>s.onchange=()=>{sc[s.dataset.s][+s.dataset.k]=+s.value;upd(s.dataset.s)});
  $('#gAuto',el).onclick=()=>{ints.forEach(i=>{const v=sc[i.id].filter(Boolean);if(!v.length)return;const avg=v.reduce((a,b)=>a+b,0)/v.length;$(`[data-rec="${i.id}"]`,el).value=avg>=3.5?'Select for Personal Interview':avg>=2.8?'Hold':'Reject'});toast('Suggested from average scores: ≥3.5 select, ≥2.8 hold','var(--ai)')};
  $('#gSub',el).onclick=()=>{const miss=ints.filter(i=>!$(`[data-rec="${i.id}"]`,el).value);if(miss.length){toast(`Choose a recommendation for ${miss.length} candidate${miss.length>1?'s':''}`,'var(--red)');return}
   const moved=evaluateGroup(gid,ints.map(i=>({intId:i.id,scores:sc[i.id],rec:$(`[data-rec="${i.id}"]`,el).value,feedback:$(`[data-fb="${i.id}"]`,el).value})));closeModal();toast(`${moved.sel} to personal interview, ${moved.hold} on hold, ${moved.rej} rejected`);refresh()}}});
}
