/* Resume viewer and parsed-field editor */
/* ---------- resume viewer ---------- */
"use strict";
function resumeHTML(c,o){
 let t=esc(c.resumeText);
 const all=o?o.mandatory.concat(o.preferred):[];
 all.sort((a,b)=>b.length-a.length).forEach(s=>{if(!hasSkill(c,s))return;const re=new RegExp('(^|[^\\w>])('+esc(s).replace(/[.+*?/()]/g,'\\$&')+')(?![\\w<])','g');t=t.replace(re,'$1<mark>$2</mark>')});
 t=t.replace(/(\d+(?:\.\d+)?) years/g,'<mark class="hl">$1 years</mark>');
 const lines=t.split('\n');
 return `<div class="paper"><h2>${lines[0]}</h2><div style="color:#5b6478">${lines[1]}</div>${lines.slice(2).map(l=>/^[A-Z ]{6,}$/.test(l.replace(/<[^>]+>/g,''))?`<h4>${l[0]+l.slice(1).toLowerCase()}</h4>`:l?`<div>${l}</div>`:'').join('')}</div>`;
}
function resumeSplit(c,o){
 const f=(k,l,v,t='text')=>`<label class="f">${l}<input class="inp" data-rf="${k}" type="${t}" value="${esc(v)}"></label>`;
 return `<div class="split"><div>${resumeHTML(c,o)}<p class="small muted">Green highlights are skills required by ${esc(o.title)}; purple marks experience claims.</p></div>
 <section class="panel"><header><div><span class="ai-lbl">${ic('ai')}AI extracted information</span><p>Correct anything the parser got wrong, then save to re-score.</p></div></header><div class="pbody" style="max-height:66vh;overflow:auto">
 <h4 style="margin:0 0 8px">Candidate information</h4><div class="fgrid">${f('name','Name',c.name)}${f('email','Email',c.email)}${f('phone','Phone',c.phone)}${f('location','Location',c.location)}${f('designation','Designation',c.designation)}${f('company','Company',c.company)}</div>
 <h4 style="margin:16px 0 8px">Experience and compensation</h4><div class="fgrid">${f('exp','Total experience (yrs)',c.exp,'number')}${f('notice','Notice period (days)',c.notice,'number')}${f('curSal','Current salary (LPA)',c.curSal,'number')}${f('expSal','Expected salary (LPA)',c.expSal,'number')}</div>
 <h4 style="margin:16px 0 8px">Education</h4><div class="fgrid">${f('education','Degree',c.education)}${f('university','University',c.university)}</div>
 <h4 style="margin:16px 0 8px">Skills</h4><textarea class="inp" data-rf="skills" rows="2">${esc(c.skills.join(', '))}</textarea>
 <h4 style="margin:16px 0 8px">Certifications</h4><textarea class="inp" data-rf="certifications" rows="2">${esc(c.certifications.join('\n'))}</textarea>
 <h4 style="margin:16px 0 8px">Achievements</h4><textarea class="inp" data-rf="achievements" rows="3">${esc(c.achievements.join('\n'))}</textarea>
 <div class="row" style="margin-top:14px"><button class="btn pri" data-rsave>Save and re-score</button><span class="muted small" data-rscore>Current match ${match(c,o).score}%</span></div></div></section></div>`;
}
function bindResumeSplit(root,c,o){
 const b=$('[data-rsave]',root);if(!b)return;
 b.onclick=()=>{const before=match(c,o).score;const fields={};$$('[data-rf]',root).forEach(el=>{const k=el.dataset.rf;let v=el.value;
  if(['exp','notice','curSal','expSal'].includes(k))v=+v;if(k==='skills')v=v.split(',').map(s=>s.trim()).filter(Boolean);if(k==='certifications'||k==='achievements')v=v.split('\n').map(s=>s.trim()).filter(Boolean);fields[k]=v});
  updateCandidateProfile(c.id,fields);const after=match(c,o).score;toast(`Saved. Match ${before}% → ${after}%`,'var(--ai)');refresh()};
}
function resumeModal(cid,opId){const c=getC(cid),o=getOp(opId);modal({title:'Resume · '+esc(c.name),size:'xw',body:resumeSplit(c,o),onMount:el=>bindResumeSplit(el,c,o)})}
