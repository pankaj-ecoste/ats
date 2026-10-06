/* Global state S, default settings, load/save to localStorage */
"use strict";
/* ---------- state ---------- */
const DEFAULT_SETTINGS={company:'Northwind Technologies Pvt. Ltd.',companyAddr:'Tower B, Cyber City, Gurugram, Haryana 122002',signatory:'Anjali Verma',signTitle:'Head of Talent Acquisition',threshold:65,
 weights:{skills:45,experience:20,education:10,location:10,salary:10,notice:5},user:'Priya Sharma',theme:'auto'};
let S; // global state
const STORE_KEY='ecoste-ats', LEGACY_KEY='spectra-ats-v3', STORE_VERSION=3;
function load(){
 try{
  // the current key wins; the legacy key is read once and copied across (it is never deleted)
  const raw=localStorage.getItem(STORE_KEY)||localStorage.getItem(LEGACY_KEY);
  if(raw){
   const d=JSON.parse(raw);
   if(d&&d.v===STORE_VERSION)return d;
   // unknown version: keep the stored data so the first save does not destroy it
   try{localStorage.setItem(STORE_KEY+'-backup',raw)}catch(e){}
  }
 }catch(e){}
 return seed();
}
let saveT,saveFailed=false;
function save(){clearTimeout(saveT);saveT=setTimeout(()=>{
 try{localStorage.setItem(STORE_KEY,JSON.stringify(S));saveFailed=false}
 catch(e){
  // tell the user once per failure streak; a full or blocked storage means changes are NOT being kept
  if(!saveFailed&&typeof toast==='function')toast('Could not save your changes in this browser. Export a workbook to keep them.','var(--red)');
  saveFailed=true;
 }
},200)}
S=load();
