/* Openings. DOM-free. */
"use strict";
// id: the opening being edited, or falsy to create `data` as a new opening
function saveOpening(data,id){
 if(id)return repo.update('openings',id,data);
 const o=repo.insert('openings',data);
 log(`Opening ${o.title} created`,'opening');
 return o;
}
