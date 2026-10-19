/* Audit log: the admin's read-only list of who changed what and when. Connected mode only. */
"use strict";
const AUDIT={rows:null,error:'',loading:false,table:'',op:'',q:'',limit:100,users:null};
const AUDIT_TABLES=['applications','candidates','candidate_compensation','openings','offers','interviews','tasks','profiles','company_settings'];

function loadAudit(){
 if(AUDIT.loading)return;
 AUDIT.loading=true;
 Promise.all([listAudit({table:AUDIT.table,op:AUDIT.op,rowId:AUDIT.q,limit:AUDIT.limit}),AUDIT.users||listUsers()])
  .then(([rows,users])=>{AUDIT.rows=rows;AUDIT.users=users;AUDIT.error=''})
  .catch(e=>{AUDIT.rows=[];AUDIT.error=e.message})
  .finally(()=>{AUDIT.loading=false;if(R.view==='audit')render()});
}
const auditWho=id=>{const u=(AUDIT.users||[]).find(x=>x.id===id);return u?(u.fullName||u.username):id?'Unknown account':'System'};

function vAudit(){
 if(!isAdmin())return `<div class="empty"><b>No access</b>Only an admin can read the audit log.</div>`;
 if(AUDIT.rows===null){loadAudit();return `<div class="page-h"><div><h1>Audit log</h1><p>Loading…</p></div></div>`}
 const rows=AUDIT.rows.map(r=>`<tr><td class="nowrap small">${esc(new Date(r.at).toLocaleString())}</td><td>${esc(auditWho(r.actor_id))}</td><td>${esc(r.table_name)}</td><td class="small">${esc(r.row_id||'')}</td><td><span class="pill">${esc(r.op)}</span></td><td class="small">${esc(auditSummary(r))}</td></tr>`).join('');
 return `<div class="page-h"><div><h1>Audit log</h1><p>Newest first. Written by the database itself; nobody can edit or delete it. Only admins see this page.</p></div></div>
  <div class="row" style="margin-bottom:10px">
   <select class="inp" id="auT" aria-label="Table" style="width:auto"><option value="">All tables</option>${AUDIT_TABLES.map(t=>`<option value="${t}" ${AUDIT.table===t?'selected':''}>${t}</option>`).join('')}</select>
   <select class="inp" id="auO" aria-label="Kind of change" style="width:auto"><option value="">All changes</option>${['INSERT','UPDATE','DELETE'].map(o=>`<option value="${o}" ${AUDIT.op===o?'selected':''}>${o}</option>`).join('')}</select>
   <input class="inp" id="auQ" placeholder="Record id, e.g. APP-" value="${esc(AUDIT.q)}" style="width:200px"></div>
  ${AUDIT.error?`<div class="auth-err" role="alert">${esc(AUDIT.error)}</div>`:''}
  <section class="panel"><div class="tbl-wrap"><table><thead><tr><th>When</th><th>Who</th><th>Table</th><th>Record</th><th>Change</th><th>Details</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="muted">Nothing recorded for this filter.</td></tr>'}</tbody></table></div></section>
  ${AUDIT.rows.length>=AUDIT.limit?`<p style="margin-top:10px"><button class="btn" id="auMore">Show 100 more</button></p>`:''}`;
}
function bindAudit(root){
 if(!$('#auT',root))return;   // loading or no-access screen
 const reload=()=>{AUDIT.rows=null;render()};
 $('#auT',root).onchange=e=>{AUDIT.table=e.target.value;AUDIT.limit=100;reload()};
 $('#auO',root).onchange=e=>{AUDIT.op=e.target.value;AUDIT.limit=100;reload()};
 $('#auQ',root).onchange=e=>{AUDIT.q=e.target.value.trim();AUDIT.limit=100;reload()};
 const more=$('#auMore',root);if(more)more.onclick=()=>{AUDIT.limit+=100;reload()};
}

VIEWS.audit=[vAudit,bindAudit];
addNav(['audit','Audit log','list',()=>CONNECTED&&isAdmin()],'users');
