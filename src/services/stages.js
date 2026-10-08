/* Moving an application through the pipeline. DOM-free: returns what happened, the caller shows it.
   Fires 'stage:changing' {aid,stage,prev} before the stage is written (see core/hooks.js). */
"use strict";
function moveStage(aid,stage){
 const a=getA(aid),c=getC(a.cid),o=getOp(a.opId);const prev=a.stage;
 if(prev===stage)return null;
 emitEvent('stage:changing',{aid,stage,prev});
 repo.update('applications',aid,a=>{
  a.stage=stage;a.stageSince=today();
  const idx=STAGES.indexOf(stage);if(idx>a.maxStage)a.maxStage=idx;
 });
 const type={Shortlisted:'shortlist',Rejected:'reject','Employee Ready':'joined',Onboarding:'joined',Selected:'interview'}[stage]||'stage';
 log(`${c.name} moved to ${stage} for ${o.title}`,type,aid);
 // keep opening status in sync with its furthest pipeline
 const furthest=Math.max(...appsOfOp(o.id).map(stageRank));
 if(!['Draft','On Hold','Closed','Filled'].includes(o.status)){
  const hired=appsOfOp(o.id).filter(x=>STAGES.indexOf(x.stage)>=STAGES.indexOf('Joining')).length;
  const status=hired>=o.positions?'Filled':furthest>=6?'Offer':furthest>=3?'Interviewing':furthest>=1?'Screening':'Open';
  repo.update('openings',o.id,{status});
 }
 return {aid,stage,prev,candidate:c,opening:o};
}
