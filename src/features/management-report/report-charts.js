/* Management report: SVG line and bar charts */
/* ---- tiny SVG charts ---- */
"use strict";
function lineChart(labels,series,h=220){const W=640,H=h,p={l:34,r:12,t:12,b:28};const max=Math.max(1,...series.flatMap(s=>s.v));const nice=Math.ceil(max/5)*5||5;
 const x=i=>p.l+(W-p.l-p.r)*(labels.length<2?0:i/(labels.length-1)),y=v=>H-p.b-(H-p.t-p.b)*v/nice;
 let g='';for(let k=0;k<=5;k++){const v=nice*k/5;g+=`<line x1="${p.l}" x2="${W-p.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${p.l-6}" y="${y(v)+4}" font-size="10" text-anchor="end" fill="var(--tx3)">${Math.round(v)}</text>`}
 labels.forEach((l,i)=>g+=`<text x="${x(i)}" y="${H-8}" font-size="10" text-anchor="middle" fill="var(--tx3)">${esc(l)}</text>`);
 series.forEach(s=>{g+=`<polyline fill="none" stroke="${s.c}" stroke-width="2.5" stroke-linejoin="round" points="${s.v.map((v,i)=>x(i)+','+y(v)).join(' ')}"/>`+s.v.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${s.c}"><title>${esc(s.n)} · ${esc(labels[i])}: ${v}</title></circle>`).join('')});
 return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly trend chart">${g}</svg><div class="legend">${series.map(s=>`<span><i style="background:${s.c}"></i>${esc(s.n)}</span>`).join('')}</div>`}
function barChart(cats,a,b,na,nb,h=220){const W=640,H=h,p={l:34,r:12,t:12,b:40};const max=Math.max(1,...a,...b);const nice=Math.ceil(max/5)*5||5;const bw=(W-p.l-p.r)/cats.length;const y=v=>H-p.b-(H-p.t-p.b)*v/nice;
 let g='';for(let k=0;k<=5;k++){const v=nice*k/5;g+=`<line x1="${p.l}" x2="${W-p.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${p.l-6}" y="${y(v)+4}" font-size="10" text-anchor="end" fill="var(--tx3)">${Math.round(v)}</text>`}
 cats.forEach((c,i)=>{const x0=p.l+i*bw+bw*.16,w=bw*.32;g+=`<rect x="${x0}" y="${y(a[i])}" width="${w}" height="${H-p.b-y(a[i])}" rx="3" fill="#2F6BFF"><title>${na} · ${c}: ${a[i]}</title></rect><rect x="${x0+w+2}" y="${y(b[i])}" width="${w}" height="${H-p.b-y(b[i])}" rx="3" fill="#A9BCE8"><title>${nb} · ${c}: ${b[i]}</title></rect><text x="${p.l+i*bw+bw/2}" y="${H-24}" font-size="10" text-anchor="middle" fill="var(--tx2)">${esc(c)}</text><text x="${x0+w/2}" y="${y(a[i])-3}" font-size="9.5" text-anchor="middle" fill="var(--tx2)">${a[i]}</text>`});
 return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="This month versus last month">${g}</svg><div class="legend"><span><i style="background:#2F6BFF"></i>${esc(na)}</span><span><i style="background:#A9BCE8"></i>${esc(nb)}</span></div>`}
