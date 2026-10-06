/* Resume-to-opening match scoring */
"use strict";
/* ---------- AI resume matching ---------- */
const hasSkill=(c,s)=>{const n=norm(s);return c.skills.some(k=>{const m=norm(k);return m===n||(n==='excel'&&m==='msexcel')||(n==='msexcel'&&m==='excel')})};
function match(c,op){
 const W=S.settings.weights;
 const mm=op.mandatory.filter(s=>hasSkill(c,s)), miss=op.mandatory.filter(s=>!hasSkill(c,s));
 const pm=op.preferred.filter(s=>hasSkill(c,s)), pmiss=op.preferred.filter(s=>!hasSkill(c,s));
 const skills=Math.round((mm.length/Math.max(1,op.mandatory.length))*85+(pm.length/Math.max(1,op.preferred.length))*15);
 let experience,expNote;
 if(c.exp<op.expMin){experience=Math.max(0,Math.round(100-(op.expMin-c.exp)*28));expNote=`${(op.expMin-c.exp).toFixed(1)} yrs short of the ${op.expMin}-yr minimum`}
 else if(c.exp>op.expMax){experience=Math.max(60,Math.round(100-(c.exp-op.expMax)*10));expNote=`above the ${op.expMax}-yr band, may be overqualified`}
 else {experience=100;expNote=`within the ${op.expMin}–${op.expMax} yr band`}
 const req=EDU_LEVEL[op.education]??1, have=EDU_LEVEL[c.education]??1;
 let education=have>=req?100:have===req-1?70:40;
 if(op.education==='B.Tech'&&have>=2&&!/Computer|Tech|B\.E|MCA/.test(c.eduField+c.education))education=75;
 let location,locNote;
 if(op.mode==='Remote'||op.location==='Remote'){location=100;locNote='role is remote'}
 else if(c.location===op.location){location=100;locNote=`based in ${op.location}`}
 else if(['Delhi','Noida','Gurugram','Ghaziabad'].includes(c.location)&&['Delhi','Noida','Gurugram','Ghaziabad'].includes(op.location)){location=90;locNote='same NCR region'}
 else if(c.reloc){location=75;locNote=`in ${c.location}, open to relocate`}
 else {location=35;locNote=`in ${c.location}, not open to relocate`}
 let salary,salNote;
 if(c.expSal<=op.salMax){salary=100;salNote='expectation within budget'}
 else {const over=(c.expSal-op.salMax)/op.salMax;salary=Math.max(20,Math.round(100-over*220));salNote=`expects ${lpa(c.expSal)}, ${Math.round(over*100)}% above budget`}
 const notice=c.notice<=30?100:c.notice<=60?80:55;
 const tot=Object.values(W).reduce((a,b)=>a+b,0)||1;
 const score=Math.round((skills*W.skills+experience*W.experience+education*W.education+location*W.location+salary*W.salary+notice*W.notice)/tot);
 const certs=c.certifications.filter(x=>op.mandatory.concat(op.preferred).some(s=>x.toLowerCase().includes(s.toLowerCase().split(' ')[0])));
 const industry=/Razorpay|Paytm|PhonePe|Flipkart|HDFC|Bajaj/.test(c.company)?'Fintech/BFSI — close to our domain':'Adjacent industry';
 let verdict=score>=85?'Strong match':score>=70?'Good match':score>=55?'Partial match':'Weak match';
 const parts=[];
 parts.push(`${c.name.split(' ')[0]} has ${c.exp} years of experience (${expNote})`);
 parts.push(mm.length===op.mandatory.length?`covers all ${op.mandatory.length} mandatory skills`:`covers ${mm.length} of ${op.mandatory.length} mandatory skills${miss.length?`, missing ${miss.join(', ')}`:''}`);
 let summary=parts.join(' and ')+'. ';
 summary+=pm.length?`Brings preferred skills in ${pm.join(', ')}. `:'';
 summary+=`Candidate is ${locNote}; ${salNote}; notice period ${c.notice} days.`;
 const risks=[];
 if(miss.length)risks.push(`Missing mandatory: ${miss.join(', ')}`);
 if(salary<80)risks.push(salNote[0].toUpperCase()+salNote.slice(1));
 if(c.notice>=90)risks.push('90-day notice may delay joining');
 if(location<60)risks.push('Location mismatch');
 if(experience<80)risks.push('Experience below requirement');
 return {score,verdict,skills,experience,education,location,salary,notice,mm,miss,pm,pmiss,summary,risks,certs,industry};
}
const matchA=a=>match(getC(a.cid),getOp(a.opId));
const scoreColor=s=>s>=80?'var(--green)':s>=60?'var(--ai)':s>=45?'var(--orange)':'var(--red)';
const ring=(s,cls='')=>`<span class="ring ${cls}" style="--p:${s};--c:${scoreColor(s)}"><span>${s}${cls?'%':''}</span></span>`;
const stagePill=s=>`<span class="pill ${STAGE_COLOR[s]||''}">${esc(s)}</span>`;
