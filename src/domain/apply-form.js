/* The application form of an opening: which of the usual questions it asks, and the recruiter's own extra questions. Pure, no DOM.
   Stored on the opening as {hide: [...], questions: [...]} (migration 0026); an empty form is the form as it always was.
   Name, email, phone and the consent are always asked: the person is found again by them. */
"use strict";

// the usual questions that can be switched off for an opening
const FORM_FIELDS=[
 {key:'location',label:'Current city'},{key:'exp',label:'Total experience'},{key:'notice',label:'Notice period'},
 {key:'cur',label:'Current salary'},{key:'expected',label:'Expected salary'},{key:'edu',label:'Highest qualification'},
 {key:'skills',label:'Key skills'},{key:'resume',label:'Resume upload'}];
const FORM_TYPES=[['text','Short answer'],['long','Long answer'],['number','Number'],['yesno','Yes or No'],['choice','Choose one']];
const FORM_MAX_QUESTIONS=15,FORM_MAX_OPTIONS=10,FORM_MAX_LABEL=200;

// the form of an opening as a draft that can be edited: always complete, never shared with the opening
function formOf(o){
 const f=(o&&o.form)||{};
 return {hide:[...(f.hide||[])],questions:(f.questions||[]).map(q=>({id:q.id,label:q.label,type:q.type,required:!!q.required,options:[...(q.options||[])]}))};
}

// a short id nobody else on this form has: letters and digits, as the database wants
function newQuestionId(existing){
 const have=new Set(existing||[]),letters='abcdefghijkmnpqrstuvwxyz23456789';
 for(;;){let id='q';for(let i=0;i<5;i++)id+=letters[Math.floor(Math.random()*letters.length)];if(!have.has(id))return id}
}
const newQuestion=existing=>({id:newQuestionId(existing.map(q=>q.id)),label:'',type:'text',required:false,options:[]});

// what the database keeps: spaces trimmed, options only for a choice, nothing at all for the plain form
function formToStore(draft){
 const hide=FORM_FIELDS.map(f=>f.key).filter(k=>(draft.hide||[]).includes(k));
 const questions=(draft.questions||[]).map(q=>({id:q.id,label:String(q.label||'').trim(),type:q.type,required:!!q.required,
  options:q.type==='choice'?(q.options||[]).map(o=>String(o).trim()).filter(Boolean):[]}));
 const out={};
 if(hide.length)out.hide=hide;
 if(questions.length)out.questions=questions;
 return out;
}

// what is wrong with a draft, in words; '' when it can be saved (the database checks the same again)
function formProblem(draft){
 const qs=formToStore(draft).questions||[];
 if(qs.length>FORM_MAX_QUESTIONS)return `Ask at most ${FORM_MAX_QUESTIONS} questions of your own`;
 const seen=new Set();
 for(let i=0;i<qs.length;i++){
  const q=qs[i],n=i+1;
  if(!q.label)return `Question ${n} has no text`;
  if(q.label.length>FORM_MAX_LABEL)return `Question ${n} is too long (at most ${FORM_MAX_LABEL} characters)`;
  if(seen.has(q.label.toLowerCase()))return `"${q.label}" is asked twice. Every question needs different words`;
  seen.add(q.label.toLowerCase());
  if(q.type==='choice'){
   if(q.options.length<2)return `"${q.label}" needs at least two options, one per line`;
   if(q.options.length>FORM_MAX_OPTIONS)return `"${q.label}" has too many options (at most ${FORM_MAX_OPTIONS})`;
   if(q.options.some(o=>o.length>100))return `An option of "${q.label}" is too long (at most 100 characters)`;
   if(new Set(q.options.map(o=>o.toLowerCase())).size<q.options.length)return `"${q.label}" has the same option twice`;
  }
 }
 return '';
}

// the same form said in one line, for a list ("5 usual questions switched off, 2 of your own")
function formSummary(o){
 const f=formOf(o),off=f.hide.length,own=f.questions.length;
 if(!off&&!own)return 'Standard form';
 return [off?`${off} usual question${off>1?'s':''} off`:'',own?`${own} of your own`:''].filter(Boolean).join(', ');
}
