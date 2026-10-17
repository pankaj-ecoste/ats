/* Applications: creating one together with its candidate, assigning recruiters. DOM-free. */
"use strict";
// fields: the candidate without an id. Returns {cid, aid, score, candidate}
function createCandidateApplication(fields,opId){
 const cid=uid('C');
 const candidate=repo.insert('candidates',{id:cid,...fields});
 return {cid,...applyCandidate(candidate,opId),candidate};
}
// an application for a candidate who is already in the pool. Returns {aid, score, existing}: existing is true when they already applied to that opening (nothing is added).
function applyCandidate(candidate,opId){
 const o=getOp(opId),was=S.applications.find(a=>a.cid===candidate.id&&a.opId===opId);
 if(was)return {aid:was.id,score:match(candidate,o).score,existing:true};
 const aid=uid('APP');
 repo.insert('applications',{id:aid,cid:candidate.id,opId,date:today(),stage:'New',maxStage:0,recruiter:o.recruiter,screening:null,stageSince:today()});
 const score=match(candidate,o).score;
 log(`${candidate.name} applied for ${o.title}`,'application',aid);
 notify(`New application: ${candidate.name} scored ${score}% for ${o.title}`,['candidate',candidate.id],[o.recruiter]);
 return {aid,score,existing:false};
}
function assignRecruiter(appIds,recruiter){appIds.forEach(id=>repo.update('applications',id,{recruiter}))}
