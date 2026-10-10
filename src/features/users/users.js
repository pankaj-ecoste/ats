/* Users: the admin's screen for accounts (create, reset password, change role, switch on or off). Connected mode only. */
"use strict";
const USERS={list:null,error:'',loading:false};

function loadUsers(){
 if(USERS.loading)return;
 USERS.loading=true;
 listUsers().then(l=>{USERS.list=l;USERS.error=''}).catch(e=>{USERS.list=[];USERS.error=e.message})
  .finally(()=>{USERS.loading=false;if(R.view==='users')render()});
}
const userOf=id=>(USERS.list||[]).find(u=>u.id===id);
// run an admin action, show what went wrong in plain words, and reload the list
async function adminDo(fn,done){
 try{await fn();USERS.list=null;if(done)toast(done);render()}
 catch(e){toast(e.message,'var(--red)');USERS.list=null;render()}
}

function vUsers(){
 if(!isAdmin())return `<div class="empty"><b>No access</b>Only an admin can manage accounts.</div>`;
 if(USERS.list===null){loadUsers();return `<div class="page-h"><div><h1>Users</h1><p>Loading…</p></div></div>`}
 const rows=USERS.list.map(u=>{const me=u.id===ME.id;
  return `<tr><td><b>${esc(u.username)}</b>${me?' <span class="pill">you</span>':''}</td><td>${esc(u.fullName)}</td>
   <td><select class="inp" data-urole="${u.id}" aria-label="Role of ${esc(u.username)}" style="width:auto;padding:5px 8px" ${me?'disabled title="You cannot change your own role"':''}>${[...new Set([u.role,...ASSIGNABLE_ROLES])].map(r=>`<option value="${r}" ${r===u.role?'selected':''}>${ROLE_LABEL[r]}</option>`).join('')}</select></td>
   <td><span class="pill ${u.active?'green':'red'}">${u.active?'Active':'Switched off'}</span></td>
   <td class="nowrap"><button class="btn sm" data-act="userReset" data-a1="${u.id}">Reset password</button>
    ${me?'':`<button class="btn sm ${u.active?'bad':''}" data-act="userToggle" data-a1="${u.id}">${u.active?'Switch off':'Switch on'}</button>`}</td></tr>`}).join('');
 return `<div class="page-h"><div><h1>Users</h1><p>${USERS.list.filter(u=>u.active).length} active · ${USERS.list.length} accounts. Only admins see this page.</p></div><button class="btn pri" data-act="userNew">${ic('plus')}Add user</button></div>
  ${USERS.error?`<div class="auth-err" role="alert">${esc(USERS.error)}</div>`:''}
  <section class="panel"><div class="tbl-wrap"><table><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>
  <p class="small muted" style="margin-top:12px">Switching an account off signs the person out and stops them seeing any data. A password reset signs them out too.</p>`;
}
function bindUsers(root){
 $$('[data-urole]',root).forEach(s=>s.onchange=()=>adminDo(()=>setUserRole(s.dataset.urole,s.value),'Role changed'));
}

/* ---------- dialogs ---------- */
// shown once after a password is set, so the admin can pass it on
function credentialsBody(username,password,intro){
 return `<p style="margin-top:0">${esc(intro)}</p><dl class="kv"><dt>Username</dt><dd><b>${esc(username)}</b></dd><dt>Password</dt><dd><b style="font-family:ui-monospace,Menlo,monospace">${esc(password)}</b></dd></dl>
  <p class="small muted">This is the only time the password is shown. They can change it after signing in (account menu, top right).</p>`;
}
function showCredentials(el,username,password,intro){
 $('.mb',el).innerHTML=credentialsBody(username,password,intro);
 const foot=$('footer',el.querySelector('.modal'));
 foot.innerHTML=`<button class="btn" id="cpy">Copy username and password</button><span class="grow"></span><button class="btn pri" data-close>Done</button>`;
 $$('[data-close]',el).forEach(b=>b.onclick=()=>closeModal());
 $('#cpy',el).onclick=()=>copyText(`Username: ${username}\nPassword: ${password}`).then(ok=>toast(ok?'Copied':'Copy blocked. Select the text and press Ctrl+C.',ok?'var(--green)':'var(--orange)'));
}

function newUserModal(){
 modal({title:'Add user',body:`<div class="fgrid"><label class="f">Username<input class="inp" id="nuU" autocapitalize="none" spellcheck="false" placeholder="e.g. priya"></label>
  <label class="f">Full name<input class="inp" id="nuN" placeholder="e.g. Priya Sharma"></label>
  <label class="f">Role<select class="inp" id="nuR">${ASSIGNABLE_ROLES.map(r=>`<option value="${r}" ${r==='recruiter'?'selected':''}>${ROLE_LABEL[r]}</option>`).join('')}</select></label>
  <label class="f">Password<div class="row" style="gap:6px"><input class="inp" id="nuP" value="${esc(generatePassword())}" spellcheck="false"><button class="btn sm" type="button" id="nuG">New</button></div></label></div>
  <p class="small muted">Username: 3 to 30 letters, digits, dot, dash or underscore. Password: at least 8 characters.</p><div class="auth-err" id="nuE" role="alert"></div>`,
  foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="nuS">Create account</button>`,
  onMount:el=>{
   $('#nuG',el).onclick=()=>{$('#nuP',el).value=generatePassword()};
   $('#nuS',el).onclick=async()=>{
    const username=$('#nuU',el).value.trim().toLowerCase(),password=$('#nuP',el).value;
    try{
     await createUser({username,password,fullName:$('#nuN',el).value.trim(),role:$('#nuR',el).value});
     USERS.list=null;render();
     showCredentials(el,username,password,'Account created. Give them these details.');
    }catch(ex){$('#nuE',el).textContent=ex.message}
   };
  }});
}

function resetPasswordModal(id){
 const u=userOf(id);if(!u)return;
 modal({title:`Reset password · ${esc(u.username)}`,body:`<p style="margin-top:0">Set a new password for <b>${esc(u.fullName)}</b>. They are signed out everywhere and use the new one next time.</p>
  <label class="f">New password<div class="row" style="gap:6px"><input class="inp" id="rpP" value="${esc(generatePassword())}" spellcheck="false"><button class="btn sm" type="button" id="rpG">New</button></div></label>
  <div class="auth-err" id="rpE" role="alert"></div>`,
  foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="rpS">Reset password</button>`,
  onMount:el=>{
   $('#rpG',el).onclick=()=>{$('#rpP',el).value=generatePassword()};
   $('#rpS',el).onclick=async()=>{
    const password=$('#rpP',el).value;
    try{await resetUserPassword(id,password);showCredentials(el,u.username,password,'Password changed. Give them the new details.')}
    catch(ex){$('#rpE',el).textContent=ex.message}
   };
  }});
}

function toggleUser(id){
 const u=userOf(id);if(!u)return;
 if(u.active)confirmBox(`Switch off ${esc(u.username)}`,`${esc(u.fullName)} will be signed out and cannot sign in or see any data until you switch the account on again.`,'Switch off',()=>adminDo(()=>setUserActive(id,false),'Account switched off'),true);
 else adminDo(()=>setUserActive(id,true),'Account switched on');
}

VIEWS.users=[vUsers,bindUsers];
addNav(['users','Users','users',()=>CONNECTED&&isAdmin()],'settings');
