/* Ad request of an opening: optional, one per opening, filled by the recruiter */
/* ---------- ad request ---------- */
"use strict";
const rupees=n=>n==null||n===''?'—':'₹'+Number(n).toLocaleString('en-IN');
// the panel on the opening's Overview: a quiet line when no ad was asked for, the details when one was
function adPanel(o){
 const edit=canEdit();
 if(!hasAd(o))return `<section class="panel" style="margin-top:16px"><header><h3>Ad request</h3>${edit?`<button class="btn sm" data-act="adRequest" data-a1="${o.id}">${ic('plus')}Request an ad</button>`:''}</header>
  <div class="pbody"><p class="muted" style="margin:0">No ad asked for. Leads for this opening come from the linked sheet. Request an ad when you need new leads for an upcoming position.</p></div></section>`;
 const a=o.ad;
 const rows=[['Status',`<span class="pill ${AD_COLOR[a.status]}">${a.status}</span>`],['Raised',esc(fmtD(a.raisedOn)+(a.raisedBy?' by '+a.raisedBy:''))],['Ad started',esc(fmtD(a.startOn))],['Ad ended',esc(fmtD(a.endOn))],['Platform',esc(a.platform||'—')],['Budget',rupees(a.budget)],['Spend so far',rupees(a.spend)],['Creative or ad link',a.link?`<a href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">${esc(a.link)}</a>`:'—'],['Notes',esc(a.notes||'—')]];
 return `<section class="panel" style="margin-top:16px"><header><h3>Ad request</h3>${edit?`<div class="row"><button class="btn sm pri" data-act="adBrief" data-a1="${o.id}">${ic('send')}${(a.sent||[]).length?'Send again':'Send to '+esc(marketingName())}</button><button class="btn sm" data-act="adEdit" data-a1="${o.id}">${ic('edit')}Update</button><button class="btn sm" data-act="adDrop" data-a1="${o.id}">No ad needed</button></div>`:''}</header>
  <div class="pbody">${adResults(o)}<dl class="kv">${rows.map(r=>`<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('')}</dl>${adSentList(a)}</div></section>`;
}
// what the ad brought in, counted from this opening's applications (nothing typed in); says plainly what was counted
function adResults(o){
 const st=adStats(o,appsOfOp(o.id),appSource);
 const tile=(label,n,note,col)=>`<div class="kpi"><span><i style="background:${col}"></i>${label}</span><b>${n}</b><em>${note}</em></div>`;
 const pct=(n,of)=>of?Math.round(n/of*100)+'% of leads':'';
 return `<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin:0 0 6px">
  ${tile('Leads',st.leads,'from the ad','var(--ai)')}${tile('Screened',st.screened,pct(st.screened,st.leads),'var(--blue)')}${tile('Interviewed',st.interviewed,pct(st.interviewed,st.leads),'var(--cyan)')}${tile('Hired',st.hired,'offer accepted or later','var(--green)')}
  ${tile('Cost per lead',st.costPerLead==null?'—':rupees(st.costPerLead),o.ad.spend>0?'spend ÷ leads':'fill in the spend','var(--orange)')}${tile('Cost per hire',st.costPerHire==null?'—':rupees(st.costPerHire),o.ad.spend>0?'spend ÷ hired':'fill in the spend','var(--orange)')}</div>
  <p class="muted small" style="margin:0 0 14px">Counted: leads from ad sources (a source with "Ad" or "campaign" in its name, like Facebook Ad or Google Ad) that arrived ${st.from?'from '+esc(fmtD(st.from)):'so far'}${st.to?' to '+esc(fmtD(st.to)):''}. ${st.other?st.other+' other application'+(st.other>1?'s':'')+' on this opening (other sources, or before the ad) '+(st.other>1?'are':'is')+' not counted.':''}</p>`;
}
// who the brief goes to (a setting); the name is only for button and greeting
const marketingName=()=>(S.settings.marketing&&S.settings.marketing.name)||'marketing';
// every time the brief was handed over, newest first; each can be opened to read the exact text
function adSentList(a){
 const l=[...(a.sent||[])].reverse();
 if(!l.length)return '<p class="muted small" style="margin:14px 0 0">The brief has not been sent yet.</p>';
 return `<h4 style="margin:16px 0 6px">Briefs sent</h4>`+l.map(x=>`<details class="list-it" style="display:block"><summary>${esc(x.channel==='Copied'?'Copied':'Sent by '+x.channel.toLowerCase())}${x.to?' to '+esc(x.to):''} · ${esc(x.by||'')} · <span class="muted small">${timeAgo(x.ts)}</span></summary><pre style="white-space:pre-wrap;margin:8px 0 0;font:inherit" class="small">${esc(x.subject)}

${esc(x.body)}</pre></details>`).join('');
}
// the brief, ready to read and change, then handed over by email app, WhatsApp, or copied. Each is recorded on the ad.
function adBriefModal(opId){
 const o=getOp(opId);if(!hasAd(o))return;
 const m=S.settings.marketing||{};
 const b=adBrief(o,{to:m.name,from:S.settings.user,withSalary:o.ad.withSalary});
 modal({title:'Brief for '+esc(marketingName()),size:'w',body:`<div class="fgrid">
  <label class="f">To (email)<input class="inp" value="${esc(m.email||'')}" readonly placeholder="Not set. Add it in Settings"></label>
  <label class="f">WhatsApp<input class="inp" value="${esc(m.phone||'')}" readonly placeholder="Not set. Add it in Settings"></label>
  <label class="f full">Subject<input class="inp" id="abS" value="${esc(b.subject)}"></label>
  <label class="f full">Message<textarea class="inp" id="abB" rows="16">${esc(b.body)}</textarea></label>
  <p class="muted small full" style="margin:0">${o.ad.withSalary?'The salary range is included.':'The salary range is left out. Tick the box in Update to include it.'} Nothing is sent from this app: it opens your own email app or WhatsApp, and records here that you sent it.</p></div>`,
  foot:`<button class="btn" data-close>Cancel</button><span class="grow"></span><button class="btn" id="abCopy">Copy text</button><button class="btn" id="abWa" ${whatsappNumber(m.phone)?'':'disabled title="Add the WhatsApp number in Settings"'}>Open in WhatsApp</button><button class="btn pri" id="abMail" ${m.email?'':'disabled title="Add the email address in Settings"'}>${ic('send')}Open in email app</button>`,
  onMount:el=>{
   const got=()=>({subject:$('#abS',el).value,body:$('#abB',el).value});
   const open=link=>{const a=document.createElement('a');a.href=link;a.target='_blank';a.rel='noopener';a.click()};
   $('#abMail',el).onclick=()=>{const g=got();recordAdBrief(opId,{channel:'Email',to:m.email,...g});open(mailtoLink({to:m.email,...g}));closeModal();toast('Email app opened. Press send there.');refresh()};
   $('#abWa',el).onclick=()=>{const g=got();recordAdBrief(opId,{channel:'WhatsApp',to:m.phone,...g});open(whatsappLink({phone:m.phone,text:g.subject+'\n\n'+g.body}));closeModal();toast('WhatsApp opened. Press send there.');refresh()};
   $('#abCopy',el).onclick=()=>{const g=got();copyText(g.subject+'\n\n'+g.body).then(ok=>{if(!ok){toast('Copy is blocked here. Select the text and copy it.','var(--orange)');return}recordAdBrief(opId,{channel:'Copied',...g});closeModal();toast('Copied');refresh()})}}});
}
function adEditor(opId){
 const o=getOp(opId);if(!hasAd(o))return;const a=o.ad;
 modal({title:'Ad request · '+esc(o.title),size:'w',body:`<form id="adF" class="fgrid g3f">
  <label class="f">Status<select class="inp" name="status">${AD_STATUS.map(s=>`<option ${s===a.status?'selected':''}>${s}</option>`).join('')}</select></label>
  <label class="f">Ad started on<input class="inp" type="date" name="startOn" value="${esc(a.startOn||'')}"></label>
  <label class="f">Ad ended on<input class="inp" type="date" name="endOn" value="${esc(a.endOn||'')}"></label>
  <label class="f">Platform<input class="inp" name="platform" value="${esc(a.platform||'')}" placeholder="e.g. Meta, Naukri, LinkedIn"></label>
  <label class="f">Budget (₹)<input class="inp" type="number" min="0" step="any" name="budget" value="${a.budget??''}"></label>
  <label class="f">Spend so far (₹)<input class="inp" type="number" min="0" step="any" name="spend" value="${a.spend??''}"></label>
  <label class="f" style="grid-column:span 3">Creative or ad link<input class="inp" name="link" value="${esc(a.link||'')}" placeholder="https://"></label>
  <label class="f" style="grid-column:span 3">Notes<textarea class="inp" name="notes" rows="3">${esc(a.notes||'')}</textarea></label>
  <label class="f" style="grid-column:span 3;flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="withSalary" ${a.withSalary?'checked':''}>Include the salary range when the brief is sent to marketing</label>
  </form>`,
  foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="adSave">Save</button>`,
  onMount:el=>{
   $('#adF',el).onsubmit=e=>e.preventDefault();
   $('#adSave',el).onclick=()=>{const f=$('#adF',el);const d=Object.fromEntries(new FormData(f));d.withSalary=f.withSalary.checked;
    try{saveAdRequest(opId,d)}catch(e){toast(e.message,'var(--red)');return}
    closeModal();toast('Ad request saved');refresh()}}});
}
