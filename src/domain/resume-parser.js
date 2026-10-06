/* Plain-text resume parser */
"use strict";
/* ---------- resume parser ---------- */
function parseResume(text){
 const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
 const email=(text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)||[''])[0];
 const phone=(text.match(/(\+?\d[\d\s-]{8,}\d)/)||[''])[0].trim();
 const expM=text.match(/(\d+(?:\.\d+)?)\+?\s*(?:years|yrs)/i);
 const skills=SKILL_DICT.filter(s=>new RegExp('(^|[^a-z])'+s.toLowerCase().replace(/[.+*?/()]/g,'\\$&')+'($|[^a-z])','i').test(text));
 const cities=['Bengaluru','Bangalore','Delhi','Mumbai','Pune','Hyderabad','Chennai','Gurugram','Noida','Kolkata','Jaipur','Ahmedabad','Ghaziabad'];
 let location=cities.find(ci=>text.includes(ci))||'';if(location==='Bangalore')location='Bengaluru';
 const eduKeys=Object.keys(EDU_LEVEL).sort((a,b)=>b.length-a.length);
 const education=eduKeys.find(e=>text.includes(e))||'Graduate';
 const name=lines[0]&&lines[0].length<40&&!lines[0].includes('@')?lines[0]:'';
 const desigLine=lines[1]||'';const designation=desigLine.split(/[·|,]/)[0].trim();
 const compM=text.match(/(?:at|—|-)\s+([A-Z][\w&.]+(?:\s[A-Z][\w&.]+)?)\s*\(/);
 const noticeM=text.match(/notice[^\d]{0,20}(\d+)/i);
 const salM=text.match(/expect\w*[^\d]{0,20}(\d+(?:\.\d+)?)/i);
 const curM=text.match(/current (?:ctc|salary)[^\d]{0,20}(\d+(?:\.\d+)?)/i);
 const certs=lines.filter(l=>/certified|certificate|certification/i.test(l)&&!/^certifications?$/i.test(l));
 return {name,email,phone,exp:expM?+expM[1]:0,skills,location,education,designation,company:compM?compM[1]:'',notice:noticeM?+noticeM[1]:30,expSal:salM?+salM[1]:0,curSal:curM?+curM[1]:0,certifications:certs};
}
