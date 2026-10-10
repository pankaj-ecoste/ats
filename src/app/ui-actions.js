/* Buttons in the markup say WHAT to do: <button data-act="openingForm" data-a1="OP-1001">.
   The table below says HOW. One click listener runs them, so no markup calls a global function by name.
   Capture phase keeps the old order: the button's action runs before any row or card handler around it. */
"use strict";
registerAction('go',(view,param)=>go(view,param));
registerAction('addCandidate',opId=>addCandidate(opId));
registerAction('openingForm',id=>openingForm(id));
registerAction('scheduleGI',opId=>scheduleGI(opId));
registerAction('schedulePI',aid=>schedulePI(aid));
registerAction('taskForm',()=>taskForm());
registerAction('pickForOffer',()=>pickForOffer());
registerAction('showTodayCalendar',()=>{R.calView='day';R.calDate=today();go('interviews')});
registerAction('openingApplicationsBoard',opId=>{R.af.op=opId;R.appView='board';go('applications')});

registerAction('changePassword',()=>{closeDD();changePasswordModal()});
registerAction('signOut',()=>{closeDD();doSignOut()});
registerAction('userNew',()=>newUserModal());
registerAction('userReset',id=>resetPasswordModal(id));
registerAction('userToggle',id=>toggleUser(id));

document.addEventListener('click',e=>{
 const el=e.target.closest('[data-act]');
 if(!el||el.disabled)return;
 runAction(el.dataset.act,[el.dataset.a1,el.dataset.a2].filter(a=>a!==undefined));
},true);
