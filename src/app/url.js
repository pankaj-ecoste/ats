/* Page addresses: every screen has a URL (#/candidate/C-1/notes), so refresh keeps you there, the back button works and a link can be shared. */
"use strict";
// route <-> address, pure. route = {view, param, tab, dashTab}
function routeToHash(r){
 let h='#/'+r.view;
 if(r.param)h+='/'+encodeURIComponent(r.param)+(r.tab&&r.tab!=='overview'?'/'+encodeURIComponent(r.tab):'');
 else if(r.view==='dashboard'&&r.dashTab)h+='/'+r.dashTab;
 return h;
}
function hashToRoute(hash){
 const m=String(hash||'').match(/^#\/([a-z]+)(?:\/([^/]+))?(?:\/([^/]+))?$/);
 if(!m)return null;
 let a,b;try{a=m[2]&&decodeURIComponent(m[2]);b=m[3]&&decodeURIComponent(m[3])}catch{return null}
 const view=m[1];
 if(view==='dashboard')return {view,param:null,tab:'overview',dashTab:a==='today'||a==='report'?a:undefined};
 if(view==='candidate'||view==='opening')return a?{view,param:a,tab:b||'overview'}:null;
 return {view,param:null,tab:'overview'};
}
// make R match the address in the bar. Returns false when there is no usable address (the current screen stays).
function applyHash(){
 const r=hashToRoute(location.hash);
 if(!r||!VIEWS[r.view]||!canSee(r.view))return false;
 if(r.view==='candidate'&&!S.candidates.some(c=>c.id===r.param))return false;
 if(r.view==='opening'&&!S.openings.some(o=>o.id===r.param))return false;
 R.view=r.view;R.param=r.param;R.tab=r.tab;if(r.dashTab)R.dashTab=r.dashTab;R.sel.clear();
 return true;
}
let urlStarted=false;
// called at the end of render(): put the current screen in the address bar (the first time replaces, later ones add a history step)
function syncUrl(){
 const h=routeToHash({view:R.view,param:R.param,tab:R.tab,dashTab:R.dashTab});
 if(location.hash===h)return;
 try{urlStarted?history.pushState(null,'',h):history.replaceState(null,'',h)}catch{/* a sandbox that forbids it: the app still works without addresses */}
 urlStarted=true;
}
// back and forward, or a pasted link
window.addEventListener('hashchange',()=>{
 if(document.body.classList.contains('signed-out'))return;
 if(applyHash()){render();$('#content').scrollTop=0}
});
