/* The recruiter-wise call report panel of the dashboard: a day, a week or a month; one line per recruiter, engaged and a count per call status */
"use strict";
// management and admin read it (recruiters keep their own work in the Applications list)
const canSeeCallReport=()=>!CONNECTED||!ME||['admin','management'].includes(ME.role);
function callReportPanel(){
 if(!canSeeCallReport())return '';
 const st=CALL_REPORT,range=callReportRange(st.period,st.date);
 const rows=callReportRows();
 const label=range.from===range.to?fmtD(range.from):fmtD(range.from)+' to '+fmtD(range.to);
 let body;
 if(st.error)body=`<div class="empty"><b>Could not load the report</b>${esc(st.error)}<div style="margin-top:10px"><button class="btn sm" id="crRefresh">Try again</button></div></div>`;
 else if(rows===null)body=CONNECTED?'<div class="empty">Loading the calls…</div>':'<div class="empty"><b>No calls to show here</b>The calls recruiters log are kept in the live database, so this report fills in there.</div>';
 else{
  const p=pivotCallReport(rows);
  const cell=n=>n?`<td class="num">${n}</td>`:'<td class="num muted">·</td>';
  body=p.recruiters.length?`<div class="tbl-wrap"><table class="rt"><thead><tr><th>Recruiter</th><th class="num">Engaged</th>${p.statuses.map(s=>`<th class="num" style="white-space:normal;min-width:78px">${esc(s)}</th>`).join('')}</tr></thead><tbody>
   ${p.recruiters.map(r=>`<tr><td><b>${esc(r.name)}</b></td><td class="num"><b>${r.engaged}</b></td>${p.statuses.map(s=>cell(r.by[s])).join('')}</tr>`).join('')}
   <tr style="border-top:2px solid var(--line)"><td><b>All recruiters</b></td><td class="num"><b>${p.totals.engaged}</b></td>${p.statuses.map(s=>cell(p.totals.by[s])).join('')}</tr></tbody></table></div>`
   :'<div class="empty"><b>No calls logged for this period</b>Calls appear here when recruiters set a Call status via app on a lead.</div>';
 }
 return `<section class="panel" id="crPanel" style="margin-bottom:16px"><header><div><h3>Recruiter-wise calls</h3><p>${esc(label)} · engaged is every call logged with a status other than NA</p></div>
  <div class="row no-print"><div class="seg">${[['day','Daily'],['week','Weekly'],['month','Monthly']].map(x=>`<button class="${st.period===x[0]?'on':''}" data-crp="${x[0]}">${x[1]}</button>`).join('')}</div>
  <input type="date" class="inp" id="crDate" value="${esc(st.date)}" aria-label="Date" style="width:150px">
  <select class="inp" id="crOp" aria-label="Opening" style="width:190px"><option value="">All openings</option>${S.openings.map(o=>`<option value="${esc(o.id)}" ${o.id===st.opening?'selected':''}>${esc(o.title)}</option>`).join('')}</select>
  ${CONNECTED?`<button class="btn sm ghost" id="crRefresh">Refresh</button>`:''}</div></header>${body}</section>`;
}
function bindCallReport(root){
 const st=CALL_REPORT;
 $$('[data-crp]',root).forEach(b=>b.onclick=()=>{st.period=b.dataset.crp;st.error='';render()});
 const d=$('#crDate',root);if(d)d.onchange=()=>{if(d.value){st.date=d.value;st.error=''}render()};
 const o=$('#crOp',root);if(o)o.onchange=()=>{st.opening=o.value;st.error='';render()};
 const r=$('#crRefresh',root);if(r)r.onclick=()=>{callReportRefresh();render()};
}
onEvent('callreport:ready',()=>{if(R.view==='dashboard')render()});
