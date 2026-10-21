/* Audit log for admins: who changed what. Reads only; the log is written by database triggers. */
"use strict";
// one page of the log, newest first; filters are optional: {table, op, rowId}
async function listAudit({table='',op='',rowId='',limit=100}={}){
 let q=sb.from('audit_log').select('id,at,actor_id,table_name,row_id,op,old_data,new_data').order('id',{ascending:false}).limit(limit);
 if(table)q=q.eq('table_name',table);
 if(op)q=q.eq('op',op);
 if(rowId)q=q.ilike('row_id','%'+rowId.replace(/[%_]/g,'')+'%');
 const {data,error}=await q;
 if(error)throw authError(error);
 return data||[];
}
// "phone: '' → '99999'" for each changed field; an insert or delete says so
function auditSummary(r){
 const show=v=>v===null||v===undefined||v===''?'blank':typeof v==='object'?JSON.stringify(v):String(v);
 const cut=t=>t.length>60?t.slice(0,57)+'…':t;
 if(r.op==='INSERT')return 'Created';
 if(r.op==='DELETE')return 'Deleted';
 const keys=Object.keys(r.new_data||{});
 return keys.length?keys.map(k=>`${k}: ${cut(show((r.old_data||{})[k]))} → ${cut(show(r.new_data[k]))}`).join('; '):'Saved with no change';
}
