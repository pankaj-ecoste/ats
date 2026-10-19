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
/* ---------- files and duplicates ---------- */
// the person who already has this email or phone number, or null. A phone number is compared by its last 10 digits (+91 and spaces do not matter).
const phoneKey=p=>{const d=String(p||'').replace(/\D/g,'');return d.length>=7?d.slice(-10):''};
function findDuplicateCandidate({email,phone},exceptId){
 const e=String(email||'').trim().toLowerCase(),p=phoneKey(phone);
 if(!e&&!p)return null;
 return S.candidates.find(c=>c.id!==exceptId&&!c.restricted&&((e&&String(c.email||'').trim().toLowerCase()===e)||(p&&phoneKey(c.phone)===p)))||null;
}
// the original résumé file (kept in storage); `old` is the path it replaces, or null
function attachResume(cid,{path,name}){
 const c=repo.update('candidates',cid,{resumePath:path,resumeName:name});
 log(`Resume file uploaded for ${c.name}: ${name}`,'note');
 return c;
}
// The text read from a stored résumé file becomes the candidate's résumé text, and fills only what is still empty (what the person typed is never overwritten).
function applyResumeText(cid,text){
 const p=parseResume(text);
 const c=repo.update('candidates',cid,c=>{
  c.resumeText=text;
  if(!c.designation&&p.designation)c.designation=p.designation;
  if(!c.company&&p.company)c.company=p.company;
  if(!c.location&&p.location)c.location=p.location;
  if(!c.exp&&p.exp)c.exp=p.exp;
  c.skills=[...new Set([...(c.skills||[]),...p.skills])];
  if(!(c.certifications||[]).length)c.certifications=p.certifications;
 });
 log(`Resume text read for ${c.name}`,'note');
 return c;
}
// the real file behind a checklist item; a Pending item becomes Received
function attachDocumentFile(cid,index,{path,file}){
 const c=repo.update('candidates',cid,c=>{const d=c.documents[index];d.path=path;d.file=file;if(d.status==='Pending')d.status='Received'});
 log(`${c.documents[index].name} uploaded for ${c.name}`,'note');
 return c;
}
// Every message is kept: who, which channel, what was said. status: 'Sent' once the person has handed it to their own email or WhatsApp, 'Composed' if only drafted.
function recordMessage({cid,aid,channel,template,subject='',body='',status='Sent'}){
 const m=repo.insert('messages',{id:crypto.randomUUID(),cid,aid:aid||null,channel,template:template||'',subject,body,status,by:S.settings.user,ts:Date.now()});
 log(`${channel} ${status==='Sent'?'sent':'drafted'} to ${getC(cid).name}: ${template}`,'message',aid);
 return m;
}
