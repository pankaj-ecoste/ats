/* Tasks */
/* ---------- tasks ---------- */
function taskForm(pre={}){
 modal({title:'New task',body:`<div class="fgrid"><label class="f full">Task<input class="inp" id="tt" value="${esc(pre.title||'')}" placeholder="What needs doing?"></label><label class="f">Due<input class="inp" type="date" id="td" value="${pre.due||TODAY}"></label>
 <label class="f">Priority<select class="inp" id="tp">${['Low','Medium','High'].map(p=>`<option ${p===(pre.priority||'Medium')?'selected':''}>${p}</option>`).join('')}</select></label>
 <label class="f">Related to<select class="inp" id="tr">${['General','Onboarding',...S.openings.map(o=>o.title)].map(x=>`<option ${x===pre.related?'selected':''}>${esc(x)}</option>`).join('')}</select></label>
 <label class="f">Owner<select class="inp" id="to">${RECRUITERS.concat(INTERVIEWERS).map(x=>`<option ${x===S.settings.user?'selected':''}>${x}</option>`).join('')}</select></label></div>`,
 foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="tS">Add task</button>`,
 onMount:el=>$('#tS',el).onclick=()=>{const t=val(el,'#tt');if(!t){toast('Describe the task','var(--red)');return}S.tasks.unshift({id:uid('T'),title:t,due:val(el,'#td'),priority:val(el,'#tp'),related:val(el,'#tr'),owner:val(el,'#to'),done:false});save();closeModal();toast('Task added');refresh()}});
}
function vTasks(){
 const f=R.taskFilter;const l=S.tasks.filter(t=>f==='All'||(f==='Open'&&!t.done)||(f==='Done'&&t.done)||(f==='Overdue'&&!t.done&&t.due<TODAY)||(f==='Today'&&!t.done&&t.due===TODAY)).sort((a,b)=>a.done-b.done||a.due.localeCompare(b.due));
 return `<div class="page-h"><div><h1>Tasks</h1><p>${S.tasks.filter(t=>!t.done).length} open · ${S.tasks.filter(t=>!t.done&&t.due<TODAY).length} overdue</p></div><button class="btn pri" onclick="taskForm()">${ic('plus')}New task</button></div>
 <section class="panel"><div class="filters"><div class="seg">${['Open','Today','Overdue','Done','All'].map(x=>`<button class="${f===x?'on':''}" data-tf="${x}">${x}</button>`).join('')}</div></div>
 ${l.map(t=>`<div class="list-it"><input type="checkbox" class="chk" data-task="${t.id}" ${t.done?'checked':''} aria-label="Complete task"><div class="grow" style="${t.done?'text-decoration:line-through;color:var(--tx3)':''}"><b style="font-weight:600">${esc(t.title)}</b><div class="muted small">${esc(t.related)} · ${esc(t.owner)}</div></div><span class="pill ${t.priority==='High'?'red':t.priority==='Medium'?'orange':''}">${t.priority}</span><span class="small" style="min-width:90px;text-align:right;${!t.done&&t.due<TODAY?'color:var(--red);font-weight:600':''}">${t.due===TODAY?'Today':fmtDs(t.due)}</span><button class="btn sm ghost" data-tdel="${t.id}" aria-label="Delete task">${ic('x')}</button></div>`).join('')||'<div class="empty"><b>Nothing here</b>You\'re clear for now.</div>'}</section>`;
}
function bindTasks(root){$$('[data-tf]',root).forEach(b=>b.onclick=()=>{R.taskFilter=b.dataset.tf;render()});$$('[data-task]',root).forEach(cb=>cb.onchange=()=>{S.tasks.find(t=>t.id===cb.dataset.task).done=cb.checked;save();render()});$$('[data-tdel]',root).forEach(b=>b.onclick=()=>{S.tasks=S.tasks.filter(t=>t.id!==b.dataset.tdel);save();render()})}
