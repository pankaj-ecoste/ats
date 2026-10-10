/* Candidate list, profile and messaging */
/* ---------- candidates ---------- */
"use strict";
let candQ='';
function vCandidates(){
 const l=S.candidates.filter(c=>(c.name+c.skills.join(' ')+c.company+c.location+c.designation).toLowerCase().includes(candQ.toLowerCase()));
 return `<div class="page-h"><div><h1>Candidates</h1><p>${S.candidates.length} people in your talent pool</p></div><button class="btn pri" data-act="addCandidate">${ic('upload')}Add candidate</button></div>
 <section class="panel"><div class="filters"><input class="inp" id="cq" placeholder="Search by name, skill, company, city" value="${esc(candQ)}" style="min-width:280px"></div>
 <div class="tbl-wrap"><table><thead><tr><th>Candidate</th><th>Experience</th><th>Location</th><th>Top skills</th><th>Applied for</th><th>Best match</th><th>Stage</th><th>Source</th></tr></thead><tbody>
 ${l.map(c=>{const a=primaryApp(c.id);const m=a?matchA(a):null;return `<tr class="click" data-cand="${c.id}"><td><div class="who">${av(c.name)}<div><b>${esc(c.name)}</b><small>${esc(c.designation)}, ${esc(c.company)}</small></div></div></td><td>${c.exp} yrs</td><td>${esc(c.location)}</td><td>${c.skills.slice(0,3).map(s=>`<span class="tag">${esc(s)}</span>`).join('')}${c.skills.length>3?`<span class="muted small">+${c.skills.length-3}</span>`:''}</td><td>${appsOfC(c.id).map(x=>esc(getOp(x.opId).title)).join('<br>')}</td><td>${m?ring(m.score):'—'}</td><td>${a?stagePill(a.stage):'—'}</td><td class="small">${esc(c.source)}</td></tr>`}).join('')}
 </tbody></table>${l.length?'':'<div class="empty"><b>No candidates found</b>Try a different skill or name.</div>'}</div></section>`;
}
function bindCandidates(root){const q=$('#cq',root);q.oninput=()=>{candQ=q.value;const p=q.selectionStart;render();const n=$('#cq');n.focus();n.setSelectionRange(p,p)};$$('[data-cand]',root).forEach(tr=>tr.onclick=()=>go('candidate',tr.dataset.cand))}

function vCandidate(){
 const c=getC(R.param);if(!c)return '<div class="empty">Candidate not found.</div>';
 const apps=appsOfC(c.id);let a=apps.find(x=>x.id===R.appSel)||primaryApp(c.id);R.appSel=a.id;
 const m=matchA(a),o=getOp(a.opId);
 const tabs=['overview','resume','experience','education','skills','applications','interviews','offers','documents','notes','activity'];
 let body='';
 switch(R.tab){
  case 'overview':body=`<section class="panel" style="margin-bottom:16px"><header><div><h3>Journey for ${esc(o.title)}</h3><p>Stage since ${fmtD(a.stageSince)}</p></div>${nextBtn(a,'pri')}</header><div class="pbody">${journey(a)}</div></section>
   <div class="grid g-dash">${aiMatchBlock(a)}<section class="panel"><header><h3>At a glance</h3></header><div class="pbody"><dl class="kv">${[['Email',c.email],['Phone',c.phone],['Current salary',lpa(c.curSal)],['Expected salary',lpa(c.expSal)],['Notice period',c.notice+' days'],['Relocation',c.reloc?'Open to relocate':'Prefers current city'],['Education',c.education+', '+c.university],['Source',c.source],['Recruiter',a.recruiter]].map(r=>`<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>
   ${a.screening?`<h4 style="margin:16px 0 6px">Screening call · ${esc(a.screening.outcome)}</h4><p class="small" style="margin:0">${esc(a.screening.notes||'No notes')}</p>`:''}</div></section></div>`;break;
  case 'resume':body=resumeSplit(c,o);break;
  case 'experience':body=`<section class="panel">${c.history.map(h=>`<div class="list-it" style="align-items:flex-start"><span class="av" style="background:var(--card);color:var(--tx2);border:1px solid var(--line)">${initials(h.company)}</span><div class="grow"><b>${esc(h.designation)}</b><div class="muted small">${esc(h.company)} · ${esc(h.from)}–${esc(h.to)}</div><p style="margin:6px 0 0">${esc(h.summary)}</p></div></div>`).join('')}<div class="list-it"><span class="muted">Total experience</span><b class="grow" style="text-align:right">${c.exp} years</b></div></section>`;break;
  case 'education':body=`<section class="panel"><div class="list-it"><span class="av" style="background:var(--blue2);color:var(--blue)">🎓</span><div class="grow"><b>${esc(c.education)} · ${esc(c.eduField)}</b><div class="muted small">${esc(c.university)}, ${c.gradYear}</div></div><span class="pill ${m.education>=100?'green':'orange'}">${m.education}% match to ${esc(o.education)}</span></div>${c.certifications.map(x=>`<div class="list-it"><span class="av" style="background:var(--ai2);color:var(--ai)">★</span><b class="grow">${esc(x)}</b><span class="muted small">Certification</span></div>`).join('')}</section>`;break;
  case 'skills':body=`<section class="panel"><div class="pbody">${c.skills.map(s=>{const req=o.mandatory.some(x=>norm(x)===norm(s)),pref=o.preferred.some(x=>norm(x)===norm(s));return `<span class="tag ${req||pref?'ok':''}">${esc(s)}${req?' · required':pref?' · preferred':''}</span>`}).join('')}<p class="muted small">Highlighted skills are required or preferred for ${esc(o.title)}.</p>${m.miss.length?`<p style="margin-bottom:0"><b>Gaps:</b> ${m.miss.map(s=>`<span class="tag miss">${esc(s)}</span>`).join('')}</p>`:''}</div></section>`;break;
  case 'applications':body=`<section class="panel">${appTable(apps,false)}</section>`;break;
  case 'interviews':body=`<section class="panel">${intTable(S.interviews.filter(i=>apps.some(x=>x.id===i.appId)))}</section>`;break;
  case 'offers':body=`<section class="panel">${offerTable(S.offers.filter(f=>apps.some(x=>x.id===f.appId)))}</section>`;break;
  case 'documents':body=`<section class="panel">${c.documents.map((d,k)=>`<div class="list-it">${ic('file','style="width:18px;color:var(--tx3)"')}<b class="grow">${esc(d.name)}</b><span class="pill ${d.status==='Received'?'green':d.status==='Verified'?'blue':'orange'}">${d.status}</span><select class="inp" data-doc="${k}" style="width:auto;padding:4px 8px;font-size:12px">${['Pending','Received','Verified'].map(s=>`<option ${s===d.status?'selected':''}>${s}</option>`).join('')}</select></div>`).join('')}<div class="pbody"><button class="btn sm" id="addDoc">${ic('plus')}Request document</button></div></section>`;break;
  case 'notes':body=`<section class="panel"><div class="pbody"><textarea class="inp" id="noteIn" rows="3" placeholder="Add a note for the hiring team"></textarea><div style="margin-top:8px"><button class="btn pri sm" id="noteAdd">Save note</button></div></div>${c.notes.map(n=>`<div class="list-it" style="align-items:flex-start">${av(n.by)}<div class="grow"><b>${esc(n.by)}</b> <span class="muted small">${timeAgo(n.ts)}</span><p style="margin:2px 0 0;white-space:pre-line">${esc(n.text)}</p></div></div>`).join('')}</section>`;break;
  default:body=`<section class="panel">${activityList(S.activity.filter(x=>x.text.includes(c.name)))}</section>`;
 }
 return `<div class="navrow"><button class="btn ghost sm" data-act="go" data-a1="${R.back||'candidates'}">${ic('back')}Back</button>${navBar(R.navList||[],c.id,'candidate')}</div>
 <section class="panel" style="margin-bottom:16px"><div class="pbody" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
  ${av(c.name,'lg')}<div class="grow" style="min-width:220px"><h1 style="margin:0;font-size:22px">${esc(c.name)}</h1><div class="muted">${esc(c.designation)} at ${esc(c.company)} · ${c.exp} yrs · ${esc(c.location)}</div>
  <div class="row" style="margin-top:6px">${stagePill(a.stage)}${apps.length>1?`<select class="inp" id="appSel" style="width:auto;padding:3px 8px;font-size:12px">${apps.map(x=>`<option value="${x.id}" ${x.id===a.id?'selected':''}>${esc(getOp(x.opId).title)}</option>`).join('')}</select>`:`<span class="muted small">for ${esc(o.title)}</span>`}</div></div>
  <button class="score" id="hdrMatch" title="See AI match">${ring(m.score,'xl')}</button>
 </div><div class="row" style="padding:0 18px 14px">
  <button class="btn" id="cCall">${ic('phone')}Call</button><button class="btn" id="cMail">${ic('mail')}Email</button><button class="btn" id="cWa">${ic('chat')}WhatsApp</button>
  <span class="grow"></span><button class="btn ok" id="cShort" ${a.stage!=='New'?'disabled':''}>Shortlist</button><button class="btn bad" id="cRej" ${a.stage==='Rejected'?'disabled':''}>Reject</button><button class="btn" id="cSch">${ic('int')}Schedule interview</button><button class="btn pri" id="cOffer">${ic('offer')}Create offer</button>
 </div></section>
 <div class="tabs" role="tablist">${tabs.map(t=>`<button class="${R.tab===t?'on':''}" data-tab="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div>${body}`;
}
function bindCandidate(root){
 const c=getC(R.param);if(!c)return;const a=getA(R.appSel);
 const as=$('#appSel',root);if(as)as.onchange=()=>{R.appSel=as.value;render()};
 $('#hdrMatch',root).onclick=()=>aiMatchModal(a.id);
 $('#cCall',root).onclick=()=>screeningCall(a.id);
 $('#cMail',root).onclick=()=>composeMsg(c.id,a.id,'Email');
 $('#cWa',root).onclick=()=>composeMsg(c.id,a.id,'WhatsApp');
 $('#cShort',root).onclick=()=>shortlist(a.id);$('#cRej',root).onclick=()=>rejectApp(a.id);$('#cSch',root).onclick=()=>schedulePI(a.id);
 $('#cOffer',root).onclick=()=>{const of=offerOfA(a.id);of?offerEditor(of.id):offerEditor(null,a.id)};
 $$('[data-doc]',root).forEach(s=>s.onchange=()=>{setDocumentStatus(c.id,+s.dataset.doc,s.value);render()});
 const ad=$('#addDoc',root);if(ad)ad.onclick=()=>{modal({title:'Request document',body:`<label class="f">Document name<input class="inp" id="dn" placeholder="e.g. Offer letter from previous employer"></label>`,foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="dS">Request</button>`,onMount:el=>$('#dS',el).onclick=()=>{const v=val(el,'#dn');if(!v)return;requestDocument(c.id,v);closeModal();toast('Document requested from '+c.name);render()}})};
 const na=$('#noteAdd',root);if(na)na.onclick=()=>{const v=$('#noteIn',root).value.trim();if(!v)return;addCandidateNote(c.id,v);render()};
 bindResumeSplit(root,c,getOp(a.opId));bindAppTable(root);bindIntTable(root);bindOfferTable(root);
}
function composeMsg(cid,aid,ch){
 const c=getC(cid),a=getA(aid),o=getOp(a.opId);
 const tpl={'Interview invite':`Hi ${c.name.split(' ')[0]}, thanks for your interest in the ${o.title} role at ${S.settings.company}. We'd like to invite you to the next round. Please share a convenient time this week.`,'Shortlist update':`Hi ${c.name.split(' ')[0]}, good news — your profile has been shortlisted for ${o.title}. Our recruiter will call you shortly for a quick screening.`,'Document request':`Hi ${c.name.split(' ')[0]}, please share your ID proof, education certificates and last 3 payslips so we can proceed.`,'Regret':`Hi ${c.name.split(' ')[0]}, thank you for your time. We won't be moving forward for ${o.title} right now, but we'll keep your profile for future roles.`};
 modal({title:`${ch} ${esc(c.name)}`,body:`<div class="fgrid"><label class="f">To<input class="inp" value="${esc(ch==='Email'?c.email:c.phone)}" readonly></label><label class="f">Template<select class="inp" id="tp">${Object.keys(tpl).map(k=>`<option>${k}</option>`).join('')}</select></label>${ch==='Email'?`<label class="f full">Subject<input class="inp" id="sub" value="${esc(o.title)} at ${esc(S.settings.company)}"></label>`:''}<label class="f full">Message<textarea class="inp" id="bd" rows="6">${esc(tpl['Interview invite'])}</textarea></label></div>`,
 foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="snd">${ic('send')}Send ${ch}</button>`,onMount:el=>{$('#tp',el).onchange=e=>$('#bd',el).value=tpl[e.target.value];$('#snd',el).onclick=()=>{recordMessage({cid,aid,channel:ch,template:$('#tp',el).value});closeModal();toast(`${ch} sent to ${c.name}`)}}});
}
