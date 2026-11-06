/* Screening call workspace */
/* ---------- screening call ---------- */
"use strict";
function screeningCall(aid){
 const a=getA(aid),c=getC(a.cid),o=getOp(a.opId),m=matchA(a);const prev=a.screening||{};
 const navList=R.view==='candidate'&&(R.navList||[]).includes(c.id)?R.navList:(()=>{const l=navListFromDOM();return l.includes(c.id)?l:[c.id]})();
 const nextCid=navList[navList.indexOf(c.id)+1];
 const pre=[ 'Yes',lpa(c.curSal),lpa(c.expSal),c.notice+' days',o.mode==='Remote'?'Remote role':(c.location===o.location?'Yes, local':c.reloc?'Willing to relocate':'Needs discussion'),'',''];
 let secs=0,timer=null;
 const qs=[...(o.screenQ||[])];   // this opening's own questions, in the order asked
 modal({title:'Screening call',size:'xw',body:`<div class="grid" style="grid-template-columns:minmax(0,300px) minmax(0,1fr)">
 <div><section class="panel"><div class="pbody" style="text-align:center">${av(c.name,'lg')}<h3 style="margin:10px 0 0">${esc(c.name)}</h3><div class="muted small">${esc(c.designation)}, ${esc(c.company)}</div>
  <div style="font-size:18px;font-weight:700;margin:10px 0">${esc(c.phone)}</div>
  <div id="callT" style="font-size:28px;font-weight:700;letter-spacing:1px;color:var(--tx3)">00:00</div>
  <div class="row" style="justify-content:center;margin-top:10px"><button class="btn ok" id="callGo">${ic('phone')}Start call</button><button class="btn bad hide" id="callEnd">End call</button></div></div>
  <div style="border-top:1px solid var(--line);padding:14px 18px"><dl class="kv" style="grid-template-columns:96px 1fr">${[['Opening',o.title],['Match score',m.score+'% · '+m.verdict],['Experience',c.exp+' years'],['Notice',c.notice+' days'],['Expected',lpa(c.expSal)+' (budget '+lpa(o.salMax)+')']].map(r=>`<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>
  <div style="margin-top:10px">${c.skills.slice(0,8).map(s=>`<span class="tag ${hasSkill(c,s)&&o.mandatory.some(x=>norm(x)===norm(s))?'ok':''}">${esc(s)}</span>`).join('')}</div>
  ${m.risks.length?`<div class="small" style="margin-top:10px;padding:8px 10px;background:var(--orange2);border-radius:8px"><b>Probe:</b> ${m.risks.map(esc).join('; ')}</div>`:''}</div></section></div>
 <div><h4 style="margin:0 0 10px">Screening questions</h4>${SCREEN_Q.map((q,k)=>`<label class="f" style="margin-bottom:10px">${k+1}. ${esc(q)}<input class="inp" data-q="${k}" value="${esc((prev.answers||[])[k]??pre[k])}" placeholder="Candidate's answer"></label>`).join('')}
  <div id="ownQ"></div>
  <div class="fgrid" style="margin-top:6px"><label class="f">Call outcome<select class="inp" id="outc">${['Connected','Not Connected','Interested','Not Interested','Call Back','Rejected'].map(x=>`<option ${x===(prev.outcome||'Interested')?'selected':''}>${x}</option>`).join('')}</select></label>
  <label class="f">Next action<select class="inp" id="nxt"><option>Move to Group Interview</option><option>Schedule Follow-up</option><option>Keep on Hold</option><option>Reject</option></select></label>
  <label class="f full">Notes<textarea class="inp" id="cnotes" rows="3" placeholder="Key takeaways from the call">${esc(prev.notes||'')}</textarea></label></div></div></div>`,
 foot:`<button class="btn" data-close>Cancel</button><span class="grow"></span><button class="btn" id="callSave">Save call</button><button class="btn pri" id="callNext" ${nextCid?'':'disabled title="Last record in this list"'}>Save &amp; next candidate ›</button>`,
 onMount:el=>{
  // the questions of this opening: shown after the usual ones, added or removed here, and kept for every call on this opening
  const have={...(a.custom||{})};
  const drawOwn=()=>{
   $$('[data-oq]',el).forEach(i=>{have[qs[+i.dataset.oq]]=i.value});   // keep what was typed so far
   $('#ownQ',el).innerHTML=`<h4 style="margin:16px 0 8px">Your questions for this opening</h4>`+
    qs.map((q,k)=>`<label class="f" style="margin-bottom:10px">${SCREEN_Q.length+k+1}. ${esc(q)} <button type="button" class="btn sm ghost" data-oqx="${k}" title="Stop asking this question">Remove</button><input class="inp" data-oq="${k}" value="${esc(have[q]||'')}" placeholder="Candidate's answer"></label>`).join('')+
    `<div class="row" style="gap:8px;flex-wrap:nowrap;margin-bottom:6px"><input class="inp" id="oqNew" maxlength="200" placeholder="A question of your own, e.g. Can you join within 15 days?"><button type="button" class="btn" id="oqAdd">Add question</button></div><p class="small muted" style="margin:0 0 6px">Asked on every call for this opening only. The answers become columns in the Applications list.</p>`;
   $$('[data-oqx]',el).forEach(b=>b.onclick=()=>{const q=qs.splice(+b.dataset.oqx,1)[0];try{setScreenQuestions(o.id,qs);toast('Removed. Answers already given are kept')}catch(e){qs.push(q);toast(e.message,'var(--red)')}drawOwn()});
   $('#oqAdd',el).onclick=()=>{
    const t=$('#oqNew',el).value.replace(/\s+/g,' ').trim();
    if(!t){toast('Type the question first','var(--red)');return}
    if(qs.some(x=>x.toLowerCase()===t.toLowerCase())||SCREEN_Q.some(x=>x.toLowerCase()===t.toLowerCase())){toast('That question is already asked','var(--red)');return}
    if(qs.length>=10){toast('At most 10 questions of your own for one opening','var(--red)');return}
    qs.push(t);try{setScreenQuestions(o.id,qs);toast('Question added for '+o.title)}catch(e){qs.pop();toast(e.message,'var(--red)')}drawOwn()};
  };
  drawOwn();
  const fmt=()=>$('#callT',el).textContent=pad(Math.floor(secs/60))+':'+pad(secs%60);
  $('#callGo',el).onclick=()=>{timer=setInterval(()=>{secs++;fmt()},1000);$('#callT',el).style.color='var(--green)';$('#callGo',el).classList.add('hide');$('#callEnd',el).classList.remove('hide')};
  $('#callEnd',el).onclick=()=>{clearInterval(timer);$('#callT',el).style.color='var(--tx2)';$('#callEnd',el).classList.add('hide');toast('Call ended · '+$('#callT',el).textContent)};
  const oc=$('#outc',el),nx=$('#nxt',el);oc.onchange=()=>{nx.value={'Not Connected':'Schedule Follow-up','Call Back':'Schedule Follow-up','Not Interested':'Reject','Rejected':'Reject'}[oc.value]||'Move to Group Interview'};
  const ownAnswers=()=>{$$('[data-oq]',el).forEach(i=>{have[qs[+i.dataset.oq]]=i.value});const out={};qs.forEach(q=>{out[q]=have[q]||''});return out};
  const doSave=(andNext)=>{clearInterval(timer);recordScreening(aid,{outcome:oc.value,answers:$$('[data-q]',el).map(i=>i.value),notes:$('#cnotes',el).value,duration:secs,custom:ownAnswers()});closeModal();
   const n=nx.value;
   if(andNext){
    if(n==='Move to Group Interview')setStage(aid,'Group Interview',true);
    else if(n==='Schedule Follow-up'){if(a.stage==='Shortlisted')setStage(aid,'Screening',true);addTask({title:`Follow-up call with ${c.name}`,due:addDays(1),related:o.title,priority:'Medium',owner:a.recruiter})}
    else if(n==='Keep on Hold')setStage(aid,'On Hold',true);else setStage(aid,'Rejected',true,'Failed the screening');
    const nc=getC(nextCid);toast(`Call saved (${n}). Next: ${nc.name}`);R.navList=navList;R.keepNav=true;
    const na=appsOfC(nextCid).find(x=>['Shortlisted','Screening','New'].includes(x.stage))||primaryApp(nextCid);R.appSel=na.id;go('candidate',nextCid);return}
   if(n==='Move to Group Interview'){setStage(aid,'Group Interview',true);toast(`${c.name} moved to Group Interview`);confirmBox('Schedule group interview?',`${esc(c.name)} is ready for the group round. Schedule it now?`,'Schedule now',()=>scheduleGI(o.id,[aid]))}
   else if(n==='Schedule Follow-up'){if(a.stage==='Shortlisted')setStage(aid,'Screening',true);taskForm({title:`Follow-up call with ${c.name}`,related:o.title,due:addDays(1),priority:'Medium'})}
   else if(n==='Keep on Hold')setStage(aid,'On Hold',true),toast(c.name+' kept on hold','var(--orange)');
   else setStage(aid,'Rejected',true,'Failed the screening'),toast(c.name+' rejected','var(--red)');
   refresh()};
  $('#callSave',el).onclick=()=>doSave(false);$('#callNext',el).onclick=()=>doSave(true);
 }});
}
