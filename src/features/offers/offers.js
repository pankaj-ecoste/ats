/* Offers list, letter and editor */
/* ---------- offers ---------- */
function offerTable(l){
 if(!l.length)return '<div class="empty"><b>No offers yet</b>Offers appear here once a selected candidate gets one.</div>';
 return `<div class="tbl-wrap"><table><thead><tr><th>Candidate</th><th>Designation</th><th>CTC</th><th>Joining</th><th>Manager</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>${l.map(f=>{const a=getA(f.appId),c=getC(a.cid);
  return `<tr class="click" data-offer="${f.id}"><td><div class="who">${av(c.name)}<div><b>${esc(c.name)}</b><small>${f.id}</small></div></div></td><td>${esc(f.designation)}<div class="muted small">${esc(f.dept)} · ${esc(f.location)}</div></td><td><b>${inr(f.ctc)}</b></td><td>${fmtD(f.joining)}</td><td>${esc(f.manager)}</td><td>${fmtDs(f.created)}</td><td><span class="pill ${OFFER_COLOR[f.status]}">${f.status}</span></td>
  <td>${f.status==='Sent'||f.status==='Negotiation'?`<button class="btn sm" data-resp="${f.id}">Record response</button>`:f.status==='Accepted'&&a.stage==='Offer Accepted'?`<button class="btn sm" data-join="${a.id}">Schedule joining</button>`:''}</td></tr>`}).join('')}</tbody></table></div>`;
}
function bindOfferTable(root){$$('[data-offer]',root).forEach(el=>el.onclick=e=>{if(e.target.closest('button'))return;offerEditor(el.dataset.offer)});$$('[data-resp]',root).forEach(b=>b.onclick=e=>{e.stopPropagation();offerResponse(b.dataset.resp)});$$('[data-join]',root).forEach(b=>b.onclick=e=>{e.stopPropagation();scheduleJoining(b.dataset.join)})}
function vOffers(){
 const st=['All',...OFFER_STATUS];const l=S.offers.filter(o=>R.offerFilter==='All'||o.status===R.offerFilter).slice().reverse();
 const acc=S.offers.filter(o=>o.status==='Accepted').length,dec=S.offers.filter(o=>o.status==='Declined').length;
 return `<div class="page-h"><div><h1>Offers</h1><p>${S.offers.length} offers · acceptance rate ${acc+dec?Math.round(acc/(acc+dec)*100):100}%</p></div><button class="btn pri" onclick="pickForOffer()">${ic('plus')}Create offer</button></div>
 <section class="panel"><div class="filters"><div class="seg">${st.map(s=>`<button class="${R.offerFilter===s?'on':''}" data-of="${s}">${s} ${s==='All'?S.offers.length:S.offers.filter(o=>o.status===s).length||''}</button>`).join('')}</div></div>${offerTable(l)}</section>`;
}
function bindOffers(root){$$('[data-of]',root).forEach(b=>b.onclick=()=>{R.offerFilter=b.dataset.of;render()});bindOfferTable(root)}
function pickForOffer(){
 const l=S.applications.filter(a=>['Selected','Personal Interview','Offer'].includes(a.stage)&&!S.offers.some(o=>o.appId===a.id&&!['Declined','Withdrawn'].includes(o.status)));
 if(!l.length){toast('No selected candidates need an offer right now','var(--orange)');return}
 modal({title:'Create offer for',body:`<div class="panel" style="box-shadow:none">${l.map(a=>{const c=getC(a.cid);return `<div class="list-it" style="cursor:pointer" data-pk="${a.id}">${av(c.name)}<div class="grow"><b>${esc(c.name)}</b><div class="muted small">${esc(getOp(a.opId).title)}</div></div>${stagePill(a.stage)}</div>`}).join('')}</div>`,onMount:el=>$$('[data-pk]',el).forEach(x=>x.onclick=()=>{closeModal();offerEditor(null,x.dataset.pk)})});
}
function letterHTML(f){
 const a=getA(f.appId),c=getC(a.cid),s=S.settings,b=f.breakup;
 const rows=[['Basic salary',b.basic],['House rent allowance (HRA)',b.hra],['Special allowance',b.special],['Other allowance',b.other],['Performance bonus (variable)',b.bonus]];
 if(f.custom)return f.custom;
 return `<div class="lh"><div style="display:flex;gap:12px;align-items:center"><img src="${LOGO_SRC}" alt="" style="height:38px;width:auto"><div><b style="font-size:16px">${esc(s.company)}</b><div style="font-size:11px;color:#667">${esc(s.companyAddr)}</div></div></div><div style="text-align:right;font-size:12px;color:#556">Ref: ${f.id}<br>Date: ${fmtD(f.created)}</div></div>
 <p><b>${esc(c.name)}</b><br>${esc(c.location)}<br>${esc(c.email)}</p>
 <p><b>Subject: Offer of employment — ${esc(f.designation)}</b></p>
 <p>Dear ${esc(c.name.split(' ')[0])},</p>
 <p>We are delighted to offer you the position of <b>${esc(f.designation)}</b> in the <b>${esc(f.dept)}</b> department at ${esc(s.company)}, following our interview process. We were impressed by your experience and the value you will bring to the team.</p>
 <p>Your employment will be <b>${esc(f.empType.toLowerCase())}</b>, based at our <b>${esc(f.location)}</b> location, reporting to <b>${esc(f.manager)}</b>. Your date of joining will be <b>${fmtD(f.joining)}</b>.</p>
 <p>Your annual cost to company (CTC) will be <b>${inr(f.ctc)}</b>, structured as follows:</p>
 <table><thead><tr><th style="text-align:left">Component</th><th style="text-align:right">Annual (₹)</th><th style="text-align:right">Monthly (₹)</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td style="text-align:right">${inr(r[1])}</td><td style="text-align:right">${inr(r[1]/12)}</td></tr>`).join('')}<tr><td><b>Total CTC</b></td><td style="text-align:right"><b>${inr(f.ctc)}</b></td><td style="text-align:right"><b>${inr(f.ctc/12)}</b></td></tr></tbody></table>
 <p>You will be on probation for ${f.probation} months from your joining date. This offer is contingent on satisfactory background verification and submission of the documents listed in the joining kit.</p>
 <p>Please confirm your acceptance by signing and returning a copy of this letter within <b>${f.validity} days</b> of the date above.</p>
 <p>We look forward to welcoming you to ${esc(s.company)}.</p>
 <p style="margin-top:28px">Warm regards,<br><br><b>${esc(s.signatory)}</b><br>${esc(s.signTitle)}<br>${esc(s.company)}</p>
 <p style="margin-top:28px;border-top:1px dashed #ccd;padding-top:12px;font-size:12px;color:#556">Accepted by: ______________________ &nbsp;&nbsp; Date: ____________</p>`;
}
function offerEditor(fid,aid){
 let f=fid?S.offers.find(x=>x.id===fid):null;
 if(!f){const a=getA(aid),c=getC(a.cid),o=getOp(a.opId);const ctc=Math.round(clamp(c.expSal,o.salMin,o.salMax)*100000);
  f={id:uid('OFR'),appId:aid,designation:o.title,dept:o.dept,location:o.location,joining:addDays(Math.max(15,c.notice+5)),manager:o.manager,empType:o.type,ctc,breakup:autoSplit(ctc),status:'Draft',created:TODAY,sent:null,custom:null,probation:6,validity:7,_new:true}}
 const w=JSON.parse(JSON.stringify(f));const a=getA(w.appId),c=getC(a.cid),o=getOp(a.opId);
 const fld=(k,l,t='text')=>`<label class="f">${l}<input class="inp" data-o="${k}" type="${t}" value="${esc(w[k])}"></label>`;
 const bk=(k,l)=>`<label class="f">${l}<input class="inp" data-b="${k}" type="number" step="1000" value="${w.breakup[k]}"></label>`;
 modal({title:`Offer letter · ${esc(c.name)} <span class="pill ${OFFER_COLOR[w.status]}" id="ofSt" style="margin-left:6px">${w.status}</span>`,size:'xw',body:`<div class="grid" style="grid-template-columns:minmax(0,380px) minmax(0,1fr)">
 <div><h4 style="margin:0 0 8px">Offer details</h4><div class="fgrid"><label class="f">Company<input class="inp" value="${esc(S.settings.company)}" readonly></label><label class="f">Candidate<input class="inp" value="${esc(c.name)}" readonly></label>
 ${fld('designation','Designation')}${fld('dept','Department')}${fld('location','Location')}${fld('joining','Joining date','date')}${fld('manager','Reporting manager')}
 <label class="f">Employment type<select class="inp" data-o="empType">${['Full-time','Contract','Internship','Part-time'].map(x=>`<option ${x===w.empType?'selected':''}>${x}</option>`).join('')}</select></label>
 ${fld('probation','Probation (months)','number')}${fld('validity','Offer valid (days)','number')}</div>
 <h4 style="margin:16px 0 8px;display:flex;justify-content:space-between;align-items:center">Salary breakup <button class="btn sm ghost" id="autoS">Auto-split from CTC</button></h4>
 <div class="fgrid"><label class="f full">Annual CTC (₹)<input class="inp" id="ctcIn" type="number" step="10000" value="${w.ctc}"></label>${bk('basic','Basic')}${bk('hra','HRA')}${bk('special','Special allowance')}${bk('other','Other allowance')}${bk('bonus','Bonus')}<div class="f" style="justify-content:flex-end"><span class="small muted">Components total</span><b id="bkTot"></b></div></div>
 <p class="small muted">Budget for ${esc(o.title)}: ${lpa(o.salMin)}–${lpa(o.salMax)} · candidate expects ${lpa(c.expSal)}</p><div id="ofWarn"></div></div>
 <div><div class="row" style="justify-content:space-between;margin-bottom:8px"><h4 style="margin:0">Live preview</h4><div class="row"><button class="btn sm" id="ofEdit">${ic('edit')}Edit text</button><button class="btn sm" id="ofRegen">${ic('refresh')}Regenerate</button></div></div>
 <div style="max-height:64vh;overflow:auto;padding:4px"><div class="letter" id="letter"></div></div></div></div>`,
 foot:`<button class="btn" id="ofPrev">${ic('eye')}Preview</button><button class="btn" id="ofPdf">${ic('print')}Generate PDF / Download</button><span class="grow"></span><button class="btn" id="ofDraft">Save draft</button><button class="btn aib" id="ofGen">Generate</button><button class="btn pri" id="ofSend">${ic('send')}Send offer</button>`,
 onMount:el=>{
  const L=$('#letter',el);let editing=false;
  const sum=()=>Object.values(w.breakup).reduce((s,v)=>s+(+v||0),0);
  const upd=()=>{if(!editing)L.innerHTML=letterHTML(w);const t=sum();$('#bkTot',el).textContent=inr(t);$('#bkTot',el).style.color=t===w.ctc?'var(--green)':'var(--red)';
   const warn=[];if(t!==w.ctc)warn.push(`Components add up to ${inr(t)}, not the CTC of ${inr(w.ctc)}.`);if(w.ctc>o.salMax*100000)warn.push('CTC is above the approved budget for this opening.');
   $('#ofWarn',el).innerHTML=warn.map(x=>`<div class="small" style="padding:8px 10px;background:var(--orange2);border-radius:8px;margin-top:6px">${x}</div>`).join('')};
  $$('[data-o]',el).forEach(i=>i.oninput=i.onchange=()=>{w[i.dataset.o]=i.type==='number'?+i.value:i.value;w.custom=null;upd()});
  $$('[data-b]',el).forEach(i=>i.oninput=()=>{w.breakup[i.dataset.b]=+i.value||0;w.custom=null;upd()});
  $('#ctcIn',el).oninput=e=>{w.ctc=+e.target.value||0;w.custom=null;upd()};
  $('#autoS',el).onclick=()=>{w.breakup=autoSplit(w.ctc);Object.entries(w.breakup).forEach(([k,v])=>$(`[data-b="${k}"]`,el).value=v);w.custom=null;upd()};
  $('#ofEdit',el).onclick=()=>{editing=!editing;L.contentEditable=editing;$('#ofEdit',el).innerHTML=editing?ic('check')+'Done editing':ic('edit')+'Edit text';if(!editing){w.custom=L.innerHTML;toast('Letter text updated')}else L.focus()};
  $('#ofRegen',el).onclick=()=>{w.custom=null;editing=false;L.contentEditable=false;$('#ofEdit',el).innerHTML=ic('edit')+'Edit text';upd();toast('Letter regenerated from offer details','var(--ai)')};
  const commit=status=>{if(editing){w.custom=L.innerHTML;editing=false}
   if(sum()!==w.ctc&&status!=='Draft'){toast('Fix the salary breakup so components equal CTC','var(--red)');return false}
   const isNew=!S.offers.includes(f);w.status=status;delete w._new;
   if(isNew){S.offers.push(w);f=w;log(`Offer ${status==='Draft'?'drafted':'generated'} for ${c.name}`,'offer',a.id)}else Object.assign(f,w);
   if(STAGES.indexOf(a.stage)<6||a.stage==='On Hold')setStage(a.id,'Offer',true);
   $('#ofSt',el).className='pill '+OFFER_COLOR[status];$('#ofSt',el).textContent=status;save();return true};
  $('#ofDraft',el).onclick=()=>{if(commit('Draft')){closeModal();toast('Offer saved as draft');refresh()}};
  $('#ofGen',el).onclick=()=>{if(commit('Generated')){toast('Offer letter generated','var(--ai)');refresh()}};
  $('#ofSend',el).onclick=()=>{if(!commit('Sent'))return;f.sent=TODAY;log(`Offer sent to ${c.name}`,'offer',a.id);notify(`Offer sent to ${c.name} · awaiting response`,['offers']);S.tasks.unshift({id:uid('T'),title:`Follow up with ${c.name} on offer`,due:addDays(2),related:o.title,priority:'High',done:false,owner:S.settings.user});save();closeModal();toast(`Offer sent to ${c.email}`);refresh()};
  $('#ofPrev',el).onclick=()=>{if(editing)w.custom=L.innerHTML;modal({title:'Offer letter preview',size:'w',body:`<div class="letter">${letterHTML(w)}</div>`,foot:`<button class="btn" data-close>Close</button>`})};
  $('#ofPdf',el).onclick=()=>{if(editing)w.custom=L.innerHTML;$('#printArea').innerHTML=`<div class="letter">${letterHTML(w)}</div>`;
   try{window.print();toast('Choose “Save as PDF” in the print dialog')}catch(e){toast('Printing is blocked here. Open the preview and use your browser\'s print.','var(--orange)')}};
  upd();
 }});
}
function offerResponse(fid){
 const f=S.offers.find(x=>x.id===fid),a=getA(f.appId),c=getC(a.cid);
 modal({title:`Response from ${esc(c.name)}`,body:`<p style="margin-top:0">Offer sent ${fmtD(f.sent)} for <b>${esc(f.designation)}</b> at ${inr(f.ctc)} CTC.</p><label class="f">Notes<textarea class="inp" id="rn" rows="3" placeholder="e.g. Accepted over call, signed copy to follow"></textarea></label>`,
 foot:`<button class="btn bad" data-r="Declined">Declined</button><button class="btn" data-r="Negotiation">Wants to negotiate</button><button class="btn ok" data-r="Accepted">${ic('check')}Accepted</button>`,
 onMount:el=>$$('[data-r]',el).forEach(b=>b.onclick=()=>{const r=b.dataset.r;f.status=r;log(`${c.name} ${r==='Negotiation'?'asked to negotiate the offer':r.toLowerCase()+' the offer'}`,'offer',a.id);closeModal();
  if(r==='Accepted'){setStage(a.id,'Offer Accepted',true);notify(`${c.name} accepted the offer 🎉`,['onboarding']);save();refresh();toast(`${c.name} accepted the offer`);scheduleJoining(a.id)}
  else if(r==='Declined'){save();toast('Offer marked declined','var(--red)');refresh()}
  else {save();toast('Marked for negotiation. Revise and resend.','var(--orange)');offerEditor(f.id)}})});
}
