/* DOM, date, money and string helpers */
"use strict";
/* ---------- utilities ---------- */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=p=>p+'-'+Math.random().toString(36).slice(2,8).toUpperCase();
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const now=()=>new Date(); const today=()=>iso(now()); // evaluated on use, so a tab left open overnight stays correct
const addDays=(n,base=now())=>{const d=new Date(base);d.setDate(d.getDate()+n);return iso(d)};
const parseD=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtD=s=>{if(!s)return '—';const d=parseD(s);return d.getDate()+' '+MONTHS[d.getMonth()]+' '+d.getFullYear()};
const fmtDs=s=>{if(!s)return '—';const d=parseD(s);return d.getDate()+' '+MONTHS[d.getMonth()]};
const fmtT=t=>{if(!t)return '';let [h,m]=t.split(':').map(Number);const ap=h>=12?'PM':'AM';h=h%12||12;return h+':'+pad(m)+' '+ap};
const daysBetween=(a,b)=>Math.round((parseD(b)-parseD(a))/864e5);
const lpa=n=>n==null||n===''?'—':'₹'+(+n).toFixed(+n%1?1:0)+' LPA';
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const initials=n=>n.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
const AVC=['#2F6BFF','#12A150','#E5484D','#7B4DFF','#0AA5C2','#E8850C','#C2418F','#3B5BA5'];
const avColor=n=>AVC[[...n].reduce((a,c)=>a+c.charCodeAt(0),0)%AVC.length];
const av=(n,cls='')=>`<span class="av ${cls}" style="background:${avColor(n)}" aria-hidden="true">${initials(n)}</span>`;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const norm=s=>s.toLowerCase().replace(/[^a-z0-9+#]/g,'');
