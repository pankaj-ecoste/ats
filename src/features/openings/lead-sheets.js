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
const headingsOfLink=l=>{const t=tabOfLink(l);return t?t.headings:(l.known||[])};

function linkRow(l){
 const t=tabOfLink(l),hs=headingsOfLink(l);
 const fresh=t?newHeadings(l,hs):[],gone=t?missingHeadings(l,hs):[];
 const flags=[
  !l.enabled?'<span class="pill orange">Switched off</span>':'<span class="pill green">Receiving</span>',
  !t?'<span class="pill orange" title="The script has not reported this tab for a few days">Tab not seen lately</span>':'',
  fresh.length?`<span class="pill orange" title="${esc(fresh.join(', '))}">${fresh.length} new column${fresh.length>1?'s':''}</span>`:'',
  gone.length?`<span class="pill red" title="${esc(gone.join(', '))}">${gone.length} column${gone.length>1?'s':''} missing</span>`:''].filter(Boolean).join(' ');
 return `<tr><td><b>${esc(l.tabName)}</b></td><td>${esc(l.source)}</td><td class="muted small">${Object.keys(l.map).length} fields, ${l.extra.length} kept as answers</td><td class="muted small">${l.lastReceivedAt?timeAgo(l.lastReceivedAt):'nothing yet'}</td><td>${flags}</td>
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
 return `<section class="panel">${head}<div class="pbody">${srcLine}${none}${mine.length?`<div class="tbl-wrap"><table><thead><tr><th>Tab</th><th>Source</th><th>Columns</th><th>Last lead</th><th>Status</th><th></th></tr></thead><tbody>${mine.map(linkRow).join('')}</tbody></table></div>`:`<p class="muted" style="margin:0">No sheet is linked to this opening yet.</p>`}</div></section>`;
}

// the window to link a new tab (link null) or change a link
function linkModal(o,link){
 const edit=!!link;
 const takenBy=t=>{const l=LS.links.find(x=>x.tabKey===t.key);return l&&(!edit||l.id!==link.id)?l:null};
 const open=LS.tabs.filter(t=>!takenBy(t));
 if(!edit&&!open.length){toast(LS.tabs.length?'Every tab seen so far is already linked':'No tab has been reported yet','var(--red)');return}
 const list=sourceList();
 const d={tabKey:edit?link.tabKey:open[0].key,source:edit?link.source:'',map:edit?{...link.map}:{},extra:new Set(edit?link.extra:[]),enabled:edit?link.enabled:true,hs:[]};
 const tabNow=()=>LS.tabs.find(t=>t.key===d.tabKey);
 const reset=()=>{const t=tabNow();d.hs=t?t.headings:(edit?link.known:[]);
  if(!edit){const g=guessLink(d.hs);d.map=g.map;d.extra=new Set(g.extra);d.source=guessSourceFor(t&&t.name,list)}};
 reset();
 const opt=(v,l,sel,dis)=>`<option value="${esc(v)}" ${sel?'selected':''} ${dis?'disabled':''}>${esc(l)}</option>`;
 const tabSel=edit?`<div class="f"><div class="small muted">Tab</div><div><b>${esc(link.tabName)}</b></div></div>`
  :`<label class="f full">Tab of the workbook <span class="muted small">(${open.length} free of ${LS.tabs.length})</span><input class="inp" id="lkFilter" placeholder="Type to find a tab" style="margin-bottom:6px"><select class="inp" id="lkTab" size="6">${LS.tabs.map(t=>{const b=takenBy(t);const ob=b&&getOp(b.opening);return opt(t.key,b?`${t.name}  (linked to ${ob?ob.title:'another opening'})`:t.name,t.key===d.tabKey,!!b)}).join('')}</select></label>`;
 const grid=()=>{
  const fresh=edit?newHeadings(link,d.hs):[];
  const used=new Set(Object.values(d.map).filter(Boolean));
  const optsFor=k=>[opt('','— not in the sheet —',!d.map[k])].concat(d.hs.map(h=>opt(h,h,d.map[k]===h))).join('');
  const extras=d.hs.filter(h=>!used.has(h));
  return `<h4 style="margin:14px 0 6px">Which column is what</h4><div class="fgrid">${LINK_FIELDS.map(f=>`<label class="f">${esc(f.label)}${f.need?' <span class="muted small">(needed)</span>':''}<select class="inp" data-lk="${f.key}">${optsFor(f.key)}</select></label>`).join('')}</div>
  <p class="small muted" style="margin:6px 0 0">Name, and a phone or an email, are needed. The rest are optional.</p>
  <h4 style="margin:14px 0 6px">Other columns to keep with the lead</h4>
  ${extras.length?`<div class="fgrid" style="gap:4px 16px">${extras.map(h=>{const i=d.hs.indexOf(h);return `<label class="checkl"><input type="checkbox" data-lx="${i}" ${d.extra.has(h)?'checked':''}> ${esc(h)}${fresh.includes(h)?' <span class="pill orange">new</span>':''}</label>`}).join('')}</div><p class="small muted" style="margin:6px 0 0">These are shown on the candidate as "form answers", like the answer to "Do you have a bike?". Columns the platform adds for itself (ids, form names) are left unticked.</p>`:'<p class="small muted" style="margin:0">Every column is used for a field above.</p>'}`;
 };
 modal({title:edit?`Change the link · ${esc(link.tabName)}`:`Link a sheet to ${esc(o.title)}`,size:'w',body:`<div class="fgrid">${tabSel}
  <label class="f">Where these leads come from<select class="inp" id="lkSrc">${[...new Set([...list,d.source])].map(s=>opt(s,s,s===d.source)).join('')}</select></label>
  ${edit?`<label class="checkl" style="align-self:end"><input type="checkbox" id="lkOn" ${d.enabled?'checked':''}> Receiving leads from this tab</label>`:''}</div>
  <div id="lkCols">${grid()}</div>`,
  foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="lkSave">${edit?'Save':'Link this sheet'}</button>`,
  onMount:el=>{
   const paint=()=>{$('#lkCols',el).innerHTML=grid();bindCols()};
   const bindCols=()=>{
    $$('[data-lk]',el).forEach(s=>s.onchange=()=>{if(s.value)d.map[s.dataset.lk]=s.value;else delete d.map[s.dataset.lk];paint()});
    $$('[data-lx]',el).forEach(c=>c.onchange=()=>{const h=d.hs[+c.dataset.lx];if(c.checked)d.extra.add(h);else d.extra.delete(h)});
   };
   bindCols();
   $('#lkSrc',el).onchange=e=>{d.source=e.target.value};
   const tsel=$('#lkTab',el);
   if(tsel){
    tsel.onchange=()=>{d.tabKey=tsel.value;reset();$('#lkSrc',el).innerHTML=[...new Set([...list,d.source])].map(s=>opt(s,s,s===d.source)).join('');paint()};
    $('#lkFilter',el).oninput=e=>{const q=e.target.value.trim().toLowerCase();[...tsel.options].forEach(op=>{op.hidden=!!q&&!op.textContent.toLowerCase().includes(q)})};
   }
   $('#lkSave',el).onclick=async()=>{
    const extra=[...d.extra].filter(h=>d.hs.includes(h)&&!Object.values(d.map).includes(h));
    const problem=linkProblem(d.map);if(problem){toast(problem,'var(--red)');return}
    const btn=$('#lkSave',el);btn.disabled=true;
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
