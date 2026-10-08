/* Job posting: where each opening is advertised, posting settings, job boards. DOM-free. */
"use strict";
function recordSocialShare(op,board){
 repo.insert('postings',{id:uid('PST'),opId:op.id,board:board.id,status:'Posted',postedOn:today(),url:'',expires:'',cost:0},{end:true});
 log(`${op.title} shared on ${board.name}`,'posting');
}
// rec carries its own id: an existing id updates that record, a new id adds one
function savePosting(rec,op,board){
 repo.find('postings',rec.id)?repo.update('postings',rec.id,rec):repo.insert('postings',rec,{end:true});
 log(`${op.title} ${rec.status==='Posted'?'posted on':rec.status.toLowerCase()+' on'} ${board.name}`,'posting');
 return rec;
}
function deletePosting(id){return repo.remove('postings',id)}
function savePostingSettings(fields){return repo.root('postCfg',c=>Object.assign(c,fields))}

/* ---------- job boards (S.boards is a list kept as one setting) ---------- */
function removeBoard(index){repo.root('boards',bl=>{bl.splice(index,1)})}
function resetBoards(defaults){repo.root('boards',defaults)}
// urls / srcs: [[index,value],...]; added: a new board or null
function saveBoards({urls,srcs,added}){
 repo.root('boards',bl=>{
  urls.forEach(([i,url])=>{bl[i].url=url});
  srcs.forEach(([i,src])=>{bl[i].src=src||bl[i].src});
  if(added)bl.splice(bl.findIndex(b=>b.type==='social'),0,added);
 });
 if(added&&!SOURCES.includes(added.name))SOURCES.push(added.name);
}
