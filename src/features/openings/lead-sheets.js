/* An opening's "Lead sheets" tab: link a tab of the Google workbook to this opening, choose its columns and source, change or unlink it.
   After linking, every new row in that tab reaches the app by itself (the script in the workbook sends it), as a New application of this opening. */
"use strict";
const LS={tabs:null,links:null,loading:false,error:''};

async function loadLeadSheets(){
 if(LS.loading)return;LS.loading=true;LS.error='';
 try{[LS.tabs,LS.links]=await Promise.all([sheetTabs(),sheetLinks()])}
 catch(e){LS.error=e.message||'Could not read the lead sheets'}
 LS.loading=false;if(R.view==='opening'&&R.tab==='leads')render();
}
const reloadLeadSheets=()=>{LS.tabs=null;LS.links=null;LS.error='';render();loadLeadSheets()};

// a first guess of the source from the tab's name: a source whose first word (5 letters or more) is in it
function guessSourceFor(tabName,list){
 const t=String(tabName||'').toLowerCase();
 return list.find(s=>{const w=String(s).toLowerCase().split(/[\s-]+/)[0];return w.length>=5&&t.includes(w)})||(list.includes('Ad campaign')?'Ad campaign':list[0]);
}
const tabOfLink=l=>(LS.tabs||[]).find(t=>t.key===l.tabKey);
// the workbooks the script reported (names), and how a tab is shown: "Workbook › Tab" once there is more than one workbook
const booksOf=()=>[...new Set((LS.tabs||[]).map(t=>t.book).filter(Boolean))];
const tabLabel=t=>booksOf().length>1&&t.book?`${t.book} › ${t.name}`:t.name;
const LS_LIVE_MS=10*60*1000;
const headingsOfLink=l=>{const t=tabOfLink(l);return t?t.headings:(l.known||[])};

function linkRow(l){
 const t=tabOfLink(l),hs=headingsOfLink(l);
 const fresh=t?newHeadings(l,hs):[],gone=t?missingHeadings(l,hs):[];
 const flags=[
  !l.enabled?'<span class="pill orange">Switched off</span>':'<span class="pill green">Receiving</span>',
  !t?'<span class="pill orange" title="The script has not reported this tab for a few days">Tab not seen lately</span>':'',
  fresh.length?`<span class="pill orange" title="${esc(fresh.join(', '))}">${fresh.length} new column${fresh.length>1?'s':''}</span>`:'',
  gone.length?`<span class="pill red" title="${esc(gone.join(', '))}">${gone.length} column${gone.length>1?'s':''} missing</span>`:''].filter(Boolean).join(' ');
 return `<tr><td>${t&&booksOf().length>1&&t.book?`<div class="muted small">${esc(t.book)}</div>`:''}<b>${esc(l.tabName)}</b></td><td>${esc(l.source)}</td><td class="muted small">${Object.keys(l.map).length} fields, ${l.extra.length} kept as answers</td><td class="muted small">${l.lastReceivedAt?timeAgo(l.lastReceivedAt):'nothing yet'}</td><td>${flags}</td>
  <td class="num" style="white-space:nowrap"><button class="btn sm" data-ls-edit="${esc(l.id)}">Edit</button> <button class="btn sm" data-ls-off="${esc(l.id)}">Unlink</button></td></tr>`;
}

// the tab body; called from vOpening when the "Lead sheets" tab is open
function leadSheetsTab(o){
 const head=`<header><div><h3>Lead sheets</h3><p>Link a tab of your Google workbook to this opening. New rows in a linked tab reach this opening by themselves, about a minute after they are added.</p></div><button class="btn pri" id="lsLink">${ic('plus')}Link a sheet</button></header>`;
 if(LS.error)return `<section class="panel">${head}<div class="pbody"><div class="small" style="padding:8px 10px;background:var(--red2);border-radius:8px">${esc(LS.error)}</div><button class="btn" id="lsRetry" style="margin-top:10px">Try again</button></div></section>`;
 if(!LS.tabs||!LS.links)return `<section class="panel">${head}<div class="pbody muted">Loading…</div></section>`;
 const mine=LS.links.filter(l=>l.opening===o.id);
 const bySrc={};appsOfOp(o.id).forEach(a=>{const s=appSource(a);bySrc[s]=(bySrc[s]||0)+1});
 const srcLine=Object.keys(bySrc).length?`<div class="small" style="margin:0 0 12px"><b>Leads by source:</b> ${Object.entries(bySrc).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${esc(k)} ${v}`).join(' · ')}</div>`:'';
 const none=!LS.tabs.length?`<p class="small muted" style="margin:0 0 12px">No tab has been reported yet. An admin sets up the connection in <b>Settings</b> and pastes the script into the workbook; the tabs then appear here within a minute.</p>`:'';
 // nothing has reported for a while: the script may have stopped, or its key was replaced
 const lastSeen=LS.tabs.reduce((m,t)=>Math.max(m,t.seenAt||0),0);
 const stale=LS.tabs.length&&Date.now()-lastSeen>LS_LIVE_MS?`<div class="small" style="padding:10px 12px;background:var(--red2);border-radius:8px;margin:0 0 12px"><b>No workbook has reported for ${timeAgo(lastSeen).replace(' ago','')}.</b> New leads will not arrive until it does. The script may have stopped, or its key was replaced. An admin can check <b>Settings → Lead sheet connection</b> (Show my script).</div>`:'';
 return `<section class="panel">${head}<div class="pbody">${stale}${srcLine}${none}${mine.length?`<div class="tbl-wrap"><table><thead><tr><th>Tab</th><th>Source</th><th>Columns</th><th>Last lead</th><th>Status</th><th></th></tr></thead><tbody>${mine.map(linkRow).join('')}</tbody></table></div>`:`<p class="muted" style="margin:0">No sheet is linked to this opening yet.</p>`}</div></section>`;
}

// the window to link a new tab (link null) or change a link
function linkModal(o,link){
 const edit=!!link;
 const takenBy=t=>{const l=LS.links.find(x=>x.tabKey===t.key);return l&&(!edit||l.id!==link.id)?l:null};
 const open=LS.tabs.filter(t=>!takenBy(t));
 if(!edit&&!open.length){toast(LS.tabs.length?'Every tab seen so far is already linked':'No tab has been reported yet','var(--red)');return}
 const list=sourceList();
 const d={tabKey:edit?link.tabKey:'',source:edit?link.source:'',map:edit?{...link.map}:{},extra:new Set(edit?link.extra:[]),enabled:edit?link.enabled:true,hs:[]};
 const tabNow=()=>LS.tabs.find(t=>t.key===d.tabKey);
 const reset=()=>{const t=tabNow();d.hs=t?t.headings:(edit?link.known:[]);
  if(!edit){const g=guessLink(d.hs,customColumns());d.map=g.map;d.extra=new Set(g.extra);d.source=guessSourceFor(t&&t.name,list)}};
 reset();
 const opt=(v,l,sel,dis)=>`<option value="${esc(v)}" ${sel?'selected':''} ${dis?'disabled':''}>${esc(l)}</option>`;
 const tabSel=edit?`<div class="f"><div class="small muted">Tab</div><div><b>${esc(link.tabName)}</b></div></div>`
  :`<label class="f full">Tab of the workbook <span class="muted small">(${open.length} free of ${LS.tabs.length}) · click the one that holds this opening's leads</span>${booksOf().length>1?`<select class="inp" id="lkBook" style="margin-bottom:6px"><option value="">All workbooks (${booksOf().length})</option>${booksOf().map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join('')}</select>`:''}<input class="inp" id="lkFilter" placeholder="Type to find a tab" style="margin-bottom:6px"><select class="inp" id="lkTab" size="6">${LS.tabs.map(t=>{const b=takenBy(t);const ob=b&&getOp(b.opening);return opt(t.key,b?`${tabLabel(t)}  (linked to ${ob?ob.title:'another opening'})`:tabLabel(t),t.key===d.tabKey,!!b)}).join('')}</select></label>`;
 const grid=()=>{
  const fresh=edit?newHeadings(link,d.hs):[];
  const used=new Set(Object.values(d.map).filter(Boolean));
  const optsFor=k=>[opt('','— not in the sheet —',!d.map[k])].concat(d.hs.map(h=>opt(h,h,d.map[k]===h))).join('');
  const extras=d.hs.filter(h=>!used.has(h));
  if(!d.tabKey)return '<p class="muted" style="margin:14px 0 0">Choose the tab above first. Its columns will show here.</p>';
  return `<h4 style="margin:14px 0 6px">Which column is what</h4><div class="fgrid">${linkFields(customColumns()).map(f=>`<label class="f">${esc(f.label)}${f.need?' <span class="muted small">(needed)</span>':''}${f.custom?' <span class="muted small">(your column)</span>':''}<select class="inp" data-lk="${f.key}">${optsFor(f.key)}</select></label>`).join('')}</div>
  <p class="small muted" style="margin:6px 0 0">Name, and a phone or an email, are needed. The rest are optional.</p>
  ${canEdit()?`<div class="row" style="margin-top:10px;gap:8px;flex-wrap:nowrap"><input class="inp" id="lkNewCol" maxlength="40" placeholder="Need another column in the app? Name it, e.g. Interview status"><button class="btn" id="lkAddCol">Add column</button></div><p class="small muted" style="margin:4px 0 0">It is added to the app (Applications list and filters) and you can match a sheet column to it above.</p>`:''}
  <h4 style="margin:14px 0 6px">Other columns to keep with the lead</h4>
  ${extras.length?`<div class="fgrid" style="gap:4px 16px">${extras.map(h=>{const i=d.hs.indexOf(h);return `<label class="checkl"><input type="checkbox" data-lx="${i}" ${d.extra.has(h)?'checked':''}> ${esc(h)}${fresh.includes(h)?' <span class="pill orange">new</span>':''}</label>`}).join('')}</div><p class="small muted" style="margin:6px 0 0">These are shown on the candidate as "form answers", like the answer to "Do you have a bike?". Columns the platform adds for itself (ids, form names) are left unticked.</p>`:'<p class="small muted" style="margin:0">Every column is used for a field above.</p>'}`;
 };
 modal({title:edit?`Change the link · ${esc(link.tabName)}`:`Link a sheet to ${esc(o.title)}`,size:'w',body:`<div class="fgrid">${tabSel}
  <label class="f">Where these leads come from<select class="inp" id="lkSrc">${[...new Set([...list,d.source])].map(s=>opt(s,s,s===d.source)).join('')}</select></label>
  ${edit?`<label class="checkl" style="align-self:end"><input type="checkbox" id="lkOn" ${d.enabled?'checked':''}> Receiving leads from this tab</label>`:''}</div>
  <div id="lkCols">${grid()}</div><p id="lkSure" hidden class="small" style="margin:14px 0 0;padding:10px 12px;border:1px solid var(--orange,#f59e0b);border-radius:8px"></p>`,
  foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="lkSave">${edit?'Save':'Link this sheet'}</button>`,
  onMount:el=>{
   const paint=()=>{$('#lkCols',el).innerHTML=grid();bindCols()};
   const bindCols=()=>{
    const add=$('#lkAddCol',el);
    if(add)add.onclick=()=>{
     const name=$('#lkNewCol',el).value.trim().replace(/\s+/g,' ');
     if(!name){toast('Type the name of the column','var(--red)');return}
     const have=[...customColumns(),'Call status','Name','Phone','Email'].map(x=>x.toLowerCase());
     if(have.includes(name.toLowerCase())){toast('The app already has a column with that name','var(--red)');return}
     if(customColumns().length>=12){toast('At most 12 columns of your own','var(--red)');return}
     saveColumns([...customColumns(),name]);
     const guess=guessCustom(d.hs,[name],Object.values(d.map));Object.assign(d.map,guess);
     toast('Column added: '+name);paint()};
    $$('[data-lk]',el).forEach(s=>s.onchange=()=>{if(s.value)d.map[s.dataset.lk]=s.value;else delete d.map[s.dataset.lk];paint()});
    $$('[data-lx]',el).forEach(c=>c.onchange=()=>{const h=d.hs[+c.dataset.lx];if(c.checked)d.extra.add(h);else d.extra.delete(h)});
   };
   bindCols();
   $('#lkSrc',el).onchange=e=>{d.source=e.target.value};
   const tsel=$('#lkTab',el);
   if(tsel){
    tsel.onchange=()=>{d.tabKey=tsel.value;const sb=$('#lkSave',el);delete sb.dataset.sure;sb.textContent='Link this sheet';$('#lkSure',el).hidden=true;reset();$('#lkSrc',el).innerHTML=[...new Set([...list,d.source])].map(s=>opt(s,s,s===d.source)).join('');paint()};
    const applyFilter=()=>{const q=$('#lkFilter',el).value.trim().toLowerCase();const bk=$('#lkBook',el)?$('#lkBook',el).value:'';
     [...tsel.options].forEach(op=>{const t=LS.tabs.find(x=>x.key===op.value);op.hidden=(!!q&&!op.textContent.toLowerCase().includes(q))||(!!bk&&!!t&&t.book!==bk)})};
    $('#lkFilter',el).oninput=applyFilter;
    if($('#lkBook',el))$('#lkBook',el).onchange=applyFilter;
   }
   $('#lkSave',el).onclick=async()=>{
    if(!d.tabKey){toast('Choose the tab first','var(--red)');return}
    const extra=[...d.extra].filter(h=>d.hs.includes(h)&&!Object.values(d.map).includes(h));
    const problem=linkProblem(d.map);if(problem){toast(problem,'var(--red)');return}
    const btn=$('#lkSave',el);
    if(!edit&&btn.dataset.sure!==d.tabKey){
     // first press: say plainly which tab goes to which opening, then ask again
     btn.dataset.sure=d.tabKey;btn.textContent='Yes, link this tab';
     const t=tabNow();const msg=$('#lkSure',el);msg.hidden=false;
     msg.innerHTML=`You are linking the tab <b>${esc(t?t.name:'')}</b> to <b>${esc(o.title)}</b>. Every row already in that tab will arrive here as a lead, and new rows after that. Check it is the right tab, then press the button again.`;
     return}
    btn.disabled=true;
    try{
     if(edit)await sheetLinkUpdate({id:link.id,source:d.source,map:d.map,extra,enabled:$('#lkOn',el).checked});
     else await sheetLinkSave({opening:o.id,tabKey:d.tabKey,source:d.source,map:d.map,extra});
     closeModal();toast(edit?'Link saved':'Sheet linked. New leads will start arriving within a minute');reloadLeadSheets();
    }catch(e){btn.disabled=false;toast(e.message||'Could not save the link','var(--red)')}
   };
  }});
}

function bindLeadSheets(root){
 if(!CONNECTED||R.tab!=='leads')return;
 if(!LS.tabs&&!LS.loading&&!LS.error)loadLeadSheets();
 const o=getOp(R.param);if(!o)return;
 const on=(sel,fn)=>{const e=$(sel,root);if(e)e.onclick=fn};
 on('#lsRetry',reloadLeadSheets);
 on('#lsLink',()=>{if(!LS.tabs||!LS.links){toast('Still loading the tabs, try again in a moment','var(--red)');return}linkModal(o,null)});
 $$('[data-ls-edit]',root).forEach(b=>b.onclick=()=>{const l=LS.links.find(x=>x.id===b.dataset.lsEdit);if(l)linkModal(o,l)});
 $$('[data-ls-off]',root).forEach(b=>b.onclick=()=>{const l=LS.links.find(x=>x.id===b.dataset.lsOff);if(!l)return;
  confirmBox('Unlink this tab',`New rows in <b>${esc(l.tabName)}</b> will stop reaching ${esc(o.title)}. The leads already received stay. The tab can then be linked to another opening.`,'Unlink',async()=>{
   try{await sheetLinkRemove(l.id);toast('Unlinked');reloadLeadSheets()}catch(e){toast(e.message||'Could not unlink','var(--red)')}},true)});
}
onBind('opening',bindLeadSheets);
