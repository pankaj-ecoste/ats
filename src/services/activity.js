/* Activity log and notifications. DOM-free. */
"use strict";
function log(text,type='info',appId){
 repo.insert('activity',{ts:Date.now(),text,type,appId});
 repo.trim('activity',300);
}
function notify(text,goArgs=['dashboard']){
 repo.insert('notifications',{id:Date.now()+Math.random(),text,ts:Date.now(),read:false,go:goArgs});
}
// returns the notification so the caller can navigate to n.go
function markNotificationRead(id){return repo.update('notifications',id,{read:true})}
function markAllNotificationsRead(){S.notifications.filter(n=>!n.read).forEach(n=>repo.update('notifications',n.id,{read:true}))}
