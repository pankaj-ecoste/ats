/* Reading loosely typed spreadsheet values: stable short hash, numbers inside text, salaries as LPA, notice period in days. No DOM. */
"use strict";
const h36=v=>{let h=5381;for(const ch of String(v))h=((h<<5)+h+ch.charCodeAt(0))>>>0;return h.toString(36).toUpperCase()};
const numIn=v=>{const n=parseFloat(String(v).replace(/,/g,'').match(/-?\d+(\.\d+)?/)?.[0]);return isNaN(n)?null:n};
function toLPA(v){if(v===''||v==null)return 0;const s=String(v).toLowerCase();let n=numIn(s);if(n==null)return 0;if(/lakh|lac|lpa|\bl\b/.test(s))return n;if(/k\b|thousand/.test(s))n*=1000;if(/month|pm|p\.m/.test(s))n*=12;return n>=1000?Math.round(n/1000)/100:n}
function toNotice(v){const s=String(v||'').toLowerCase();if(!s)return 30;if(/immediate|serving|0/.test(s)&&!numIn(s))return 0;const n=numIn(s);if(n==null)return 30;return /month/.test(s)?n*30:/week/.test(s)?n*7:n}
