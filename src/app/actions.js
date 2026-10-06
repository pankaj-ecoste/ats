/* Cross-feature actions: activity log, notifications, stage changes, next action, journey */
/* ---------- actions ---------- */
function log(text,type='info',appId){S.activity.unshift({ts:Date.now(),text,type,appId});if(S.activity.length>300)S.activity.length=300}
function notify(text,goArgs=['dashboard']){S.notifications.unshift({id:Date.now()+Math.random(),text,ts:Date.now(),read:false,go:goArgs})}
function setStage(aid,stage,quiet){
 const a=getA(aid),c=getC(a.cid),o=getOp(a.opId);const prev=a.stage;if(prev===stage)return;
 emitEvent('stage:changing',{aid,stage,prev});
 a.stage=stage;a.stageSince=today();const idx=STAGES.indexOf(stage);if(idx>a.maxStage)a.maxStage=idx;
 const type={Shortlisted:'shortlist',Rejected:'reject','Employee Ready':'joined',Onboarding:'joined',Selected:'interview'}[stage]||'stage';
 log(`${c.name} moved to ${stage} for ${o.title}`,type,aid);
 // keep opening status in sync with its furthest pipeline
 const furthest=Math.max(...appsOfOp(o.id).map(stageRank));
 if(!['Draft','On Hold','Closed','Filled'].includes(o.status)){
  const hired=appsOfOp(o.id).filter(x=>STAGES.indexOf(x.stage)>=STAGES.indexOf('Joining')).length;
  o.status=hired>=o.positions?'Filled':furthest>=6?'Offer':furthest>=3?'Interviewing':furthest>=1?'Screening':'Open';
 }
 save();if(!quiet){toast(`${c.name} moved to ${stage}`,stage==='Rejected'?'var(--red)':'var(--green)');refresh()}
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
