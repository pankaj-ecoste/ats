/* AI match breakdown block and modal, note form */
/* ---------- AI match modal ---------- */
function aiMatchBlock(a,full=true){
 const c=getC(a.cid),o=getOp(a.opId),m=matchA(a);
 const brk=[['Skills',m.skills],['Experience',m.experience],['Education',m.education],['Location',m.location],['Salary',m.salary],['Notice',m.notice]];
 return `<div class="aibox"><div class="row" style="justify-content:space-between;align-items:flex-start;gap:18px">
  <div style="display:flex;gap:18px;align-items:center">${ring(m.score,'xl')}<div><span class="ai-lbl">${ic('ai')}AI match score</span><div style="font-size:20px;font-weight:700;margin:2px 0">${m.verdict}</div><div class="muted small">${esc(c.name)} vs ${esc(o.title)} (${o.id})</div></div></div>
  <div style="flex:1;min-width:240px">${brk.map(b=>`<div class="brk"><span>${b[0]} match</span><div class="bar"><i style="width:${b[1]}%;background:${scoreColor(b[1])}"></i></div><b style="text-align:right">${b[1]}%</b></div>`).join('')}</div></div>
  ${full?`<div class="grid g2" style="margin-top:14px"><div><div class="small" style="font-weight:700;margin-bottom:6px">Matching skills</div>${m.mm.map(s=>`<span class="tag ok">✓ ${esc(s)}</span>`).join('')}${m.pm.map(s=>`<span class="tag ok" title="Preferred">✓ ${esc(s)} <small>(pref)</small></span>`).join('')||''}${!m.mm.length&&!m.pm.length?'<span class="muted small">None</span>':''}</div>
  <div><div class="small" style="font-weight:700;margin-bottom:6px">Missing or weak areas</div>${m.miss.map(s=>`<span class="tag miss">⚠ ${esc(s)} <small>(mandatory)</small></span>`).join('')}${m.pmiss.map(s=>`<span class="tag miss">⚠ ${esc(s)}</span>`).join('')||''}${!m.miss.length&&!m.pmiss.length?'<span class="muted small">No gaps against the opening</span>':''}</div></div>
  <div style="margin-top:14px"><div class="small" style="font-weight:700;margin-bottom:4px">AI summary</div><p style="margin:0">${esc(m.summary)}</p></div>
  <div class="grid g2" style="margin-top:12px;font-size:13px"><div><b class="small">Certifications</b><div>${m.certs.length?m.certs.map(esc).join('<br>'):c.certifications.length?esc(c.certifications.join(', '))+' <span class="muted">(not required)</span>':'<span class="muted">None listed</span>'}</div></div><div><b class="small">Industry</b><div>${esc(m.industry)}</div></div></div>
  ${m.risks.length?`<div style="margin-top:12px;padding:10px 12px;background:var(--orange2);border-radius:8px;font-size:13px"><b>Watch-outs:</b> ${m.risks.map(esc).join(' · ')}</div>`:''}
  <p class="muted small" style="margin:10px 0 0">Why this score: weighted blend of skills ${S.settings.weights.skills}%, experience ${S.settings.weights.experience}%, education ${S.settings.weights.education}%, location ${S.settings.weights.location}%, salary ${S.settings.weights.salary}%, notice ${S.settings.weights.notice}%. Change weights in Settings.</p>`:''}
 </div>`;
}
function aiMatchModal(aid){
 const a=getA(aid),c=getC(a.cid);
 modal({title:'AI match',size:'w',body:aiMatchBlock(a)+`<div style="margin-top:12px">${journey(a)}</div>`,
 foot:`<button class="btn ghost" id="mNote">Add note</button><button class="btn bad" id="mRej">Reject</button><button class="btn" id="mCall">${ic('phone')}Call candidate</button><button class="btn" id="mSch">${ic('int')}Schedule interview</button><button class="btn ok" id="mShort" ${a.stage!=='New'?'disabled':''}>${ic('check')}Shortlist</button>`,
 onMount:el=>{$('#mShort',el).onclick=()=>{closeModal();shortlist(aid)};$('#mRej',el).onclick=()=>{closeModal();rejectApp(aid)};$('#mCall',el).onclick=()=>{closeModal();screeningCall(aid)};$('#mSch',el).onclick=()=>{closeModal();schedulePI(aid)};$('#mNote',el).onclick=()=>noteForm(c.id)}});
}
function noteForm(cid){modal({title:'Add note',body:`<textarea class="inp" id="nt" rows="4" placeholder="What should the team know?"></textarea>`,foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="ntS">Save note</button>`,onMount:el=>{$('#ntS',el).onclick=()=>{const v=$('#nt',el).value.trim();if(!v)return;addCandidateNote(cid,v);closeModal();toast('Note saved');refresh()}}})}
