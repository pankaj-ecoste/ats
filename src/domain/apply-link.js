/* The application link of a job post: the app's own careers page, with the platform the post goes on in the link (careers.html#OP-1001?src=LinkedIn).
   The careers page sends that platform with the application, so the app knows where each person came from. Pure, no DOM. */
"use strict";

// the careers page sits next to the app, whatever path, hash or query the app was opened with
function careersUrl(href){try{return new URL('careers.html',href).href.split('#')[0].split('?')[0]}catch(e){return ''}}

// base: careersUrl(...). The careers page itself and a link with no platform need no source in the link.
function applyLinkFor(base,openingId,src){
 if(!base||!openingId)return '';
 return `${base}#${encodeURIComponent(openingId)}${src&&src!=='Careers Page'?'?src='+encodeURIComponent(src):''}`;
}
