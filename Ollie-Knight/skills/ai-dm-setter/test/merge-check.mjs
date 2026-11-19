// Checks the db2 merge tool (web/scripts/merge-db2.mjs) on stand in tables, because db2 itself is locked.
// Usage: ENV_FILE=<file with the database addresses> node test/merge-check.mjs
//   SHOW_REPORT=1   also print the dry run report the tool gives for the stand in data
// Needs SUPA_POSTGRES_URL_NON_POOLING or SUPA_POSTGRES_URL. DATABASE_URL (the old Neon copy) is read once for a
// sample of real rows; if it cannot be read the sample comes from the live store instead (read only).
// SETTER_DATABASE_URL (db2) is only asked one question, to prove the tool reports the lock.
//
// What it touches:
//   old Neon      one read of a sample (workspace, about 50 chats and their messages). Nothing is written.
//   Supabase      creates setter_test_merge_base*, setter_test_merge_src* and setter_test_merge_dst* and works only
//                 on those. The live setter_store tables are fingerprinted before and after to prove they were
//                 not changed. Keys and logins in the sample are replaced with made up values before it is stored.
// Every setter_test_merge* table is dropped at the end, also when a check fails.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, "..", "web");
const script = path.join(web, "scripts", "merge-db2.mjs");
const require = createRequire(path.join(web, "package.json"));
const { Client } = require("pg");
const { neon } = require("@neondatabase/serverless");
const tool = await import(pathToFileURL(script).href);
const { mergeStores, planRows, planAvatars, fromRows, toRows, lockedReason, parseArgs, same } = tool;

const env = { ...process.env };
if (env.ENV_FILE) {
  for (const l of fs.readFileSync(env.ENV_FILE, "utf8").split("\n")) {
    const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
const LIVE = env.SUPA_POSTGRES_URL_NON_POOLING || env.SUPA_POSTGRES_URL;
const OLD = env.DATABASE_URL;
if (!LIVE) {
  console.error("Set ENV_FILE to a file holding SUPA_POSTGRES_URL (and DATABASE_URL for the sample).");
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 500)}`);
};
const eq = (name, got, want) => ok(name, same(got, want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const P = "setter_test_merge";
const T = { base: `${P}_base`, src: `${P}_src`, dst: `${P}_dst` };
const clone = (v) => JSON.parse(JSON.stringify(v));

const db = new Client({ connectionString: (() => { const u = new URL(LIVE); u.search = ""; return u.toString(); })(), ssl: { rejectUnauthorized: false } });
await db.connect();
const q = async (text, params = []) => (await db.query(text, params)).rows;

const dropAll = async () => {
  const names = (await q(`select tablename from pg_tables where schemaname = 'public' and tablename like $1`, [`${P}%`])).map((r) => r.tablename);
  for (const n of names) await q(`drop table if exists ${n}`);
  return names.length;
};
const liveMark = async () => JSON.stringify(await q(`select (select v from setter_store_meta where k = 'version') as v, (select count(*) from setter_store) as n, (select coalesce(max(ver), 0) from setter_store) as maxver, (select count(*) from setter_store_del) as dels, (select count(*) from setter_store_avatars) as pics`));

/** Makes one stand in store, laid out exactly as the app lays out its own (web/lib/hosted.ts, web/lib/avatars.ts). */
async function makeStore(t, store, pics, version) {
  await q(`create table ${t} (coll text not null, id text not null, data text not null, ord bigserial, ver bigint not null default 0, primary key (coll, id))`);
  await q(`create table ${t}_meta (k text primary key, v bigint not null)`);
  await q(`create table ${t}_del (coll text not null, id text not null, ver bigint not null)`);
  await q(`create table ${t}_avatars (id text primary key, url text not null, type text not null, data text not null, at timestamptz not null default now())`);
  // Supabase serves tables over a public web address unless row level security is on, so it goes on at once.
  for (const x of [t, `${t}_meta`, `${t}_del`, `${t}_avatars`]) await q(`alter table ${x} enable row level security`);
  await q(`insert into ${t}_meta (k, v) values ('version', $1)`, [version]);
  const rows = [...toRows(store)].map(([k, v]) => [...k.split("\u0000"), JSON.stringify(v)]);
  for (let i = 0; i < rows.length; i += 500) {
    const part = rows.slice(i, i + 500);
    await q(`insert into ${t} (coll, id, data, ver) select a, b, c, $4::bigint from unnest($1::text[], $2::text[], $3::text[]) as x(a, b, c)`, [part.map((r) => r[0]), part.map((r) => r[1]), part.map((r) => r[2]), Math.max(0, version - 1)]);
  }
  for (const p of pics) await q(`insert into ${t}_avatars (id, url, type, data, at) values ($1, $2, 'image/jpeg', $3, $4)`, [p.id, p.url, p.data, p.at]);
}
const readStore = async (t) => ({
  rows: await q(`select coll, id, data, ver::int as ver from ${t} order by coll, id`),
  version: Number((await q(`select v from ${t}_meta where k = 'version'`))[0].v),
  dels: await q(`select coll, id, ver::int as ver from ${t}_del order by coll, id`),
  pics: await q(`select id, url, type, data from ${t}_avatars order by id`),
});
const mark = (s) => JSON.stringify([s.rows, s.version, s.dels, s.pics]);

const snapDir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-check-"));
/** Runs the tool as the owner would, pointed at the stand in tables. Addresses travel in the environment, never on the command line. */
function run(args, over = {}) {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    env: { PATH: process.env.PATH, MERGE_SRC_URL: LIVE, MERGE_SRC_TABLE: T.src, MERGE_DEST_URL: LIVE, MERGE_DEST_TABLE: T.dst, MERGE_BASE_URL: LIVE, MERGE_BASE_TABLE: T.base, MERGE_SNAPSHOT_DIR: snapDir, ...over },
  });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

// ---------- a sample of real rows ----------

async function sample(ask, from) {
  const parse = (rows) => rows.map((r) => ({ coll: r.coll, id: r.id, data: r.data }));
  const rows = parse(await ask(`select coll, id, data from setter_store where coll in ('ws', 'config', 'labelQueue')`));
  // Real chats spread across the store (ordered by a hash of the id), and a few demo chats.
  const convs = parse(await ask(`(select coll, id, data from setter_store where coll = 'conversations' and id not like 'c_demo%' order by md5(id) limit 50) union all (select coll, id, data from setter_store where coll = 'conversations' and id like 'c_demo%' order by id limit 5)`));
  const ids = convs.map((r) => r.id);
  const rest = parse(await ask(`select coll, id, data from setter_store where coll in ('messages', 'events') and (data::jsonb ->> 'conversationId') = any($1::text[])`, [ids]));
  const s = fromRows([...rows, ...convs, ...rest]);
  s.from = from;
  return s;
}
let base;
try {
  if (!OLD) throw new Error("no DATABASE_URL");
  const n = neon(OLD);
  base = await sample((t, p = []) => n.query(t, p), "the old Neon copy");
} catch (e) {
  console.log(`(the old Neon copy could not be read: ${lockedReason(e) ? "locked" : "error"}. Sampling the live store instead, read only)`);
  base = await sample(q, "the live store");
}
console.log(`Sample from ${base.from}: ${base.conversations.length} chats, ${base.messages.length} messages, ${base.events.length} events, ${Object.keys(base.ws).length} workspace keys`);

// Keys and logins never go into a test table as they are.
{
  const w = base.ws;
  w.secret = "test_secret_base";
  w.apiToken = "test_token_base";
  for (const m of w.members ?? []) if (m.passwordHash) m.passwordHash = "hash_base";
  if (w.crm?.ghl) w.crm.ghl.token = "";
  if (w.crm) w.crm.webhookUrl = "";
  if (w.sheets) { w.sheets.secret = "test_sheets_secret"; w.sheets.url = ""; }
  if (w.calendar) delete w.calendar.token;
  if (w.meta) { delete w.meta.instagram; delete w.meta.page; delete w.meta.capiToken; }
  for (const k of Object.keys(base.config)) base.config[k] = "test_value";
  base.config.META_DASHBOARD_APP_ID ??= "test_value";
  base.hasConfig = true;
  w.settings ??= { defaultAiMode: "suggest", autopilotMaster: false, disclosure: "", replyDelaySeconds: 5 };
  w.intake ??= { businessName: "Old", goals: [] };
  w.knowledge ??= { items: [], gaps: [] };
  // Made up stages, triggers and one setting, so that db2 can remove, reorder and add some during "its month".
  w.pipeline = { stages: [{ id: "inbound", name: "New lead" }, { id: "st_mid", name: "Middle" }, { id: "st_old", name: "Old stage" }, { id: "won", name: "Won" }, { id: "st_edit", name: "Edit me" }], groups: [{ group: "Temperature", labels: ["Warm"] }] };
  w.triggers = [{ id: "t_keep", keyword: "PLAN", reply: "Here is the plan" }, { id: "t_old", keyword: "OLD", reply: "Retired" }];
  w.settings.oldOption = true;
  w.members ??= [];
  if (!w.members.some((m) => m.role === "owner")) w.members.push({ id: "m_owner", name: "Owner", email: "owner@example.com", role: "owner", team: "", areas: [], scope: "all", teamMetrics: true, active: true, passwordHash: "hash_base", createdAt: "2026-10-01T00:00:00.000Z" });
  if (!w.members.some((m) => m.demo)) w.members.push({ id: "demo_sam", name: "Sam", email: "", role: "setter", team: "", areas: [], scope: "all", teamMetrics: false, active: true, demo: true, createdAt: "1970-01-01T00:00:00.000Z" });
}

// ---------- the three stand in stores ----------
// base = the older copy. dst = Supabase: the copy plus what happened there after the move.
// src = db2: the copy, without the demo data, plus a month of Meta chats and the newer setup.

const norm = (s) => String(s ?? "").trim().toLowerCase();
const isDemo = (id) => String(id).startsWith("c_demo");
if (!base.conversations.some((c) => isDemo(c.id))) {
  base.conversations.push({ id: "c_demo_t1", platform: "instagram", externalId: "demo_t1", name: "Demo Lead", handle: "demo.lead", origin: "Inbound DM", stage: "inbound", labels: [], status: "open", aiMode: "suggest", unread: false, lastInboundAt: null, lastMessageAt: "2026-10-01T00:00:00.000Z", lead: {}, notes: "", createdAt: "2026-10-01T00:00:00.000Z" });
  base.messages.push({ id: "m_demo_t1", conversationId: "c_demo_t1", direction: "in", sender: "lead", text: "demo hello", sentAt: "2026-10-01T00:00:00.000Z", source: "seed" });
}
const countOf = (id) => base.messages.filter((m) => m.conversationId === id).length;
const nameN = {};
for (const c of base.conversations) nameN[norm(c.name)] = (nameN[norm(c.name)] ?? 0) + 1;
const picks = base.conversations
  .filter((c) => !isDemo(c.id) && nameN[norm(c.name)] === 1 && norm(c.name).length >= 2 && !/^instagram user|^unknown$/.test(norm(c.name)) && countOf(c.id) >= 1)
  .sort((a, b) => countOf(b.id) - countOf(a.id) || a.id.localeCompare(b.id));
if (picks.length < 4 || countOf(picks[0].id) < 3) throw new Error("The sample has too few chats with messages to build the stand in data.");
const [A, B, X, E] = picks;
E.name = "Twin Name";
const demoIds = new Set(base.conversations.filter((c) => isDemo(c.id)).map((c) => c.id));
const ownerId = base.ws.members.find((m) => m.role === "owner").id;

const conv = (id, o) => ({ id, platform: "instagram", externalId: o.externalId ?? o.scoped, ...(o.scoped ? { scopedUserId: o.scoped } : {}), name: o.name, handle: o.handle ?? null, origin: "Inbound DM", stage: o.stage ?? "in_conversation", labels: [], status: "open", aiMode: "suggest", unread: false, lastInboundAt: o.at, lastMessageAt: o.at, lead: {}, notes: "", suggestion: null, createdAt: o.at, ...(o.avatar ? { avatar: o.avatar, avatarAt: o.at, avatarSaved: o.avatar } : {}) });
const msg = (id, conversationId, direction, text, sentAt, source, extra = {}) => ({ id, conversationId, direction, sender: direction === "in" ? "lead" : "owner", text, sentAt, source, ...extra });
const started = (id, conversationId, at) => ({ id, conversationId, type: "conversation_started", by: "system", at });
const pic = (id, url, at = "2026-11-10T00:00:00.000Z") => ({ id, url, data: Buffer.from(`picture ${url}`).toString("base64"), at });
const U = (n) => `https://scontent.cdninstagram.com/v/t51/${n}.jpg`;
const plus = (iso, ms2) => new Date(new Date(iso).getTime() + ms2).toISOString();
const LONG = "Mostly the part about getting clients without ads, I have been stuck at the same level for a while now and want a way out";

// --- Supabase ---
const dst = clone(base);
{
  const w = dst.ws;
  const owner = w.members.find((m) => m.id === ownerId);
  owner.passwordHash = "hash_supabase_new";
  owner.lastLoginAt = "2026-11-19T06:44:53.923Z";
  w.settings.replyDelaySeconds = (base.ws.settings.replyDelaySeconds ?? 0) + 7;
  w.helper = { seenAt: "2026-11-20T09:00:00.000Z", version: "9.9", account: "supabase_account", outreachOn: false };
  // After the move, on Supabase: one stage added in the middle, one renamed. The order of the others is untouched.
  w.pipeline.stages.splice(2, 0, { id: "st_supa", name: "Added on Supabase" });
  w.pipeline.stages.find((s) => s.id === "st_edit").name = "Edited on Supabase";
  w.triggers.push({ id: "t_supa", keyword: "NEW", reply: "Added on Supabase" });
  const b = dst.conversations.find((c) => c.id === B.id);
  Object.assign(b, { notes: "Note written on Supabase", stage: "qualified", avatar: U("b_supabase"), avatarAt: "2026-11-01T00:00:00.000Z", avatarSaved: U("b_supabase") });
  dst.messages.push(msg("m_B_supa", B.id, "out", "Message written on Supabase after the move", "2026-11-20T08:30:00.000Z", "app"));
  dst.events.push({ id: "e_B_supa", conversationId: B.id, type: "stage_changed", stage: "qualified", by: "human", at: "2026-11-20T08:31:00.000Z" });
  // A chat removed on Supabase after the move.
  dst.conversations = dst.conversations.filter((c) => c.id !== X.id);
  dst.messages = dst.messages.filter((m) => m.conversationId !== X.id);
  dst.events = dst.events.filter((e) => e.conversationId !== X.id);
  // Chats that only Supabase has.
  dst.conversations.push({ ...conv("c_soloF", { externalId: "export_soloF", name: "Solo Name", at: "2026-11-20T07:00:00.000Z" }) });
  dst.messages.push(msg("m_F1", "c_soloF", "in", "A message only the Supabase chat has", "2026-11-20T07:00:00.000Z", "export"));
  // A chat the Chrome helper read off the page: no Instagram id, guessed times a millisecond apart, the last one cut short.
  dst.conversations.push(conv("c_helperH", { externalId: "h_helperhandle", handle: "helperhandle", name: "Helper Person", at: "2026-11-20T10:00:00.003Z" }));
  dst.messages.push(
    msg("m_H1", "c_helperH", "in", "Hey, saw your post about the program", "2026-11-20T10:00:00.000Z", "extension"),
    msg("m_H2", "c_helperH", "out", "Thanks for reaching out! What caught your eye?", "2026-11-20T10:00:00.001Z", "extension"),
    msg("m_H3", "c_helperH", "in", "ok", "2026-11-20T10:00:00.002Z", "extension"),
    msg("m_H4", "c_helperH", "in", LONG.slice(0, 60) + "…", "2026-11-20T10:00:00.003Z", "extension", { partial: true }),
  );
  dst.events.push(started("e_H_start", "c_helperH", "2026-11-20T10:00:00.000Z"));
  dst.conversations.push(conv("c_sharedG", { externalId: "h_sharedhandle", handle: "sharedhandle", name: "Shared Handle", at: "2026-11-20T11:00:00.000Z" }));
  dst.messages.push(msg("m_G1", "c_sharedG", "in", "hello from the shared handle", "2026-11-20T11:00:00.000Z", "extension"));
  dst.conversations.push(conv("c_lateK", { externalId: "17840000000000041", name: "Late One K", at: "2026-11-20T12:00:00.000Z" }));
  dst.messages.push(msg("m_K1", "c_lateK", "in", "message in the late chat on Supabase", "2026-11-20T12:00:00.000Z", "app"));
  dst.labelQueue.push({ id: "lq_B_supa", conversationId: B.id, platform: "instagram", name: B.name, handle: null, externalId: B.externalId, labels: ["Qualified"], status: "pending", createdAt: "2026-11-20T08:31:00.000Z" });
}
const dstPics = [pic(B.id, U("b_supabase")), pic([...demoIds][0], U("demo")), pic("c_lateK", U("late_k"))];

// --- db2 ---
const src = clone(base);
const lastA = base.messages.filter((m) => m.conversationId === A.id).sort((a, b) => a.sentAt.localeCompare(b.sentAt)).slice(-3);
const firstB = base.messages.filter((m) => m.conversationId === B.id).sort((a, b) => a.sentAt.localeCompare(b.sentAt))[0];
{
  src.conversations = src.conversations.filter((c) => !demoIds.has(c.id));
  src.messages = src.messages.filter((m) => !demoIds.has(m.conversationId));
  src.events = src.events.filter((e) => !demoIds.has(e.conversationId));
  src.labelQueue = src.labelQueue.filter((x) => !demoIds.has(x.conversationId));
  const w = src.ws;
  w.secret = "test_secret_db2";
  w.apiToken = "test_token_db2";
  w.helper = { seenAt: "2026-11-01T00:00:00.000Z", version: "1.0", account: "db2_account", outreachOn: false };
  w.members = w.members.filter((m) => !m.demo);
  w.members.find((m) => m.id === ownerId).passwordHash = "hash_db2_old";
  w.members.push({ id: "m_new_db2", name: "New Setter", email: "new.setter@example.com", role: "setter", team: "", areas: ["inbox"], scope: "all", teamMetrics: false, active: true, passwordHash: "hash_new_setter", createdAt: "2026-11-02T00:00:00.000Z" });
  w.intake = { ...w.intake, businessName: "New Brief Ltd", offer: "The newer offer from db2" };
  w.knowledge = {
    items: Array.from({ length: 12 }, (_, i) => ({ id: `k_${i}`, kind: "question", question: `Question ${i}`, answer: `Answer ${i}`, source: "manual", enabled: true, used: i, createdAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z", ...(i === 0 ? { conversationId: "c_metaA" } : {}) })),
    gaps: [{ id: "g_1", kind: "question", question: "An open question", quote: "?", status: "open", conversationIds: ["c_metaA", "c_metaN"], askedAt: "2026-11-04T00:00:00.000Z", lastAskedAt: "2026-11-04T00:00:00.000Z" }],
  };
  w.meta = { ...w.meta, instagram: { userId: "1784", username: "the_owner", accessToken: "test_meta_token", connectedAt: "2026-10-25T00:00:00.000Z", backfillDone: true } };
  // During its month db2 reordered the stages, renamed one, added one and removed two (st_old, st_edit),
  // removed a trigger and dropped a setting.
  w.pipeline = { stages: [{ id: "st_mid", name: "Middle renamed" }, { id: "st_new", name: "New in db2" }, { id: "inbound", name: "New lead" }, { id: "won", name: "Won" }], groups: [{ group: "Temperature", labels: ["Warm", "Hot"] }] };
  w.triggers = w.triggers.filter((x) => x.id !== "t_old");
  delete w.settings.oldOption;
  w.settings = { ...w.settings, replyDelaySeconds: (base.ws.settings.replyDelaySeconds ?? 0) + 1, disclosure: "Disclosure written in db2" };
  src.config.NEWKEY = "from_db2";

  // A chat both sides still have under the same id, changed on both.
  const b = src.conversations.find((c) => c.id === B.id);
  Object.assign(b, { labels: [...(B.labels ?? []), "Warm"], stage: "link_sent", avatar: U("b_db2"), avatarAt: "2026-11-15T00:00:00.000Z", avatarSaved: U("b_db2") });
  src.messages.push(msg("m_B_db2", B.id, "in", "Message that only db2 has", "2026-11-05T00:00:00.000Z", "webhook", { externalId: "mid.B.1" }));
  src.messages.find((m) => m.id === firstB.id).seenAt = "2026-11-02T00:00:00.000Z";
  src.messages.push(msg("m_X_db2", X.id, "in", "A later message in the chat Supabase removed", "2026-11-06T00:00:00.000Z", "webhook", { externalId: "mid.X.1" }));

  // The same person as export chat A, as Meta knows them: new id, Instagram id, the last three messages again.
  // db2 does not hold the export chat itself, so the two can only be told to be one person by name and messages.
  src.conversations = src.conversations.filter((c) => c.id !== A.id);
  src.messages = src.messages.filter((m) => m.conversationId !== A.id);
  src.events = src.events.filter((e) => e.conversationId !== A.id);
  src.labelQueue = src.labelQueue.filter((x) => x.conversationId !== A.id);
  src.conversations.push(conv("c_metaA", { scoped: "17840000000000001", handle: "a_handle", name: A.name, at: "2026-11-08T00:00:01.000Z", avatar: U("a") }));
  lastA.forEach((m, i) => src.messages.push({ ...msg(`m_metaA_${i}`, "c_metaA", m.direction, m.text, plus(m.sentAt, 20_000), "api_backfill", { externalId: `mid.A.${i}` }), sender: m.sender }));
  src.messages.push(msg("m_metaA_new1", "c_metaA", "in", "A newer message from Meta", "2026-11-08T00:00:00.000Z", "webhook", { externalId: "mid.A.n1" }), msg("m_metaA_new2", "c_metaA", "out", "And the reply", "2026-11-08T00:00:01.000Z", "app", { externalId: "mid.A.n2", memberId: "m_new_db2" }));
  src.events.push(started("e_metaA_start", "c_metaA", "2020-01-01T00:00:00.000Z"), { id: "e_metaA_link", conversationId: "c_metaA", type: "link_sent", detail: "Call", by: "human", at: "2026-11-08T00:00:01.000Z" });
  src.labelQueue.push({ id: "lq_metaA", conversationId: "c_metaA", platform: "instagram", name: A.name, handle: "a_handle", externalId: "17840000000000001", labels: ["In conversation"], status: "pending", createdAt: "2026-11-08T00:00:02.000Z" });
  src.labelQueue.push({ id: "lq_B_db2", conversationId: B.id, platform: "instagram", name: B.name, handle: null, externalId: B.externalId, labels: ["Link sent"], status: "pending", createdAt: "2026-11-01T00:00:00.000Z" });

  // The helper chat as Meta knows it: one older message, then the four the helper saw, with real times.
  src.conversations.push(conv("c_metaH", { scoped: "17840000000000002", handle: "helperhandle", name: "Helper P.", at: "2026-11-10T09:04:00.000Z", avatar: U("h") }));
  src.messages.push(
    msg("m_metaH_0", "c_metaH", "in", "ok", "2026-11-10T09:00:00.000Z", "api_backfill", { externalId: "mid.H.0" }),
    msg("m_metaH_1", "c_metaH", "in", "Hey, saw your post about the program", "2026-11-10T09:01:00.000Z", "api_backfill", { externalId: "mid.H.1" }),
    msg("m_metaH_2", "c_metaH", "out", "Thanks for reaching out! What caught your eye?", "2026-11-10T09:02:00.000Z", "api_backfill", { externalId: "mid.H.2" }),
    msg("m_metaH_3", "c_metaH", "in", "ok", "2026-11-10T09:03:00.000Z", "api_backfill", { externalId: "mid.H.3" }),
    msg("m_metaH_4", "c_metaH", "in", LONG, "2026-11-10T09:04:00.000Z", "api_backfill", { externalId: "mid.H.4" }),
  );
  src.events.push(started("e_metaH_start", "c_metaH", "2026-11-10T09:00:00.000Z"));

  // Only in db2.
  src.conversations.push(conv("c_metaN", { scoped: "17840000000000003", handle: "new_person", name: "Brand New Person", at: "2026-11-12T00:00:02.000Z", avatar: U("n") }));
  for (let i = 0; i < 3; i++) src.messages.push(msg(`m_metaN_${i}`, "c_metaN", i % 2 ? "out" : "in", `New chat message ${i}`, `2026-11-12T00:00:0${i}.000Z`, "webhook", { externalId: `mid.N.${i}` }));
  src.events.push(started("e_metaN_start", "c_metaN", "2026-11-12T00:00:00.000Z"));
  src.labelQueue.push({ id: "lq_metaN", conversationId: "c_metaN", platform: "instagram", name: "Brand New Person", handle: "new_person", externalId: "17840000000000003", labels: ["In conversation"], status: "pending", createdAt: "2026-11-12T00:00:03.000Z" });

  // Names that cannot be trusted: one name on three chats, and one unique name with no message in common.
  src.conversations.push(conv("c_twin1", { scoped: "17840000000000021", name: "Twin Name", at: "2026-11-13T00:00:00.000Z" }), conv("c_twin2", { scoped: "17840000000000022", name: "Twin Name", at: "2026-11-13T00:00:00.000Z" }));
  src.messages.push(msg("m_twin1", "c_twin1", "in", "first twin", "2026-11-13T00:00:00.000Z", "webhook"), msg("m_twin2", "c_twin2", "in", "second twin", "2026-11-13T00:00:00.000Z", "webhook"));
  src.conversations.push(conv("c_metaSolo", { scoped: "17840000000000023", name: "Solo Name", at: "2026-11-13T00:00:00.000Z" }));
  src.messages.push(msg("m_solo", "c_metaSolo", "in", "A message only the db2 chat has", "2026-11-13T00:00:00.000Z", "webhook"));
  // Two different Instagram ids behind one handle: two people.
  src.conversations.push(conv("c_conf1", { scoped: "17840000000000031", handle: "sharedhandle", name: "Conf One", at: "2026-11-13T00:00:00.000Z" }), conv("c_conf2", { scoped: "17840000000000032", handle: "sharedhandle", name: "Conf Two", at: "2026-11-13T00:00:00.000Z" }));
  // A join that only shows up once another join has happened: c_late1 gives the Supabase chat its handle, and
  // that handle then matches c_late2.
  src.conversations.push(conv("c_late1", { scoped: "17840000000000041", handle: "late_handle", name: "Late One", at: "2026-11-14T00:00:00.000Z" }), conv("c_late2", { externalId: "h_late_handle", handle: "late_handle", name: "Late Two", at: "2026-11-14T00:00:00.000Z" }));
  src.messages.push(msg("m_late1", "c_late1", "in", "message in late one", "2026-11-14T00:00:00.000Z", "webhook"), msg("m_late2", "c_late2", "in", "message in late two", "2026-11-14T00:00:01.000Z", "extension"));
}
const srcPics = [pic("c_metaA", U("a")), pic("c_metaN", U("n")), pic("c_metaH", U("h")), pic(B.id, U("b_db2")), pic("c_nochat", U("orphan"))];

const nDemo = demoIds.size;
const nDemoMsgs = dst.messages.filter((m) => demoIds.has(m.conversationId)).length;
const nDemoEvs = dst.events.filter((e) => demoIds.has(e.conversationId)).length;
const of = (store, id) => store.conversations.find((c) => c.id === id);
const msgsOf = (store, id) => store.messages.filter((m) => m.conversationId === id).sort((a, b) => a.sentAt.localeCompare(b.sentAt));

let liveBefore = "";
try {
  // ---------- 1. the rules, on plain data (no database) ----------
  const m1 = mergeStores(src, dst, base, {});
  const S = m1.store, R = m1.report;
  ok("the merge settles", m1.settled && R.settling.passes >= 2, R.settling);
  const again = planRows(S, mergeStores(src, S, base, {}).store);
  ok("merging the result again changes nothing", !again.ups.length && !again.dels.length, { ups: again.ups.length, dels: again.dels.length });
  ok("the inputs are not changed by the merge", same(src, clone(src)) && same(dst.ws.members.find((m) => m.id === ownerId).passwordHash, "hash_supabase_new"));

  const rule = (k) => R.ws.find((x) => x.key === k);
  eq("workspace rules: Supabase keeps id, apiToken, secret, helper", ["id", "apiToken", "secret", "helper"].map((k) => rule(k)?.rule), ["supabase", "supabase", "supabase", "supabase"]);
  eq("workspace rules: db2 leads on intake, knowledge, meta, pipeline, settings (merge)", ["intake", "knowledge", "meta", "pipeline", "settings"].map((k) => rule(k)?.rule), ["merge", "merge", "merge", "merge", "merge"]);
  ok("every workspace key has a rule, a reason and a result in the report", R.ws.length === new Set([...Object.keys(dst.ws), ...Object.keys(src.ws)]).size && R.ws.every((x) => x.rule && x.why && x.result));
  eq("the login secret, helper token and helper status stay Supabase's", [S.ws.secret, S.ws.apiToken, S.ws.helper.account], ["test_secret_base", "test_token_base", "supabase_account"]);
  const owner = S.ws.members.find((m) => m.id === ownerId);
  eq("the owner keeps the password that works on Supabase", owner.passwordHash, "hash_supabase_new");
  ok("a team member only db2 has is added", S.ws.members.some((m) => m.id === "m_new_db2" && m.passwordHash === "hash_new_setter"));
  ok("the sample team members are removed", !S.ws.members.some((m) => m.demo));
  eq("the brief comes from db2", [S.ws.intake.businessName, S.ws.intake.offer], ["New Brief Ltd", "The newer offer from db2"]);
  eq("the knowledge answers are db2's 12: answers from the older copy that db2 removed are gone", S.ws.knowledge.items.map((i) => i.id), src.ws.knowledge.items.map((i) => i.id));
  eq("the Meta connection comes from db2", S.ws.meta.instagram?.username, "the_owner");
  // Removed and reordered in db2 (the keys db2 must win).
  const stages = (s) => s.ws.pipeline.stages.map((x) => `${x.id}:${x.name}`);
  eq("pipeline: db2's order, db2's rename and new stage, the stage db2 removed is gone, Supabase's own changes stay in place",
    stages(S), ["st_mid:Middle renamed", "st_supa:Added on Supabase", "st_new:New in db2", "inbound:New lead", "won:Won", "st_edit:Edited on Supabase"]);
  eq("pipeline: the tag groups come from db2", S.ws.pipeline.groups, src.ws.pipeline.groups);
  const pr = rule("pipeline");
  ok("pipeline report: says what was removed as in db2, what was kept from Supabase and that db2's order was taken",
    same(pr.removedAsInDb2, ["pipeline.stages[st_old]"]) && pr.keptFromSupabase?.includes("pipeline.stages[st_supa] (added on Supabase)") && pr.keptFromSupabase?.includes("pipeline.stages[st_edit] (changed on Supabase, removed in db2)") && pr.takenFromDb2?.includes("pipeline.stages (order of the list)") && pr.result.startsWith("mixed"), pr);
  eq("triggers: the one db2 removed is gone, the one added on Supabase stays", S.ws.triggers.map((x) => x.id), ["t_keep", "t_supa"]);
  ok("triggers report names both", same(rule("triggers").removedAsInDb2, ["triggers[t_old]"]) && same(rule("triggers").keptFromSupabase, ["triggers[t_supa] (added on Supabase)"]), rule("triggers"));
  ok("settings: an option db2 dropped is dropped, and the report says so", !("oldOption" in S.ws.settings) && rule("settings").removedAsInDb2?.includes("settings.oldOption"), rule("settings"));
  ok("a list reordered on Supabase keeps Supabase's order, with db2's new stage next to its db2 neighbour", (() => {
    const d2 = clone(dst); d2.ws.pipeline.stages.reverse();
    const m = mergeStores(src, d2, base, {});
    const again2 = planRows(m.store, mergeStores(src, m.store, base, {}).store);
    return same(m.store.ws.pipeline.stages.map((x) => x.id), ["st_edit", "won", "st_supa", "st_mid", "st_new", "inbound"]) && m.report.ws.find((x) => x.key === "pipeline").keptFromSupabase.includes("pipeline.stages (order of the list, changed on Supabase)") && !again2.ups.length && !again2.dels.length;
  })());
  ok("--keep-missing removes nothing db2 lacks and lists each part", (() => {
    const m = mergeStores(src, dst, base, { keepMissing: true });
    const r = m.report.ws.find((x) => x.key === "pipeline");
    return m.store.ws.pipeline.stages.some((x) => x.id === "st_old") && m.store.ws.triggers.some((x) => x.id === "t_old") && m.store.ws.settings.oldOption === true && r.keptAlthoughDb2DoesNotHaveIt?.includes("pipeline.stages[st_old]") && !r.removedAsInDb2;
  })());
  eq("--ws pipeline=db2 takes db2's pipeline whole", mergeStores(src, dst, base, { ws: { pipeline: "db2" } }).store.ws.pipeline, src.ws.pipeline);
  ok("a whole workspace key db2 does not have is kept", (() => { const s2 = clone(src); delete s2.ws.triggers; const m = mergeStores(s2, dst, base, {}); return same(m.store.ws.triggers, dst.ws.triggers) && m.report.ws.find((x) => x.key === "triggers").result === "only on Supabase, kept"; })());
  eq("settings: the one changed on Supabase is kept, the rest follow db2", [S.ws.settings.replyDelaySeconds, S.ws.settings.disclosure], [dst.ws.settings.replyDelaySeconds, "Disclosure written in db2"]);
  ok("the report names the setting kept from Supabase", rule("settings").keptFromSupabase?.includes("settings.replyDelaySeconds"), rule("settings"));
  eq("a setup key only db2 has is added", S.config.NEWKEY, "from_db2");
  ok("setup key values are not in the report", !JSON.stringify(R.config).includes("from_db2"));
  eq("knowledge that points at a joined chat points at the surviving chat", [S.ws.knowledge.items.find((i) => i.id === "k_0").conversationId, S.ws.knowledge.gaps.find((g) => g.id === "g_1").conversationIds], [A.id, [A.id, "c_metaN"]]);

  eq("overrides: --ws settings=db2, intake=supabase, members=db2", (() => { const s = mergeStores(src, dst, base, { ws: { settings: "db2", intake: "supabase", members: "db2" } }).store.ws; return [same(s.settings, src.ws.settings), same(s.intake, dst.ws.intake), s.members.find((m) => m.id === ownerId).passwordHash]; })(), [true, true, "hash_db2_old"]);
  eq("overrides: --config NEWKEY=supabase leaves it out", mergeStores(src, dst, base, { config: { NEWKEY: "supabase" } }).store.config.NEWKEY, undefined);

  ok("demo chats are removed", !S.conversations.some((c) => isDemo(c.id)) && R.conv.demoRemoved === nDemo, R.conv.demoRemoved);
  ok("demo messages and events go with them", !S.messages.some((m) => demoIds.has(m.conversationId)) && !S.events.some((e) => demoIds.has(e.conversationId)) && R.msg.removedWithDemoChats === nDemoMsgs && R.ev.removedWithDemoChats === nDemoEvs);
  ok("--keep-demo keeps them", mergeStores(src, dst, base, { keepDemo: true }).store.conversations.filter((c) => isDemo(c.id)).length === nDemo);
  eq("chat count after", S.conversations.length, dst.conversations.length - nDemo + 6);
  eq("message count after", S.messages.length, dst.messages.length - nDemoMsgs + 12);

  // Export chat A and its Meta twin.
  const a = of(S, A.id);
  ok("export chat and Meta chat are joined by name plus shared messages", !of(S, "c_metaA") && R.conv.joins.some((j) => j.db2 === "c_metaA" && j.supabase === A.id && j.why === "same name and shared messages"), R.conv.joins.filter((j) => j.db2 === "c_metaA"));
  eq("the surviving chat keeps its id and export id and gains the Instagram id and handle", [a.externalId, a.scopedUserId, a.handle], [A.externalId, "17840000000000001", "a_handle"]);
  eq("its messages: the three both sides hold are not doubled, the two new ones are added", msgsOf(S, A.id).length, countOf(A.id) + 2);
  ok("the shared messages keep the Supabase id and gain Meta's message id", lastA.every((m, i) => S.messages.find((x) => x.id === m.id)?.externalId === `mid.A.${i}`) && !S.messages.some((m) => /^m_metaA_\d$/.test(m.id)));
  ok("no message or event still points at a chat that was joined away", !S.messages.some((m) => ["c_metaA", "c_metaH", "c_late1", "c_lateK"].includes(m.conversationId)) && !S.events.some((e) => ["c_metaA", "c_metaH"].includes(e.conversationId)) && !S.labelQueue.some((x) => x.conversationId === "c_metaA"));
  ok("every message from db2 belongs to a chat that exists", S.messages.every((m) => of(S, m.conversationId) || dst.messages.some((d) => d.id === m.id)));
  eq("the team member on a db2 message is kept", S.messages.find((m) => m.id === "m_metaA_new2")?.memberId, "m_new_db2");
  eq("events are moved to the surviving chat", S.events.find((e) => e.id === "e_metaA_link")?.conversationId, A.id);
  eq("a chat has one start, at the earlier time", S.events.filter((e) => e.conversationId === A.id && e.type === "conversation_started").map((e) => e.at), ["2020-01-01T00:00:00.000Z"]);
  eq("label jobs are moved to the surviving chat, one waiting job per chat", S.labelQueue.filter((x) => x.conversationId === A.id && x.status === "pending").map((x) => x.id), ["lq_metaA"]);
  ok("an older waiting label job from db2 does not replace Supabase's newer one", S.labelQueue.some((x) => x.id === "lq_B_supa") && !S.labelQueue.some((x) => x.id === "lq_B_db2") && S.labelQueue.some((x) => x.id === "lq_metaN"));

  // The helper chat and its Meta twin.
  const h = of(S, "c_helperH");
  ok("helper chat and Meta chat are joined by handle", !of(S, "c_metaH") && R.conv.joins.some((j) => j.db2 === "c_metaH" && j.supabase === "c_helperH" && j.why === "same handle"));
  eq("helper chat gains the Instagram id, keeps its own id", [h.scopedUserId, h.externalId], ["17840000000000002", "h_helperhandle"]);
  const hm = msgsOf(S, "c_helperH");
  eq("helper messages are lined up in order: five messages, none doubled", hm.map((m) => m.id), ["m_metaH_0", "m_H1", "m_H2", "m_H3", "m_H4"]);
  eq("their guessed times are replaced by the real ones", hm.map((m) => m.sentAt.slice(11, 16)), ["09:00", "09:01", "09:02", "09:03", "09:04"]);
  ok("the message the chat list cut short is made whole", hm[4].text === LONG && !hm[4].partial && hm[4].externalId === "mid.H.4");
  eq("the chat's last message time follows", [h.lastMessageAt, h.lastInboundAt], ["2026-11-10T09:04:00.000Z", "2026-11-10T09:04:00.000Z"]);
  eq("helper chat start time is the earlier one", S.events.filter((e) => e.conversationId === "c_helperH" && e.type === "conversation_started").map((e) => e.at), ["2026-11-10T09:00:00.000Z"]);

  // The chat both sides have under one id.
  const b = of(S, B.id);
  eq("same chat changed on both sides: Supabase's note and stage stay, db2's tags come across", [b.notes, b.stage, b.labels.includes("Warm")], ["Note written on Supabase", "qualified", true]);
  ok("the report lists what was kept from Supabase for that chat", R.conv.supabaseFieldsKept.some((k) => k.chat === B.id && k.fields.includes("notes")), R.conv.supabaseFieldsKept);
  ok("messages written on each side after the split are both there", S.messages.some((m) => m.id === "m_B_supa") && S.messages.some((m) => m.id === "m_B_db2"));
  eq("a detail db2 added to a shared message comes across", S.messages.find((m) => m.id === firstB.id).seenAt, "2026-11-02T00:00:00.000Z");
  eq("the newer picture wins", b.avatarSaved, U("b_db2"));

  ok("a chat removed on Supabase after the move stays removed, with its messages", !of(S, X.id) && !S.messages.some((m) => m.conversationId === X.id) && R.conv.removedOnSupabaseSinceCopyNotBroughtBack.some((x) => x.id === X.id));
  ok("--bring-back brings it back", Boolean(of(mergeStores(src, dst, base, { bringBack: [X.id] }).store, X.id)));
  ok("a chat only db2 has comes across whole", Boolean(of(S, "c_metaN")) && msgsOf(S, "c_metaN").length === 3);
  ok("a name shared by several chats joins nothing", Boolean(of(S, "c_twin1")) && Boolean(of(S, "c_twin2")) && R.conv.ambiguousNamesLeftSeparate.length === 2, R.conv.ambiguousNamesLeftSeparate);
  ok("a unique name with no shared message is left as two chats and reported", Boolean(of(S, "c_metaSolo")) && Boolean(of(S, "c_soloF")) && R.conv.possibleSamePersonLeftSeparate.some((p) => p.src === "c_metaSolo" && p.supabase === "c_soloF"));
  ok("--names unique joins them", (() => { const s = mergeStores(src, dst, base, { names: "unique" }).store; return !of(s, "c_metaSolo") && of(s, "c_soloF").scopedUserId === "17840000000000023"; })());
  ok("--join joins a pair by hand", (() => { const s = mergeStores(src, dst, base, { join: ["c_metaSolo=c_soloF"] }).store; return !of(s, "c_metaSolo") && msgsOf(s, "c_soloF").length === 2; })());
  ok("--separate keeps a chat apart", Boolean(of(mergeStores(src, dst, base, { separate: ["c_metaH"] }).store, "c_metaH")));
  ok("two Instagram ids behind one handle stay two chats", Boolean(of(S, "c_conf1")) && Boolean(of(S, "c_conf2")) && !of(S, "c_sharedG").scopedUserId && R.conv.differentPeopleLeftSeparate.length === 1);
  const late = ["c_lateK", "c_late1", "c_late2"].filter((id) => of(S, id));
  ok("a join that appears after another join is found before anything is written", late.length === 1 && msgsOf(S, late[0]).length === 3 && of(S, late[0]).scopedUserId === "17840000000000041", late);

  // Pictures.
  const pp = planAvatars(srcPics.map((p) => ({ ...p, n: p.data.length })), dstPics.map((p) => ({ ...p, n: p.data.length })), m1);
  eq("picture plan", [pp.copy.map((c) => `${c.from}>${c.to}${c.replaces ? "!" : ""}`).sort(), pp.move, pp.remove, pp.noChat], [[`${B.id}>${B.id}!`, `c_metaA>${A.id}`, "c_metaH>c_helperH", "c_metaN>c_metaN"].sort(), [{ from: "c_lateK", to: late[0] }], [[...demoIds][0]], 1]);

  // Without the older copy the merge still settles and still never drops a Supabase chat.
  const nb = mergeStores(src, dst, null, {});
  const nbAgain = planRows(nb.store, mergeStores(src, nb.store, null, {}).store);
  ok("without the older copy: settles, repeat changes nothing, warning shown", nb.settled && !nbAgain.ups.length && !nbAgain.dels.length && nb.report.warnings.some((w) => w.includes("older Neon copy")));
  const nbp = nb.report.ws.find((x) => x.key === "pipeline");
  ok("without the older copy: nothing db2 lacks is removed, and every Supabase only stage, trigger and setting is listed",
    same(nb.store.ws.pipeline.stages.map((x) => x.id), ["inbound", "st_mid", "st_new", "st_supa", "st_old", "won", "st_edit"]) && ["pipeline.stages[st_supa]", "pipeline.stages[st_old]", "pipeline.stages[st_edit]"].every((x) => nbp.keptAlthoughDb2DoesNotHaveIt?.includes(x)) && nbp.keptAlthoughDb2DoesNotHaveIt.some((x) => x.startsWith("pipeline.stages (Supabase's order")) && same(nb.report.ws.find((x) => x.key === "triggers").keptAlthoughDb2DoesNotHaveIt, ["triggers[t_old]", "triggers[t_supa]"]) && nb.report.ws.find((x) => x.key === "settings").keptAlthoughDb2DoesNotHaveIt?.includes("settings.oldOption"), { stages: nb.store.ws.pipeline.stages.map((x) => x.id), nbp });
  ok("without the older copy: chats with activity after the move keep their Supabase details", of(nb.store, B.id).notes === "Note written on Supabase" && of(nb.store, B.id).stage === "qualified");
  ok("without the older copy: every real Supabase chat survives or is joined", dst.conversations.filter((c) => !isDemo(c.id)).every((c) => of(nb.store, c.id) || nb.movedOnSupabase.has(c.id)));

  eq("lock detection: Neon's quota answer is recognised", [Boolean(lockedReason(new Error('Server error (HTTP status 402): {"message":"Your account or project has exceeded the quota."}'))), lockedReason(new Error("relation does not exist")), lockedReason(new Error("x 402 postgres://u:secretpw@host/db")).includes("secretpw")], [true, null, false]);
  ok("unknown options are refused", (() => { try { parseArgs(["--aply"]); return false; } catch { return true; } })() && parseArgs(["--ws", "meta=supabase", "--apply"]).ws.meta === "supabase");

  // ---------- 2. the tool itself, on stand in tables ----------
  liveBefore = await liveMark();
  const stale = await dropAll();
  if (stale) console.log(`(dropped ${stale} stand in tables left by an earlier run)`);
  await makeStore(T.base, base, [], 10);
  await makeStore(T.src, src, srcPics, 50);
  await makeStore(T.dst, dst, dstPics, 100);
  const before = await readStore(T.dst);
  const srcBefore = mark(await readStore(T.src)), baseBefore = mark(await readStore(T.base));

  // Dry run.
  const jsonFile = path.join(snapDir, "report.json");
  const dry = run(["--json", jsonFile]);
  if (process.env.SHOW_REPORT) console.log(dry.out);
  ok("dry run exits cleanly", dry.code === 0 && dry.out.includes("DRY RUN: nothing was written"), dry.out.slice(-600));
  ok("dry run writes nothing", mark(await readStore(T.dst)) === mark(before) && !fs.readdirSync(snapDir).some((f) => f.endsWith(".gz")));
  ok("dry run report shows the rule for every workspace key and how to change it", Object.keys(S.ws).every((k) => new RegExp(`\\n  ${k} +(supabase|merge|db2) `).test(dry.out)) && dry.out.includes("--ws <key>=db2"), dry.out.slice(0, 1500));
  ok("dry run report names what is removed because db2 removed it", /removed because db2 removed it: pipeline\.stages\[st_old\]/.test(dry.out) && /removed because db2 removed it: triggers\[t_old\]/.test(dry.out) && dry.out.includes("--keep-missing"), dry.out.slice(0, 3000));
  ok("dry run report shows no key, token or password", !/test_secret|test_token|hash_|test_meta_token|from_db2|test_value/.test(dry.out));
  const rep = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
  ok("the saved report matches the merge worked out above", same(rep.report.conv.joinedBy, R.conv.joinedBy) && rep.report.msg.after === S.messages.length && rep.rows.write.conversations > 0 && rep.rows.remove.conversations === nDemo + 1, rep.rows);
  ok("the older copy was used", /older Neon copy +table setter_test_merge_base/.test(dry.out), dry.out.slice(0, 700));

  // Apply.
  const ap = run(["--apply"]);
  ok("apply exits cleanly", ap.code === 0 && ap.out.includes("APPLIED:"), ap.out.slice(-800));
  const after = await readStore(T.dst);
  const got = fromRows(after.rows);
  const want = planRows(got, S);
  ok("the table now holds exactly the merged store", !want.ups.length && !want.dels.length, { ups: want.ups.slice(0, 3).map((u) => u.slice(0, 2)), dels: want.dels.slice(0, 3) });
  eq("the version went up by exactly one", after.version, before.version + 1);
  const was = new Map(before.rows.map((r) => [r.coll + "/" + r.id, r]));
  const now = new Map(after.rows.map((r) => [r.coll + "/" + r.id, r]));
  const changed = after.rows.filter((r) => was.get(r.coll + "/" + r.id)?.data !== r.data);
  ok("every row written carries the new version, untouched rows keep theirs", changed.length > 0 && changed.every((r) => r.ver === after.version) && after.rows.filter((r) => !changed.includes(r)).every((r) => r.ver === was.get(r.coll + "/" + r.id).ver));
  const removed = before.rows.filter((r) => !now.has(r.coll + "/" + r.id)).map((r) => r.coll + "/" + r.id).sort();
  ok("every removed row left a deletion marker at the new version", removed.length > 0 && same(after.dels.map((d) => d.coll + "/" + d.id).sort(), removed) && after.dels.every((d) => d.ver === after.version), { removed: removed.length, dels: after.dels.length });
  // What a running copy of the app does on its next request (hostedRefresh in web/lib/hosted.ts): rows and
  // deletion markers newer than the version it holds, applied to what it has in memory.
  const mem = new Map(before.rows.map((r) => [r.coll + "/" + r.id, r.data]));
  for (const r of await q(`select coll, id, data from ${T.dst} where ver > $1`, [before.version])) mem.set(r.coll + "/" + r.id, r.data);
  for (const d of await q(`select coll, id from ${T.dst}_del where ver > $1`, [before.version])) if (!changed.some((r) => r.coll === d.coll && r.id === d.id)) mem.delete(d.coll + "/" + d.id);
  ok("a running copy of the app that reads only what changed ends up with the full merged store", mem.size === now.size && [...mem].every(([k, v]) => now.get(k)?.data === v));
  eq("pictures after apply", after.pics.map((p) => `${p.id}=${p.url}`).sort(), [`${A.id}=${U("a")}`, `${B.id}=${U("b_db2")}`, `c_helperH=${U("h")}`, `c_metaN=${U("n")}`, `${late[0]}=${U("late_k")}`].sort());
  ok("picture contents were copied whole", after.pics.find((p) => p.id === A.id).data === srcPics[0].data);
  const snaps = fs.readdirSync(snapDir).filter((f) => f.endsWith(".json.gz"));
  const snapFile = path.join(snapDir, snaps[0] ?? "missing");
  ok("a snapshot was taken before writing, readable only by this user", snaps.length === 1 && (fs.statSync(snapFile).mode & 0o077) === 0, snaps);
  const snap = JSON.parse(zlib.gunzipSync(fs.readFileSync(snapFile)).toString("utf8"));
  ok("the snapshot holds Supabase as it was, with the pictures that were replaced or removed", snap.version === before.version && same(snap.rows.map((r) => [r.coll, r.id, r.data]).sort(), before.rows.map((r) => [r.coll, r.id, r.data]).sort()) && same(snap.avatarsBefore.map((p) => p.id).sort(), dstPics.map((p) => p.id).sort()));
  ok("db2 and the older copy were only read", mark(await readStore(T.src)) === srcBefore && mark(await readStore(T.base)) === baseBefore);

  // Run twice: the second run must change nothing.
  const afterMark = mark(after);
  const ap2 = run(["--apply"]);
  ok("second apply says there is nothing to do", ap2.code === 0 && ap2.out.includes("NOTHING TO DO"), ap2.out.slice(-500));
  ok("second apply changed nothing: same rows, same version, same markers, same pictures, no new snapshot", mark(await readStore(T.dst)) === afterMark && fs.readdirSync(snapDir).filter((f) => f.endsWith(".json.gz")).length === 1);
  const dry2 = run([]);
  ok("a dry run after the apply reports nothing to do", dry2.code === 0 && dry2.out.includes("NOTHING TO DO") && /total: write 0, remove 0/.test(dry2.out), dry2.out.slice(-500));
  // The app keeps writing after the merge. A later run must leave that alone too.
  await q(`update ${T.dst}_meta set v = v + 1 where k = 'version'`);
  await q(`insert into ${T.dst} (coll, id, data, ver) values ('messages', 'm_after_merge', $1, $2)`, [JSON.stringify(msg("m_after_merge", A.id, "in", "Written by the app after the merge", "2026-12-02T00:00:00.000Z", "webhook", { externalId: "mid.after" })), after.version + 1]);
  const laterMark = mark(await readStore(T.dst));
  const ap3 = run(["--apply"]);
  ok("a run after the app has written more still changes nothing", ap3.code === 0 && ap3.out.includes("NOTHING TO DO") && mark(await readStore(T.dst)) === laterMark, ap3.out.slice(-500));

  // Undo.
  const rdry = run(["--restore", snapFile]);
  ok("restore dry run writes nothing", rdry.code === 0 && rdry.out.includes("DRY RUN") && mark(await readStore(T.dst)) === laterMark, rdry.out.slice(-400));
  const rs = run(["--restore", snapFile, "--apply"]);
  const back = await readStore(T.dst);
  ok("restore puts Supabase back as it was, through a new version", rs.code === 0 && same(back.rows.map((r) => [r.coll, r.id, r.data]), before.rows.map((r) => [r.coll, r.id, r.data])) && same(back.pics, before.pics) && back.version === after.version + 2, rs.out.slice(-500));
  ok("rows the restore wrote or removed are stamped and marked too", back.rows.filter((r) => r.data !== now.get(r.coll + "/" + r.id)?.data).every((r) => r.ver === back.version) && back.dels.some((d) => d.id === "c_metaN" && d.ver === back.version));

  // The real db2, which is locked: the tool must say so and write nothing. The stand in table is the target here,
  // so the live store is not even read.
  const realDb2 = env.SETTER_DATABASE_URL;
  if (!realDb2) console.log("SKIP  lock check against the real db2 (no SETTER_DATABASE_URL)");
  else {
    const lockMark = mark(await readStore(T.dst));
    const lk = run([], { MERGE_SRC_URL: realDb2, MERGE_SRC_TABLE: "setter_store" });
    if (/STILL LOCKED/.test(lk.out)) {
      const lk2 = run(["--apply"], { MERGE_SRC_URL: realDb2, MERGE_SRC_TABLE: "setter_store" });
      ok("real db2: the lock is reported plainly and the dry run exits cleanly", lk.code === 0 && lk.out.includes("Nothing was read from db2 and nothing was written"), lk.out);
      ok("real db2: --apply stops with exit code 2 and writes nothing", lk2.code === 2 && mark(await readStore(T.dst)) === lockMark, lk2.out);
      ok("the lock message shows no address", !/postgres(ql)?:\/\//.test(lk.out + lk2.out));
    } else console.log("SKIP  lock check against the real db2: it answered, so it is no longer locked");
  }
} catch (e) {
  ok("the check ran to the end", false, e?.stack ?? e);
} finally {
  const dropped = await dropAll().catch(() => -1);
  const left = (await q(`select tablename from pg_tables where schemaname = 'public' and tablename like $1`, [`${P}%`]).catch(() => [{ tablename: "?" }])).length;
  ok(`stand in tables dropped (${dropped}), none left behind`, left === 0, left);
  // The tool was only ever given the stand in table names, so it cannot reach the live tables. This line is a second
  // look. The live app may be in use while the check runs, so a change here is reported but cannot be pinned on the tool.
  if (liveBefore) {
    if ((await liveMark()) === liveBefore) ok("the live store tables did not change while the tool ran", true);
    else console.log("NOTE  the live store changed while the check ran (the app is in use). Not counted: the tool was only given stand in tables.");
  }
  fs.rmSync(snapDir, { recursive: true, force: true });
  await db.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
