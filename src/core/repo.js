/* repo: the only code that inserts, updates or removes records in S.
   Services call it; features never write to S directly. Today it changes the in-memory state and saves
   to localStorage. In Phase 2 a Supabase adapter subscribes with repoOnChange() and mirrors every change. */
"use strict";
const REPO_ID_KEY={onboarding:'appId'}; // collections not keyed by `id`
const REPO_LISTENERS=[];
// listener receives {op:'insert'|'update'|'remove'|'root', coll, id, record}
function repoOnChange(fn){REPO_LISTENERS.push(fn)}
function repoNotify(change){REPO_LISTENERS.forEach(f=>f(change))}
const repo={
 find(coll,id){const k=REPO_ID_KEY[coll]||'id';return (S[coll]||[]).find(r=>String(r[k])===String(id))},
 // newest-first collections use the default (add at the start); pass {end:true} for append-only ones
 insert(coll,record,{end=false}={}){
  if(!S[coll])S[coll]=[];
  end?S[coll].push(record):S[coll].unshift(record);
  save();repoNotify({op:'insert',coll,id:record[REPO_ID_KEY[coll]||'id'],record});return record;
 },
 // change is an object to merge, or a function that edits the record
 update(coll,id,change){
  const r=repo.find(coll,id);if(!r)throw new Error(`${coll}/${id} not found`);
  typeof change==='function'?change(r):Object.assign(r,change);
  save();repoNotify({op:'update',coll,id,record:r});return r;
 },
 remove(coll,id){
  const k=REPO_ID_KEY[coll]||'id',i=(S[coll]||[]).findIndex(r=>String(r[k])===String(id));
  if(i<0)return false;
  const [record]=S[coll].splice(i,1);save();repoNotify({op:'remove',coll,id,record});return true;
 },
 // keep only the newest `max` records of a newest-first collection
 trim(coll,max){if(S[coll]&&S[coll].length>max){S[coll].length=max;save()}},
 // replace the whole state (used by 'reset demo data')
 reset(state){S=state;save();repoNotify({op:'reset',coll:null,id:null,record:null})},
 // single objects that are not lists (settings, postCfg, monthly targets ...)
 root(key,change){
  if(typeof change==='function')change(S[key]);else S[key]=change;
  save();repoNotify({op:'root',coll:key,id:null,record:S[key]});return S[key];
 },
};
