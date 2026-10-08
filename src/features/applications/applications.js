/* Applications table, board, filters, bulk actions */
/* ---------- applications ---------- */
function filteredApps(){
 const f=R.af;
 let l=S.applications.filter(a=>{const c=getC(a.cid),o=getOp(a.opId),m=matchA(a);
  if(f.op&&a.opId!==f.op)return false;if(f.status&&a.stage!==f.status)return false;if(f.rec&&a.recruiter!==f.rec)return false;
  if(m.score<f.min)return false;if(f.exp&&c.exp<+f.exp)return false;if(f.loc&&!c.location.toLowerCase().includes(f.loc.toLowerCase()))return false;
  if(f.skill&&!c.skills.join(' ').toLowerCase().includes(f.skill.toLowerCase()))return false;if(f.from&&a.date<f.from)return false;
  if(f.q&&!(c.name+o.title+c.email+a.id).toLowerCase().includes(f.q.toLowerCase()))return false;return true});
 const key={date:a=>a.date,name:a=>getC(a.cid).name,match:a=>matchA(a).score,exp:a=>getC(a.cid).exp,notice:a=>getC(a.cid).notice,cur:a=>getC(a.cid).curSal,expSal:a=>getC(a.cid).expSal,stage:a=>stageRank(a)}[f.sort]||(a=>a.date);
 return l.sort((a,b)=>{const x=key(a),y=key(b);return (x>y?1:x<y?-1:0)*f.dir});
}
function appTable(list,compact){
 const th=(k,l)=>`<th class="sort" data-sort="${k}">${l}${R.af.sort===k?(R.af.dir>0?' ▲':' ▼'):''}</th>`;
 if(!list.length)return '<div class="empty"><b>No applications here</b>Adjust filters or add a candidate.</div>';
 return `<div class="tbl-wrap"><table><thead><tr>${compact?'':'<th><input type="checkbox" class="chk" id="selAll" aria-label="Select all"></th>'}${th('name','Candidate')}${compact?'':'<th>Opening</th>'}${th('date','Applied')}<th>Resume</th>${th('match','AI match')}${th('exp','Exp')}<th>Skills</th><th>Location</th><th>Education</th>${th('notice','Notice')}${th('cur','Current')}${th('expSal','Expected')}${th('stage','Status')}<th>Recruiter</th><th>Next action</th></tr></thead><tbody>
 ${list.map(a=>{const c=getC(a.cid),o=getOp(a.opId),m=matchA(a);const pc=v=>`<span style="color:${scoreColor(v)};font-weight:600">${v}%</span>`;
  return `<tr class="click ${R.sel.has(a.id)?'sel':''}" data-cand="${c.id}">${compact?'':`<td><input type="checkbox" class="chk" data-sel="${a.id}" ${R.sel.has(a.id)?'checked':''} aria-label="Select ${esc(c.name)}"></td>`}
  <td><div class="who">${av(c.name)}<div><b>${esc(c.name)}</b><small>${esc(c.designation)}, ${esc(c.company)}</small></div></div></td>${compact?'':`<td>${esc(o.title)}</td>`}
  <td>${fmtDs(a.date)}</td><td><button class="btn sm ghost" data-resume="${c.id}" data-op="${o.id}" aria-label="View resume">${ic('file')}</button></td>
  <td><button class="score" data-match="${a.id}" title="See why">${ring(m.score)}</button></td><td>${c.exp}y</td><td>${pc(m.skills)}</td><td>${pc(m.location)}</td><td>${pc(m.education)}</td>
  <td>${c.notice}d</td><td>${lpa(c.curSal)}</td><td>${lpa(c.expSal)}</td><td>${stagePill(a.stage)}</td><td class="small">${esc(a.recruiter)}</td><td>${nextBtn(a)}</td></tr>`}).join('')}
 </tbody></table></div>`;
}
function bindAppTable(root){
 $$('[data-cand]',root).forEach(tr=>tr.onclick=e=>{if(e.target.closest('button,input'))return;go('candidate',tr.dataset.cand)});
 $$('[data-match]',root).forEach(b=>b.onclick=e=>{e.stopPropagation();aiMatchModal(b.dataset.match)});
 $$('[data-resume]',root).forEach(b=>b.onclick=e=>{e.stopPropagation();resumeModal(b.dataset.resume,b.dataset.op)});
 $$('[data-sort]',root).forEach(t=>t.onclick=()=>{const k=t.dataset.sort;if(R.af.sort===k)R.af.dir*=-1;else{R.af.sort=k;R.af.dir=k==='name'?1:-1}render()});
 $$('[data-sel]',root).forEach(cb=>cb.onchange=()=>{cb.checked?R.sel.add(cb.dataset.sel):R.sel.delete(cb.dataset.sel);render()});
 const sa=$('#selAll',root);if(sa){const l=filteredApps();sa.checked=l.length&&l.every(a=>R.sel.has(a.id));sa.onchange=()=>{l.forEach(a=>sa.checked?R.sel.add(a.id):R.sel.delete(a.id));render()}}
 bindNext(root);
}
function vApplications(){
 const f=R.af;const list=filteredApps();const opt=(arr,v,all)=>`<option value="">${all}</option>`+arr.map(x=>`<option value="${esc(x[0])}" ${x[0]===v?'selected':''}>${esc(x[1])}</option>`).join('');
 const bulk=R.sel.size?`<div class="bulk"><b>${R.sel.size} selected</b><button class="btn sm" data-bulk="short">Shortlist</button><button class="btn sm" data-bulk="gi">Schedule group interview</button>
  <select class="inp" id="bulkStage" style="width:auto;padding:5px 8px;font-size:12px"><option value="">Move to stage…</option>${STAGES.concat(['On Hold']).map(s=>`<option>${s}</option>`).join('')}</select>
  <select class="inp" id="bulkRec" style="width:auto;padding:5px 8px;font-size:12px"><option value="">Assign recruiter…</option>${RECRUITERS.map(s=>`<option>${s}</option>`).join('')}</select>
  <button class="btn sm bad" data-bulk="rej">Reject</button><button class="btn sm ghost" data-bulk="clear">Clear</button></div>`:'';
 const board=()=>{const l=list;const cols=STAGES.concat(['On Hold','Rejected']);return `<div class="board">${cols.map(s=>{const it=l.filter(a=>a.stage===s);return `<div class="col" data-col="${s}"><h4>${stagePill(s)}<span class="muted">${it.length}</span></h4><div class="cards">${it.map(a=>{const c=getC(a.cid),m=matchA(a);return `<div class="kc" draggable="true" data-drag="${a.id}"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>${esc(c.name)}</b>${ring(m.score)}</div><div class="muted small">${esc(getOp(a.opId).title)}</div><div class="muted small">${c.exp} yrs · ${esc(c.location)} · ${c.notice}d notice</div><div style="margin-top:8px">${nextBtn(a)}</div></div>`}).join('')}</div></div>`}).join('')}</div>`};
 return `<div class="page-h"><div><h1>Applications</h1><p>${list.length} of ${S.applications.length} applications · AI match runs automatically when a resume arrives</p></div>
 <div class="row">${slotHTML('applications.toolbar')}<div class="seg"><button class="${R.appView==='table'?'on':''}" data-av="table">${ic('list','style="width:14px;vertical-align:-2px"')} Table</button><button class="${R.appView==='board'?'on':''}" data-av="board">${ic('board','style="width:14px;vertical-align:-2px"')} Board</button></div><button class="btn pri" onclick="addCandidate()">${ic('upload')}Add application</button></div></div>
 <section class="panel"><div class="filters">
  <input class="inp" id="afq" placeholder="Search name, opening, ID" value="${esc(f.q)}" style="min-width:180px">
  <select class="inp" data-f="op">${opt(S.openings.map(o=>[o.id,o.title]),f.op,'All openings')}</select>
  <select class="inp" data-f="status">${opt(STAGES.concat(['On Hold','Rejected']).map(s=>[s,s]),f.status,'All statuses')}</select>
  <select class="inp" data-f="rec">${opt(RECRUITERS.map(s=>[s,s]),f.rec,'All recruiters')}</select>
  <input class="inp" data-f="skill" placeholder="Skill" value="${esc(f.skill)}" style="width:100px">
  <input class="inp" data-f="loc" placeholder="Location" value="${esc(f.loc)}" style="width:100px">
  <select class="inp" data-f="exp">${opt([['1','1+ yrs'],['3','3+ yrs'],['5','5+ yrs'],['7','7+ yrs']],f.exp,'Any experience')}</select>
  <label class="small" style="display:flex;align-items:center;gap:6px;color:var(--tx2)">Match ≥ <input type="range" min="0" max="95" step="5" data-f="min" value="${f.min}" style="width:90px;accent-color:var(--ai)"><b>${f.min}%</b></label>
  <label class="small" style="display:flex;align-items:center;gap:6px;color:var(--tx2)">Since <input type="date" class="inp" data-f="from" value="${f.from}"></label>
  ${Object.entries(f).some(([k,v])=>!['sort','dir'].includes(k)&&v&&v!==0)?'<button class="btn sm ghost" id="afClear">Clear filters</button>':''}
 </div>${bulk}${R.appView==='table'?appTable(list):board()}</section>`;
}
function bindApplications(root){
 const q=$('#afq',root);q.oninput=()=>{R.af.q=q.value;const p=q.selectionStart;render();const n=$('#afq');n.focus();n.setSelectionRange(p,p)};
 $$('[data-f]',root).forEach(el=>{const h=()=>{R.af[el.dataset.f]=el.type==='range'?+el.value:el.value;render()};if(el.tagName==='SELECT'||el.type==='range'||el.type==='date')el.onchange=h;else el.onchange=h});
 const c=$('#afClear',root);if(c)c.onclick=()=>{Object.assign(R.af,{q:'',op:'',status:'',rec:'',min:0,exp:'',loc:'',skill:'',from:''});render()};
 $$('[data-av]',root).forEach(b=>b.onclick=()=>{R.appView=b.dataset.av;render()});
 $$('[data-bulk]',root).forEach(b=>b.onclick=()=>{const ids=[...R.sel];const k=b.dataset.bulk;
  if(k==='clear'){R.sel.clear();render();return}
  if(k==='short'){ids.forEach(id=>{if(getA(id).stage==='New')setStage(id,'Shortlisted',true)});toast(ids.length+' candidates shortlisted');R.sel.clear();render()}
  if(k==='rej')confirmBox('Reject candidates',`Reject ${ids.length} selected applications?`,'Reject all',()=>{ids.forEach(id=>setStage(id,'Rejected',true));R.sel.clear();toast(ids.length+' applications rejected','var(--red)');render()},true);
  if(k==='gi'){const ops=[...new Set(ids.map(id=>getA(id).opId))];if(ops.length>1){toast('Pick candidates from one opening for a group interview','var(--orange)');return}scheduleGI(ops[0],ids)}});
 const bs=$('#bulkStage',root);if(bs)bs.onchange=()=>{if(!bs.value)return;const n=R.sel.size;[...R.sel].forEach(id=>setStage(id,bs.value,true));R.sel.clear();toast(`${n} moved to ${bs.value}`);render()};
 const br=$('#bulkRec',root);if(br)br.onchange=()=>{if(!br.value)return;assignRecruiter([...R.sel],br.value);toast('Assigned to '+br.value);R.sel.clear();render()};
 bindAppTable(root);
 // kanban drag and drop
 $$('[data-drag]',root).forEach(k=>{k.ondragstart=e=>{e.dataTransfer.setData('text/plain',k.dataset.drag);k.classList.add('drag')};k.ondragend=()=>k.classList.remove('drag');k.onclick=e=>{if(!e.target.closest('button'))go('candidate',getA(k.dataset.drag).cid)}});
 $$('[data-col]',root).forEach(col=>{col.ondragover=e=>{e.preventDefault();col.classList.add('over')};col.ondragleave=()=>col.classList.remove('over');col.ondrop=e=>{e.preventDefault();col.classList.remove('over');const id=e.dataTransfer.getData('text/plain');if(id)setStage(id,col.dataset.col)}});
}
