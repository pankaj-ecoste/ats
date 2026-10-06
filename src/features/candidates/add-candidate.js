/* Add candidate / parse resume flow */
/* ---------- add candidate / parse ---------- */
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
 <label class="f full">Paste resume text or upload a .txt file <span class="muted">(a sample is filled in so you can try it)</span><textarea class="inp" id="acTxt" rows="12" style="font-family:ui-monospace,Menlo,monospace;font-size:12px">${esc(sample)}</textarea></label>
 <label class="f full"><input type="file" id="acFile" accept=".txt,.md,text/plain" style="font-size:13px"></label></div><div id="acOut"></div>`,
 foot:`<button class="btn" data-close>Cancel</button><button class="btn aib" id="acParse">${ic('ai')}Parse and match</button><button class="btn pri hide" id="acSave">Create application</button>`,
 onMount:el=>{let parsed=null;
  $('#acFile',el).onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{$('#acTxt',el).value=r.result;toast('Resume loaded')};r.readAsText(f)};
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
   const cid='C-'+(2001+S.candidates.length+Math.floor(Math.random()*900));const opId2=$('#acOp',el).value;
   const c={id:cid,name:parsed.name,designation:parsed.designation||'—',company:parsed.company||'—',exp:parsed.exp,location:parsed.location||'—',education:parsed.education,eduField:/Tech|B\.E|MCA|Computer/.test($('#acTxt',el).value)?'Computer Science':'General',university:(($('#acTxt',el).value.match(/,\s*([A-Z][\w ]+(?:University|Institute|IIT|NIT)[\w ]*),/)||[])[1])||'—',gradYear:2026-Math.ceil(parsed.exp||1),skills:parsed.skills,curSal:parsed.curSal,expSal:parsed.expSal,notice:parsed.notice,reloc:false,email:parsed.email,phone:parsed.phone,certifications:parsed.certifications,achievements:[],documents:[{name:'Resume.pdf',status:'Received'},{name:'ID proof',status:'Pending'}],notes:[],source:$('#acSrc',el).value,created:today(),history:[{company:parsed.company||'—',designation:parsed.designation||'—',from:'—',to:'Present',summary:'Parsed from resume.'}],resumeText:$('#acTxt',el).value};
   S.candidates.unshift(c);const aid='APP-'+(3100+S.applications.length+Math.floor(Math.random()*900));
   S.applications.unshift({id:aid,cid,opId:opId2,date:today(),stage:'New',maxStage:0,recruiter:getOp(opId2).recruiter,screening:null,stageSince:today()});
   const sc=match(c,getOp(opId2)).score;log(`${c.name} applied for ${getOp(opId2).title}`,'application',aid);notify(`New application: ${c.name} scored ${sc}% for ${getOp(opId2).title}`,['candidate',cid]);
   save();closeModal();toast(`${c.name} added · AI match ${sc}%`,'var(--ai)');go('candidate',cid)}}});
}
