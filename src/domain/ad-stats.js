/* What an ad brought in, counted from the applications of its opening. DOM-free; nothing here is stored. */
"use strict";
// a source counts as an ad when its name says so: Facebook Ad, Google Ad, Instagram Ad, Ad campaign, a custom "Meta Ads"
const isAdSource=s=>/\bads?\b|campaign/i.test(String(s||''));
// o: the opening (with o.ad). apps: its applications. sourceOf: how to read an application's source.
// Counted: applications from an ad source that arrived from the day the ad started (the day it was requested, until it starts)
// and, once the ad has ended, up to that day. Leads that came before, or from other sources, are not the ad's and are only counted aside.
function adStats(o,apps,sourceOf=a=>a.source){
 const ad=o.ad||{};
 const from=ad.startOn||ad.raisedOn||'',to=ad.endOn||'';
 const mine=apps.filter(a=>isAdSource(sourceOf(a))&&(!from||a.date>=from)&&(!to||a.date<=to));
 const reached=i=>mine.filter(a=>a.maxStage>=i).length;
 const leads=mine.length,screened=reached(3),interviewed=reached(4);
 const hired=mine.filter(a=>a.maxStage>=7&&a.stage!=='Rejected').length;   // offer accepted or later, and still with us
 const per=n=>ad.spend>0&&n>0?Math.round(ad.spend/n):null;
 return {from,to,leads,screened,interviewed,hired,costPerLead:per(leads),costPerHire:per(hired),other:apps.length-leads};
}
