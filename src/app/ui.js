/* Modal stack, toast, confirm box, form helpers */
/* ---------- modal & toast ---------- */
let modalStack=[];
function modal({title,body,foot='',size='',onMount}){
 const el=document.createElement('div');el.className='scrim';
 el.innerHTML=`<div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${title}</h2><button class="tbtn" data-close aria-label="Close">${ic('x')}</button></header><div class="mb">${body}</div>${foot?`<footer>${foot}</footer>`:''}</div>`;
 $('#modalRoot').appendChild(el);modalStack.push(el);
 el.addEventListener('mousedown',e=>{if(e.target===el)closeModal()});
 $$('[data-close]',el).forEach(b=>b.onclick=()=>closeModal());
 onMount&&onMount(el);
 const f=$('input:not([type=checkbox]):not([readonly]):not([disabled]),select:not([disabled]),textarea:not([readonly]):not([disabled])',el); // first field the user can type inf&&f.focus&&setTimeout(()=>f.focus(),30);
 return el;
}
function closeModal(){const el=modalStack.pop();el&&el.remove()}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modalStack.length)closeModal()});
function toast(msg,color='var(--green)'){const t=document.createElement('div');t.className='toast';t.innerHTML=`<i style="background:${color}"></i>${esc(msg)}`;$('#toasts').appendChild(t);setTimeout(()=>t.remove(),3200)}
function confirmBox(title,text,okLabel,fn,danger){modal({title,body:`<p style="margin:0">${text}</p>`,foot:`<button class="btn" data-close>Cancel</button><button class="btn ${danger?'bad':'pri'}" id="cOK">${okLabel}</button>`,onMount:el=>{$('#cOK',el).onclick=()=>{closeModal();fn()}}})}
const val=(el,sel)=>{const x=$(sel,el);return x?x.value.trim():''};
