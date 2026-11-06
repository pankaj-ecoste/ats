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
 return `<section class="panel" style="margin-top:16px"><header><h3>Ad request</h3>${edit?`<div class="row"><button class="btn sm" data-act="adEdit" data-a1="${o.id}">${ic('edit')}Update</button><button class="btn sm" data-act="adDrop" data-a1="${o.id}">No ad needed</button></div>`:''}</header>
  <div class="pbody"><dl class="kv">${rows.map(r=>`<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('')}</dl></div></section>`;
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
