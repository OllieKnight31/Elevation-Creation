import { createHash } from "crypto";
import { neon } from "@neondatabase/serverless";
import { Client } from "pg";

/*
 * Nightly backup. The live database (Supabase Free) keeps no backups of its own, so once a night the whole store is
 * copied into the old Neon database, which is free and already there. Each night gets its own dated tables:
 *   setter_backup_YYYYMMDD           every row of the store (coll, id, data, ord, ver)
 *   setter_backup_avatars_YYYYMMDD   the saved profile pictures, when the live database has that table
 *   setter_backup_log                one line per night: when, how many rows, the store version, a checksum
 * The newest 7 nights are kept and older ones are dropped.
 *
 * Both databases have small free allowances, so the copy is done sparingly. Tonight's tables start as a copy of
 * last night's, made inside Neon. Then only a short fingerprint of every row is read from each side, and only the
 * rows that differ are fetched from the live database. On a normal night that is a few hundred rows instead of
 * all 17,000. Neon is spoken to over its HTTP driver in one short burst, so it wakes once a night.
 *
 * This file must not import the app's own storage code (lib/hosted.ts): it also runs from the test script and
 * must never be able to write to the app's tables. It only ever creates, fills and drops tables whose names start
 * with the backup prefix.
 */

export interface BackupOptions {
  /** The database to copy from. The cron route passes the live one. */
  sourceUrl?: string;
  /** The database the snapshots are kept in. Defaults to the old Neon database (DATABASE_URL). */
  targetUrl?: string;
  /** Name of the store table to copy. */
  sourceTable?: string;
  /** Snapshot tables are named prefix_YYYYMMDD. Tests use their own prefix. */
  prefix?: string;
  /** How many nights to keep. */
  keep?: number;
  /** YYYYMMDD. Defaults to today (UTC). Tests pass other days to check that old nights are dropped. */
  day?: string;
}

export interface BackupDone {
  ok: true;
  skipped: false;
  day: string;
  takenAt: string;
  /** Version of the store at the moment it was copied. */
  version: number;
  rows: number;
  /** Size of the stored text, in bytes. */
  bytes: number;
  checksum: string;
  /** null when the live database has no saved pictures table. */
  avatars: number | null;
  avatarsChecksum: string | null;
  /** How many rows actually had to travel tonight (the rest were already in last night's copy). */
  copied: { rows: number; avatars: number };
  /** Nights held after this run, newest first. */
  kept: string[];
  dropped: string[];
  /** Size of the whole backup database after this run, to watch against its free limit. */
  targetBytes: number;
  ms: number;
}

export interface BackupSkipped {
  ok: true;
  skipped: true;
  reason: string;
}

export type BackupResult = BackupDone | BackupSkipped;

export interface BackupLogLine {
  day: string;
  takenAt: string;
  version: number;
  rows: number;
  bytes: number;
  checksum: string;
  avatars: number | null;
  avatarsChecksum: string | null;
}

const clean = (s: string) => s.replace(/[^a-z0-9_]/gi, "");
const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

/** The database the snapshots live in: the old Neon one. Empty when it is not set, and the backup is skipped. */
export const backupTargetUrl = () => process.env.DATABASE_URL || "";

// One description per copied table, so the store and the pictures go through the same code.
interface Spec {
  src: string;
  dst: string;
  keys: string[];
  /** Column name and the type it is stored as. Everything travels as text and is cast back on arrival. */
  cols: [string, string][];
  /** SQL that fingerprints one row. It must give the same answer on both databases. */
  hash: string;
}

/** Fingerprint of a store row. scripts/restore-backup.mjs and test/backup-check.mjs use the same expression. */
export const STORE_HASH = "md5(coll || chr(1) || id || chr(1) || ord::text || chr(1) || ver::text || chr(1) || data)";
export const AVATAR_HASH = "md5(id || chr(1) || url || chr(1) || type || chr(1) || data)";

const storeSpec = (src: string, dst: string): Spec => ({
  src,
  dst,
  keys: ["coll", "id"],
  cols: [["coll", "text"], ["id", "text"], ["data", "text"], ["ord", "bigint"], ["ver", "bigint"]],
  hash: STORE_HASH,
});

const avatarSpec = (src: string, dst: string): Spec => ({
  src,
  dst,
  keys: ["id"],
  cols: [["id", "text"], ["url", "text"], ["type", "text"], ["data", "text"], ["at", "timestamptz"]],
  hash: AVATAR_HASH,
});

const createSql = (s: Spec) =>
  `create table ${s.dst} (${s.cols.map(([c, t]) => `${c} ${t} not null`).join(", ")}, primary key (${s.keys.join(", ")}))`;

/** Sorts the way Postgres does with the "C" ordering (plain byte order), so both sides add rows up in the same order. */
function checksumOf(list: Map<string, { h: string; kb: Buffer[] }>) {
  const all = [...list.values()].sort((a, b) => {
    for (let i = 0; i < a.kb.length; i++) {
      const d = Buffer.compare(a.kb[i], b.kb[i]);
      if (d) return d;
    }
    return 0;
  });
  const sum = createHash("md5");
  for (const r of all) sum.update(r.h);
  return sum.digest("hex");
}

/** One query that counts a table and fingerprints all of it, in the database itself. Nothing large travels. */
export const totalsSql = (table: string, s: Pick<Spec, "keys" | "hash">) =>
  `select count(*)::int as n, md5(coalesce(string_agg(h, '' order by ${s.keys.map((k) => `${k} collate "C"`).join(", ")}), '')) as sum from (select ${s.keys.join(", ")}, ${s.hash} as h from ${table}) x`;

type Rows = Record<string, string>[];
type Target = { query(text: string, params?: unknown[]): Promise<unknown> };

/**
 * The backup database is reached over plain web requests, and now and then one does not get through (more so
 * while it is still waking up). Every statement here gives the same result when sent twice, so a request that
 * failed to connect is simply sent again. A real database error is passed on at once.
 */
async function retry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      const dropped = !(e as { code?: string }).code && /fetch failed|connect|timeout|socket|network/i.test((e as Error).message);
      if (!dropped || attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
}

const SEP = "\u0000";
// A batch stays well under what Neon accepts in one HTTP request, and small enough to keep memory flat.
const BATCH_BYTES = 1_500_000;
const BATCH_ROWS = 2500;
// Batches being written to the backup database while the next one is read from the live one.
const WRITES_AT_ONCE = 3;

/**
 * Makes dst in the backup database equal to src in the live one. dst already holds last night's rows (or nothing).
 * Reads a fingerprint per row from both sides, removes what is gone, fetches and writes what is new or changed,
 * then has the backup database fingerprint the finished table and compares it with the live side.
 */
async function copyTable(source: Client, target: Target, s: Spec) {
  const keyList = s.keys.join(", ");
  const [srcList, dstList] = await Promise.all([
    source.query(`select ${keyList}, ${s.hash} as h, octet_length(data) as n from ${s.src}`).then((r) => r.rows as Rows),
    target.query(`select ${keyList}, ${s.hash} as h from ${s.dst}`) as Promise<Rows>,
  ]);
  const keyOf = (r: Record<string, string>) => s.keys.map((k) => r[k]).join(SEP);
  const want = new Map<string, { h: string; n: number; kb: Buffer[]; k: string[] }>();
  let bytes = 0;
  for (const r of srcList) {
    const k = s.keys.map((c) => r[c]);
    want.set(keyOf(r), { h: r.h, n: Number(r.n), kb: k.map((x) => Buffer.from(x, "utf8")), k });
    bytes += Number(r.n);
  }
  const have = new Map(dstList.map((r) => [keyOf(r), r]));

  const gone = dstList.filter((r) => !want.has(keyOf(r)));
  const unnestKeys = `unnest(${s.keys.map((_, i) => `$${i + 1}::text[]`).join(", ")})`;
  for (let i = 0; i < gone.length; i += 2000) {
    const part = gone.slice(i, i + 2000);
    await target.query(`delete from ${s.dst} where (${keyList}) in (select * from ${unnestKeys})`, s.keys.map((k) => part.map((r) => r[k])));
  }

  const todo = [...want].filter(([key, w]) => have.get(key)?.h !== w.h).map(([, w]) => w);
  const names = s.cols.map(([c]) => c);
  const insert =
    `insert into ${s.dst} (${names.join(", ")}) select ${s.cols.map(([, t], i) => `c${i}::${t}`).join(", ")} ` +
    `from unnest(${s.cols.map((_, i) => `$${i + 1}::text[]`).join(", ")}) as x(${s.cols.map((_, i) => `c${i}`).join(", ")}) ` +
    `on conflict (${keyList}) do update set ${names.filter((c) => !s.keys.includes(c)).map((c) => `${c} = excluded.${c}`).join(", ")}`;
  const fetch = `select ${names.map((c) => `${c}::text as ${c}`).join(", ")} from ${s.src} where (${keyList}) in (select * from ${unnestKeys})`;
  let copied = 0;
  const writing: Promise<unknown>[] = [];
  for (let i = 0; i < todo.length; ) {
    const part: typeof todo = [];
    let size = 0;
    while (i < todo.length && part.length < BATCH_ROWS && (part.length === 0 || size + todo[i].n <= BATCH_BYTES)) {
      size += todo[i].n;
      part.push(todo[i++]);
    }
    const got = (await source.query(fetch, s.keys.map((_, k) => part.map((w) => w.k[k])))).rows as Rows;
    if (got.length !== part.length) throw new Error(`Backup: ${s.src} gave ${got.length} rows where ${part.length} were asked for`);
    const w = target.query(insert, names.map((c) => got.map((r) => r[c])));
    // A failure is picked up when the write is awaited below. This only stops it being reported twice.
    w.catch(() => {});
    writing.push(w);
    if (writing.length >= WRITES_AT_ONCE) await writing.shift();
    copied += got.length;
  }
  await Promise.all(writing);

  const sum = checksumOf(want);
  const [check] = (await target.query(totalsSql(s.dst, s))) as { n: number; sum: string }[];
  if (check.n !== want.size || check.sum !== sum) {
    throw new Error(`Backup: ${s.dst} does not match the live data (${check.n} rows against ${want.size}, checksum ${check.sum} against ${sum})`);
  }
  return { rows: want.size, bytes, checksum: sum, copied };
}

function names(prefix: string) {
  const p = clean(prefix);
  // The app's own tables in the old database are never the target, whatever is passed in.
  if (!p || /^setter_store/i.test(p)) throw new Error(`Backup: "${prefix}" is not a safe name for snapshot tables`);
  const re = new RegExp(`^${p}_(avatars_)?(\\d{8})$`);
  return {
    log: `${p}_log`,
    store: (day: string) => `${p}_${day}`,
    avatars: (day: string) => `${p}_avatars_${day}`,
    /** The day a table belongs to, or "" when it is not one of ours. */
    dayOf: (table: string) => table.match(re)?.[2] ?? "",
  };
}

const logSql = (log: string) =>
  `create table if not exists ${log} (day text primary key, taken_at timestamptz not null default now(), version bigint, rows integer, bytes bigint, checksum text, avatars integer, avatars_checksum text, complete boolean not null default false)`;

type LogRow = { day: string; taken_at: string; version: string | null; rows: number | null; bytes: string | null; checksum: string | null; avatars: number | null; avatars_checksum: string | null; complete: boolean };

const line = (r: LogRow): BackupLogLine => ({
  day: r.day,
  takenAt: new Date(r.taken_at).toISOString(),
  version: Number(r.version ?? 0),
  rows: r.rows ?? 0,
  bytes: Number(r.bytes ?? 0),
  checksum: r.checksum ?? "",
  avatars: r.avatars,
  avatarsChecksum: r.avatars_checksum,
});

function pgClient(url: string) {
  // Same treatment as lib/pg.ts: the address carries options this driver does not know, so they are dropped.
  const u = new URL(url);
  u.search = "";
  return new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
}

/** Takes tonight's snapshot. Skips, without an error, when there is nowhere to put it. */
export async function runBackup(opts: BackupOptions = {}): Promise<BackupResult> {
  const started = Date.now();
  const targetUrl = opts.targetUrl ?? backupTargetUrl();
  const sourceUrl = opts.sourceUrl ?? "";
  if (!targetUrl) return { ok: true, skipped: true, reason: "No backup database is set (DATABASE_URL), so no backup was taken." };
  if (!sourceUrl) return { ok: true, skipped: true, reason: "The app is not running on a hosted database, so there is nothing to back up." };
  if (sourceUrl === targetUrl) return { ok: true, skipped: true, reason: "The app is running on the backup database itself, so a copy there would protect nothing." };

  const day = clean(opts.day ?? today());
  if (!/^\d{8}$/.test(day)) throw new Error(`Backup: "${opts.day}" is not a day in YYYYMMDD form`);
  const keep = Math.max(1, Math.floor(opts.keep ?? (Number(process.env.SETTER_BACKUP_KEEP) || 7)));
  const src = clean(opts.sourceTable || "setter_store");
  const nm = names(opts.prefix || "setter_backup");
  const sql = neon(targetUrl);
  const target: Target = { query: (t, p) => retry(() => sql.query(t, p as unknown[])) };

  const source = pgClient(sourceUrl);
  await source.connect();
  try {
    // One frozen view of the live data for the whole copy, so the rows, the version and the pictures all belong
    // to the same moment even while the app keeps writing.
    await source.query("begin transaction isolation level repeatable read read only");
    const meta = (await source.query(`select (select v from ${src}_meta where k = 'version') as v, to_regclass('${src}_avatars') is not null as pics`)).rows[0] as { v: string | null; pics: boolean };
    const version = Number(meta.v ?? 0);

    const [, logRows, tableRows] = (await retry(() => sql.transaction([
      sql.query(logSql(nm.log)),
      sql.query(`select * from ${nm.log} order by day desc`),
      sql.query(`select table_name from information_schema.tables where table_schema = current_schema()`),
    ]))) as [unknown, LogRow[], { table_name: string }[]];
    const existing = new Set(tableRows.map((t) => t.table_name).filter((t) => nm.dayOf(t)));
    // Last night's copy is the starting point, so only what changed since has to travel.
    const prev = logRows.find((r) => r.complete && r.day !== day && existing.has(nm.store(r.day)))?.day;

    const specs = [storeSpec(src, nm.store(day))];
    if (meta.pics) specs.push(avatarSpec(`${src}_avatars`, nm.avatars(day)));
    // Until the last step this night is marked unfinished, so a run that dies half way is never mistaken for a backup.
    const prep = [
      sql.query(`insert into ${nm.log} (day, taken_at, complete) values ($1, now(), false) on conflict (day) do update set complete = false, taken_at = now()`, [day]),
      sql.query(`drop table if exists ${nm.store(day)}`),
      sql.query(`drop table if exists ${nm.avatars(day)}`),
    ];
    for (const s of specs) {
      prep.push(sql.query(createSql(s)));
      prep.push(sql.query(`alter table ${s.dst} enable row level security`));
      const from = prev ? (s.keys.length === 2 ? nm.store(prev) : nm.avatars(prev)) : "";
      if (from && existing.has(from)) prep.push(sql.query(`insert into ${s.dst} select ${s.cols.map(([c]) => c).join(", ")} from ${from}`));
    }
    await retry(() => sql.transaction(prep));

    const store = await copyTable(source, target, specs[0]);
    const pics = specs[1] ? await copyTable(source, target, specs[1]) : null;
    await source.query("commit");

    const [done] = (await target.query(
      `update ${nm.log} set taken_at = now(), version = $2, rows = $3, bytes = $4, checksum = $5, avatars = $6, avatars_checksum = $7, complete = true where day = $1 returning *`,
      [day, version, store.rows, store.bytes + (pics?.bytes ?? 0), store.checksum, pics?.rows ?? null, pics?.checksum ?? null],
    )) as LogRow[];

    // Keep the newest finished nights. Anything older, and anything left half made by a failed run, goes.
    const good = [...new Set([day, ...logRows.filter((r) => r.complete).map((r) => r.day)])].sort().reverse();
    const kept = good.slice(0, keep);
    const stale = [...existing].filter((t) => !kept.includes(nm.dayOf(t)));
    const tidy = stale.map((t) => sql.query(`drop table if exists ${t}`));
    tidy.push(sql.query(`delete from ${nm.log} where not (day = any($1::text[]))`, [kept]));
    tidy.push(sql.query(`select pg_database_size(current_database()) as b`));
    const out = (await retry(() => sql.transaction(tidy))) as unknown[][];
    const targetBytes = Number((out[out.length - 1][0] as { b: string }).b);

    return {
      ok: true,
      skipped: false,
      ...line(done),
      copied: { rows: store.copied, avatars: pics?.copied ?? 0 },
      kept,
      dropped: [...new Set(stale.map((t) => nm.dayOf(t)))].sort(),
      targetBytes,
      ms: Date.now() - started,
    };
  } finally {
    await source.end().catch(() => {});
  }
}

/**
 * The newest finished backup, for showing "last backed up" in the app. Returns null when there is none or no
 * backup database is set. This wakes the backup database, so call it when someone asks, not on every page load.
 */
export async function lastBackup(opts: Pick<BackupOptions, "targetUrl" | "prefix"> = {}): Promise<BackupLogLine | null> {
  const url = opts.targetUrl ?? backupTargetUrl();
  if (!url) return null;
  const nm = names(opts.prefix || "setter_backup");
  try {
    const rows = (await retry(() => neon(url).query(`select * from ${nm.log} where complete order by day desc limit 1`))) as LogRow[];
    return rows[0] ? line(rows[0]) : null;
  } catch (e) {
    // No log table yet means no backup has ever run.
    if ((e as { code?: string }).code === "42P01") return null;
    throw e;
  }
}
