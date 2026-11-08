// The Apps Script the owner pastes into script.google.com and deploys as a web app.
// It runs in their own Google account, so the sheets are theirs and no Google key is needed here.
// __SECRET__ is replaced with the workspace's archive secret when the owner copies it from Settings.
// test/sheets-check.mjs runs this file against a stand-in for Google's spreadsheet service.

export const SHEETS_SCRIPT = String.raw`// Ainable Setter archive. Paste this into a new Apps Script project, then Deploy, New deployment, Web app.
// Execute as: Me. Who has access: Anyone. Copy the web app URL into Ainable Setter, Settings, Google Sheets.
var SECRET = "__SECRET__";
var ROWS_PER_TAB = 50000;   // a new tab starts when one holds this many rows
var CELL_LIMIT = 9000000;   // Google allows 10,000,000 cells per spreadsheet; a new file starts before that
var NAME = "Ainable Setter archive";

var HEAD = {
  Leads: ["Lead ID", "Name", "Instagram handle", "Platform", "Profile link", "Source", "Stage", "Tags", "Status", "AI mode", "Setter", "Email", "Phone",
    "Situation", "Goal", "Pain", "Objections", "Budget", "Summary", "Next step", "Notes", "Loss reason", "Link sent", "Messages",
    "First contact", "Last message", "Last message from lead", "Open in app"],
  Messages: ["Time", "Lead ID", "Name", "Handle", "Direction", "Sent by", "Message", "Captured from", "Message ID"],
  Events: ["Time", "Lead ID", "Name", "What happened", "Stage", "Detail", "By", "Event ID"]
};

function doGet() {
  return out({ ok: true, script: "ainable-setter-archive" });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (x) { return out({ ok: false, error: "Not JSON" }); }
  if (body.secret !== SECRET) return out({ ok: false, error: "Wrong archive secret. Copy the script again from Ainable Setter and redeploy." });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(60000);
    // Connecting makes the first spreadsheet straight away, so the owner can open it.
    if (body.ping) firstFile();
    else {
      if (body.leads && body.leads.length) upsertLeads(body.leads);
      if (body.messages && body.messages.length) append("Messages", body.messages);
      if (body.events && body.events.length) append("Events", body.events);
      SpreadsheetApp.flush();
    }
    return out({ ok: true, files: files() });
  } catch (x) {
    return out({ ok: false, error: String(x && x.message || x) });
  } finally {
    lock.releaseLock();
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Spreadsheet files in order. Leads always live in the first; messages and events go to the newest.
function ids() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty("files") || "[]");
}

function newFile() {
  var list = ids();
  var ss = SpreadsheetApp.create(list.length ? NAME + " " + (list.length + 1) : NAME, 2, HEAD.Leads.length);
  var first = ss.getSheets()[0];
  if (list.length) {
    setUp(first, "Messages");
  } else {
    setUp(first, "Leads");
    addTab(ss, "Messages");
  }
  addTab(ss, "Events");
  list.push(ss.getId());
  PropertiesService.getScriptProperties().setProperty("files", JSON.stringify(list));
  return ss;
}

function files() {
  return ids().map(function (id, i) {
    var ss = SpreadsheetApp.openById(id);
    return { name: ss.getName(), url: ss.getUrl() };
  });
}

function firstFile() {
  var list = ids();
  return list.length ? SpreadsheetApp.openById(list[0]) : newFile();
}

function latestFile() {
  var list = ids();
  return list.length ? SpreadsheetApp.openById(list[list.length - 1]) : newFile();
}

function cells(ss) {
  return ss.getSheets().reduce(function (n, s) { return n + s.getMaxRows() * s.getMaxColumns(); }, 0);
}

// A tab sized to its columns, header frozen, one empty row ready.
function setUp(sheet, kind) {
  var cols = HEAD[kind].length;
  sheet.setName(tabName(sheet.getParent(), kind));
  if (sheet.getMaxColumns() > cols) sheet.deleteColumns(cols + 1, sheet.getMaxColumns() - cols);
  if (sheet.getMaxColumns() < cols) sheet.insertColumnsAfter(sheet.getMaxColumns(), cols - sheet.getMaxColumns());
  if (sheet.getMaxRows() > 2) sheet.deleteRows(3, sheet.getMaxRows() - 2);
  sheet.getRange(1, 1, 1, cols).setValues([HEAD[kind]]).setFontWeight("bold");
  sheet.setFrozenRows(1);
  return sheet;
}

function addTab(ss, kind) {
  return setUp(ss.insertSheet(), kind);
}

function tabsOf(ss, kind) {
  return ss.getSheets().filter(function (s) { return s.getName() === kind || s.getName().indexOf(kind + " ") === 0; });
}

// Tabs are numbered across files: Messages, Messages 2, Messages 3 and so on.
function tabName(ss, kind) {
  var n = Number(PropertiesService.getScriptProperties().getProperty("n_" + kind) || "0") + 1;
  PropertiesService.getScriptProperties().setProperty("n_" + kind, String(n));
  return n === 1 ? kind : kind + " " + n;
}

function used(sheet) {
  return Math.max(sheet.getLastRow() - 1, 0);
}

// Room is made before writing: more rows on the tab, a new tab, or a new file.
function write(ss, sheet, rows) {
  var start = sheet.getLastRow() + 1;
  var need = start + rows.length - 1 - sheet.getMaxRows();
  if (need > 0) sheet.insertRowsAfter(sheet.getMaxRows(), need);
  sheet.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}

// IDs in the last rows written, so a batch that arrives twice (two sends racing) is not written twice.
function recentIds(kind) {
  var ss = latestFile();
  var tabs = tabsOf(ss, kind).slice(-2);
  var cols = HEAD[kind].length;
  var seen = {};
  tabs.forEach(function (s) {
    var n = Math.min(used(s), 5000);
    if (n) s.getRange(s.getLastRow() - n + 1, cols, n, 1).getValues().forEach(function (v) { seen[v[0]] = true; });
  });
  return seen;
}

function append(kind, rows) {
  var cols = HEAD[kind].length;
  var seen = recentIds(kind);
  rows = rows.map(function (r) { return r.slice(0, cols).concat(new Array(Math.max(0, cols - r.length)).fill("")); })
    .filter(function (r) { return !seen[r[cols - 1]]; });
  while (rows.length) {
    var ss = latestFile();
    var tabs = tabsOf(ss, kind);
    var sheet = tabs[tabs.length - 1];
    var room = sheet ? ROWS_PER_TAB - used(sheet) : 0;
    if (room <= 0) {
      if (cells(ss) + 2 * cols + Math.min(rows.length, ROWS_PER_TAB) * cols > CELL_LIMIT) ss = newFile();
      tabs = tabsOf(ss, kind);
      sheet = tabs.length && used(tabs[tabs.length - 1]) < ROWS_PER_TAB ? tabs[tabs.length - 1] : addTab(ss, kind);
      room = ROWS_PER_TAB - used(sheet);
    }
    var fits = Math.floor((CELL_LIMIT - cells(ss)) / cols) + (sheet.getMaxRows() - sheet.getLastRow());
    var take = Math.min(room, rows.length, fits);
    if (take <= 0) { newFile(); continue; }
    write(ss, sheet, rows.slice(0, take));
    rows = rows.slice(take);
  }
}

// One row per lead, updated in place. A new lead goes on the last Leads tab, or a new one when it is full.
function upsertLeads(rows) {
  var ss = firstFile();
  var cols = HEAD.Leads.length;
  var tabs = tabsOf(ss, "Leads");
  if (!tabs.length) tabs = [addTab(ss, "Leads")];
  var at = {};
  tabs.forEach(function (s, t) {
    var n = used(s);
    if (!n) return;
    s.getRange(2, 1, n, 1).getValues().forEach(function (v, i) { at[v[0]] = [t, i + 2]; });
  });
  var fresh = [];
  rows.forEach(function (r) {
    r = r.slice(0, cols);
    var p = at[r[0]];
    if (p) tabs[p[0]].getRange(p[1], 1, 1, cols).setValues([r]);
    else fresh.push(r);
  });
  while (fresh.length) {
    var sheet = tabs[tabs.length - 1];
    var room = ROWS_PER_TAB - used(sheet);
    if (room <= 0) { sheet = addTab(ss, "Leads"); tabs.push(sheet); room = ROWS_PER_TAB; }
    var take = Math.min(room, fresh.length);
    write(ss, sheet, fresh.slice(0, take));
    fresh = fresh.slice(take);
  }
}
`;
