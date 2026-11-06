/* Bootstrap. Must load last. */
"use strict";
applyTheme();
if(CONNECTED)bootAuth();   // sign in first, then the app draws itself
else{document.body.classList.remove('signed-out');hideAuth();applyHash();render()}            // demo mode: no server configured, data stays in this browser
