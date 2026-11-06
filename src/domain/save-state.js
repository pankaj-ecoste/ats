/* What the small word in the top bar says about saving. Pure: the screen only shows what this returns. */
"use strict";
// failing: a change was refused or could not be sent; pending: changes waiting to be saved; online: the browser has a connection
function saveStateOf({failing=false,pending=0,online=true}={}){
 if(failing)return {key:'bad',text:'Not saved',hint:'A change could not be saved. Reload the page to see what is saved.'};
 if(!online)return {key:'bad',text:pending>0?`Offline · ${pending} waiting`:'Offline',hint:'There is no connection. Changes stay in this window and are saved when it returns. Do not close the tab.'};
 if(pending>0)return {key:'busy',text:'Saving…',hint:'Your changes are being saved.'};
 return {key:'ok',text:'All saved',hint:'Everything you did is saved.'};
}
