/* Activity log and notifications. DOM-free. */
"use strict";
function log(text,type='info',appId){
 repo.insert('activity',{ts:Date.now(),text,type,appId});
 repo.trim('activity',300);
}
// to: the names to tell (blanks and repeats ignored). Left out, it is the person who is signed in.
// Their own notification joins this browser's list; everyone else's is sent on (and reaches them when they next load).
function notify(text,goArgs=['dashboard'],to){
 const me=S.settings.user,who=[...new Set(to===undefined?[me]:to.filter(Boolean))];
 const make=()=>({id:crypto.randomUUID(),text,ts:Date.now(),read:false,go:goArgs});
 if(who.includes(me))repo.insert('notifications',make());
 who.filter(n=>n!==me).forEach(n=>repo.send('notifications',n,make()));
}
// returns the notification so the caller can navigate to n.go
function markNotificationRead(id){return repo.update('notifications',id,{read:true})}
function markAllNotificationsRead(){S.notifications.filter(n=>!n.read).forEach(n=>repo.update('notifications',n.id,{read:true}))}
