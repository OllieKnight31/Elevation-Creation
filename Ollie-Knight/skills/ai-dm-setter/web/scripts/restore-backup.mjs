// Puts a nightly backup back. The backups are dated tables in the old Neon database, written by lib/backup.ts.
// Nothing is written unless --apply is given: without it the script only says what it would do.
//
// Usage (run from anywhere):
//   node web/scripts/restore-backup.mjs --env-file <file> --list
//   node web/scripts/restore-backup.mjs --env-file <file> --to SUPA_POSTGRES_URL_NON_POOLING
//   node web/scripts/restore-backup.mjs --env-file <file> --to SUPA_POSTGRES_URL_NON_POOLING --day 20261119 --apply --replace
//
//   --env-file <file>  read database addresses from this file (KEY=value lines) as well as the environment
//   --from <NAME>      name of the variable holding the backup database address (default DATABASE_URL)
//   --to <NAME>        name of the variable holding the address of the database to restore into
//   --day <YYYYMMDD>   which night to restore (default: the newest finished one)
//   --table <name>     store table to fill in the target (default setter_store)
//   --prefix <name>    snapshot table prefix (default setter_backup)
//   --list             show the nights that can be restored and stop
//   --apply            really write
//   --replace          allow --apply when the target already holds rows: they are removed first
//
// Addresses are passed by variable NAME, never typed out, so no password lands in the shell history.
// After a restore into the live database, redeploy (or wait a minute): the version number is moved far ahead,
// so every running copy of the app reads everything again instead of trusting what it has in memory.

import fs from "node:fs";
import pg from "pg";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const clean = (s) => s.replace(/[^a-z0-9_]/gi, "");
const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

const env = { ...process.env };
const envFile = opt("env-file");
if (envFile) {
  for (const l of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

const fromName = opt("from", "DATABASE_URL");
const toName = opt("to");
const prefix = clean(opt("prefix", "setter_backup"));
const table = clean(opt("table", "setter_store"));
const apply = flag("apply");
const replace = flag("replace");
if (!env[fromName]) die(`No backup database address found in ${fromName}.`);
if (toName && !env[toName]) die(`No database address found in ${toName}.`);
if (apply && !toName) die("Say where to restore to with --to <NAME of the variable holding the address>.");
if (!prefix || !table) die("The table and prefix names must be plain letters, digits and underscores.");
if (new RegExp(`^${prefix}_(log|(avatars_)?\\d{8})`).test(table)) die("The target table cannot be one of the snapshot tables.");

// Same fingerprints as lib/backup.ts, so a restored table can be checked against the night it came from.
const STORE_HASH = "md5(coll || chr(1) || id || chr(1) || ord::text || chr(1) || ver::text || chr(1) || data)";
const AVATAR_HASH = "md5(id || chr(1) || url || chr(1) || type || chr(1) || data)";
const totals = (t, keys, hash) =>
  `select count(*)::int as n, md5(coalesce(string_agg(h, '' order by ${keys.map((k) => `${k} collate "C"`).join(", ")}), '')) as sum from (select ${keys.join(", ")}, ${hash} as h from ${t}) x`;

function client(url) {
  const u = new URL(url);
  u.search = "";
  return new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000 });
}
const exists = async (c, t) => (await c.query("select to_regclass($1) is not null as y", [t])).rows[0].y;

const src = client(env[fromName]);
await src.connect();
let dst = null;
let failed = false;
try {
  if (!(await exists(src, `${prefix}_log`))) die(`No backups found: ${prefix}_log does not exist in the backup database.`);
  const nights = (await src.query(`select day, taken_at, version, rows, bytes, checksum, avatars, avatars_checksum from ${prefix}_log where complete order by day desc`)).rows;
  if (!nights.length) die("No finished backups found.");
  if (flag("list")) {
    console.log("Nights that can be restored (newest first):");
    for (const n of nights) console.log(`  ${n.day}  taken ${new Date(n.taken_at).toISOString()}  ${n.rows} rows  ${n.avatars ?? 0} pictures  store version ${n.version}`);
    process.exit(0);
  }
  const day = clean(opt("day", nights[0].day));
  const night = nights.find((n) => n.day === day);
  if (!night) die(`There is no finished backup for ${day}. Use --list to see the nights held.`);
  const snap = `${prefix}_${day}`;
  const snapPics = `${prefix}_avatars_${day}`;
  if (!(await exists(src, snap))) die(`The log lists ${day} but the table ${snap} is missing.`);
  const hasPics = night.avatars !== null && (await exists(src, snapPics));

  // Check the snapshot itself before trusting it.
  const s = (await src.query(totals(snap, ["coll", "id"], STORE_HASH))).rows[0];
  if (s.n !== night.rows || s.sum !== night.checksum) die(`The snapshot ${snap} no longer matches its log line (${s.n} rows, checksum ${s.sum}). Not restoring from it.`);
  console.log(`Backup of ${day}, taken ${new Date(night.taken_at).toISOString()}: ${night.rows} rows, ${hasPics ? night.avatars : 0} pictures, store version ${night.version}. Checksum verified.`);

  if (!toName) {
    console.log("No target given (--to), so nothing more to check. Nothing was written.");
    process.exit(0);
  }
  if (env[toName] === env[fromName] && table === "setter_store") die("Refusing to overwrite the old database's own store. Pick another target or another --table.");

  dst = client(env[toName]);
  await dst.connect();
  const there = (await exists(dst, table)) ? (await dst.query(`select count(*)::int as n from ${table}`)).rows[0].n : 0;
  const curVersion = (await exists(dst, `${table}_meta`)) ? Number((await dst.query(`select v from ${table}_meta where k = 'version'`)).rows[0]?.v ?? 0) : 0;
  // Far enough ahead that every running copy of the app re-reads everything (lib/hosted.ts does so past 4,900).
  const newVersion = Math.max(curVersion, Number(night.version)) + 10_000;
  console.log(`Target ${toName}, table ${table}: holds ${there} rows now, version ${curVersion}.`);
  console.log(`A restore would ${there ? `remove those ${there} rows and ` : ""}write ${night.rows} rows${hasPics ? ` and ${night.avatars} pictures` : ""}, and set the version to ${newVersion}.`);

  if (!apply) {
    console.log("Dry run: nothing was written. Add --apply to restore" + (there ? " (and --replace, because the target is not empty)." : "."));
    process.exit(0);
  }
  if (there && !replace) die("The target already holds rows. Add --replace to remove them and restore, or pick an empty --table.");

  // Everything happens in one transaction: either the whole night is back, checked, or nothing changed.
  await dst.query("begin");
  try {
    await dst.query(`create table if not exists ${table} (coll text not null, id text not null, data text not null, ord bigserial, primary key (coll, id))`);
    await dst.query(`create table if not exists ${table}_meta (k text primary key, v bigint not null)`);
    await dst.query(`alter table ${table} add column if not exists ver bigint not null default 0`);
    await dst.query(`create index if not exists ${table}_ver on ${table} (ver)`);
    await dst.query(`create table if not exists ${table}_del (coll text not null, id text not null, ver bigint not null)`);
    await dst.query(`create index if not exists ${table}_del_ver on ${table}_del (ver)`);
    for (const t of [table, `${table}_meta`, `${table}_del`]) await dst.query(`alter table ${t} enable row level security`);
    await dst.query(`delete from ${table}`);
    await dst.query(`delete from ${table}_del`);

    let last = ["", ""], done = 0;
    for (;;) {
      const rows = (await src.query(`select coll, id, data, ord::text as ord, ver::text as ver from ${snap} where (coll collate "C", id collate "C") > ($1, $2) order by coll collate "C", id collate "C" limit 500`, last)).rows;
      if (!rows.length) break;
      await dst.query(
        `insert into ${table} (coll, id, data, ord, ver) select a, b, c, d::bigint, e::bigint from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) as x(a, b, c, d, e)`,
        ["coll", "id", "data", "ord", "ver"].map((k) => rows.map((r) => r[k])),
      );
      done += rows.length;
      last = [rows[rows.length - 1].coll, rows[rows.length - 1].id];
      process.stdout.write(`\r  rows ${done}/${night.rows}`);
    }
    process.stdout.write("\n");
    // New rows must be numbered after the restored ones, or they would sort into the middle of old chats.
    await dst.query(`select setval(pg_get_serial_sequence('${table}', 'ord'), greatest((select coalesce(max(ord), 0) from ${table}), 1))`);
    await dst.query(`insert into ${table}_meta (k, v) values ('version', $1) on conflict (k) do update set v = excluded.v`, [newVersion]);

    if (hasPics) {
      const pics = `${table}_avatars`;
      await dst.query(`create table if not exists ${pics} (id text primary key, url text not null, type text not null, data text not null, at timestamptz not null default now())`);
      await dst.query(`alter table ${pics} enable row level security`);
      await dst.query(`delete from ${pics}`);
      let after = "", n = 0;
      for (;;) {
        const rows = (await src.query(`select id, url, type, data, at::text as at from ${snapPics} where id collate "C" > $1 order by id collate "C" limit 40`, [after])).rows;
        if (!rows.length) break;
        await dst.query(
          `insert into ${pics} (id, url, type, data, at) select a, b, c, d, e::timestamptz from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) as x(a, b, c, d, e)`,
          ["id", "url", "type", "data", "at"].map((k) => rows.map((r) => r[k])),
        );
        n += rows.length;
        after = rows[rows.length - 1].id;
        process.stdout.write(`\r  pictures ${n}/${night.avatars}`);
      }
      process.stdout.write("\n");
      const p = (await dst.query(totals(pics, ["id"], AVATAR_HASH))).rows[0];
      if (p.n !== night.avatars || p.sum !== night.avatars_checksum) throw new Error(`restored pictures do not match the backup (${p.n} rows, checksum ${p.sum})`);
    }

    const t = (await dst.query(totals(table, ["coll", "id"], STORE_HASH))).rows[0];
    if (t.n !== night.rows || t.sum !== night.checksum) throw new Error(`restored rows do not match the backup (${t.n} rows, checksum ${t.sum})`);
    await dst.query("commit");
    console.log(`Restored ${night.rows} rows${hasPics ? ` and ${night.avatars} pictures` : ""} into ${table}. Checksum matches the backup. Version is now ${newVersion}.`);
  } catch (e) {
    await dst.query("rollback").catch(() => {});
    failed = true;
    console.error(`Restore failed and was rolled back, the target is unchanged: ${e.message}`);
  }
} finally {
  await src.end().catch(() => {});
  if (dst) await dst.end().catch(() => {});
}
process.exit(failed ? 1 : 0);
