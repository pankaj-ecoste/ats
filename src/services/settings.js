/* Settings, match weights, SLA rules, demo data reset. DOM-free. */
"use strict";
function updateSetting(key,value){repo.root('settings',s=>{s[key]=value})}
// the company name, address and signatory in one change (the first-run setup)
function saveCompanyDetails(d){repo.root('settings',s=>{Object.assign(s,d)})}
function updateMatchWeight(key,value){repo.root('settings',s=>{s.weights[key]=value})}
function setMatchThreshold(value){repo.root('settings',s=>{s.threshold=value})}
function resetMatchWeights(){repo.root('settings',s=>{s.weights={...DEFAULT_SETTINGS.weights};s.threshold=65})}
// lists of names; blanks and duplicates are dropped. An empty list means "use the built-in names".
function saveTeam({recruiters,interviewers}){
 const clean=l=>[...new Set(l.map(x=>String(x).trim()).filter(Boolean))];
 repo.root('settings',s=>{s.team={recruiters:clean(recruiters),interviewers:clean(interviewers)}});
}
// the places a lead can come from; an empty list goes back to the built-in one
function saveSources(list){const clean=[...new Set(list.map(x=>String(x).trim()).filter(Boolean))];repo.root('settings',s=>{if(clean.length)s.sources=clean;else delete s.sources})}
// the app's own columns for leads (Call status is built in); the names an admin added. An empty list means none.
function saveColumns(list){const clean=[...new Set(list.map(x=>String(x).trim().replace(/\s+/g,' ')).filter(x=>x&&x.length<=40))].slice(0,12);repo.root('settings',s=>{if(clean.length)s.columns=clean;else delete s.columns})}
// the fields of their own on every ad request (up to 12, names up to 40 characters); an empty list means none
function saveAdFields(list){const seen=new Set(),clean=[];list.forEach(x=>{const t=String(x).trim().replace(/\s+/g,' '),k=t.toLowerCase();if(t&&t.length<=40&&!seen.has(k)){seen.add(k);clean.push(t)}});clean.splice(12);repo.root('settings',s=>{if(clean.length)s.adFields=clean;else delete s.adFields})}
// who gets the ad brief: a name, an email and a WhatsApp number (each may be left empty)
function saveMarketingContact({name='',email='',phone=''}){
 const n=String(name).replace(/\s+/g,' ').trim().slice(0,60),e=String(email).trim().slice(0,120),p=String(phone).trim().slice(0,20);
 if(e&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))throw new Error('That email address does not look right');
 if(p&&!whatsappNumber(p))throw new Error('That phone number does not look right (use the country code, or a 10-digit Indian number)');
 repo.root('settings',s=>{if(n||e||p)s.marketing={name:n,email:e,phone:p};else delete s.marketing});
}
// rules: {stageKey: days}
function saveSla(rules){repo.root('settings',s=>{s.sla={...rules}})}
function resetDemoData(){repo.reset(seed())}
