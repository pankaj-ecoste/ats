/* Settings, match weights, SLA rules, demo data reset. DOM-free. */
"use strict";
function updateSetting(key,value){repo.root('settings',s=>{s[key]=value})}
function updateMatchWeight(key,value){repo.root('settings',s=>{s.weights[key]=value})}
function setMatchThreshold(value){repo.root('settings',s=>{s.threshold=value})}
function resetMatchWeights(){repo.root('settings',s=>{s.weights={...DEFAULT_SETTINGS.weights};s.threshold=65})}
// lists of names; blanks and duplicates are dropped. An empty list means "use the built-in names".
function saveTeam({recruiters,interviewers}){
 const clean=l=>[...new Set(l.map(x=>String(x).trim()).filter(Boolean))];
 repo.root('settings',s=>{s.team={recruiters:clean(recruiters),interviewers:clean(interviewers)}});
}
// rules: {stageKey: days}
function saveSla(rules){repo.root('settings',s=>{s.sla={...rules}})}
function resetDemoData(){repo.reset(seed())}
