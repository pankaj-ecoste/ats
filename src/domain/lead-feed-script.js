/* The script an admin pastes into the Google Sheet that collects the ad leads (Extensions > Apps Script). Once a minute it sends the sheet's new
   rows to the database function ingest_leads (migration 0018) and writes what happened in a "Synced to ATS" column, so no row goes twice.
   The script is plain text built here, with the app address, the public key and the secret token filled in. No DOM. */
"use strict";

// words a heading may use for the opening a lead is for (the lead sheet's own opening is used when a row names none)
const LEAD_POSITION_WORDS=['position','jobposition','opening','jobopening','appliedfor','positionappliedfor','postappliedfor','jobrole','vacancy'];

// the script itself. __URL__, __KEY__, __TOKEN__ and __FIELDS__ are replaced by leadFeedScript(). Keep it free of backticks and dollar-brace.
const LEAD_FEED_SCRIPT=String.raw`/* Ecoste Recruit Tracker: sends the new rows of this sheet to the app, once a minute.
   ONE-TIME SETUP: choose installLeadSync in the function list above, click Run, and allow access when Google asks.
   Keep this script private. It holds the secret that lets rows into the app. */

var APP_URL = __URL__;
var APP_KEY = __KEY__;
var APP_TOKEN = __TOKEN__;

var TAB = '';                          // the tab to read. Leave empty for the first tab.
var STATUS_HEADER = 'Synced to ATS';   // the column this script fills in, so a row is never sent twice
var MAP = {};                          // only if a column is not recognised, for example { phone: 'Contact 1', name: 'Full name' }
var BATCH = 100;                       // rows sent in one go
var MAX_BATCHES = 20;                  // per run, so one run stays short

var FIELDS = __FIELDS__;               // what the app reads: [field, [words a heading may use]]

function installLeadSync() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncLeads') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncLeads').timeBased().everyMinutes(1).create();
  syncLeads();
}

function syncLeads() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try { sendNewRows_(); } finally { lock.releaseLock(); }
}

function word_(h) { return String(h).toLowerCase().replace(/[^a-z0-9]/g, ''); }

// which column holds which field: your MAP first, then an exact heading, then a heading that has the word in it
function columns_(heads) {
  var found = {}, used = {};
  function take(key, ok) {
    if (found[key] !== undefined) return;
    for (var i = 0; i < heads.length; i++) {
      if (!used[i] && heads[i] !== '' && ok(i)) { found[key] = i; used[i] = true; return; }
    }
  }
  FIELDS.forEach(function (f) {
    if (MAP[f[0]]) { var at = heads.indexOf(MAP[f[0]]); if (at >= 0 && !used[at]) { found[f[0]] = at; used[at] = true; } }
  });
  FIELDS.forEach(function (f) { take(f[0], function (i) { return f[1].indexOf(word_(heads[i])) >= 0; }); });
  FIELDS.forEach(function (f) {
    take(f[0], function (i) {
      var w = word_(heads[i]), tokens = String(heads[i]).toLowerCase().split(/[^a-z0-9]+/);
      return f[1].some(function (x) { return (x.length >= 6 && w.indexOf(x) >= 0) || tokens.indexOf(x) >= 0; });
    });
  });
  return found;
}

// a cell as plain text: dates as 2026-10-12, whole numbers without an exponent (a phone number must stay a phone number)
function cell_(v, tz) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  if (typeof v === 'number') return String(Math.abs(v) >= 1e6 ? Math.round(v) : v);
  return String(v).trim();
}

function label_(x, tz) {
  var when = Utilities.formatDate(new Date(), tz, 'd MMM HH:mm');
  if (!x) return 'Sent ' + when;
  if (x.status === 'added') return 'Added ' + when;
  if (x.status === 'existing') return 'Added to the opening (already in the app) ' + when;
  if (x.status === 'duplicate') return 'Duplicate: ' + x.why;
  return 'Skipped: ' + x.why;
}

function send_(rows) {
  var resp = UrlFetchApp.fetch(APP_URL + '/rest/v1/rpc/ingest_leads', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: APP_KEY, Authorization: 'Bearer ' + APP_KEY },
    payload: JSON.stringify({ p_token: APP_TOKEN, p_rows: rows })
  });
  var text = resp.getContentText(), body = null;
  try { body = JSON.parse(text); } catch (e) { body = null; }
  if (resp.getResponseCode() !== 200 || !body) throw new Error('The app answered ' + resp.getResponseCode() + ': ' + String(text).slice(0, 300));
  if (!body.ok) throw new Error(body.message);
  return body;
}

function sendNewRows_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = TAB ? ss.getSheetByName(TAB) : ss.getSheets()[0];
  if (!sh) throw new Error('There is no tab called "' + TAB + '"');
  var data = sh.getDataRange().getValues();
  var tz = ss.getSpreadsheetTimeZone();

  // the heading row is the first row with two filled cells
  var h = 0;
  while (h < data.length && data[h].filter(function (c) { return String(c).trim() !== ''; }).length < 2) h++;
  if (h >= data.length) return;
  var heads = data[h].map(function (c) { return String(c).trim(); });
  var st = heads.indexOf(STATUS_HEADER);
  if (st < 0) { st = heads.length; heads.push(STATUS_HEADER); sh.getRange(h + 1, st + 1).setValue(STATUS_HEADER); }

  var cols = columns_(heads);
  if (cols.name === undefined || (cols.phone === undefined && cols.email === undefined)) {
    throw new Error('Cannot find the Name column and a Phone or Email column. Headings found: ' + heads.join(', ') + '. Set MAP at the top of the script.');
  }

  // rows with something in them and nothing in the status column
  var pending = [];
  for (var r = h + 1; r < data.length; r++) {
    var row = data[r];
    var has = row.some(function (c, i) { return i !== st && String(c).trim() !== ''; });
    var done = st < row.length && String(row[st]).trim() !== '';
    if (has && !done) pending.push(r);
  }
  if (!pending.length) return;

  var marks = {};
  try {
    for (var b = 0; b < MAX_BATCHES && b * BATCH < pending.length; b++) {
      var part = pending.slice(b * BATCH, (b + 1) * BATCH);
      var rows = part.map(function (r) {
        var o = {};
        FIELDS.forEach(function (f) { if (cols[f[0]] !== undefined) o[f[0]] = cell_(data[r][cols[f[0]]], tz); });
        return o;
      });
      var res = send_(rows);
      part.forEach(function (r, i) { marks[r] = label_(res.rows[i], tz); });
    }
  } finally {
    // write what happened, also when a later batch failed, so the rows already sent are not sent again
    var first = pending[0], last = pending[pending.length - 1], vals = [], any = false;
    for (var k = first; k <= last; k++) {
      if (marks[k] !== undefined) any = true;
      vals.push([marks[k] !== undefined ? marks[k] : (st < data[k].length ? data[k][st] : '')]);
    }
    if (any) sh.getRange(first + 1, st + 1, vals.length, 1).setValues(vals);
  }
}
`;

// the script for the Settings screen: url is the app's Supabase address, anonKey its public key, token the secret made for this sheet
function leadFeedScript({url,anonKey,token}){
 const fields=LEAD_FIELDS.map(f=>[f.key,f.words]).concat([['position',LEAD_POSITION_WORDS]]);
 return LEAD_FEED_SCRIPT
  .replace('__URL__',()=>JSON.stringify(String(url).replace(/\/+$/,'')))
  .replace('__KEY__',()=>JSON.stringify(String(anonKey)))
  .replace('__TOKEN__',()=>JSON.stringify(String(token)))
  .replace('__FIELDS__',()=>JSON.stringify(fields));
}

// a starting sheet in the format the app understands best: headings and one example row
const LEAD_TEMPLATE_HEADINGS=['Date','Name','Phone','Email','City','Experience (years)','Current company','Current CTC','Expected CTC','Notice period','Campaign','Position'];
function leadTemplateCsv(){
 const row=['12/10/2026','Asha Rao','98765 43210','asha@example.com','Pune','3','Acme Pvt Ltd','6 LPA','8 LPA','1 month','Facebook Ad',''];
 return [LEAD_TEMPLATE_HEADINGS,row].map(r=>r.map(c=>/[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c).join(',')).join('\r\n')+'\r\n';
}
