/* Candidate profile: notes, documents, resume edits, messages. DOM-free. */
"use strict";
function addCandidateNote(cid,text){
 const c=repo.update('candidates',cid,c=>c.notes.unshift({text,by:S.settings.user,ts:Date.now()}));
 log(`Note added on ${c.name}`,'note');
 return c;
}
function setDocumentStatus(cid,index,status){return repo.update('candidates',cid,c=>{c.documents[index].status=status})}
function requestDocument(cid,name){return repo.update('candidates',cid,c=>c.documents.push({name,status:'Pending'}))}
// fields: already-parsed values from the resume editor (skills as arrays, numbers as numbers)
function updateCandidateProfile(cid,fields){
 const c=repo.update('candidates',cid,c=>{Object.assign(c,fields);c.resumeText=c.resumeText.replace(/^.*$/m,c.name)});
 log(`Resume data edited for ${c.name}`,'note');
 return c;
}
// today this only records that a message was composed; real delivery arrives in Phase 3
function recordMessage({cid,aid,channel,template}){
 log(`${channel} sent to ${getC(cid).name}: ${template}`,'message',aid);
}
