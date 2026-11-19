// Measures what a server start really pulls out of the database, and checks the cheaper start is still correct.
// Usage: ENV_FILE=<file with SUPA_POSTGRES_URL> node test/egress-check.mjs
//   SKIP_TABLES=1   leave out the part that writes to its own test tables (measure the live store only)
//
// Bytes are counted on the network socket itself, under the encryption, so they are what the host sees leave.
// Packet headers are not in the count (see the note printed with the estimates).
//
// What it touches:
//   live tables     READ ONLY. Every statement sent while the live tables are in use is checked before it goes:
//                   anything that is not a plain select, or a transaction that is not read only, stops the run.
//                   Cost of one run: two full reads of the store, about 9 MB of the monthly allowance.
//   test tables     setter_test_coldstart, _meta and _del, created, written and dropped by this script.

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, "..", "web");
const require = createRequire(path.join(web, "package.json"));
const ts = require("typescript");
const { Client } = require("pg");

const env = { ...process.env };
if (env.ENV_FILE) {
  for (const l of fs.readFileSync(env.ENV_FILE, "utf8").split("\n")) {
    const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
const LIVE = env.SUPA_POSTGRES_URL;
if (!LIVE) {
  console.error("Set ENV_FILE to a file holding SUPA_POSTGRES_URL.");
  process.exit(1);
}
// The app picks its database from these, first one set wins. Only the live address is given to it.
for (const k of ["SETTER_PG_URL", "SUPA_POSTGRES_URL", "SETTER_DATABASE_URL", "DATABASE_URL", "SETTER_STORE_TABLE", "SETTER_PLAIN_LOAD"]) delete process.env[k];
process.env.SETTER_PG_URL = LIVE;

const TEST = "setter_test_coldstart";
const GB = 1000 * 1000 * 1000;
const EGRESS_LIMIT = 5 * GB;

// ---------- counting bytes ----------
// The database driver opens a plain network socket and then switches encryption on over it, so noting every
// plain socket as it connects is enough to see every byte, including the encryption handshake and sign in.
const sockets = new Set();
const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...a) {
  if (this.constructor === net.Socket) sockets.add(this);
  return realConnect.apply(this, a);
};
const wire = () => [...sockets].reduce((t, s) => ({ in: t.in + s.bytesRead, out: t.out + s.bytesWritten }), { in: 0, out: 0 });

// ---------- loading the app's own storage code ----------
// hosted.ts and pg.ts are TypeScript, so they are compiled in memory. Each call gives a separate copy with its own
// memory and its own connection, the way Vercel starts a new copy of the server.
const compile = (file) => ts.transpileModule(fs.readFileSync(path.join(web, "lib", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const pgCode = compile("pg.ts");
const hostedCode = compile("hosted.ts");
const run = (code, req) => {
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(req, mod, mod.exports);
  return mod.exports;
};

let liveStatements = 0;
const usingLive = () => !process.env.SETTER_STORE_TABLE;
/** Refuses anything that could change the live tables, before it is sent. */
function guard(text, readOnly) {
  if (!usingLive()) {
    if (!text.includes(TEST) && !/^select (1|v)\b/.test(text)) throw new Error("statement outside the test tables: " + text.slice(0, 80));
    return;
  }
  liveStatements++;
  if (!/^select\b/i.test(text) || /\b(insert|update|delete|alter|create|drop|truncate)\b/i.test(text) || readOnly === false) {
    throw new Error("refused: this would not be read only on the live tables: " + text.slice(0, 80));
  }
}

function newCopy(name) {
  const log = [];
  const pg = run(pgCode, require);
  const measured = (url) => {
    const real = pg.connect(url);
    const timed = async (kind, text, statements, work) => {
      const before = wire();
      const t0 = performance.now();
      const out = await work();
      const after = wire();
      log.push({ kind, text, statements, in: after.in - before.in, out: after.out - before.out, ms: performance.now() - t0 });
      return out;
    };
    return {
      query(text, params = []) {
        return { text, params, then: (ok, fail) => { try { guard(text); } catch (e) { return Promise.reject(e).then(ok, fail); } return timed("query", text, 1, () => real.query(text, params)).then(ok, fail); } };
      },
      transaction(queries, opts) {
        for (const q of queries) guard(q.text, Boolean(opts?.readOnly));
        return timed("transaction", queries.map((q) => q.text).join(" ; "), queries.length, () => real.transaction(queries.map((q) => real.query(q.text, q.params)), opts));
      },
    };
  };
  delete globalThis.__setterHosted;
  const hosted = run(hostedCode, (id) => {
    if (id === "./pg") return { ...pg, connect: measured };
    if (id === "next/server") return { after() { throw new Error("not inside a request"); } };
    return require(id);
  });
  const state = globalThis.__setterHosted;
  delete globalThis.__setterHosted;
  return { name, hosted, log, state, db: undefined, config: {} };
}
// The app keeps its memory on globalThis; every call into a copy puts that copy's memory there first.
const as = async (copy, work) => {
  globalThis.__setterHosted = copy.state;
  return work(copy.hosted);
};
const load = async (copy, plain = false) => {
  if (plain) process.env.SETTER_PLAIN_LOAD = "1"; else delete process.env.SETTER_PLAIN_LOAD;
  const got = await as(copy, (h) => h.hostedLoad());
  delete process.env.SETTER_PLAIN_LOAD;
  copy.db = got?.db;
  copy.config = got?.config ?? {};
  return got;
};
const refresh = (copy) => as(copy, (h) => h.hostedRefresh(copy.db, (c) => { copy.config = c; }));
const save = (copy) => as(copy, async (h) => { await h.hostedSave(() => copy.db, () => copy.config); await h.hostedFlush(); });
const sum = (entries) => entries.reduce((t, e) => ({ in: t.in + e.in, out: t.out + e.out, ms: t.ms + e.ms, statements: t.statements + e.statements, trips: t.trips + (e.kind === "transaction" ? e.statements + 2 : 1) }), { in: 0, out: 0, ms: 0, statements: 0, trips: 0 });

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + String(extra).slice(0, 400)}`);
};
const n = (x) => Math.round(x).toLocaleString("en-GB");
const mb = (x) => (x / 1e6).toFixed(2) + " MB";
const pct = (x) => ((x / EGRESS_LIMIT) * 100).toFixed(x / EGRESS_LIMIT < 0.1 ? 2 : 1) + "%";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameBase = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
const listOrder = (base) => {
  const out = {};
  for (const k of base.keys()) { const [c, id] = k.split("\u0000"); (out[c] ??= []).push(id); }
  // Only the order inside a collection matters to the app, so the collections themselves are put in a fixed order.
  return Object.keys(out).sort().map((c) => [c, out[c]]);
};

// ====================================================================================================
console.log("\n== 1. The live store, read only ==\n");

// One connection with one tiny question: what opening a connection costs on its own.
const probe = newCopy("probe");
await as(probe, (h) => h.hostedSql().query("select 1"));
await as(probe, (h) => h.hostedSql().query("select 1"));
const connectCost = { in: probe.log[0].in - probe.log[1].in, out: probe.log[0].out - probe.log[1].out, ms: probe.log[0].ms - probe.log[1].ms };

// A start as the app now does it (joined read), and a start reading the old way (one record per row).
let packed = newCopy("joined");
await load(packed);
const plain = newCopy("plain");
await load(plain, true);
if (packed.state.version !== plain.state.version) {
  // Someone saved between the two reads. Read once more so the two can be compared like for like.
  console.log(`(the store moved from version ${packed.state.version} to ${plain.state.version} between the two reads, reading again)`);
  packed = newCopy("joined");
  await load(packed);
}
const quiet = packed.state.version === plain.state.version;
const packedRead = packed.log.find((e) => e.kind === "transaction");
const plainRead = plain.log.find((e) => e.kind === "transaction");
const checkOnly = packed.log.find((e) => e.kind === "query" && e.text.includes("to_regclass"));
// The check is the first thing a copy sends, so its entry also holds the connection being opened.
const check = { in: checkOnly.in - connectCost.in, out: checkOnly.out - connectCost.out };

ok("the start sent one setup question and no setup statements", packed.log.length === 2 && checkOnly && packedRead.statements === 2, packed.log.map((e) => e.text.slice(0, 50)).join(" | "));
ok("the joined read was used (no fall back to the plain read)", packed.log.filter((e) => e.kind === "transaction").length === 1 && packedRead.text.includes("string_agg"));
if (quiet) {
  ok(`joined and plain reads give the same ${n(plain.state.base.size)} records, text for text`, sameBase(packed.state.base, plain.state.base), `${packed.state.base.size} against ${plain.state.base.size}`);
  ok("records are in the same order inside every collection", same(listOrder(packed.state.base), listOrder(plain.state.base)));
  ok("the working copy built from each is identical", same(packed.db, plain.db) && same(packed.config, plain.config));
  ok("workspace keys come back in the same order", same(Object.keys(packed.db.workspace), Object.keys(plain.db.workspace)));
} else {
  ok("the store stayed still long enough to compare the two reads", false, "it changed twice in a row, run again");
}

// What each later request costs: the version question, on a connection that is already open.
for (let i = 0; i < 5; i++) await refresh(packed);
const versionChecks = packed.log.filter((e) => e.kind === "query" && /_meta where k = 'version'$/.test(e.text));
const versionCost = { in: sum(versionChecks).in / versionChecks.length, out: sum(versionChecks).out / versionChecks.length, ms: sum(versionChecks).ms / versionChecks.length };
ok("a request costs one small question to see whether anything was saved", versionChecks.length === 5 && versionCost.in < 500, versionCost.in);

const usage = await as(packed, (h) => h.hostedUsage());
ok("the usage helper reports the database size and row counts", usage.databaseBytes > 0 && usage.tables.some((t) => t.name === "setter_store" && t.rows === plain.state.base.size) && usage.collections.reduce((t, c) => t + c.rows, 0) === plain.state.base.size, JSON.stringify(usage).slice(0, 300));
ok(`nothing but read only statements went to the live tables (${liveStatements} checked)`, liveStatements > 0);

const textBytes = usage.collections.reduce((t, c) => t + c.bytes, 0);
console.log(`\nStore: ${n(plain.state.base.size)} records, ${mb(textBytes)} of stored text, version ${plain.state.version}`);
console.log("Bytes received from the database (what counts as egress), measured on the socket:");
console.log(`  opening a connection (encryption and sign in)   ${n(connectCost.in).padStart(10)} bytes   ${n(connectCost.ms)} ms`);
console.log(`  setup check, new (1 question)                   ${n(check.in).padStart(10)} bytes`);
console.log(`  full read, plain (one record per row)           ${n(plainRead.in).padStart(10)} bytes   ${n(plainRead.ms)} ms`);
console.log(`  full read, joined (now)                         ${n(packedRead.in).padStart(10)} bytes   ${n(packedRead.ms)} ms   ${(100 - (packedRead.in / plainRead.in) * 100).toFixed(1)}% less`);
console.log(`  version question per request                    ${n(versionCost.in).padStart(10)} bytes   ${n(versionCost.ms)} ms`);
console.log(`Bytes sent to the database (not egress): connection ${n(connectCost.out)}, joined read ${n(packedRead.out)}, version question ${n(versionCost.out)}`);

console.log(`\nDatabase size: ${mb(usage.databaseBytes)} of ${mb(usage.limitBytes)} (${usage.percent}%)`);
for (const t of usage.tables) console.log(`  table ${t.name.padEnd(24)} ${n(t.rows).padStart(8)} rows  ${mb(t.bytes).padStart(10)} on disk`);
for (const c of usage.collections) console.log(`  kind  ${c.coll.padEnd(24)} ${n(c.rows).padStart(8)} rows  ${mb(c.bytes).padStart(10)} of text  ${((c.bytes / textBytes) * 100).toFixed(1)}%`);

// ====================================================================================================
let oldSetup = null;
if (!env.SKIP_TABLES) {
  console.log("\n== 2. Starts, saves and repairs on the script's own tables ==\n");
  process.env.SETTER_STORE_TABLE = TEST;
  const u = new URL(LIVE);
  u.search = "";
  const direct = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await direct.connect();
  const dq = async (text) => (await direct.query(text)).rows;
  const dropAll = async () => { for (const t of [TEST, TEST + "_meta", TEST + "_del"]) await dq(`drop table if exists ${t}`); };
  const left = async () => (await dq(`select table_name from information_schema.tables where table_schema = current_schema() and table_name like 'setter\\_test\\_coldstart%'`)).map((r) => r.table_name);
  const ranSetup = (copy) => copy.log.some((e) => e.text.includes("create table if not exists"));
  try {
    await dropAll();

    // --- a database with nothing in it ---
    const a = newCopy("A");
    const empty = await load(a);
    ok("an empty database: the start creates the tables and reports nothing stored", empty === null && ranSetup(a) && a.state.version === 0);
    const made = await dq(`select c.relname, c.relkind, c.relrowsecurity from pg_class c where c.relname in ('${TEST}', '${TEST}_meta', '${TEST}_del', '${TEST}_ver', '${TEST}_del_ver') order by 1`);
    ok("three tables and two version indexes exist, each table with row level security on", made.length === 5 && made.filter((r) => r.relkind === "r" && r.relrowsecurity).length === 3, JSON.stringify(made));

    // --- fill it: enough messages to need more than one joined text, and awkward characters ---
    const awkward = "quote \" backslash \\ newline \n tab \t emoji \u{1F600} accents éü control \u0001\u0002 pipe | comma , braces {}[]";
    a.db = {
      workspace: { zebra: { note: awkward }, alpha: [1, 2, 3], secret: "s", "odd key \"x\"": { a: null }, intake: { businessName: "Check" } },
      conversations: Array.from({ length: 300 }, (_, i) => ({ id: `c_${i}`, name: i === 7 ? awkward : `Lead ${i}`, stage: "new", labels: [] })),
      // Most records start with their id, as the app writes them. Some here do not, or have an id that needs care.
      messages: Array.from({ length: 4321 }, (_, i) => {
        const id = i === 3 ? 'm "quoted" 3' : i === 4 ? "m\\back\\slash" : i === 5 ? "m \u00e9\u{1F600} 5" : i === 6 ? "m,6}" : `m_${i}`;
        return i % 7 === 2 ? { conversationId: `c_${i % 300}`, id, text: `id not first ${i}`, order: i } : { id, conversationId: `c_${i % 300}`, text: i % 50 === 0 ? awkward : `message ${i}`, order: i };
      }),
      events: Array.from({ length: 40 }, (_, i) => (i === 0 ? { id: "only" } : { id: `e_${i}`, type: "stage_changed", at: "2026-11-19T00:00:00.000Z" })),
      labelQueue: [],
    };
    a.config = { ANTHROPIC_API_KEY: "not-a-real-key" };
    await save(a);
    ok("first save stores every record at version 1", a.state.version === 1 && Number((await dq(`select count(*)::int n from ${TEST}`))[0].n) === 5 + 300 + 4321 + 40 + 1, a.state.version);

    // --- a second copy starts on the filled database ---
    const b = newCopy("B");
    await load(b);
    ok("a start on existing tables asks one setup question and runs no setup statements", !ranSetup(b) && b.log.length === 2 && b.log[0].statements === 1, b.log.map((e) => e.text.slice(0, 40)).join(" | "));
    ok("the joined read came back in several parts", b.log[1].text.includes("string_agg") && Number((await dq(`select count(*)::int n from (select 1 from (select coll, (row_number() over (partition by coll order by ord) - 1) / 2000 as part from ${TEST}) x group by coll, part) y`))[0].n) >= 7);
    ok("the second copy holds exactly what the first saved, awkward characters included", same(b.db, a.db) && same(b.config, a.config) && sameBase(b.state.base, a.state.base) && b.state.version === 1);
    const c = newCopy("C");
    await load(c, true);
    ok("the plain read gives the same again", same(c.db, a.db) && sameBase(c.state.base, a.state.base) && same(listOrder(c.state.base), listOrder(b.state.base)));
    await save(b);
    ok("a save with nothing changed writes nothing", b.state.version === 1 && Number((await dq(`select v from ${TEST}_meta`))[0].v) === 1);

    // --- versions: one copy saves, the other catches up by reading only what changed ---
    a.db.messages[10].text = "edited on A";
    a.db.messages.push({ id: "m_new", conversationId: "c_1", text: "added on A", order: 9999 });
    a.db.conversations.splice(5, 1);
    a.db.workspace.alpha = [4];
    delete a.db.workspace.zebra;
    await save(a);
    const before = b.log.length;
    const kept = b.db.messages[11];
    await refresh(b);
    const caught = b.log.slice(before);
    ok("the other copy catches up reading only the changed rows", caught.length === 2 && caught[1].text.includes("ver > $1") && !caught[1].text.includes("string_agg") && caught[1].in < 2000, caught.map((e) => e.in).join(","));
    ok("after catching up both copies hold the same data at version 2", same(b.db, a.db) && sameBase(b.state.base, a.state.base) && b.state.version === 2 && a.state.version === 2);
    ok("records that did not change keep their place in memory", b.db.messages[11] === kept);

    // --- both copies save different records at the same moment ---
    a.db.conversations[0].stage = "booked";
    b.db.conversations[1].stage = "qualified";
    b.db.messages.push({ id: "m_b", conversationId: "c_2", text: "added on B", order: 10000 });
    await Promise.all([save(a), save(b)]);
    await refresh(a);
    await refresh(b);
    ok("two copies saving at once lose nothing", a.db.conversations[0].stage === "booked" && a.db.conversations[1].stage === "qualified" && a.db.messages.some((m) => m.id === "m_b") && same(a.db, b.db) && a.state.version === 4 && b.state.version === 4, `${a.state.version} ${b.state.version}`);
    const d = newCopy("D");
    await load(d);
    ok("a fresh start reads the same data the running copies hold", same(d.db, a.db) && sameBase(d.state.base, a.state.base) && d.state.version === 4);

    // --- the quick check must notice anything missing and put it back ---
    await dq(`drop index ${TEST}_ver`);
    const e = newCopy("E");
    await load(e);
    ok("a missing version index is noticed and created again", ranSetup(e) && (await dq(`select to_regclass('${TEST}_ver') is not null as there`))[0].there && same(e.db, a.db));
    await dq(`alter table ${TEST}_meta disable row level security`);
    const f = newCopy("F");
    await load(f);
    ok("row level security switched off is noticed and switched on again", ranSetup(f) && (await dq(`select relrowsecurity from pg_class where oid = to_regclass('${TEST}_meta')`))[0].relrowsecurity === true);
    await dq(`drop table ${TEST}_del`);
    const g = newCopy("G");
    await load(g);
    ok("a missing table is noticed and created again", ranSetup(g) && (await dq(`select to_regclass('${TEST}_del') is not null as there`))[0].there && same(g.db, a.db));

    // --- a marker character where it must never be: the read falls back to the plain one ---
    await dq(`insert into ${TEST} (coll, id, data, ver) values ('ws', 'odd' || chr(1) || 'key', '{"x":1}', 4)`);
    const hCopy = newCopy("H");
    await load(hCopy);
    const reads = hCopy.log.filter((x) => x.kind === "transaction");
    ok("a record whose id holds a marker character makes the start use the plain read, and nothing is lost", reads.length === 2 && reads[0].in < 3000 && same(hCopy.db.workspace["odd\u0001key"], { x: 1 }) && hCopy.state.base.size === a.state.base.size + 1, `${reads.length} reads, first ${reads[0]?.in} bytes`);
    await dq(`delete from ${TEST} where coll = 'ws' and id = 'odd' || chr(1) || 'key'`);

    // A record stored under one id whose text starts with a different one must keep the id it is stored under.
    await dq(`insert into ${TEST} (coll, id, data, ver) values ('events', 'stored_as', '{"id":"says_other","type":"x"}', 4), ('events', 'e_1x', '{"id":"e_1","type":"x"}', 4), ('events', 'e_', '{"id":"e_9","type":"x"}', 4)`);
    const j = newCopy("J");
    await load(j);
    const k = newCopy("K");
    await load(k, true);
    ok("records stored under an id their text does not start with keep their stored id", j.log.filter((x) => x.kind === "transaction").length === 1 && j.state.base.has("events\u0000stored_as") && j.state.base.has("events\u0000e_1x") && j.state.base.has("events\u0000e_") && sameBase(j.state.base, k.state.base) && same(listOrder(j.state.base), listOrder(k.state.base)));
    await dq(`delete from ${TEST} where coll = 'events' and id in ('stored_as', 'e_1x', 'e_')`);
    await dq(`insert into ${TEST} (coll, id, data, ver) values ('ws', '', '{"x":2}', 4)`);
    const l = newCopy("L");
    await load(l);
    ok("a record with an empty id also makes the start use the plain read", l.log.filter((x) => x.kind === "transaction").length === 2 && same(l.db.workspace[""], { x: 2 }));
    await dq(`delete from ${TEST} where coll = 'ws' and id = ''`);

    // --- the version counter gone: the one case the quick check cannot see ---
    await dq(`delete from ${TEST}_meta`);
    const i = newCopy("I");
    await load(i);
    const setupRun = i.log.find((x) => x.text.includes("create table if not exists"));
    ok("a missing version counter is put back at 0, as a start always did", Boolean(setupRun) && i.state.version === 0 && Number((await dq(`select v from ${TEST}_meta where k = 'version'`))[0].v) === 0 && same(i.db, a.db));
    // That run was the ten setup statements against tables that already exist: exactly what every start used to send.
    oldSetup = setupRun;

    // --- what "alter table" holds while it runs, even with nothing to change ---
    await dq("begin");
    await dq(`alter table ${TEST} enable row level security`);
    const locks = (await dq(`select mode from pg_locks where relation = to_regclass('${TEST}') and pid = pg_backend_pid()`)).map((r) => r.mode);
    await dq("rollback");
    ok("the old setup statements took a full lock on the table at every start (the new check takes none)", locks.includes("AccessExclusiveLock"), locks.join(","));
  } catch (e) {
    ok("the test table part ran to the end", false, e.stack || e.message);
  } finally {
    await direct.query("rollback").catch(() => {});
    await dropAll();
    ok("no test tables are left behind", (await left()).length === 0);
    await direct.end();
    delete process.env.SETTER_STORE_TABLE;
  }
  if (oldSetup) {
    console.log(`\nOld setup at every start (10 statements, 12 round trips): ${n(oldSetup.in)} bytes received, ${n(oldSetup.out)} sent, ${n(oldSetup.ms)} ms from this machine`);
    console.log(`New setup check (1 question, 1 round trip):               ${n(check.in)} bytes received, ${n(check.out)} sent, about ${n(versionCost.ms)} ms`);
  }
}

// ====================================================================================================
console.log("\n== 3. Monthly estimate against the 5 GB allowance ==\n");
const oldStart = connectCost.in + (oldSetup ? oldSetup.in : 0) + plainRead.in;
const newStart = connectCost.in + check.in + packedRead.in;
console.log(`One server start, before: ${n(oldStart)} bytes (${mb(oldStart)})${oldSetup ? "" : "  (old setup statements not measured, SKIP_TABLES is set)"}`);
console.log(`One server start, now:    ${n(newStart)} bytes (${mb(newStart)})   ${(100 - (newStart / oldStart) * 100).toFixed(1)}% less`);
console.log(`Starts that use the whole 5 GB: before ${n(EGRESS_LIMIT / oldStart)}, now ${n(EGRESS_LIMIT / newStart)}\n`);
console.log("Server starts a month     before               now");
for (const starts of [200, 1000, 5000]) {
  console.log(`  ${String(n(starts)).padStart(6)}             ${(mb(starts * oldStart) + " " + pct(starts * oldStart)).padEnd(20)} ${mb(starts * newStart)} ${pct(starts * newStart)}`);
}
console.log("\nVersion questions (one per request that reads data)");
console.log("  requests a month        connection already open    a new connection every time (worst case)");
// 55,500: one tab, version checks only, after the pacing work. 213,500: the same tab with the inbox's other timers.
// 432,000: one tab at the old fixed 2 seconds. 1,000,000: the Vercel Hobby ceiling on requests.
for (const reqs of [55500, 213500, 432000, 1000000]) {
  const warm = reqs * versionCost.in;
  const cold = reqs * (versionCost.in + connectCost.in);
  console.log(`  ${String(n(reqs)).padStart(9)}             ${(mb(warm) + " " + pct(warm)).padEnd(26)} ${mb(cold)} ${pct(cold)}`);
}
console.log("\nNotes:");
console.log("  Counted: every byte of the encrypted stream the database sent. Not counted: packet headers, about 3 to 4% more");
console.log("  on a large read if the host counts them (40 to 52 bytes for each packet of about 1,400).");
console.log("  A connection is closed after 20 seconds unused (web/lib/pg.ts), so requests further apart than that open a new one.");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
