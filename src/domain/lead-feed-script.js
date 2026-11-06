/* The script an admin pastes into the Google workbook that collects the ad leads (Extensions > Apps Script). Once a minute it
     1. reports every tab (its name and headings) to the app, so the app can offer the tabs when an opening links one;
     2. asks which tabs are linked to an opening, and with which columns and source (migration 0023, sheet_sync_plan);
     3. sends the new rows of the linked tabs (ingest_tab_leads) and writes what happened in a "Synced to ATS" column, so no row goes twice.
   Tabs that are not linked are only read for their headings and never changed. The script is plain text built here, with the app address,
   the public key and the secret token filled in. No DOM. */
"use strict";

// the script itself. __URL__, __KEY__ and __TOKEN__ are replaced by leadFeedScript(). Keep it free of backticks and dollar-brace.
const LEAD_FEED_SCRIPT=String.raw`/* Ecoste Recruit Tracker: sends the new leads of the linked tabs of this workbook to the app, once a minute.
   ONE-TIME SETUP: choose installLeadSync in the function list above, click Run, and allow access when Google asks.
   Which tab belongs to which opening is set in the app, on the opening ("Link a sheet"). Nothing needs changing here.
   Keep this script private. It holds the secret that lets rows into the app. */

var APP_URL = __URL__;
var APP_KEY = __KEY__;
var APP_TOKEN = __TOKEN__;

var STATUS_HEADER = 'Synced to ATS';   // the column this script fills in (on linked tabs only), so a row is never sent twice
var BATCH = 100;                       // rows sent in one go
var MAX_BATCHES = 20;                  // per tab and run, so one run stays short
var HEADING_ROWS = 10;                 // how far down a tab is looked at to find its headings

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
  try { run_(); } finally { lock.releaseLock(); }
}

// a cell as plain text: dates as 2026-10-12, whole numbers without an exponent (a phone number must stay a phone number)
function cell_(v, tz) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  if (typeof v === 'number') return String(Math.abs(v) >= 1e6 ? Math.round(v) : v);
  return String(v).trim();
}

// the heading row is the first row with two filled cells; -1 when there is none
function headingRow_(rows) {
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].filter(function (c) { return String(c).trim() !== ''; }).length >= 2) return i;
  }
  return -1;
}

// what the app needs to know about a tab: a key that survives a rename, its name and its headings
function tabInfo_(ss, sh) {
  var info = { key: ss.getId() + '/' + sh.getSheetId(), name: sh.getName(), headings: [], sheet: sh };
  var rows = sh.getLastRow(), cols = sh.getLastColumn();
  if (!rows || !cols) return info;
  var top = sh.getRange(1, 1, Math.min(rows, HEADING_ROWS), cols).getValues();
  var h = headingRow_(top);
  if (h < 0) return info;
  info.headings = top[h].map(function (c) { return String(c).trim(); }).filter(function (c) { return c !== '' && c !== STATUS_HEADER; });
  return info;
}

function call_(fn, payload) {
  var resp = UrlFetchApp.fetch(APP_URL + '/rest/v1/rpc/' + fn, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: APP_KEY, Authorization: 'Bearer ' + APP_KEY },
    payload: JSON.stringify(payload)
  });
  var text = resp.getContentText(), body = null;
  try { body = JSON.parse(text); } catch (e) { body = null; }
  if (resp.getResponseCode() !== 200 || !body) throw new Error('The app answered ' + resp.getResponseCode() + ': ' + String(text).slice(0, 300));
  if (!body.ok) throw new Error(body.message);
  return body;
}

function label_(x, tz) {
  var when = Utilities.formatDate(new Date(), tz, 'd MMM HH:mm');
  if (!x) return 'Sent ' + when;
  if (x.status === 'added') return 'Added ' + when;
  if (x.status === 'existing') return 'Added to the opening (already in the app) ' + when;
  if (x.status === 'duplicate') return 'Duplicate: ' + x.why;
  return 'Skipped: ' + x.why;
}

function run_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = ss.getSheets().map(function (sh) { return tabInfo_(ss, sh); });
  var byKey = {};
  tabs.forEach(function (t) { byKey[t.key] = t; });
  var plan = call_('sheet_sync_plan', {
    p_token: APP_TOKEN,
    p_tabs: tabs.filter(function (t) { return t.headings.length > 0; }).map(function (t) { return { key: t.key, name: t.name, book: ss.getName(), headings: t.headings }; })
  });
  var problems = [];
  (plan.links || []).forEach(function (link) {
    var tab = byKey[link.key];
    if (!tab) return;
    // one tab failing must not stop the others
    try { sendTab_(ss, tab, link); } catch (e) { problems.push('"' + link.name + '": ' + e.message); }
  });
  if (problems.length) throw new Error(problems.join(' | '));
}

function sendTab_(ss, tab, link) {
  var sh = tab.sheet;
  var tz = ss.getSpreadsheetTimeZone();
  var data = sh.getDataRange().getValues();
  var h = headingRow_(data);
  if (h < 0) return;
  var heads = data[h].map(function (c) { return String(c).trim(); });
  var st = heads.indexOf(STATUS_HEADER);
  if (st < 0) { st = heads.length; heads.push(STATUS_HEADER); sh.getRange(h + 1, st + 1).setValue(STATUS_HEADER); }

  // the columns chosen in the app: a heading for each field, and the extra headings kept as form answers
  var fields = [], extras = [];
  Object.keys(link.map || {}).forEach(function (f) {
    var name = link.map[f];
    if (!name) return;
    var at = heads.indexOf(name);
    if (at < 0) throw new Error('the column "' + name + '" is not in this tab any more. Choose the columns again in the app');
    fields.push([f, at]);
  });
  (link.extra || []).forEach(function (name) {
    var at = heads.indexOf(name);
    if (at >= 0) extras.push([name, at]);
  });

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
        var o = { answers: {} };
        fields.forEach(function (f) { o[f[0]] = cell_(data[r][f[1]], tz); });
        extras.forEach(function (x) { var v = cell_(data[r][x[1]], tz); if (v !== '') o.answers[x[0]] = v; });
        return o;
      });
      var res = call_('ingest_tab_leads', { p_token: APP_TOKEN, p_tab_key: link.key, p_rows: rows });
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

// the script for the Settings screen: url is the app's Supabase address, anonKey its public key, token the secret made for this connection
function leadFeedScript({url,anonKey,token}){
 return LEAD_FEED_SCRIPT
  .replace('__URL__',()=>JSON.stringify(String(url).replace(/\/+$/,'')))
  .replace('__KEY__',()=>JSON.stringify(String(anonKey)))
  .replace('__TOKEN__',()=>JSON.stringify(String(token)));
}
