/* Screening calls, group and personal interviews. DOM-free. */
"use strict";
function recordScreening(aid,{outcome,answers,notes,duration}){
 const a=repo.update('applications',aid,{screening:{outcome,answers,notes,date:today(),duration}});
 log(`Screening call completed with ${getC(a.cid).name} (${outcome})`,'call',aid);
 return a;
}

/* ---------- group ---------- */
// f: {opId,date,time,duration,mode,location,link,panel,interviewers,appIds}. One interview record per candidate.
function scheduleGroupInterview(f){
 const g=repo.insert('groups',{id:uid('GI'),...f,evaluated:false},{end:true});
 g.appIds.forEach(id=>{
  repo.insert('interviews',{id:uid('INT'),appId:id,kind:'Group',round:'Group Interview',groupId:g.id,date:g.date,time:g.time,duration:g.duration,mode:g.mode,location:g.location,link:g.link,interviewers:g.interviewers,status:'Scheduled',invite:'Sent',scores:null,rec:null,feedback:''},{end:true});
  if(getA(id).stage!=='Group Interview')moveStage(id,'Group Interview');
 });
 log(`Group interview scheduled for ${getOp(g.opId).title} with ${g.appIds.length} candidates`,'schedule');
 notify(`Group interview set for ${fmtD(g.date)} with ${g.appIds.length} candidates`,['interviews']);
 return g;
}
function setInviteStatus(iid,invite){return repo.update('interviews',iid,{invite})}
// returns how many candidates are in the group
function sendGroupReminders(gid){
 const ints=S.interviews.filter(i=>i.groupId===gid);
 ints.forEach(i=>{if(i.invite==='Pending')repo.update('interviews',i.id,{invite:'Sent'})});
 return ints.length;
}
function cancelGroupInterview(gid){S.interviews.filter(i=>i.groupId===gid).forEach(i=>repo.update('interviews',i.id,{status:'Cancelled'}))}
// results: [{intId,scores,rec,feedback}]. Moves each candidate on; returns {sel,hold,rej}
function evaluateGroup(gid,results){
 const o=getOp(repo.find('groups',gid).opId),moved={sel:0,hold:0,rej:0};
 results.forEach(({intId,scores,rec,feedback})=>{
  const i=repo.update('interviews',intId,{scores,rec,feedback,status:'Completed'});
  const st=rec==='Select for Personal Interview'?'Personal Interview':rec==='Hold'?'On Hold':'Rejected';
  moved[st==='Personal Interview'?'sel':st==='On Hold'?'hold':'rej']++;
  moveStage(i.appId,st);
 });
 repo.update('groups',gid,{evaluated:true});
 log(`Group interview evaluated for ${o.title}: ${moved.sel} advanced`,'interview');
 return moved;
}

/* ---------- personal ---------- */
// f: {appId,round,date,time,duration,mode,link,location,interviewers}
function schedulePersonalInterview(f){
 const it=repo.insert('interviews',{id:uid('INT'),kind:'Personal',...f,status:'Scheduled',invite:'Sent',scores:null,rec:null,decision:null,feedback:''},{end:true});
 const a=getA(f.appId);
 if(STAGES.indexOf(a.stage)<4||a.stage==='On Hold')moveStage(f.appId,'Personal Interview');
 log(`${it.round} interview scheduled for ${getC(a.cid).name} on ${fmtD(it.date)}`,'schedule',f.appId);
 return it;
}
function recordScorecard(iid,{scores,rec,decision,feedback}){
 const i=repo.update('interviews',iid,{scores,rec,decision,feedback,status:'Completed'});
 const a=getA(i.appId);
 log(`${i.round} interview completed for ${getC(a.cid).name}: ${decision}`,'interview',a.id);
 return i;
}

/* ---------- any interview ---------- */
function markNoShow(iid){
 const i=repo.update('interviews',iid,{status:'No-show'}),a=getA(i.appId);
 log(`${getC(a.cid).name} did not attend the ${i.kind==='Group'?'group':i.round} interview`,'schedule',a.id);
 return i;
}
function cancelInterview(iid){
 const i=repo.update('interviews',iid,{status:'Cancelled'}),a=getA(i.appId);
 log(`Interview cancelled for ${getC(a.cid).name}`,'schedule',a.id);
 return i;
}
