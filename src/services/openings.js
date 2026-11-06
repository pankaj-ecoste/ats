/* Openings. DOM-free. */
"use strict";
// the screening questions a recruiter asks on every call for this opening: tidy, at most 10, no repeat (the database checks the same)
function setScreenQuestions(opId,list){
 const seen=new Set(),clean=[];
 list.forEach(x=>{const t=String(x||'').replace(/\s+/g,' ').trim().slice(0,200);const k=t.toLowerCase();if(t&&!seen.has(k)){seen.add(k);clean.push(t)}});
 if(clean.length>10)throw new Error('At most 10 questions of your own for one opening');
 return repo.update('openings',opId,{screenQ:clean});
}
// The ad asked for an opening is optional and one per opening. o.ad is {} (or missing) when none was asked for.
const hasAd=o=>!!(o&&o.ad&&o.ad.status);
// tidy what the recruiter typed: trimmed text, real numbers (blank removes the field), real dates, a known status
function tidyAd(f,prev){
 const txt=(v,n)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);
 const num=(v,name)=>{if(v===''||v==null)return undefined;const n=Number(v);if(!Number.isFinite(n)||n<0)throw new Error(name+' must be a number, zero or more');return n};
 const day=(v,name)=>{const t=txt(v,10);if(t&&!/^\d{4}-\d{2}-\d{2}$/.test(t))throw new Error(name+' is not a date');return t};
 const status=f.status||prev.status;if(!AD_STATUS.includes(status))throw new Error('Choose a status for the ad');
 const startOn=day(f.startOn,'Start date'),endOn=day(f.endOn,'End date');
 if(startOn&&endOn&&endOn<startOn)throw new Error('The end date is before the start date');
 const ad={status,raisedOn:prev.raisedOn,raisedBy:prev.raisedBy,startOn,endOn,platform:txt(f.platform,80),link:txt(f.link,500),notes:String(f.notes||'').trim().slice(0,2000),withSalary:!!f.withSalary};
 const budget=num(f.budget,'Budget'),spend=num(f.spend,'Spend');
 if(budget!==undefined)ad.budget=budget;if(spend!==undefined)ad.spend=spend;
 if(prev.sent)ad.sent=prev.sent;   // the briefs already sent to marketing stay on the record
 return ad;
}
// Ask for an ad on this opening (nothing happens if one is already asked for)
function requestAd(opId){
 const o=getOp(opId);if(hasAd(o))return o.ad;
 repo.update('openings',opId,{ad:{status:'Requested',raisedOn:today(),raisedBy:S.settings.user,withSalary:false}});
 log(`Ad requested for ${o.title}`,'opening');
 return getOp(opId).ad;
}
function saveAdRequest(opId,fields){
 const o=getOp(opId);if(!hasAd(o))throw new Error('No ad was asked for on this opening');
 const before=o.ad.status,ad=tidyAd(fields,o.ad);   // read the old status first: update changes o in place
 repo.update('openings',opId,{ad});
 if(ad.status!==before)log(`Ad for ${o.title} is now ${ad.status}`,'opening');
 return ad;
}
// A brief to marketing was handed over (email app, WhatsApp, or copied). Kept on the ad, newest 20, with the exact text.
function recordAdBrief(opId,{channel,to='',subject='',body=''}){
 const o=getOp(opId);if(!hasAd(o))throw new Error('No ad was asked for on this opening');
 if(!['Email','WhatsApp','Copied'].includes(channel))throw new Error('Unknown way of sending the brief');
 const sent=[...(o.ad.sent||[]),{ts:Date.now(),by:S.settings.user,channel,to:String(to).trim().slice(0,120),subject:String(subject).slice(0,200),body:String(body).slice(0,5000)}].slice(-20);
 repo.update('openings',opId,{ad:{...o.ad,sent}});
 log(`Ad brief for ${o.title} ${channel==='Copied'?'copied':'sent by '+channel.toLowerCase()}`,'opening');
}
// "No ad needed" again: the opening goes back to leads from the sheet only
function dropAdRequest(opId){
 const o=getOp(opId);if(!hasAd(o))return;
 repo.update('openings',opId,{ad:{}});
 log(`Ad request removed from ${o.title}`,'opening');
}
// id: the opening being edited, or falsy to create `data` as a new opening
function saveOpening(data,id){
 if(id)return repo.update('openings',id,data);
 const o=repo.insert('openings',data);
 log(`Opening ${o.title} created`,'opening');
 return o;
}
