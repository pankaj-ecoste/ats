/* Management report view, modals, dashboard tab hook */
/* ---- the report ---- */
function vReport(){
 if(!S.events)seedHistory();if(!S.callLog)S.callLog=[];if(!S.monthly)S.monthly={};
 const c=repCfg();const rd=R.rep.date;const wk=mondayOf(rd),pwk=addDays(-7,parseD(wk)),wkE=addDays(6,parseD(wk)),pwkE=addDays(-1,parseD(wk));
 const mS=monthStart(rd),mE=monthEnd(rd),pmS=shiftMonth(rd,-1),pmE=monthEnd(pmS);
 const W=metrics(wk,wkE),PW=metrics(pwk,pwkE),M=metrics(mS,mE),PM=metrics(pmS,pmE);
 const pos=positionRows(rd),up=upcoming();const pending=pos.reduce((s,p)=>s+p.pend,0),overdue=pos.filter(p=>p.st==='Overdue').length,dueSoon=pos.filter(p=>p.st==='Due soon').length;
 const withB=up.filter(u=>u.backup).length,noB=up.length-withB,hiNoB=up.filter(u=>!u.backup&&u.risk==='High').length,cov=up.length?withB/up.length:0;
 const next30=up.filter(u=>u.join&&u.join>=rd&&u.join<=addDays(30,parseD(rd))).length,dropped=S.applications.filter(a=>a.dropped).length+S.events.filter(e=>e.t==='dropped'&&!e.aid).length;
 const cost=monthCost(mS);const achieved=M.join;
 const fmtM=s=>MONTHS[parseD(s).getMonth()]+' '+parseD(s).getFullYear();
 const chg=(a,b,isPct)=>{const d=a-b;if(!d)return '<span class="flat">0</span>';return `<span class="${d>0?'up':'down'}">${d>0?'+':''}${isPct?Math.round(d*100)+' pts':d}</span>`};
 const chgR=(a,b,inv)=>{const d=Math.round((a-b)*100);if(!d)return '<span class="flat">0 pts</span>';return `<span class="${(d>0)!==!!inv?'up':'down'}">${d>0?'+':''}${d} pts</span>`};
 const chgP=(a,b)=>b?`<span class="${a>=b?'up':'down'}">${a>=b?'+':''}${Math.round((a-b)/b*100)}%</span>`:'<span class="flat">—</span>';
 const al=[];
 al.push([overdue?'var(--red)':dueSoon?'var(--orange)':'var(--green)',`<b>Positions:</b> ${overdue} overdue, ${dueSoon} due within ${c.dueSoon} days of target close date.`]);
 al.push([noB?'var(--red)':'var(--green)',noB?`<b>Backup:</b> ${noB} upcoming joiner${noB>1?'s have':' has'} no backup candidate (${hiNoB} of them high drop risk).`:'<b>Backup:</b> every upcoming joiner has a backup candidate.']);
 al.push([!M.offer?'var(--tx3)':M.r_acc*100<c.offerAlert?'var(--red)':'var(--green)',!M.offer?'<b>Offers:</b> none released this month.':M.r_acc*100<c.offerAlert?`<b>Offers:</b> acceptance is ${pct(M.r_acc)}, below the ${c.offerAlert}% alert level.`:`<b>Offers:</b> acceptance is healthy at ${pct(M.r_acc)}.`]);
 al.push([M.r_ns*100>c.noShowAlert?'var(--red)':'var(--green)',M.r_ns*100>c.noShowAlert?`<b>No-shows:</b> ${pct(M.r_ns)} of scheduled interviews this month, above the ${c.noShowAlert}% alert level.`:`<b>No-shows:</b> ${pct(M.r_ns)} this month, within limit.`]);
 al.push([!cost.target?'var(--tx3)':achieved>=cost.target?'var(--green)':'var(--orange)',!cost.target?'<b>Target:</b> no hiring target entered for this month.':`<b>Target:</b> ${achieved} of ${cost.target} planned hires joined (${pct(achieved/cost.target)}).`]);
 const weeks=[...Array(8)].map((_,i)=>addDays(-7*(7-i),parseD(wk)));const wm=weeks.map(w=>metrics(w,addDays(6,parseD(w))));
 const sr=sourceRows(mS);const st={cv:0,it:0,j:0,c:0};sr.forEach(r=>{st.cv+=r.cv;st.it+=r.it;st.j+=r.j;st.c+=r.c});
 const kpi=(l,v,s,cls)=>`<div class="${cls||''}"><span>${l}</span><b>${v}</b><em>${s}</em></div>`;
 const body=`<div class="rep">
 <div class="panel no-print" style="padding:14px 16px"><div class="rep-set">
  <label>Report date<input type="date" class="inp yl" id="rpDate" value="${rd}"></label>
  <label>Week starting (Monday)<input class="inp" value="${fmtD(wk)}" readonly></label><label>Report month<input class="inp" value="${fmtM(mS)}" readonly></label>
  <label>Alert if offer acceptance below (%)<input type="number" class="inp yl" data-rc="offerAlert" value="${c.offerAlert}"></label>
  <label>Alert if no-show rate above (%)<input type="number" class="inp yl" data-rc="noShowAlert" value="${c.noShowAlert}"></label>
  <label>“Due soon” if target within (days)<input type="number" class="inp yl" data-rc="dueSoon" value="${c.dueSoon}"></label></div>
  <div class="small muted" style="margin-top:8px">Yellow fields are settings you can change. Everything else is calculated live from the app.${S.demoHistory?' <b>Past weeks include sample history</b> so the trends have data — <a href="#" id="rpClearDemo">clear sample history</a> when you start using the app for real.':''}</div></div>
 <h2 class="sec">Headline KPIs · ${fmtM(mS)}</h2>
 <div class="hk">${kpi('Pending vacancies',pending,'positions still to fill',pending?'warn':'good')}${kpi('Offer acceptance',M.offer?pct(M.r_acc):'—','this month',M.offer&&M.r_acc*100<c.offerAlert?'bad':'good')}${kpi('Avg time to hire',M.tth?M.tth+' d':'—','this month')}${kpi('Backup coverage',up.length?pct(cov):'—','of upcoming joiners',noB?'bad':'good')}${kpi('Overdue positions',overdue,'past target close date',overdue?'bad':'good')}</div>
 <h2 class="sec">Management attention · auto alerts</h2>
 <section class="panel"><ul class="alerts">${al.map(x=>`<li><i style="background:${x[0]}"></i><span>${x[1]}</span></li>`).join('')}</ul></section>
 <h2 class="sec">Weekly vs monthly hiring activity <span class="small" style="text-transform:none;letter-spacing:0;font-weight:500">Week of ${fmtD(wk)} · ${fmtM(mS)}</span></h2>
 <section class="panel"><div class="tbl-wrap"><table class="rt"><thead><tr><th>Activity</th><th class="num">This week</th><th class="num">Last week</th><th class="num">Week change</th><th class="num">This month</th><th class="num">Last month</th><th class="num">Month change</th><th class="num">Month change %</th></tr></thead><tbody>
  ${ROWS.map(([k,l])=>`<tr><td>${l}</td><td class="num"><b>${W[k]}</b></td><td class="num">${PW[k]}</td><td class="num">${chg(W[k],PW[k])}</td><td class="num"><b>${M[k]}</b></td><td class="num">${PM[k]}</td><td class="num">${chg(M[k],PM[k])}</td><td class="num">${chgP(M[k],PM[k])}</td></tr>`).join('')}
  <tr class="sub"><td colspan="8">Conversion rates</td></tr>
  ${RATES.map(([k,l])=>`<tr><td>${l}</td><td class="num"><b>${pct(W[k])}</b></td><td class="num">${pct(PW[k])}</td><td class="num">${chgR(W[k],PW[k],k==='r_ns')}</td><td class="num"><b>${pct(M[k])}</b></td><td class="num">${pct(PM[k])}</td><td class="num">${chgR(M[k],PM[k],k==='r_ns')}</td><td></td></tr>`).join('')}
 </tbody></table></div><div class="pbody no-print" style="padding-top:8px"><button class="btn sm" id="rpCalls">${ic('phone')}Log calls</button> <span class="small muted">Bulk calls you make outside the app's screening call screen. Screening calls made in the app count automatically.</span></div></section>
 <h2 class="sec">Weekly trend · last 8 weeks</h2>
 <div class="grid g2"><section class="panel"><header><h3>Weekly trend (last 8 weeks)</h3></header><div class="pbody chartbox">${lineChart(weeks.map(w=>fmtDs(w)),[{n:'Group interviews',c:'#0AA5C2',v:wm.map(m=>m.gi)},{n:'Interviews',c:'#2F6BFF',v:wm.map(m=>m.int)},{n:'Selected',c:'#7B4DFF',v:wm.map(m=>m.sel)},{n:'Joined',c:'#12A150',v:wm.map(m=>m.join)}])}</div></section>
 <section class="panel"><header><h3>Interviews to joining: this vs last month</h3></header><div class="pbody chartbox">${barChart(['Interviews','No-shows','Selected','Offers','Accepted','Joined','Backups'],['int','noshow','sel','offer','acc','join','backup'].map(k=>M[k]),['int','noshow','sel','offer','acc','join','backup'].map(k=>PM[k]),'This month','Last month')}</div></section></div>
 <section class="panel" style="margin-top:16px"><div class="tbl-wrap"><table class="rt"><thead><tr><th>Week starting</th><th class="num">Calls made</th><th class="num">Interested</th><th class="num">Group int.</th><th class="num">Interviews</th><th class="num">Selected</th><th class="num">Offers</th><th class="num">Joined</th></tr></thead><tbody>${weeks.map((w,i)=>{const m=wm[i];return `<tr${w===wk?' style="font-weight:700"':''}><td>${fmtD(w)}</td><td class="num">${m.calls}</td><td class="num">${m.conn}</td><td class="num">${m.gi}</td><td class="num">${m.int}</td><td class="num">${m.sel}</td><td class="num">${m.offer}</td><td class="num">${m.join}</td></tr>`}).join('')}</tbody></table></div></section>
 <h2 class="sec">Position-wise status · as of ${fmtD(rd)}</h2>
 <section class="panel"><div class="tbl-wrap"><table class="rt"><thead><tr><th>Position</th><th>Department</th><th class="num">Openings</th><th class="num">Joined</th><th class="num">Pending</th><th class="num">Interviews (month)</th><th class="num">Selected (month)</th><th class="num">Days open</th><th>Status</th></tr></thead><tbody>
  ${pos.map(p=>{const aids=appsOfOp(p.o.id).map(a=>a.id);const im=S.interviews.filter(i=>aids.includes(i.appId)&&i.status==='Completed'&&inR(i.date,mS,mE)).length+S.events.filter(e=>e.t==='interview'&&e.op===p.o.id&&inR(e.d,mS,mE)).length;const sm=S.events.filter(e=>e.t==='selected'&&e.op===p.o.id&&inR(e.d,mS,mE)).length;
   return `<tr class="click" data-rop="${p.o.id}"><td><b>${esc(p.o.title)}</b></td><td>${esc(p.o.dept)}</td><td class="num">${p.o.positions}</td><td class="num">${p.j}</td><td class="num"><b>${p.pend}</b></td><td class="num">${im}</td><td class="num">${sm}</td><td class="num">${p.days}</td><td><span class="pill ${{Closed:'green',Overdue:'red','Due soon':'orange','On track':'blue'}[p.st]}">${p.st}</span></td></tr>`}).join('')}
  <tr class="sub"><td>Total</td><td></td><td class="num">${pos.reduce((s,p)=>s+p.o.positions,0)}</td><td class="num">${pos.reduce((s,p)=>s+p.j,0)}</td><td class="num">${pending}</td><td colspan="4"></td></tr></tbody></table></div></section>
 <h2 class="sec">Joining backup</h2>
 <div class="grid g-dash"><section class="panel"><header><div><h3>Upcoming joiners</h3><p>Offer pending or accepted · name a backup so the seat is covered if someone drops</p></div></header><div class="tbl-wrap"><table><thead><tr><th>Position</th><th>Selected candidate</th><th>Expected joining</th><th>Offer</th><th>Drop risk</th><th>Backup candidate</th><th>Backup status</th><th class="no-print"></th></tr></thead><tbody>
  ${up.map(u=>{const b=u.backup?getC(getA(u.backup.aid).cid):null;return `<tr><td>${esc(u.o.title)}</td><td><a href="#" data-gocand="${u.c.id}">${esc(u.c.name)}</a></td><td>${u.join?fmtD(u.join):'<span class="muted">Not set</span>'}</td><td><span class="pill ${u.offer==='Accepted'?'green':'orange'}">${u.offer}</span></td>
   <td><select class="inp no-print-sel" data-risk="${u.a.id}" style="width:auto;padding:4px 8px;font-size:12px;${u.risk==='High'?'color:var(--red);font-weight:700':''}">${['Low','Med','High'].map(r=>`<option ${r===u.risk?'selected':''}>${r}</option>`).join('')}</select></td>
   <td>${b?esc(b.name):'<span class="pill red">No backup</span>'}</td><td>${u.backup?esc(u.backup.status):'—'}</td><td class="no-print"><button class="btn sm" data-bk="${u.a.id}">${b?'Change':'Add backup'}</button> <button class="btn sm ghost bad" data-drop="${u.a.id}">Dropped</button></td></tr>`}).join('')||'<tr><td colspan="8"><div class="empty">No upcoming joiners</div></td></tr>'}
 </tbody></table></div></section>
 <section class="panel"><header><h3>Summary</h3></header><div class="pbody"><dl class="kv" style="grid-template-columns:1fr auto">${[['Upcoming joiners (offer accepted / pending)',up.length],['…of which joining in next 30 days',next30],['With a backup candidate',withB],['Without a backup candidate',noB],['High drop-risk joiners without backup',hiNoB],['Backup coverage %',up.length?pct(cov):'—'],['Dropped after accepting (all time)',dropped]].map(r=>`<dt>${r[0]}</dt><dd style="text-align:right;font-weight:700">${r[1]}</dd>`).join('')}</dl></div></section></div>
 <h2 class="sec">Monthly target, speed and cost · ${fmtM(mS)}</h2>
 <div class="grid g2"><section class="panel"><header><h3>Target and cost</h3><button class="btn sm no-print" id="rpTargets">Set targets &amp; budget</button></header><div class="pbody"><dl class="kv" style="grid-template-columns:1fr auto">${[['Planned hires (target)',cost.target||'—'],['Actual joined',achieved],['Target achievement %',cost.target?pct(achieved/cost.target):'—'],['Average time to hire (days)',M.tth||'—'],['Hiring budget (INR)',cost.budget?inr(cost.budget):'—'],['Actual spend (INR)',inr(cost.total)+` <span class="muted small">(job posts ${inr(cost.post)} + other ${inr(cost.other)})</span>`],['Budget used %',cost.budget?pct(cost.total/cost.budget):'—'],['Cost per hire (INR)',achieved?inr(cost.total/achieved):'—']].map(r=>`<dt>${r[0]}</dt><dd style="text-align:right;font-weight:700">${r[1]}</dd>`).join('')}</dl></div></section>
 <section class="panel"><header><h3>Source of hire</h3></header><div class="tbl-wrap"><table class="rt"><thead><tr><th>Source</th><th class="num">CVs received</th><th class="num">Interviewed</th><th class="num">Joined</th><th class="num">Cost (INR)</th><th class="num">Join ratio</th><th class="num">Cost per join</th></tr></thead><tbody>${sr.map(r=>`<tr><td>${esc(r.s)}</td><td class="num">${r.cv}</td><td class="num">${r.it}</td><td class="num"><b>${r.j}</b></td><td class="num">${r.c?inr(r.c):'—'}</td><td class="num">${r.cv?pct(r.j/r.cv):'—'}</td><td class="num">${r.j&&r.c?inr(r.c/r.j):'—'}</td></tr>`).join('')||'<tr><td colspan="7" class="muted">No source data this month</td></tr>'}
  <tr class="sub"><td>Total</td><td class="num">${st.cv}</td><td class="num">${st.it}</td><td class="num">${st.j}</td><td class="num">${st.c?inr(st.c):'—'}</td><td class="num">${st.cv?pct(st.j/st.cv):'—'}</td><td class="num">${st.j&&st.c?inr(st.c/st.j):'—'}</td></tr></tbody></table></div></section></div>
 <div class="small muted" style="margin-top:16px;line-height:1.7"><b>Notes and assumptions</b><br>• Activity is counted by the date it happened (a week runs Monday–Sunday; a month by calendar date).<br>• Offer acceptance % = offers accepted ÷ offers released in the same period; an offer can be accepted in a later week than it was released.<br>• Time to hire = days from application to joining, averaged over people who joined in the month. Cost per hire = month's spend ÷ people joined.<br>• Spend = job-posting costs entered on the Job posting page + other spend entered under Set targets. Alert levels are your settings, not company standards.<br>• Position status: Overdue = target close date passed with vacancies open; Due soon = target within the days set above.</div>
 </div>`;
 return body;
}
function bindReport(root){
 const c=repCfg();const on=(s,f)=>{const x=$(s,root);if(x)f(x)};
 on('#rpDate',x=>x.onchange=()=>{R.rep.date=x.value||today();render()});
 $$('[data-rc]',root).forEach(i=>i.onchange=()=>{setReportThreshold(i.dataset.rc,Math.max(0,+i.value||0));render()});
 on('#rpClearDemo',x=>x.onclick=e=>{e.preventDefault();confirmBox('Clear sample history','Remove the sample weekly history, call logs and demo posting costs? Real activity from the app is kept.','Clear',()=>{clearDemoHistory();render();toast('Sample history cleared')},true)});
 on('#rpCalls',x=>x.onclick=callLogModal);on('#rpTargets',x=>x.onclick=targetsModal);
 $$('[data-rop]',root).forEach(tr=>tr.onclick=()=>go('opening',tr.dataset.rop));
 $$('[data-gocand]',root).forEach(a=>a.onclick=e=>{e.preventDefault();go('candidate',a.dataset.gocand)});
 $$('[data-risk]',root).forEach(s=>s.onchange=()=>{setDropRisk(s.dataset.risk,s.value);render()});
 $$('[data-bk]',root).forEach(b=>b.onclick=()=>backupModal(b.dataset.bk));
 $$('[data-drop]',root).forEach(b=>b.onclick=()=>dropModal(b.dataset.drop));
}
function callLogModal(){
 const rec=S.callLog.filter(c=>!c.demo).slice(-8).reverse();
 modal({title:'Log calls',body:`<div class="fgrid"><label class="f">Date<input class="inp" type="date" id="clD" value="${today()}"></label><label class="f">Position<select class="inp" id="clO">${S.openings.filter(o=>!['Closed','Draft'].includes(o.status)).map(o=>`<option value="${o.id}">${esc(o.title)}</option>`).join('')}</select></label>
 <label class="f">Calls made<input class="inp" type="number" min="0" id="clM" value="0"></label><label class="f">Connected / interested<input class="inp" type="number" min="0" id="clC" value="0"></label></div>
 ${rec.length?`<h4 style="margin:16px 0 6px">Recent entries</h4>${rec.map(r=>`<div class="list-it" style="padding:6px 0"><span class="grow small">${fmtD(r.d)} · ${esc(getOp(r.op)?.title||r.op)} · ${r.made} made, ${r.conn} connected</span><button class="btn sm ghost" data-cldel="${r.id}" aria-label="Delete">${ic('x')}</button></div>`).join('')}`:''}`,
 foot:`<button class="btn" data-close>Close</button><button class="btn pri" id="clS">Add</button>`,
 onMount:el=>{$('#clS',el).onclick=()=>{const m=+val(el,'#clM')||0,cn=+val(el,'#clC')||0;if(!m){toast('Enter the number of calls made','var(--red)');return}if(cn>m){toast('Connected cannot be more than calls made','var(--red)');return}
   logCalls({d:val(el,'#clD')||today(),op:val(el,'#clO'),made:m,conn:cn});closeModal();toast(`${m} calls logged`);render()};
  $$('[data-cldel]',el).forEach(b=>b.onclick=()=>{deleteCallLog(b.dataset.cldel);closeModal();callLogModal();render()})}});
}
function targetsModal(){
 const months=[-2,-1,0,1,2].map(n=>shiftMonth(R.rep.date,n));
 modal({title:'Monthly targets, budget and other spend',size:'w',body:`<p class="small muted" style="margin-top:0">Job-posting costs come from the Job posting page automatically. Use “Other spend” for consultants, assessments, travel and similar.</p><div class="tbl-wrap"><table><thead><tr><th>Month</th><th>Planned hires</th><th>Hiring budget (₹)</th><th>Other spend (₹)</th><th>Job-post costs</th></tr></thead><tbody>
 ${months.map(m=>{const v=S.monthly[ym(m)]||{};return `<tr><td><b>${MONTHS[parseD(m).getMonth()]} ${parseD(m).getFullYear()}</b></td><td><input class="inp" type="number" min="0" data-tm="${ym(m)}" data-k="target" value="${v.target||''}" style="width:90px"></td><td><input class="inp" type="number" min="0" data-tm="${ym(m)}" data-k="budget" value="${v.budget||''}" style="width:130px"></td><td><input class="inp" type="number" min="0" data-tm="${ym(m)}" data-k="other" value="${v.other||''}" style="width:130px"></td><td class="small">${inr(monthCost(m).post)}</td></tr>`}).join('')}</tbody></table></div>`,
 foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="tmS">Save</button>`,
 onMount:el=>$('#tmS',el).onclick=()=>{saveMonthlyTargets($$('[data-tm]',el).map(i=>[i.dataset.tm,i.dataset.k,+i.value||0]));closeModal();toast('Targets saved');render()}});
}
function backupModal(aid){
 const a=getA(aid),c=getC(a.cid),o=getOp(a.opId);const cands=S.applications.filter(b=>b.opId===a.opId&&b.id!==aid&&!['Employee Ready','Onboarding','Joining','Offer Accepted'].includes(b.stage)).sort((x,y)=>matchA(y).score-matchA(x).score);
 modal({title:`Backup for ${esc(c.name)}`,body:`<p class="small muted" style="margin-top:0">${esc(o.title)} · pick the next-best candidate to keep warm in case ${esc(c.name.split(' ')[0])} doesn't join.</p>
 <label class="f">Backup candidate<select class="inp" id="bkA"><option value="">— none —</option>${cands.map(b=>`<option value="${b.id}" ${a.backup&&a.backup.aid===b.id?'selected':''}>${esc(getC(b.cid).name)} · ${matchA(b).score}% · ${b.stage}</option>`).join('')}</select></label>
 <label class="f" style="margin-top:10px">Backup status<select class="inp" id="bkS">${['Ready','In process','Offered'].map(s=>`<option ${a.backup&&a.backup.status===s?'selected':''}>${s}</option>`).join('')}</select></label>
 ${cands.length?'':'<p class="small" style="color:var(--orange)">No other candidates on this opening yet. Add more applications to name a backup.</p>'}`,
 foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="bkSave">Save</button>`,
 onMount:el=>$('#bkSave',el).onclick=()=>{setBackup(aid,val(el,'#bkA'),val(el,'#bkS'));closeModal();toast('Backup saved');render()}});
}
function dropModal(aid){
 const a=getA(aid),c=getC(a.cid);const b=a.backup&&getA(a.backup.aid);
 modal({title:`${esc(c.name)} dropped out`,body:`<p style="margin-top:0">Mark ${esc(c.name)} as dropped after the offer? The application moves to Rejected and counts in “Dropped after accepting”.</p>${b?`<label class="checkl" style="border:none"><input type="checkbox" class="chk" id="dpPromote" checked><span>Move backup <b>${esc(getC(b.cid).name)}</b> to Selected so you can send them an offer</span></label>`:'<p class="small" style="color:var(--orange)">No backup was named for this seat.</p>'}
 <label class="f" style="margin-top:8px">Reason<input class="inp" id="dpR" placeholder="e.g. Took another offer"></label>`,
 foot:`<button class="btn" data-close>Cancel</button><button class="btn bad" id="dpOK">Mark dropped</button>`,
 onMount:el=>$('#dpOK',el).onclick=()=>{const r=val(el,'#dpR');const pr=$('#dpPromote',el);const {promoted}=recordDropout(aid,{reason:r,promoteBackup:!!(pr&&pr.checked)});
  if(promoted)toast(`${getC(promoted.cid).name} moved to Selected`);else toast(`${c.name} marked dropped`,'var(--red)');closeModal();render()}});
}

/* Dashboard: add Management report tab */
R.dashTab=R.dashTab||'report';
decorateView('dashboard',{view:v=>{const tabs=`<div class="row no-print" style="justify-content:space-between;margin-bottom:6px"><div class="seg dash-tabs" role="tablist"><button class="${R.dashTab==='report'?'on':''}" data-dt="report">Management report</button><button class="${R.dashTab==='today'?'on':''}" data-dt="today">Today</button></div>${R.dashTab==='report'?`<button class="btn" id="rpPrint">${ic('print')}Print / PDF</button>`:''}</div>`;
 if(R.dashTab==='report')return `<div class="page-h"><div><h1>Hiring dashboard · management report</h1><p>${esc(S.settings.company)} · as of ${fmtD(R.rep.date)}</p></div></div>`+tabs+vReport();return tabs+v()},
 bind:(r,b)=>{$$('[data-dt]',r).forEach(x=>x.onclick=()=>{R.dashTab=x.dataset.dt;render()});const p=$('#rpPrint',r);if(p)p.onclick=()=>{$('#printArea').innerHTML=`<h1 style="font-family:Figtree,sans-serif">Hiring dashboard · management report</h1><p>${esc(S.settings.company)} · as of ${fmtD(R.rep.date)}</p>`+vReport();try{window.print()}catch(e){toast('Printing is blocked here. Use the browser menu to print.','var(--orange)')}};
  if(R.dashTab==='report')bindReport(r);else b(r)}});
