/* The brief marketing gets when a recruiter asks for an ad: plain text built from the opening. DOM-free. */
"use strict";
// o: the opening. to: the name greeted. from: who signs it. withSalary: only when the recruiter ticked it.
function adBrief(o,{to='',from='',withSalary=false}={}){
 const a=o.ad||{};
 const list=l=>(l&&l.length)?l.join(', '):'';
 const money=n=>'₹'+Number(n).toLocaleString('en-IN');
 const about=String(o.desc||'').replace(/\s+/g,' ').trim().slice(0,500);   // keeps the mail link short enough for email apps
 const rows=[
  ['Position',o.title],['Opening ID',o.id],['Department',o.dept],['Positions open',o.positions],
  ['Location',[o.location,o.mode?'('+o.mode+')':''].filter(Boolean).join(' ')],['Employment type',o.type],
  ['Experience',o.expMin==null?'':o.expMin+' to '+o.expMax+' years'],['Education',o.education],
  ['Mandatory skills',list(o.mandatory)],['Preferred skills',list(o.preferred)],
  ...(withSalary&&o.salMax?[['Salary range',o.salMin+' to '+o.salMax+' LPA']]:[]),
  ['Target joining',o.target?fmtD(o.target):''],
  ['Budget',a.budget==null?'':money(a.budget)],['Platform',a.platform||''],
 ].filter(r=>r[1]!==''&&r[1]!=null);
 const body=[`Hi ${to||'team'},`,'','Please run an ad for the opening below.','',
  ...rows.map(r=>r[0]+': '+r[1]),
  ...(about?['','About the role: '+about]:[]),
  '','Please tell me when the ad goes live and send me the ad link.','','Thanks,',from||''].join('\n');
 return {subject:`Ad request: ${o.title} (${o.id})`,body};
}
