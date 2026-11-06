/* The calling queue: who is still to be called, in what order, and the links to call them. Pure: the page only draws what this returns. */
"use strict";
// the statuses behind the big buttons (keys 1 to 7, in this order); every other status sits under "More"
const CALL_QUICK=['Connected','Call not connected','Busy','Switched Off','Call Back Requested','Not Interested','Wrong Number'];
// a lead with one of these is worth another try, so it goes to the "Call again" list
const CALL_AGAIN=['Call not connected','Busy','Call Back Requested','Follow-UP'];
// a lead that has moved on (rejected, on hold, interviewed, hired) is not called from the queue
const CALL_LIVE_STAGES=['New','Shortlisted','Screening'];
const callMore=all=>all.filter(s=>s!=='NA'&&!CALL_QUICK.includes(s));

// apps: the applications. mode 'new' = never called, 'again' = a call that did not settle.
// who: a recruiter's name ('' = everyone); opId: one opening ('' = all); skip: ids to leave out (skipped for now, or held).
// 'new' goes in the order people applied, oldest first; 'again' by the oldest attempt first.
function callQueue(apps,{mode='new',who='',opId='',skip=new Set()}={}){
 const list=apps.filter(a=>{
  if(skip.has(a.id))return false;
  if(who&&a.recruiter!==who)return false;
  if(opId&&a.opId!==opId)return false;
  const st=a.appCall||'NA';
  return mode==='new'?st==='NA'&&a.stage==='New':CALL_AGAIN.includes(st)&&CALL_LIVE_STAGES.includes(a.stage);
 });
 const key=mode==='new'?a=>String(a.date||'')+'|'+a.id:a=>String(a.appCallAt||0).padStart(15,'0')+'|'+a.id;
 return list.sort((x,y)=>key(x)<key(y)?-1:key(x)>key(y)?1:0);
}
// how many of these applications had a call logged on that day (a day as iso text, e.g. today())
const calledOn=(apps,day,{who='',opId=''}={})=>apps.filter(a=>a.appCall&&a.appCallAt&&iso(new Date(a.appCallAt))===day&&(!who||a.recruiter===who)&&(!opId||a.opId===opId)).length;
// the link that makes a phone dial: a plus sign, the country code and the number; none when the number cannot be used
const telLink=phone=>{const n=whatsappNumber(phone);return n?'tel:+'+n:''};
