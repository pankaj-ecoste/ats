/* Linking a Google Sheet tab to an opening: which fields a link can fill, a first guess of the columns, which columns are "new". Pure, no DOM. */
"use strict";

// the standard fields a tab's columns can fill (source and the opening come from the link itself, so they are not columns)
// the team's call status (Connected, Not Interested ...) is kept on the application and shown in the list
const CALL_FIELD={key:'callStatus',label:'Call status',need:false};
const LINK_FIELDS=[...LEAD_FIELDS.filter(f=>f.key!=='source'),CALL_FIELD];
const isCallHeading=h=>/call\s*(sta|stat)/i.test(String(h||''));

// headings of a platform's own bookkeeping (Meta and Google lead forms add them): not an answer of the person, so not kept unless asked
const NOISE_HEADING=/^(id|lead[_ ]?id|ad[_ ]?id|ad[_ ]?name|adset[_ ]?id|adset[_ ]?name|campaign[_ ]?id|campaign[_ ]?name|form[_ ]?id|form[_ ]?name|page[_ ]?id|platform|is[_ ]?organic|created[_ ]?time|lead[_ ]?status|synced to ats)$/i;
const isNoiseHeading=h=>NOISE_HEADING.test(String(h||'').trim());

// the first guess for a tab: {map: {field: heading}, extra: [headings kept as form answers]}
// Every heading not used for a field is kept as an answer, except the platform's bookkeeping columns.
function guessLink(headings,columns=[]){
 const hs=headings.filter(h=>String(h||'').trim());
 const g=guessLeadMap(hs);
 const map={};LINK_FIELDS.forEach(f=>{if(g[f.key])map[f.key]=g[f.key]});
 const call=hs.find(h=>isCallHeading(h)&&!Object.values(map).includes(h));if(call)map.callStatus=call;
 Object.assign(map,guessCustom(hs,columns,Object.values(map)));
 const used=new Set(Object.values(map));
 return {map,extra:hs.filter(h=>!used.has(h)&&!isNoiseHeading(h))};
}

// the key of one of the app's own columns in a link's map
const customKey=name=>'x:'+name;
const isCustomKey=k=>/^x:/.test(String(k));
const customName=k=>String(k).slice(2);
// every field a link can fill: the standard ones, the call status, and the admin's own columns
const linkFields=(columns=[])=>[...LINK_FIELDS,...columns.map(n=>({key:customKey(n),label:n,need:false,custom:true}))];
// the first guess for the own columns: a heading that says the same (ignoring case, spaces and marks)
const plainWords=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
function guessCustom(headings,columns,taken){
 const out={};const used=new Set(taken);
 columns.forEach(n=>{const w=plainWords(n);if(!w)return;const h=headings.find(x=>!used.has(x)&&plainWords(x)===w)||headings.find(x=>!used.has(x)&&plainWords(x).includes(w));if(h){out[customKey(n)]=h;used.add(h)}});
 return out;
}
// what is wrong with the chosen columns, in words; '' when it is fine (the database checks the same again)
function linkProblem(map){
 const v=k=>String((map&&map[k])||'').trim();
 if(!v('name'))return 'Choose the Name column';
 if(!v('phone')&&!v('email'))return 'Choose the Phone column or the Email column';
 const seen=new Set();
 for(const k of Object.keys(map||{})){const h=v(k);if(!h)continue;if(seen.has(h))return `The column "${h}" is chosen for two fields`;seen.add(h)}
 return '';
}

// headings the tab has now that the link did not know when its columns were last chosen (and that are not the sync column)
function newHeadings(link,headings){
 const known=new Set(link.known||[]);
 return (headings||[]).filter(h=>!known.has(h)&&String(h||'').trim()&&!/^synced to ats$/i.test(h));
}

// headings a link points at that the tab no longer has
function missingHeadings(link,headings){
 const have=new Set(headings||[]);
 return [...Object.values(link.map||{}),...(link.extra||[])].filter(h=>h&&!have.has(h));
}
