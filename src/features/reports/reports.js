/* Reports page */
/* ---------- reports ---------- */
function vReports(){
 const A=S.applications;
 const src={};A.forEach(a=>{const s=getC(a.cid).source;src[s]=src[s]||{n:0,hired:0};src[s].n++;if(a.maxStage>=8)src[s].hired++});
 const recs=RECRUITERS.map(r=>{const l=A.filter(a=>a.recruiter===r);return {r,n:l.length,sh:l.filter(a=>a.maxStage>=1).length,int:l.filter(a=>a.maxStage>=3).length,off:l.filter(a=>a.maxStage>=6).length,j:l.filter(a=>a.maxStage>=8).length,avg:l.length?Math.round(l.reduce((s,a)=>s+matchA(a).score,0)/l.length):0}});
 const hires=A.filter(a=>a.maxStage>=8);const tth=hires.length?Math.round(hires.reduce((s,a)=>s+daysBetween(a.date,TODAY),0)/hires.length):0;
 const perOp=S.openings.map(o=>{const l=appsOfOp(o.id);return {o,n:l.length,act:l.filter(a=>!['Rejected','On Hold'].includes(a.stage)).length,filled:l.filter(a=>a.maxStage>=8).length}});
 const maxN=Math.max(...perOp.map(x=>x.n),1);
 const acc=S.offers.filter(o=>o.status==='Accepted').length,sent=S.offers.filter(o=>['Sent','Accepted','Declined','Negotiation'].includes(o.status)).length;
 const stageAge=STAGES.slice(0,8).map(s=>{const l=A.filter(a=>a.stage===s);return [s,l.length?Math.round(l.reduce((t,a)=>t+daysBetween(a.stageSince,TODAY),0)/l.length):0,l.length]});
 const maxAge=Math.max(...stageAge.map(x=>x[1]),1);
 return `<div class="page-h"><div><h1>Reports</h1><p>Live from your pipeline</p></div></div>
 <div class="kpis">${[['Total applications',A.length],['Avg AI match',Math.round(A.reduce((s,a)=>s+matchA(a).score,0)/A.length)+'%'],['Offer acceptance',sent?Math.round(acc/sent*100)+'%':'—'],['Avg time to hire',tth+' days']].map(k=>`<div class="kpi" style="cursor:default"><span>${k[0]}</span><b>${k[1]}</b></div>`).join('')}</div>
 <div class="grid g2">
 <section class="panel"><header><h3>Overall funnel</h3></header><div class="pbody">${funnelHTML(A)}</div></section>
 <section class="panel"><header><h3>Applications by opening</h3></header><div class="pbody hbars">${perOp.map(x=>`<div class="hb" style="grid-template-columns:150px 1fr 70px"><span title="${esc(x.o.title)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.o.title)}</span><div class="bar" style="height:14px;position:relative"><i style="width:${x.n/maxN*100}%;opacity:.35"></i><i style="width:${x.act/maxN*100}%;position:absolute;top:0"></i></div><span class="small">${x.act} active / ${x.n}</span></div>`).join('')}<p class="small muted">Dark bar: active candidates. Light bar: all applications.</p></div></section>
 <section class="panel"><header><h3>Source effectiveness</h3></header><div class="tbl-wrap"><table><thead><tr><th>Source</th><th>Applications</th><th>Share</th><th>Joined</th></tr></thead><tbody>${Object.entries(src).sort((a,b)=>b[1].n-a[1].n).map(([k,v])=>`<tr><td>${k}</td><td>${v.n}</td><td><div class="bar" style="width:120px"><i style="width:${v.n/A.length*100}%"></i></div></td><td>${v.hired}</td></tr>`).join('')}</tbody></table></div></section>
 <section class="panel"><header><div><h3>Stage ageing</h3><p>Average days candidates have sat in their current stage</p></div></header><div class="pbody hbars">${stageAge.map(x=>`<div class="hb"><span>${x[0]}</span><div class="bar" style="height:10px"><i style="width:${x[1]/maxAge*100}%;background:${x[1]>5?'var(--red)':x[1]>2?'var(--orange)':'var(--green)'}"></i></div><span class="small">${x[1]}d (${x[2]})</span></div>`).join('')}</div></section>
 </div>
 <section class="panel" style="margin-top:16px"><header><h3>Recruiter performance</h3></header><div class="tbl-wrap"><table><thead><tr><th>Recruiter</th><th>Applications</th><th>Shortlisted</th><th>Interviewed</th><th>Offers</th><th>Joined</th><th>Avg match</th></tr></thead><tbody>${recs.map(r=>`<tr><td><div class="who">${av(r.r)}<b>${r.r}</b></div></td><td>${r.n}</td><td>${r.sh}</td><td>${r.int}</td><td>${r.off}</td><td>${r.j}</td><td>${ring(r.avg)}</td></tr>`).join('')}</tbody></table></div></section>`;
}
