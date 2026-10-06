/* Sidebar, top bar, search, notifications, quick actions */
function renderSide(){
 const cnt={applications:S.applications.filter(a=>a.stage==='New').length,interviews:S.interviews.filter(i=>i.date===TODAY&&i.status!=='Cancelled').length,tasks:S.tasks.filter(t=>!t.done).length,offers:S.offers.filter(o=>['Draft','Generated','Sent','Negotiation'].includes(o.status)).length};
 $('#side').innerHTML=`<div class="brand"><div class="brand-logo"><img src="${LOGO_SRC}" alt="Ecoste"></div><small>Recruit Tracker</small></div>
 <nav class="nav" aria-label="Main">${NAV.map(n=>n[0]==='sep'?'<div class="sep"></div>':`<button class="${R.view===n[0]?'on':''}" data-go="${n[0]}">${ic(n[2])}<span>${n[1]}</span>${cnt[n[0]]?`<span class="ct">${cnt[n[0]]}</span>`:''}</button>`).join('')}</nav>
 <div class="side-foot"><div class="rgbbar"></div>${esc(S.settings.company)}</div>`;
 $$('[data-go]',$('#side')).forEach(b=>b.onclick=()=>go(b.dataset.go));
}
function renderTop(){
 const un=S.notifications.filter(n=>!n.read).length;
 $('#top').innerHTML=`<button class="tbtn menu-btn" id="menuBtn" aria-label="Open menu">${ic('menu')}</button>
 <div class="search">${ic('search')}<input id="gsearch" placeholder="Search candidates, applications, openings, interviews, offers" autocomplete="off" aria-label="Global search"><div class="dd hide" id="gres" style="left:0;right:0"></div></div>
 <div class="grow"></div>
 <div style="position:relative"><button class="tbtn" id="qaBtn" aria-label="Quick add" title="Quick add">${ic('plus')}</button><div class="dd hide" id="qaDD" style="right:0;min-width:220px"></div></div>
 <div style="position:relative"><button class="tbtn" id="nBtn" aria-label="Notifications">${ic('bell')}${un?`<span class="dot">${un}</span>`:''}</button><div class="dd hide" id="nDD" style="right:0;width:340px"></div></div>
 <button class="tbtn" id="helpBtn" aria-label="Help">${ic('help')}</button>
 <div class="me">${av(S.settings.user)}<div class="nm"><b style="font-size:13px;display:block;line-height:1.2">${esc(S.settings.user)}</b><small class="muted">Recruiter</small></div></div>`;
 $('#menuBtn').onclick=()=>$('#side').classList.toggle('open');
 const gs=$('#gsearch'),gr=$('#gres');
 gs.oninput=()=>{const q=gs.value.trim().toLowerCase();if(!q){gr.classList.add('hide');return}
  const res=[];
  const cs=S.candidates.filter(c=>(c.name+c.email+c.skills.join(' ')+c.company).toLowerCase().includes(q)).slice(0,5);
  if(cs.length)res.push('<h6>Candidates</h6>'+cs.map(c=>`<div class="it" data-k="c" data-id="${c.id}">${av(c.name)}<div><b>${esc(c.name)}</b><small>${esc(c.designation)} at ${esc(c.company)}</small></div></div>`).join(''));
  const as=S.applications.filter(a=>{const c=getC(a.cid),o=getOp(a.opId);return (a.id+c.name+o.title).toLowerCase().includes(q)}).slice(0,5);
  if(as.length)res.push('<h6>Applications</h6>'+as.map(a=>`<div class="it" data-k="a" data-id="${a.id}"><div><b>${esc(getC(a.cid).name)} → ${esc(getOp(a.opId).title)}</b><small>${a.id} · ${a.stage}</small></div></div>`).join(''));
  const os=S.openings.filter(o=>(o.id+o.title+o.dept+o.location).toLowerCase().includes(q)).slice(0,4);
  if(os.length)res.push('<h6>Openings</h6>'+os.map(o=>`<div class="it" data-k="o" data-id="${o.id}"><div><b>${esc(o.title)}</b><small>${o.id}, ${esc(o.location)}</small></div></div>`).join(''));
  const is=S.interviews.filter(i=>{const a=getA(i.appId);return (getC(a.cid).name+i.round+i.interviewers.join(' ')).toLowerCase().includes(q)}).slice(0,4);
  if(is.length)res.push('<h6>Interviews</h6>'+is.map(i=>`<div class="it" data-k="i" data-id="${i.id}"><div><b>${esc(getC(getA(i.appId).cid).name)}, ${esc(i.round)}</b><small>${fmtD(i.date)} at ${fmtT(i.time)}</small></div></div>`).join(''));
  const ofs=S.offers.filter(o=>(getC(getA(o.appId).cid).name+o.designation+o.id).toLowerCase().includes(q)).slice(0,4);
  if(ofs.length)res.push('<h6>Offers</h6>'+ofs.map(o=>`<div class="it" data-k="f" data-id="${o.id}"><div><b>${esc(getC(getA(o.appId).cid).name)}, ${esc(o.designation)}</b><small>${o.status} · ${inr(o.ctc)} CTC</small></div></div>`).join(''));
  gr.innerHTML=res.join('')||'<div class="empty" style="padding:18px">No matches. Try a skill, name or opening ID.</div>';gr.classList.remove('hide');
  $$('.it',gr).forEach(el=>el.onclick=()=>{gr.classList.add('hide');gs.value='';const id=el.dataset.id;
   ({c:()=>go('candidate',id),a:()=>go('candidate',getA(id).cid),o:()=>go('opening',id),i:()=>interviewDetail(id),f:()=>offerEditor(id)})[el.dataset.k]()});
 };
 gs.onkeydown=e=>{if(e.key==='Escape'){gs.value='';gr.classList.add('hide')}};
 const qa=$('#qaDD');
 $('#qaBtn').onclick=e=>{e.stopPropagation();closeDD('qaDD');qa.innerHTML=[['New opening',()=>openingForm()],['Add candidate from resume',()=>addCandidate()],['Schedule personal interview',()=>schedulePI()],['Schedule group interview',()=>scheduleGI()],['Create offer',()=>pickForOffer()],['New task',()=>taskForm()]].map((x,k)=>`<div class="it" data-k="${k}">${esc(x[0])}</div>`).join('');qa.classList.toggle('hide');
  const acts=[()=>openingForm(),()=>addCandidate(),()=>schedulePI(),()=>scheduleGI(),()=>pickForOffer(),()=>taskForm()];$$('.it',qa).forEach(el=>el.onclick=()=>{qa.classList.add('hide');acts[el.dataset.k]()})};
 const nd=$('#nDD');
 $('#nBtn').onclick=e=>{e.stopPropagation();closeDD('nDD');nd.innerHTML=`<h6 style="display:flex;justify-content:space-between">Notifications <a href="#" id="markAll" style="font-weight:600">Mark all read</a></h6>`+(S.notifications.slice(0,12).map(n=>`<div class="it" data-id="${n.id}"><span style="width:8px;height:8px;border-radius:50%;background:${n.read?'transparent':'var(--blue)'};flex:none"></span><div><span style="${n.read?'color:var(--tx2)':'font-weight:600'}">${esc(n.text)}</span><small>${timeAgo(n.ts)}</small></div></div>`).join('')||'<div class="empty">You\'re all caught up.</div>');nd.classList.toggle('hide');
  $('#markAll').onclick=ev=>{ev.preventDefault();S.notifications.forEach(n=>n.read=true);save();renderTop()};
  $$('.it',nd).forEach(el=>el.onclick=()=>{const n=S.notifications.find(x=>x.id==el.dataset.id);n.read=true;save();nd.classList.add('hide');go(...n.go)})};
 $('#helpBtn').onclick=helpModal;
}
function closeDD(except){$$('.dd').forEach(d=>{if(d.id!==except)d.classList.add('hide')})}
document.addEventListener('click',e=>{if(!e.target.closest('.dd')&&!e.target.closest('.tbtn')&&!e.target.closest('.search'))closeDD()});
function timeAgo(ts){const m=Math.round((Date.now()-ts)/6e4);if(m<1)return 'just now';if(m<60)return m+' min ago';const h=Math.round(m/60);if(h<24)return h+' h ago';return Math.round(h/24)+' d ago'}
