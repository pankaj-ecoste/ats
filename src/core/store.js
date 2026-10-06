/* Global state S, default settings, load/save to localStorage */
"use strict";
/* ---------- state ---------- */
const DEFAULT_SETTINGS={company:'Northwind Technologies Pvt. Ltd.',companyAddr:'Tower B, Cyber City, Gurugram, Haryana 122002',signatory:'Anjali Verma',signTitle:'Head of Talent Acquisition',threshold:65,
 weights:{skills:45,experience:20,education:10,location:10,salary:10,notice:5},user:'Priya Sharma',theme:'auto'};
let S; // global state
function load(){
 try{const raw=localStorage.getItem('spectra-ats-v3');if(raw){const d=JSON.parse(raw);if(d&&d.v===3)return d;}}catch(e){}
 return seed();
}
let saveT;
function save(){clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem('spectra-ats-v3',JSON.stringify(S))}catch(e){}},200)}
S=load();
