/* Tasks. DOM-free. */
"use strict";
function addTask({title,due,priority,related,owner}){
 return repo.insert('tasks',{id:uid('T'),title,due,priority,related,owner,done:false});
}
function setTaskDone(id,done){return repo.update('tasks',id,{done})}
function deleteTask(id){return repo.remove('tasks',id)}
