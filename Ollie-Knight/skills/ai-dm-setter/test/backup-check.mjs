// Checks the nightly backup (web/lib/backup.ts) and the restore script against the real databases.
// Usage: ENV_FILE=<file with the database addresses> node test/backup-check.mjs
//   SKIP_LIVE=1   leave out the one full size run that reads the live store (read only, about 4 MB of traffic)
// Needs SUPA_POSTGRES_URL (the live database) and DATABASE_URL (the old Neon database, where backups are kept).
//
// What it touches:
//   live database   reads setter_store only. Creates its own sample tables named setter_test_backup_src*.
//   old Neon        creates snapshot tables named setter_test_backup_* only. Its own setter_store tables are
//                   fingerprinted before and after to prove they were not changed.
// Every setter_test_backup* table on both sides is dropped at the end, also when a check fails.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, "..", "web");
const require = createRequire(path.join(web, "package.json"));
const { Client } = require("pg");
const { neon } = require("@neondatabase/serverless");
const ts = require("typescript");

const env = { ...process.env };
if (env.ENV_FILE) {
  for (const l of fs.readFileSync(env.ENV_FILE, "utf8").split("\n")) {
    const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
const LIVE = env.SUPA_POSTGRES_URL;
const OLD = env.DATABASE_URL;
if (!LIVE || !OLD) {
  console.error("Set ENV_FILE to a file holding SUPA_POSTGRES_URL and DATABASE_URL.");
  process.exit(1);
}

// The library is TypeScript and only uses two packages, so it is compiled in memory and loaded from here.
const backup = (() => {
  const out = ts.transpileModule(fs.readFileSync(path.join(web, "lib", "backup.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", out)(require, mod, mod.exports);
  return mod.exports;
})();
const { runBackup, lastBackup, totalsSql, STORE_HASH, AVATAR_HASH } = backup;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + String(extra).slice(0, 400)}`);
};

const SRC = "setter_test_backup_src";
const PREFIX = "setter_test_backup";
const RESTORED = "setter_test_backup_restored";
const storeKeys = { keys: ["coll", "id"], hash: STORE_HASH };
const picKeys = { keys: ["id"], hash: AVATAR_HASH };

const liveUrl = new URL(LIVE);
liveUrl.search = "";
const live = new Client({ connectionString: liveUrl.toString(), ssl: { rejectUnauthorized: false } });
await live.connect();
const lq = async (text, params) => (await live.query(text, params)).rows;
const old = neon(OLD);
const oq = (text, params) => old.query(text, params);

const testTables = async () => ({
  live: (await lq(`select table_name from information_schema.tables where table_schema = current_schema() and table_name like 'setter\\_test\\_backup%'`)).map((r) => r.table_name).sort(),
  old: (await oq(`select table_name from information_schema.tables where table_schema = current_schema() and table_name like 'setter\\_test\\_backup%'`)).map((r) => r.table_name).sort(),
});
async function cleanup() {
  const t = await testTables();
  for (const name of t.live) await lq(`drop table if exists ${name}`);
  if (t.old.length) await old.transaction(t.old.map((name) => old.query(`drop table if exists ${name}`)));
}
// The old database's own tables, fingerprinted in the database so nothing large is read.
const ownTables = async () => JSON.stringify(await old.transaction([
  old.query(totalsSql("setter_store", storeKeys)),
  old.query(`select k, v from setter_store_meta order by k`),
  old.query(`select count(*)::int as n from setter_store_del`),
]));

const base = { sourceUrl: LIVE, targetUrl: OLD, sourceTable: SRC, prefix: PREFIX };

try {
  await cleanup();
  const ownBefore = await ownTables();

  // ---------- skipping and safety ----------
  const none = await runBackup({ sourceUrl: LIVE, targetUrl: "" });
  ok("with no backup database set it skips without an error", none.ok && none.skipped === true && /DATABASE_URL/.test(none.reason), JSON.stringify(none));
  const same = await runBackup({ sourceUrl: OLD, targetUrl: OLD });
  ok("it skips when the app itself runs on the backup database", same.skipped === true, JSON.stringify(same));
  let refused = "";
  try { await runBackup({ ...base, prefix: "setter_store" }); } catch (e) { refused = e.message; }
  ok("it refuses to use the app's own table names for snapshots", /not a safe name/.test(refused), refused);
  ok("no last backup is reported before one has run", (await lastBackup({ targetUrl: OLD, prefix: PREFIX })) === null);

  // ---------- a small source made from real rows ----------
  await lq(`create table ${SRC} (coll text not null, id text not null, data text not null, ord bigserial, ver bigint not null default 0, primary key (coll, id))`);
  await lq(`create table ${SRC}_meta (k text primary key, v bigint not null)`);
  await lq(`create table ${SRC}_avatars (id text primary key, url text not null, type text not null, data text not null, at timestamptz not null default now())`);
  for (const t of [SRC, `${SRC}_meta`, `${SRC}_avatars`]) await lq(`alter table ${t} enable row level security`);
  // Copied inside the live database, so the real rows never travel. Sign in details (ws) are left out.
  await lq(`insert into ${SRC} (coll, id, data, ord, ver)
    (select coll, id, data, ord, ver from setter_store where coll = 'messages' order by ord desc limit 400)
    union all (select coll, id, data, ord, ver from setter_store where coll = 'conversations' order by ord desc limit 150)
    union all (select coll, id, data, ord, ver from setter_store where coll = 'events' order by ord desc limit 150)`);
  await lq(`insert into ${SRC} (coll, id, data, ord, ver) values ('ws', 'check', $1, 1, 1)`, [JSON.stringify({ note: "Check row: accents é ü, emoji 👍, quote ' and \\ backslash, line\nbreak" })]);
  await lq(`insert into ${SRC}_meta (k, v) values ('version', 41)`);
  const pics = Array.from({ length: 12 }, (_, i) => [`c_check_${i}`, `https://example.com/p/${i}.jpg`, "image/jpeg", randomBytes(15_000 + i * 900).toString("base64")]);
  await lq(`insert into ${SRC}_avatars (id, url, type, data) select * from unnest($1::text[], $2::text[], $3::text[], $4::text[])`, [0, 1, 2, 3].map((k) => pics.map((p) => p[k])));
  const srcTotals = async () => ({ store: (await lq(totalsSql(SRC, storeKeys)))[0], pics: (await lq(totalsSql(`${SRC}_avatars`, picKeys)))[0] });
  const snapTotals = async (day) => {
    const [a, b] = await old.transaction([old.query(totalsSql(`${PREFIX}_${day}`, storeKeys)), old.query(totalsSql(`${PREFIX}_avatars_${day}`, picKeys))]);
    return { store: a[0], pics: b[0] };
  };

  // ---------- first night: everything travels ----------
  let want = await srcTotals();
  const r1 = await runBackup({ ...base, day: "20200101" });
  let got = await snapTotals("20200101");
  ok("first backup reports the source's row count", r1.skipped === false && r1.rows === want.store.n && r1.rows === 701, JSON.stringify(r1));
  ok("first backup: snapshot row count matches the source", got.store.n === want.store.n, `${got.store.n} vs ${want.store.n}`);
  ok("first backup: snapshot checksum matches the source", got.store.sum === want.store.sum && r1.checksum === want.store.sum, `${got.store.sum} vs ${want.store.sum}`);
  ok("first backup: pictures count and checksum match the source", got.pics.n === 12 && got.pics.sum === want.pics.sum && r1.avatars === 12 && r1.avatarsChecksum === want.pics.sum, JSON.stringify(got.pics));
  ok("first backup copies every row", r1.copied.rows === 701 && r1.copied.avatars === 12, JSON.stringify(r1.copied));
  ok("the store version and time are recorded", r1.version === 41 && Math.abs(Date.now() - new Date(r1.takenAt).getTime()) < 120_000 && r1.bytes > 0, JSON.stringify(r1));
  const odd = await oq(`select data from ${PREFIX}_20200101 where coll = 'ws' and id = 'check'`);
  ok("awkward characters survive the trip", JSON.parse(odd[0].data).note.includes("emoji 👍, quote ' and \\ backslash, line\nbreak"), odd[0]?.data);
  const first = { ...got };

  // ---------- second night: only what changed travels ----------
  const some = await lq(`select coll, id from ${SRC} where coll = 'messages' order by ord limit 5`);
  await lq(`update ${SRC} set data = data || ' ', ver = 42 where (coll, id) in (select * from unnest($1::text[], $2::text[]))`, [some.slice(0, 3).map((r) => r.coll), some.slice(0, 3).map((r) => r.id)]);
  await lq(`delete from ${SRC} where (coll, id) in (select * from unnest($1::text[], $2::text[]))`, [some.slice(3).map((r) => r.coll), some.slice(3).map((r) => r.id)]);
  await lq(`insert into ${SRC} (coll, id, data, ver) values ('messages', 'm_check_new', '{"id":"m_check_new"}', 42)`);
  await lq(`update ${SRC}_meta set v = 42`);
  await lq(`update ${SRC}_avatars set data = $1 where id = 'c_check_0'`, [randomBytes(9000).toString("base64")]);
  await lq(`delete from ${SRC}_avatars where id = 'c_check_1'`);
  await lq(`insert into ${SRC}_avatars (id, url, type, data) values ('c_check_new', 'https://example.com/p/new.jpg', 'image/png', $1)`, [randomBytes(5000).toString("base64")]);
  want = await srcTotals();
  const r2 = await runBackup({ ...base, day: "20200102" });
  got = await snapTotals("20200102");
  ok("second backup: row count and checksum match the changed source", got.store.n === 700 && got.store.n === want.store.n && got.store.sum === want.store.sum && r2.checksum === want.store.sum, JSON.stringify({ got: got.store, want: want.store }));
  ok("second backup: pictures match the changed source", got.pics.n === 12 && got.pics.sum === want.pics.sum, JSON.stringify({ got: got.pics, want: want.pics }));
  ok("second backup only fetches the rows that changed", r2.copied.rows === 4 && r2.copied.avatars === 2 && r2.version === 42, JSON.stringify(r2.copied));
  const again = await snapTotals("20200101");
  ok("the first night's snapshot is left as it was", again.store.sum === first.store.sum && again.pics.sum === first.pics.sum && first.store.sum !== got.store.sum);
  const r2b = await runBackup({ ...base, day: "20200102" });
  got = await snapTotals("20200102");
  ok("running the same night twice gives the same snapshot", r2b.checksum === r2.checksum && got.store.sum === want.store.sum && r2b.kept.length === 2, JSON.stringify(r2b));

  // ---------- keeping the newest 7 ----------
  await oq(`create table ${PREFIX}_20190101 (coll text, id text)`); // left over from a run that died half way
  await oq(`insert into ${PREFIX}_log (day, complete) values ('20190101', false)`);
  let r;
  for (const d of ["20200103", "20200104", "20200105", "20200106", "20200107", "20200108", "20200109"]) r = await runBackup({ ...base, day: d });
  const held = (await testTables()).old;
  const days = ["20200109", "20200108", "20200107", "20200106", "20200105", "20200104", "20200103"];
  ok("the newest 7 nights are reported as kept", JSON.stringify(r.kept) === JSON.stringify(days), JSON.stringify(r.kept));
  ok("older nights and half made ones are dropped, tables and log lines alike",
    JSON.stringify(held) === JSON.stringify([...days.map((d) => `${PREFIX}_${d}`), ...days.map((d) => `${PREFIX}_avatars_${d}`), `${PREFIX}_log`].sort())
    && (await oq(`select count(*)::int as n from ${PREFIX}_log`))[0].n === 7, JSON.stringify(held));
  ok("an unchanged night fetches nothing from the live database", r.copied.rows === 0 && r.copied.avatars === 0 && r.checksum === want.store.sum, JSON.stringify(r.copied));
  const lastLine = await lastBackup({ targetUrl: OLD, prefix: PREFIX });
  ok("the last backup time and row count can be read back", lastLine?.day === "20200109" && lastLine.rows === 700 && lastLine.avatars === 12 && lastLine.takenAt === r.takenAt, JSON.stringify(lastLine));
  console.log(`      an unchanged night took ${r.ms} ms; backup database size ${(r.targetBytes / 1e6).toFixed(1)} MB`);

  // ---------- restore ----------
  const script = path.join(web, "scripts", "restore-backup.mjs");
  const restore = (...a) => {
    try {
      return execFileSync(process.execPath, [script, "--prefix", PREFIX, "--from", "DATABASE_URL", "--to", "DATABASE_URL", "--table", RESTORED, ...a], { env: { ...env, ENV_FILE: "" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      return `EXIT ${e.status}\n${e.stdout}\n${e.stderr}`;
    }
  };
  const listed = restore("--list");
  ok("restore --list shows the nights held", days.every((d) => listed.includes(d)) && !listed.includes("20200102"), listed);
  const dry = restore("--day", "20200105");
  ok("restore without --apply writes nothing", /Dry run: nothing was written/.test(dry) && !(await testTables()).old.some((t) => t.startsWith(RESTORED)), dry);
  const done = restore("--day", "20200105", "--apply");
  const back = await old.transaction([
    old.query(totalsSql(RESTORED, storeKeys)),
    old.query(totalsSql(`${RESTORED}_avatars`, picKeys)),
    old.query(`select v from ${RESTORED}_meta where k = 'version'`),
    old.query(`select nextval(pg_get_serial_sequence('${RESTORED}', 'ord')) as next, (select max(ord) from ${RESTORED}) as top`),
  ]);
  ok("restore --apply brings back every row with a matching checksum", /Checksum matches the backup/.test(done) && back[0][0].n === 700 && back[0][0].sum === want.store.sum, done);
  ok("restore brings back the pictures", back[1][0].n === 12 && back[1][0].sum === want.pics.sum, JSON.stringify(back[1]));
  ok("restore moves the version far ahead so running copies re-read everything", Number(back[2][0].v) === 42 + 10_000, JSON.stringify(back[2]));
  ok("rows added after a restore are numbered after the restored ones", Number(back[3][0].next) > Number(back[3][0].top), JSON.stringify(back[3]));
  const twice = restore("--day", "20200105", "--apply");
  ok("restore refuses to overwrite a table that holds rows unless told to", /EXIT 1/.test(twice) && /--replace/.test(twice), twice);
  const forced = restore("--day", "20200103", "--apply", "--replace");
  ok("restore --replace swaps the contents for the chosen night", /Checksum matches the backup/.test(forced) && (await oq(totalsSql(RESTORED, storeKeys)))[0].n === 700, forced);
  const wrong = restore("--day", "20200101");
  ok("restore says so when the night asked for is not held", /EXIT 1/.test(wrong) && /no finished backup for 20200101/.test(wrong), wrong);

  // ---------- one full size run from the live store, read only ----------
  if (!env.SKIP_LIVE) {
    const v0 = (await lq(`select v from setter_store_meta where k = 'version'`))[0].v;
    const full = await runBackup({ sourceUrl: LIVE, targetUrl: OLD, sourceTable: "setter_store", prefix: `${PREFIX}_live` });
    const liveNow = (await lq(totalsSql("setter_store", storeKeys)))[0];
    const v1 = (await lq(`select v from setter_store_meta where k = 'version'`))[0].v;
    const snap = (await oq(totalsSql(`${PREFIX}_live_${full.day}`, storeKeys)))[0];
    ok("full size: snapshot row count and checksum match what the backup reported", snap.n === full.rows && snap.sum === full.checksum && full.rows > 10_000, JSON.stringify({ snap, rows: full.rows }));
    if (v0 === v1 && Number(v0) === full.version) ok("full size: snapshot row count and checksum match the live store", snap.n === liveNow.n && snap.sum === liveNow.sum, JSON.stringify({ snap, liveNow }));
    else console.log("NOTE  the live store was written to during the run, so its totals were not compared afterwards");
    ok("full size: finishes well inside the time limit (under 60 s of a 300 s allowance)", full.ms < 60_000, full.ms);
    const full2 = await runBackup({ sourceUrl: LIVE, targetUrl: OLD, sourceTable: "setter_store", prefix: `${PREFIX}_live`, day: "20200101" });
    ok("full size: a following night starts from the last copy and fetches little", full2.copied.rows < 500 && full2.rows >= full.rows - 500, JSON.stringify(full2.copied));
    console.log(`      full size first run: ${full.rows} rows, ${(full.bytes / 1e6).toFixed(2)} MB of text, ${full.ms} ms, pictures table ${full.avatars === null ? "absent" : full.avatars}`);
    console.log(`      full size following run: fetched ${full2.copied.rows} rows, ${full2.ms} ms`);
  }

  ok("the old database's own tables were not changed", (await ownTables()) === ownBefore);
} catch (e) {
  ok("the check ran to the end", false, e.stack || e.message);
} finally {
  try {
    await cleanup();
    const left = await testTables();
    ok("no test tables are left behind", left.live.length === 0 && left.old.length === 0, JSON.stringify(left));
  } catch (e) {
    ok("clean up", false, e.message);
  }
  await live.end().catch(() => {});
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
