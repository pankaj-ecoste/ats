/* Management report: event history, call log, targets, backups, drop-outs. DOM-free. */
"use strict";
const REP_DEF={offerAlert:70,noShowAlert:25,dueSoon:7};

// one row per thing that happened (shortlist, interview, offer, joined ...), used by the report's weekly history
function addEvent(t,aid,extra={}){
 const a=aid?getA(aid):null;
 return repo.insert('events',{d:today(),t,aid:aid||null,op:a?a.opId:extra.op||null,...extra},{end:true});
}

// record report events when a stage changes (fires before moveStage writes the new stage)
onEvent('stage:changing',({aid,stage,prev})=>{
 const a=getA(aid);
 const map={Shortlisted:'shortlist',Selected:'selected','Offer Accepted':'accepted'};if(map[stage])addEvent(map[stage],aid);
 if(stage==='Onboarding'&&!a.joinedOn){repo.update('applications',aid,{joinedOn:today()});addEvent('joined',aid,{days:daysBetween(a.date,today()),src:getC(a.cid).source})}
 if(stage==='Rejected'&&['Offer Accepted','Joining'].includes(prev)){repo.update('applications',aid,{dropped:today()});addEvent('dropped',aid)}
});

function setReportThreshold(key,value){repo.root('settings',s=>{s.report=s.report||{...REP_DEF};s.report[key]=value})}
// removes the generated sample history; real activity is kept
function clearDemoHistory(){
 repo.root('events',(S.events||[]).filter(e=>!e.demo));
 repo.root('callLog',(S.callLog||[]).filter(e=>!e.demo));
 repo.root('postings',(S.postings||[]).filter(p=>!p.demo));
 repo.root('demoHistory',false);
}
function logCalls({d,op,made,conn}){return repo.insert('callLog',{id:uid('CL'),d,op,made,conn},{end:true})}
function deleteCallLog(id){return repo.remove('callLog',id)}
// entries: [[monthKey,field,value],...] e.g. [['2026-10','target',8]]
function saveMonthlyTargets(entries){
 if(!S.monthly)repo.root('monthly',{});
 repo.root('monthly',m=>{entries.forEach(([k,f,v])=>{m[k]=m[k]||{};m[k][f]=v})});
}
function setDropRisk(aid,risk){return repo.update('applications',aid,{dropRisk:risk})}
// backupAid empty clears the backup
function setBackup(aid,backupAid,status){
 const a=getA(aid),had=!!a.backup;
 if(!backupAid){repo.update('applications',aid,{backup:null});return}
 repo.update('applications',aid,{backup:{aid:backupAid,status}});
 if(!had)addEvent('backup',aid);
 log(`Backup ${getC(getA(backupAid).cid).name} lined up for ${getC(a.cid).name}`,'info',aid);
}
// candidate dropped after an offer. Returns {promoted: the backup application moved to Selected, or null}
function recordDropout(aid,{reason,promoteBackup}){
 const a=getA(aid),b=a.backup&&getA(a.backup.aid);
 if(a.stage==='Offer'){repo.update('applications',aid,{dropped:today()});addEvent('dropped',aid)}
 moveStage(aid,'Rejected');
 if(reason)repo.update('candidates',a.cid,c=>c.notes.unshift({text:'Dropped after offer: '+reason,by:S.settings.user,ts:Date.now()}));
 let promoted=null;
 if(b&&promoteBackup){moveStage(b.id,'Selected');promoted=b}
 repo.update('applications',aid,{backup:null});
 return {promoted};
}
