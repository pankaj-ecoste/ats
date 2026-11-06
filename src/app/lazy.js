/* Scripts that load only when first needed (the PDF reader is 1.4 MB and most sessions never open a PDF).
   In the multi-file app the tag in index.html is empty and the file is fetched; in the single-file build the tag holds the code as inert text. */
"use strict";
const LAZY_LOADED={};
function loadLazy(src){
 return LAZY_LOADED[src]||(LAZY_LOADED[src]=new Promise((resolve,reject)=>{
  const tag=document.querySelector(`script[data-lazy="${src}"]`),s=document.createElement('script');
  const inline=tag&&tag.textContent.trim();
  if(inline){s.textContent=tag.textContent;document.head.appendChild(s);resolve();return}   // an inline script runs as soon as it is added
  s.src=src;s.onload=()=>resolve();s.onerror=()=>{delete LAZY_LOADED[src];reject(new Error(`Could not load ${src}`))};
  document.head.appendChild(s);
 }));
}
// opens a stored file in a new tab, through a link that works for two minutes
async function openStoredFile(bucket,path){
 const url=await fileLink(sb,bucket,path);
 window.open(url,'_blank','noopener');
}
// a stored HTML file opened as a page: the storage service shows HTML as plain text, so it is fetched and shown from the browser's own copy
// The page is locked first: a stored file is data, so it may show text and pictures but never run anything or reach out, whoever wrote it.
const LOCKED_PAGE=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`;
const lockPage=html=>/<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,m=>m+LOCKED_PAGE):LOCKED_PAGE+html;
async function openStoredHtml(bucket,path){
 const text=await (await fetch(await fileLink(sb,bucket,path))).text();
 window.open(URL.createObjectURL(new Blob([lockPage(text)],{type:'text/html'})),'_blank','noopener');
}
// the PDF reader: the library, then its worker (run on the main thread: a résumé is a few pages)
async function loadPdfReader(){
 if(!window.pdfjsLib){await loadLazy('src/vendor/pdf.min.js');await loadLazy('src/vendor/pdf.worker.min.js')}
 return window.pdfjsLib;
}
