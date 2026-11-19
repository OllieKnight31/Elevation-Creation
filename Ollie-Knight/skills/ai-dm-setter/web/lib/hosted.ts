import { connect, type Sql } from "./pg";
import { after } from "next/server";
import type { Db } from "./types";

// Hosted storage, used when the app runs on Vercel with a Postgres database (DATABASE_URL).
// Vercel runs the app as many short-lived copies, so nothing can live only in memory or on disk.
// Every record is one row: the workspace by top-level key, then each conversation, message, event and label job.
// A version number goes up with every write. Each request first checks it, and only when another copy has
// written since is anything read back; then only the rows that changed replace what is in memory.
// Writes send only the rows that changed since the last read or write.

const LISTS = ["conversations", "messages", "events", "labelQueue"] as const;
const SEP = "\u0000";

// The first one set wins, so the app can be moved to a new database without removing the old one.
// SETTER_PG_URL: any Postgres. SUPA_POSTGRES_URL: the Supabase database added through Vercel (pooled address).
export const databaseUrl = () => process.env.SETTER_PG_URL || process.env.SUPA_POSTGRES_URL || process.env.SETTER_DATABASE_URL || process.env.DATABASE_URL || "";
export const hostedConfigured = () => Boolean(databaseUrl());

const table = () => (process.env.SETTER_STORE_TABLE || "setter_store").replace(/[^a-z0-9_]/gi, "");

interface HostedState {
  sql?: Sql;
  schema?: Promise<void>;
  version: number;
  base: Map<string, string>;
  push?: Promise<void>;
  dirty: boolean;
  error: string;
  lastPushAt: string;
  written: number;
}

const fresh: HostedState = { version: -1, base: new Map(), dirty: false, error: "", lastPushAt: "", written: 0 };
const h: HostedState = ((globalThis as unknown as { __setterHosted?: HostedState }).__setterHosted ??= fresh);

const sql = () => (h.sql ??= connect(databaseUrl()));

/** Direct database access for data kept outside the working copy, such as saved profile pictures. */
export const hostedSql = () => sql();
export const hostedTable = table;

export const hostedVersion = () => h.version;
export const hostedStatus = () => ({ pending: Boolean(h.push), error: h.error, lastPushAt: h.lastPushAt, written: h.written });

/** Keeps the function alive until work started during a request has finished. Outside a request it just runs. */
export function keepAlive(p: Promise<unknown>) {
  try {
    after(() => p.catch(() => {}));
  } catch {
    // not inside a request: nothing to hold open
  }
}

/** Runs work after the response has gone, for timed jobs such as the reply delay. */
export function background(job: () => Promise<unknown>) {
  const p = Promise.resolve().then(job).catch((e) => console.error("[setter] background job failed:", (e as Error).message));
  keepAlive(p);
  return p;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One small question that says whether everything the store needs is already in place: the three tables,
 * the column and indexes for versions, and row level security on each table.
 * Reads the database's own catalogue only, so it takes no lock and writes nothing.
 */
async function schemaReady() {
  const t = table();
  const rows = (await sql().query(
    `select (select count(*) from pg_class c where c.oid in (to_regclass('${t}'), to_regclass('${t}_meta'), to_regclass('${t}_del')) and c.relkind = 'r' and c.relrowsecurity) = 3`
    + ` and to_regclass('${t}_ver') is not null and to_regclass('${t}_del_ver') is not null`
    + ` and exists (select 1 from pg_attribute a where a.attrelid = to_regclass('${t}') and a.attname = 'ver' and not a.attisdropped) as ok`,
  )) as { ok: boolean | null }[];
  return rows[0]?.ok === true;
}

/** Creates whatever is missing. Safe to run again: every statement leaves existing tables and rows alone. */
async function createSchema() {
  const t = table();
  await sql().transaction([
    sql().query(`create table if not exists ${t} (coll text not null, id text not null, data text not null, ord bigserial, primary key (coll, id))`),
    sql().query(`create table if not exists ${t}_meta (k text primary key, v bigint not null)`),
    sql().query(`insert into ${t}_meta (k, v) values ('version', 0) on conflict do nothing`),
    // Each row remembers the version that last wrote it, and deletions leave a marker, so a copy that is
    // behind reads only what changed since its own version instead of everything.
    sql().query(`alter table ${t} add column if not exists ver bigint not null default 0`),
    sql().query(`create index if not exists ${t}_ver on ${t} (ver)`),
    sql().query(`create table if not exists ${t}_del (coll text not null, id text not null, ver bigint not null)`),
    sql().query(`create index if not exists ${t}_del_ver on ${t}_del (ver)`),
    // Supabase also serves tables over a public web address. With row level security on and no rules,
    // that address returns nothing; the app itself connects as the owner and is not affected.
    sql().query(`alter table ${t} enable row level security`),
    sql().query(`alter table ${t}_meta enable row level security`),
    sql().query(`alter table ${t}_del enable row level security`),
  ]);
}

// Every copy of the app used to run all ten setup statements when it started. Four of them are "alter table",
// which makes every other copy wait for the table while it runs, even when there is nothing to change.
// Now a start asks once whether the setup is complete and only runs the statements when something is missing.
function ensureSchema() {
  return (h.schema ??= (async () => {
    if (await schemaReady()) return;
    await createSchema();
  })().catch((e) => {
    h.schema = undefined;
    throw e;
  }));
}

function rowsOf(db: Db, config: Record<string, string>) {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(db.workspace)) if (v !== undefined) m.set("ws" + SEP + k, JSON.stringify(v));
  for (const c of LISTS) for (const r of db[c] as { id: string }[]) m.set(c + SEP + r.id, JSON.stringify(r));
  m.set("config" + SEP + "keys", JSON.stringify(config));
  return m;
}

type Row = { coll: string; id: string; data: string };

// Reading everything is the costly part of a start: the database host counts every byte it sends against a
// monthly allowance. Sent one record per row, each record carries its collection name again, the wire format's
// own framing (about 26 bytes a record together) and its id, which most records also hold inside their text.
// So the database joins the records of a collection into a few long texts instead (2,000 records each), split
// by two marker characters, and leaves the id out wherever the record's text starts with it. They are cut
// apart again here, giving back exactly the rows a plain read gives.
// The markers are the control characters 1 and 2. Valid JSON never holds them raw, and the query itself checks
// that no id or record does; if one ever did, every part comes back empty and the plain read below is used.
const MARK_ROW = "\u0001";
const MARK_ID = "\u0002";
const PACK_SIZE = 2000;
/** How a record's text starts when it carries its own id. */
const ID_LEAD = '{"id":"';

type Pack = { coll: string; n: number | string; body: string | null };

// An id is left out only when the text starts with {"id":"<that id>" and the id has no quote or backslash in it,
// so reading up to the next quote gives the same id back. An empty id cannot be told from a left out one, so it
// counts as odd too.
const packedQuery = (t: string) =>
  `select coll, count(*)::int as n,`
  // "over ()" spreads the answer across every part, so one odd record anywhere empties them all and nothing is sent twice.
  + ` case when bool_or(bool_or(id = '' or position(chr(1) in id) > 0 or position(chr(2) in id) > 0 or position(chr(1) in data) > 0 or position(chr(2) in data) > 0)) over () then null`
  + ` else string_agg(case when left(data, ${ID_LEAD.length + 1} + length(id)) = '${ID_LEAD}' || id || '"' and position('"' in id) = 0 and position(chr(92) in id) = 0 then '' else id end || chr(2) || data, chr(1) order by ord) end as body`
  + ` from (select coll, id, data, ord, (row_number() over (partition by coll order by ord) - 1) / ${PACK_SIZE} as part from ${t}) x`
  + ` group by coll, part order by coll, part`;

/** Cuts the joined texts back into records. Returns null when anything does not add up, so the caller reads plainly. */
function unpack(packs: Pack[]): Row[] | null {
  const rows: Row[] = [];
  for (const p of packs) {
    if (typeof p.body !== "string") return null;
    const parts = p.body.split(MARK_ROW);
    if (parts.length !== Number(p.n)) return null;
    for (const s of parts) {
      const i = s.indexOf(MARK_ID);
      if (i < 0) return null;
      const data = s.slice(i + 1);
      if (i > 0) { rows.push({ coll: p.coll, id: s.slice(0, i), data }); continue; }
      const end = data.startsWith(ID_LEAD) ? data.indexOf('"', ID_LEAD.length) : -1;
      if (end < 0) return null;
      rows.push({ coll: p.coll, id: data.slice(ID_LEAD.length, end), data });
    }
  }
  return rows;
}

/**
 * Reads the whole store and the version it belongs to, in one read only transaction so the two match.
 * Records come back in saved order within each collection, which is all the rest of this file relies on.
 * found says whether the version counter exists. SETTER_PLAIN_LOAD=1 switches the joined read off.
 */
async function readAll(): Promise<{ version: number; rows: Row[]; found: boolean }> {
  const t = table();
  const version = () => sql().query(`select v from ${t}_meta where k = 'version'`);
  if (!process.env.SETTER_PLAIN_LOAD) {
    const [meta, packs] = (await sql().transaction([version(), sql().query(packedQuery(t))], { readOnly: true })) as [{ v: string }[], Pack[]];
    const rows = unpack(packs);
    if (rows) return { version: Number(meta[0]?.v ?? 0), rows, found: meta.length > 0 };
  }
  const [meta, rows] = (await sql().transaction([version(), sql().query(`select coll, id, data from ${t} order by ord`)], { readOnly: true })) as [{ v: string }[], Row[]];
  return { version: Number(meta[0]?.v ?? 0), rows, found: meta.length > 0 };
}

/**
 * Brings the working copy up to date. Unchanged records keep their object, so a request that is part way
 * through still edits the record that will be saved. Returns null when the database is empty.
 */
function apply(current: Db | undefined, rows: Row[]): { db: Db; config: Record<string, string> } | null {
  if (!rows.length) return null;
  const remote = new Map(rows.map((r) => [r.coll + SEP + r.id, r.data]));
  const keep = (key: string, data: string) => current !== undefined && h.base.get(key) === data;
  const ws = (current?.workspace ?? {}) as unknown as Record<string, unknown>;
  for (const r of rows) if (r.coll === "ws" && !(keep("ws" + SEP + r.id, r.data) && r.id in ws)) ws[r.id] = JSON.parse(r.data);
  for (const k of Object.keys(ws)) if (!remote.has("ws" + SEP + k)) delete ws[k];
  const db = (current ?? { workspace: ws }) as Db;
  for (const c of LISTS) {
    const local = new Map(((current?.[c] ?? []) as { id: string }[]).map((r) => [r.id, r]));
    const next = rows.filter((r) => r.coll === c).map((r) => (keep(c + SEP + r.id, r.data) && local.get(r.id)) || JSON.parse(r.data));
    if (current) (current[c] as unknown[]).splice(0, current[c].length, ...next);
    else (db as unknown as Record<string, unknown>)[c] = next;
  }
  const config = JSON.parse(remote.get("config" + SEP + "keys") ?? "{}");
  h.base = remote;
  return { db, config };
}

/**
 * First read when a copy starts. Returns the stored data, or null when the database is empty
 * (the caller then uploads what it has).
 */
export async function hostedLoad(): Promise<{ db: Db; config: Record<string, string> } | null> {
  await ensureSchema();
  let all = await readAll();
  if (!all.found) {
    // The tables are there but the version counter is not (it is the one thing the quick check cannot see).
    // Saving needs it, so the full setup runs, which puts it back at 0 exactly as a start always used to.
    await createSchema();
    all = await readAll();
  }
  const { version, rows } = all;
  h.base = new Map();
  const got = apply(undefined, rows);
  h.version = version;
  return got;
}

/** Called at the start of each request. One small query when nothing changed elsewhere. */
export async function hostedRefresh(current: Db, onConfig: (c: Record<string, string>) => void) {
  if (h.push) await h.push;
  await ensureSchema();
  const meta = (await sql().query(`select v from ${table()}_meta where k = 'version'`)) as { v: string }[];
  const version = Number(meta[0]?.v ?? 0);
  if (version === h.version) return;
  if (h.version < 0 || version - h.version > KEEP_DELETIONS - 100) {
    const all = await readAll();
    const got = apply(current, all.rows);
    h.version = all.version;
    if (got) onConfig(got.config);
    return;
  }
  const t = table();
  const [rows, dels] = (await sql().transaction([
    sql().query(`select coll, id, data, ver from ${t} where ver > $1 order by ord`, [h.version]),
    sql().query(`select coll, id, ver from ${t}_del where ver > $1`, [h.version]),
  ], { readOnly: true })) as [(Row & { ver: string })[], { coll: string; id: string; ver: string }[]];
  const config = patch(current, rows, dels);
  h.version = Math.max(version, ...rows.map((r) => Number(r.ver)), ...dels.map((d) => Number(d.ver)));
  if (config) onConfig(config);
}

/** Deletion markers kept; a copy further behind than this reads everything once instead. */
const KEEP_DELETIONS = 5000;

/** Applies only the rows that changed. Unchanged records keep their object, as in a full read. */
function patch(current: Db, rows: Row[], dels: { coll: string; id: string }[]): Record<string, string> | null {
  let config: Record<string, string> | null = null;
  const ws = current.workspace as unknown as Record<string, unknown>;
  const index = new Map<string, Map<string, number>>();
  const at = (c: string) => {
    let m = index.get(c);
    if (!m) { m = new Map(((current as unknown as Record<string, { id: string }[]>)[c] ?? []).map((r, i) => [r.id, i])); index.set(c, m); }
    return m;
  };
  for (const r of rows) {
    const key = r.coll + SEP + r.id;
    if (h.base.get(key) === r.data) continue;
    h.base.set(key, r.data);
    if (r.coll === "config") { config = JSON.parse(r.data); continue; }
    if (r.coll === "ws") { ws[r.id] = JSON.parse(r.data); continue; }
    if (!(LISTS as readonly string[]).includes(r.coll)) continue;
    const list = (current as unknown as Record<string, unknown[]>)[r.coll];
    const i = at(r.coll).get(r.id);
    if (i === undefined) { at(r.coll).set(r.id, list.length); list.push(JSON.parse(r.data)); }
    else list[i] = JSON.parse(r.data);
  }
  const gone = new Map<string, Set<string>>();
  for (const d of dels) {
    const key = d.coll + SEP + d.id;
    if (rows.some((r) => r.coll === d.coll && r.id === d.id)) continue; // written again after it was deleted
    if (!h.base.has(key)) continue;
    h.base.delete(key);
    if (d.coll === "ws") delete ws[d.id];
    else (gone.get(d.coll) ?? gone.set(d.coll, new Set()).get(d.coll)!).add(d.id);
  }
  for (const [c, ids] of gone) {
    const list = (current as unknown as Record<string, { id: string }[]>)[c];
    if (list) list.splice(0, list.length, ...list.filter((r) => !ids.has(r.id)));
  }
  return config;
}

async function pushOnce(db: Db, config: Record<string, string>) {
  await ensureSchema();
  const t = table();
  const now = rowsOf(db, config);
  const ups: [string, string, string][] = [];
  for (const [k, v] of now) if (h.base.get(k) !== v) ups.push([...(k.split(SEP) as [string, string]), v]);
  const dels = [...h.base.keys()].filter((k) => !now.has(k)).map((k) => k.split(SEP) as [string, string]);
  if (!ups.length && !dels.length) return;
  // The version goes up first, so every row written below can be stamped with it.
  const cur = `(select v from ${t}_meta where k = 'version')`;
  const q = [sql().query(`update ${t}_meta set v = v + 1 where k = 'version' returning v`)];
  for (let i = 0; i < ups.length; i += 400) {
    const part = ups.slice(i, i + 400);
    q.push(sql().query(
      `insert into ${t} (coll, id, data, ver) select a, b, c, ${cur} from unnest($1::text[], $2::text[], $3::text[]) as x(a, b, c) on conflict (coll, id) do update set data = excluded.data, ver = excluded.ver`,
      [part.map((x) => x[0]), part.map((x) => x[1]), part.map((x) => x[2])],
    ));
  }
  if (dels.length) {
    q.push(sql().query(`delete from ${t} where (coll, id) in (select * from unnest($1::text[], $2::text[]))`, [dels.map((x) => x[0]), dels.map((x) => x[1])]));
    q.push(sql().query(`insert into ${t}_del (coll, id, ver) select a, b, ${cur} from unnest($1::text[], $2::text[]) as x(a, b)`, [dels.map((x) => x[0]), dels.map((x) => x[1])]));
    q.push(sql().query(`delete from ${t}_del where ver < ${cur} - ${KEEP_DELETIONS}`));
  }
  const res = (await sql().transaction(q)) as unknown[][];
  const v = Number((res[0][0] as { v: string }).v);
  // When another copy wrote in between, the version stays where it was: the next request reads what changed since.
  if (v === h.version + 1) h.version = v;
  for (const [c, id, data] of ups) h.base.set(c + SEP + id, data);
  for (const [c, id] of dels) h.base.delete(c + SEP + id);
  h.written += ups.length + dels.length;
  h.lastPushAt = new Date().toISOString();
}

/** Saves the working copy. Saves made while one is running are folded into one more run. */
export function hostedSave(db: () => Db, config: () => Record<string, string>) {
  h.dirty = true;
  if (!h.push) {
    h.push = (async () => {
      try {
        while (h.dirty) {
          h.dirty = false;
          await pushOnce(db(), config());
        }
        h.error = "";
      } catch (e) {
        h.error = (e as Error).message;
        console.error("[setter] saving to the database failed:", h.error);
      } finally {
        h.push = undefined;
      }
    })();
  }
  keepAlive(h.push);
  return h.push;
}

/** Waits until everything saved so far is in the database. */
export async function hostedFlush() {
  while (h.push) await h.push;
}

/** Supabase's free plan allows this much database. Over it the whole organisation is blocked. */
export const HOSTED_LIMIT_BYTES = 500 * 1000 * 1000;

export interface HostedUsage {
  /** Size of the whole database as the host measures it, system tables included. */
  databaseBytes: number;
  limitBytes: number;
  /** Share of the limit in use, 0 to 100 with one decimal. */
  percent: number;
  /** The store's own tables with their size on disk (indexes included) and exact row counts. */
  tables: { name: string; rows: number; bytes: number }[];
  /** What the main table holds, by kind of record. bytes is the length of the stored text. */
  collections: { coll: string; rows: number; bytes: number }[];
  version: number;
}

/**
 * How full the database is. Read only, three small questions, a few hundred bytes back.
 * It counts every row, so call it when someone opens a usage screen, not on every request.
 */
export async function hostedUsage(): Promise<HostedUsage> {
  const t = table();
  const names = [t, `${t}_meta`, `${t}_del`, `${t}_avatars`];
  const sizes = (await sql().query(
    `select c.relname as name, pg_total_relation_size(c.oid)::text as bytes from pg_class c where c.oid in (${names.map((n) => `to_regclass('${n}')`).join(", ")})`,
  )) as { name: string; bytes: string }[];
  // Only tables that exist are counted: the pictures table appears the first time a picture is saved.
  const have = names.filter((n) => sizes.some((s) => s.name === n.toLowerCase()));
  const has = (n: string) => have.includes(n);
  const [counts, colls, meta, whole] = (await sql().transaction([
    sql().query(have.length ? have.map((n) => `select '${n.toLowerCase()}' as name, count(*)::text as rows from ${n}`).join(" union all ") : `select '' as name, '0' as rows where false`),
    sql().query(has(t) ? `select coll, count(*)::text as rows, coalesce(sum(octet_length(data)), 0)::text as bytes from ${t} group by coll order by 3 desc` : `select '' as coll, '0' as rows, '0' as bytes where false`),
    sql().query(has(`${t}_meta`) ? `select v::text as v from ${t}_meta where k = 'version'` : `select '0' as v where false`),
    sql().query(`select pg_database_size(current_database())::text as db`),
  ], { readOnly: true })) as [{ name: string; rows: string }[], { coll: string; rows: string; bytes: string }[], { v: string }[], { db: string }[]];
  const databaseBytes = Number(whole[0]?.db ?? 0);
  return {
    databaseBytes,
    limitBytes: HOSTED_LIMIT_BYTES,
    percent: Math.round((databaseBytes / HOSTED_LIMIT_BYTES) * 1000) / 10,
    tables: sizes.map((s) => ({ name: s.name, rows: Number(counts.find((c) => c.name === s.name)?.rows ?? 0), bytes: Number(s.bytes) })).sort((a, b) => b.bytes - a.bytes),
    collections: colls.map((c) => ({ coll: c.coll, rows: Number(c.rows), bytes: Number(c.bytes) })),
    version: Number(meta[0]?.v ?? 0),
  };
}
