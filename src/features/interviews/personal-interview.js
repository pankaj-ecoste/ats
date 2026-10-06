/* Personal interview scheduling and scorecard */
/* ---------- personal interview ---------- */
function schedulePI(aid){
 const elig=S.applications.filter(a=>!['Rejected','Employee Ready','Onboarding'].includes(a.stage));
 aid=aid||elig.find(a=>a.stage==='Personal Interview')?.id||elig[0].id;
 const a0=getA(aid);const done=intsOfA(aid).filter(i=>i.kind==='Personal').map(i=>i.round);
 const nextRound=['HR','Technical','Managerial','Final'].find(r=>!done.includes(r))||'Final';
 modal({title:'Schedule personal interview',size:'w',body:`<div class="fgrid g3f"><label class="f" style="grid-column:span 2">Candidate and opening<select class="inp" id="piA">${elig.map(a=>`<option value="${a.id}" ${a.id===aid?'selected':''}>${esc(getC(a.cid).name)} — ${esc(getOp(a.opId).title)} (${a.stage})</option>`).join('')}</select></label>
 <label class="f">Round<select class="inp" id="piR">${['HR','Technical','Managerial','Final'].map(r=>`<option ${r===nextRound?'selected':''}>${r}</option>`).join('')}</select></label>
 <label class="f">Interviewer<select class="inp" id="piI">${INTERVIEWERS.concat(RECRUITERS).map(n=>`<option ${n===getOp(a0.opId).manager?'selected':''}>${n}</option>`).join('')}</select></label>
 <label class="f">Date<input class="inp" type="date" id="piD" value="${addDays(1)}"></label><label class="f">Time<input class="inp" type="time" id="piT" value="15:00"></label>
 <label class="f">Duration (min)<input class="inp" type="number" id="piDur" value="60"></label><label class="f">Mode<select class="inp" id="piM"><option>Google Meet</option><option>Zoom</option><option>MS Teams</option><option>Office</option><option>Phone</option></select></label>
 <label class="f">Meeting link<input class="inp" id="piL" value="https://meet.google.com/${Math.random().toString(36).slice(2,5)}-${Math.random().toString(36).slice(2,6)}-${Math.random().toString(36).slice(2,5)}"></label>
 <label class="f" style="grid-column:span 3">Location (for office interviews)<input class="inp" id="piLoc" placeholder="Office address"></label></div><p class="muted small">Completed rounds: ${done.length?done.join(', '):'none'}.</p>`,
 foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="piS">Schedule interview</button>`,
 onMount:el=>{$('#piS',el).onclick=()=>{const id=val(el,'#piA');const a=getA(id);
  const it={id:uid('INT'),appId:id,kind:'Personal',round:val(el,'#piR'),date:val(el,'#piD'),time:val(el,'#piT'),duration:+val(el,'#piDur'),mode:val(el,'#piM'),link:val(el,'#piL'),location:val(el,'#piLoc'),interviewers:[val(el,'#piI')],status:'Scheduled',invite:'Sent',scores:null,rec:null,decision:null,feedback:''};
  S.interviews.push(it);if(STAGES.indexOf(a.stage)<4||a.stage==='On Hold')setStage(id,'Personal Interview',true);
  log(`${it.round} interview scheduled for ${getC(a.cid).name} on ${fmtD(it.date)}`,'schedule',id);save();closeModal();toast(`${it.round} interview scheduled and invite sent`);refresh()}}});
}
function piScorecard(iid){
 const i=S.interviews.find(x=>x.id===iid),a=getA(i.appId),c=getC(a.cid),o=getOp(a.opId);const sc=i.scores?[...i.scores]:PI_CRIT.map(()=>0);
 modal({title:`${esc(i.round)} interview scorecard`,size:'w',body:`<div class="row" style="margin-bottom:14px">${av(c.name)}<div><b>${esc(c.name)}</b><div class="muted small">${esc(o.title)} · ${fmtD(i.date)} ${fmtT(i.time)} · ${esc(i.interviewers.join(', '))}</div></div></div>
 ${PI_CRIT.map((cr,k)=>`<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)"><span>${cr}</span><div class="dots" data-crit="${k}">${[1,2,3,4,5].map(v=>`<button type="button" data-v="${v}" class="${sc[k]===v?'on':''}" aria-label="${cr} ${v}">${v}</button>`).join('')}</div></div>`).join('')}
 <div class="fgrid" style="margin-top:14px"><label class="f">Overall<select class="inp" id="pOv">${['Strong','Good','Average','Not Suitable'].map(x=>`<option ${i.rec===x?'selected':''}>${x}</option>`).join('')}</select></label>
 <label class="f">Decision<select class="inp" id="pDec">${['Next Round','Selected','Hold','Rejected'].map(x=>`<option ${i.decision===x?'selected':''}>${x}</option>`).join('')}</select></label>
 <label class="f full">Feedback<textarea class="inp" id="pFb" rows="3" placeholder="Strengths, concerns, evidence">${esc(i.feedback)}</textarea></label></div><p class="small muted" id="pAvg"></p>`,
 foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="pSub">Submit scorecard</button>`,
 onMount:el=>{const upd=()=>{const v=sc.filter(Boolean);$('#pAvg',el).textContent=v.length?`Average ${(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1)} / 5`:''};upd();
  $$('[data-crit]',el).forEach(d=>$$('button',d).forEach(b=>b.onclick=()=>{sc[+d.dataset.crit]=+b.dataset.v;$$('button',d).forEach(x=>x.classList.toggle('on',x===b));upd();
   const v=sc.filter(Boolean);if(v.length===PI_CRIT.length){const av=v.reduce((a,b)=>a+b,0)/v.length;$('#pOv',el).value=av>=4.3?'Strong':av>=3.6?'Good':av>=2.8?'Average':'Not Suitable'}}));
  $('#pSub',el).onclick=()=>{if(sc.some(x=>!x)){toast('Score every criterion before submitting','var(--red)');return}
   i.scores=sc;i.rec=val(el,'#pOv');i.decision=val(el,'#pDec');i.feedback=val(el,'#pFb');i.status='Completed';log(`${i.round} interview completed for ${c.name}: ${i.decision}`,'interview',a.id);closeModal();
   if(i.decision==='Selected'){setStage(a.id,'Selected',true);notify(`${c.name} selected for ${o.title}`,['candidate',c.id]);save();refresh();selectedModal(a.id)}
   else if(i.decision==='Rejected'){setStage(a.id,'Rejected')}
   else if(i.decision==='Hold'){setStage(a.id,'On Hold')}
   else {save();refresh();toast('Scorecard saved. Schedule the next round.');schedulePI(a.id)}}}});
}
function selectedModal(aid){
 const a=getA(aid),c=getC(a.cid),o=getOp(a.opId);
 modal({title:'Candidate selected',body:`<div style="text-align:center;margin-bottom:16px">${av(c.name,'lg')}<h2 style="margin:10px 0 2px">${esc(c.name)}</h2><span class="pill green">Selected</span></div>
 <dl class="kv">${[['Position',o.title],['Department',o.dept],['Joining location',o.location],['Salary',lpa(c.expSal)+' expected (budget '+lpa(o.salMin)+'–'+lpa(o.salMax)+')'],['Target joining',fmtD(addDays(c.notice+5))],['Reporting manager',o.manager]].map(r=>`<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>`,
 foot:`<button class="btn" id="sOnb">Start onboarding</button><button class="btn" id="sJoin">Schedule joining</button><button class="btn pri" id="sOffer">${ic('offer')}Create offer</button>`,
 onMount:el=>{$('#sOffer',el).onclick=()=>{closeModal();offerEditor(null,aid)};$('#sJoin',el).onclick=()=>{closeModal();scheduleJoining(aid)};$('#sOnb',el).onclick=()=>{closeModal();startOnboarding(aid)}}});
}
