/* CTC to salary-component split */
"use strict";
function autoSplit(ctc){
 const basic=Math.round(ctc*.40),hra=Math.round(ctc*.20),bonus=Math.round(ctc*.10),other=Math.round(ctc*.05);
 return {basic,hra,special:ctc-basic-hra-bonus-other,other,bonus};
}
