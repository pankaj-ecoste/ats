/* =====================================================
   GOOGLE SHEET → APPLICATIONS AUTO-IMPORT
   ===================================================== */
const GDRIVE='Google Drive';
const h36=v=>{let h=5381;for(const ch of String(v))h=((h<<5)+h+ch.charCodeAt(0))>>>0;return h.toString(36).toUpperCase()};
const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const AS_FIELDS=[['name','Candidate name',1,['name','candidate','full name','applicant']],['email','Email',0,['email','e-mail','mail']],['phone','Phone',0,['phone','mobile','contact','number','whatsapp']],
 ['position','Position / job title',0,['position','job title','role','applied for','job','designation applied','post']],['opId','Opening ID',0,['opening id','job id','ref','reference','requisition']],
 ['exp','Experience (years)',0,['experience','exp','years','total exp']],['location','Current location',0,['location','city','current location']],['company','Current company',0,['current company','company','employer','organisation','organization']],
 ['designation','Current designation',0,['current designation','designation','current role','title']],['skills','Skills',0,['skill','key skills','technologies']],['education','Education',0,['education','qualification','degree']],
 ['curSal','Current CTC',0,['current ctc','current salary','ctc','present salary']],['expSal','Expected CTC',0,['expected ctc','expected salary','expected']],['notice','Notice period',0,['notice']],
 ['source','Source / job site',0,['source','portal','job site','platform','channel']],['date','Applied date',0,['applied','date','timestamp','submitted','created']],['resume','Resume link / text',0,['resume','cv','profile link','attachment']]];
function asCfg(){if(!S.autoSync)S.autoSync={fileId:'',url:'',title:'',tab:'',map:{},defaultOp:'',interval:5,enabled:false,seen:[],lastRun:null,last:null,log:[]};return S.autoSync}
let asState={running:false,timer:null,error:null,mcp:undefined};
async function getMcp(){if(asState.mcp!==undefined)return asState.mcp;try{asState.mcp=window.claude&&window.claude.use?await window.claude.use('mcp'):null}catch(e){asState.mcp=null}return asState.mcp}
const fileIdFrom=s=>{s=String(s||'').trim();const m=s.match(/\/d\/([A-Za-z0-9_-]{20,})/)||s.match(/[?&]id=([A-Za-z0-9_-]{20,})/);return m?m[1]:(/^[A-Za-z0-9_-]{20,}$/.test(s)?s:'')};
function mcpMessage(e){const code=e&&e.code;return ({needs_reauth:'Your Google Drive connection has expired. Reconnect Google Drive in claude.ai Settings → Connectors, then press Sync now.',
 server_not_connected:'Google Drive isn\'t connected for your account. Add it in claude.ai Settings → Connectors, then press Sync now.',
 selection_required:'You have more than one Google Drive connector. Choose one when claude.ai asks, then press Sync now.',
 not_in_manifest:'Google Drive access was turned off or declined for this app. Allow it from the app\'s connector settings to use auto-import.',
 blocked_by_policy:'Your organization\'s policy blocks this Google Drive action.',approval_required:'Your organization requires approval for this Google Drive action.',
 not_granted:'Live Google Sheet sync is not available in this view. Open the published app on claude.ai.',capability_disabled:'Live Google Sheet sync is not available in this view. Open the published app on claude.ai.',capability_removed:'Live Google Sheet sync is not available in this view.',
 server_unavailable:'Google Drive didn\'t respond. It will try again at the next sync.',tool_error:'Google Drive could not open that sheet: '+((e&&e.message)||'check the link and that your account can view it.')}[code])||('Sync failed: '+((e&&e.message)||'unknown error'))}
const AUTH_STOP=['needs_reauth','server_not_connected','selection_required','not_in_manifest','blocked_by_policy','approval_required','not_granted','capability_disabled','capability_removed'];
function b64ToBytes(s){s=String(s).replace(/^data:[^,]*,/,'').replace(/\s/g,'');const bin=atob(s);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u}
function findContent(p){if(p==null)return null;if(typeof p==='string')return p;if(typeof p.content==='string')return p.content;let best=null;const walk=v=>{if(typeof v==='string'){if(!best||v.length>best.length)best=v}else if(v&&typeof v==='object')Object.values(v).forEach(walk)};walk(p);return best}
async function fetchSheet(fileId){try{return await fetchSheetAs(fileId,XLSX_MIME)}catch(e){if(e&&e.code)throw e;return await fetchSheetAs(fileId,'text/csv')}}
async function fetchSheetAs(fileId,mime){
 const mcp=await getMcp();if(!mcp)throw {code:'not_granted'};
 const call=()=>mcp.callTool(GDRIVE,'download_file_content',{fileId,exportMimeType:mime},{cache:false});
 let res;try{res=await call()}catch(e){if(e&&e.retryable){await new Promise(r=>setTimeout(r,Math.min(e.retryAfterMs||1500+Math.random()*1500,8000)));res=await call()}else throw e}
 const p=res.payload!==undefined?res.payload:res;const raw=findContent(p);if(!raw)throw {code:'tool_error',message:'the sheet came back empty.'};
 const title=p&&p.title||'';let bytes;try{bytes=b64ToBytes(raw)}catch(_){bytes=null}
 const X=await loadExcel();
 if(bytes&&bytes[0]===0x50&&bytes[1]===0x4B){const wb=new X.Workbook();try{await wb.xlsx.load(bytes.buffer)}catch(err){throw new Error('xlsx parse failed')}
  const tabs=[];wb.eachSheet(ws=>{const rows=[];let headers=[];ws.eachRow({includeEmpty:false},(row,rn)=>{const vals=[];row.eachCell({includeEmpty:true},(c,ci)=>{vals[ci-1]=cellText(c)});if(!headers.length){headers=vals.map(v=>String(v||'').trim());return}if(vals.some(v=>v!==''&&v!=null))rows.push({_r:rn,...Object.fromEntries(headers.map((h,i)=>[h||('Column '+(i+1)),vals[i]??'']))})});if(headers.length)tabs.push({name:ws.name,headers:headers.map((h,i)=>h||('Column '+(i+1))),rows})});
  return {title,tabs}}
 const text=bytes?new TextDecoder().decode(bytes):String(raw);const grid=parseCSV(text);const headers=(grid.shift()||[]).map((h,i)=>String(h).trim()||('Column '+(i+1)));
 return {title,tabs:[{name:'Sheet1',headers,rows:grid.filter(r=>r.some(v=>v!=='')).map((r,i)=>({_r:i+2,...Object.fromEntries(headers.map((h,j)=>[h,r[j]??'']))}))}]};
}
function cellText(c){let v=c.value;if(v==null)return '';if(v instanceof Date)return SheetsIO.readDate(v);if(typeof v==='object'){if('result' in v)v=v.result;else if(v.richText)v=v.richText.map(x=>x.text).join('');else if('text' in v)v=v.text;else if(v.hyperlink)v=v.hyperlink;else return ''}if(v instanceof Date)return SheetsIO.readDate(v);return typeof v==='number'?v:String(v).trim()}
function parseCSV(t){const out=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=ch}else if(ch==='"')q=true;else if(ch===','){row.push(f);f=''}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;row.push(f);out.push(row);row=[];f=''}else f+=ch}if(f!==''||row.length){row.push(f);out.push(row)}return out}
function guessMap(headers){const m={};const used=new Set();AS_FIELDS.forEach(([k,,,keys])=>{const h=headers.find(h=>!used.has(h)&&keys.some(kw=>h.toLowerCase().includes(kw)));if(h){m[k]=h;used.add(h)}});return m}
const numIn=v=>{const n=parseFloat(String(v).replace(/,/g,'').match(/-?\d+(\.\d+)?/)?.[0]);return isNaN(n)?null:n};
function toLPA(v){if(v===''||v==null)return 0;const s=String(v).toLowerCase();let n=numIn(s);if(n==null)return 0;if(/lakh|lac|lpa|\bl\b/.test(s))return n;if(/k\b|thousand/.test(s))n*=1000;if(/month|pm|p\.m/.test(s))n*=12;return n>=1000?Math.round(n/1000)/100:n}
function toNotice(v){const s=String(v||'').toLowerCase();if(!s)return 30;if(/immediate|serving|0/.test(s)&&!numIn(s))return 0;const n=numIn(s);if(n==null)return 30;return /month/.test(s)?n*30:/week/.test(s)?n*7:n}
function matchOpening(pos,opId){const ops=S.openings.filter(o=>o.status!=='Closed');if(opId){const o=S.openings.find(x=>x.id.toLowerCase()===String(opId).trim().toLowerCase());if(o)return o}
 if(pos){const p=String(pos).toLowerCase();const ref=p.match(/op-\d+/);if(ref){const o=S.openings.find(x=>x.id.toLowerCase()===ref[0]);if(o)return o}
  let best=null,bs=0;ops.forEach(o=>{const t=o.title.toLowerCase();let s=p.includes(t)||t.includes(p)?1:0;if(!s){const a=t.split(/\W+/).filter(w=>w.length>2),b=new Set(p.split(/\W+/));s=a.filter(w=>b.has(w)).length/Math.max(1,a.length)}if(s>bs){bs=s;best=o}});if(bs>=0.5)return best}
 return getOp(asCfg().defaultOp)||null}
const rowKey=r=>{const e=String(r.email||'').trim().toLowerCase();const ph=String(r.phone||'').replace(/\D/g,'').slice(-10);return e||ph||(String(r.name||'').toLowerCase()+'|'+String(r.position||r.opId||'').toLowerCase())};
function mapRow(row,map){const o={};Object.entries(map).forEach(([k,h])=>{if(h)o[k]=row[h]});return o}
function planImport(tab){const cfg=asCfg();const seen=new Set(cfg.seen);const plan=[];
 tab.rows.forEach(row=>{const r=mapRow(row,cfg.map);if(!String(r.name||'').trim()){plan.push({row,r,status:'skip',why:'No name'});return}
  if(cfg.requireAll!==false){const miss=Object.entries(cfg.map).filter(([k,h])=>h&&String(row[h]??'').trim()==='').map(([k])=>AS_FIELDS.find(f=>f[0]===k)[1]);if(miss.length){plan.push({row,r,status:'skip',why:'Missing '+miss.slice(0,2).join(', ')+(miss.length>2?' +'+(miss.length-2):'')});return}}
  const key=rowKey(r)+'@'+(r.opId||r.position||'');if(seen.has(key)){plan.push({row,r,key,status:'seen'});return}
  const op=matchOpening(r.position,r.opId);if(!op){plan.push({row,r,key,status:'skip',why:'No matching opening'});return}
  const e=String(r.email||'').trim().toLowerCase(),ph=String(r.phone||'').replace(/\D/g,'').slice(-10);
  const ex=S.candidates.find(c=>(e&&c.email.toLowerCase()===e)||(ph&&c.phone.replace(/\D/g,'').slice(-10)===ph));
  if(ex&&appsOfC(ex.id).some(a=>a.opId===op.id)){plan.push({row,r,key,op,status:'dup',why:'Already applied'});return}
  plan.push({row,r,key,op,ex,status:'new'})});return plan}
function applyPlan(plan){const cfg=asCfg();let added=0;const names=[];
 plan.forEach(p=>{if(p.key&&(p.status==='dup'))cfg.seen.push(p.key);if(p.status!=='new')return;const r=p.r;let c=p.ex;
  if(!c){const skills=String(r.skills||'').split(/[,;|\/\n]/).map(s=>s.trim()).filter(Boolean);const isUrl=/^https?:\/\//i.test(String(r.resume||''));
   let cidG='C-G'+h36(String(r.email||'').trim().toLowerCase()||String(r.phone||'').replace(/\D/g,'').slice(-10)||String(r.name).toLowerCase());while(S.candidates.some(x=>x.id===cidG))cidG+='X';
   c={id:cidG,name:String(r.name).trim(),email:String(r.email||'').trim(),phone:String(r.phone||'').trim(),designation:String(r.designation||'—'),company:String(r.company||'—'),exp:numIn(r.exp)??0,location:String(r.location||'—'),reloc:false,
    education:String(r.education||'Graduate'),eduField:'General',university:'—',gradYear:'',skills,curSal:toLPA(r.curSal),expSal:toLPA(r.expSal),notice:toNotice(r.notice),certifications:[],achievements:[],source:String(r.source||'Google Sheet'),created:today(),
    history:[{company:String(r.company||'—'),designation:String(r.designation||'—'),from:'—',to:'Present',summary:'Imported from Google Sheet.'}],documents:[{name:isUrl?'Resume (link)':'Resume',status:r.resume?'Received':'Pending',url:isUrl?String(r.resume):''}],notes:isUrl?[{text:'Resume link: '+r.resume,by:'Google Sheet sync',ts:Date.now()}]:[]};
   c.resumeText=r.resume&&!isUrl&&String(r.resume).length>60?String(r.resume):buildResume(c);S.candidates.unshift(c)}
  const date=SheetsIO.readDate(r.date)||today();let aid='APP-G'+h36(p.key);while(S.applications.some(x=>x.id===aid))aid+='X';
  S.applications.unshift({id:aid,cid:c.id,opId:p.op.id,date,stage:'New',maxStage:0,recruiter:p.op.recruiter,screening:null,stageSince:today()});
  log(`${c.name} applied for ${p.op.title} (Google Sheet)`,'application',aid);cfg.seen.push(p.key);added++;names.push(c.name)});
 return {added,names}}
async function runSync(manual){
 const cfg=asCfg();if(!cfg.fileId||!cfg.tab||asState.running)return;asState.running=true;updateSyncChip();
 try{const data=await fetchSheet(cfg.fileId);if(data.title)cfg.title=data.title;const tab=data.tabs.find(t=>t.name===cfg.tab)||data.tabs[0];
  const plan=planImport(tab);const {added,names}=applyPlan(plan);
  cfg.lastRun=Date.now();cfg.last={read:tab.rows.length,added,skipped:plan.filter(p=>p.status==='skip').length,dup:plan.filter(p=>p.status==='dup').length};asState.error=null;
  if(added){notify(`${added} new application${added>1?'s':''} from Google Sheet: ${names.slice(0,3).join(', ')}${names.length>3?'…':''}`,['applications']);toast(`${added} new application${added>1?'s':''} imported from Google Sheet`,'var(--ai)')}
  else if(manual)toast('Google Sheet checked. No new rows.');
  cfg.log.unshift({ts:Date.now(),text:`Read ${tab.rows.length} rows, added ${added}`});cfg.log=cfg.log.slice(0,20);save();
 }catch(e){asState.error=e;cfg.log.unshift({ts:Date.now(),text:mcpMessage(e)});cfg.log=cfg.log.slice(0,20);save();
  if(AUTH_STOP.includes(e&&e.code)){cfg.enabled=false;stopSync();save()}if(manual)toast(mcpMessage(e),'var(--red)')}
 finally{asState.running=false;updateSyncChip();if(['applications','sheets','dashboard','pipeline'].includes(R.view)&&!modalStack.length)render()}
}
function startSync(){stopSync();const cfg=asCfg();if(!cfg.enabled||!cfg.fileId)return;asState.timer=setInterval(()=>{if(!document.hidden)runSync(false)},Math.max(1,cfg.interval)*60000)}
function stopSync(){if(asState.timer)clearInterval(asState.timer);asState.timer=null}
function syncChipHTML(){const cfg=asCfg();if(!cfg.fileId)return '';const cls=asState.running?'run':asState.error?'err':cfg.enabled?'on':'';
 const txt=asState.running?'Syncing Google Sheet…':asState.error?'Sheet sync needs attention':cfg.enabled?`Sheet auto-import on · ${cfg.lastRun?timeAgo(cfg.lastRun):'not yet run'}`:'Sheet auto-import paused';
 return `<span class="sync-chip ${cls}" id="syncChip"><i></i>${txt}</span> <button class="btn sm" data-syncnow ${asState.running?'disabled':''}>Sync now</button>`}
function updateSyncChip(){$$('[data-syncslot]').forEach(s=>{s.innerHTML=syncChipHTML();bindSyncNow(s)})}
function bindSyncNow(root){$$('[data-syncnow]',root).forEach(b=>b.onclick=()=>runSync(true))}
async function connectSheet(){
 const cfg=asCfg();
 modal({title:'Auto-import applications from Google Sheet',size:'w',body:`<p style="margin-top:0">Paste the link of the Google Sheet your job site or tool fills. The app reads it through your Google Drive connection, adds every new row as an application with an AI match score, and checks again every few minutes while the app is open.</p>
 <label class="f">Google Sheet link<input class="inp" id="asurl" value="${esc(cfg.url)}" placeholder="https://docs.google.com/spreadsheets/d/…/edit"></label><div id="asbody" style="margin-top:14px"></div>`,
 foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="asread">Read sheet</button>`,
 onMount:el=>{const readBtn=$('#asread',el);
  readBtn.onclick=async()=>{const id=fileIdFrom(val(el,'#asurl'));if(!id){toast('That doesn\'t look like a Google Sheet link','var(--red)');return}
   readBtn.disabled=true;readBtn.textContent='Reading…';$('#asbody',el).innerHTML='<div class="muted">Reading the sheet through Google Drive…</div>';
   try{const data=await fetchSheet(id);if(!data.tabs.length)throw {code:'tool_error',message:'no tabs with a header row were found.'};mappingUI(el,id,val(el,'#asurl'),data)}
   catch(e){$('#asbody',el).innerHTML=`<div style="padding:12px;background:var(--red2);border-radius:8px;color:var(--tx)">${esc(mcpMessage(e))}</div>`}
   finally{readBtn.disabled=false;readBtn.textContent='Read again';readBtn.className='btn'}}}});
}
function mappingUI(el,fileId,url,data){
 const cfg=asCfg();let tab=data.tabs.find(t=>t.name===cfg.tab)||data.tabs[0];let map=cfg.fileId===fileId&&cfg.tab===tab.name&&Object.keys(cfg.map).length?{...cfg.map}:guessMap(tab.headers);
 const draw=()=>{const opt=(v)=>`<option value="">— not in sheet —</option>`+tab.headers.map(h=>`<option ${h===v?'selected':''}>${esc(h)}</option>`).join('');
  const tmp={...cfg,map,seen:cfg.fileId===fileId?cfg.seen:[]};const saveCfg=S.autoSync;S.autoSync=tmp;const plan=planImport(tab);S.autoSync=saveCfg;
  const cnt=s=>plan.filter(p=>p.status===s).length;
  $('#asbody',el).innerHTML=`<div class="row" style="margin-bottom:10px"><b>${esc(data.title||'Sheet')}</b><span class="muted small">${data.tabs.length} tab${data.tabs.length>1?'s':''}</span><span class="grow"></span><label class="small">Tab <select class="inp" id="astab" style="width:auto;padding:5px 8px">${data.tabs.map(t=>`<option ${t.name===tab.name?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label></div>
  <div class="grid g2"><div><h4 style="margin:0 0 6px">Match your columns</h4>${AS_FIELDS.map(([k,l,req])=>`<div class="maprow"><span class="small" style="font-weight:600">${l}${req?' *':''}</span><select class="inp" data-am="${k}" style="padding:5px 8px;font-size:13px">${opt(map[k])}</select></div>`).join('')}
  <div class="maprow"><span class="small" style="font-weight:600">If no opening matches</span><select class="inp" id="asdef" style="padding:5px 8px;font-size:13px"><option value="">Skip the row</option>${S.openings.map(o=>`<option value="${o.id}" ${o.id===cfg.defaultOp?'selected':''}>${esc(o.title)}</option>`).join('')}</select></div></div>
  <div><h4 style="margin:0 0 6px">Preview</h4><div class="row" style="margin-bottom:8px"><span class="pill green">${cnt('new')} new</span><span class="pill">${cnt('dup')} already in app</span>${cnt('seen')?`<span class="pill">${cnt('seen')} imported before</span>`:''}${cnt('skip')?`<span class="pill orange">${cnt('skip')} skipped</span>`:''}</div>
  <div class="panel" style="box-shadow:none;max-height:340px;overflow:auto">${plan.slice(0,40).map(p=>`<div class="list-it" style="padding:8px 12px"><div class="grow"><b>${esc(p.r.name||'(no name)')}</b><div class="small muted">${esc(p.op?p.op.title:(p.r.position||'—'))}${p.r.email?' · '+esc(p.r.email):''}</div></div><span class="pill ${p.status==='new'?'green':p.status==='skip'?'orange':''}">${p.status==='new'?'New':p.status==='dup'?'In app':p.status==='seen'?'Done':esc(p.why)}</span></div>`).join('')||'<div class="empty">No rows below the header</div>'}</div>
  <div class="fgrid" style="margin-top:12px"><label class="f">Check every<select class="inp" id="asint">${[1,2,5,10,15,30].map(n=>`<option value="${n}" ${n==cfg.interval?'selected':''}>${n} minute${n>1?'s':''}</option>`).join('')}</select></label>
  <label class="f full"><span><input type="checkbox" class="chk" id="asreq" ${cfg.requireAll!==false?'checked':''} style="vertical-align:-3px"> Skip rows with any empty matched field (every field is mandatory)</span></label>
  <label class="f">Existing rows<select class="inp" id="asfirst"><option value="import">Import them now</option><option value="skip">Skip them, only import new rows</option></select></label></div></div></div>`;
  $('#astab',el).onchange=e=>{tab=data.tabs.find(t=>t.name===e.target.value);map=guessMap(tab.headers);draw()};
  $$('[data-am]',el).forEach(s=>s.onchange=()=>{map[s.dataset.am]=s.value;draw()});
  $('#asdef',el).onchange=e=>{cfg.defaultOp=e.target.value;draw()};
  $('#asreq',el).onchange=e=>{cfg.requireAll=e.target.checked;draw()};
  let f=$('footer',el.querySelector('.modal'));if(!$('#asgo',f)){const b=document.createElement('button');b.className='btn pri';b.id='asgo';b.textContent='Turn on auto-import';f.appendChild(b)}
  $('#asgo',el).onclick=()=>{if(!map.name){toast('Match the Candidate name column','var(--red)');return}
   const first=val(el,'#asfirst');if(cfg.fileId!==fileId)cfg.seen=[];Object.assign(cfg,{fileId,url,title:data.title,tab:tab.name,map:{...map},defaultOp:val(el,'#asdef'),interval:+val(el,'#asint'),enabled:true});
   let res={added:0};if(first==='skip'){planImport(tab).forEach(p=>{if(p.key)cfg.seen.push(p.key)})}else res=applyPlan(planImport(tab));
   cfg.lastRun=Date.now();cfg.last={read:tab.rows.length,added:res.added,skipped:0,dup:0};asState.error=null;cfg.log.unshift({ts:Date.now(),text:`Connected “${data.title||'sheet'}” (${tab.name}); imported ${res.added}`});
   save();startSync();closeModal();toast(res.added?`${res.added} applications imported. Auto-import is on.`:'Auto-import is on. New rows will be added automatically.','var(--ai)');render()}};
 draw();
}
function autoImportCard(){
 const cfg=asCfg();
 return `<section class="panel" style="margin-bottom:16px;border-color:color-mix(in srgb,var(--ai) 35%,var(--line))"><header><div><span class="ai-lbl">${ic('refresh')}Auto-import applications from Google Sheet</span><p>For sheets filled by a job site, form or other tool. New rows become applications automatically.</p></div>
 <div class="row">${cfg.fileId?`<span data-syncslot>${syncChipHTML()}</span>`:''}<button class="btn ${cfg.fileId?'':'pri'}" id="asconnect">${cfg.fileId?'Change sheet or columns':'Connect Google Sheet'}</button></div></header>
 ${cfg.fileId?`<div class="pbody"><div class="grid g2"><dl class="kv"><dt>Sheet</dt><dd>${cfg.url?`<a href="${esc(cfg.url)}" target="_blank" rel="noopener">${esc(cfg.title||'Open sheet')}</a>`:esc(cfg.title)}</dd><dt>Tab</dt><dd>${esc(cfg.tab)}</dd><dt>Checks</dt><dd>Every ${cfg.interval} min while the app is open, and each time it opens</dd><dt>Last run</dt><dd>${cfg.lastRun?`${timeAgo(cfg.lastRun)} · ${cfg.last.read} rows read, ${cfg.last.added} added`:'Not yet'}</dd><dt>Unmatched rows</dt><dd>${cfg.defaultOp?'Go to '+esc(getOp(cfg.defaultOp)?.title||''):'Skipped'}</dd></dl>
 <div>${asState.error?`<div style="padding:10px 12px;background:var(--red2);border-radius:8px;font-size:13px;margin-bottom:8px">${esc(mcpMessage(asState.error))}</div>`:''}
 <label class="checkl" style="border:none"><input type="checkbox" class="chk" id="asen" ${cfg.enabled?'checked':''}><span>Auto-import ${cfg.enabled?'on':'paused'}</span></label>
 <div class="small muted" style="margin-top:6px">${cfg.log.slice(0,4).map(l=>`${timeAgo(l.ts)} · ${esc(l.text)}`).join('<br>')}</div>
 <button class="btn sm ghost bad" id="asoff" style="margin-top:8px">Disconnect sheet</button></div></div></div>`:''}</section>`;
}
function bindAutoImport(root){const b=$('#asconnect',root);if(!b)return;b.onclick=connectSheet;bindSyncNow(root);
 const en=$('#asen',root);if(en)en.onchange=()=>{const cfg=asCfg();cfg.enabled=en.checked;asState.error=null;save();if(cfg.enabled){startSync();runSync(true)}else stopSync();render()};
 const off=$('#asoff',root);if(off)off.onclick=()=>confirmBox('Disconnect Google Sheet','Stop importing from this sheet? Applications already imported stay in the app.','Disconnect',()=>{stopSync();S.autoSync=null;save();render()},true)}
// hook into the Google Sheets page and the Applications page
{const [v,b]=VIEWS.sheets;VIEWS.sheets=[()=>{const h=v();return h.replace('<div class="grid g2">',autoImportCard()+'<div class="grid g2">')},r=>{b(r);bindAutoImport(r)}]}
{const [v,b]=VIEWS.applications;VIEWS.applications=[()=>{const h=v();const cfg=asCfg();const slot=cfg.fileId?`<span data-syncslot>${syncChipHTML()}</span>`:`<button class="btn" onclick="go('sheets')">${ic('refresh')}Auto-import from Google Sheet</button>`;return h.replace('<div class="row"><div class="seg">',`<div class="row">${slot}<div class="seg">`)},r=>{b(r);bindSyncNow(r)}]}
// start: first check shortly after load, then on the interval
setTimeout(()=>{const cfg=asCfg();if(cfg.enabled&&cfg.fileId){startSync();runSync(false)}},2500);
