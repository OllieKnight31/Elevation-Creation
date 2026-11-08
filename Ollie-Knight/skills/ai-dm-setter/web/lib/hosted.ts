import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
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

// SETTER_DATABASE_URL wins, so the app can be moved to a new database without removing the old one.
export const databaseUrl = () => process.env.SETTER_DATABASE_URL || process.env.DATABASE_URL || "";
export const hostedConfigured = () => Boolean(databaseUrl());

const table = () => (process.env.SETTER_STORE_TABLE || "setter_store").replace(/[^a-z0-9_]/gi, "");

interface HostedState {
  sql?: NeonQueryFunction<false, false>;
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

const sql = () => (h.sql ??= neon(databaseUrl()));

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

function ensureSchema() {
  return (h.schema ??= (async () => {
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
    ]);
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

async function readAll(): Promise<{ version: number; rows: Row[] }> {
  const t = table();
  const [meta, rows] = (await sql().transaction([sql().query(`select v from ${t}_meta where k = 'version'`), sql().query(`select coll, id, data from ${t} order by ord`)], { readOnly: true })) as [{ v: string }[], Row[]];
  return { version: Number(meta[0]?.v ?? 0), rows };
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
  const { version, rows } = await readAll();
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
