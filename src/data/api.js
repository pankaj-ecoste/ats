/* The app's link to the database: reads everything the signed-in person may see into the app's state S, and saves each change back.
   Only used in connected mode (see core/supabase.js). */
"use strict";
const PAGE=1000;   // the server returns at most 1000 rows per request, so tables are read page by page
// every table the app reads, and a column that gives each page a stable order
const READ_TABLES=[
 ['company_settings','singleton'],['openings','id'],['candidates','id'],['candidate_compensation','candidate_id'],['candidate_documents','id'],
 ['applications','id'],['screenings','application_id'],['interview_groups','id'],['interviews','id'],['offers','id'],
 ['onboarding_checklists','application_id'],['onboarding_items','id'],['tasks','id'],['notifications','id'],
 ['job_boards','id'],['postings','id'],['report_events','id'],['call_log','id'],['monthly_targets','month'],['messages','id'],
];
// the two logs only ever grow, and only the latest entries are shown, so only those are read (the app itself keeps 300)
const LOG_TABLES=[['activity','at'],['sheet_log','at'],['intake_batches','received_at']],LOG_KEEP=300;

async function fetchTable(client,table,orderBy){
 const out=[];
 for(let from=0;;from+=PAGE){
  const {data,error}=await client.from(table).select('*').order(orderBy).range(from,from+PAGE-1);
  if(error)throw new Error(`Could not read ${table}: ${error.message}`);
  out.push(...data);
  if(data.length<PAGE)return out;
 }
}

async function fetchNewest(client,table,orderBy,n){
 const {data,error}=await client.from(table).select('*').order(orderBy,{ascending:false}).limit(n);
 if(error)throw new Error(`Could not read ${table}: ${error.message}`);
 return data;
}

// all tables in parallel, plus the people list. Returns {rows, people}
async function fetchAll(client){
 const [profiles,...tables]=await Promise.all([fetchTable(client,'profiles','id'),...READ_TABLES.map(([t,k])=>fetchTable(client,t,k)),...LOG_TABLES.map(([t,k])=>fetchNewest(client,t,k,LOG_KEEP))]);
 const rows={};[...READ_TABLES,...LOG_TABLES].forEach(([t],i)=>{rows[t]=tables[i]});
 return {rows,people:makePeople(profiles)};
}

let PEOPLE=makePeople([]);   // who is who, refreshed on every load

// Replaces S with what the database holds. `me` is the signed-in person ({fullName}); their name goes into settings.user.
async function loadFromServer(client,me){
 const {state,people}=await readState(client,me);
 PEOPLE=people;
 S=state;
 return state;
}
async function readState(client,me){
 const {rows,people}=await fetchAll(client);
 const state=stateFromRows(rows,people);
 state.settings={...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),...state.settings,user:me.fullName,theme:savedTheme()};
 return {state,people};
}
// Picks up what other people changed. Does nothing while this browser still has changes to save (they would be lost) or when nothing differs.
// Returns true when the screen's data was replaced.
async function refreshFromServer(client,me){
 if(writesPending()>0)return false;
 const {state,people}=await readState(client,me);
 if(writesPending()>0)return false;       // a change was made while reading
 if(dataFingerprint(state)===dataFingerprint(S))return false;
 PEOPLE=people;
 S=state;
 return true;
}

/* ===================== writing =====================
   Every change the services make reaches repo, which tells listeners (repoOnChange). The writer turns each change into
   database calls, one at a time and in order (a candidate must exist before its application), in the background.
   A temporary network failure is retried; any other failure is reported once and the rest carries on. */

// collection in S -> how its records are written. `key` is the database column holding the record id (none: insert only).
const WRITE_MAP={
 openings:{to:'opening',table:'openings',key:'id',creator:'created_by'},
 candidates:{to:'candidate',table:'candidates',key:'id',creator:'created_by'},
 applications:{to:'application',table:'applications',key:'id'},
 groups:{to:'group',table:'interview_groups',key:'id'},
 interviews:{to:'interview',table:'interviews',key:'id'},
 offers:{to:'offer',table:'offers',key:'id'},
 onboarding:{to:'onboarding',table:'onboarding_checklists',key:'application_id'},
 tasks:{to:'task',table:'tasks',key:'id',creator:'created_by'},
 notifications:{to:'notification',table:'notifications',key:'id'},
 activity:{to:'activity',table:'activity',creator:'actor_id'},
 postings:{to:'posting',table:'postings',key:'id'},
 events:{to:'event',table:'report_events'},
 callLog:{to:'call',table:'call_log',key:'id'},
 sheetLog:{to:'sheetLog',table:'sheet_log'},
 messages:{to:'message',table:'messages',creator:'sent_by'},   // insert only: a recorded message is never edited
};
// rows that belong to a parent and are always rewritten as a set; and rows kept one per parent
const CHILD_SETS={candidate_documents:'candidate_id',onboarding_items:'application_id'};
const CHILD_ONE={candidate_compensation:'candidate_id',screenings:'application_id'};
const SETTINGS_KEYS=['settings','postCfg','autoSync'];   // all stored in the one company_settings row

const WRITE_RETRY_MS=[1000,3000,8000,20000];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// a database answer, as a sentence a person can act on
function writeError(error,what){
 const m=String((error&&error.message)||error||''),code=error&&error.code;
 let text;
 if(code==='42501'||/row-level security|permission denied/i.test(m))text='You do not have permission to make this change.';
 else if(code==='23505')text='This already exists (a record with the same id or email is already saved).';
 else if(code==='23503')text='It refers to a record that is not saved.';
 else if(code==='23514'||code==='22P02'||code==='22007'||code==='22023')text='A value is not allowed ('+m+').';
 else if(code==='P0001')text=m;     // a rule written in the database, already in plain words
 else text=m||'Something went wrong.';
 const e=new Error(`Could not save ${what}. ${text}`);
 e.retryable=!code&&/failed to fetch|network|timeout|load failed|fetch/i.test(m);
 return e;
}
const WHAT={openings:'the opening',candidates:'the candidate',applications:'the application',groups:'the group interview',interviews:'the interview',offers:'the offer',
 onboarding:'the onboarding checklist',tasks:'the task',notifications:'the notification',activity:'the activity entry',postings:'the posting',events:'the report entry',
 callLog:'the call log',sheetLog:'the sheet log',messages:'the message record',settings:'the settings',postCfg:'the posting settings',autoSync:'the Google Sheet connection',monthly:'the monthly targets',boards:'the job sites'};

async function dbRun(promise,what){const r=await promise;if(r&&r.error)throw writeError(r.error,what);return r}
// An update or delete that row-level security hides does not fail: it quietly changes zero rows. So the rows touched are asked for and counted.
async function dbRunOne(promise,what){
 const r=await dbRun(promise,what);
 if(!r.data||r.data.length===0){const e=new Error(`Could not save ${what}. You do not have permission to change it, or it was already removed or changed by someone else.`);e.retryable=false;throw e}
 return r;
}

// rows for one record, with who made it added on creation
function rowsOf(coll,record,ctx,isNew){
 const m=WRITE_MAP[coll],res=TO_ROW[m.to](record,ctx.people,ctx.meId);
 if(isNew&&m.creator)res[m.table][m.creator]=ctx.meId;
 return res;
}
const sameAsLast=(ctx,key,rows)=>{const j=JSON.stringify(rows);if(ctx.last.get(key)===j)return true;ctx.last.set(key,j);return false};

// an interviewer's own scorecard: one row per person and interview. The database rolls it up onto the interview (migration 0010).
async function writeScorecard(client,ctx,record){
 const row=scoreRow(record,ctx.meId);
 if(row)await dbRun(client.from('interview_scores').upsert(row,{onConflict:'interview_id,interviewer_id'}),'your scorecard');
}

async function writeRecord(client,ctx,coll,id,record,isNew){
 const m=WRITE_MAP[coll],what=WHAT[coll];
 if(coll==='offers'&&ctx.role==='hiring_manager'){   // a hiring manager may change nothing but the approval
  if(!isNew)await dbRunOne(client.from('offers').update({approval_status:record.approval}).eq('id',id).select('id'),what);
  return;
 }
 if(coll==='interviews'&&!ctx.staff){if(!isNew)await writeScorecard(client,ctx,record);return}   // interviewers cannot change the interview itself
 const res=rowsOf(coll,record,ctx,isNew);
 for(const [table,rows] of Object.entries(res)){
  if(table===m.table){
   if(isNew||!m.key)await dbRun(client.from(table).insert(rows),what);
   else{const {[m.key]:_,...rest}=rows;await dbRunOne(client.from(table).update(rest).eq(m.key,id).select(m.key),what)}
   if(coll==='interviews'&&!isNew&&record.scores&&(record.interviewers||[]).includes(ctx.people.name(ctx.meId)))await writeScorecard(client,ctx,record);
  }else if(CHILD_SETS[table]){
   if(!isNew){if(sameAsLast(ctx,table+id,rows))continue;await dbRun(client.from(table).delete().eq(CHILD_SETS[table],id),what)}
   else ctx.last.set(table+id,JSON.stringify(rows));
   if(rows.length)await dbRun(client.from(table).insert(rows),what);
  }else if(CHILD_ONE[table]){
   if(rows===null||sameAsLast(ctx,table+id,rows))continue;
   await dbRun(client.from(table).upsert(rows,{onConflict:CHILD_ONE[table]}),what);
  }
 }
}

// many new records in batches (a lead import): one request per 200 rows and table, parents before children
async function writeMany(client,ctx,coll,records){
 if(coll!=='candidates'&&coll!=='applications')throw new Error('This change cannot be saved to the server.');
 const what=WHAT[coll],byTable={};
 records.forEach(rec=>{
  const res=rowsOf(coll,rec,ctx,true);
  Object.entries(res).forEach(([t,r])=>{
   if(r===null)return;
   if(CHILD_SETS[t])ctx.last.set(t+rec.id,JSON.stringify(r));
   (byTable[t]=byTable[t]||[]).push(...[].concat(r));
  });
 });
 for(const [table,rows] of Object.entries(byTable))
  for(let i=0;i<rows.length;i+=200)await dbRun(client.from(table).insert(rows.slice(i,i+200)),what);
}

// make the database hold exactly this list for a whole collection (a workbook import that replaces or merges, clearing the sample history)
async function syncCollection(client,ctx,coll,list){
 const m=WRITE_MAP[coll],what=WHAT[coll];
 if(!m.key){
  if(coll==='events'&&!(list||[]).some(e=>e.demo))await dbRun(client.from(m.table).delete().eq('demo',true),what);
  return;
 }
 const keep=new Set((list||[]).map(r=>String(r[coll==='onboarding'?'appId':'id'])));
 const stored=await fetchTable(client,m.table,m.key);
 const gone=stored.map(r=>String(r[m.key])).filter(k=>!keep.has(k));
 for(let i=0;i<gone.length;i+=100)await dbRun(client.from(m.table).delete().in(m.key,gone.slice(i,i+100)),what);
 const byTable={};
 (list||[]).forEach(rec=>Object.entries(rowsOf(coll,rec,ctx,false)).forEach(([t,r])=>{if(r!==null)(byTable[t]=byTable[t]||[]).push(...[].concat(r))}));
 for(const [table,rows] of Object.entries(byTable)){
  if(CHILD_SETS[table]){
   const parents=[...new Set(rows.map(r=>r[CHILD_SETS[table]]))];
   for(let i=0;i<parents.length;i+=100)await dbRun(client.from(table).delete().in(CHILD_SETS[table],parents.slice(i,i+100)),what);
  }
  for(let i=0;i<rows.length;i+=200){
   const chunk=rows.slice(i,i+200);
   if(CHILD_SETS[table])await dbRun(client.from(table).insert(chunk),what);
   else await dbRun(client.from(table).upsert(chunk,{onConflict:table===m.table?m.key:CHILD_ONE[table]}),what);
  }
 }
}

async function writeRoot(client,ctx,key,value){
 const what=WHAT[key]||'your changes';
 if(SETTINGS_KEYS.includes(key)){
  const row=settingsRow(S);
  if(sameAsLast(ctx,'settings',row))return;     // e.g. only the signed-in name or the theme changed: those stay in this browser
  return dbRunOne(client.from('company_settings').update(row).eq('singleton',true).select('singleton'),what);
 }
 if(key==='monthly')return dbRun(client.from('monthly_targets').upsert(Object.entries(value||{}).map(targetRow),{onConflict:'month'}),what);
 if(key==='boards'){
  await dbRun(client.from('job_boards').delete().neq('id',''),what);
  if((value||[]).length)await dbRun(client.from('job_boards').insert(value.map(boardRow)),what);
  return;
 }
 if(WRITE_MAP[key])return syncCollection(client,ctx,key,S[key]);
 // anything else (the sample-history flag) is not stored
}

// a notification for somebody else: written for their account. A name with no account has nobody to tell.
async function sendRecord(client,ctx,ch){
 if(ch.coll!=='notifications')return;
 const userId=ctx.people.id(ch.recipient);
 if(!userId)return;
 await dbRun(client.from('notifications').insert(TO_ROW.notification(ch.record,ctx.people,userId).notifications),WHAT.notifications);
}

async function applyChange(client,ctx,ch){
 if(ch.op==='send')return sendRecord(client,ctx,ch);
 if(ch.op==='insert')return writeRecord(client,ctx,ch.coll,ch.id,ch.record,true);
 if(ch.op==='insertMany')return writeMany(client,ctx,ch.coll,ch.records);
 if(ch.op==='update')return writeRecord(client,ctx,ch.coll,ch.id,ch.record,false);
 if(ch.op==='remove'){const m=WRITE_MAP[ch.coll];if(m&&m.key)await dbRunOne(client.from(m.table).delete().eq(m.key,ch.id).select(m.key),WHAT[ch.coll]);return}
 if(ch.op==='root')return writeRoot(client,ctx,ch.coll,ch.record);
 throw new Error('This change cannot be saved to the server.');
}

// the queue. ctx: {meId, people, retryMs}. Failures are announced with emitEvent('data:error') once per run of failures; a later success announces 'data:ok'.
function createWriter(client,ctx){
 ctx.last=ctx.last||new Map();
 const delays=ctx.retryMs||WRITE_RETRY_MS;
 let chain=Promise.resolve(),pending=0,failing=false;
 async function attempt(ch){
  for(let i=0;;i++){
   try{return await applyChange(client,ctx,ch)}
   catch(e){if(!e.retryable||i>=delays.length)throw e;await sleep(delays[i])}
  }
 }
 return {
  enqueue(ch){
   pending++;emitEvent('data:pending',{n:pending});
   // the record is copied now: written later, it would show the latest state for every queued change, and the stage history would lose steps
   if(ch.record!==undefined&&ch.record!==null)ch={...ch,record:JSON.parse(JSON.stringify(ch.record))};
   if(ch.records)ch={...ch,records:JSON.parse(JSON.stringify(ch.records))};
   chain=chain.then(()=>attempt(ch)).then(
    ()=>{pending--;emitEvent('data:pending',{n:pending});if(failing){failing=false;emitEvent('data:ok',{})}},
    e=>{pending--;emitEvent('data:pending',{n:pending});if(!failing){failing=true;emitEvent('data:error',{message:e.message})}});
   return chain;
  },
  pending:()=>pending,
  idle:()=>chain,
 };
}

let WRITER=null,WRITING_LISTENING=false;
// begin saving this person's changes. Called once after the data is loaded.
function startWriting(client,me){
 const ctx={meId:me.id,role:me.role,staff:me.role==='admin'||me.role==='recruiter',get people(){return PEOPLE}};
 ctx.last=new Map([['settings',JSON.stringify(settingsRow(S))]]);
 WRITER=createWriter(client,ctx);
 if(!WRITING_LISTENING){WRITING_LISTENING=true;repoOnChange(ch=>{if(WRITER)WRITER.enqueue(ch)})}
}
const writesPending=()=>WRITER?WRITER.pending():0;
// waits until everything queued so far is saved, then stops saving (used when signing out)
async function stopWriting(){if(WRITER){await WRITER.idle();WRITER=null}}
