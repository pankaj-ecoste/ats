/* Calling queue: one lead at a time. Tap a status and the next lead is already there.
   The rules (who is in the queue, in what order) are in src/domain/call-queue.js; a call is logged by setAppCall, like everywhere else.

   Undo: the database keeps every call for ever (no delete), so a tapped status is not written at once. It is held for five seconds and written when
   the time is up, when the next status is tapped, or when the person leaves the page or the tab. Undo inside those five seconds writes nothing at all. */
"use strict";
const CQ={mode:'new',mine:true,op:'',skip:new Set(),back:[],cur:null,held:null,more:false,note:''};
const CQ_UNDO_MS=5000;
const cqWho=()=>CQ.mine?S.settings.user:'';
const cqQueue=(mode=CQ.mode)=>callQueue(S.applications,{mode,who:cqWho(),opId:CQ.op,skip:new Set([...CQ.skip,...(CQ.held?[CQ.held.aid]:[])])});
// the lead on screen: the one chosen last if it is still waiting (or held), otherwise the first in the queue
function cqCurrent(){
 const q=cqQueue();
 if(CQ.cur&&(q.some(a=>a.id===CQ.cur)||(CQ.held&&CQ.held.aid===CQ.cur)))return getA(CQ.cur);
 CQ.cur=q.length?q[0].id:null;
 return CQ.cur?getA(CQ.cur):null;
}
const cqAdvance=()=>{const q=cqQueue();CQ.cur=q.length?q[0].id:null;CQ.note=''};
const cqRedraw=()=>{if(R.view==='calling')render()};

// a connected call stays on screen, so the note may still be typed after the status was tapped: take what is in the box now
function cqTakeNote(h){const n=$('#cqNote');if(h.status==='Connected'&&n&&CQ.cur===h.aid)h.note=n.value}
// write the held status (and the note typed with it) now
function cqCommit(){
 const h=CQ.held;if(!h)return;
 cqTakeNote(h);
 clearTimeout(h.timer);CQ.held=null;
 CQ.back=CQ.back.filter(id=>id!==h.aid);
 try{
  setAppCall(h.aid,h.status);
  if(h.note.trim())addCandidateNote(getA(h.aid).cid,h.note.trim());
 }catch(e){toast(e.message,'var(--red)')}
}
function cqChoose(status){
 const a=cqCurrent();if(!a)return;
 cqCommit();                                    // the one before is written first
 const note=($('#cqNote')||{}).value||'';
 CQ.more=false;
 if(status==='Connected'){CQ.held={aid:a.id,status,note};render();return}     // a connected call stays on screen: what next?
 CQ.held={aid:a.id,status,note,timer:setTimeout(()=>{cqCommit();cqRedraw()},CQ_UNDO_MS)};
 CQ.back.push(a.id);
 cqAdvance();render();
}
function cqUndo(){
 const h=CQ.held;if(!h)return;
 clearTimeout(h.timer);CQ.held=null;
 CQ.back=CQ.back.filter(id=>id!==h.aid);
 CQ.cur=h.aid;CQ.note=h.note;render();
}
function cqSkip(){
 const a=cqCurrent();if(!a||(CQ.held&&CQ.held.aid===a.id))return;
 CQ.skip.add(a.id);CQ.back.push(a.id);cqAdvance();render();
}
function cqBack(){
 const id=CQ.back.pop();if(!id)return;
 if(CQ.held&&CQ.held.aid===id){CQ.back.push(id);cqUndo();return}
 CQ.skip.delete(id);CQ.cur=id;CQ.note='';render();
}
function cqSetMode(mode){cqCommit();Object.assign(CQ,{mode,skip:new Set(),back:[],cur:null,note:'',more:false});render()}

// leaving the page, or the tab, writes what is held
onEvent('view:leaving',v=>{if(v==='calling')cqCommit()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)cqCommit()});
window.addEventListener('pagehide',cqCommit);

function cqFact(label,value){return `<div><dt>${label}</dt><dd>${value}</dd></div>`}
function cqStatusBtn(s,key){
 const cls=s==='Connected'?'ok':/Not Interested|Wrong Number/.test(s)?'bad':'';
 return `<button class="btn cq-s ${cls}" data-cqs="${esc(s)}"${key?` aria-keyshortcuts="${key}"`:''}>${key?`<kbd>${key}</kbd>`:''}${esc(s)}</button>`;
}
function cqCard(a,pos,total){
 const c=getC(a.cid),o=getOp(a.opId),m=matchA(a);
 const tel=telLink(c.phone),first=String(c.name||'').split(/\s+/)[0];
 const wa=whatsappLink({phone:c.phone,text:`Hello ${first}, this is ${S.settings.user} from ${S.settings.company||'our team'} about the ${o.title} role you applied for.`});
 const last=a.appCall&&a.appCallAt?`<div class="cq-last">Last call: <b>${esc(a.appCall)}</b>, ${timeAgo(a.appCallAt)}</div>`:'';
 return `<section class="panel cq-card" data-cq="${esc(a.id)}">
  <div class="cq-head">${av(c.name,'lg')}<div class="cq-who"><h2>${esc(c.name)}</h2><div class="muted">${esc([c.designation,c.company].filter(x=>x&&x!=='—').join(' · '))}</div></div><span class="cq-pos" aria-label="Lead ${pos} of ${total}">${pos} / ${total}</span></div>
  <div class="cq-phone">${tel?`<a class="btn pri cq-call" id="cqCall" href="${tel}" aria-keyshortcuts="c">${ic('phone')}Call ${esc(c.phone)}</a>`:`<span class="btn cq-call" aria-disabled="true">No usable number${c.phone?': '+esc(c.phone):''}</span>`}${wa?`<a class="btn cq-wa" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>`:''}</div>
  <dl class="cq-facts">${cqFact('Opening',esc(o.title))}${cqFact('Source',esc(appSource(a)))}${cqFact('Applied',fmtD(a.date))}${cqFact('Experience',c.exp+' yrs')}${cqFact('Salary now / expected',lpa(c.curSal)+' / '+lpa(c.expSal))}${cqFact('Notice',c.notice+' days')}${cqFact('Location',esc(c.location||'—'))}${cqFact('Match',m.score+'%')}</dl>
  ${last}
  <label class="f"><span class="muted small">Note (saved with the call)</span><textarea class="inp" id="cqNote" rows="2" placeholder="Anything worth remembering from this call">${esc(CQ.note)}</textarea></label>
  <div class="cq-nav"><button class="btn sm" data-cqback ${CQ.back.length?'':'disabled'} aria-keyshortcuts="ArrowLeft">← Previous</button><button class="btn sm" data-cqskip aria-keyshortcuts="ArrowRight">Skip →</button><button class="btn sm ghost" data-cqopen>Open full record</button></div>
 </section>`;
}
function cqActions(a){
 const h=CQ.held;
 if(h&&h.aid===a.id&&h.status==='Connected')return `<section class="cq-actions cq-next" aria-label="What next">
  <p><b>Connected with ${esc(getC(a.cid).name)}.</b> What next?</p>
  <div class="cq-grid"><button class="btn pri cq-s" data-cqscreen>Screen now</button><button class="btn cq-s" data-cqshort>Shortlist</button><button class="btn cq-s" data-cqnext>Next lead →</button></div>
  <p class="small muted">Screen now records the call when you save the screening. <button class="linkbtn" data-cqchange>Change status</button></p></section>`;
 return `<section class="cq-actions" aria-label="Call status">
  <div class="cq-grid">${CALL_QUICK.map((s,i)=>cqStatusBtn(s,i+1)).join('')}<button class="btn cq-s" data-cqmore aria-expanded="${CQ.more}">${CQ.more?'Fewer':'More'} ▾</button></div>
  ${CQ.more?`<div class="cq-grid cq-more">${callMore(APP_CALL_STATUS).map(s=>cqStatusBtn(s,'')).join('')}</div>`:''}</section>`;
}
function vCalling(){
 if(!canEdit())return `<div class="empty"><b>No access</b>Only admins and recruiters call leads.</div>`;
 const a=cqCurrent();
 const nNew=cqQueue('new').length,nAgain=cqQueue('again').length;
 const q=CQ.mode==='new'?cqQueue('new'):cqQueue('again');
 const total=q.length+(CQ.held&&CQ.held.aid===CQ.cur?1:0),pos=a?(CQ.held&&CQ.held.aid===a.id?1:q.findIndex(x=>x.id===a.id)+1):0;
 const called=calledOn(S.applications,today(),{who:cqWho(),opId:CQ.op})+(CQ.held?1:0);
 const ops=S.openings.filter(o=>!['Closed','Filled','Draft'].includes(o.status));
 const head=`<div class="page-h"><div><h1>Calling</h1><p>${nNew} to call · ${nAgain} to call again · <b>${called}</b> called today</p></div></div>
 <div class="cq-bar"><div class="seg" role="tablist"><button class="${CQ.mode==='new'?'on':''}" data-cqmode="new" role="tab">To call (${nNew})</button><button class="${CQ.mode==='again'?'on':''}" data-cqmode="again" role="tab">Call again (${nAgain})</button></div>
  <label class="checkl"><input type="checkbox" id="cqMine" ${CQ.mine?'checked':''}> Only my leads</label>
  <select class="inp" id="cqOp" aria-label="Opening"><option value="">All openings</option>${ops.map(o=>`<option value="${esc(o.id)}" ${CQ.op===o.id?'selected':''}>${esc(o.title)}</option>`).join('')}</select></div>`;
 let body;
 if(a)body=`<div class="cq">${cqCard(a,pos,total)}${cqActions(a)}</div>`;
 else body=`<div class="empty cq-empty"><b>${CQ.mode==='new'?'Nobody left to call':'Nothing to call again'}</b>${CQ.mode==='new'?(nAgain?`${nAgain} lead${nAgain===1?'':'s'} to call again.`:'Every lead has had a call.'):'No call is waiting for a second try.'}
  <div class="row" style="justify-content:center;margin-top:12px">${CQ.skip.size?`<button class="btn" data-cqrestore>Bring back ${CQ.skip.size} skipped</button>`:''}${CQ.mode==='new'&&nAgain?`<button class="btn pri" data-cqmode="again">Go to Call again</button>`:''}${CQ.mine?`<button class="btn" id="cqAll">Show everyone's leads</button>`:''}</div></div>`;
 const h=CQ.held;
 const undo=h&&h.status!=='Connected'?`<div class="cq-undo" role="status"><span>${esc(h.status)} · ${esc(getC(getA(h.aid).cid).name)}</span><button data-cqundo aria-keyshortcuts="u">Undo</button><i style="animation-duration:${CQ_UNDO_MS}ms"></i></div>`:'';
 return head+body+undo;
}
function bindCalling(root){
 $$('[data-cqs]',root).forEach(b=>b.onclick=()=>cqChoose(b.dataset.cqs));
 $$('[data-cqmode]',root).forEach(b=>b.onclick=()=>cqSetMode(b.dataset.cqmode));
 const mine=$('#cqMine',root);if(mine)mine.onchange=()=>{cqCommit();CQ.mine=mine.checked;Object.assign(CQ,{skip:new Set(),back:[],cur:null,note:''});render()};
 const op=$('#cqOp',root);if(op)op.onchange=()=>{cqCommit();CQ.op=op.value;Object.assign(CQ,{skip:new Set(),back:[],cur:null,note:''});render()};
 const all=$('#cqAll',root);if(all)all.onclick=()=>{CQ.mine=false;CQ.cur=null;render()};
 const on=(sel,fn)=>{const b=$(sel,root);if(b)b.onclick=fn};
 on('[data-cqmore]',()=>{CQ.note=($('#cqNote')||{}).value||'';CQ.more=!CQ.more;render()});
 on('[data-cqskip]',()=>{CQ.note='';cqSkip()});
 on('[data-cqback]',cqBack);
 on('[data-cqundo]',cqUndo);
 on('[data-cqrestore]',()=>{CQ.skip.clear();CQ.back=[];CQ.cur=null;render()});
 on('[data-cqopen]',()=>{const a=cqCurrent();if(a)go('candidate',a.cid)});
 // a connected call: what next
 on('[data-cqnext]',()=>{cqCommit();cqAdvance();render()});
 on('[data-cqchange]',()=>{const h=CQ.held;if(!h)return;cqTakeNote(h);CQ.held=null;CQ.note=h.note;render()});
 on('[data-cqshort]',()=>{const h=CQ.held;if(!h)return;cqCommit();cqAdvance();shortlist(h.aid)});
 on('[data-cqscreen]',()=>{
  const h=CQ.held;if(!h)return;
  cqTakeNote(h);
  CQ.held=null;                                  // the screening records the call itself when it is saved, so it is not written twice
  if(h.note.trim())addCandidateNote(getA(h.aid).cid,h.note.trim());
  screeningCall(h.aid);
 });
}
// keys: 1 to 7 set the status, → skips, ← goes back, u undoes, c calls. Not while typing, and not under a window.
document.addEventListener('keydown',e=>{
 if(R.view!=='calling'||modalStack.length||e.altKey||e.ctrlKey||e.metaKey)return;
 if(/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement||{}).tagName))return;
 const a=cqCurrent();
 const k=e.key;
 if(/^[1-7]$/.test(k)&&a&&!(CQ.held&&CQ.held.status==='Connected'&&CQ.held.aid===a.id)){e.preventDefault();cqChoose(CALL_QUICK[+k-1])}
 else if(k==='ArrowRight'&&a){e.preventDefault();CQ.note='';cqSkip()}
 else if(k==='ArrowLeft'){e.preventDefault();cqBack()}
 else if((k==='u'||k==='U')&&CQ.held&&CQ.held.status!=='Connected'){e.preventDefault();cqUndo()}
 else if((k==='c'||k==='C')&&$('#cqCall')){e.preventDefault();$('#cqCall').click()}
 else if(k==='Enter'&&document.activeElement===document.body&&CQ.held&&CQ.held.status==='Connected'){e.preventDefault();$('[data-cqnext]')&&$('[data-cqnext]').click()}
});
VIEWS.calling=[vCalling,bindCalling];
addNav(['calling','Calling','phone',()=>canEdit()],'applications');
