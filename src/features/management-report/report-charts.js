/* Management report: SVG line chart */
/* ---- tiny SVG charts ---- */
"use strict";
function lineChart(labels,series,h=220){const W=640,H=h,p={l:34,r:12,t:12,b:28};const max=Math.max(1,...series.flatMap(s=>s.v));const nice=Math.ceil(max/5)*5||5;
 const x=i=>p.l+(W-p.l-p.r)*(labels.length<2?0:i/(labels.length-1)),y=v=>H-p.b-(H-p.t-p.b)*v/nice;
 let g='';for(let k=0;k<=5;k++){const v=nice*k/5;g+=`<line x1="${p.l}" x2="${W-p.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${p.l-6}" y="${y(v)+4}" font-size="10" text-anchor="end" fill="var(--tx3)">${Math.round(v)}</text>`}
 labels.forEach((l,i)=>g+=`<text x="${x(i)}" y="${H-8}" font-size="10" text-anchor="middle" fill="var(--tx3)">${esc(l)}</text>`);
 series.forEach(s=>{g+=`<polyline fill="none" stroke="${s.c}" stroke-width="2.5" stroke-linejoin="round" points="${s.v.map((v,i)=>x(i)+','+y(v)).join(' ')}"/>`+s.v.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${s.c}"><title>${esc(s.n)} · ${esc(labels[i])}: ${v}</title></circle>`).join('')});
 return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly trend chart">${g}</svg><div class="legend">${series.map(s=>`<span><i style="background:${s.c}"></i>${esc(s.n)}</span>`).join('')}</div>`}
