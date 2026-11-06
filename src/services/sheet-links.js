/* Links between the tabs of the Google workbook and the openings (migration 0023): the tabs the script has seen, the links, and linking, changing and unlinking.
   Every change goes through a database function that checks the columns and the one-tab-one-opening rule. No DOM. */
"use strict";
const TABS_FRESH_DAYS=3;   // a tab the script has not reported for this long is probably gone

// the tabs the script reported lately, by name
async function sheetTabs(){
 const since=new Date(Date.now()-TABS_FRESH_DAYS*864e5).toISOString();
 const {data,error}=await sb.from('sheet_tabs').select('tab_key,tab_name,book_name,headings,seen_at').gte('seen_at',since).order('book_name').order('tab_name');
 if(error)throw authError(error);
 return (data||[]).map(t=>({key:t.tab_key,name:t.tab_name,book:t.book_name||'',headings:t.headings||[],seenAt:msOf(t.seen_at)}));
}
// every link (so a tab that belongs to another opening can be shown as taken)
async function sheetLinks(){
 const {data,error}=await sb.from('sheet_links').select('id,opening_id,tab_key,tab_name,source,map,extra,known,enabled,last_received_at').order('created_at');
 if(error)throw authError(error);
 return (data||[]).map(l=>({id:l.id,opening:l.opening_id,tabKey:l.tab_key,tabName:l.tab_name,source:l.source,map:l.map||{},extra:l.extra||[],known:l.known||[],enabled:l.enabled,lastReceivedAt:msOf(l.last_received_at)}));
}
async function sheetLinkSave({opening,tabKey,source,map,extra}){
 const r=await sb.rpc('sheet_link_save',{p_opening:opening,p_tab_key:tabKey,p_source:source,p_map:map,p_extra:extra});
 if(r.error)throw authError(r.error);
 return r.data;
}
async function sheetLinkUpdate({id,source,map,extra,enabled}){
 const r=await sb.rpc('sheet_link_update',{p_id:id,p_source:source,p_map:map,p_extra:extra,p_enabled:!!enabled});
 if(r.error)throw authError(r.error);
}
async function sheetLinkRemove(id){
 const r=await sb.rpc('sheet_link_remove',{p_id:id});
 if(r.error)throw authError(r.error);
}
