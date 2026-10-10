/* Sign-in screen, the account menu, change password. Only used when the app is connected to Supabase (see core/supabase.js). */
"use strict";
let signingOut=false;

/* ---------- the screen shown instead of the app ---------- */
function authRoot(){
 let el=$('#auth');
 if(!el){el=document.createElement('div');el.id='auth';el.className='auth';document.body.appendChild(el)}
 return el;
}
function hideAuth(){
 document.body.classList.remove('signed-out');
 const el=$('#auth');if(el)el.innerHTML='';
}
function showLogin(message=''){
 document.body.classList.add('signed-out');
 const el=authRoot();
 el.innerHTML=`<form class="auth-card" id="loginForm" autocomplete="on">
  <div class="auth-logo"><img src="${LOGO_SRC}" alt="Ecoste"></div>
  <h1>Sign in</h1><p class="muted">Use the username and password your admin gave you.</p>
  <label class="f">Username<input class="inp" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
  <label class="f">Password<input class="inp" type="password" name="password" autocomplete="current-password" required></label>
  <div class="auth-err" id="authErr" role="alert">${esc(message)}</div>
  <button class="btn pri" type="submit" id="loginBtn">Sign in</button>
  <p class="small muted">Forgot your password? Ask an admin to reset it.</p></form>`;
 const f=$('#loginForm',el);
 f.username.focus();
 f.onsubmit=async e=>{
  e.preventDefault();
  const btn=$('#loginBtn',el),err=$('#authErr',el);
  btn.disabled=true;btn.textContent='Signing in…';err.textContent='';
  try{enterApp(await signIn(f.username.value,f.password.value))}
  catch(ex){err.textContent=ex.message;btn.disabled=false;btn.textContent='Sign in';f.password.value='';f.password.focus()}
 };
}
// someone is signed in but cannot use the app yet
function showHold(message){
 document.body.classList.add('signed-out');
 authRoot().innerHTML=`<div class="auth-card"><div class="auth-logo"><img src="${LOGO_SRC}" alt="Ecoste"></div>
  <h1>${esc(ME?ME.fullName:'')}</h1><p>${esc(message)}</p><button class="btn" data-act="signOut">Sign out</button></div>`;
}

function enterApp(me){
 if(!me)return showLogin();
 if(!me.active)return showHold('This account is switched off. Ask an admin.');
 if(me.role==='pending')return showHold('Your account is waiting for an admin to give it a role. Ask an admin, then sign in again.');
 hideAuth();
 if(S.settings.user!==me.fullName)updateSetting('user',me.fullName);   // notes and tasks carry the real name
 R.view='dashboard';R.param=null;
 render();
}

async function bootAuth(){
 // when the sign-in ends somewhere else (expired, revoked), go back to the sign-in screen
 sb.auth.onAuthStateChange(ev=>{
  if(ev==='SIGNED_OUT'&&!signingOut&&!document.body.classList.contains('signed-out')){ME=null;showLogin('You were signed out. Please sign in again.')}
 });
 try{enterApp(await currentUser())}
 catch(e){showLogin(e.message)}
}

async function doSignOut(){
 signingOut=true;
 try{await signOut()}catch(e){/* the screen changes either way */}
 signingOut=false;
 showLogin();
}

/* ---------- change my own password ---------- */
function changePasswordModal(){
 modal({title:'Change password',body:`<div class="fgrid"><label class="f full">New password<input class="inp" type="password" id="pw1" autocomplete="new-password"></label>
  <label class="f full">Type it again<input class="inp" type="password" id="pw2" autocomplete="new-password"></label></div>
  <p class="small muted">At least 8 characters. You stay signed in.</p><div class="auth-err" id="pwErr" role="alert"></div>`,
  foot:`<button class="btn" data-close>Cancel</button><button class="btn pri" id="pwSave">Change password</button>`,
  onMount:el=>{
   const err=$('#pwErr',el);
   $('#pwSave',el).onclick=async()=>{
    const a=$('#pw1',el).value,b=$('#pw2',el).value;
    if(a!==b){err.textContent='The two passwords are not the same.';return}
    try{await changeOwnPassword(a);closeModal();toast('Password changed')}
    catch(ex){err.textContent=ex.message}
   };
  }});
}
