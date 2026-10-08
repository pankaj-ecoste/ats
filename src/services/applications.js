/* Applications: creating one together with its candidate, assigning recruiters. DOM-free. */
"use strict";
// fields: the candidate without an id. Returns {cid, aid, score, candidate}
function createCandidateApplication(fields,opId){
 const cid='C-'+(2001+S.candidates.length+Math.floor(Math.random()*900));
 const candidate=repo.insert('candidates',{id:cid,...fields});
 const aid='APP-'+(3100+S.applications.length+Math.floor(Math.random()*900));
 const o=getOp(opId);
 repo.insert('applications',{id:aid,cid,opId,date:today(),stage:'New',maxStage:0,recruiter:o.recruiter,screening:null,stageSince:today()});
 const score=match(candidate,o).score;
 log(`${candidate.name} applied for ${o.title}`,'application',aid);
 notify(`New application: ${candidate.name} scored ${score}% for ${o.title}`,['candidate',cid]);
 return {cid,aid,score,candidate};
}
function assignRecruiter(appIds,recruiter){appIds.forEach(id=>repo.update('applications',id,{recruiter}))}
