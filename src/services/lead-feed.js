/* The live lead sheet: its settings for an admin, the batches it received, and the script to paste into the Google Sheet. Talks to the functions of migration 0018. No DOM. */
"use strict";
const msOf=t=>t?Date.parse(t):null;

async function leadFeedStatus(){
 const r=await sb.rpc('lead_feed_status');
 if(r.error)throw authError(r.error);
 const s=r.data||{};
 return {setUp:!!s.set_up,enabled:!!s.enabled,opening:s.opening||'',source:s.source||'Ad campaign',tokenMadeAt:msOf(s.token_made_at),lastReceivedAt:msOf(s.last_received_at)};
}
// Saves the settings. Returns the secret token when a new one was made (the first time, or when asked); otherwise null. The token is shown once: only its hash is kept.
async function leadFeedSave({opening,source,enabled,newToken=false}){
 const r=await sb.rpc('lead_feed_save',{p_opening:opening||'',p_source:source||'',p_enabled:!!enabled,p_new_token:!!newToken});
 if(r.error)throw authError(r.error);
 return (r.data&&r.data.token)||null;
}
// the latest batches the sheet sent (or was refused), newest first
async function leadFeedBatches(limit=8){
 const {data,error}=await sb.from('intake_batches').select('received_at,rows_read,rows_added,rows_skipped,error,detail').eq('source','sheet').order('received_at',{ascending:false}).limit(limit);
 if(error)throw authError(error);
 return (data||[]).map(b=>({ts:msOf(b.received_at),read:b.rows_read,added:b.rows_added,skipped:b.rows_skipped,error:b.error||'',detail:b.detail||{}}));
}
const leadFeedScriptFor=token=>leadFeedScript({url:APP_SETTINGS.supabaseUrl,anonKey:APP_SETTINGS.anonKey,token});
