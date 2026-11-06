/* The lead sheet connection (admin, in Settings): on or off, the secret token, the batches received, and the script to paste into the Google workbook.
   Which tab feeds which opening is not here: that is set on each opening (sheet-links.js). Talks to the functions of migrations 0018 and 0023. No DOM. */
"use strict";
const msOf=t=>t?Date.parse(t):null;

async function leadFeedStatus(){
 const r=await sb.rpc('lead_feed_status');
 if(r.error)throw authError(r.error);
 const s=r.data||{};
 return {setUp:!!s.set_up,enabled:!!s.enabled,tokenMadeAt:msOf(s.token_made_at),lastReceivedAt:msOf(s.last_received_at),tabsSeen:s.tabs_seen||0,lastSeenAt:msOf(s.last_seen_at),
  workbooks:(s.workbooks||[]).map(w=>({id:w.id,name:w.name||'Workbook',tabs:w.tabs||0,lastSeenAt:msOf(w.last_seen_at)})),refusedRecently:s.refused_recently||0,canShowScript:!!s.can_show_script,passwordSet:!!s.password_set};
}
// An answer of the protected functions: a wrong password is an answer ({ok:false,message}), not an error, so the count of wrong tries is kept
function protectedAnswer(r){
 if(r.error)throw authError(r.error);
 const d=r.data||{};
 if(d.ok===false)throw new Error(d.message||'Wrong password');
 return d;
}
// true when the password is right
async function leadFeedUnlock(password){
 protectedAnswer(await sb.rpc('lead_feed_unlock',{p_password:password||''}));
 return true;
}
// sets the password (the first time, oldPassword is empty) or changes it
async function leadFeedSetPassword(oldPassword,newPassword){
 protectedAnswer(await sb.rpc('lead_feed_set_password',{p_old:oldPassword||'',p_new:newPassword||''}));
 return true;
}
// Switches the connection on or off. Returns the secret token when a new one was made (the first time, or when asked); otherwise null. The token is shown once: only its hash is kept.
async function leadFeedConnect({enabled,newToken=false,password}){
 const d=protectedAnswer(await sb.rpc('lead_feed_connect',{p_enabled:!!enabled,p_new_token:!!newToken,p_password:password||''}));
 return d.token||null;
}
// the secret of the connection, so the same script can be shown again (admin). null when it was made before the key was kept: make a new script once.
async function leadFeedToken(password){
 const d=protectedAnswer(await sb.rpc('lead_feed_token',{p_password:password||''}));
 return d.token||null;
}
// the latest batches the workbook sent (or was refused), newest first
async function leadFeedBatches(limit=8){
 const {data,error}=await sb.from('intake_batches').select('received_at,rows_read,rows_added,rows_skipped,error,detail').eq('source','sheet').order('received_at',{ascending:false}).limit(limit);
 if(error)throw authError(error);
 return (data||[]).map(b=>({ts:msOf(b.received_at),read:b.rows_read,added:b.rows_added,skipped:b.rows_skipped,error:b.error||'',detail:b.detail||{}}));
}
const leadFeedScriptFor=token=>leadFeedScript({url:APP_SETTINGS.supabaseUrl,anonKey:APP_SETTINGS.anonKey,token});
