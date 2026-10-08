/* Workbook export/import page */
/* ---------- Google Sheets option ---------- */
const EXCELJS_URL='https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
let excelP=null;
function loadExcel(){if(window.ExcelJS)return Promise.resolve(window.ExcelJS);if(excelP)return excelP;
 excelP=new Promise((res,rej)=>{const s=document.createElement('script');s.src=EXCELJS_URL;s.onload=()=>window.ExcelJS?res(window.ExcelJS):rej(new Error('Spreadsheet library did not load'));s.onerror=()=>{excelP=null;rej(new Error('Could not load the spreadsheet library. Check your connection and try again.'))};document.head.appendChild(s)});return excelP}
let dlCap;async function getDownloads(){if(dlCap!==undefined)return dlCap;try{dlCap=window.claude&&window.claude.use?await window.claude.use('downloads'):null}catch(e){dlCap=null}return dlCap}
async function saveFile(filename,buf){
 const d=await getDownloads();
 if(d){try{await d.save({filename,data:new Blob([buf])});return 'saved'}catch(e){if(e&&e.code==='declined')return 'declined';if(e&&e.code==='rate_limited'){toast('A save prompt is already open','var(--orange)');return 'busy'}if(!(e&&['unavailable','not_granted','capability_disabled','capability_removed'].includes(e.code)))throw e}}
 const url=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);return 'saved';
}
function templateState(){const d=seed();const a=d.applications[0];
 return {...d,openings:[d.openings[0]],candidates:[d.candidates[0]],applications:[a],interviews:d.interviews.filter(i=>i.appId===a.id).slice(0,1),groups:[],offers:[],onboarding:[],tasks:[d.tasks[0]],settings:S.settings}}
async function exportWorkbook(kind){
 const btn=$('#'+(kind==='blank'?'gsBlank':'gsExport'));const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='Preparing workbook…';
 try{const X=await loadExcel();const wb=await SheetsIO.build(X,kind==='blank'?templateState():S);const buf=await wb.xlsx.writeBuffer();
  const name=kind==='blank'?'Ecoste_Recruit_Tracker_Template.xlsx':`Ecoste_Recruit_Tracker_${today()}.xlsx`;const r=await saveFile(name,buf);
  if(r==='saved'){logSheetEvent(kind==='blank'?'Downloaded blank template':'Downloaded workbook with all app data');toast(`${name} downloaded. Next: import it into Google Sheets.`);render()}
  else if(r==='declined')toast('Download cancelled','var(--orange)');
 }catch(e){toast(e.message||'Could not build the workbook','var(--red)')}
 finally{const b=$('#'+(kind==='blank'?'gsBlank':'gsExport'));if(b){b.disabled=false;b.innerHTML=old}}
}
/* map parsed rows -> app objects */
function toState(parsed){
 const R0=parsed.rows,warn=[...parsed.warn];const out={};
 const curC=id=>S.candidates.find(c=>c.id===id);
 if(R0.Openings)out.openings=R0.Openings.map((o,i)=>({id:o.id||('OP-'+(2000+i)),title:o.title||'Untitled opening',dept:o.dept||'Operations',positions:o.positions||1,location:o.location||'—',mode:o.mode||'Onsite',type:o.type||'Full-time',expMin:o.expMin??0,expMax:o.expMax??(o.expMin||0)+3,salMin:o.salMin??0,salMax:o.salMax??(o.salMin||0),education:o.education||'Graduate',mandatory:o.mandatory||[],preferred:o.preferred||[],desc:o.desc||'',resp:o.resp||'',req:o.req||'',recruiter:o.recruiter||S.settings.user,manager:o.manager||INTERVIEWERS[0],opened:o.opened||today(),target:o.target||addDays(45),priority:o.priority||'Medium',status:o.status||'Open'}));
 if(R0.Candidates)out.candidates=R0.Candidates.map((c,i)=>{const id=c.id||('C-'+(5000+i));const ex=curC(id)||{};
  const n={...ex,id,name:c.name||'Unnamed',email:c.email||'',phone:c.phone||'',designation:c.designation||'—',company:c.company||'—',exp:c.exp??0,location:c.location||'—',reloc:!!c.reloc,education:c.education||'Graduate',eduField:c.eduField||'General',university:c.university||'—',gradYear:c.gradYear||'',skills:c.skills||[],curSal:c.curSal??0,expSal:c.expSal??0,notice:c.notice??30,certifications:c.certifications||[],achievements:c.achievements||[],source:c.source||'Careers Page',created:c.created||today(),
   history:ex.history||[{company:c.company||'—',designation:c.designation||'—',from:'—',to:'Present',summary:'Imported from Google Sheets.'}],documents:ex.documents||[{name:'Resume.pdf',status:'Pending'}],notes:ex.notes||[]};
  n.resumeText=c.resumeText||ex.resumeText||buildResume(n);return n});
 const cands=out.candidates||S.candidates,ops=out.openings||S.openings;
 if(R0.Applications){out.applications=[];R0.Applications.forEach((a,i)=>{
  if(!cands.some(c=>c.id===a.cid)||!ops.some(o=>o.id===a.opId)){warn.push(`Applications row ${i+2}: Candidate ID “${a.cid||'blank'}” or Opening ID “${a.opId||'blank'}” not found, so the row was skipped.`);return}
  const ex=S.applications.find(x=>x.id===a.id)||{};const stage=[...STAGES,'Rejected','On Hold'].includes(a.stage)?a.stage:'New';
  const mx=STAGES.indexOf(a._max);const si=STAGES.indexOf(stage);
  out.applications.push({...ex,id:a.id||('APP-'+(6000+i)),cid:a.cid,opId:a.opId,date:a.date||today(),stage,maxStage:Math.max(mx,si,0),recruiter:a.recruiter||ops.find(o=>o.id===a.opId).recruiter,stageSince:a.stageSince||a.date||today(),joining:a.joining||ex.joining,
   screening:a._sout||a._snotes?{...(ex.screening||{answers:[]}),outcome:a._sout||'Connected',notes:a._snotes||'',date:(ex.screening&&ex.screening.date)||today()}:(ex.screening||null)})})}
 const apps=out.applications||S.applications;const okApp=(id,where,i)=>{if(apps.some(a=>a.id===id))return true;warn.push(`${where} row ${i+2}: Application ID “${id||'blank'}” not found, so the row was skipped.`);return false};
 if(R0['Group Interviews'])out.groups=R0['Group Interviews'].map((g,i)=>({id:g.id||('GI-'+(900+i)),opId:g.opId,date:g.date||today(),time:g.time||'11:00',duration:g.duration||60,mode:g.mode||'Office',location:g.location||'',link:g.link||'',panel:g.panel||'',interviewers:g.interviewers||[],appIds:(g.appIds||[]).filter(id=>apps.some(a=>a.id===id)),evaluated:!!g.evaluated}));
 if(R0.Interviews){out.interviews=[];R0.Interviews.forEach((x,i)=>{if(!okApp(x.appId,'Interviews',i))return;
  const scores=x.scores?x.scores.map(Number).filter(n=>n>=0&&n<=5):null;
  out.interviews.push({id:x.id||('INT-'+(9000+i)),appId:x.appId,kind:x.kind==='Group'?'Group':'Personal',round:x.round||(x.kind==='Group'?'Group Interview':'HR'),groupId:x.groupId||'',date:x.date||today(),time:x.time||'10:00',duration:x.duration||60,mode:x.mode||'Google Meet',location:x.location||'',link:x.link||'',interviewers:x.interviewers||[],status:x.status||'Scheduled',invite:x.invite||'Sent',scores:scores&&scores.length?scores:null,rec:x.rec||null,decision:x.decision||null,feedback:x.feedback||''})})}
 if(R0.Offers){out.offers=[];R0.Offers.forEach((o,i)=>{if(!okApp(o.appId,'Offers',i))return;const a=apps.find(x=>x.id===o.appId);const op=ops.find(x=>x.id===a.opId)||{};
  const ctc=o.ctc||0;const b={basic:o.b_basic,hra:o.b_hra,special:o.b_special,other:o.b_other,bonus:o.b_bonus};const breakup=Object.values(b).some(v=>v!=null)?Object.fromEntries(Object.entries(b).map(([k,v])=>[k,v||0])):autoSplit(ctc);
  out.offers.push({id:o.id||('OFR-'+(700+i)),appId:o.appId,designation:o.designation||op.title||'',dept:o.dept||op.dept||'',location:o.location||op.location||'',joining:o.joining||addDays(30),manager:o.manager||op.manager||'',empType:o.empType||'Full-time',ctc,breakup,status:o.status||'Draft',created:o.created||today(),sent:o.sent||null,custom:null,probation:o.probation||6,validity:o.validity||7})})}
 if(R0.Onboarding){const m=new Map();R0.Onboarding.forEach((r,i)=>{if(!okApp(r.appId,'Onboarding',i))return;if(!m.has(r.appId))m.set(r.appId,{appId:r.appId,start:r.start||today(),items:[]});m.get(r.appId).items.push({cat:r.cat||'Documents',t:r.t||'Step',done:!!r.done})});out.onboarding=[...m.values()]}
 if(R0.Tasks)out.tasks=R0.Tasks.map((t,i)=>({id:t.id||('T-'+(800+i)),title:t.title||'Task',due:t.due||today(),related:t.related||'General',priority:t.priority||'Medium',owner:t.owner||S.settings.user,done:!!t.done}));
 return {out,warn};
}
async function importFile(file){
 if(!file)return;if(!/\.xlsx$/i.test(file.name)){toast('Choose an .xlsx file. In Google Sheets use File → Download → Microsoft Excel (.xlsx).','var(--red)');return}
 try{const X=await loadExcel();const wb=new X.Workbook();await wb.xlsx.load(await file.arrayBuffer());
  const parsed=SheetsIO.parse(wb);if(!Object.values(parsed.rows).some(Boolean)){toast('No Ecoste Recruit Tracker tabs found in that file. Start from the downloaded workbook so the tab names match.','var(--red)');return}
  importPreview(file.name,parsed)}catch(e){toast('Could not read that file: '+(e.message||e),'var(--red)')}
}
function importPreview(fname,parsed){
 const {out,warn}=toState(parsed);
 const rows=GS_KEYS.map(([k,label])=>{const next=out[k];if(!next)return `<tr><td>${label}</td><td colspan="4" class="muted">Tab missing — current data kept</td></tr>`;
  const cur=S[k];const idOf=x=>x.id||x.appId;const curIds=new Set(cur.map(idOf)),nextIds=new Set(next.map(idOf));
  const add=next.filter(x=>!curIds.has(idOf(x))).length,upd=next.filter(x=>curIds.has(idOf(x))).length,rem=cur.filter(x=>!nextIds.has(idOf(x))).length;
  return `<tr><td><b>${label}</b></td><td>${next.length}</td><td style="color:var(--green)">${add?'+'+add:'—'}</td><td>${upd||'—'}</td><td style="color:var(--red)">${rem?'−'+rem:'—'}</td></tr>`}).join('');
 modal({title:'Load from Google Sheets',size:'w',body:`<p style="margin-top:0">Read <b>${esc(fname)}</b>. Here's what will change in the app:</p>
 <div class="panel" style="box-shadow:none"><div class="tbl-wrap"><table><thead><tr><th>Tab</th><th>Rows in sheet</th><th>New</th><th>Matched by ID</th><th>Not in sheet</th></tr></thead><tbody>${rows}</tbody></table></div></div>
 ${parsed.settings?`<p class="small muted">Settings tab found: company details and AI match weights will be updated too.</p>`:''}
 ${warn.length?`<div style="margin-top:12px;padding:10px 12px;background:var(--orange2);border-radius:8px;font-size:13px;max-height:160px;overflow:auto"><b>${warn.length} note${warn.length>1?'s':''}</b><br>${warn.slice(0,30).map(esc).join('<br>')}${warn.length>30?'<br>…':''}</div>`:''}
 <div class="fgrid" style="margin-top:14px"><label class="checkl" style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;align-items:flex-start"><input type="radio" name="gm" value="replace" checked class="chk"><span><b>Replace</b><br><span class="small muted">The sheet becomes the source of truth. Rows missing from the sheet are removed from the app.</span></span></label>
 <label class="checkl" style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;align-items:flex-start"><input type="radio" name="gm" value="merge" class="chk"><span><b>Merge</b><br><span class="small muted">Add new rows and update matching IDs. Nothing is removed from the app.</span></span></label></div>`,
 foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="gsApply">Load into app</button>`,
 onMount:el=>$('#gsApply',el).onclick=()=>{const mode=$('input[name=gm]:checked',el).value;
  const n=applyWorkbookImport({out,settings:parsed.settings,mode,fname});closeModal();toast(`Loaded ${n} rows from Google Sheets`);render()}});
}
function vSheets(){
 const log=(S.sheetLog||[]).slice(0,8);
 const step=(n,t,d)=>`<div class="list-it" style="align-items:flex-start"><span class="av" style="background:var(--blue2);color:var(--blue);width:28px;height:28px;font-size:12px">${n}</span><div><b>${t}</b><div class="small muted">${d}</div></div></div>`;
 return `<div class="page-h"><div><h1>Google Sheets</h1><p>Run the same recruitment process in a Google Sheet, and move data between the Sheet and this app whenever you like.</p></div></div>
 ${slotHTML('sheets.top')}<div class="grid g2">
 <section class="panel"><header><div><h3>Work in Google Sheets</h3><p>Every opening, candidate, application, interview, offer, onboarding step and task</p></div></header>
  <div class="pbody"><button class="btn pri" id="gsExport">${ic('upload','style="transform:rotate(180deg)"')}Download workbook with app data</button> <button class="btn" id="gsBlank">Download blank template</button></div>
  ${step(1,'Download the workbook','An .xlsx file with 11 tabs: How to use, Dashboard, Openings, Candidates, Applications, Group Interviews, Interviews, Offers, Onboarding, Tasks and Settings.')}
  ${step(2,'Open it in Google Sheets','In Google Sheets choose File → Import → Upload, pick the file and choose “Replace spreadsheet”. Or upload it to Drive and pick Open with → Google Sheets.')}
  ${step(3,'Fill it in like the app','Dropdowns for stages and statuses, ID pickers that link rows, AI match % that recalculates from skills, experience, education, location, salary and notice, and a live Dashboard.')}
 </section>
 <section class="panel"><header><div><h3>Bring Sheet changes back</h3><p>Load a Google Sheet into the app</p></div></header>
  <div class="pbody"><label class="btn pri" style="cursor:pointer">${ic('upload')}Choose .xlsx file<input type="file" id="gsFile" accept=".xlsx" class="hide"></label>
  <div id="gsDrop" style="margin-top:12px;border:2px dashed var(--line2);border-radius:12px;padding:22px;text-align:center;color:var(--tx3)">or drop the file here</div></div>
  ${step(1,'Download from Google Sheets','File → Download → Microsoft Excel (.xlsx). Keep the tab names and header row unchanged.')}
  ${step(2,'Load it here','You get a preview of new, matched and missing rows before anything changes. Choose Replace or Merge.')}
 </section></div>
 <div class="grid g2" style="margin-top:16px">
 <section class="panel"><header><h3>What maps where</h3></header><div class="tbl-wrap"><table><thead><tr><th>Sheet tab</th><th>App area</th><th>Linked by</th></tr></thead><tbody>
  ${[['Openings','Openings','Opening ID'],['Candidates','Candidates','Candidate ID'],['Applications','Applications, AI match, journey stage','Candidate ID + Opening ID'],['Group Interviews','Group interview batches','Group ID'],['Interviews','Interviews, scorecards, calendar','Application ID'],['Offers','Offer letters and salary breakup','Application ID'],['Onboarding','Onboarding checklists','Application ID'],['Tasks','Tasks','Task ID'],['Settings','Company details, AI weights','—']].map(r=>`<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td class="small">${r[2]}</td></tr>`).join('')}
 </tbody></table></div><div class="pbody small muted" style="padding-top:0">Purple columns in the Sheet (names, titles, AI match %) are calculated, so the app ignores them when loading and recalculates its own.</div></section>
 <section class="panel"><header><h3>History</h3></header>${log.length?log.map(x=>`<div class="list-it"><span class="grow">${esc(x.text)}</span><span class="muted small">${timeAgo(x.ts)}</span></div>`).join(''):'<div class="empty"><b>Nothing moved yet</b>Download the workbook to get started.</div>'}</section></div>`;
}
function bindSheets(root){
 $('#gsExport',root).onclick=()=>exportWorkbook('data');$('#gsBlank',root).onclick=()=>exportWorkbook('blank');
 $('#gsFile',root).onchange=e=>{importFile(e.target.files[0]);e.target.value=''};
 const d=$('#gsDrop',root);d.ondragover=e=>{e.preventDefault();d.style.borderColor='var(--blue)'};d.ondragleave=()=>d.style.borderColor='';d.ondrop=e=>{e.preventDefault();d.style.borderColor='';importFile(e.dataTransfer.files[0])};
}
VIEWS.sheets=[vSheets,bindSheets];
