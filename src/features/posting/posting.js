/* =====================================================
   JOB POSTING ON OTHER SITES
   ===================================================== */
const DEFAULT_BOARDS=[
 {id:'linkedin_jobs',name:'LinkedIn Jobs',type:'board',fmt:'full',color:'#0A66C2',src:'LinkedIn',url:'https://www.linkedin.com/talent/post-a-job'},
 {id:'naukri',name:'Naukri',type:'board',fmt:'full',color:'#275DF5',src:'Naukri',url:'https://recruit.naukri.com/'},
 {id:'indeed',name:'Indeed',type:'board',fmt:'full',color:'#2164F3',src:'Indeed',url:'https://employers.indeed.com/'},
 {id:'foundit',name:'foundit (Monster)',type:'board',fmt:'full',color:'#6E3CBC',src:'foundit',url:'https://recruiter.foundit.in/'},
 {id:'shine',name:'Shine',type:'board',fmt:'full',color:'#F5A623',src:'Shine',url:'https://recruiter.shine.com/'},
 {id:'apna',name:'Apna',type:'board',fmt:'full',color:'#4D3399',src:'Apna',url:'https://employer.apna.co/'},
 {id:'glassdoor',name:'Glassdoor',type:'board',fmt:'full',color:'#0CAA41',src:'Glassdoor',url:'https://www.glassdoor.co.in/employers/'},
 {id:'internshala',name:'Internshala',type:'board',fmt:'full',color:'#008BDC',src:'Internshala',url:'https://internshala.com/employer/registration'},
 {id:'careers',name:'Company careers page',type:'board',fmt:'html',color:'#12A150',src:'Careers Page',url:''},
 {id:'linkedin_post',name:'LinkedIn post',type:'social',fmt:'linkedin',color:'#0A66C2',src:'LinkedIn',url:'https://www.linkedin.com/feed/?shareActive=true&text={text}'},
 {id:'whatsapp',name:'WhatsApp',type:'social',fmt:'whatsapp',color:'#25D366',src:'WhatsApp',url:'https://wa.me/?text={text}'},
 {id:'x',name:'X (Twitter)',type:'social',fmt:'short',color:'#111111',src:'X',url:'https://twitter.com/intent/tweet?text={text}'},
 {id:'telegram',name:'Telegram',type:'social',fmt:'whatsapp',color:'#229ED9',src:'Telegram',url:'https://t.me/share/url?url={apply}&text={text}'},
 {id:'facebook',name:'Facebook',type:'social',fmt:'linkedin',color:'#1877F2',src:'Facebook',url:'https://www.facebook.com/sharer/sharer.php?u={apply}'},
 {id:'email',name:'Email',type:'social',fmt:'email',color:'#55607A',src:'Referral',url:'mailto:?subject={subject}&body={text}'},
];
function boards(){if(!S.boards)S.boards=JSON.parse(JSON.stringify(DEFAULT_BOARDS));return S.boards}
function postCfg(){if(!S.postCfg)S.postCfg={formUrl:'',applyEmail:'',applyLink:'',showSalary:true,about:'',hashtags:'#hiring #jobs'};return S.postCfg}
if(!S.postings)S.postings=[];
R.post={op:null,filter:'all'};
function formLink(o,b){const t=String(postCfg().formUrl||'').trim();if(!t)return '';return t.replace(/__JOB__/g,encodeURIComponent(`${o.title} (${o.id})`)).replace(/__SRC__/g,encodeURIComponent(b?b.src:'Careers Page'))}
function applyBlock(o,b,fmt){const f=formLink(o,b);
 if(f)return ({whatsapp:`*Apply here (takes 2 minutes):*\n${f}`,linkedin:`👉 Apply here: ${f}`,email:`Apply here: ${f}`,html:`<p><strong>Apply here:</strong> <a href="${esc(f)}">${esc(f)}</a></p>`})[fmt]||`Apply here: ${f}`;
 const l=applyLine(o);return ({whatsapp:`*How to apply:* ${l}`,email:`To apply: ${l}`,html:`<p><strong>How to apply:</strong> ${esc(l)}</p>`})[fmt]||`How to apply: ${l}`}
const applyLine=(o,sep=' ')=>{const c=postCfg();const bits=[];if(c.applyLink)bits.push(c.applyLink);if(c.applyEmail)bits.push(`email your CV to ${c.applyEmail} with subject "${o.id} – ${o.title}"`);return bits.length?bits.join(sep+'or'+sep):`Mention reference ${o.id} when you apply.`};
function postText(o,fmt,b){
 const c=postCfg(),co=S.settings.company;const sal=c.showSalary&&o.salMax?`₹${o.salMin}–${o.salMax} LPA`:'';const exp=`${o.expMin}–${o.expMax} years`;
 const lines=s=>String(s||'').split(/\n|\.\s+/).map(x=>x.trim().replace(/\.$/,'')).filter(Boolean);
 const tag=(s)=>'#'+String(s).replace(/[^A-Za-z0-9]/g,'');
 const tags=[...c.hashtags.split(/\s+/).filter(Boolean),tag(o.location),...o.mandatory.slice(0,3).map(tag)].join(' ');
 switch(fmt){
  case 'short':{const ap=formLink(o,b)||c.applyLink||c.applyEmail||'DM us';const tail=` Apply: ${ap}`;let head=`We're hiring: ${o.title} at ${co} · ${o.location} (${o.mode}) · ${exp}. Skills: ${o.mandatory.slice(0,4).join(', ')}.`;let t=head+tail+' '+tags;if(t.length>280)t=head+tail;if(t.length>280)t=head.slice(0,Math.max(40,277-tail.length))+'…'+tail;return t}
  case 'whatsapp':return `*We're hiring: ${o.title}* 🚀\n${co}\n\n📍 ${o.location} (${o.mode}) · ${o.type}\n💼 ${exp}${sal?`\n💰 ${sal}`:''}\n🎓 ${o.education}\n\n*Must have:* ${o.mandatory.join(', ')}${o.preferred.length?`\n*Nice to have:* ${o.preferred.join(', ')}`:''}\n\n${o.desc}\n\n${applyBlock(o,b,'whatsapp')}\nRef: ${o.id}`;
  case 'linkedin':return `We're hiring a ${o.title} to join our ${o.dept} team at ${co}! 🙌\n\n📍 ${o.location} · ${o.mode} · ${o.type}\n💼 ${exp} experience${sal?`\n💰 ${sal}`:''}\n\n${o.desc}\n\nWhat you'll do:\n${lines(o.resp).map(x=>'• '+x).join('\n')}\n\nWhat we're looking for:\n${o.mandatory.map(x=>'✔ '+x).join('\n')}\n\n${applyBlock(o,b,'linkedin')}\n\n${tags}`;
  case 'email':return `Hi,\n\nWe're hiring a ${o.title} (${o.location}, ${o.mode}) at ${co} and would love referrals.\n\nExperience: ${exp}${sal?`\nSalary: ${sal}`:''}\nKey skills: ${o.mandatory.join(', ')}\n\n${o.desc}\n\n${applyBlock(o,b,'email')}\nReference: ${o.id}\n\nThanks!`;
  case 'html':return `<h2>${esc(o.title)}</h2>\n<p><strong>${esc(o.location)}</strong> · ${esc(o.mode)} · ${esc(o.type)} · ${esc(exp)}${sal?' · '+esc(sal):''}</p>\n${c.about?`<p>${esc(c.about)}</p>\n`:''}<p>${esc(o.desc)}</p>\n<h3>Responsibilities</h3>\n<ul>${lines(o.resp).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>\n<h3>Requirements</h3>\n<ul>${lines(o.req).map(x=>`<li>${esc(x)}</li>`).join('')}<li>Must have: ${esc(o.mandatory.join(', '))}</li>${o.preferred.length?`<li>Nice to have: ${esc(o.preferred.join(', '))}</li>`:''}<li>Education: ${esc(o.education)}</li></ul>\n${applyBlock(o,b,'html')}\n<p>Reference: ${o.id}</p>`;
  default:return `Job title: ${o.title}\nCompany: ${co}\nLocation: ${o.location} (${o.mode})\nEmployment type: ${o.type}\nExperience: ${exp}${sal?`\nSalary: ${sal}`:''}\nEducation: ${o.education}\nOpenings: ${o.positions}${formLink(o,b)?`\nApply online: ${formLink(o,b)}`:''}\n\n${c.about?`About us\n${c.about}\n\n`:''}About the role\n${o.desc}\n\nResponsibilities\n${lines(o.resp).map(x=>'- '+x).join('\n')}\n\nRequirements\n${lines(o.req).map(x=>'- '+x).join('\n')}\n\nMust-have skills: ${o.mandatory.join(', ')}${o.preferred.length?`\nNice-to-have skills: ${o.preferred.join(', ')}`:''}\n\n${applyBlock(o,b,'full')}\nReference: ${o.id}`;
 }
}
function boardUrl(b,o,text){const c=postCfg();const ap=formLink(o,b)||c.applyLink||'';return (b.id==='careers'?ap:b.url).replace('{text}',encodeURIComponent(text)).replace('{apply}',encodeURIComponent(ap)).replace('{subject}',encodeURIComponent(`${o.title} at ${S.settings.company} (${o.id})`))}
async function copyText(t){try{await navigator.clipboard.writeText(t);return true}catch(e){const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand('copy')}catch(_){}ta.remove();return ok}}
const postingOf=(opId,bid)=>S.postings.filter(p=>p.opId===opId&&p.board===bid).slice(-1)[0];
function boardApplicants(o,b){return appsOfOp(o.id).filter(a=>getC(a.cid).source===b.src).length}
function postStatus(p){if(!p)return ['Not posted',''];if(p.status==='Closed')return ['Closed','red'];if(p.status==='Paused')return ['Paused','orange'];if(p.expires&&p.expires<today())return ['Expired','red'];return [`Posted ${daysBetween(p.postedOn,today())===0?'today':daysBetween(p.postedOn,today())+'d ago'}`,'green']}
function boardCard(o,b){
 const p=postingOf(o.id,b.id);const [st,col]=postStatus(p);const n=boardApplicants(o,b);const text=postText(o,b.fmt,b);const url=boardUrl(b,o,text);
 return `<div class="bcard ${col==='green'?'posted':''}"><div class="bh"><span class="bbadge" style="background:${b.color}">${esc(b.name.replace(/[^A-Za-z]/g,'').slice(0,2).toUpperCase())}</span><div class="grow"><b>${esc(b.name)}</b><small>${b.type==='social'?'Share post':'Job board'} · ${n} applicant${n===1?'':'s'}</small></div><span class="pill ${col}">${st}</span></div>
 ${p&&p.url?`<a href="${esc(p.url)}" target="_blank" rel="noopener" class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.url)}</a>`:''}
 ${p&&p.expires&&col==='green'?`<span class="small muted">Live until ${fmtD(p.expires)}</span>`:''}
 <div class="acts">${url?`<a class="btn sm pri" href="${esc(url)}" target="_blank" rel="noopener" data-copyopen="${b.id}">${ic('send')}${b.type==='social'?'Share':'Copy & open'}</a>`:`<button class="btn sm pri" data-copyonly="${b.id}">Copy HTML</button>`}
 <button class="btn sm" data-ppv="${b.id}">${ic('eye')}Preview</button>
 ${p&&col!=='red'?`<button class="btn sm ghost" data-pm="${b.id}">Update</button>`:`<button class="btn sm ghost" data-pm="${b.id}">Mark posted</button>`}</div></div>`;
}
function formBanner(op){const c=postCfg();
 if(!c.formUrl)return `<div class="panel" style="padding:12px 16px;margin-bottom:14px;background:var(--orange2);border-color:transparent;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div class="grow"><b>Add your common application form link.</b> Every post and preview will then include it, and each answer becomes an application automatically.</div><button class="btn pri" data-formsetup>Set up application form</button><button class="btn" data-pcfg2>I have a link</button></div>`;
 const g=formLink(op,{src:'Careers Page'});const pre=/__JOB__/.test(c.formUrl);
 return `<div class="panel" style="padding:12px 16px;margin-bottom:14px;border-color:color-mix(in srgb,var(--green) 40%,var(--line))"><div class="row"><span class="pill green">Application form on</span><b>${esc(op.title)}</b><span class="small muted">${pre?'Job and source are pre-filled in every link':'Same link for every job (add __JOB__ / __SRC__ to pre-fill)'}</span><span class="grow"></span><button class="btn sm" data-fcopy="${esc(g)}">Copy form link</button><a class="btn sm" href="${esc(g)}" target="_blank" rel="noopener">Test form</a><button class="btn sm ghost" data-pcfg2>Change</button></div></div>`}
function vPosting(){
 const op=getOp(R.param)||getOp(R.post.op)||S.openings.find(o=>!['Closed','Filled'].includes(o.status))||S.openings[0];R.post.op=op.id;
 const c=postCfg();const bl=boards();const live=S.postings.filter(p=>p.opId===op.id&&postStatus(p)[1]==='green').length;
 const srcRows=[...new Set(bl.map(b=>b.src))].map(src=>{const l=S.applications.filter(a=>getC(a.cid).source===src);return {src,n:l.length,sh:l.filter(a=>a.maxStage>=1).length,int:l.filter(a=>a.maxStage>=3).length,hire:l.filter(a=>a.maxStage>=8).length}}).filter(r=>r.n).sort((a,b)=>b.n-a.n);
 const openOps=S.openings.filter(o=>!['Closed','Draft'].includes(o.status));
 return `<div class="page-h"><div><h1>Job posting</h1><p>Publish openings on job sites and social channels, then track where applicants come from.</p></div>
 <div class="row"><button class="btn" id="pcfg">Posting settings</button><button class="btn" id="pboards">Manage sites</button></div></div>
 ${formBanner(op)}
 <section class="panel" style="margin-bottom:16px"><div class="filters" style="border-bottom:none"><label class="small" style="font-weight:600;color:var(--tx2)">Opening</label>
 <select class="inp" id="pop" style="min-width:260px">${S.openings.map(o=>`<option value="${o.id}" ${o.id===op.id?'selected':''}>${esc(o.title)} (${o.id}) · ${o.status}</option>`).join('')}</select>
 <span class="pill ${live?'green':''}">${live} live posting${live===1?'':'s'}</span><span class="small muted">${appsOfOp(op.id).length} applications so far</span><span class="grow"></span>
 <div class="seg">${[['all','All'],['board','Job boards'],['social','Social & share']].map(x=>`<button class="${R.post.filter===x[0]?'on':''}" data-pf2="${x[0]}">${x[1]}</button>`).join('')}</div></div>
 <div class="pbody" style="padding-top:0"><div class="boards">${bl.filter(b=>R.post.filter==='all'||b.type===R.post.filter).map(b=>boardCard(op,b)).join('')}</div>
 <p class="small muted" style="margin:12px 0 0">“Copy & open” copies a post written for that site and opens the site's employer page. Paste it there, publish, then click Mark posted and paste the listing link so the team can see where the job is live.</p></div></section>
 <div class="grid g2"><section class="panel"><header><div><h3>Where each opening is live</h3><p>Job boards only</p></div></header><div class="tbl-wrap"><table><thead><tr><th>Opening</th>${bl.filter(b=>b.type==='board').map(b=>`<th title="${esc(b.name)}"><span class="bbadge" style="background:${b.color};width:24px;height:24px;font-size:10px;border-radius:6px">${esc(b.name.replace(/[^A-Za-z]/g,'').slice(0,2).toUpperCase())}</span></th>`).join('')}</tr></thead><tbody>
 ${openOps.map(o=>`<tr class="click" data-pgo="${o.id}"><td><b>${esc(o.title)}</b></td>${bl.filter(b=>b.type==='board').map(b=>{const [st,col]=postStatus(postingOf(o.id,b.id));return `<td title="${esc(b.name)}: ${st}"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${col==='green'?'var(--green)':col==='red'?'var(--red)':col==='orange'?'var(--orange)':'var(--line2)'}"></span></td>`}).join('')}</tr>`).join('')}
 </tbody></table></div></section>
 <section class="panel"><header><div><h3>Source performance</h3><p>All openings, from each candidate's source</p></div></header><div class="tbl-wrap"><table><thead><tr><th>Source</th><th>Applied</th><th>Shortlisted</th><th>Interviewed</th><th>Joined</th></tr></thead><tbody>${srcRows.map(r=>`<tr><td><b>${esc(r.src)}</b></td><td>${r.n}</td><td>${r.sh}</td><td>${r.int}</td><td>${r.hire}</td></tr>`).join('')}</tbody></table></div></section></div>`;
}
function bindPosting(root){
 const op=getOp(R.post.op);const on=(sel,ev,fn)=>{const x=$(sel,root);if(x)x[ev]=fn};
 on('#pop','onchange',e=>{R.post.op=e.target.value;R.param=e.target.value;render()});
 $$('[data-pf2]',root).forEach(b=>b.onclick=()=>{R.post.filter=b.dataset.pf2;render()});
 $$('[data-pgo]',root).forEach(tr=>tr.onclick=()=>{R.post.op=tr.dataset.pgo;R.param=tr.dataset.pgo;render();$('#content').scrollTo({top:0,behavior:'smooth'})});
 const B=id=>boards().find(b=>b.id===id);
 $$('[data-copyopen]',root).forEach(a=>a.onclick=()=>{const b=B(a.dataset.copyopen);copyText(postText(op,b.fmt,b)).then(ok=>toast(ok?(b.type==='social'?`Opening ${b.name} with the post filled in`:`Post copied. Paste it into ${b.name}.`):`Opening ${b.name}. Use Preview to copy the text.`,ok?'var(--green)':'var(--orange)'));
  if(b.type==='social'&&!postingOf(op.id,b.id)){S.postings.push({id:uid('PST'),opId:op.id,board:b.id,status:'Posted',postedOn:today(),url:'',expires:'',cost:0});log(`${op.title} shared on ${b.name}`,'posting');save();setTimeout(render,300)}});
 $$('[data-copyonly]',root).forEach(bt=>bt.onclick=()=>{const b=B(bt.dataset.copyonly);copyText(postText(op,b.fmt,b)).then(ok=>toast(ok?'HTML copied for your careers page':'Copy blocked. Use Preview to select the text.',ok?'var(--green)':'var(--orange)'))});
 $$('[data-ppv]',root).forEach(bt=>bt.onclick=()=>previewPost(op,B(bt.dataset.ppv)));
 $$('[data-pm]',root).forEach(bt=>bt.onclick=()=>markPosted(op,B(bt.dataset.pm)));
 on('#pcfg','onclick',postingSettings);on('#pboards','onclick',manageBoards);
 $$('[data-formsetup]',root).forEach(b=>b.onclick=formSetupModal);$$('[data-pcfg2]',root).forEach(b=>b.onclick=postingSettings);
 $$('[data-fcopy]',root).forEach(b=>b.onclick=()=>copyText(b.dataset.fcopy).then(ok=>toast(ok?'Form link copied':'Copy blocked','var(--green)')));
}
function previewPost(o,b){
 const t=postText(o,b.fmt,b);
 modal({title:`${esc(b.name)} post · ${esc(o.title)}`,size:'w',body:`${formLink(o,b)?`<div style="padding:10px 12px;background:var(--green2);border-radius:10px;margin-bottom:10px;font-size:13px"><b>Application form link in this post</b> <span class="muted">(job and source “${esc(b.src)}” pre-filled)</span><div class="row" style="margin-top:6px;flex-wrap:nowrap"><input class="inp" readonly value="${esc(formLink(o,b))}" style="font-size:12px"><button class="btn sm" id="pflcopy">Copy link</button><a class="btn sm" href="${esc(formLink(o,b))}" target="_blank" rel="noopener">Test form</a></div></div>`:`<div style="padding:10px 12px;background:var(--orange2);border-radius:10px;margin-bottom:10px;font-size:13px"><b>No application form link yet.</b> Add it in Posting settings so this post includes it.</div>`}<p class="small muted" style="margin-top:0">Written for ${esc(b.name)}. Edit freely before copying; edits here are not saved to the opening.</p><textarea class="inp" id="ptxt" rows="16" style="font-family:ui-monospace,Menlo,monospace;font-size:12.5px">${esc(t)}</textarea><div class="small muted" id="pcnt" style="margin-top:6px"></div>`,
 foot:`<button class="btn" id="pcopy">Copy text</button>${b.url||b.id==='careers'&&(formLink(o,b)||postCfg().applyLink)?`<a class="btn pri" id="popen" href="#" target="_blank" rel="noopener">${ic('send')}Copy &amp; open ${esc(b.name)}</a>`:''}`,
 onMount:el=>{const ta=$('#ptxt',el);const upd=()=>{$('#pcnt',el).textContent=`${ta.value.length} characters${b.fmt==='short'&&ta.value.length>280?' — over the 280 limit':''}`;const a=$('#popen',el);if(a)a.href=boardUrl(b,o,ta.value)};upd();ta.oninput=upd;
  $('#pcopy',el).onclick=()=>copyText(ta.value).then(ok=>{if(ok)toast('Copied');else{ta.select();toast('Press Ctrl+C to copy','var(--orange)')}});
  const a=$('#popen',el);if(a)a.onclick=()=>{copyText(ta.value);toast(`Post copied. Paste it into ${b.name}.`)};
  const fl=$('#pflcopy',el);if(fl)fl.onclick=()=>copyText(formLink(o,b)).then(ok=>toast(ok?'Form link copied':'Copy blocked. Select the link and press Ctrl+C.',ok?'var(--green)':'var(--orange)'))}});
}
function markPosted(o,b){
 const p=postingOf(o.id,b.id)||{};
 modal({title:`${esc(b.name)} · ${esc(o.title)}`,body:`<div class="fgrid"><label class="f full">Listing link <span class="muted">(optional)</span><input class="inp" id="mpu" value="${esc(p.url||'')}" placeholder="https://…"></label>
 <label class="f">Posted on<input class="inp" type="date" id="mpd" value="${p.postedOn||today()}"></label><label class="f">Live until<input class="inp" type="date" id="mpe" value="${p.expires||addDays(30)}"></label>
 <label class="f">Status<select class="inp" id="mps">${['Posted','Paused','Closed'].map(s=>`<option ${s===(p.status||'Posted')?'selected':''}>${s}</option>`).join('')}</select></label><label class="f">Cost (₹)<input class="inp" type="number" id="mpc" value="${p.cost||0}"></label></div>
 <p class="small muted">Applicants are counted automatically from candidates whose source is “${esc(b.src)}”.</p>`,
 foot:`${p.id?'<button class="btn bad" id="mpdel">Remove record</button><span class="grow"></span>':''}<button class="btn" data-close>Cancel</button><button class="btn pri" id="mpsave">Save</button>`,
 onMount:el=>{$('#mpsave',el).onclick=()=>{const rec={id:p.id||uid('PST'),opId:o.id,board:b.id,url:val(el,'#mpu'),postedOn:val(el,'#mpd'),expires:val(el,'#mpe'),status:val(el,'#mps'),cost:+val(el,'#mpc')||0};
   if(p.id)Object.assign(S.postings.find(x=>x.id===p.id),rec);else S.postings.push(rec);log(`${o.title} ${rec.status==='Posted'?'posted on':rec.status.toLowerCase()+' on'} ${b.name}`,'posting');save();closeModal();toast(`${b.name}: ${rec.status}`);render()};
  const d=$('#mpdel',el);if(d)d.onclick=()=>{S.postings=S.postings.filter(x=>x.id!==p.id);save();closeModal();render()}}});
}
function postingSettings(){
 const c=postCfg();
 modal({title:'Posting settings',size:'w',body:`<div class="fgrid"><label class="f full">Application form link <span class="muted">(added to every post and preview)</span><input class="inp" id="psf" value="${esc(c.formUrl||'')}" placeholder="https://docs.google.com/forms/d/e/…/viewform?usp=pp_url&entry.…=__JOB__&entry.…=__SRC__"></label>
 <div class="full small muted" style="margin-top:-6px">Paste the “Application link template” from the setup script. <b>__JOB__</b> is replaced with the job (e.g. “CRM Executive (OP-1002)”) and <b>__SRC__</b> with the site the post goes to. <a href="#" id="psfsetup">Create the form →</a></div>
 <label class="f">Fallback apply link <span class="muted">(only if no form)</span><input class="inp" id="psl" value="${esc(c.applyLink)}" placeholder="https://yourcompany.com/careers"></label>
 <label class="f">Fallback apply email<input class="inp" id="pse" value="${esc(c.applyEmail)}" placeholder="careers@yourcompany.com"></label>
 <label class="f full">About the company <span class="muted">(used in job board posts)</span><textarea class="inp" id="psa" rows="3">${esc(c.about)}</textarea></label>
 <label class="f full">Hashtags<input class="inp" id="psh" value="${esc(c.hashtags)}"></label>
 <label class="f full"><span><input type="checkbox" class="chk" id="pss" ${c.showSalary?'checked':''} style="vertical-align:-3px"> Show salary range in posts</span></label></div>`,
 foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="pssave">Save</button>`,
 onMount:el=>{$('#psfsetup',el).onclick=e=>{e.preventDefault();closeModal();formSetupModal()};$('#pssave',el).onclick=()=>{const f=val(el,'#psf');if(f&&!/^https:\/\//i.test(f)){toast('The form link should start with https://','var(--red)');return}c.formUrl=f;Object.assign(c,{applyLink:val(el,'#psl'),applyEmail:val(el,'#pse'),about:val(el,'#psa'),hashtags:val(el,'#psh'),showSalary:$('#pss',el).checked});save();closeModal();toast('Posting settings saved');render()}}});
}
function formScriptText(){return FORM_SCRIPT.replace('{{COMPANY}}',String(S.settings.company).replace(/\\/g,'').replace(/'/g,"\\'")).replace('{{EDUCATION}}',JSON.stringify([...SheetsIO.LISTS.Education,'Other']))}
function formSetupModal(){
 const st=(n,t,d)=>`<div class="list-it" style="align-items:flex-start;padding:10px 0"><span class="av" style="background:var(--blue2);color:var(--blue);width:28px;height:28px;font-size:12px">${n}</span><div class="grow"><b>${t}</b><div class="small" style="color:var(--tx2);margin-top:2px">${d}</div></div></div>`;
 modal({title:'Set up the common application form',size:'w',body:`<p style="margin-top:0">This creates a Google Form in your Google account with these questions, <b>all required</b>: Candidate Name, Email, Phone, Applied For, Total Experience, Skills, Current Location, Education, Notice Period, Current CTC, Expected CTC and Source, plus a linked responses sheet.</p>
 ${st(1,'Run the setup script','Open <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com → New project</a>, delete the sample code, paste the script below, click <b>Run</b> and allow access. It takes about 20 seconds.')}
 ${st(2,'Add the resume upload question','Open the form (link in the responses sheet’s <b>Setup</b> tab) → <b>Add question</b> → type <b>File upload</b> → title it <b>Resume (upload)</b> → turn on <b>Required</b>, allow PDF and Document, 1 file, 10 MB. Google Forms only allows this question type to be added by hand. Candidates sign in with a Google account to upload.')}
 ${st(3,'Paste the application link here','Copy the <b>Application link template</b> from the Setup tab into Job posting → Posting settings → Application form link. Every post and preview will include it, with the job and site pre-filled.')}
 ${st(4,'Turn on auto-import','Copy the <b>Responses sheet</b> link from the Setup tab into Google Sheets → Connect Google Sheet. Columns match automatically, and every new form answer becomes an application.')}
 <div class="row" style="justify-content:space-between;margin:10px 0 6px"><b>Setup script</b><button class="btn sm pri" id="fscopy">Copy script</button></div>
 <textarea class="inp" id="fstxt" rows="10" readonly style="font-family:ui-monospace,Menlo,monospace;font-size:11.5px">${esc(formScriptText())}</textarea>
 <p class="small muted">If your Google Workspace limits forms to people in your company, open the form → Settings → Responses and turn off “Restrict to users in your organization”.</p>`,
 foot:`<button class="btn" data-close>Close</button><button class="btn pri" id="fsdone">I have the link — open Posting settings</button>`,
 onMount:el=>{$('#fscopy',el).onclick=()=>copyText(formScriptText()).then(ok=>{if(ok)toast('Script copied');else{$('#fstxt',el).select();toast('Press Ctrl+C to copy','var(--orange)')}});$('#fsdone',el).onclick=()=>{closeModal();postingSettings()}}});
}
function manageBoards(){
 const bl=boards();
 modal({title:'Manage sites',size:'w',body:`<p class="small muted" style="margin-top:0">Change where “Copy & open” goes, or add another site. For share links, {text} is replaced by the post, {apply} by your apply link and {subject} by the email subject.</p>
 <div class="tbl-wrap"><table><thead><tr><th>Site</th><th>Opens</th><th>Counts applicants with source</th><th></th></tr></thead><tbody>${bl.map((b,i)=>`<tr><td><b>${esc(b.name)}</b></td><td><input class="inp" data-bu="${i}" value="${esc(b.url)}" style="min-width:280px;font-size:12px" ${b.id==='careers'?'placeholder="Uses the apply link from Posting settings" disabled':''}></td><td><input class="inp" data-bs="${i}" value="${esc(b.src)}" style="width:130px;font-size:12px"></td><td>${b.custom?`<button class="btn sm ghost" data-bd="${i}" aria-label="Remove">${ic('x')}</button>`:''}</td></tr>`).join('')}</tbody></table></div>
 <h4 style="margin:16px 0 8px">Add a site</h4><div class="fgrid g3f"><label class="f">Name<input class="inp" id="nbn" placeholder="e.g. WorkIndia"></label><label class="f" style="grid-column:span 2">Employer page link<input class="inp" id="nbu" placeholder="https://…"></label></div>`,
 foot:`<button class="btn ghost" id="bdef">Restore defaults</button><span class="grow"></span><button class="btn" data-close>Cancel</button><button class="btn pri" id="bsave">Save</button>`,
 onMount:el=>{$$('[data-bd]',el).forEach(b=>b.onclick=()=>{bl.splice(+b.dataset.bd,1);save();closeModal();manageBoards()});
  $('#bdef',el).onclick=()=>{S.boards=JSON.parse(JSON.stringify(DEFAULT_BOARDS));save();closeModal();toast('Default sites restored');render()};
  $('#bsave',el).onclick=()=>{$$('[data-bu]',el).forEach(i=>{if(!i.disabled)bl[+i.dataset.bu].url=i.value.trim()});$$('[data-bs]',el).forEach(i=>bl[+i.dataset.bs].src=i.value.trim()||bl[+i.dataset.bs].src);
   const n=val(el,'#nbn'),u=val(el,'#nbu');if(n){bl.splice(bl.findIndex(b=>b.type==='social'),0,{id:uid('B'),name:n,type:'board',fmt:'full',color:avColor(n),src:n,url:u,custom:true});if(!SOURCES.includes(n))SOURCES.push(n)}
   save();closeModal();toast('Sites saved');render()}}});
}
VIEWS.posting=[vPosting,bindPosting];
addNav(['posting','Job posting','send'],'openings');

// opening detail: posting tab
function postingTabHTML(o){R.post.op=o.id;const live=S.postings.filter(p=>p.opId===o.id&&postStatus(p)[1]==='green');
 return `${formBanner(o)}<section class="panel"><header><div><h3>Live on ${live.length} job site${live.length===1?'':'s'}</h3><p>Copy a post, open the site, then mark it posted</p></div><button class="btn pri" onclick="go('posting','${o.id}')">${ic('send')}All sites and social</button></header><div class="pbody"><div class="boards">${boards().filter(x=>x.type==='board').map(x=>boardCard(o,x)).join('')}</div></div></section>`}
onBind('opening',r=>{if(R.tab==='posting')bindPosting(r)});
