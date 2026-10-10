/* Cross-feature UI actions: stage change with feedback, next action, journey. Data changes live in src/services/ */
/* ---------- actions ---------- */
// UI wrapper over the moveStage() service: adds the toast and the re-render
"use strict";
function setStage(aid,stage,quiet){
 const r=moveStage(aid,stage);if(!r)return;
 if(!quiet){toast(`${r.candidate.name} moved to ${stage}`,stage==='Rejected'?'var(--red)':'var(--green)');refresh()}
}
function refresh(){render()}
function shortlist(aid){setStage(aid,'Shortlisted')}
function rejectApp(aid){const c=getC(getA(aid).cid);confirmBox('Reject candidate',`Reject <b>${esc(c.name)}</b> for ${esc(getOp(getA(aid).opId).title)}? You can reopen the application later.`,'Reject',()=>setStage(aid,'Rejected'),true)}
function nextAction(a){
 const gi=S.interviews.find(i=>i.appId===a.id&&i.kind==='Group'&&i.status!=='Cancelled'&&!i.rec);
 const pi=S.interviews.filter(i=>i.appId===a.id&&i.kind==='Personal'&&i.status!=='Cancelled'&&!i.decision);
 const of=offerOfA(a.id);
 switch(a.stage){
  case 'New':return ['Review AI match',()=>aiMatchModal(a.id)];
  case 'Shortlisted':return ['Screening call',()=>screeningCall(a.id)];
  case 'Screening':return ['Call back',()=>screeningCall(a.id)];
  case 'Group Interview':return gi?(intStatus(gi)==='Scheduled'&&gi.date>today()?['Invite status',()=>groupDetail(gi.groupId)]:['Evaluate group',()=>groupEval(gi.groupId)]):['Schedule group',()=>scheduleGI(a.opId,[a.id])];
  case 'Personal Interview':return pi.length?['Submit scorecard',()=>piScorecard(pi[0].id)]:['Schedule interview',()=>schedulePI(a.id)];
  case 'Selected':return of?['Open offer',()=>offerEditor(of.id)]:['Create offer',()=>offerEditor(null,a.id)];
  case 'Offer':return of&&of.status==='Sent'?['Record response',()=>offerResponse(of.id)]:['Send offer',()=>offerEditor(of&&of.id,a.id)];
  case 'Offer Accepted':return ['Schedule joining',()=>scheduleJoining(a.id)];
  case 'Joining':return ['Mark joined',()=>markJoined(a.id)];
  case 'Onboarding':return ['Open checklist',()=>go('onboarding')];
  case 'Employee Ready':return ['View profile',()=>go('candidate',a.cid)];
  default:return ['Reopen',()=>setStage(a.id,'Shortlisted')];
 }
}
function nextBtn(a,cls='sm'){const [l]=nextAction(a);return `<button class="btn ${cls} ${a.stage==='New'?'aib':''}" data-next="${a.id}">${esc(l)}</button>`}
function bindNext(root){$$('[data-next]',root).forEach(b=>b.onclick=e=>{e.stopPropagation();nextAction(getA(b.dataset.next))[1]()})}
function journey(a){
 const halted=a.stage==='Rejected'||a.stage==='On Hold';
 const cur=halted?stageToJourney(a.maxStage):stageToJourney(STAGES.indexOf(a.stage));
 return `<div class="journey" role="list" aria-label="Candidate journey">${JOURNEY.map((j,k)=>{let cls=k<cur?'done':k===cur?(halted?'halt':'cur'):'';if(a.stage==='Employee Ready'&&k===cur)cls='done';
  return `<div class="jstep ${cls}" role="listitem"><span class="n">${cls==='done'?'✓':cls==='halt'?'!':k+1}</span>${j}${k===cur&&halted?`<br><span style="font-weight:700">${a.stage}</span>`:''}</div>`}).join('')}</div>`;
}
