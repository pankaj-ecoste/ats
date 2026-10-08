/* Extension points: slots, bind hooks, view decorators, events, nav items.
   Features use these instead of editing another feature's HTML or reassigning its functions. */
"use strict";
/* ---------- slots: a host view declares a place, features fill it ---------- */
const SLOT_FILLERS={};
// host view:  `...${slotHTML('sheets.top')}...`      feature:  fillSlot('sheets.top',()=>html)
function fillSlot(name,fn){(SLOT_FILLERS[name]||(SLOT_FILLERS[name]=[])).push(fn)}
function slotHTML(name){return (SLOT_FILLERS[name]||[]).map(f=>f()).join('')}

/* ---------- bind hooks: extra handlers attached after a view's own bind ---------- */
const BIND_HOOKS={};
function onBind(view,fn){(BIND_HOOKS[view]||(BIND_HOOKS[view]=[])).push(fn)}
function runBindHooks(view,root){(BIND_HOOKS[view]||[]).forEach(f=>f(root))}

/* ---------- view decorators: change a view's output when a slot is not enough ---------- */
// decorateView('dashboard',{view:original=>html, bind:(root,original)=>{}})
function decorateView(name,{view,bind}){
 const [v,b]=VIEWS[name];
 VIEWS[name]=[view?()=>view(v):v,bind?r=>bind(r,b):b];
}

/* ---------- events: announce that something happened, anyone may listen ---------- */
// 'stage:changing' {aid,stage,prev}  fired by setStage() before the stage is written
const EVENT_LISTENERS={};
function onEvent(name,fn){(EVENT_LISTENERS[name]||(EVENT_LISTENERS[name]=[])).push(fn)}
function emitEvent(name,payload){(EVENT_LISTENERS[name]||[]).forEach(f=>f(payload))}

/* ---------- navigation: sidebar order is declared here, not by load order ---------- */
function addNav(item,afterKey){
 const i=NAV.findIndex(n=>n[0]===afterKey);
 NAV.splice(i<0?NAV.length:i+1,0,item);
}
