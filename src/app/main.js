/* Bootstrap. Must load last. */
"use strict";
applyTheme();
if(CONNECTED)bootAuth();   // sign in first, then the app draws itself
else{applyHash();render()}            // demo mode: no server configured, data stays in this browser
