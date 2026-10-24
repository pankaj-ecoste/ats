/* Import leads: the recruiter uploads a sheet of leads, matches its columns, picks the opening, and sees who is new before anything is saved. */
"use strict";
const LEAD_FILE_MAX=15*1024*1024,LEAD_SHEET_ROWS=20000;

// the first usable sheet of a workbook as rows of cells; sheets: [{name, rows}] so another sheet can be picked
async function readLeadSheets(file){
 const X=await loadExcel();const wb=new X.Workbook();await wb.xlsx.load(await file.arrayBuffer());
 return wb.worksheets.map(ws=>{
  const rows=[],cols=Math.min(ws.columnCount||0,60),last=Math.min(ws.rowCount||0,LEAD_SHEET_ROWS+1);
  for(let r=1;r<=last;r++){const row=ws.getRow(r),cells=[];for(let c=1;c<=cols;c++)cells.push(row.getCell(c).value);rows.push(cells)}
  return {name:ws.name,rows};
 }).filter(s=>s.rows.some(r=>r.some(c=>leadCellText(c)!=='')));
}
async function readLeadFile(file){
 if(file.size>LEAD_FILE_MAX)throw new Error('That file is over 15 MB. Split it into smaller files.');
 if(/\.(csv|tsv|txt)$/i.test(file.name))return [{name:file.name,rows:parseCsv(await file.text())}];
 if(/\.xlsx$/i.test(file.name)){
  const sheets=await readLeadSheets(file);
  if(!sheets.length)throw new Error('The file has no data');
  return sheets;
 }
 if(/\.xls$/i.test(file.name))throw new Error('Old .xls files cannot be read. In Excel use Save As → Excel Workbook (.xlsx) or CSV.');
 throw new Error('Choose a .csv or .xlsx file. In Google Sheets use File → Download.');
}

function leadImportModal(){
 const ops=S.openings.filter(o=>o.status!=='Closed');
 if(!ops.length){toast('Create an opening first. Every lead is added to an opening.','var(--red)');return}
 const st={sheets:[],sheet:0,table:null,map:{},plan:[],busy:false};
 modal({title:'Import leads',size:'xw',body:'<div id="ldBody"></div>',foot:'<button class="btn" data-close>Cancel</button><span class="grow"></span><button class="btn hide" id="ldBack">Back</button><button class="btn pri hide" id="ldGo" disabled>Import</button>',
 onMount:el=>{
  const body=$('#ldBody',el),go2=$('#ldGo',el),back=$('#ldBack',el);

  const pickView=()=>{
   st.table=null;go2.classList.add('hide');back.classList.add('hide');
   body.innerHTML=`<p style="margin-top:0">Upload the sheet of leads as it is. You choose which column is which in the next step. Nothing is saved until you click Import.</p>
    <label class="f full"><input type="file" id="ldFile" accept=".csv,.tsv,.txt,.xlsx"><span class="muted small" id="ldNote" role="status"></span></label>
    <p class="muted small">A Google Sheet: File → Download → Comma Separated Values (.csv) or Microsoft Excel (.xlsx). The first row must be the column headings.</p>`;
   $('#ldFile',el).onchange=async e=>{
    const f=e.target.files[0];if(!f)return;const note=$('#ldNote',el);note.textContent=` Reading ${f.name}…`;
    try{st.sheets=await readLeadFile(f);st.sheet=st.sheets.reduce((b,s,i)=>s.rows.length>st.sheets[b].rows.length?i:b,0);st.fname=f.name;useSheet()}
    catch(err){note.textContent='';e.target.value='';toast(err.message||'Could not read that file','var(--red)')}};
  };

  const useSheet=()=>{
   const t=leadTable(st.sheets[st.sheet].rows);
   if(!t.headers.length||!t.rows.length){toast('No rows found. The first row must hold the column headings.','var(--red)');return}
   if(t.rows.length>LEAD_IMPORT_MAX){toast(`That sheet has ${t.rows.length.toLocaleString('en-IN')} rows. Import at most ${LEAD_IMPORT_MAX.toLocaleString('en-IN')} at a time.`,'var(--red)');return}
   st.table=t;st.map=guessLeadMap(t.headers);
   matchView();
  };

  const opts=()=>[['','— not in my file —'],...st.table.headers.map(h=>[h,h])];
  const sample=f=>{const h=st.map[f.key];return h?esc(String((st.table.rows[0]||{})[h]??'').slice(0,40)):''};

  const matchView=()=>{
   back.classList.remove('hide');go2.classList.remove('hide');
   const sheetPick=st.sheets.length>1?`<label class="f">Sheet in the file<select class="inp" id="ldSheet">${st.sheets.map((s,i)=>`<option value="${i}" ${i===st.sheet?'selected':''}>${esc(s.name)} (${s.rows.length} rows)</option>`).join('')}</select></label>`:'';
   body.innerHTML=`<p style="margin-top:0"><b>${esc(st.fname)}</b>: ${st.table.rows.length.toLocaleString('en-IN')} rows. Check that each field points at the right column.</p>
    <div class="fgrid"><label class="f">Add these leads to the opening<select class="inp" id="ldOp">${ops.map(o=>`<option value="${o.id}">${esc(o.title)} (${o.id})</option>`).join('')}</select></label>
    <label class="f">Where they came from<input class="inp" id="ldSrc" list="ldSrcList" value="Ad campaign"><datalist id="ldSrcList">${SOURCES.map(s=>`<option value="${esc(s)}">`).join('')}</datalist></label>${sheetPick}</div>
    <div class="tbl-wrap" style="max-height:290px;margin-top:10px"><table><thead><tr><th>Field</th><th>Column in your file</th><th>First row</th></tr></thead><tbody>
    ${LEAD_FIELDS.map(f=>`<tr><td>${esc(f.label)}${f.need?' <span class="muted small">(needed)</span>':''}</td><td><select class="inp" data-ldf="${f.key}" style="padding:4px 8px;font-size:13px">${opts().map(([v,l])=>`<option value="${esc(v)}" ${st.map[f.key]===v?'selected':''}>${esc(l)}</option>`).join('')}</select></td><td class="small muted" data-lds="${f.key}">${sample(f)}</td></tr>`).join('')}
    </tbody></table></div><div id="ldSum" role="status" style="margin-top:12px"></div>`;
   const sh=$('#ldSheet',el);if(sh)sh.onchange=()=>{st.sheet=+sh.value;useSheet()};
   $$('[data-ldf]',el).forEach(s=>s.onchange=()=>{if(s.value)st.map[s.dataset.ldf]=s.value;else delete st.map[s.dataset.ldf];const c=$(`[data-lds="${s.dataset.ldf}"]`,el);c.innerHTML=sample({key:s.dataset.ldf});summary()});
   $('#ldOp',el).onchange=summary;
   summary();
  };

  const summary=()=>{
   const out=$('#ldSum',el);
   if(!st.map.name||(!st.map.phone&&!st.map.email)){
    st.plan=[];go2.disabled=true;go2.textContent='Import';
    out.innerHTML='<div class="small" style="padding:8px 10px;background:var(--orange2);border-radius:8px">Choose the column that holds the <b>name</b>, and the one with the <b>phone</b> (or email).</div>';return}
   st.plan=planLeads(st.table,st.map,$('#ldOp',el).value);
   const n=leadCounts(st.plan),use=n.new+n.existing;
   const bad=st.plan.filter(p=>p.status==='skip'||p.status==='dup');
   out.innerHTML=`<div class="row" style="gap:10px;flex-wrap:wrap"><span class="pill green">${n.new.toLocaleString('en-IN')} new</span>
    ${n.existing?`<span class="pill blue">${n.existing.toLocaleString('en-IN')} already in the system, will be added to this opening</span>`:''}
    ${n.dup?`<span class="pill orange">${n.dup.toLocaleString('en-IN')} duplicates left out</span>`:''}
    ${n.skip?`<span class="pill red">${n.skip.toLocaleString('en-IN')} cannot be used</span>`:''}</div>
    ${bad.length?`<details style="margin-top:8px"><summary class="small">Rows left out (${bad.length.toLocaleString('en-IN')})</summary><div class="small muted" style="max-height:130px;overflow:auto">${bad.slice(0,50).map(p=>`Row ${p.n}: ${esc(p.name||'—')} · ${esc(p.why)}`).join('<br>')}${bad.length>50?`<br>…and ${bad.length-50} more`:''}</div></details>`:''}`;
   go2.disabled=use===0||st.busy;go2.textContent=use?`Import ${use.toLocaleString('en-IN')} lead${use>1?'s':''}`:'Nothing to import';
  };

  back.onclick=pickView;
  go2.onclick=()=>{
   if(st.busy)return;st.busy=true;go2.disabled=true;go2.textContent='Importing…';
   try{
    const r=importLeads(st.plan,{opId:$('#ldOp',el).value,source:$('#ldSrc',el).value.trim()});
    closeModal();toast(`${r.added.toLocaleString('en-IN')} leads imported${CONNECTED?'. Saving to the server…':''}`,'var(--green)');
    go('candidates');
   }catch(err){st.busy=false;toast(err.message||'Could not import','var(--red)');summary()}
  };
  pickView();
 }});
}
