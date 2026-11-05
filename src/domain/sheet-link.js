/* Linking a Google Sheet tab to an opening: which fields a link can fill, a first guess of the columns, which columns are "new". Pure, no DOM. */
"use strict";

// the standard fields a tab's columns can fill (source and the opening come from the link itself, so they are not columns)
const LINK_FIELDS=LEAD_FIELDS.filter(f=>f.key!=='source');

// headings of a platform's own bookkeeping (Meta and Google lead forms add them): not an answer of the person, so not kept unless asked
const NOISE_HEADING=/^(id|lead[_ ]?id|ad[_ ]?id|ad[_ ]?name|adset[_ ]?id|adset[_ ]?name|campaign[_ ]?id|campaign[_ ]?name|form[_ ]?id|form[_ ]?name|page[_ ]?id|platform|is[_ ]?organic|created[_ ]?time|lead[_ ]?status|synced to ats)$/i;
const isNoiseHeading=h=>NOISE_HEADING.test(String(h||'').trim());

// the first guess for a tab: {map: {field: heading}, extra: [headings kept as form answers]}
// Every heading not used for a field is kept as an answer, except the platform's bookkeeping columns.
function guessLink(headings){
 const hs=headings.filter(h=>String(h||'').trim());
 const g=guessLeadMap(hs);
 const map={};LINK_FIELDS.forEach(f=>{if(g[f.key])map[f.key]=g[f.key]});
 const used=new Set(Object.values(map));
 return {map,extra:hs.filter(h=>!used.has(h)&&!isNoiseHeading(h))};
}

// what is wrong with the chosen columns, in words; '' when it is fine (the database checks the same again)
function linkProblem(map){
 const v=k=>String((map&&map[k])||'').trim();
 if(!v('name'))return 'Choose the Name column';
 if(!v('phone')&&!v('email'))return 'Choose the Phone column or the Email column';
 const seen=new Set();
 for(const f of LINK_FIELDS){const h=v(f.key);if(!h)continue;if(seen.has(h))return `The column "${h}" is chosen for two fields`;seen.add(h)}
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
