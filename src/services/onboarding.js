/* Joining and onboarding. DOM-free. */
"use strict";
// date: 'YYYY-MM-DD'. Also updates the offer's joining date when there is one.
function confirmJoining(aid,date){
 repo.update('applications',aid,{joining:date});
 const f=offerOfA(aid);if(f)repo.update('offers',f.id,{joining:date});
 moveStage(aid,'Joining');
 log(`Joining confirmed for ${getC(getA(aid).cid).name} on ${fmtD(date)}`,'schedule',aid);
}
function recordJoined(aid){
 const c=getC(getA(aid).cid);
 log(`${c.name} joined`,'joined',aid);
 notify(`${c.name} joined today`,['onboarding']);
}
// creates the checklist once, then moves the candidate to Onboarding
function beginOnboarding(aid){
 if(!repo.find('onboarding',aid))repo.insert('onboarding',{appId:aid,start:today(),items:ONB_TEMPLATE.map(t=>({cat:t[0],t:t[1],done:false}))},{end:true});
 moveStage(aid,'Onboarding');
}
function setOnboardingItem(appId,index,done){
 const o=repo.update('onboarding',appId,o=>{o.items[index].done=done});
 if(done)log(`${getC(getA(appId).cid).name}: ${o.items[index].t}`,'onboarding',appId);
 return o;
}
function markEmployeeReady(aid){
 const c=getC(getA(aid).cid);
 moveStage(aid,'Employee Ready');
 log(`${c.name} is employee ready`,'joined',aid);
 notify(`${c.name} completed onboarding`,['onboarding']);
}
