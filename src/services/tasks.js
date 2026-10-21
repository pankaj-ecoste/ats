/* Tasks. DOM-free. */
"use strict";
function addTask({title,due,priority,related,owner}){
 const t=repo.insert('tasks',{id:uid('T'),title,due,priority,related,owner,done:false});
 if(owner&&owner!==S.settings.user)notify(`New task for you: ${title}`,['tasks'],[owner]);   // given to somebody else: tell them
 return t;
}
function setTaskDone(id,done){return repo.update('tasks',id,{done})}
function deleteTask(id){return repo.remove('tasks',id)}
