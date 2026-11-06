/* DOM, date, money and string helpers */
"use strict";
/* ---------- utilities ---------- */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Formatted text that someone typed or pasted (the offer letter) is cleaned before it is shown: only layout tags and a few harmless
// attributes survive; scripts, forms, frames, event handlers and links that run code are removed. Runs on the inert copy made by DOMParser.
const HTML_KEEP=new Set('A B BLOCKQUOTE BR DIV EM H1 H2 H3 H4 HR I IMG LI OL P SPAN STRONG SUB SUP TABLE TBODY TD TFOOT TH THEAD TR U UL'.split(' '));
const HTML_DROP=new Set('SCRIPT STYLE IFRAME FRAME FRAMESET OBJECT EMBED LINK META BASE TEMPLATE SVG MATH FORM INPUT BUTTON TEXTAREA SELECT NOSCRIPT AUDIO VIDEO'.split(' '));
const HTML_ATTR=new Set(['class','style','colspan','rowspan','align','alt','width','height']);
function cleanHtml(html){
 const doc=new DOMParser().parseFromString('<body>'+String(html||'')+'</body>','text/html');
 (function walk(node){
  for(const el of [...node.children]){
   if(HTML_DROP.has(el.tagName)){el.remove();continue}
   walk(el);
   if(!HTML_KEEP.has(el.tagName)){el.replaceWith(...el.childNodes);continue}
   for(const a of [...el.attributes]){
    const n=a.name.toLowerCase(),v=a.value;
    const ok=HTML_ATTR.has(n)&&!(n==='style'&&/url\s*\(|expression|@import|javascript:/i.test(v))
     ||(n==='src'&&el.tagName==='IMG'&&/^data:image\/(png|jpe?g|gif|webp);base64,[\w+/=]+$/i.test(v));
    if(!ok)el.removeAttribute(a.name);
   }
   if(el.tagName==='A')el.removeAttribute('href');   // a letter has no live links
  }
 })(doc.body);
 return doc.body.innerHTML;
}
// collision-proof ids: prefix + 8 random characters (about 40 bits) from the crypto source; no look-alike letters (0/O, 1/I)
const ID_CHARS='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const uid=p=>p+'-'+[...crypto.getRandomValues(new Uint8Array(8))].map(b=>ID_CHARS[b&31]).join('');
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
const initials=n=>String(n||'').split(/\s+/).filter(Boolean).map(x=>[...x][0]).slice(0,2).join('').toUpperCase();
const AVC=['#2F6BFF','#12A150','#E5484D','#7B4DFF','#0AA5C2','#E8850C','#C2418F','#3B5BA5'];
const avColor=n=>AVC[[...String(n||'')].reduce((a,c)=>a+c.charCodeAt(0),0)%AVC.length];
const av=(n,cls='')=>`<span class="av ${esc(cls)}" style="background:${avColor(n)}" aria-hidden="true">${esc(initials(n))}</span>`;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const norm=s=>s.toLowerCase().replace(/[^a-z0-9+#]/g,'');
