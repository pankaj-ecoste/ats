/* Applications: creating one together with its candidate, assigning recruiters. DOM-free. */
"use strict";
// fields: the candidate without an id. Returns {cid, aid, score, candidate}
function createCandidateApplication(fields,opId){
 const cid=uid('C');
 const candidate=repo.insert('candidates',{id:cid,...fields});
 return {cid,...applyCandidate(candidate,opId),candidate};
}
// an application for a candidate who is already in the pool. Returns {aid, score, existing}: existing is true when they already applied to that opening (nothing is added).
function applyCandidate(candidate,opId,source){
 const o=getOp(opId),was=S.applications.find(a=>a.cid===candidate.id&&a.opId===opId);
 if(was)return {aid:was.id,score:match(candidate,o).score,existing:true};
 const aid=uid('APP');
 const m=match(candidate,o),score=m.score,snap=matchSnapshot(m);
 repo.insert('applications',{id:aid,cid:candidate.id,opId,date:today(),source:source||candidate.source||'',stage:'New',maxStage:0,recruiter:o.recruiter,screening:null,stageSince:today(),matchScore:snap.score,matchReasons:snap.reasons});
 log(`${candidate.name} applied for ${o.title}`,'application',aid);
 notify(`New application: ${candidate.name} scored ${score}% for ${o.title}`,['candidate',candidate.id],[o.recruiter]);
 return {aid,score,existing:false};
}
// A recruiter logs a call on a lead: sets "Call status via app". Any value but NA is a call made; the database records it with who and when (migration 0034).
// Choosing the same value again is a new call. NA only clears the current value.
function setAppCall(aid,status){
 if(!APP_CALL_STATUS.includes(status))throw new Error('Choose a call status from the list');
 const a=getA(aid);if(!a)throw new Error('Application not found');
 repo.update('applications',aid,{appCall:status==='NA'?null:status,appCallAt:Date.now()});
 if(status!=='NA')log(`Call logged on ${getC(a.cid).name}: ${status}`,'call',aid);
 return getA(aid);
}
function assignRecruiter(appIds,recruiter){appIds.forEach(id=>repo.update('applications',id,{recruiter}))}
