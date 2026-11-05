/* An opening's "Application form" tab: which of the usual questions the form asks, and the recruiter's own extra questions.
   The form is the app's own careers page (careers.html#OP-ID). The answers to the extra questions are kept on the application and shown on the candidate's page. */
"use strict";
const AF={op:null,draft:null};

// the draft being edited for this opening (started from the saved form; kept while the page redraws)
function afDraft(o){if(AF.op!==o.id||!AF.draft){AF.op=o.id;AF.draft=formOf(o)}return AF.draft}
const afChanged=o=>JSON.stringify(formToStore(afDraft(o)))!==JSON.stringify(formToStore(formOf(o)));

function afQuestion(q,i,n){
 return `<div class="panel" style="padding:12px;margin:0 0 10px"><div class="fgrid">
  <label class="f full">Question ${i+1}<input class="inp" data-af-label="${i}" value="${esc(q.label)}" maxlength="200" placeholder="For example: Do you have a bike?"></label>
  <label class="f">Answer<select class="inp" data-af-type="${i}">${FORM_TYPES.map(([v,l])=>`<option value="${v}" ${q.type===v?'selected':''}>${l}</option>`).join('')}</select></label>
  <label class="checkl" style="align-self:end"><input type="checkbox" data-af-req="${i}" ${q.required?'checked':''}> Must be answered</label>
  ${q.type==='choice'?`<label class="f full">Options <span class="muted small">(one per line, two to ${FORM_MAX_OPTIONS})</span><textarea class="inp" rows="4" data-af-opts="${i}">${esc(q.options.join('\n'))}</textarea></label>`:''}
 </div><div class="row" style="margin-top:8px"><button class="btn sm" data-af-up="${i}" ${i===0?'disabled':''}>Move up</button><button class="btn sm" data-af-down="${i}" ${i===n-1?'disabled':''}>Move down</button><span class="grow"></span><button class="btn sm bad" data-af-del="${i}">Remove</button></div></div>`;
}

function appFormTab(o){
 const d=afDraft(o),changed=afChanged(o);
 const usual=`<section class="panel"><header><div><h3>Usual questions</h3><p>Untick a question this form does not need. A short form gets more people to finish it.</p></div></header><div class="pbody">
  <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:10px"><span class="pill">Name</span><span class="pill">Email</span><span class="pill">Mobile number</span><span class="pill">Consent</span><span class="small muted">always asked: the person is found again by these</span></div>
  <div class="fgrid" style="gap:4px 16px">${FORM_FIELDS.map(f=>`<label class="checkl"><input type="checkbox" data-af-field="${f.key}" ${d.hide.includes(f.key)?'':'checked'}> ${esc(f.label)}</label>`).join('')}</div></div></section>`;
 const own=`<section class="panel" style="margin-top:16px"><header><div><h3>Your own questions</h3><p>Asked after the usual ones. The answers are kept with the application and shown on the candidate's page under "Form answers".</p></div>
  <button class="btn" id="afAdd" ${d.questions.length>=FORM_MAX_QUESTIONS?'disabled':''}>${ic('plus')}Add a question</button></header><div class="pbody">
  ${d.questions.length?d.questions.map((q,i)=>afQuestion(q,i,d.questions.length)).join(''):'<p class="muted" style="margin:0">No question of your own yet.</p>'}</div></section>`;
 const link=ownFormLink(o,'');
 const bar=`<div class="row" style="margin-top:16px;flex-wrap:wrap"><button class="btn pri" id="afSave" ${changed?'':'disabled'}>Save the form</button><button class="btn" id="afReset" ${changed?'':'disabled'}>Discard changes</button>
  ${link?`<a class="btn" href="${esc(link)}" target="_blank" rel="noopener">Test the form</a>`:''}<span class="small muted">${changed?'You have changes that are not saved.':'Saved. The form is live for people who apply.'}</span></div>
  <p class="small muted" style="margin:10px 0 0">This is the form people see on <b>careers.html</b>, including through the links on the Job posting screen. A form of the company's own, set in Posting settings, is not affected.</p>`;
 return usual+own+bar;
}

function bindAppForm(root){
 if(!CONNECTED||R.tab!=='form')return;
 const o=getOp(R.param);if(!o)return;
 const d=afDraft(o),at=(s,a)=>$$(`[${a}]`,root).forEach(e=>s(e,+e.getAttribute(a)));
 const mark=()=>{const c=afChanged(o);const s=$('#afSave',root),r=$('#afReset',root);if(s)s.disabled=!c;if(r)r.disabled=!c};
 $$('[data-af-field]',root).forEach(c=>c.onchange=()=>{const k=c.dataset.afField;d.hide=d.hide.filter(x=>x!==k);if(!c.checked)d.hide.push(k);mark()});
 at((e,i)=>e.oninput=()=>{d.questions[i].label=e.value;mark()},'data-af-label');
 at((e,i)=>e.onchange=()=>{d.questions[i].required=e.checked;mark()},'data-af-req');
 at((e,i)=>e.oninput=()=>{d.questions[i].options=e.value.split('\n');mark()},'data-af-opts');
 at((e,i)=>e.onchange=()=>{d.questions[i].type=e.value;render()},'data-af-type');
 at((e,i)=>e.onclick=()=>{if(i>0){[d.questions[i-1],d.questions[i]]=[d.questions[i],d.questions[i-1]];render()}},'data-af-up');
 at((e,i)=>e.onclick=()=>{if(i<d.questions.length-1){[d.questions[i+1],d.questions[i]]=[d.questions[i],d.questions[i+1]];render()}},'data-af-down');
 at((e,i)=>e.onclick=()=>{d.questions.splice(i,1);render()},'data-af-del');
 const on=(sel,fn)=>{const e=$(sel,root);if(e)e.onclick=fn};
 on('#afAdd',()=>{if(d.questions.length<FORM_MAX_QUESTIONS){d.questions.push(newQuestion(d.questions));render()}});
 on('#afReset',()=>{AF.draft=null;render()});
 on('#afSave',()=>{
  const problem=formProblem(d);if(problem){toast(problem,'var(--red)');return}
  saveOpening({form:formToStore(d)},o.id);AF.draft=null;toast('Application form saved');render();
 });
}
onBind('opening',bindAppForm);
