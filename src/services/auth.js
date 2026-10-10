/* Signing in and managing accounts. Talks to Supabase Auth and the admin functions from migration 0005. No DOM.
   People sign in with a username and a password an admin set. Behind the scenes the username becomes <username>@ats.ecoste.in. */
"use strict";
const LOGIN_DOMAIN='ats.ecoste.in';
const ASSIGNABLE_ROLES=['admin','recruiter','hiring_manager','interviewer','management'];
const ROLE_LABEL={admin:'Admin',recruiter:'Recruiter',hiring_manager:'Hiring manager',interviewer:'Interviewer',management:'Management',pending:'Waiting for approval'};
let ME=null;   // who is signed in: {id, username, fullName, role, active}, or null

const loginEmail=username=>String(username||'').trim().toLowerCase()+'@'+LOGIN_DOMAIN;
const isAdmin=()=>!!ME&&ME.role==='admin'&&ME.active;

// turns what Supabase says into a sentence a person can act on
function authError(e){
 const m=String((e&&e.message)||e||'');
 if(/invalid login credentials/i.test(m))return new Error('Wrong username or password.');
 if(/banned|user is banned/i.test(m))return new Error('This account is switched off. Ask an admin.');
 if(/failed to fetch|network|load failed/i.test(m))return new Error('Cannot reach the server. Check your internet connection and try again.');
 if(/same password|different from the old/i.test(m))return new Error('Choose a password that is different from the old one.');
 if(/rate limit|too many/i.test(m))return new Error('Too many attempts. Wait a minute and try again.');
 return new Error(m||'Something went wrong. Please try again.');
}

// the signed-in person and their role, or null when nobody is signed in
async function currentUser(){
 const {data:{session}}=await sb.auth.getSession();
 if(!session){ME=null;return null}
 const {data,error}=await sb.from('profiles').select('id,username,full_name,role,active').eq('id',session.user.id).maybeSingle();
 if(error)throw authError(error);
 if(!data){ME=null;return null}
 ME={id:data.id,username:data.username,fullName:data.full_name||data.username,role:data.role,active:data.active};
 return ME;
}
async function signIn(username,password){
 if(!String(username||'').trim()||!password)throw new Error('Enter your username and password.');
 const r=await sb.auth.signInWithPassword({email:loginEmail(username),password});
 if(r.error)throw authError(r.error);
 return currentUser();
}
async function signOut(){
 ME=null;
 await sb.auth.signOut();
}
async function changeOwnPassword(newPassword){
 if(String(newPassword||'').length<8)throw new Error('The password must be at least 8 characters.');
 const r=await sb.auth.updateUser({password:newPassword});
 if(r.error)throw authError(r.error);
}

/* ---------- what an admin does (the database refuses everyone else) ---------- */
async function listUsers(){
 const {data,error}=await sb.from('profiles').select('id,username,full_name,role,active,created_at').order('username');
 if(error)throw authError(error);
 return data.map(p=>({id:p.id,username:p.username,fullName:p.full_name||p.username,role:p.role,active:p.active,createdAt:p.created_at}));
}
async function createUser({username,password,fullName,role}){
 const r=await sb.rpc('admin_create_user',{p_username:username,p_password:password,p_full_name:fullName||'',p_role:role});
 if(r.error)throw authError(r.error);
 return r.data;
}
async function resetUserPassword(userId,password){
 const r=await sb.rpc('admin_set_password',{p_user:userId,p_password:password});
 if(r.error)throw authError(r.error);
}
async function setUserActive(userId,active){
 const r=await sb.rpc('admin_set_active',{p_user:userId,p_active:active});
 if(r.error)throw authError(r.error);
}
async function setUserRole(userId,role){
 const r=await sb.from('profiles').update({role}).eq('id',userId).select('id');
 if(r.error)throw authError(r.error);
 if(!r.data||!r.data.length)throw new Error('The role was not changed. You may not have permission.');
}
async function renameUser(userId,fullName){
 const r=await sb.from('profiles').update({full_name:String(fullName||'').trim()}).eq('id',userId).select('id');
 if(r.error)throw authError(r.error);
}

// a readable random password: no look-alike characters (0 O 1 l I), 12 long
function generatePassword(length=12){
 const letters='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
 const bytes=new Uint8Array(length);
 crypto.getRandomValues(bytes);
 return [...bytes].map(b=>letters[b%letters.length]).join('');
}
