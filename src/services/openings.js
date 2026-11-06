/* Openings. DOM-free. */
"use strict";
// the screening questions a recruiter asks on every call for this opening: tidy, at most 10, no repeat (the database checks the same)
function setScreenQuestions(opId,list){
 const seen=new Set(),clean=[];
 list.forEach(x=>{const t=String(x||'').replace(/\s+/g,' ').trim().slice(0,200);const k=t.toLowerCase();if(t&&!seen.has(k)){seen.add(k);clean.push(t)}});
 if(clean.length>10)throw new Error('At most 10 questions of your own for one opening');
 return repo.update('openings',opId,{screenQ:clean});
}
// id: the opening being edited, or falsy to create `data` as a new opening
function saveOpening(data,id){
 if(id)return repo.update('openings',id,data);
 const o=repo.insert('openings',data);
 log(`Opening ${o.title} created`,'opening');
 return o;
}
