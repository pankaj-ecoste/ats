/* Database rows -> the app's own records. Pure: no network, no DOM, no S.
   The app keeps people as names ("Priya Sharma") and the database as profile ids; `people` translates.
   Database column names are snake_case, app fields are the short names the screens already use. */
"use strict";

/* ---------- people ---------- */
// profiles: [{id, username, full_name, role, active}]. A name is full_name, or the username when there is none.
function makePeople(profiles){
 const nameOf=new Map(),idOf=new Map();
 (profiles||[]).forEach(p=>{
  const n=p.full_name||p.username||'';
  nameOf.set(p.id,n);
  if(n&&!idOf.has(n))idOf.set(n,p.id);   // two people with the same name: the first one wins
 });
 return {
  name:id=>(id&&nameOf.get(id))||'',          // '' when nobody (or someone this account may not see)
  id:name=>(name&&idOf.get(name))||null,
  names:role=>(profiles||[]).filter(p=>p.active&&(!role||[].concat(role).includes(p.role))).map(p=>p.full_name||p.username),
 };
}

/* ---------- small helpers ---------- */
const dbTime=t=>t?String(t).slice(0,5):'';          // '15:00:00' -> '15:00'
const dbMs=t=>t?new Date(t).getTime():0;             // timestamptz -> milliseconds, as the app keeps them
const byKey=(rows,key)=>{const m=new Map();rows.forEach(r=>{if(!m.has(r[key]))m.set(r[key],[]);m.get(r[key]).push(r)});return m};
// copies only the fields that have a value, so a record looks like one the app made itself
const withValues=(base,extra)=>{Object.entries(extra).forEach(([k,v])=>{if(v!==null&&v!==undefined)base[k]=v});return base};

/* ---------- one record from one row ---------- */
const FROM_ROW={
 opening:(r,P)=>({id:r.id,title:r.title,dept:r.dept,positions:r.positions,location:r.location,mode:r.mode,type:r.type,
  expMin:r.exp_min,expMax:r.exp_max,salMin:r.sal_min,salMax:r.sal_max,education:r.education,mandatory:r.mandatory,preferred:r.preferred,
  desc:r.description,resp:r.responsibilities,req:r.requirements,recruiter:P.name(r.recruiter_id),manager:P.name(r.manager_id),
  opened:r.opened_on,target:r.target_on||'',priority:r.priority,status:r.status}),
 candidate:(r,P,ctx)=>{
  const comp=ctx.compensation.get(r.id);
  return {id:r.id,name:r.name,designation:r.designation,company:r.company,exp:r.exp_years,location:r.location,education:r.education,
   eduField:r.edu_field,university:r.university,gradYear:r.grad_year,skills:r.skills,
   // salary is hidden from some roles (and a candidate may have none yet): null means "not known", never a made-up zero
   curSal:comp?comp.current_lpa:null,expSal:comp?comp.expected_lpa:null,
   notice:r.notice_days,reloc:r.relocate,email:r.email,phone:r.phone,certifications:r.certifications,achievements:r.achievements,
   documents:(ctx.documents.get(r.id)||[]).map(d=>({name:d.name,status:d.status})),notes:r.notes,source:r.source,created:r.created_on,
   history:r.history,resumeText:r.resume_text};
 },
 application:(r,P,ctx)=>{
  const s=ctx.screenings.get(r.id);
  return withValues({id:r.id,cid:r.candidate_id,opId:r.opening_id,date:r.applied_on,stage:r.stage,maxStage:r.max_stage,
   recruiter:P.name(r.recruiter_id),screening:s?{outcome:s.outcome,answers:s.answers,notes:s.notes,date:s.screened_on,...(s.duration_seconds?{duration:s.duration_seconds}:{})}:null,stageSince:r.stage_since},
   {joining:r.joining_on,joinedOn:r.joined_on,dropped:r.dropped_on,dropRisk:r.drop_risk,
    backup:r.backup_application_id?{aid:r.backup_application_id,status:r.backup_status}:null});
 },
 group:(r,P,ctx)=>({id:r.id,opId:r.opening_id,date:r.on_date,time:dbTime(r.at_time),duration:r.duration_min,mode:r.mode,location:r.location,link:r.link,
  panel:r.panel,interviewers:(r.interviewer_ids||[]).map(P.name),appIds:(ctx.groupApps.get(r.id)||[]),evaluated:r.evaluated}),
 interview:(r,P)=>withValues({id:r.id,appId:r.application_id,kind:r.kind,round:r.round,date:r.on_date,time:dbTime(r.at_time),duration:r.duration_min,
  mode:r.mode,location:r.location,link:r.link,interviewers:(r.interviewer_ids||[]).map(P.name),status:r.status,invite:r.invite,
  scores:r.scores,rec:r.recommendation,feedback:r.feedback},{groupId:r.group_id,decision:r.decision}),
 offer:(r,P)=>({id:r.id,appId:r.application_id,designation:r.designation,dept:r.dept,location:r.location,joining:r.joining_on,manager:P.name(r.manager_id),
  empType:r.emp_type,ctc:r.ctc,breakup:r.breakup,status:r.status,created:r.created_on,sent:r.sent_on,custom:r.custom_letter,probation:r.probation_months,
  validity:r.validity_days,approval:r.approval_status,letterPath:r.letter_path}),
 onboarding:(r,P,ctx)=>({appId:r.application_id,start:r.started_on,
  items:(ctx.items.get(r.application_id)||[]).map(i=>({cat:i.category,t:i.title,done:i.done}))}),
 task:(r,P)=>({id:r.id,title:r.title,due:r.due_on||'',related:r.related,priority:r.priority,done:r.done,owner:P.name(r.owner_id)}),
 notification:r=>({id:r.id,text:r.text,ts:dbMs(r.created_at),read:r.read,go:r.link}),
 activity:r=>withValues({ts:dbMs(r.at),text:r.text,type:r.type},{appId:r.application_id}),
 board:r=>({id:r.id,name:r.name,type:r.type,fmt:r.format,color:r.color,src:r.source_name,url:r.url,...(r.custom?{custom:true}:{})}),
 posting:r=>({id:r.id,opId:r.opening_id,board:r.board_id,status:r.status,postedOn:r.posted_on,url:r.url,expires:r.expires_on||'',cost:r.cost,...(r.demo?{demo:1}:{})}),
 event:r=>withValues({d:r.on_date,t:r.type,aid:r.application_id,op:r.opening_id},{days:r.days,src:r.source,...(r.demo?{demo:1}:{})}),
 call:r=>({id:r.id,d:r.on_date,op:r.opening_id,made:r.made,conn:r.connected,...(r.demo?{demo:1}:{})}),
 sheetLog:r=>({ts:dbMs(r.at),text:r.text}),
};

const hiddenCandidate=id=>({id,name:'Candidate (hidden)',designation:'',company:'',exp:0,location:'',education:'',eduField:'',university:'',gradYear:null,skills:[],curSal:null,expSal:null,
 notice:0,reloc:false,email:'',phone:'',certifications:[],achievements:[],documents:[],notes:[],source:'',created:'',history:[],resumeText:'',restricted:true});

/* ---------- the whole state ---------- */
// rows: what the loader fetched, one array per table (a table the account may not read is just empty).
// Returns the same shape the app keeps in S, except the person-only parts (settings.user, theme) which the caller sets.
function stateFromRows(rows,people){
 const P=people;
 const ctx={
  compensation:new Map((rows.candidate_compensation||[]).map(r=>[r.candidate_id,r])),
  documents:byKey((rows.candidate_documents||[]).slice().sort((a,b)=>a.id-b.id),'candidate_id'),
  screenings:new Map((rows.screenings||[]).map(r=>[r.application_id,r])),
  items:byKey((rows.onboarding_items||[]).slice().sort((a,b)=>a.position-b.position),'application_id'),
  groupApps:new Map(),
 };
 (rows.interviews||[]).forEach(i=>{if(i.group_id){if(!ctx.groupApps.has(i.group_id))ctx.groupApps.set(i.group_id,[]);ctx.groupApps.get(i.group_id).push(i.application_id)}});
 const newest=(list,f)=>list.slice().sort((a,b)=>String(b.created_at||b.at).localeCompare(String(a.created_at||a.at))).map(f);   // newest first, like repo.insert
 const stamp=r=>r.created_at||r.at||r.started_on||r.posted_on||r.on_date||'';
 const oldest=(list,f)=>list.slice().sort((a,b)=>String(stamp(a)).localeCompare(String(stamp(b)))).map(f);
 const row=name=>r=>FROM_ROW[name](r,P,ctx);
 const s=rows.company_settings&&rows.company_settings[0];
 const cfg=(s&&s.config)||{};
 const settings=s?{company:s.company,companyAddr:s.address,signatory:s.signatory,signTitle:s.sign_title,threshold:s.match_threshold,weights:s.match_weights,
  ...(cfg.sla?{sla:cfg.sla}:{}),...(cfg.report?{report:cfg.report}:{}),...(cfg.team?{team:cfg.team}:{})}:{};
 const monthly={};(rows.monthly_targets||[]).forEach(m=>{monthly[m.month]={target:m.target,budget:m.budget,other:m.other}});
 const state={v:3,
  settings,
  openings:newest(rows.openings||[],row('opening')),
  candidates:newest(rows.candidates||[],row('candidate')),
  applications:newest(rows.applications||[],row('application')),
  groups:oldest(rows.interview_groups||[],row('group')),
  interviews:oldest(rows.interviews||[],row('interview')),
  offers:oldest(rows.offers||[],row('offer')),
  onboarding:oldest(rows.onboarding_checklists||[],row('onboarding')),
  tasks:newest(rows.tasks||[],row('task')),
  notifications:newest(rows.notifications||[],row('notification')),
  activity:(rows.activity||[]).slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).map(FROM_ROW.activity),
  postings:oldest(rows.postings||[],row('posting')),
  events:oldest(rows.report_events||[],row('event')),
  callLog:oldest(rows.call_log||[],row('call')),
  monthly,
  sheetLog:(rows.sheet_log||[]).slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).map(FROM_ROW.sheetLog),
 };
 // an application whose candidate this account may not read (management) gets a marked placeholder, so no screen meets a missing record
 const known=new Set(state.candidates.map(c=>c.id));
 state.applications.forEach(a=>{if(!known.has(a.cid)){known.add(a.cid);state.candidates.push(hiddenCandidate(a.cid))}});
 // a missing list of boards means "use the built-in ones"; the app fills that in when it first asks
 if((rows.job_boards||[]).length)state.boards=rows.job_boards.slice().sort((a,b)=>a.position-b.position).map(FROM_ROW.board);
 if(cfg.postCfg)state.postCfg=cfg.postCfg;
 if(cfg.autoSync)state.autoSync=cfg.autoSync;
 return state;
}

// what the database holds of a state, as one string, so two states can be compared. The order of records does not matter,
// and what stays in this browser (name shown, theme) is left out.
function dataFingerprint(state){
 const parts={settings:settingsRow(state)};
 ['openings','candidates','applications','groups','interviews','offers','onboarding','tasks','notifications','activity','postings','events','callLog','sheetLog','boards'].forEach(k=>{
  parts[k]=(state[k]||[]).map(r=>JSON.stringify(r)).sort();
 });
 parts.monthly=state.monthly||{};
 return JSON.stringify(parts);
}

/* ---------- the other way: one app record -> rows ---------- */
// Each returns {table: row or [rows]} so a record that spans tables (a candidate and its salary and documents) is written as one unit.
const iso8601=ms=>new Date(ms).toISOString();
const TO_ROW={
 opening:(o,P)=>({openings:{id:o.id,title:o.title,dept:o.dept||'',positions:o.positions||1,location:o.location||'',mode:o.mode,type:o.type,
  exp_min:o.expMin||0,exp_max:o.expMax||0,sal_min:o.salMin||0,sal_max:o.salMax||0,education:o.education||'',mandatory:o.mandatory||[],preferred:o.preferred||[],
  description:o.desc||'',responsibilities:o.resp||'',requirements:o.req||'',recruiter_id:P.id(o.recruiter),manager_id:P.id(o.manager),
  opened_on:o.opened,target_on:o.target||null,priority:o.priority,status:o.status}}),
 candidate:(c,P)=>({
  candidates:{id:c.id,name:c.name,email:c.email||'',phone:c.phone||'',designation:c.designation||'',company:c.company||'',exp_years:c.exp||0,location:c.location||'',
   relocate:!!c.reloc,education:c.education||'',edu_field:c.eduField||'',university:c.university||'',grad_year:c.gradYear||null,skills:c.skills||[],
   notice_days:c.notice??30,certifications:c.certifications||[],achievements:c.achievements||[],source:c.source||'',history:c.history||[],notes:c.notes||[],
   resume_text:c.resumeText||'',created_on:c.created},
  candidate_compensation:{candidate_id:c.id,current_lpa:c.curSal||0,expected_lpa:c.expSal||0},
  candidate_documents:(c.documents||[]).map(d=>({candidate_id:c.id,name:d.name,status:d.status}))}),
 application:(a,P)=>({
  applications:{id:a.id,candidate_id:a.cid,opening_id:a.opId,applied_on:a.date,stage:a.stage,max_stage:a.maxStage||0,stage_since:a.stageSince,recruiter_id:P.id(a.recruiter),
   joining_on:a.joining||null,joined_on:a.joinedOn||null,dropped_on:a.dropped||null,drop_risk:a.dropRisk||null,
   backup_application_id:a.backup?a.backup.aid:null,backup_status:a.backup?a.backup.status:null},
  screenings:a.screening?{application_id:a.id,outcome:a.screening.outcome,answers:a.screening.answers||[],notes:a.screening.notes||'',screened_on:a.screening.date,duration_seconds:a.screening.duration||0}:null}),
 group:(g,P)=>({interview_groups:{id:g.id,opening_id:g.opId,on_date:g.date,at_time:g.time,duration_min:g.duration||60,mode:g.mode||'Office',location:g.location||'',link:g.link||'',
  panel:g.panel||'',interviewer_ids:(g.interviewers||[]).map(P.id).filter(Boolean),evaluated:!!g.evaluated}}),
 interview:(i,P)=>({interviews:{id:i.id,application_id:i.appId,kind:i.kind,round:i.round||'',group_id:i.groupId||null,on_date:i.date,at_time:i.time,duration_min:i.duration||60,
  mode:i.mode||'',location:i.location||'',link:i.link||'',interviewer_ids:(i.interviewers||[]).map(P.id).filter(Boolean),
  // 'Pending Feedback' is worked out from a Scheduled interview whose time has passed (intStatus), so it is never stored
  status:i.status==='Pending Feedback'?'Scheduled':i.status,invite:i.invite||'Sent',
  scores:i.scores||null,recommendation:i.rec||null,decision:i.decision||null,feedback:i.feedback||''}}),
 offer:(o,P)=>({offers:{id:o.id,application_id:o.appId,designation:o.designation||'',dept:o.dept||'',location:o.location||'',joining_on:o.joining||null,manager_id:P.id(o.manager),
  emp_type:o.empType||'Full-time',ctc:o.ctc||0,breakup:o.breakup||{},status:o.status,created_on:o.created,sent_on:o.sent||null,custom_letter:o.custom||null,
  probation_months:o.probation??6,validity_days:o.validity??7,approval_status:o.approval||'Not required',letter_path:o.letterPath||null}}),
 onboarding:(o)=>({onboarding_checklists:{application_id:o.appId,started_on:o.start},
  onboarding_items:(o.items||[]).map((it,k)=>({application_id:o.appId,position:k,category:it.cat,title:it.t,done:!!it.done}))}),
 task:(t,P)=>({tasks:{id:t.id,title:t.title,due_on:t.due||null,related:t.related||'General',priority:t.priority,owner_id:P.id(t.owner),done:!!t.done}}),
 notification:(n,P,userId)=>({notifications:{id:n.id,user_id:userId,text:n.text,link:n.go||['dashboard'],read:!!n.read,created_at:iso8601(n.ts)}}),
 activity:(a)=>({activity:{at:iso8601(a.ts),text:a.text,type:a.type||'info',application_id:a.appId||null}}),
 posting:(p)=>({postings:{id:p.id,opening_id:p.opId,board_id:p.board,status:p.status,posted_on:p.postedOn,url:p.url||'',expires_on:p.expires||null,cost:p.cost||0,demo:!!p.demo}}),
 event:(e)=>({report_events:{on_date:e.d,type:e.t,application_id:e.aid||null,opening_id:e.op||null,days:e.days??null,source:e.src||null,demo:!!e.demo}}),
 call:(c)=>({call_log:{id:c.id,on_date:c.d,opening_id:c.op||null,made:c.made,connected:c.conn,demo:!!c.demo}}),
 sheetLog:(l)=>({sheet_log:{at:iso8601(l.ts),text:l.text}}),
};
// the one settings row, from the app's settings and the other whole-object settings
function settingsRow(state){
 const s=state.settings||{};
 return {company:s.company||'',address:s.companyAddr||'',signatory:s.signatory||'',sign_title:s.signTitle||'',match_threshold:s.threshold??65,match_weights:s.weights,
  config:{...(s.sla?{sla:s.sla}:{}),...(s.report?{report:s.report}:{}),...(s.team?{team:s.team}:{}),...(state.postCfg?{postCfg:state.postCfg}:{}),...(state.autoSync?{autoSync:state.autoSync}:{})}};
}
// one interviewer's own scorecard (null until every criterion has a score)
const scoreRow=(i,interviewerId)=>i.scores&&interviewerId?{interview_id:i.id,interviewer_id:interviewerId,scores:i.scores,recommendation:i.rec||null,decision:i.decision||null,feedback:i.feedback||''}:null;
function boardRow(b,position){return {id:b.id,name:b.name,type:b.type||'board',format:b.fmt||'full',color:b.color||'',source_name:b.src||'',url:b.url||'',custom:!!b.custom,position}}
function targetRow([month,v]){return {month,target:v.target||0,budget:v.budget||0,other:v.other||0}}

// the whole state as rows per table, in an order that satisfies the foreign keys. userId owns the notifications.
// Applications come with backup links removed (see `backupLinks`) because a link may point at a row that is inserted later.
function rowsFromState(state,people,userId){
 const out={};
 const add=(res)=>Object.entries(res).forEach(([t,r])=>{if(r===null)return;(out[t]=out[t]||[]).push(...[].concat(r))});
 const each=(list,name,...extra)=>(list||[]).forEach(x=>add(TO_ROW[name](x,people,...extra)));
 each(state.openings,'opening');each(state.candidates,'candidate');each(state.applications,'application');
 each(state.groups,'group');each(state.interviews,'interview');each(state.offers,'offer');each(state.onboarding,'onboarding');
 each(state.tasks,'task');each(state.notifications,'notification',userId);each(state.activity,'activity');each(state.postings,'posting');
 each(state.events,'event');each(state.callLog,'call');each(state.sheetLog,'sheetLog');
 out.job_boards=(state.boards||[]).map(boardRow);
 out.monthly_targets=Object.entries(state.monthly||{}).map(targetRow);
 out.company_settings=[settingsRow(state)];
 return out;
}
