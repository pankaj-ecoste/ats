/* Settings, match weights, SLA rules, demo data reset. DOM-free. */
"use strict";
function updateSetting(key,value){repo.root('settings',s=>{s[key]=value})}
function updateMatchWeight(key,value){repo.root('settings',s=>{s.weights[key]=value})}
function setMatchThreshold(value){repo.root('settings',s=>{s.threshold=value})}
function resetMatchWeights(){repo.root('settings',s=>{s.weights={...DEFAULT_SETTINGS.weights};s.threshold=65})}
// rules: {stageKey: days}
function saveSla(rules){repo.root('settings',s=>{s.sla={...rules}})}
function resetDemoData(){repo.reset(seed())}
