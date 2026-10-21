/* View registry VIEWS and render() */
/* ---------- render ---------- */
"use strict";
const VIEWS={dashboard:[vDashboard,bindDashboard],openings:[vOpenings,bindOpenings],opening:[vOpening,r=>{$$('[data-tab]',r).forEach(b=>b.onclick=()=>{R.tab=b.dataset.tab;render()});bindAppTable(r);bindIntTable(r);bindOfferTable(r)}],
 applications:[vApplications,bindApplications],candidates:[vCandidates,bindCandidates],candidate:[vCandidate,r=>{$$('[data-tab]',r).forEach(b=>b.onclick=()=>{R.tab=b.dataset.tab;render()});bindCandidate(r)}],
 interviews:[vInterviews,bindInterviews],offers:[vOffers,bindOffers],onboarding:[vOnboarding,bindOnboarding],tasks:[vTasks,bindTasks],reports:[vReports,()=>{}],ai:[vAI,bindAI],settings:[vSettings,bindSettings]};
// A re-draw replaces the whole page, which used to drop the cursor and the scroll position. On the same screen they are put back.
let lastRouteKey='';
function stillness(root){
 const a=document.activeElement,key=R.view+'|'+R.param;
 if(key!==lastRouteKey)return {key,scroll:0,focus:null};
 let focus=null;
 if(a&&root.contains(a)&&a!==root){
  // an id, a name, or a data-* attribute that picks out this one field
  const cands=[];if(a.id)cands.push('#'+CSS.escape(a.id));if(a.name)cands.push(`[name="${CSS.escape(a.name)}"]`);
  [...a.attributes].filter(t=>t.name.startsWith('data-')&&t.name!=='data-act').forEach(t=>cands.push(`[${t.name}="${CSS.escape(t.value)}"]`));
  const sel=cands.find(c=>root.querySelectorAll(c).length===1);
  if(sel)focus={sel,start:a.selectionStart,end:a.selectionEnd};
 }
 return {key,scroll:root.scrollTop,focus};
}
function restoreStillness(root,st){
 lastRouteKey=st.key;root.scrollTop=st.scroll;
 if(!st.focus)return;
 const el=root.querySelector(st.focus.sel);
 if(!el)return;
 el.focus({preventScroll:true});
 try{if(st.focus.start!=null)el.setSelectionRange(st.focus.start,st.focus.end)}catch{/* not a text field */}
}
function render(){
 const navView={opening:'openings',candidate:'candidates'}[R.view]||R.view;const real=R.view;R.view=navView;renderSide();R.view=real;
 renderTop();if(!canSee(R.view)){R.view=firstPage();R.param=null}const name=VIEWS[R.view]?R.view:firstPage();const [v,b]=VIEWS[name];const root=$('#content');const st=stillness(root);root.innerHTML=v();b(root);runBindHooks(name,root);restoreStillness(root,st);syncUrl();
}
