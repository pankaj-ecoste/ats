/* Applications table, board, filters, bulk actions */
/* ---------- applications ---------- */
"use strict";
const callOf=a=>a.callStatus||'';
const appCallOf=a=>a.appCall||'NA';   // "Call status via app": NA until a recruiter logs a call
const customOf=(a,n)=>(a.custom&&a.custom[n])||'';
// the admin's own columns that at least one application has a value for
// (plus any question a recruiter asked on a screening call, which is kept the same way)
// one pass over the applications (a search per column per application made this slow down with the square of the list)
const shownColumns=()=>{
 const has=new Set(),extra=[];      // names with at least one value, and the unlisted ones in the order they were first met
 S.applications.forEach(a=>{const c=a.custom;if(!c)return;let fresh;for(const k in c)if(c[k]&&!has.has(k))(fresh=fresh||[]).push(k);if(fresh)fresh.sort().forEach(k=>{has.add(k);extra.push(k)})});
 const seen=new Set(),out=[];
 const add=n=>{if(!seen.has(n)&&has.has(n)){seen.add(n);out.push(n)}};
 customColumns().forEach(add);extra.forEach(add);
 return out;
};
const shortName=n=>n.length>26?n.slice(0,25)+'…':n;
const valuesOf=n=>[...new Set(S.applications.map(a=>customOf(a,n)).filter(Boolean))].sort((x,y)=>x.localeCompare(y));
function filteredApps(){
 const f=R.af,cols=shownColumns();      // asked once: asking per application made filtering slow down with the square of the list
 let l=S.applications.filter(a=>{const c=getC(a.cid),o=getOp(a.opId),m=matchA(a);
  if(f.op&&a.opId!==f.op)return false;if(f.call&&callOf(a)!==f.call)return false;if(f.acall&&appCallOf(a)!==f.acall)return false;if(cols.some(n=>f['x:'+n]&&customOf(a,n)!==f['x:'+n]))return false;if(f.status&&a.stage!==f.status)return false;if(f.rec&&a.recruiter!==f.rec)return false;
  if(m.score<f.min)return false;if(f.exp&&c.exp<+f.exp)return false;if(f.loc&&!c.location.toLowerCase().includes(f.loc.toLowerCase()))return false;
  if(f.skill&&!c.skills.join(' ').toLowerCase().includes(f.skill.toLowerCase()))return false;if(f.from&&a.date<f.from)return false;
  if(f.q&&!(c.name+o.title+c.email+a.id).toLowerCase().includes(f.q.toLowerCase()))return false;return true});
 const key={date:a=>a.date,name:a=>getC(a.cid).name,match:a=>matchA(a).score,exp:a=>getC(a.cid).exp,notice:a=>getC(a.cid).notice,cur:a=>getC(a.cid).curSal,expSal:a=>getC(a.cid).expSal,stage:a=>stageRank(a)}[f.sort]||(a=>a.date);
 return l.sort((a,b)=>{const x=key(a),y=key(b);return (x>y?1:x<y?-1:0)*f.dir});
}
// the call statuses in use, for the filter
const callList=()=>[...new Set(S.applications.map(callOf).filter(Boolean))].sort((x,y)=>x.localeCompare(y));
// the status of a call made through the app, as a button a recruiter presses to log the next call (viewers who cannot edit just see it)
const appCallPill=a=>{const v=appCallOf(a);return canEdit()?`<button class="pill ${APP_CALL_COLOR[v]}" data-appcall="${a.id}" title="Log a call" style="border:0;cursor:pointer;white-space:nowrap">${esc(v)} ▾</button>`:`<span class="pill ${APP_CALL_COLOR[v]}">${esc(v)}</span>`};
// the list of call statuses under the button; choosing one (even the one already there) logs a call
function appCallMenu(btn,aid){
 let dd=$('#acDD');if(!dd){dd=document.createElement('div');dd.id='acDD';dd.className='dd hide';dd.style.position='fixed';dd.style.minWidth='230px';document.body.appendChild(dd)}
 const cur=appCallOf(getA(aid));
 closeDD('acDD');
 dd.innerHTML='<h6>Call status via app</h6>'+APP_CALL_STATUS.map(s=>`<div class="it" data-s="${esc(s)}" style="${s===cur?'background:var(--card)':''}"><span class="pill ${APP_CALL_COLOR[s]}">${esc(s)}</span>${s===cur?'<small>now</small>':''}</div>`).join('');
 const r=btn.getBoundingClientRect(),h=Math.min(window.innerHeight*.7,APP_CALL_STATUS.length*38+40);
 dd.style.left=Math.max(8,Math.min(r.left,window.innerWidth-250))+'px';dd.style.top=(r.bottom+h>window.innerHeight?Math.max(8,r.top-h-4):r.bottom+4)+'px';
 dd.classList.remove('hide');
 $$('.it',dd).forEach(el=>el.onclick=e=>{e.stopPropagation();dd.classList.add('hide');const s=el.dataset.s;
  try{setAppCall(aid,s)}catch(err){toast(err.message,'var(--red)');return}
  toast(s==='NA'?'Call status via app cleared':'Call logged: '+s,'var(--green)');render()});
}
function appTable(list,compact){
 const th=(k,l)=>`<th class="sort" data-sort="${k}">${l}${R.af.sort===k?(R.af.dir>0?' ▲':' ▼'):''}</th>`;
 if(!list.length)return '<div class="empty"><b>No applications here</b>Adjust filters or add a candidate.</div>';
 return `<div class="tbl-wrap"><table><thead><tr>${compact?'':'<th><input type="checkbox" class="chk" id="selAll" aria-label="Select all"></th>'}${th('name','Candidate')}${compact?'':'<th>Opening</th>'}${th('date','Applied')}<th>Resume</th>${th('match','Match score')}${th('exp','Exp')}<th>Skills</th><th>Location</th><th>Education</th>${th('notice','Notice')}${th('cur','Current')}${th('expSal','Expected')}${th('stage','Status')}<th>Call status</th><th>Call status via app</th>${shownColumns().map(n=>`<th title="${esc(n)}">${esc(shortName(n))}</th>`).join('')}<th>Recruiter</th><th>Next action</th></tr></thead><tbody>
 ${(compact?list:pageRows(list,'apps')).map(a=>{const c=getC(a.cid),o=getOp(a.opId),m=matchA(a);const pc=v=>`<span style="color:${scoreColor(v)};font-weight:600">${v}%</span>`;
  return `<tr class="click ${R.sel.has(a.id)?'sel':''}" data-cand="${c.id}">${compact?'':`<td><input type="checkbox" class="chk" data-sel="${a.id}" ${R.sel.has(a.id)?'checked':''} aria-label="Select ${esc(c.name)}"></td>`}
  <td><div class="who">${av(c.name)}<div><b>${esc(c.name)}</b><small>${esc(c.designation)}, ${esc(c.company)}</small></div></div></td>${compact?'':`<td>${esc(o.title)}</td>`}
  <td>${fmtDs(a.date)}</td><td><button class="btn sm ghost" data-resume="${c.id}" data-op="${o.id}" aria-label="View resume">${ic('file')}</button></td>
  <td><button class="score" data-match="${a.id}" title="See why">${ring(m.score)}</button></td><td>${c.exp}y</td><td>${pc(m.skills)}</td><td>${pc(m.location)}</td><td>${pc(m.education)}</td>
  <td>${c.notice}d</td><td>${lpa(c.curSal)}</td><td>${lpa(c.expSal)}</td><td>${stagePill(a.stage)}</td><td class="small">${esc(callOf(a)||'—')}</td><td>${appCallPill(a)}</td>${shownColumns().map(n=>`<td class="small">${esc(customOf(a,n)||'—')}</td>`).join('')}<td class="small">${esc(a.recruiter)}</td><td>${nextBtn(a)}</td></tr>`}).join('')}
 </tbody></table></div>${compact?'':moreRows(list,'apps')}`;
}
function bindAppTable(root){
 $$('[data-cand]',root).forEach(tr=>tr.onclick=e=>{if(e.target.closest('button,input'))return;go('candidate',tr.dataset.cand)});
 $$('[data-match]',root).forEach(b=>b.onclick=e=>{e.stopPropagation();aiMatchModal(b.dataset.match)});
 $$('[data-resume]',root).forEach(b=>b.onclick=e=>{e.stopPropagation();resumeModal(b.dataset.resume,b.dataset.op)});
 $$('[data-sort]',root).forEach(t=>t.onclick=()=>{const k=t.dataset.sort;if(R.af.sort===k)R.af.dir*=-1;else{R.af.sort=k;R.af.dir=k==='name'?1:-1}render()});
 $$('[data-sel]',root).forEach(cb=>cb.onchange=()=>{cb.checked?R.sel.add(cb.dataset.sel):R.sel.delete(cb.dataset.sel);render()});
 const sa=$('#selAll',root);if(sa){const l=pageRows(filteredApps(),'apps');sa.checked=l.length&&l.every(a=>R.sel.has(a.id));sa.onchange=()=>{l.forEach(a=>sa.checked?R.sel.add(a.id):R.sel.delete(a.id));render()}}
 $$('[data-appcall]',root).forEach(b=>b.onclick=e=>{e.stopPropagation();appCallMenu(b,b.dataset.appcall)});
 bindNext(root);bindMoreRows(root);
}
function vApplications(){
 const f=R.af;const list=filteredApps();const opt=(arr,v,all)=>`<option value="">${all}</option>`+arr.map(x=>`<option value="${esc(x[0])}" ${x[0]===v?'selected':''}>${esc(x[1])}</option>`).join('');
 const bulk=R.sel.size?`<div class="bulk"><b>${R.sel.size} selected</b><button class="btn sm" data-bulk="short">Shortlist</button><button class="btn sm" data-bulk="gi">Schedule group interview</button>
  <select class="inp" id="bulkStage" style="width:auto;padding:5px 8px;font-size:12px"><option value="">Move to stage…</option>${STAGES.concat(['On Hold']).map(s=>`<option>${s}</option>`).join('')}</select>
  <select class="inp" id="bulkRec" style="width:auto;padding:5px 8px;font-size:12px"><option value="">Assign recruiter…</option>${recruiters().map(s=>`<option>${s}</option>`).join('')}</select>
  <button class="btn sm bad" data-bulk="rej">Reject</button><button class="btn sm ghost" data-bulk="clear">Clear</button></div>`:'';
 const board=()=>{const l=list;const cols=STAGES.concat(['On Hold','Rejected']);return `<div class="board">${cols.map(s=>{const it=l.filter(a=>a.stage===s);return `<div class="col" data-col="${s}"><h4>${stagePill(s)}<span class="muted">${it.length}</span></h4><div class="cards">${it.map(a=>{const c=getC(a.cid),m=matchA(a);return `<div class="kc" draggable="true" data-drag="${a.id}"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>${esc(c.name)}</b>${ring(m.score)}</div><div class="muted small">${esc(getOp(a.opId).title)}</div><div class="muted small">${c.exp} yrs · ${esc(c.location)} · ${c.notice}d notice</div><div style="margin-top:8px">${nextBtn(a)}</div></div>`}).join('')}</div></div>`}).join('')}</div>`};
 return `<div class="page-h"><div><h1>Applications</h1><p>${list.length} of ${S.applications.length} applications · Match score runs automatically when a resume arrives</p></div>
 <div class="row">${slotHTML('applications.toolbar')}<div class="seg"><button class="${R.appView==='table'?'on':''}" data-av="table">${ic('list','style="width:14px;vertical-align:-2px"')} Table</button><button class="${R.appView==='board'?'on':''}" data-av="board">${ic('board','style="width:14px;vertical-align:-2px"')} Board</button></div><button class="btn pri" data-act="addCandidate">${ic('upload')}Add application</button></div></div>
 <section class="panel"><div class="filters">
  <input class="inp" id="afq" placeholder="Search name, opening, ID" value="${esc(f.q)}" style="min-width:180px">
  <select class="inp" data-f="op">${opt(S.openings.map(o=>[o.id,o.title]),f.op,'All openings')}</select>
  <select class="inp" data-f="status">${opt(STAGES.concat(['On Hold','Rejected']).map(s=>[s,s]),f.status,'All statuses')}</select>
  ${callList().length?`<select class="inp" data-f="call">${opt(callList().map(s=>[s,s]),f.call,'Any call status')}</select>`:''}
  <select class="inp" data-f="acall">${opt(APP_CALL_STATUS.map(s=>[s,s]),f.acall,'Any call status via app')}</select>
  ${shownColumns().map(n=>`<select class="inp" data-f="x:${esc(n)}">${opt(valuesOf(n).map(s=>[s,s]),f['x:'+n]||'','Any '+shortName(n).toLowerCase())}</select>`).join('')}
  <select class="inp" data-f="rec">${opt(recruiters().map(s=>[s,s]),f.rec,'All recruiters')}</select>
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
 const c=$('#afClear',root);if(c)c.onclick=()=>{Object.keys(R.af).filter(k=>k.startsWith('x:')).forEach(k=>delete R.af[k]);Object.assign(R.af,{q:'',op:'',status:'',call:'',acall:'',rec:'',min:0,exp:'',loc:'',skill:'',from:''});render()};
 $$('[data-av]',root).forEach(b=>b.onclick=()=>{R.appView=b.dataset.av;render()});
 $$('[data-bulk]',root).forEach(b=>b.onclick=()=>{const ids=[...R.sel];const k=b.dataset.bulk;
  if(k==='clear'){R.sel.clear();render();return}
  if(k==='short'){ids.forEach(id=>{if(getA(id).stage==='New')setStage(id,'Shortlisted',true)});toast(ids.length+' candidates shortlisted');R.sel.clear();render()}
  if(k==='rej')askRejectReason(`Reject ${ids.length} selected applications?`,'Reject all',r=>{ids.forEach(id=>setStage(id,'Rejected',true,r));R.sel.clear();toast(ids.length+' applications rejected','var(--red)');render()});
  if(k==='gi'){const ops=[...new Set(ids.map(id=>getA(id).opId))];if(ops.length>1){toast('Pick candidates from one opening for a group interview','var(--orange)');return}scheduleGI(ops[0],ids)}});
 const bs=$('#bulkStage',root);if(bs)bs.onchange=()=>{if(!bs.value)return;const n=R.sel.size;[...R.sel].forEach(id=>setStage(id,bs.value,true));R.sel.clear();toast(`${n} moved to ${bs.value}`);render()};
 const br=$('#bulkRec',root);if(br)br.onchange=()=>{if(!br.value)return;assignRecruiter([...R.sel],br.value);toast('Assigned to '+br.value);R.sel.clear();render()};
 bindAppTable(root);
 // kanban drag and drop
 $$('[data-drag]',root).forEach(k=>{k.ondragstart=e=>{e.dataTransfer.setData('text/plain',k.dataset.drag);k.classList.add('drag')};k.ondragend=()=>k.classList.remove('drag');k.onclick=e=>{if(!e.target.closest('button'))go('candidate',getA(k.dataset.drag).cid)}});
 $$('[data-col]',root).forEach(col=>{col.ondragover=e=>{e.preventDefault();col.classList.add('over')};col.ondragleave=()=>col.classList.remove('over');col.ondrop=e=>{e.preventDefault();col.classList.remove('over');const id=e.dataTransfer.getData('text/plain');if(id)setStage(id,col.dataset.col)}});
}
