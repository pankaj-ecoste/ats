/* Report totals counted by the database (migration 0016). Connected mode only; demo mode counts in the browser. */
"use strict";
const REPORT_COUNTS={byRange:{},asking:{}};
const REPORT_COUNTS_TTL=30000;
// the totals for a date range if they are fresh; otherwise null, and a quiet request goes out (the screen is told when it arrives)
function reportCountsFor(a,b){
 if(!CONNECTED||!sb)return null;
 const k=a+'|'+b,hit=REPORT_COUNTS.byRange[k];
 if(hit&&Date.now()-hit.at<REPORT_COUNTS_TTL)return hit.counts;
 if(!REPORT_COUNTS.asking[k]){
  REPORT_COUNTS.asking[k]=true;
  sb.rpc('report_counts',{p_from:a,p_to:b}).then(({data,error})=>{
   REPORT_COUNTS.asking[k]=false;
   if(!error&&data){REPORT_COUNTS.byRange[k]={at:Date.now(),counts:data};emitEvent('report:counts',{from:a,to:b})}
  },()=>{REPORT_COUNTS.asking[k]=false});
 }
 return null;
}
