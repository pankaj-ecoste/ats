/* Turns an uploaded résumé file into plain text for the parser. DOM-free: the file is read with file.arrayBuffer(), and the PDF
   library is handed in by the caller (it is loaded on demand in the browser). Word .docx is read here with no library: it is a zip file. */
"use strict";
const RESUME_TYPES={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain',md:'text/markdown'};
const RESUME_MAX_BYTES=10*1024*1024;

const fileExt=name=>String(name||'').toLowerCase().split('.').pop();
// {ok, kind} or {ok:false, error} in plain words
function checkResumeFile(file){
 const kind=fileExt(file.name);
 if(kind==='doc')return {ok:false,error:'Old Word files (.doc) cannot be read. Save it as .docx or PDF and upload again.'};
 if(!RESUME_TYPES[kind])return {ok:false,error:'Upload a PDF, Word (.docx) or text file.'};
 if(file.size>RESUME_MAX_BYTES)return {ok:false,error:'This file is larger than 10 MB.'};
 if(file.size===0)return {ok:false,error:'This file is empty.'};
 return {ok:true,kind};
}

const u16=(b,o)=>b[o]|(b[o+1]<<8);
const u32=(b,o)=>(b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0;
async function inflateRaw(bytes){
 const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}
// the entries of a zip file: {name -> {method, size, offset}} read from its central directory
function zipEntries(b){
 let eocd=-1;
 for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(u32(b,i)===0x06054b50){eocd=i;break}
 if(eocd<0)throw new Error('This is not a valid Word file.');
 const count=u16(b,eocd+10);let p=u32(b,eocd+16);const out={};
 for(let k=0;k<count;k++){
  if(u32(b,p)!==0x02014b50)throw new Error('This is not a valid Word file.');
  const nameLen=u16(b,p+28),extra=u16(b,p+30),comment=u16(b,p+32);
  const name=new TextDecoder().decode(b.subarray(p+46,p+46+nameLen));
  out[name]={method:u16(b,p+10),size:u32(b,p+20),offset:u32(b,p+42)};
  p+=46+nameLen+extra+comment;
 }
 return out;
}
async function zipRead(b,entry){
 const o=entry.offset,nameLen=u16(b,o+26),extra=u16(b,o+28),start=o+30+nameLen+extra;
 const data=b.subarray(start,start+entry.size);
 if(entry.method===0)return data;
 if(entry.method===8)return inflateRaw(data);
 throw new Error('This Word file uses a compression that cannot be read.');
}
const ENTITIES={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
function xmlText(xml){
 return xml.replace(/<w:instrText[^>]*>[\s\S]*?<\/w:instrText>/g,'').replace(/<w:tab\s*\/>/g,'\t').replace(/<w:(?:br|cr)[^>]*\/>/g,'\n').replace(/<\/w:p>/g,'\n')
  .replace(/<[^>]+>/g,'').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi,(m,e)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10)):(ENTITIES[e]??m));
}
async function docxText(bytes){
 const entries=zipEntries(bytes),parts=Object.keys(entries).filter(n=>/^word\/(header\d*|document)\.xml$/.test(n)).sort((a,b)=>a.startsWith('word/header')===b.startsWith('word/header')?a.localeCompare(b):a.startsWith('word/header')?-1:1);
 if(!parts.some(n=>/^word\/document\.xml$/.test(n)))throw new Error('This file is not a Word document (.docx).');
 const texts=[];
 for(const n of parts)texts.push(xmlText(new TextDecoder().decode(await zipRead(bytes,entries[n]))));
 return texts.join('\n');
}
// pdfjs: the pdf.js library
async function pdfText(bytes,pdfjs){
 // isEvalSupported:false is the official protection against CVE-2024-4367 (a crafted PDF font running code), which affects pdf.js up to 4.1; the page policy also forbids eval
 const doc=await pdfjs.getDocument({data:bytes,isEvalSupported:false}).promise,pages=[];
 for(let i=1;i<=doc.numPages;i++){
  const {items}=await(await doc.getPage(i)).getTextContent(),lines=[];let line='',lastY=null;
  for(const it of items){
   const y=it.transform?it.transform[5]:0;
   if(lastY!==null&&Math.abs(y-lastY)>2){lines.push(line);line=''}
   line+=it.str;lastY=y;
   if(it.hasEOL){lines.push(line);line='';lastY=null}
  }
  if(line)lines.push(line);
  pages.push(lines.join('\n'));
 }
 return pages.join('\n\n');
}
// tidy what was read: no control characters, no trailing spaces, at most one blank line in a row
const plainChar=ch=>{const c=ch.charCodeAt(0);return (c<32&&c!==9&&c!==10)||c===0xa0?' ':ch};
const tidyResumeText=t=>[...String(t).replace(/\r\n?/g,'\n')].map(plainChar).join('').split('\n').map(l=>l.replace(/[ \t]+/g,' ').trim()).join('\n').replace(/\n{3,}/g,'\n\n').trim();

// file: a browser File. getPdf: async () => the pdf.js library (only called for a PDF). Throws an Error with a plain sentence.
async function resumeTextFromFile(file,getPdf){
 const chk=checkResumeFile(file);
 if(!chk.ok)throw new Error(chk.error);
 let text;
 if(chk.kind==='txt'||chk.kind==='md')text=new TextDecoder().decode(await file.arrayBuffer());
 else{
  const bytes=new Uint8Array(await file.arrayBuffer());
  try{text=chk.kind==='docx'?await docxText(bytes):await pdfText(bytes,await getPdf())}
  catch(e){throw new Error(/valid Word|Word document|compression/.test(e.message)?e.message:`This ${chk.kind==='docx'?'Word file':'PDF'} could not be read (${e.message}).`)}
 }
 text=tidyResumeText(text);
 if(text.length<30)throw new Error('No readable text was found. A scanned PDF is a picture of a page: type or paste the details instead.');
 return text;
}
