/* Add candidate / parse resume flow */
/* ---------- add candidate / parse ---------- */
"use strict";
function addCandidate(opId){
 const sample=`Ritika Sen
Senior Java Engineer · Bengaluru · ritika.sen@mail.com · +91 98450 11223

PROFESSIONAL SUMMARY
Backend engineer with 6.5 years of experience building Java and Spring Boot microservices on AWS. Current CTC 21 LPA, expecting 27 LPA. Notice period 45 days.

EXPERIENCE
Senior Software Engineer at Swiggy (2022–Present)
Built order routing microservices with Kafka, REST API design and SQL tuning.
Software Engineer at Mindtree (2019–2022)
Delivered Spring Boot services and Docker-based CI/CD.

EDUCATION
B.Tech Computer Science, NIT Trichy, 2019

SKILLS
Java, Spring Boot, Microservices, SQL, REST API, Kafka, AWS, Docker, Git

CERTIFICATIONS
AWS Certified Developer – Associate`;
 modal({title:'Add candidate from resume',size:'w',body:`<div class="fgrid"><label class="f">Apply to opening<select class="inp" id="acOp">${S.openings.filter(o=>o.status!=='Closed').map(o=>`<option value="${o.id}" ${o.id===opId?'selected':''}>${esc(o.title)} (${o.id})</option>`).join('')}</select></label>
 <label class="f">Source<select class="inp" id="acSrc">${SOURCES.map(s=>`<option>${s}</option>`).join('')}</select></label>
 <label class="f full">Upload a PDF, Word (.docx) or text file, or paste the resume text ${CONNECTED?'':'<span class="muted">(a sample is filled in so you can try it)</span>'}<textarea class="inp" id="acTxt" rows="12" placeholder="Paste the resume here" style="font-family:ui-monospace,Menlo,monospace;font-size:12px">${CONNECTED?'':esc(sample)}</textarea></label>
 <label class="f full"><input type="file" id="acFile" accept=".pdf,.docx,.txt,.md" style="font-size:13px"><span class="muted small" id="acNote" role="status"></span></label></div><div id="acOut"></div>`,
 foot:`<button class="btn" data-close>Cancel</button><button class="btn aib" id="acParse">${ic('ai')}Parse and match</button><button class="btn pri hide" id="acSave">Create application</button>`,
 onMount:el=>{let parsed=null,picked=null;
  $('#acFile',el).onchange=async e=>{const f=e.target.files[0];if(!f)return;
   const chk=checkResumeFile(f),note=$('#acNote',el);
   if(!chk.ok){toast(chk.error,'var(--red)');e.target.value='';picked=null;return}
   note.textContent=` Reading ${f.name}…`;
   try{$('#acTxt',el).value=await resumeTextFromFile(f,loadPdfReader);picked=f;note.textContent=` ${f.name} was read${CONNECTED?'; the original file is kept with the candidate':''}.`;toast('Resume loaded')}
   catch(err){picked=null;e.target.value='';note.textContent='';toast(err.message,'var(--red)')}};
  $('#acParse',el).onclick=()=>{const txt=$('#acTxt',el).value;if(txt.trim().length<30){toast('Paste a longer resume to parse','var(--red)');return}
   parsed=parseResume(txt);const o=getOp($('#acOp',el).value);
   const tmp={...parsed,name:parsed.name||'New candidate',reloc:false,certifications:parsed.certifications,company:parsed.company||'—'};const m=match(tmp,o);
   $('#acOut',el).innerHTML=`<div class="aibox" style="margin-top:14px"><div class="row" style="gap:16px">${ring(m.score,'xl')}<div class="grow"><span class="ai-lbl">${ic('ai')}Parsed and matched against ${esc(o.title)}</span>
   <div class="fgrid g3f" style="margin-top:8px">${[['name','Name',parsed.name],['email','Email',parsed.email],['phone','Phone',parsed.phone],['exp','Experience (yrs)',parsed.exp],['location','Location',parsed.location],['education','Education',parsed.education],['designation','Designation',parsed.designation],['company','Company',parsed.company],['notice','Notice (days)',parsed.notice],['curSal','Current (LPA)',parsed.curSal],['expSal','Expected (LPA)',parsed.expSal]].map(x=>`<label class="f">${x[1]}<input class="inp" data-p="${x[0]}" value="${esc(x[2])}"></label>`).join('')}</div>
   <div style="margin-top:8px"><b class="small">Skills found (${parsed.skills.length})</b><div>${parsed.skills.map(s=>`<span class="tag ${o.mandatory.concat(o.preferred).some(x=>norm(x)===norm(s))?'ok':''}">${esc(s)}</span>`).join('')}</div></div>
   <p style="margin:8px 0 0" class="small">${esc(m.summary)}</p></div></div></div>`;
   $('#acSave',el).classList.remove('hide')};
  $('#acSave',el).onclick=()=>{if(!parsed)return;$$('[data-p]',el).forEach(i=>{const k=i.dataset.p;parsed[k]=['exp','notice','curSal','expSal'].includes(k)?+i.value:i.value});
   if(!parsed.name){toast('Add the candidate name','var(--red)');return}
   const opId2=$('#acOp',el).value;
   const c={name:parsed.name,designation:parsed.designation||'—',company:parsed.company||'—',exp:parsed.exp,location:parsed.location||'—',education:parsed.education,eduField:/Tech|B\.E|MCA|Computer/.test($('#acTxt',el).value)?'Computer Science':'General',university:(($('#acTxt',el).value.match(/,\s*([A-Z][\w ]+(?:University|Institute|IIT|NIT)[\w ]*),/)||[])[1])||'—',gradYear:2026-Math.ceil(parsed.exp||1),skills:parsed.skills,curSal:parsed.curSal,expSal:parsed.expSal,notice:parsed.notice,reloc:false,email:parsed.email,phone:parsed.phone,certifications:parsed.certifications,achievements:[],documents:[{name:'Resume.pdf',status:'Received'},{name:'ID proof',status:'Pending'}],notes:[],source:$('#acSrc',el).value,created:today(),history:[{company:parsed.company||'—',designation:parsed.designation||'—',from:'—',to:'Present',summary:'Parsed from resume.'}],resumeText:$('#acTxt',el).value};
   const dup=findDuplicateCandidate(c);
   if(dup){closeModal();duplicateModal(dup,c,opId2,picked);return}
   const {cid,score:sc}=createCandidateApplication(c,opId2);
   closeModal();toast(`${c.name} added · AI match ${sc}%`,'var(--ai)');go('candidate',cid);
   if(picked)storeResume(cid,picked)}}});
}
// the original résumé file goes to storage and is recorded on the candidate; a failure leaves the candidate as it is
async function storeResume(cid,file){
 if(!CONNECTED)return;
 try{
  const old=getC(cid).resumePath;
  const path=await uploadFile(sb,FILE_BUCKETS.resume,cid,file);
  attachResume(cid,{path,name:file.name});
  if(old)removeFile(sb,FILE_BUCKETS.resume,old).catch(()=>{});   // the replaced file is no longer needed
  toast('Resume file saved');if(R.view==='candidate')render();
 }catch(e){toast(e.message,'var(--red)')}
}
// the email or phone number is already in the pool: open that person, or apply them to this opening, instead of creating a second profile
function duplicateModal(dup,c,opId,file){
 const o=getOp(opId),was=S.applications.some(a=>a.cid===dup.id&&a.opId===opId);
 modal({title:'Already in your pool',body:`<p style="margin-top:0"><b>${esc(dup.name)}</b> has the same ${String(dup.email||'').toLowerCase()===String(c.email||'').trim().toLowerCase()&&c.email?'email':'phone number'}.</p>
  <dl class="kv"><dt>Email</dt><dd>${esc(dup.email||'—')}</dd><dt>Phone</dt><dd>${esc(dup.phone||'—')}</dd><dt>Now at</dt><dd>${esc(dup.designation||'—')}, ${esc(dup.company||'—')}</dd></dl>
  <p class="muted small" style="margin-bottom:0">${was?`They have already applied for ${esc(o.title)}.`:`You can add an application for ${esc(o.title)} to their profile.`}</p>`,
  foot:`<button class="btn" data-close>Cancel</button><button class="btn" id="dpOpen">Open profile</button>${was?'':`<button class="btn pri" id="dpApply">Apply to ${esc(o.title)}</button>`}`,
  onMount:el=>{$('#dpOpen',el).onclick=()=>{closeModal();go('candidate',dup.id)};
   const ap=$('#dpApply',el);if(ap)ap.onclick=()=>{const r=applyCandidate(dup,opId);closeModal();toast(`${dup.name} applied for ${o.title} · AI match ${r.score}%`,'var(--ai)');go('candidate',dup.id);
    if(file&&!dup.resumePath)storeResume(dup.id,file)}}});
}
