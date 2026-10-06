/* AI Assistant (rule-based answers over local state) */
/* ---------- AI assistant ---------- */
function aiAnswer(q){
 const t=q.toLowerCase();
 const op=S.openings.find(o=>t.includes(o.title.toLowerCase())||o.title.toLowerCase().split(/[ /]/).filter(w=>w.length>3).some(w=>t.includes(w)));
 const tbl=(rows,head)=>`<div class="tbl-wrap"><table><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
 const link=c=>`<a href="#" data-gocand="${c.id}">${esc(c.name)}</a>`;
 if(/feedback|pending|evaluat/.test(t)){const l=S.interviews.filter(i=>intStatus(i)==='Pending Feedback');return l.length?`${l.length} interview${l.length>1?'s are':' is'} waiting for feedback:`+tbl(l.map(i=>{const a=getA(i.appId),c=getC(a.cid);return `<tr><td>${link(c)}</td><td>${esc(i.round)}</td><td>${fmtDs(i.date)}</td><td>${esc(i.interviewers.join(', '))}</td></tr>`}),['Candidate','Round','Date','Interviewer'])+'Nudge the interviewers today so candidates don\'t go cold.':'No interviews are waiting for feedback. Nice.'}
 if(/risk|attention|stuck|ageing|aging|slow/.test(t)){const l=S.openings.filter(o=>!['Filled','Closed'].includes(o.status)).map(o=>({o,n:appsOfOp(o.id).filter(a=>!['Rejected','On Hold'].includes(a.stage)).length,age:daysBetween(o.opened,today()),left:daysBetween(today(),o.target)})).filter(x=>x.n<x.o.positions*2||x.left<20).sort((a,b)=>a.left-b.left);
  return `These openings look at risk of missing their joining target:`+tbl(l.map(x=>`<tr><td>${esc(x.o.title)}</td><td>${x.n} active for ${x.o.positions} seat${x.o.positions>1?'s':''}</td><td>${x.age}d open</td><td>${x.left}d to target</td></tr>`),['Opening','Pipeline','Age','Target'])+`Suggested next step: widen sourcing for ${esc(l[0]?.o.title||'these roles')} and move ready candidates to interviews this week.`}
 if(/summar|pipeline|overview|status|how are we/.test(t)&&!op){const f=funnelData(S.applications);return `Across ${S.openings.length} openings you have <b>${S.applications.length}</b> applications. ${f.slice(1).map(x=>`${x[0]}: <b>${x[1]}</b>`).join(', ')}. The biggest drop is between ${(()=>{let w=1,wv=1;f.forEach((x,k)=>{if(k&&f[k-1][1]){const r=x[1]/f[k-1][1];if(r<wv){wv=r;w=k}}});return f[w-1][0].toLowerCase()+' and '+f[w][0].toLowerCase()+` (${Math.round(wv*100)}% conversion)`})()}.`}
 const skM=SKILL_DICT.find(s=>new RegExp('\\b'+s.toLowerCase().replace(/[.+*?/()]/g,'\\$&')+'\\b').test(t));
 if(op&&/top|best|rank|who|shortlist|recommend|candidates/.test(t)){const l=appsOfOp(op.id).filter(a=>!['Rejected'].includes(a.stage)).map(a=>({a,m:matchA(a)})).sort((x,y)=>y.m.score-x.m.score).slice(0,5);
  return `Top candidates for <b>${esc(op.title)}</b>, ranked by AI match:`+tbl(l.map(x=>{const c=getC(x.a.cid);return `<tr><td>${link(c)}</td><td>${x.m.score}%</td><td>${x.a.stage}</td><td class="small">${x.m.miss.length?'Missing '+esc(x.m.miss.join(', ')):'All mandatory skills'}</td></tr>`}),['Candidate','Match','Stage','Why'])+(l[0]?`My pick: ${link(getC(l[0].a.cid))}. ${esc(l[0].m.summary)}`:'')}
 if(skM&&/find|with|who|know|skill|candidates/.test(t)){const l=S.candidates.filter(c=>hasSkill(c,skM));return l.length?`${l.length} candidate${l.length>1?'s':''} list <b>${esc(skM)}</b>:`+tbl(l.map(c=>{const a=primaryApp(c.id);return `<tr><td>${link(c)}</td><td>${c.exp} yrs</td><td>${esc(c.location)}</td><td>${a.stage}</td></tr>`}),['Candidate','Exp','Location','Stage']):`No one in the pool lists ${esc(skM)} yet.`}
 if(/jd|job description|draft/.test(t)){const role=(q.match(/for (?:an? )?(.+)$/i)||[])[1]||(op&&op.title)||'Customer Success Manager';return `<b>Draft JD: ${esc(role)}</b><br><br>We're looking for a ${esc(role)} to help us grow with our customers. You'll own outcomes end-to-end, work across teams, and measure success in real results.<br><br><b>What you'll do</b><br>• Own the day-to-day delivery for your area<br>• Partner with sales, product and support<br>• Report on progress weekly and improve how we work<br><br><b>What you'll bring</b><br>• 3–6 years in a similar role<br>• Clear written and spoken communication<br>• Comfort with data and CRM tools<br><br>Use <b>New opening</b> to turn this into a live opening.`}
 if(/offer/.test(t)){const l=S.offers.filter(o=>['Sent','Negotiation','Draft','Generated'].includes(o.status));return l.length?'Open offers:'+tbl(l.map(o=>{const c=getC(getA(o.appId).cid);return `<tr><td>${link(c)}</td><td>${esc(o.designation)}</td><td>${inr(o.ctc)}</td><td>${o.status}</td></tr>`}),['Candidate','Role','CTC','Status']):'No offers are pending.'}
 if(/today|interview/.test(t)){const l=S.interviews.filter(i=>i.date===today());return l.length?`You have ${l.length} interviews today:`+tbl(l.map(i=>{const c=getC(getA(i.appId).cid);return `<tr><td>${fmtT(i.time)}</td><td>${link(c)}</td><td>${i.kind==='Group'?'Group':esc(i.round)}</td><td>${esc(i.interviewers.join(', '))}</td></tr>`}),['Time','Candidate','Type','Interviewer']):'No interviews today.'}
 const cand=S.candidates.find(c=>t.includes(c.name.toLowerCase().split(' ')[0])&&t.length<120);
 if(cand){const a=primaryApp(cand.id),m=matchA(a);return `<b>${link(cand)}</b> · ${esc(getOp(a.opId).title)} · ${a.stage}<br>AI match <b>${m.score}%</b> (${m.verdict}). ${esc(m.summary)}${m.risks.length?'<br><b>Watch-outs:</b> '+esc(m.risks.join('; ')):''}`}
 return `I can answer questions about your live pipeline. Try asking for top candidates for an opening, who knows a skill, pending feedback, at-risk openings, today's interviews, open offers, a pipeline summary, or a draft job description.`;
}
function vAI(){
 if(!R.chat)R.chat=[{r:'a',h:`Hi ${esc(S.settings.user.split(' ')[0])}. I read your openings, resumes, interviews and offers. Ask me anything about the pipeline.`}];
 const sug=['Top candidates for Senior Java Developer','Who needs interview feedback?','Which openings are at risk?','Summarize the pipeline','Find candidates with Kubernetes','Draft a JD for Customer Success Manager'];
 return `<div class="page-h"><div><h1>AI Assistant</h1><p>Answers come from your live recruitment data</p></div><button class="btn ghost sm" id="aiClear">Clear chat</button></div>
 <section class="panel chat"><div class="msgs" id="msgs">${R.chat.map(m=>`<div class="msg ${m.r}">${m.r==='a'?`<div class="ai-lbl" style="margin-bottom:4px">${ic('ai')}Ecoste AI</div>`:''}${m.h}</div>`).join('')}</div>
 <div style="padding:12px 14px;border-top:1px solid var(--line)"><div class="chips" style="margin-bottom:10px">${sug.map(s=>`<button class="chip" data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div>
 <div class="row" style="flex-wrap:nowrap"><input class="inp" id="aiIn" placeholder="Ask about candidates, openings, interviews or offers" autocomplete="off"><button class="btn aib" id="aiGo">${ic('send')}Ask</button></div></div></section>`;
}
function bindAI(root){
 const m=$('#msgs',root);m.scrollTop=m.scrollHeight;
 const ask=q=>{if(!q.trim())return;R.chat.push({r:'u',h:esc(q)});R.chat.push({r:'a',h:aiAnswer(q)});render();$('#aiIn').focus()};
 $('#aiGo',root).onclick=()=>ask($('#aiIn',root).value);$('#aiIn',root).onkeydown=e=>{if(e.key==='Enter')ask(e.target.value)};
 $$('[data-sug]',root).forEach(b=>b.onclick=()=>ask(b.dataset.sug));
 $$('[data-gocand]',root).forEach(a=>a.onclick=e=>{e.preventDefault();go('candidate',a.dataset.gocand)});
 $('#aiClear',root).onclick=()=>{R.chat=null;render()};
}
