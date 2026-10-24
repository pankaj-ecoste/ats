/* Settings > Live lead sheet (admin): set it up, get the script for the Google Sheet, see what arrived. */
"use strict";
const LF={status:null,batches:[],loading:false,error:''};

async function loadLeadFeed(){
 if(LF.loading)return;LF.loading=true;LF.error='';
 try{[LF.status,LF.batches]=await Promise.all([leadFeedStatus(),leadFeedBatches()])}
 catch(e){LF.error=e.message||'Could not read the lead sheet settings'}
 LF.loading=false;if(R.view==='settings')render();
}
function batchLine(b){
 if(b.error)return `<span class="pill red">${esc(b.error)}</span>`;
 const d=b.detail||{};
 return `${b.read} row${b.read===1?'':'s'}: ${d.added||0} added${d.existing?`, ${d.existing} already in the app (added to the opening)`:''}${d.duplicates?`, ${d.duplicates} duplicates`:''}${d.skipped?`, ${d.skipped} skipped`:''}`;
}
function leadFeedPanel(){
 if(!CONNECTED||!isAdmin())return '';
 const head=`<header><div><h3>Live lead sheet</h3><p>New rows in the Google Sheet that collects your ad leads reach the app by themselves, about a minute after they are added. They arrive as <b>New</b>, ready to call.</p></div></header>`;
 if(LF.error)return `<section class="panel" style="margin-top:16px">${head}<div class="pbody"><div class="small" style="padding:8px 10px;background:var(--red2);border-radius:8px">${esc(LF.error)}</div><button class="btn" id="lfRetry" style="margin-top:8px">Try again</button></div></section>`;
 if(!LF.status)return `<section class="panel" style="margin-top:16px">${head}<div class="pbody muted">Loading…</div></section>`;
 const s=LF.status,ops=S.openings.filter(o=>o.status!=='Closed');
 const opSel=`<select class="inp" id="lfOp">${[['','— choose —'],...ops.map(o=>[o.id,`${o.title} (${o.id})`])].map(([v,l])=>`<option value="${esc(v)}" ${v===s.opening?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
 const fields=`<div class="fgrid"><label class="f">Leads go to this opening${opSel}</label>
   <label class="f">Where they came from<input class="inp" id="lfSrc" value="${esc(s.source)}" list="lfSrcList"><datalist id="lfSrcList">${SOURCES.map(x=>`<option value="${esc(x)}">`).join('')}</datalist></label></div>
   <p class="small muted" style="margin:6px 0 0">A row whose <b>Position</b> column names an open opening (its id or exact title) goes to that opening instead. A row with its own <b>Campaign</b> column keeps that as its source.</p>`;
 const cols=`<p class="small muted" style="margin:12px 0 0">Columns the app reads: Name, Phone (or Email), City, Experience, Current company, Current CTC, Expected CTC, Notice period, Campaign, Date, Position. Other columns are ignored, and the app finds each column by its heading.</p>`;
 if(!s.setUp)return `<section class="panel" style="margin-top:16px">${head}<div class="pbody">${ops.length?fields+`<div class="row" style="margin-top:12px"><button class="btn pri" id="lfSetup">Set up and get the script</button><button class="btn" id="lfTpl">Download a starting sheet (CSV)</button></div>`:'<p style="margin:0">Create an opening first. Every lead is added to one.</p>'}${cols}</div></section>`;
 return `<section class="panel" style="margin-top:16px">${head}<div class="pbody">
  <label class="row" style="gap:8px;margin-bottom:10px"><input type="checkbox" id="lfOn" ${s.enabled?'checked':''}> Receiving leads from the sheet ${s.enabled?'':'<span class="pill orange">switched off: the sheet is refused</span>'}</label>
  ${fields}
  <div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="btn pri" id="lfSave">Save</button><button class="btn" id="lfNew">Make a new script</button><button class="btn" id="lfTpl">Download a starting sheet (CSV)</button><button class="btn ghost" id="lfRefresh">Refresh</button></div>
  <p class="small" style="margin:12px 0 4px"><b>Last received:</b> ${s.lastReceivedAt?timeAgo(s.lastReceivedAt):'nothing yet'}${s.tokenMadeAt?` · script made ${fmtD(new Date(s.tokenMadeAt).toISOString().slice(0,10))}`:''}</p>
  ${LF.batches.length?`<div class="small muted">${LF.batches.map(b=>`${timeAgo(b.ts)} · ${batchLine(b)}`).join('<br>')}</div>`:''}
  ${cols}</div></section>`;
}
// the script and the steps. The token is part of the script and cannot be shown again, so this is the only time to copy it.
function leadFeedModal(token,first){
 const script=leadFeedScriptFor(token);
 modal({title:first?'Your lead sheet script':'Your new lead sheet script',size:'w',body:`
  <div class="small" style="padding:8px 10px;background:var(--orange2);border-radius:8px;margin-bottom:12px">Copy this now. It contains the secret that lets rows into the app, so it is shown only once and must stay private. ${first?'':'The old script has stopped working.'}</div>
  <textarea class="inp" id="lfScript" rows="9" readonly style="font-family:ui-monospace,Menlo,monospace;font-size:12px">${esc(script)}</textarea>
  <div class="row" style="margin:8px 0 12px"><button class="btn pri" id="lfCopy">Copy the script</button><span class="small muted" id="lfCopied" role="status"></span></div>
  <ol class="small" style="margin:0;padding-left:20px;line-height:1.6">
   <li>Open the Google Sheet that collects the leads. In its menu choose <b>Extensions → Apps Script</b>.</li>
   <li>Select everything in the editor, delete it, <b>paste the script</b>, and save (Ctrl+S).</li>
   <li>In the function list at the top choose <b>installLeadSync</b> and click <b>Run</b>. Google asks for permission once: Review permissions → your account → Advanced → Go to the project → Allow.</li>
   <li>Within a minute a <b>Synced to ATS</b> column appears and the rows start arriving. From then on every new row is sent by itself.</li>
   <li>To send a row again, clear its cell in that column.</li></ol>`,
  foot:'<button class="btn pri" data-close>I have copied it</button>',
  onMount:el=>{
   $('#lfCopy',el).onclick=async()=>{
    const ta=$('#lfScript',el);
    try{await navigator.clipboard.writeText(script);$('#lfCopied',el).textContent=' Copied.'}
    catch(e){ta.focus();ta.select();$('#lfCopied',el).textContent=' Press Ctrl+C to copy the selected text.'}};
  }});
}
function downloadLeadTemplate(){
 const url=URL.createObjectURL(new Blob([leadTemplateCsv()],{type:'text/csv'}));
 const a=document.createElement('a');a.href=url;a.download='Ecoste_leads_template.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bindLeadFeed(root){
 if(!CONNECTED||!isAdmin())return;
 if(!LF.status&&!LF.loading&&!LF.error)loadLeadFeed();
 const on=(sel,fn)=>{const e=$(sel,root);if(e)e.onclick=fn};
 const values=()=>({opening:$('#lfOp',root).value,source:$('#lfSrc',root).value.trim(),enabled:$('#lfOn',root)?$('#lfOn',root).checked:true});
 const fail=e=>toast(e.message||'Could not save','var(--red)');
 const reload=()=>{LF.status=null;LF.error='';render();loadLeadFeed()};
 on('#lfRetry',reload);on('#lfRefresh',reload);on('#lfTpl',downloadLeadTemplate);
 on('#lfSetup',async()=>{
  const v=values();if(!v.opening){toast('Choose the opening the leads go to','var(--red)');return}
  try{const token=await leadFeedSave({...v,enabled:true});reload();leadFeedModal(token,true)}catch(e){fail(e)}});
 on('#lfSave',async()=>{
  const v=values();if(v.enabled&&!v.opening){toast('Choose the opening the leads go to, or switch receiving off','var(--red)');return}
  try{await leadFeedSave(v);toast('Saved');reload()}catch(e){fail(e)}});
 on('#lfNew',()=>confirmBox('Make a new script','The current script stops working at once. Paste the new one into the Google Sheet to carry on.','Make a new script',async()=>{
  try{const v=values();const token=await leadFeedSave({...v,newToken:true});reload();leadFeedModal(token,false)}catch(e){fail(e)}}));
}
fillSlot('settings.bottom',leadFeedPanel);
onBind('settings',bindLeadFeed);
