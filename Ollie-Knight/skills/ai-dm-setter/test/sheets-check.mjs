// Checks the Google Sheets archive end to end against a stand-in for Google.
// The real Apps Script from web/lib/sheets-script.ts runs here on a small copy of Google's spreadsheet service,
// with tiny limits (5 rows a tab, a few hundred cells a file) so new tabs and new files happen within a few rows.
// Usage: start the app with SETTER_SHEETS_TEST_URL=http://localhost:4510 SETTER_SHEETS_DELAY_MS=300 CRON_SECRET=check
//        on an empty data folder, sign in off, then: node test/sheets-check.mjs http://localhost:3100

import fs from "fs";
import http from "http";
import vm from "vm";

const BASE = (process.argv[2] || "http://localhost:3100").replace(/\/+$/, "");
const PORT = 4510;
const ROWS = 5;
const SOFT = 300;     // the script's CELL_LIMIT here
const HARD = 340;     // what the stand-in Google refuses beyond, like the real 10 million

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + String(extra).slice(0, 400)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- stand-in for Google's spreadsheet service ----------
const files = [];
const props = {};
const total = (ss) => ss.sheets.reduce((n, s) => n + s.maxRows * s.maxCols, 0);
const room = (ss, add) => { if (total(ss) + add > HARD) throw new Error("This action would increase the number of cells in the workbook above the limit of 10000000 cells."); };

class Sheet {
  constructor(ss, name, rows, cols) { Object.assign(this, { ss, name, maxRows: rows, maxCols: cols, data: [], frozen: 0 }); }
  getName() { return this.name; }
  setName(n) { if (this.ss.sheets.some((s) => s !== this && s.name === n)) throw new Error(`A sheet with the name "${n}" already exists.`); this.name = n; return this; }
  getParent() { return this.ss; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  getLastRow() { for (let i = this.data.length - 1; i >= 0; i--) if (this.data[i]?.some((v) => v !== "" && v !== undefined)) return i + 1; return 0; }
  deleteColumns(start, n) { if (start + n - 1 > this.maxCols) throw new Error("Those columns are out of bounds."); this.maxCols -= n; this.data = this.data.map((r) => r && r.slice(0, this.maxCols)); }
  insertColumnsAfter(_a, n) { room(this.ss, n * this.maxRows); this.maxCols += n; }
  deleteRows(start, n) {
    if (start + n - 1 > this.maxRows) throw new Error("Those rows are out of bounds.");
    if (this.maxRows - n <= this.frozen) throw new Error("Sorry, it is not possible to delete all non-frozen rows.");
    this.maxRows -= n; this.data.splice(start - 1, n);
  }
  insertRowsAfter(_a, n) { room(this.ss, n * this.maxCols); this.maxRows += n; }
  setFrozenRows(n) { this.frozen = n; }
  getRange(r, c, nr, nc) {
    const s = this;
    if (r < 1 || c < 1 || r + nr - 1 > s.maxRows || c + nc - 1 > s.maxCols) throw new Error("The coordinates of the range are outside the dimensions of the sheet.");
    return {
      setValues(v) {
        if (v.length !== nr || v.some((row) => row.length !== nc)) throw new Error(`The number of rows or columns in the data does not match the range.`);
        v.forEach((row, i) => { const t = (s.data[r - 1 + i] ??= []); row.forEach((x, j) => { t[c - 1 + j] = typeof x === "string" && x.startsWith("'") ? x.slice(1) : x; }); });
        return this;
      },
      getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => s.data[r - 1 + i]?.[c - 1 + j] ?? "")); },
      setFontWeight() { return this; },
    };
  }
}
class Spreadsheet {
  constructor(name, rows, cols) { this.id = "file" + (files.length + 1); this.name = name; this.sheets = []; this.sheets.push(new Sheet(this, "Sheet1", rows, cols)); room(this, 0); }
  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }
  getSheets() { return [...this.sheets]; }
  insertSheet() { room(this, 26000 > HARD ? 0 : 26000); const s = new Sheet(this, "Sheet" + (this.sheets.length + 1), 1000, 26); this.sheets.push(s); return s; }
}
const google = {
  SpreadsheetApp: {
    create(name, rows = 1000, cols = 26) { const ss = new Spreadsheet(name, rows, cols); files.push(ss); return ss; },
    openById(id) { const ss = files.find((f) => f.id === id); if (!ss) throw new Error("No file " + id); return ss; },
    flush() {},
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: "json" }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
};

// The new tab that insertSheet makes is 1000 x 26, which the tiny limit here cannot hold before it is trimmed.
// Real Google counts it too, so the stand-in lets it through the way 26,000 cells fit in 10 million.
const src = fs.readFileSync(new URL("../web/lib/sheets-script.ts", import.meta.url), "utf8");
let code = src.slice(src.indexOf("String.raw`") + 11, src.lastIndexOf("`;"));
code = code.replace("var ROWS_PER_TAB = 50000;", `var ROWS_PER_TAB = ${ROWS};`).replace("var CELL_LIMIT = 9000000;", `var CELL_LIMIT = ${SOFT};`);

const ctx = vm.createContext({ ...google, JSON, Math, String, Number, Array });
let secret = "";
const results = new Map();
let calls = 0;
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method === "POST" && req.url.startsWith("/exec")) {
      calls++;
      const out = ctx.doPost({ postData: { contents: body } });
      // Like Apps Script: the POST answers with a redirect, the result is fetched with a GET.
      const id = String(calls);
      results.set(id, out.text);
      res.writeHead(302, { location: `http://localhost:${PORT}/echo?id=${id}` }).end();
    } else if (req.url.startsWith("/echo")) {
      res.writeHead(200, { "content-type": "application/json" }).end(results.get(new URL(req.url, "http://x").searchParams.get("id")) ?? "{}");
    } else res.writeHead(404).end("<html>not here</html>");
  });
});
await new Promise((r) => server.listen(PORT, r));

async function call(path, method = "GET", body, headers = {}) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { text }; }
  return { ...data, status: r.status, _text: text };
}
const tabs = (kind) => files.flatMap((f) => f.sheets.filter((s) => s.name === kind || s.name.startsWith(kind + " ")).map((s) => ({ file: f.name, s })));
const rowsOf = (kind) => tabs(kind).flatMap(({ s }) => s.data.slice(1).filter((r) => r?.some((v) => v !== "")));

try {
  // ---------- script and connecting ----------
  let r = await call("/api/sheets");
  ok("script can be copied from Settings", r.status === 200 && r.script?.includes("function doPost"), r._text.slice(0, 200));
  secret = (r.script.match(/var SECRET = "([^"]+)"/) || [])[1] || "";
  ok("script carries this workspace's own secret", secret.length >= 20 && secret !== "__SECRET__", secret);
  vm.runInContext(code.replace("__SECRET__", secret), ctx);

  r = await call("/api/sheets", "POST", { action: "connect", url: "https://example.com/not-google" });
  ok("an address that is not Apps Script is refused", r.status >= 400 && /script\.google\.com/.test(r.error || ""), r._text);
  r = await call("/api/sheets", "POST", { action: "connect", url: `http://localhost:${PORT}/nope` });
  ok("a page that is not the script is refused in plain words", r.status >= 400 && /web page|Unexpected/.test(r.error || ""), r._text);
  const wrong = ctx.doPost({ postData: { contents: JSON.stringify({ secret: "guess", messages: [["x"]] }) } });
  ok("the script refuses a wrong secret", /Wrong archive secret/.test(wrong.text), wrong.text);

  r = await call("/api/sheets", "POST", { action: "connect", url: `http://localhost:${PORT}/exec` });
  ok("connecting works and creates the first spreadsheet", r.status === 200 && r.sheets?.enabled && files.length === 1, r._text.slice(0, 300));
  ok("demo conversations are not sent", rowsOf("Messages").length === 0 && rowsOf("Leads").length === 0, rowsOf("Messages").length);
  const first = files[0];
  ok("first file has Leads, Messages and Events tabs", ["Leads", "Messages", "Events"].every((n) => first.sheets.some((s) => s.name === n)), first.sheets.map((s) => s.name));
  ok("headers are written and frozen", first.sheets.every((s) => s.data[0]?.[0] && s.frozen === 1));

  // ---------- new leads and messages flow across on their own ----------
  const st = await call("/api/state");
  const token = st.workspace?.apiToken;
  const auth = { authorization: `Bearer ${token}` };
  const stamp = Date.now().toString(36);
  const day = 864e5;
  const old = (d, m) => new Date(Date.now() - d * day + m * 60000).toISOString();
  const ids = [];
  for (let t = 0; t < 3; t++) {
    const thread = { externalId: `sheet-${stamp}-${t}`, name: `Sheet Lead ${t}`, handle: `sheet_lead_${stamp}_${t}` };
    const messages = [];
    // 6 messages about 100 days old, then 4 from today
    for (let i = 0; i < 6; i++) messages.push({ direction: i % 2 ? "out" : "in", text: `old ${t}.${i}`, sentAt: old(100, i), order: i });
    for (let i = 0; i < 4; i++) messages.push({ direction: i % 2 ? "out" : "in", text: i === 2 && t === 0 ? "=IMPORTXML(\"http://x\")" : `new ${t}.${i}`, sentAt: old(0, -10 + i), order: 6 + i });
    const g = await call("/api/ext/ingest", "POST", { platform: "instagram", thread, messages }, auth);
    ids.push(g.conversationId);
    ok(`thread ${t} captured`, g.status === 200 && g.added === 10, g._text.slice(0, 200));
  }
  for (let i = 0; i < 40 && rowsOf("Messages").length < 30; i++) await sleep(250);
  const msgs = rowsOf("Messages");
  ok("all 30 messages reached the sheet without being asked", msgs.length === 30, msgs.length);
  ok("no message was written twice", new Set(msgs.map((m) => m[8])).size === msgs.length);
  ok("3 leads written, one row each", rowsOf("Leads").length === 3, rowsOf("Leads").length);
  ok("stage changes and starts are in Events", rowsOf("Events").length >= 3, rowsOf("Events").length);
  ok(`a new tab starts every ${ROWS} rows`, tabs("Messages").every(({ s }) => s.getLastRow() - 1 <= ROWS) && tabs("Messages").length >= 6, tabs("Messages").map(({ s }) => s.name + ":" + (s.getLastRow() - 1)));
  ok("a new spreadsheet file starts before the cell limit", files.length >= 2 && files.every((f) => total(f) <= HARD), files.map((f) => f.name + ":" + total(f)));
  ok("tab numbers carry on across files", new Set(tabs("Messages").map(({ s }) => s.name)).size === tabs("Messages").length, tabs("Messages").map((x) => x.file + "/" + x.s.name));
  ok("leads stay in the first file", tabs("Leads").every(({ file }) => file === first.name));
  const inj = msgs.find((m) => String(m[6]).includes("IMPORTXML"));
  ok("a message that looks like a formula is kept as text", inj && inj[6] === "=IMPORTXML(\"http://x\")", inj?.[6]);
  ok("rows land in time order within each thread", ids.every((id) => { const t = msgs.filter((m) => m[1] === id).map((m) => m[0]); return t.join() === [...t].sort().join(); }));

  r = await call("/api/sheets", "POST", { action: "sync" });
  ok("sending again sends nothing new", r.status === 200 && r.sent === 0, r._text.slice(0, 200));
  ok("Settings lists every spreadsheet file", r.sheets?.files?.length === files.length, JSON.stringify(r.sheets?.files));

  // ---------- a lead that changes is updated in place ----------
  await call(`/api/conversations/${ids[1]}`, "PATCH", { stage: "qualified" });
  await sleep(1500);
  await call("/api/sheets", "POST", { action: "sync" });
  const leads = rowsOf("Leads");
  const row = leads.find((l) => l[0] === ids[1]);
  ok("a changed lead is updated, not added again", leads.length === 3 && row && /qualif/i.test(row[6]), JSON.stringify(row?.slice(0, 8)));

  // ---------- moving old messages out of the database ----------
  const before = await call("/api/insights?period=monthly");
  const sum = (x, k) => (x.series || []).reduce((n, b) => n + (b[k] || 0), 0);
  await call("/api/sheets", "POST", { action: "settings", keepDays: 90, keepPerThread: 5 });
  r = await call("/api/sheets", "POST", { action: "prune" });
  ok("old messages leave the database once they are in the sheet", r.status === 200 && r.pruned === 15, r._text.slice(0, 200));
  const after = await call("/api/insights?period=monthly");
  ok("insights still count the moved messages", ["messagesReceived", "messagesSent"].every((k) => sum(before, k) === sum(after, k)), JSON.stringify(["messagesReceived", "messagesSent"].map((k) => [sum(before, k), sum(after, k)])));
  const conv = await call(`/api/conversations/${ids[0]}`);
  const kept = (conv.messages || []).length;
  ok("the newest messages of every thread stay for the AI", kept === 5, kept);
  ok("the sheet still has every message", rowsOf("Messages").length === 30);
  const lr = rowsOf("Leads").find((l) => l[0] === ids[0]);
  ok("a lead's message count still includes moved messages", lr && Number(lr[23]) === 10, lr?.[23]);
  const dup = ctx.doPost({ postData: { contents: JSON.stringify({ secret, messages: msgs.slice(-3) }) } });
  ok("a batch that arrives twice is not written twice", /"ok":true/.test(dup.text) && rowsOf("Messages").length === 30, rowsOf("Messages").length);

  const again = await call("/api/ext/ingest", "POST", { platform: "instagram", thread: { externalId: `sheet-${stamp}-0`, name: "Sheet Lead 0", handle: `sheet_lead_${stamp}_0` }, messages: Array.from({ length: 6 }, (_, i) => ({ direction: i % 2 ? "out" : "in", text: `old 0.${i}`, sentAt: null, order: i })) }, auth);
  ok("capturing the old history again does not bring it back", again.status === 200 && again.added === 0, again._text.slice(0, 200));

  // ---------- nightly job ----------
  r = await call("/api/cron/sheets");
  ok("the nightly job refuses calls without Vercel's secret", r.status === 401, r.status);
  const counts = () => ["Leads", "Messages", "Events"].map((k) => rowsOf(k).length).join("/");
  const c0 = counts();
  r = await call("/api/cron/sheets", "GET", undefined, { authorization: "Bearer check" });
  r._text += " rows " + c0 + " -> " + counts() + " " + JSON.stringify(rowsOf("Events").slice(-1));
  // A lead whose details changed may be refreshed in place; no message or event may be written twice.
  ok("the nightly job runs with it", r.status === 200 && r.pruned === 0 && counts() === c0, r._text.slice(0, 300));

  // ---------- switching off ----------
  await call("/api/sheets", "POST", { action: "settings", enabled: false });
  const n = rowsOf("Messages").length;
  await call("/api/ext/ingest", "POST", { platform: "instagram", thread: { externalId: `sheet-${stamp}-0`, name: "Sheet Lead 0", handle: `sheet_lead_${stamp}_0` }, messages: [{ direction: "in", text: "while off", sentAt: new Date().toISOString(), order: 99 }] }, auth);
  await sleep(1500);
  ok("nothing is sent while the archive is switched off", rowsOf("Messages").length === n);
  r = await call("/api/sheets", "POST", { action: "prune" });
  ok("tidying up is refused while switched off", r.status >= 400, r.status);
  const pub = await call("/api/state");
  ok("the secret never reaches the browser", !JSON.stringify(pub).includes(secret));
} catch (e) {
  ok("check ran to the end", false, e.stack);
} finally {
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
