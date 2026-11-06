/* The recruiter-wise call report from the database (migration 0035). Connected mode only: the calls are kept in the live database.
   What is chosen on the screen, and the answers already fetched, live here. */
"use strict";
const CALL_REPORT={period:'day',date:today(),opening:'',cache:{},asking:{},error:''};
const CALL_REPORT_TTL=60000;   // an answer this old is asked for again
const callReportKey=(range,opening)=>`${range.from}|${range.to}|${opening||''}`;
// the rows for the chosen period if they are here and fresh; otherwise null, and (connected) a request goes out and the screen is told when it arrives (event callreport:ready)
function callReportRows(){
 const st=CALL_REPORT,range=callReportRange(st.period,st.date),key=callReportKey(range,st.opening),hit=st.cache[key];
 if(hit&&(!CONNECTED||Date.now()-hit.at<CALL_REPORT_TTL))return hit.rows;
 if(!CONNECTED||!sb||st.asking[key]||st.error)return hit?hit.rows:null;
 st.asking[key]=true;
 sb.rpc('call_report',{p_from:range.from,p_to:range.to,p_opening:st.opening||null}).then(({data,error})=>{
  st.asking[key]=false;
  if(error)st.error=authError(error).message;else{st.error='';st.cache[key]={at:Date.now(),rows:data||[]}}
  emitEvent('callreport:ready');
 },e=>{st.asking[key]=false;st.error=authError(e).message;emitEvent('callreport:ready')});
 return hit?hit.rows:null;
}
// ask again (the button on the panel): forget what was fetched
function callReportRefresh(){CALL_REPORT.cache={};CALL_REPORT.error=''}
