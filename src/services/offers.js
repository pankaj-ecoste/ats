/* Offers. DOM-free. */
"use strict";
// w: the offer being edited (a working copy). A new offer is stored as `w` itself; an existing one is updated from it.
// Returns the stored record. Moves the candidate to Offer if they are earlier in the pipeline.
function saveOffer(w,status){
 const isNew=!repo.find('offers',w.id);
 w.status=status;delete w._new;
 const a=getA(w.appId);
 let f;
 if(isNew){
  f=repo.insert('offers',w,{end:true});
  log(`Offer ${status==='Draft'?'drafted':'generated'} for ${getC(a.cid).name}`,'offer',a.id);
 }else f=repo.update('offers',w.id,w);
 if(STAGES.indexOf(a.stage)<6||a.stage==='On Hold')moveStage(a.id,'Offer');
 return f;
}
// call after saveOffer(w,'Sent'): stamps the date, logs, notifies and creates the follow-up task
function markOfferSent(fid){
 const f=repo.update('offers',fid,{sent:today()}),a=getA(f.appId),c=getC(a.cid),o=getOp(a.opId);
 log(`Offer sent to ${c.name}`,'offer',a.id);
 notify(`Offer sent to ${c.name} · awaiting response`,['offers']);
 addTask({title:`Follow up with ${c.name} on offer`,due:addDays(2),related:o.title,priority:'High',owner:S.settings.user});
 return f;
}
// response: 'Accepted' | 'Declined' | 'Negotiation'
function recordOfferResponse(fid,response){
 const f=repo.update('offers',fid,{status:response}),a=getA(f.appId),c=getC(a.cid);
 log(`${c.name} ${response==='Negotiation'?'asked to negotiate the offer':response.toLowerCase()+' the offer'}`,'offer',a.id);
 if(response==='Accepted'){
  moveStage(a.id,'Offer Accepted');
  notify(`${c.name} accepted the offer 🎉`,['onboarding']);
 }
 return f;
}
