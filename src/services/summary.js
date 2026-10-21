/* Draft summary of an application, written by Claude through the /api/summary function on the hosting. Connected mode only. */
"use strict";
// whether the Summary button is offered: connected, staff, and an admin has switched it on in Settings
const summaryOn=()=>CONNECTED&&canEdit()&&!!S.settings.modelSummary;
async function requestSummary(aid){
 const {data}=await sb.auth.getSession();
 const token=data&&data.session&&data.session.access_token;
 if(!token)throw new Error('Please sign in again.');
 let r;
 try{r=await fetch('/api/summary',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({applicationId:aid})})}
 catch{throw new Error('Cannot reach the summary service. Check your internet connection.')}
 const j=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(j.error||'The summary service is not available here. It works on the hosted app.');
 return j.summary;
}
