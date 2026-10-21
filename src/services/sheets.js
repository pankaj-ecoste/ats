/* Google Sheets: workbook import, the sheet log, and auto-import (rows -> candidates and applications). DOM-free.
   SheetsIO is loaded later (features/sheets/sheets-io.js) and is only used when a function here runs. */
"use strict";
const GS_KEYS=[['openings','Openings'],['candidates','Candidates'],['applications','Applications'],['groups','Group Interviews'],['interviews','Interviews'],['offers','Offers'],['onboarding','Onboarding'],['tasks','Tasks']];

function logSheetEvent(text){return repo.insert('sheetLog',{ts:Date.now(),text})}

// out: collections parsed from the workbook; settings: parsed Settings tab or null; mode: 'replace' | 'merge'. Returns the row count.
function applyWorkbookImport({out,settings,mode,fname}){
 GS_KEYS.forEach(([k])=>{
  const next=out[k];if(!next)return;
  if(mode==='replace')repo.root(k,next);
  else{const idOf=x=>x.id||x.appId;const m=new Map(S[k].map(x=>[idOf(x),x]));next.forEach(x=>m.set(idOf(x),{...(m.get(idOf(x))||{}),...x}));repo.root(k,[...m.values()])}
 });
 if(settings)repo.root('settings',s=>{Object.entries(settings).forEach(([k,v])=>{if(k==='weights'){if(Object.values(v).some(Boolean))s.weights=v}else if(v!==''&&v!=null)s[k]=v})});
 const n=GS_KEYS.reduce((t,[k])=>t+(out[k]?out[k].length:0),0);
 logSheetEvent(`Loaded ${fname} (${mode}, ${n} rows)`);
 log(`Data loaded from Google Sheets (${mode})`,'info');
 notify(`Loaded ${n} rows from ${fname}`,['sheets']);
 return n;
}

/* ---------- auto-import ---------- */
// plan: rows classified by planImport() ('new' | 'dup' | 'seen' | 'skip'). Adds the new ones and remembers what was handled.
function importSheetRows(plan){
 let added=0;const names=[],seenKeys=[];
 plan.forEach(p=>{
  if(p.key&&p.status==='dup')seenKeys.push(p.key);
  if(p.status!=='new')return;
  const r=p.r;let c=p.ex;
  if(!c){
   const skills=String(r.skills||'').split(/[,;|\/\n]/).map(s=>s.trim()).filter(Boolean);const isUrl=/^https?:\/\//i.test(String(r.resume||''));
   let cidG='C-G'+h36(String(r.email||'').trim().toLowerCase()||String(r.phone||'').replace(/\D/g,'').slice(-10)||String(r.name).toLowerCase());while(S.candidates.some(x=>x.id===cidG))cidG+='X';
   c={id:cidG,name:String(r.name).trim(),email:String(r.email||'').trim(),phone:String(r.phone||'').trim(),designation:String(r.designation||'—'),company:String(r.company||'—'),exp:numIn(r.exp)??0,location:String(r.location||'—'),reloc:false,
    education:String(r.education||'Graduate'),eduField:'General',university:'—',gradYear:'',skills,curSal:toLPA(r.curSal),expSal:toLPA(r.expSal),notice:toNotice(r.notice),certifications:[],achievements:[],source:String(r.source||'Google Sheet'),created:today(),
    history:[{company:String(r.company||'—'),designation:String(r.designation||'—'),from:'—',to:'Present',summary:'Imported from Google Sheet.'}],documents:[{name:isUrl?'Resume (link)':'Resume',status:r.resume?'Received':'Pending',url:isUrl?String(r.resume):''}],notes:isUrl?[{text:'Resume link: '+r.resume,by:'Google Sheet sync',ts:Date.now()}]:[]};
   c.resumeText=r.resume&&!isUrl&&String(r.resume).length>60?String(r.resume):buildResume(c);
   repo.insert('candidates',c);
  }
  const date=SheetsIO.readDate(r.date)||today();let aid='APP-G'+h36(p.key);while(S.applications.some(x=>x.id===aid))aid+='X';
  repo.insert('applications',{id:aid,cid:c.id,opId:p.op.id,date,stage:'New',maxStage:0,recruiter:p.op.recruiter,screening:null,stageSince:today()});
  log(`${c.name} applied for ${p.op.title} (Google Sheet)`,'application',aid);
  seenKeys.push(p.key);added++;names.push(c.name);
 });
 if(seenKeys.length)markSheetRowsSeen(seenKeys);
 return {added,names};
}
function markSheetRowsSeen(keys){repo.root('autoSync',cfg=>{cfg.seen.push(...keys)})}
// fields replace the connection settings; resetSeen forgets which rows were handled (a different sheet was chosen)
function saveAutoSyncConfig(fields,{resetSeen=false}={}){repo.root('autoSync',cfg=>{if(resetSeen)cfg.seen=[];Object.assign(cfg,fields)})}
function recordSheetConnected({title,tab,read,added}){
 repo.root('autoSync',cfg=>{
  cfg.lastRun=Date.now();cfg.last={read,added,skipped:0,dup:0};
  cfg.log.unshift({ts:Date.now(),text:`Connected “${title||'sheet'}” (${tab}); imported ${added}`});cfg.log=cfg.log.slice(0,20);
 });
}
function recordSyncRun({title,read,added,skipped,dup}){
 repo.root('autoSync',cfg=>{
  if(title)cfg.title=title;
  cfg.lastRun=Date.now();cfg.last={read,added,skipped,dup};
  cfg.log.unshift({ts:Date.now(),text:`Read ${read} rows, added ${added}`});cfg.log=cfg.log.slice(0,20);
 });
}
// stop: the failure needs the user (sign-in, permission) so automatic checks are switched off
function recordSyncFailure(text,stop){
 repo.root('autoSync',cfg=>{cfg.log.unshift({ts:Date.now(),text});cfg.log=cfg.log.slice(0,20);if(stop)cfg.enabled=false});
}
function setAutoSyncEnabled(enabled){repo.root('autoSync',cfg=>{cfg.enabled=enabled})}
function disconnectAutoSync(){repo.root('autoSync',null)}
