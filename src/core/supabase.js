/* The browser's connection to Supabase. With no config (demo mode) there is none: the app keeps its data in this browser. */
"use strict";
// globalThis.__APP_CONFIG_OVERRIDE lets a test point the app at a project without regenerating the config file
const APP_SETTINGS=globalThis.__APP_CONFIG_OVERRIDE||APP_CONFIG;
const CONNECTED=!!(APP_SETTINGS.supabaseUrl&&APP_SETTINGS.anonKey&&typeof supabase!=='undefined');
// `let`, so a unit test can swap in a fake client
let sb=CONNECTED?supabase.createClient(APP_SETTINGS.supabaseUrl,APP_SETTINGS.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}):null;
