/* Links that hand a message to the recruiter's own email app or WhatsApp, and calendar invites. DOM-free.
   Nothing is sent from this app's server: the person presses send in their own app, and the message is recorded here. */
"use strict";
const mailtoLink=({to,subject,body})=>`mailto:${encodeURIComponent(String(to||'').trim())}?subject=${encodeURIComponent(subject||'')}&body=${encodeURIComponent(body||'')}`;
// a phone number as WhatsApp wants it: digits only, with the country code (a 10-digit number is taken as Indian)
function whatsappNumber(phone){
 const d=String(phone||'').replace(/\D/g,'').replace(/^00/,'');
 if(d.length===10)return '91'+d;
 if(d.length===11&&d[0]==='0')return '91'+d.slice(1);
 return d.length>=11?d:'';
}
const whatsappLink=({phone,text})=>{const n=whatsappNumber(phone);return n?`https://wa.me/${n}?text=${encodeURIComponent(text||'')}`:''};

/* ---------- calendar invites (.ics) ---------- */
const icsEscape=t=>String(t||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
// local wall-clock time without a zone, so it lands at the same hour on everyone's calendar in the same zone
const icsStamp=(date,time)=>`${String(date).replace(/-/g,'')}T${String(time||'00:00').replace(/:/g,'').padEnd(6,'0').slice(0,6)}`;
// lines longer than 75 characters continue on the next line, which starts with a space
function icsFold(line){const out=[];let l=line;while(l.length>73){out.push(l.slice(0,73));l=' '+l.slice(73)}out.push(l);return out.join('\r\n')}
// e: {id, title, date 'YYYY-MM-DD', time 'HH:MM', minutes, location, description, organizer, attendees:[emails]}
function interviewIcs(e,now=new Date()){
 const start=icsStamp(e.date,e.time),mins=+e.minutes||60;
 const [h,m]=String(e.time||'00:00').split(':').map(Number),end=new Date(Date.UTC(+e.date.slice(0,4),+e.date.slice(5,7)-1,+e.date.slice(8,10),h,m+mins));
 const p2=n=>String(n).padStart(2,'0');
 const endStamp=`${end.getUTCFullYear()}${p2(end.getUTCMonth()+1)}${p2(end.getUTCDate())}T${p2(end.getUTCHours())}${p2(end.getUTCMinutes())}00`;
 const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Ecoste//Recruit Tracker//EN','CALSCALE:GREGORIAN','METHOD:REQUEST','BEGIN:VEVENT',
  `UID:${e.id}@ats.ecoste.in`,`DTSTAMP:${stamp}`,`DTSTART:${start}`,`DTEND:${endStamp}`,`SUMMARY:${icsEscape(e.title)}`,
  ...(e.location?[`LOCATION:${icsEscape(e.location)}`]:[]),...(e.description?[`DESCRIPTION:${icsEscape(e.description)}`]:[]),
  ...(e.organizer?[`ORGANIZER;CN=Recruiter:mailto:${e.organizer}`]:[]),
  ...(e.attendees||[]).filter(Boolean).map(a=>`ATTENDEE;RSVP=TRUE:mailto:${a}`),
  'BEGIN:VALARM','TRIGGER:-PT30M','ACTION:DISPLAY','DESCRIPTION:Interview in 30 minutes','END:VALARM','END:VEVENT','END:VCALENDAR'];
 return lines.map(icsFold).join('\r\n')+'\r\n';
}
