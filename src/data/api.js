/* The app's link to the database: reads everything the signed-in person may see and turns it into the app's state S.
   Only used in connected mode (see core/supabase.js). Writes come in the next step. */
"use strict";
const PAGE=1000;   // the server returns at most 1000 rows per request, so tables are read page by page
// every table the app reads, and a column that gives each page a stable order
const READ_TABLES=[
 ['company_settings','singleton'],['openings','id'],['candidates','id'],['candidate_compensation','candidate_id'],['candidate_documents','id'],
 ['applications','id'],['screenings','application_id'],['interview_groups','id'],['interviews','id'],['offers','id'],
 ['onboarding_checklists','application_id'],['onboarding_items','id'],['tasks','id'],['notifications','id'],['activity','id'],
 ['job_boards','id'],['postings','id'],['report_events','id'],['call_log','id'],['monthly_targets','month'],['sheet_log','id'],
];

async function fetchTable(client,table,orderBy){
 const out=[];
 for(let from=0;;from+=PAGE){
  const {data,error}=await client.from(table).select('*').order(orderBy).range(from,from+PAGE-1);
  if(error)throw new Error(`Could not read ${table}: ${error.message}`);
  out.push(...data);
  if(data.length<PAGE)return out;
 }
}

// all tables in parallel, plus the people list. Returns {rows, people}
async function fetchAll(client){
 const [profiles,...tables]=await Promise.all([fetchTable(client,'profiles','id'),...READ_TABLES.map(([t,k])=>fetchTable(client,t,k))]);
 const rows={};READ_TABLES.forEach(([t],i)=>{rows[t]=tables[i]});
 return {rows,people:makePeople(profiles)};
}

let PEOPLE=makePeople([]);   // who is who, refreshed on every load

// Replaces S with what the database holds. `me` is the signed-in person ({fullName}); their name goes into settings.user.
async function loadFromServer(client,me){
 const {rows,people}=await fetchAll(client);
 PEOPLE=people;
 const state=stateFromRows(rows,people);
 state.settings={...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),...state.settings,user:me.fullName};
 S=state;
 return state;
}
