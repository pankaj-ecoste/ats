/* Settings, theme, help */
/* ---------- settings ---------- */
"use strict";
function vSettings(){
 const s=S.settings;const W=s.weights;
 return `<div class="page-h"><div><h1>Settings</h1><p>Company details, AI scoring and workspace</p></div></div>
 <div class="grid g2"><section class="panel"><header><h3>Company and offer letters</h3></header><div class="pbody fgrid">
  <label class="f full">Company name<input class="inp" data-s="company" value="${esc(s.company)}"></label><label class="f full">Address<input class="inp" data-s="companyAddr" value="${esc(s.companyAddr)}"></label>
  <label class="f">Signatory<input class="inp" data-s="signatory" value="${esc(s.signatory)}"></label><label class="f">Signatory title<input class="inp" data-s="signTitle" value="${esc(s.signTitle)}"></label>
  <label class="f">Signed-in recruiter<select class="inp" data-s="user">${recruiters().map(r=>`<option ${r===s.user?'selected':''}>${r}</option>`).join('')}</select></label>
  <label class="f">Theme<select class="inp" data-s="theme">${[['auto','Match system'],['light','Light'],['dark','Dark']].map(x=>`<option value="${x[0]}" ${x[0]===s.theme?'selected':''}>${x[1]}</option>`).join('')}</select></label></div></section>
 <section class="panel"><header><div><span class="ai-lbl">${ic('ai')}AI match weights</span><p>How much each factor counts toward the match score. Scores update everywhere instantly.</p></div></header><div class="pbody">
  ${Object.entries(W).map(([k,v])=>`<div class="brk" style="grid-template-columns:110px 1fr 44px"><span>${k[0].toUpperCase()+k.slice(1)}</span><input type="range" min="0" max="60" value="${v}" data-w="${k}" style="accent-color:var(--ai)"><b>${v}</b></div>`).join('')}
  <div class="brk" style="grid-template-columns:110px 1fr 44px;margin-top:14px"><span>AI-matched threshold</span><input type="range" min="40" max="90" step="5" value="${s.threshold}" data-th style="accent-color:var(--ai)"><b>${s.threshold}%</b></div>
  <p class="small muted">Applications at or above the threshold count as “AI matched” in the funnel.</p><button class="btn sm" id="wReset">Restore default weights</button></div></section></div>
 <section class="panel" style="margin-top:16px"><header><div><h3>Team</h3><p>One name per line. These fill the recruiter and interviewer lists everywhere. Leave a list empty to use the built-in names.</p></div></header><div class="pbody fgrid">
  <label class="f">Recruiters<textarea class="inp" id="teamRec" rows="5">${esc(recruiters().join('\n'))}</textarea></label>
  <label class="f">Interviewers and hiring managers<textarea class="inp" id="teamInt" rows="5">${esc(interviewers().join('\n'))}</textarea></label>
  <div class="full"><button class="btn pri" id="teamSave">Save team</button></div></div></section>
 <section class="panel" style="margin-top:16px"><header><div><h3>Demo data</h3><p>Your changes are saved in this browser. Reset to start the demo again.</p></div><button class="btn bad" id="resetAll">Reset demo data</button></header></section>`;
}
function bindSettings(root){
 $$('[data-s]',root).forEach(i=>i.onchange=()=>{updateSetting(i.dataset.s,i.value);applyTheme();render();toast('Settings saved')});
 $$('[data-w]',root).forEach(i=>{i.oninput=()=>{i.nextElementSibling.textContent=i.value};i.onchange=()=>{updateMatchWeight(i.dataset.w,+i.value);toast('Match weights updated','var(--ai)');render()}});
 const th=$('[data-th]',root);th.oninput=()=>th.nextElementSibling.textContent=th.value+'%';th.onchange=()=>{setMatchThreshold(+th.value);render()};
 $('#teamSave',root).onclick=()=>{const lines=id=>$(id,root).value.split('\n');saveTeam({recruiters:lines('#teamRec'),interviewers:lines('#teamInt')});toast('Team saved');render()};
 $('#wReset',root).onclick=()=>{resetMatchWeights();render();toast('Default weights restored')};
 $('#resetAll',root).onclick=()=>confirmBox('Reset demo data','This replaces everything with the original sample data.','Reset',()=>{resetDemoData();R.chat=null;go('dashboard');toast('Demo data restored')},true);
}
function applyTheme(){const t=S.settings.theme;if(t==='auto')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',t)}
function helpModal(){
 modal({title:'How Ecoste Recruit Tracker works',size:'w',body:`<p style="margin-top:0">Every candidate follows one journey. The stepper on each profile shows exactly where they are.</p>${journey({stage:'Selected',maxStage:5})}
 <div class="grid g2" style="margin-top:14px;font-size:13px"><div><b>1. Applications arrive</b><br>Add a resume from Quick add (+). Ecoste Recruit Tracker parses it and scores it against the opening with an explainable AI match.</div><div><b>2. Shortlist and screen</b><br>Shortlist from the match card, then run a screening call with the built-in question script.</div><div><b>3. Group, then personal interviews</b><br>Batch candidates into a group interview, score them on one sheet, and advance the best to HR, technical, managerial and final rounds.</div><div><b>4. Offer to employee ready</b><br>Build the offer with salary breakup, send it, record the answer, schedule joining and tick off onboarding.</div></div>
 <p class="small muted" style="margin-bottom:0">Tip: drag cards between columns on the Applications board to move stages. Press Esc to close any dialog.</p>`,foot:'<button class="btn pri" data-close>Got it</button>'});
}
