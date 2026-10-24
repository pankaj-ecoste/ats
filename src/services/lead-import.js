/* Importing a list of leads (from a spreadsheet) into one opening: who is new, who is already here, who cannot be used. DOM-free. */
"use strict";
const LEAD_IMPORT_MAX=10000;

// table: {rows} from leadTable(); map: {field: header}. Returns the rows, each marked
//   new       a person not in the system: a candidate and an application will be added
//   existing  already in the system but never applied to this opening: only an application is added
//   dup       already applied to this opening, or repeated in this file: left out
//   skip      cannot be used (no name, or no usable phone or email): left out
function planLeads(table,map,opId){
 const byEmail=new Map(),byPhone=new Map();
 S.candidates.forEach(c=>{
  const e=String(c.email||'').trim().toLowerCase(),p=phoneKey(c.phone);
  if(e)byEmail.set(e,c);if(p)byPhone.set(p,c);
 });
 const applied=new Set(S.applications.filter(a=>a.opId===opId).map(a=>a.cid));
 const seenE=new Set(),seenP=new Set();
 return table.rows.map(row=>{
  const g=f=>map[f]?String(row[map[f]]??'').trim():'';
  const ph=cleanLeadPhone(g('phone')),em=g('email').toLowerCase(),email=LEAD_EMAIL.test(em)?em:'';
  const it={n:row.n,name:g('name'),phone:ph.text,email,status:'new',why:''};
  if(!it.name){it.status='skip';it.why='No name';return it}
  if(!ph.key&&!email){it.status='skip';it.why=g('phone')||em?'Phone or email is not valid':'No phone or email';return it}
  const ex=(email&&byEmail.get(email))||(ph.key&&byPhone.get(ph.key))||null;
  if((email&&seenE.has(email))||(ph.key&&seenP.has(ph.key))){it.status='dup';it.why='Repeated in this file';return it}
  if(email)seenE.add(email);if(ph.key)seenP.add(ph.key);
  if(ex){
   it.ex=ex.id;it.exName=ex.name;
   if(applied.has(ex.id)){it.status='dup';it.why=`Already applied for this opening (${ex.name})`}
   else{it.status='existing';it.why=`Already in the system as ${ex.name}`}
   return it;
  }
  const today0=today();
  it.v={
   location:g('location'),exp:numIn(g('exp'))??0,designation:g('designation'),company:g('company'),education:g('education'),
   skills:g('skills').split(/[,;|\/\n]/).map(s=>s.trim()).filter(Boolean),curSal:toLPA(g('curSal')),expSal:toLPA(g('expSal')),
   notice:g('notice')?toNotice(g('notice')):30,source:g('source'),date:leadDate(g('date'),today0),notes:g('notes'),
  };
  return it;
 });
}
const leadCounts=plan=>plan.reduce((t,p)=>(t[p.status]++,t),{new:0,existing:0,dup:0,skip:0});

// The usable rows of a plan become candidates (new people) and applications for the opening, saved together in batches.
// source: used when the row has none. Returns {added, existing, ids}.
function importLeads(plan,{opId,source}){
 const o=getOp(opId);if(!o)throw new Error('Choose the opening these leads are for');
 const use=plan.filter(p=>p.status==='new'||p.status==='existing');
 if(!use.length)return {added:0,existing:0,ids:[]};
 if(use.length>LEAD_IMPORT_MAX)throw new Error(`Import at most ${LEAD_IMPORT_MAX.toLocaleString('en-IN')} leads at a time`);
 const cands=[],apps=[],ids=[];let existing=0;
 use.forEach(p=>{
  let cid=p.ex,date=today();
  if(p.status==='new'){
   const v=p.v;cid=uid('C');date=v.date;
   const src=v.source||source||'Ad campaign';
   cands.push({id:cid,name:p.name,email:p.email,phone:p.phone,designation:v.designation||'—',company:v.company||'—',exp:v.exp,location:v.location||'—',reloc:false,
    education:v.education||'—',eduField:'General',university:'—',gradYear:'',skills:v.skills,curSal:v.curSal,expSal:v.expSal,notice:v.notice,certifications:[],achievements:[],
    source:src,created:date,history:[],documents:[{name:'Resume',status:'Pending'}],
    notes:v.notes?[{text:v.notes,by:S.settings.user,ts:Date.now()}]:[],
    resumeText:`${p.name}\n${[p.phone,p.email,v.location].filter(Boolean).join(' · ')}\nLead from ${src}, ${fmtD(date)}. No resume yet.`});
  }else existing++;
  const aid=uid('APP');ids.push(cid);
  apps.push({id:aid,cid,opId,date,stage:'New',maxStage:0,recruiter:o.recruiter,screening:null,stageSince:today()});
 });
 // the candidates are written first: an application refers to its candidate
 repo.insertMany('candidates',cands);
 repo.insertMany('applications',apps);
 log(`Imported ${apps.length} leads for ${o.title}${source?' from '+source:''}`,'info');
 notify(`${apps.length} leads were imported for ${o.title}`,['candidates'],[o.recruiter]);
 return {added:apps.length,existing,ids};
}
