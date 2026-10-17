/* Files in the private storage buckets (résumés, candidate documents, offer letters). Only used in connected mode.
   A file is uploaded straight away (the person waits for it), and the record that points at it is then saved like any other change. */
"use strict";
const FILE_BUCKETS={resume:'resumes',document:'documents',letter:'offer-letters'};
const SIGNED_LINK_SECONDS=120;

// a storage name that is safe in a path: letters, digits, dots, dashes, underscores; accents removed; at most 80 characters from the end (the extension stays)
const safeFileName=name=>String(name||'file').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w.\- ]+/g,'').trim().replace(/\s+/g,'_').slice(-80)||'file';
// folder is the candidate id or application id: the access rules read it from the path (migration 0012)
const storagePath=(folder,name)=>`${folder}/${uid('F')}-${safeFileName(name)}`;

function fileError(error,what){
 const m=String((error&&error.message)||error||''),status=error&&(error.statusCode||error.status);
 let text;
 if(/row-level security|not authorized|unauthorized|permission/i.test(m)||status==403||status==401)text='You do not have permission to do that.';
 else if(/too large|exceeded the maximum|413/i.test(m)||status==413)text='The file is larger than the allowed size.';
 else if(/mime type|not supported|invalid_mime/i.test(m))text='This kind of file is not allowed here.';
 else if(/not found|object not found/i.test(m)||status==404)text='The file could not be found. It may have been removed.';
 else if(/failed to fetch|network|load failed/i.test(m))text='Cannot reach the server. Check your internet connection and try again.';
 else text=m||'Something went wrong.';
 return new Error(`Could not ${what}. ${text}`);
}

// returns the path the file was stored under
async function uploadFile(client,bucket,folder,file){
 const path=storagePath(folder,file.name);
 const {error}=await client.storage.from(bucket).upload(path,file,{contentType:file.type||undefined,upsert:false});
 if(error)throw fileError(error,'upload the file');
 return path;
}
// a link that works for two minutes, so a copied link does not stay valid
async function fileLink(client,bucket,path){
 const {data,error}=await client.storage.from(bucket).createSignedUrl(path,SIGNED_LINK_SECONDS);
 if(error)throw fileError(error,'open the file');
 return data.signedUrl;
}
async function removeFile(client,bucket,path){
 if(!path)return;
 const {error}=await client.storage.from(bucket).remove([path]);
 if(error)throw fileError(error,'remove the file');
}
