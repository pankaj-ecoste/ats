/* Settings > Lead sheet connection (admin): connect the Google workbook once, get its script, see what arrived.
   Which tab feeds which opening is set on each opening ("Lead sheets" tab), not here. */
"use strict";
const LF={status:null,batches:[],loading:false,error:'',at:0};
const LF_FRESH_MS=5000;
const LF_LIVE_MS=10*60*1000;   // a workbook that reported within this long is connected   // coming back to Settings after this long reads the status again, so the tab count and last lead are not stale

async function loadLeadFeed(){
 if(LF.loading)return;LF.loading=true;LF.error='';
 try{[LF.status,LF.batches]=await Promise.all([leadFeedStatus(),leadFeedBatches()]);LF.at=Date.now()}
 catch(e){LF.error=e.message||'Could not read the lead sheet settings'}
 LF.loading=false;if(R.view==='settings')render();
}
function batchLine(b){
 if(b.error)return `<span class="pill red">${esc(b.error)}</span>`;
 const d=b.detail||{};
 return `${d.tab?`<b>${esc(d.tab)}</b>${d.opening?` → ${esc(d.opening)}`:''}: `:''}${b.read} row${b.read===1?'':'s'}: ${d.added||0} added${d.existing?`, ${d.existing} already in the app (added to the opening)`:''}${d.duplicates?`, ${d.duplicates} duplicates`:''}${d.skipped?`, ${d.skipped} skipped`:''}`;
}
function leadFeedPanel(){
 if(!CONNECTED||!isAdmin())return '';
 const head=`<header><div><h3>Lead sheet connection</h3><p>Connect the Google workbook that collects your ad leads, once. Then, on each opening, the <b>Lead sheets</b> tab links a tab of the workbook to that opening. New rows in a linked tab reach the app by themselves, about a minute after they are added.</p></div></header>`;
 if(LF.error)return `<section class="panel" style="margin-top:16px">${head}<div class="pbody"><div class="small" style="padding:8px 10px;background:var(--red2);border-radius:8px">${esc(LF.error)}</div><button class="btn" id="lfRetry" style="margin-top:10px">Try again</button></div></section>`;
 if(!LF.status)return `<section class="panel" style="margin-top:16px">${head}<div class="pbody muted">Loading…</div></section>`;
 const s=LF.status;
 if(!s.setUp)return `<section class="panel" style="margin-top:16px">${head}<div class="pbody"><button class="btn pri" id="lfSetup">Set up and get the script</button></div></section>`;
 const seen=s.tabsSeen?`${s.tabsSeen} tab${s.tabsSeen===1?'':'s'} reported${s.lastSeenAt?`, last ${timeAgo(s.lastSeenAt)}`:''}`:'<span class="pill orange">no tab reported yet: the script is not running in the workbook</span>';
 const live=t=>!!t&&Date.now()-t<LF_LIVE_MS;
 // the script of the workbook is refused (its key is old) and nothing has reported since: say so plainly
 const refused=s.refusedRecently>0&&!live(s.lastSeenAt);
 const warn=refused?`<div class="small" style="padding:10px 12px;background:var(--red2);border-radius:8px;margin-bottom:12px"><b>The script in your workbook is being refused.</b> The key inside it is not the current one (a new script was made after it was pasted). ${s.canShowScript?'Press <b>Show my script</b>, copy it and paste it into the workbook again.':'Press <b>Make a new script</b> once, paste it into the workbook, and from then on it can be shown again.'}</div>`:'';
 const books=s.workbooks.length?`<div class="tbl-wrap" style="margin-top:10px"><table><thead><tr><th>Workbook</th><th>Tabs</th><th>Last reported</th><th></th></tr></thead><tbody>${s.workbooks.map(w=>`<tr><td><b>${esc(w.name)}</b></td><td>${w.tabs}</td><td class="muted small">${w.lastSeenAt?timeAgo(w.lastSeenAt):'never'}</td><td>${live(w.lastSeenAt)?'<span class="pill green">Connected</span>':'<span class="pill red">Not reporting</span>'}</td></tr>`).join('')}</tbody></table></div><p class="small muted" style="margin:6px 0 0">To connect another workbook, paste the <b>same script</b> into it (Show my script) and run <b>installLeadSync</b>. It appears here within a minute.</p>`:'';
 return `<section class="panel" style="margin-top:16px">${head}<div class="pbody">${warn}
  <label class="row" style="gap:8px;margin-bottom:10px"><input type="checkbox" id="lfOn" ${s.enabled?'checked':''}> Receiving leads from the workbook ${s.enabled?'':'<span class="pill orange">switched off: the workbook is refused</span>'}</label>
  <div class="row" style="flex-wrap:wrap"><button class="btn pri" id="lfSave">Save</button><button class="btn" id="lfShow" title="The same script again, to paste into another workbook or into this one again">Show my script</button><button class="btn" id="lfNew">Make a new script</button><button class="btn" id="lfRefresh">Refresh</button></div>
  <p class="small" style="margin:12px 0 4px"><b>Workbooks:</b> ${seen}</p>${books}
  <p class="small" style="margin:0 0 4px"><b>Last lead received:</b> ${s.lastReceivedAt?timeAgo(s.lastReceivedAt):'nothing yet'}${s.tokenMadeAt?` · script made ${fmtD(new Date(s.tokenMadeAt).toISOString().slice(0,10))}`:''}</p>
  ${LF.batches.length?`<div class="small muted" style="margin-top:8px">${LF.batches.map(b=>`${timeAgo(b.ts)} · ${batchLine(b)}`).join('<br>')}</div>`:''}
  </div></section>`;
}
// the script and the steps. The token is part of the script and cannot be shown again, so this is the only time to copy it.
// mode: 'first' (just set up), 'new' (a new key was made: every workbook needs it again), 'again' (the same script, shown again)
function leadFeedModal(token,mode){
 const script=leadFeedScriptFor(token);
 const note={first:'It contains the secret that lets rows into the app, so keep it private. You can show it again later from Settings.',new:'The old script has stopped working in every workbook: paste this one in its place, in each workbook. You can show it again later from Settings.',again:'This is the same script as before, with the same key: paste it into another workbook, or into this one again. It contains the secret that lets rows into the app, so keep it private.'}[mode]||'';
 modal({title:mode==='new'?'Your new workbook script':'Your workbook script',size:'w',body:`
  <div class="small" style="padding:8px 10px;background:var(--orange2);border-radius:8px;margin-bottom:12px">Copy the script. ${note}</div>
  <textarea class="inp" id="lfScript" rows="9" readonly style="font-family:ui-monospace,Menlo,monospace;font-size:12px">${esc(script)}</textarea>
  <div class="row" style="margin:8px 0 12px"><button class="btn pri" id="lfCopy">Copy the script</button><span class="small muted" id="lfCopied" role="status"></span></div>
  <ol class="small" style="margin:0;padding-left:20px;line-height:1.6">
   <li>Open the Google workbook that collects the leads. In its menu choose <b>Extensions → Apps Script</b>.</li>
   <li>Select everything in the editor, delete it, <b>paste the script</b>, and save (Ctrl+S).</li>
   <li>In the function list at the top choose <b>installLeadSync</b> and click <b>Run</b>. Google asks for permission once: Review permissions → your account → Advanced → Go to the project → Allow.</li>
   <li>Within a minute the tabs of the workbook appear in the app. Then open an opening, choose its <b>Lead sheets</b> tab and link a tab.</li>
   <li>Another workbook? Paste this same script into it in the same way. Every workbook you connect appears in the Settings list.</li>
   <li>A <b>Synced to ATS</b> column is added to a tab only once it is linked. To send a row again, clear its cell in that column.</li></ol>`,
  foot:'<button class="btn pri" data-close>I have copied it</button>',
  onMount:el=>{
   $('#lfCopy',el).onclick=async()=>{
    const ta=$('#lfScript',el);
    try{await navigator.clipboard.writeText(script);$('#lfCopied',el).textContent=' Copied.'}
    catch(e){ta.focus();ta.select();$('#lfCopied',el).textContent=' Press Ctrl+C to copy the selected text.'}};
  }});
}
function bindLeadFeed(root){
 if(!CONNECTED||!isAdmin())return;
 if(!LF.loading&&!LF.error&&(!LF.status||Date.now()-LF.at>LF_FRESH_MS))loadLeadFeed();
 const on=(sel,fn)=>{const e=$(sel,root);if(e)e.onclick=fn};
 const fail=e=>toast(e.message||'Could not save','var(--red)');
 const reload=()=>{LF.status=null;LF.error='';render();loadLeadFeed()};
 on('#lfRetry',reload);on('#lfRefresh',reload);
 on('#lfSetup',async()=>{
  try{const token=await leadFeedConnect({enabled:true});reload();leadFeedModal(token,'first')}catch(e){fail(e)}});
 on('#lfShow',async()=>{
  try{const token=await leadFeedToken();if(!token){toast('The app does not have the key of the current script yet. Press Make a new script once; after that it can be shown again whenever you need it.','var(--red)');return}leadFeedModal(token,'again')}catch(e){fail(e)}});
 on('#lfSave',async()=>{
  try{await leadFeedConnect({enabled:$('#lfOn',root).checked});toast('Saved');reload()}catch(e){fail(e)}});
 on('#lfNew',()=>confirmBox('Make a new script','This makes a new key and <b>stops the script in every workbook</b> at once: you must paste the new script into each one again. If you only want to copy the script, or to connect another workbook, use <b>Show my script</b> instead. Make a new script only if the key was lost or leaked.','Make a new script',async()=>{
  try{const token=await leadFeedConnect({enabled:$('#lfOn',root).checked,newToken:true});reload();leadFeedModal(token,'new')}catch(e){fail(e)}}));
}
fillSlot('settings.bottom',leadFeedPanel);
onBind('settings',bindLeadFeed);
