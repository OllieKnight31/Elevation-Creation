#!/usr/bin/env node
// Merges the data held in the second Neon database (db2) into the live Supabase store, once db2 unlocks.
//
// db2 was the live database until 19 Nov 2026 and holds the newest real data: the chats pulled from Meta, the
// business brief, the knowledge answers, the Meta connection and the saved profile pictures. Supabase was filled
// from the older Neon copy and has been live since, so it holds the working owner login and everything changed
// after the move. This tool joins the two without losing either side.
//
//   node web/scripts/merge-db2.mjs --env <env file>            dry run: prints the full report, writes nothing
//   node web/scripts/merge-db2.mjs --env <env file> --apply    takes a snapshot, then writes
//   node web/scripts/merge-db2.mjs --env <env file> --restore <snapshot file> [--apply]   puts a snapshot back
//
// Choices that can be changed (the dry run report shows what each one did):
//   --ws key=db2|supabase|merge       which side wins one workspace key (members also takes db2 = db2 passwords)
//   --config KEY=db2|supabase|merge   the same for one saved setup key
//   --names evidence|unique|off       joining chats by name: only with a shared message (default), on a unique
//                                     name alone, or never
//   --join <db2 chat id>=<supabase chat id>   join two chats by hand
//   --separate <db2 chat id>          never join this db2 chat to another chat
//   --bring-back <db2 chat id>        bring back a chat that was removed on Supabase after the move
//   --keep-demo                       keep the demo chats and demo team members
//   --keep-missing                    never remove a stage, tag, trigger, answer or setting because db2 no longer
//                                     has it (by default one that Supabase still holds as copied goes, as in db2)
//   --cutover <ISO time>              when Supabase took over (default 2026-11-19T00:00:00Z); only used when the
//                                     older Neon copy cannot be read to see what changed on Supabase since
//   --no-base                         do not read the older Neon copy
//   --no-avatars                      leave the saved profile pictures alone
//   --json <file>                     also write the whole report, with every joined chat, as JSON
//   --all                             print every line of the long lists instead of the first 15
//
// Run the dry run again after an apply: it must say there is nothing to do. Apply at a quiet moment with the
// inbox closed, because a copy of the app that is half way through a request can still save its older view of a chat.
// The snapshot taken before an apply holds keys and logins. It is written to .data/merge-snapshots (not in git).
// When db2 is still locked the tool says so and stops: exit code 0 for a dry run, 2 for --apply.
//
// Addresses come from the environment (or the file given with --env, such as one made by `vercel env pull`):
//   SETTER_DATABASE_URL                                   db2, read only
//   SUPA_POSTGRES_URL_NON_POOLING or SUPA_POSTGRES_URL    Supabase, the store that is written
//   DATABASE_URL                                          the older Neon copy Supabase was filled from, read only
// For tests, MERGE_SRC_URL / MERGE_SRC_TABLE, MERGE_DEST_URL / MERGE_DEST_TABLE, MERGE_BASE_URL / MERGE_BASE_TABLE
// and MERGE_SNAPSHOT_DIR point the tool at stand in tables instead.

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import pg from "pg";
import { neon } from "@neondatabase/serverless";

const LISTS = ["conversations", "messages", "events", "labelQueue"];
const SEP = "\u0000";
// Deletion markers the app keeps (web/lib/hosted.ts). Older ones are cleared with every write, as the app does.
const KEEP_DELETIONS = 5000;

// ---------- small helpers ----------

/** Text form that ignores the order of keys, so two records with the same content always compare equal. */
export const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
export const same = (a, b) => stable(a) === stable(b);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const hasIds = (a) => Array.isArray(a) && a.every((x) => isObj(x) && typeof x.id === "string");
const uniqueIds = (a) => new Set(a.map((x) => x.id)).size === a.length;
const blank = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length);
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/^@/, "");
const cleanText = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const union = (a, b) => [...new Set([...(a ?? []), ...(b ?? [])])];
const later = (a, b) => ((a ?? "") >= (b ?? "") ? a : b);
const ms = (iso) => new Date(iso).getTime();
const isDemoId = (id) => String(id).startsWith("c_demo");
const size = (v) => (v === undefined ? 0 : JSON.stringify(v).length);

/**
 * Puts the records of a list in order. `first` gives the order; a record only `second` has goes in right after the
 * record it follows there (or before the one it comes ahead of), so a stage added on one side lands where that
 * side put it and not after the final stage.
 */
function weave(first, second) {
  const out = [...first];
  const have = new Set(out);
  second.forEach((id, i) => {
    if (have.has(id)) return;
    let at = -1;
    for (let j = i - 1; j >= 0 && at < 0; j--) if (have.has(second[j])) at = out.indexOf(second[j]) + 1;
    for (let j = i + 1; j < second.length && at < 0; j++) if (have.has(second[j])) at = out.indexOf(second[j]);
    out.splice(at < 0 ? out.length : at, 0, id);
    have.add(id);
  });
  return out;
}

/**
 * The three way rule everything else is built on. base is the record as it was when Supabase was filled, dest is
 * Supabase now, src is db2. A value changed on Supabase since the copy stays; anything else follows db2, which was
 * live for the month in between. Following db2 includes what db2 took away: a field or a record that Supabase still
 * holds exactly as it was copied, and db2 no longer has, was removed in db2 and goes. Plain objects are merged field
 * by field and lists of records one record at a time, so one edit on Supabase does not throw away the rest of what
 * db2 holds. A list of records takes db2's order unless the order was changed on Supabase since the copy.
 *
 * Without the older copy there is no telling "removed in db2" from "added on Supabase", so nothing db2 lacks is
 * removed; each such part is listed instead (ctx.only), and the owner can take db2's value whole with --ws key=db2.
 */
export function merge3(b, d, s, ctx, p = "") {
  if (s === undefined) {
    if (d === undefined) return undefined;
    // Two different records for one person: db2's record never held this, so its absence says nothing.
    if (ctx.protect) return d;
    if (ctx.hasBase && !ctx.keepMissing) {
      if (b !== undefined && same(d, b)) { ctx.dropped?.push(p); return undefined; }
      ctx.kept?.push(`${p} (${b === undefined ? "added on Supabase" : "changed on Supabase, removed in db2"})`);
      return d;
    }
    ctx.only?.push(p);
    return d;
  }
  // Removed on Supabase after the copy: it stays removed.
  if (d === undefined) {
    if (ctx.hasBase && b !== undefined) { ctx.kept?.push(`${p} (removed on Supabase)`); return undefined; }
    return s;
  }
  if (same(d, s)) return d;
  const whole = ctx.atomic?.has(p);
  if (!whole && isObj(d) && isObj(s)) {
    const out = {};
    for (const k of new Set([...Object.keys(d), ...Object.keys(s)])) {
      const v = merge3(isObj(b) ? b[k] : undefined, d[k], s[k], ctx, p ? `${p}.${k}` : k);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (!whole && hasIds(d) && hasIds(s) && uniqueIds(d) && uniqueIds(s)) {
    const bl = hasIds(b) ? b : [];
    const bm = new Map(bl.map((x) => [x.id, x]));
    const sm = new Map(s.map((x) => [x.id, x]));
    const dm = new Map(d.map((x) => [x.id, x]));
    const keep = new Map();
    for (const x of d) { const v = merge3(bm.get(x.id), x, sm.get(x.id), ctx, `${p}[${x.id}]`); if (v !== undefined) keep.set(x.id, v); }
    for (const x of s) {
      if (dm.has(x.id)) continue;
      if (ctx.hasBase && bm.has(x.id)) { ctx.kept?.push(`${p}[${x.id}] (removed on Supabase)`); continue; }
      keep.set(x.id, x);
    }
    const dIds = d.map((x) => x.id).filter((id) => keep.has(id)), sIds = s.map((x) => x.id).filter((id) => keep.has(id));
    // Was the order changed on Supabase since the copy? Records added or removed there do not count as a reorder.
    const dOld = d.map((x) => x.id).filter((id) => bm.has(id)), bOld = bl.map((x) => x.id).filter((id) => dm.has(id));
    const followDb2 = ctx.hasBase && !ctx.protect && same(dOld, bOld);
    const differ = !same(dIds.filter((id) => sm.has(id)), sIds.filter((id) => dm.has(id)));
    if (differ) {
      if (followDb2) ctx.took?.push(`${p} (order of the list)`);
      else if (ctx.hasBase) ctx.kept?.push(`${p} (order of the list, changed on Supabase)`);
      else ctx.only?.push(`${p} (Supabase's order; db2 has another)`);
    }
    const out = (followDb2 ? weave(sIds, dIds) : weave(dIds, sIds)).map((id) => keep.get(id));
    return same(out, d) ? d : out;
  }
  const changed = ctx.hasBase ? !same(d, b) : Boolean(ctx.touched);
  if (changed) { ctx.kept?.push(p); return d; }
  // A value db2 never filled in does not wipe one Supabase has, when the two records are not the same record.
  if (ctx.protect && blank(s) && !blank(d)) return d;
  ctx.took?.push(p);
  return s;
}

// ---------- workspace keys ----------

// How each workspace key is decided. Anything not listed uses "merge": db2 wins, except the parts changed on
// Supabase since the copy. The reasons are printed in the report.
export const WS_RULES = {
  id: ["supabase", "the workspace id the live app already uses"],
  apiToken: ["supabase", "the Chrome helper is linked to the live app with this token"],
  secret: ["supabase", "signs the login sessions people are using now"],
  helper: ["supabase", "the helper last reported to the live app"],
  members: ["members", "people are joined by email: Supabase keeps the working passwords, db2 adds anyone new"],
  intake: ["merge", "db2 has the newer business brief"],
  knowledge: ["merge", "db2 has the newer knowledge answers; answers added or changed on Supabase since the copy are kept too"],
  meta: ["merge", "db2 has the Meta connection; a connection made on Supabase after the move wins"],
  pipeline: ["merge", "db2 has the newer stages and tags, in db2's order; stages db2 removed go"],
  settings: ["merge", "db2 has the newer settings"],
};
// Parts that only make sense as a whole, so they are never mixed from both sides.
const WS_WHOLE = new Set(["meta.instagram", "meta.page", "calendar", "playbook", "crm.ghl", "outreach.day", "helper", "sheets.tallies"]);
const CONV_WHOLE = new Set(["suggestion", "summary", "proposed", "crm", "pruned"]);
// The stages the app sets by itself when messages arrive. A db2 chat still in one of these never pulls a chat back
// from a stage a person or the AI moved it to.
const AUTO_STAGES = new Set(["inbound", "outbound", "in_conversation"]);

const email = (m) => String(m.email ?? "").trim().toLowerCase();

/** Joins the team lists. Ids stay Supabase's, so sessions and assignments keep working; the map says which db2 id became which. */
function mergeMembers(b, d, s, mode, ctx) {
  const map = new Map();
  const out = [];
  const used = new Set();
  for (const m of d ?? []) {
    const sm = (s ?? []).find((x) => !used.has(x) && (x.id === m.id || (email(m) && email(x) === email(m))));
    if (!sm) { out.push(m); continue; }
    used.add(sm);
    map.set(sm.id, m.id);
    if (mode === "supabase") { out.push(m); continue; }
    // Matched by email under another id: two records for one person, so what db2's record lacks is not a removal.
    const merged = { ...merge3((b ?? []).find((x) => x.id === m.id), m, { ...sm, id: m.id }, sm.id === m.id ? ctx : { ...ctx, protect: true }, `members[${m.id}]`), id: m.id };
    // The password that works on the live app today stays, unless the owner asks for db2's.
    const hash = mode === "db2" ? sm.passwordHash ?? m.passwordHash : m.passwordHash ?? sm.passwordHash;
    if (hash) merged.passwordHash = hash;
    const last = later(m.lastLoginAt, sm.lastLoginAt);
    if (last) merged.lastLoginAt = last;
    out.push(merged);
  }
  if (mode !== "supabase") for (const m of s ?? []) if (!used.has(m)) out.push(m);
  return { out, map };
}

/** Rewrites the chat and team member ids a workspace refers to, after chats were joined. */
function repointWorkspace(ws, convMap, memberMap) {
  const c = (id) => convMap.get(id) ?? id;
  const out = { ...ws };
  if (isObj(out.knowledge)) {
    out.knowledge = {
      ...out.knowledge,
      items: (out.knowledge.items ?? []).map((i) => ({ ...i, ...(i.conversationId ? { conversationId: c(i.conversationId) } : {}), ...(i.memberId && memberMap.has(i.memberId) ? { memberId: memberMap.get(i.memberId) } : {}) })),
      gaps: (out.knowledge.gaps ?? []).map((g) => ({ ...g, conversationIds: [...new Set((g.conversationIds ?? []).map(c))] })),
    };
  }
  if (isObj(out.outreach) && Array.isArray(out.outreach.prospects)) {
    out.outreach = { ...out.outreach, prospects: out.outreach.prospects.map((p) => (p.reply?.conversationId ? { ...p, reply: { ...p.reply, conversationId: c(p.reply.conversationId) } } : p)) };
  }
  if (isObj(out.sheets) && isObj(out.sheets.leadHashes)) {
    out.sheets = { ...out.sheets, leadHashes: Object.fromEntries(Object.entries(out.sheets.leadHashes).map(([k, v]) => [c(k), v])) };
  }
  return same(out, ws) ? ws : out;
}

// ---------- conversations ----------

/** One chat from each side that are the same person. Supabase's record keeps its id. */
function mergeConv(b, d, s, sameId, ctx0) {
  const ctx = { ...ctx0, protect: !sameId, atomic: CONV_WHOLE };
  // externalId is left out on purpose: the surviving chat keeps the one the helper and the export know it by,
  // and Meta finds it through scopedUserId, which is filled in from db2.
  const SPECIAL = ["id", "externalId", "createdAt","seenAt", "labels", "firedTriggers", "notes", "stage", "avatar", "avatarAt", "avatarSaved", "lastMessageAt", "lastInboundAt"];
  const rest = (o) => (o ? Object.fromEntries(Object.entries(o).filter(([k]) => !SPECIAL.includes(k))) : undefined);
  // Only the fields handled one by one below are carried over as they are: the rest come out of the three way
  // rule, which also leaves out a field db2 removed.
  const out = { ...Object.fromEntries(Object.entries(d).filter(([k]) => SPECIAL.includes(k))), ...merge3(rest(b), rest(d), rest(s), ctx, "") };
  const changed = (f) => (ctx.hasBase ? !same(d[f], b?.[f]) : Boolean(ctx.touched));
  out.createdAt = [d.createdAt, s.createdAt].filter(Boolean).sort()[0] ?? d.createdAt;
  for (const f of ["seenAt", "lastMessageAt", "lastInboundAt"]) {
    const v = later(d[f], s[f]);
    if (v !== undefined && v !== null) out[f] = v;
  }
  out.labels = changed("labels") ? d.labels ?? [] : sameId ? s.labels ?? [] : union(d.labels, s.labels);
  if (d.firedTriggers || s.firedTriggers) out.firedTriggers = union(d.firedTriggers, s.firedTriggers);
  const dn = d.notes ?? "", sn = s.notes ?? "";
  out.notes = changed("notes") ? dn : sameId ? sn : !sn.trim() || dn.includes(sn.trim()) ? dn : !dn.trim() ? sn : `${dn.trimEnd()}\n${sn.trim()}`;
  out.stage = changed("stage") ? d.stage : sameId ? s.stage : AUTO_STAGES.has(s.stage) && !AUTO_STAGES.has(d.stage) ? d.stage : s.stage;
  for (const f of ["labels", "notes", "stage"]) if (changed(f) && !same(d[f], s[f])) ctx.kept?.push(f);
  // The reason a lead was lost belongs to the stage, so it travels with it.
  if (out.stage !== d.stage) { if (s.lossReason === undefined) delete out.lossReason; else out.lossReason = s.lossReason; }
  // The picture, when it was read and which one is saved go together, from whichever side read it last.
  const pick = d.avatar && s.avatar ? (later(d.avatarAt, s.avatarAt) === d.avatarAt ? d : s) : s.avatar ? s : d.avatar ? d : later(d.avatarAt, s.avatarAt) === d.avatarAt ? d : s;
  for (const f of ["avatar", "avatarAt", "avatarSaved"]) { if (pick[f] === undefined) delete out[f]; else out[f] = pick[f]; }
  return same(out, d) ? d : out;
}

/** A chat that only exists to be folded into another Supabase chat: it fills gaps, never overrides. */
function foldConv(a, x) {
  const out = { ...a };
  for (const [k, v] of Object.entries(x)) if (blank(out[k]) && !blank(v)) out[k] = v;
  out.labels = union(a.labels, x.labels);
  if (a.firedTriggers || x.firedTriggers) out.firedTriggers = union(a.firedTriggers, x.firedTriggers);
  if (x.notes?.trim() && !(a.notes ?? "").includes(x.notes.trim())) out.notes = a.notes?.trim() ? `${a.notes.trimEnd()}\n${x.notes.trim()}` : x.notes;
  out.createdAt = [a.createdAt, x.createdAt].filter(Boolean).sort()[0] ?? a.createdAt;
  for (const f of ["lastMessageAt", "lastInboundAt", "seenAt"]) { const v = later(a[f], x[f]); if (v !== undefined && v !== null) out[f] = v; }
  return out;
}

/** The same message seen by both sides under different ids: Supabase's copy stays and takes what db2 knows better. */
function fillMessage(d, s) {
  const out = { ...d };
  if (!out.externalId && s.externalId) out.externalId = s.externalId;
  // The helper reads messages off the page, where the time is a guess and long previews are cut short.
  if (d.partial && !s.partial) { out.text = s.text; delete out.partial; }
  if ((d.source === "extension" || d.partial) && s.source !== "extension") { out.sentAt = s.sentAt; out.source = s.source; }
  if ((s.sender === "ai" || s.sender === "auto") && d.sender === "owner") out.sender = s.sender;
  if (!out.memberId && s.memberId) out.memberId = s.memberId;
  if (!out.seenAt && s.seenAt) out.seenAt = s.seenAt;
  if (s.archived) out.archived = true;
  return same(out, d) ? d : out;
}

const group = (list, key) => {
  const m = new Map();
  for (const x of list) { const k = key(x); if (k === undefined || k === null || k === "") continue; (m.get(k) ?? m.set(k, []).get(k)).push(x); }
  return m;
};

/**
 * Works out what Supabase should hold after the merge. Pure: reads the three stores as plain data, changes none
 * of them, and returns the result with a report of every decision. Running it on its own result changes nothing.
 */
function mergeOnce(src, dst, base, opts = {}) {
  const o = { ws: {}, config: {}, join: [], separate: [], bringBack: [], names: "evidence", keepDemo: false, keepMissing: false, cutover: "2026-11-19T00:00:00.000Z", ...opts };
  const hasBase = Boolean(base);
  const R = { hasBase, ws: [], config: [], members: {}, conv: {}, msg: {}, ev: {}, lq: {}, warnings: [] };

  // ----- team first: every other record may name a team member -----
  const wsMode = (k) => o.ws[k] ?? WS_RULES[k]?.[0] ?? "merge";
  const mctx = { hasBase, keepMissing: o.keepMissing, kept: [], took: [], dropped: [], only: [], atomic: new Set() };
  const mm = mergeMembers(base?.ws.members, dst.ws.members, src.ws.members, wsMode("members"), mctx);
  const memberMap = mm.map;
  const mem = (id) => memberMap.get(id) ?? id;

  // ----- which chats are the same person -----
  const dById = new Map(dst.conversations.map((c) => [c.id, c]));
  const sById = new Map(src.conversations.map((c) => [c.id, c]));
  const dMsgs = group(dst.messages, (m) => m.conversationId);
  const sMsgs = group(src.messages, (m) => m.conversationId);
  const dEvs = group(dst.events, (e) => e.conversationId);
  const demoGone = new Set(o.keepDemo ? [] : dst.conversations.filter((c) => isDemoId(c.id) && !sById.has(c.id)).map((c) => c.id));
  const real = (c) => !isDemoId(c.id);
  const dReal = dst.conversations.filter((c) => real(c) && !demoGone.has(c.id));
  const idents = (c) => [...new Set([c.externalId, c.scopedUserId].filter(Boolean))];
  const dByIdent = group(dReal.flatMap((c) => idents(c).map((i) => ({ k: c.platform + SEP + i, c }))), (x) => x.k);
  const dByHandle = group(dReal.filter((c) => norm(c.handle)), (c) => c.platform + SEP + norm(c.handle));
  const separate = new Set(o.separate);
  // Two chats that each carry a different Instagram id are two people, whatever else they share.
  const clash = (a, b2) => Boolean(a.scopedUserId && b2.scopedUserId && a.scopedUserId !== b2.scopedUserId);

  const parent = new Map();
  const find = (x) => { while (parent.has(x) && parent.get(x) !== x) x = parent.get(x); return x; };
  const link = (a, b2) => { parent.set(find(a), find(b2)); };
  const why = new Map(); // db2 chat id -> why it was joined (the strongest reason found)
  const edge = (s, d, reason) => { link("s" + SEP + s.id, "d" + SEP + d.id); if (!why.has(s.id)) why.set(s.id, { reason, dest: d.id }); };
  for (const c of dst.conversations) parent.set("d" + SEP + c.id, "d" + SEP + c.id);
  for (const c of src.conversations) parent.set("s" + SEP + c.id, "s" + SEP + c.id);
  const dTaken = new Set();
  for (const s of src.conversations) {
    const d0 = dById.get(s.id);
    if (d0 && !demoGone.has(d0.id)) { edge(s, d0, "same chat id"); dTaken.add(d0.id); }
    if (!real(s) || separate.has(s.id)) continue;
    for (const i of idents(s)) for (const x of dByIdent.get(s.platform + SEP + i) ?? []) if (!clash(s, x.c)) { edge(s, x.c, "same Instagram id"); dTaken.add(x.c.id); }
    for (const d of dByHandle.get(s.platform + SEP + norm(s.handle)) ?? []) if (!clash(s, d)) { edge(s, d, "same handle"); dTaken.add(d.id); }
  }
  for (const j of o.join) {
    const [a, b2] = String(j).split("=");
    const s = sById.get(a), d = dById.get(b2);
    if (s && d && !demoGone.has(d.id)) { why.set(s.id, { reason: "joined by hand", dest: d.id }); edge(s, d, "joined by hand"); dTaken.add(d.id); }
    else R.warnings.push(`--join ${j}: no such pair of chats, ignored`);
  }
  // Names are the weakest link (export chats carry nothing else), so a name only joins two chats when it is the
  // only one of its kind on both sides and, by default, the two chats also share at least one message.
  const PLACEHOLDER = /^(instagram user \d{4}|unknown|)$/;
  const nameKey = (c) => c.platform + SEP + norm(c.name);
  const dNames = group(dReal, nameKey), sNames = group(src.conversations.filter(real), nameKey);
  const shared = (s, d) => {
    const pool = group(dMsgs.get(d.id) ?? [], (m) => m.direction + SEP + cleanText(m.text));
    return (sMsgs.get(s.id) ?? []).filter((m) => (pool.get(m.direction + SEP + cleanText(m.text)) ?? []).some((x) => Math.abs(ms(x.sentAt) - ms(m.sentAt)) < 90_000)).length;
  };
  const possible = [], ambiguous = [];
  for (const s of src.conversations) {
    if (!real(s) || why.has(s.id) || separate.has(s.id)) continue;
    const cands = (dNames.get(nameKey(s)) ?? []).filter((d) => !clash(s, d));
    if (!cands.length) continue;
    // "Unknown", "Instagram user 1234" and one letter names say nothing about who it is.
    if (PLACEHOLDER.test(norm(s.name)) || norm(s.name).length < 2) { ambiguous.push({ src: s.id, name: s.name, supabaseChats: cands.map((d) => d.id), db2Chats: sNames.get(nameKey(s)).length, note: "the name is a placeholder or too short to go by" }); continue; }
    if (cands.length > 1 || sNames.get(nameKey(s)).length > 1) { ambiguous.push({ src: s.id, name: s.name, supabaseChats: cands.map((d) => d.id), db2Chats: sNames.get(nameKey(s)).length }); continue; }
    const d = cands[0];
    if (dTaken.has(d.id)) { ambiguous.push({ src: s.id, name: s.name, supabaseChats: [d.id], db2Chats: 1, note: "that Supabase chat is already joined to another db2 chat" }); continue; }
    const n = o.names === "off" ? 0 : shared(s, d);
    if (o.names === "unique" || (o.names === "evidence" && n > 0)) { edge(s, d, n > 0 ? "same name and shared messages" : "same name"); dTaken.add(d.id); why.get(s.id).shared = n; }
    else possible.push({ src: s.id, supabase: d.id, name: s.name, sharedMessages: n });
  }

  // ----- build each joined chat -----
  const comps = new Map();
  for (const c of dst.conversations) { const r = find("d" + SEP + c.id); (comps.get(r) ?? comps.set(r, { d: [], s: [] }).get(r)).d.push(c); }
  for (const c of src.conversations) { const r = find("s" + SEP + c.id); (comps.get(r) ?? comps.set(r, { d: [], s: [] }).get(r)).s.push(c); }
  const convMap = new Map(); // db2 chat id -> the chat that survives
  const dMoved = new Map(); // Supabase chat folded into another -> the chat that survives
  const result = new Map(); // surviving id -> record
  const added = [];
  const joins = [];
  // Without the older copy to compare against, a Supabase chat with activity after the move is taken as changed.
  const touched = (c) => c.createdAt > o.cutover || (dMsgs.get(c.id) ?? []).some((m) => m.sentAt > o.cutover) || (dEvs.get(c.id) ?? []).some((e) => e.at > o.cutover);
  const bConv = new Map((base?.conversations ?? []).map((c) => [c.id, c]));
  const kept = [];
  const conflicts = [];
  const leftOut = new Map(); // db2 chats that stay removed, with their names for the report
  const joinGroup = (gd, gs) => {
    const srcs = gs.map((c) => (c.assignedTo && memberMap.has(c.assignedTo) ? { ...c, assignedTo: mem(c.assignedTo) } : c)).sort((a, b2) => a.id.localeCompare(b2.id));
    if (!gd.length) {
      // In the older copy and in db2 but no longer on Supabase: someone removed the chat on Supabase after the
      // move. It stays removed, with its db2 messages, unless it is asked for by id with --bring-back.
      if (hasBase && bConv.has(srcs[0].id) && !o.bringBack.includes(srcs[0].id)) { leftOut.set(srcs[0].id, srcs[0].name); return; }
      // Only in db2: it comes across as it is, under its own id.
      result.set(srcs[0].id, srcs[0]);
      convMap.set(srcs[0].id, srcs[0].id);
      added.push(srcs[0].id);
      return;
    }
    const g = { d: gd };
    const rank = (c) => [srcs.some((s) => s.id === c.id) ? 0 : 1, c.scopedUserId ? 0 : 1, -(dMsgs.get(c.id)?.length ?? 0), c.createdAt ?? "", c.id];
    const ds = [...g.d].sort((a, b2) => { const x = rank(a), y = rank(b2); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; });
    const win = ds[0];
    let acc = win;
    for (const x of ds.slice(1)) { acc = foldConv(acc, x); dMoved.set(x.id, win.id); }
    for (const s of srcs) {
      const ctx = { hasBase, touched: hasBase ? false : touched(win), kept: [], took: [] };
      acc = mergeConv(bConv.get(win.id), acc, s, s.id === win.id, ctx);
      convMap.set(s.id, win.id);
      if (ctx.kept.length) kept.push({ chat: win.id, fields: [...new Set(ctx.kept)] });
      joins.push({ db2: s.id, supabase: win.id, name: acc.name, why: why.get(s.id)?.reason ?? "joined through another chat", ...(why.get(s.id)?.shared ? { sharedMessages: why.get(s.id).shared } : {}) });
    }
    acc = same(acc, win) ? win : { ...acc, id: win.id };
    result.set(win.id, acc);
  };
  for (const g of comps.values()) {
    if (!g.s.length) continue;
    const scoped = [...new Set([...g.d, ...g.s].map((c) => c.scopedUserId).filter(Boolean))];
    if (scoped.length <= 1) { joinGroup(g.d, g.s); continue; }
    // Two different Instagram ids were linked through a shared handle or name. They are two people, so nothing
    // in this group is joined except a chat to its own earlier copy; the rest come across as separate chats.
    conflicts.push({ instagramIds: scoped, supabaseChats: g.d.map((c) => c.id), db2Chats: g.s.map((c) => c.id), names: [...new Set([...g.d, ...g.s].map((c) => c.name))] });
    for (const s of g.s) { const d0 = dById.get(s.id); joinGroup(d0 && !demoGone.has(d0.id) ? [d0] : [], [s]); }
  }
  const conversations = [...dst.conversations.filter((c) => !demoGone.has(c.id) && !dMoved.has(c.id)).map((c) => result.get(c.id) ?? c), ...added.map((id) => result.get(id))];
  const alive = new Set(conversations.map((c) => c.id));
  const dTo = (id) => dMoved.get(id) ?? id;
  const byWhy = {};
  for (const j of joins) byWhy[j.why] = (byWhy[j.why] ?? 0) + 1;
  R.conv = {
    db2: src.conversations.length, supabase: dst.conversations.length, after: conversations.length, joined: joins.length, joinedBy: byWhy,
    addedFromDb2: added.length, onlyOnSupabaseKept: conversations.length - added.length - new Set(joins.map((j) => j.supabase)).size,
    demoRemoved: demoGone.size, demoRemovedThatChangedSinceCopy: hasBase ? [...demoGone].filter((id) => !same(dById.get(id), bConv.get(id))) : [],
    supabaseChatsFoldedTogether: [...dMoved].map(([from, to]) => ({ from, into: to })), supabaseFieldsKept: kept,
    removedOnSupabaseSinceCopyNotBroughtBack: [...leftOut].map(([id, name]) => ({ id, name })),
    joins, possibleSamePersonLeftSeparate: possible, ambiguousNamesLeftSeparate: ambiguous, differentPeopleLeftSeparate: conflicts,
    inSupabaseAndOlderCopyButGoneFromDb2Kept: hasBase ? dst.conversations.filter((c) => bConv.has(c.id) && !sById.has(c.id) && !demoGone.has(c.id) && !isDemoId(c.id)).length : null,
  };

  // ----- messages -----
  const sTo = (id) => convMap.get(id) ?? id;
  const remem = (r) => (r.memberId && memberMap.has(r.memberId) ? { ...r, memberId: mem(r.memberId) } : r);
  const convOf = new Map(conversations.map((c) => [c.id, c]));
  const bMsg = new Map((base?.messages ?? []).map((m) => [m.id, m]));
  const outMsgs = [];
  const slot = new Map(); // message id -> where it sits in outMsgs
  const pools = new Map(); // surviving chat id -> its messages
  const put = (m) => { slot.set(m.id, outMsgs.length); outMsgs.push(m); (pools.get(m.conversationId) ?? pools.set(m.conversationId, []).get(m.conversationId)).push(m); };
  const swap = (old, m) => { outMsgs[slot.get(old.id)] = m; const p = pools.get(old.conversationId); p[p.indexOf(old)] = m; };
  const M = { db2: src.messages.length, supabase: dst.messages.length, removedWithDemoChats: 0, sameRecord: 0, sameRecordUpdated: 0, duplicates: {}, duplicateExamples: [], timesCorrected: 0, addedFromDb2: 0, movedToJoinedChat: 0, removedOnSupabaseSinceCopyNotBroughtBack: 0, alreadyArchivedNotBroughtBack: 0, forChatsThatNoLongerExist: 0, foldedSupabaseDuplicatesRemoved: 0 };
  const timeFixed = new Set();
  const byTime = (a, b2) => (a.sentAt < b2.sentAt ? -1 : a.sentAt > b2.sentAt ? 1 : a.id < b2.id ? -1 : 1);
  const tkey = (m) => m.direction + SEP + cleanText(m.text);
  const guessed = (m) => m.source === "extension" || Boolean(m.partial);
  // The chat list cuts long messages short with an ellipsis (web/lib/live-sync.ts uses the same test).
  const cut = (s) => (/(…|\.\.\.)$/.test(s) ? s.replace(/(…|\.\.\.)$/, "").trimEnd() : null);
  const sameOnPage = (a, b2) => {
    if (a.direction !== b2.direction) return false;
    const x = cleanText(a.text), y = cleanText(b2.text);
    if (x === y) return true;
    const cx = a.partial ? cut(x) ?? x : null, cy = b2.partial ? cut(y) ?? y : null;
    return Boolean((cx && cx.length >= 8 && y.startsWith(cx)) || (cy && cy.length >= 8 && x.startsWith(cy)));
  };

  /** Finds which incoming messages are already in the chat. Each stored message pairs with one incoming message at most. */
  const pairUp = (pool, incoming) => {
    const pairs = new Map(), used = new Set();
    const take = (m, p, how) => { pairs.set(m, { p, how }); used.add(p); };
    const byExt = new Map(pool.filter((p) => p.externalId).map((p) => [p.externalId, p]));
    for (const m of incoming) { const p = m.externalId ? byExt.get(m.externalId) : undefined; if (p && !used.has(p)) take(m, p, "same Meta message id"); }
    // The app's own rule (addMessage in web/lib/engine.ts): same direction and text, sent within 90 seconds.
    const byKey = group(pool, tkey);
    for (const m of incoming) {
      if (pairs.has(m)) continue;
      const t = ms(m.sentAt);
      // Two messages that each carry a different Meta id are two messages, however alike.
      const c = (byKey.get(tkey(m)) ?? []).filter((p) => !used.has(p) && Math.abs(ms(p.sentAt) - t) < 90_000 && !(p.externalId && m.externalId)).sort((a, b2) => Math.abs(ms(a.sentAt) - t) - Math.abs(ms(b2.sentAt) - t) || byTime(a, b2))[0];
      if (c) take(m, c, "same text within 90 seconds");
    }
    // Messages the Chrome helper read off the page carry a guessed time, so the clock cannot pair them. They are
    // lined up in order against what is left on the other side instead, the way the helper itself lines them up.
    const restIn = incoming.filter((m) => !pairs.has(m)).sort(byTime), restPool = pool.filter((p) => !used.has(p)).sort(byTime);
    const n = restIn.length, k = restPool.length;
    if (n && k && (restIn.some(guessed) || restPool.some(guessed)) && n * k <= 4_000_000) {
      const eq = (i, j) => (guessed(restIn[i]) || guessed(restPool[j])) && !(restIn[i].externalId && restPool[j].externalId) && sameOnPage(restPool[j], restIn[i]);
      const w = k + 1, t = new Uint16Array((n + 1) * w);
      for (let i = n - 1; i >= 0; i--) for (let j = k - 1; j >= 0; j--) t[i * w + j] = eq(i, j) ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
      for (let i = 0, j = 0; i < n && j < k; ) {
        if (eq(i, j) && t[i * w + j] === t[(i + 1) * w + j + 1] + 1) { take(restIn[i], restPool[j], "same message read by the helper, lined up in order"); i++; j++; }
        else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++;
        else j++;
      }
    }
    return pairs;
  };
  const noteDupe = (how, kept2, gone) => {
    M.duplicates[how] = (M.duplicates[how] ?? 0) + 1;
    if (M.duplicateExamples.length < 40) M.duplicateExamples.push({ how, chat: kept2.conversationId, kept: kept2.id, notAdded: gone.id, text: cleanText(kept2.text).slice(0, 60) });
  };
  const absorb = (p, m, how) => {
    const f = fillMessage(p, m);
    if (f !== p) { if (f.sentAt !== p.sentAt) { M.timesCorrected++; timeFixed.add(p.conversationId); } swap(p, f); }
    noteDupe(how, f, m);
  };

  const movedIn = [];
  for (const m of dst.messages) {
    if (demoGone.has(m.conversationId)) { M.removedWithDemoChats++; continue; }
    if (dMoved.has(m.conversationId)) movedIn.push({ ...m, conversationId: dTo(m.conversationId) });
    else put(m);
  }
  // Two Supabase chats that turned out to be one person: the second chat's messages move over, less any both hold.
  for (const [cid, list] of group(movedIn, (m) => m.conversationId)) {
    const pairs = pairUp(pools.get(cid) ?? [], list);
    for (const m of list) {
      const hit = pairs.get(m);
      if (hit) { absorb(outMsgs[slot.get(hit.p.id)], m, hit.how); M.foldedSupabaseDuplicatesRemoved++; }
      else { put(m); M.movedToJoinedChat++; }
    }
  }
  const incoming = [];
  for (const s0 of src.messages) {
    const s = remem(s0);
    const d = slot.has(s.id) ? outMsgs[slot.get(s.id)] : undefined;
    if (!d && leftOut.has(s.conversationId)) { M.removedOnSupabaseSinceCopyNotBroughtBack++; continue; }
    if (!d) { incoming.push({ ...s, conversationId: sTo(s.conversationId) }); continue; }
    // The same record on both sides. It stays in whichever chat Supabase has it in.
    M.sameRecord++;
    const merged = merge3(bMsg.get(s.id), d, { ...s, conversationId: d.conversationId }, { hasBase, touched: false, atomic: new Set() });
    if (!same(merged, d)) { swap(d, merged); M.sameRecordUpdated++; }
  }
  for (const [cid, list] of group(incoming, (m) => m.conversationId)) {
    const conv = convOf.get(cid);
    const pairs = pairUp([...(pools.get(cid) ?? [])], list);
    for (const m of list) {
      const hit = pairs.get(m);
      if (hit) { absorb(outMsgs[slot.get(hit.p.id)], m, hit.how); continue; }
      // In the older copy but no longer on Supabase: it was removed there on purpose, so it stays removed.
      if (hasBase && bMsg.has(m.id)) { M.removedOnSupabaseSinceCopyNotBroughtBack++; continue; }
      // Already moved to the Google Sheets archive on Supabase: the app itself would not take it back.
      if (conv?.prunedUntil && m.sentAt <= conv.prunedUntil) { M.alreadyArchivedNotBroughtBack++; continue; }
      if (!conv) M.forChatsThatNoLongerExist++;
      put(m);
      M.addedFromDb2++;
    }
  }
  // Where a guessed time was replaced by the real one, the chat's own "last message" times are put right too.
  for (const cid of timeFixed) {
    const c = convOf.get(cid), list = pools.get(cid) ?? [];
    if (!c || !list.length) continue;
    const last = list.reduce((a, m) => (m.sentAt > a ? m.sentAt : a), ""), lastIn = list.filter((m) => m.direction === "in").reduce((a, m) => (m.sentAt > a ? m.sentAt : a), "");
    const fixed = { ...c, lastMessageAt: last, ...(lastIn ? { lastInboundAt: lastIn } : {}) };
    if (!same(fixed, c)) { conversations[conversations.indexOf(c)] = fixed; convOf.set(cid, fixed); }
  }
  M.after = outMsgs.length;
  R.msg = M;

  // ----- events -----
  const bEv = new Map((base?.events ?? []).map((e) => [e.id, e]));
  const outEvs = [], evSlot = new Map(), evPools = new Map();
  const putEv = (e) => { evSlot.set(e.id, outEvs.length); outEvs.push(e); (evPools.get(e.conversationId) ?? evPools.set(e.conversationId, []).get(e.conversationId)).push(e); };
  const E = { db2: src.events.length, supabase: dst.events.length, removedWithDemoChats: 0, sameRecord: 0, sameRecordUpdated: 0, duplicatesNotAdded: 0, addedFromDb2: 0, removedOnSupabaseSinceCopyNotBroughtBack: 0, forChatsThatNoLongerExist: 0 };
  for (const e of dst.events) {
    if (demoGone.has(e.conversationId)) { E.removedWithDemoChats++; continue; }
    putEv(dMoved.has(e.conversationId) ? { ...e, conversationId: dTo(e.conversationId) } : e);
  }
  const evUsed = new Set();
  const evKey = (e) => [e.type, e.stage ?? "", e.detail ?? "", e.by].join(SEP);
  for (const s0 of [...src.events].sort((a, b2) => (a.at < b2.at ? -1 : a.at > b2.at ? 1 : a.id < b2.id ? -1 : 1))) {
    const s = remem(s0);
    const at = evSlot.get(s.id);
    if (at !== undefined) {
      E.sameRecord++;
      const d = outEvs[at];
      const merged = merge3(bEv.get(s.id), d, { ...s, conversationId: d.conversationId }, { hasBase, touched: false, atomic: new Set(["capi"]) });
      if (!same(merged, d)) { outEvs[at] = merged; const p = evPools.get(d.conversationId); p[p.indexOf(d)] = merged; E.sameRecordUpdated++; }
      evUsed.add(s.id);
      continue;
    }
    if ((hasBase && bEv.has(s.id)) || leftOut.has(s.conversationId)) { E.removedOnSupabaseSinceCopyNotBroughtBack++; continue; }
    const cid = sTo(s.conversationId);
    // The same step recorded by both sides under different ids. A chat starts once, and the app moves a chat to a
    // stage by itself once, whenever each side happened to see it; anything else must be within 90 seconds.
    const once = s.type === "conversation_started" || (s.type === "stage_changed" && s.by === "system");
    const twin = (evPools.get(cid) ?? []).find((d) => !evUsed.has(d.id) && evKey(d) === evKey(s) && (once || Math.abs(ms(d.at) - ms(s.at)) < 90_000));
    if (twin) {
      evUsed.add(twin.id);
      E.duplicatesNotAdded++;
      // The earlier of the two times is the true one for a chat's start.
      if (s.type === "conversation_started" && s.at < twin.at) { const fixed = { ...twin, at: s.at }; outEvs[evSlot.get(twin.id)] = fixed; const p = evPools.get(cid); p[p.indexOf(twin)] = fixed; }
      continue;
    }
    if (!alive.has(cid)) E.forChatsThatNoLongerExist++;
    putEv({ ...s, conversationId: cid });
    evUsed.add(s.id);
    E.addedFromDb2++;
  }
  E.after = outEvs.length;
  R.ev = E;

  // ----- label jobs waiting for the helper -----
  const bLq = new Map((base?.labelQueue ?? []).map((q) => [q.id, q]));
  const L = { db2: src.labelQueue.length, supabase: dst.labelQueue.length, removedWithDemoChats: 0, addedFromDb2: 0, olderWaitingJobsDropped: 0 };
  let outLq = [];
  for (const q of dst.labelQueue) {
    if (demoGone.has(q.conversationId)) { L.removedWithDemoChats++; continue; }
    outLq.push(dMoved.has(q.conversationId) ? { ...q, conversationId: dTo(q.conversationId) } : q);
  }
  for (const s of src.labelQueue) {
    const i = outLq.findIndex((q) => q.id === s.id);
    if (i >= 0) { outLq[i] = merge3(bLq.get(s.id), outLq[i], { ...s, conversationId: outLq[i].conversationId }, { hasBase, touched: false, atomic: new Set(["labels"]) }); continue; }
    if ((hasBase && bLq.has(s.id)) || leftOut.has(s.conversationId)) continue;
    const q = { ...s, conversationId: sTo(s.conversationId) };
    // The app keeps one waiting job per chat, the newest (queueLabelSync in web/lib/engine.ts).
    if (q.status === "pending") {
      if (outLq.some((x) => x.conversationId === q.conversationId && x.status === "pending" && x.createdAt >= q.createdAt)) { L.olderWaitingJobsDropped++; continue; }
      const before = outLq.length;
      outLq = outLq.filter((x) => !(x.conversationId === q.conversationId && x.status === "pending"));
      L.olderWaitingJobsDropped += before - outLq.length;
    }
    outLq.push(q);
    L.addedFromDb2++;
  }
  if (outLq.length > 500) outLq = [...outLq].sort((a, b2) => (a.createdAt < b2.createdAt ? -1 : a.createdAt > b2.createdAt ? 1 : a.id < b2.id ? -1 : 1)).slice(-500);
  L.after = outLq.length;
  R.lq = L;

  // ----- workspace keys -----
  const MODES = ["db2", "supabase", "merge", "members"];
  const idMap = new Map([...dMoved, ...[...convMap].filter(([a, b2]) => a !== b2)]);
  const wsOut = {};
  const outcome = (v, d, s) => (same(v, d) && same(v, s) ? "the same on both sides" : same(v, d) ? (s === undefined ? "only on Supabase, kept" : "Supabase's kept") : same(v, s) ? (d === undefined ? "only in db2, brought across" : "db2's taken") : "mixed: db2's, except the parts listed below");
  const few = (list) => { const u = [...new Set(list)]; return u.length > 25 ? [...u.slice(0, 25), `and ${u.length - 25} more`] : u; };
  for (const k of [...new Set([...Object.keys(dst.ws), ...Object.keys(src.ws)])].sort()) {
    let mode = wsMode(k);
    if (!MODES.includes(mode) || (mode === "members" && k !== "members")) { R.warnings.push(`--ws ${k}=${mode}: not one of db2, supabase, merge. The usual rule was used.`); mode = WS_RULES[k]?.[0] ?? "merge"; }
    const d = dst.ws[k], s = src.ws[k], b = base?.ws[k];
    let ctx = { hasBase, keepMissing: o.keepMissing, touched: false, kept: [], took: [], dropped: [], only: [], atomic: WS_WHOLE };
    let v, note;
    if (k === "members" && Array.isArray(d)) {
      ctx = mctx;
      v = mm.out;
      // The sample team that comes with the demo chats goes when the demo chats go.
      if (!o.keepDemo && mode !== "supabase") {
        const inSrc = (m) => (s ?? []).some((x) => x.id === m.id || (email(m) && email(x) === email(m)));
        const gone = v.filter((m) => m.demo && !inSrc(m));
        if (gone.length) { v = v.filter((m) => !gone.includes(m)); note = `sample team members removed: ${gone.map((m) => m.name || m.id).join(", ")}`; }
      }
      if (same(v, d)) v = d;
      R.members = { supabase: d.length, db2: (s ?? []).length, after: v.length, matched: [...memberMap].map(([from, to]) => ({ db2: from, supabase: to })), passwords: mode === "db2" ? "db2's" : "Supabase's (the ones that work on the live app today)" };
    } else if (mode === "supabase") v = d;
    else if (mode === "db2") v = s !== undefined ? s : d;
    // A whole key db2 does not have is kept: a missing key far more likely means "never set there" than "removed".
    else v = s === undefined ? d : merge3(b, d, s, ctx, k);
    if (v !== undefined) wsOut[k] = v;
    R.ws.push({
      key: k, rule: mode === "members" ? "merge" : mode, setBy: o.ws[k] ? "you" : WS_RULES[k] ? "built in rule" : "default", why: WS_RULES[k]?.[1] ?? "db2 was live for the month in between; anything changed on Supabase since the copy is kept",
      result: v === undefined ? "absent" : outcome(v, d, s), size: { supabase: size(d), db2: size(s), after: size(v) },
      ...(ctx.kept.length ? { keptFromSupabase: few(ctx.kept) } : {}), ...(ctx.took.length ? { takenFromDb2: few(ctx.took) } : {}),
      // Removed because db2 removed it during the month (Supabase still had it exactly as copied).
      ...(ctx.dropped.length ? { removedAsInDb2: few(ctx.dropped) } : {}),
      // On Supabase only, and with no older copy (or --keep-missing) nothing says whether db2 removed it: kept.
      ...(ctx.only.length ? { keptAlthoughDb2DoesNotHaveIt: few(ctx.only) } : {}), ...(note ? { note } : {}),
    });
  }
  const ws = repointWorkspace(wsOut, idMap, memberMap);

  // ----- saved setup keys (the config row) -----
  const cfgOut = {};
  for (const k of [...new Set([...Object.keys(dst.config ?? {}), ...Object.keys(src.config ?? {})])].sort()) {
    let mode = o.config[k] ?? "merge";
    if (!["db2", "supabase", "merge"].includes(mode)) { R.warnings.push(`--config ${k}=${mode}: not one of db2, supabase, merge. merge was used.`); mode = "merge"; }
    const d = dst.config?.[k], s = src.config?.[k], b = base?.config?.[k];
    const v = mode === "supabase" || s === undefined ? d : mode === "db2" ? s : merge3(b, d, s, { hasBase, keepMissing: o.keepMissing, touched: false, atomic: new Set() }, k);
    if (v !== undefined) cfgOut[k] = v;
    // Values are never shown: some of these are keys.
    R.config.push({ key: k, rule: mode, setBy: o.config[k] ? "you" : "default", result: v === undefined ? "absent" : outcome(v, d, s) });
  }
  if (!hasBase) R.warnings.push("The older Neon copy could not be read, so the tool cannot see what changed on Supabase since the move. Where the two sides differ db2 wins, except chats with activity after the cutover time. Nothing is removed just because db2 lacks it: stages, tags, triggers, answers and settings that only Supabase has are kept and listed per key, and lists keep Supabase's order. Use --ws key=db2 to take db2's value whole, or --ws key=supabase for any key you changed on Supabase.");

  const store = { ws, config: cfgOut, hasConfig: Boolean(dst.hasConfig || Object.keys(cfgOut).length), conversations, messages: outMsgs, events: outEvs, labelQueue: outLq };
  return { store, report: R, convMap, dMoved, demoGone };
}

/** Every record of a store by its row key, the way the app lays them out in the table (rowsOf in web/lib/hosted.ts). */
export function toRows(store) {
  const m = new Map();
  for (const [k, v] of Object.entries(store.ws)) if (v !== undefined) m.set("ws" + SEP + k, v);
  for (const c of LISTS) for (const r of store[c]) m.set(c + SEP + r.id, r);
  if (store.hasConfig) m.set("config" + SEP + "keys", store.config);
  return m;
}

/** Builds a store from table rows. Rows the tool does not know are left out and never touched. */
export function fromRows(rows) {
  const store = { ws: {}, config: {}, hasConfig: false, conversations: [], messages: [], events: [], labelQueue: [] };
  for (const r of rows) {
    const v = JSON.parse(r.data);
    if (r.coll === "ws") store.ws[r.id] = v;
    else if (r.coll === "config" && r.id === "keys") { store.config = v; store.hasConfig = true; }
    else if (LISTS.includes(r.coll)) store[r.coll].push(v);
  }
  return store;
}

/** The rows to write and to remove so that the table holds `to`. Records that only differ in key order are left alone. */
export function planRows(from, to) {
  const a = toRows(from), b = toRows(to);
  const ups = [], dels = [];
  for (const [k, v] of b) { const old = a.get(k); if (old === undefined || (old !== v && !same(old, v))) ups.push([...k.split(SEP), JSON.stringify(v)]); }
  for (const k of a.keys()) if (!b.has(k)) dels.push(k.split(SEP));
  return { ups, dels };
}

/**
 * The whole merge. Joining chats can bring two more together (a chat that gains a handle from db2 may then match
 * another), so the merge is run on its own result until nothing changes. That is what makes a second run of the
 * tool a no-op: what it writes is already settled.
 */
export function mergeStores(src, dst, base, opts = {}) {
  const first = mergeOnce(src, dst, base, opts);
  const moved = new Map(first.dMoved);
  let cur = first, passes = 1, settled = false;
  const laterPasses = [];
  while (passes < 8) {
    const next = mergeOnce(src, cur.store, base, opts);
    const p = planRows(cur.store, next.store);
    if (!p.ups.length && !p.dels.length) { settled = true; cur = { ...next, store: cur.store }; break; }
    passes++;
    laterPasses.push({ pass: passes, rowsChanged: p.ups.length, rowsRemoved: p.dels.length, chatsFolded: [...next.dMoved].map(([from, into]) => ({ from, into })) });
    for (const [from, to] of next.dMoved) moved.set(from, to);
    cur = next;
  }
  const end = (id) => { for (let i = 0; i < 10 && moved.has(id); i++) id = moved.get(id); return id; };
  const report = first.report;
  report.settling = { passes, settled, later: laterPasses };
  if (passes > 1) report.warnings.push(`Joining chats brought more chats together: it took ${passes} passes to settle. The later passes are listed under settling.`);
  if (!settled) report.warnings.push("The merge did not settle after 8 passes. Nothing will be written. Please report this.");
  // A chat joined in the first pass may have been folded again later: the report names the chat that survives in the end.
  for (const j of report.conv.joins) j.supabase = cur.convMap.get(j.db2) ?? end(j.supabase);
  report.conv.after = cur.store.conversations.length;
  report.msg.after = cur.store.messages.length;
  report.ev.after = cur.store.events.length;
  report.lq.after = cur.store.labelQueue.length;
  return { store: cur.store, report, settled, convMap: cur.convMap, movedOnSupabase: new Map([...moved.keys()].map((k) => [k, end(k)])), demoGone: first.demoGone };
}

// ---------- saved profile pictures ----------

/**
 * Decides what happens to each saved picture. Pictures are kept per chat id in their own table, outside the
 * versioned store. Only addresses are compared here, so a dry run never downloads a picture.
 * srcList and dstList are rows of { id, url, at, n } (n = size of the stored picture text).
 */
export function planAvatars(srcList, dstList, merged) {
  const convs = new Map(merged.store.conversations.map((c) => [c.id, c]));
  const have = new Map(dstList.map((r) => [r.id, r]));
  const plan = { copy: [], move: [], remove: [], sameAlready: 0, supabaseKept: 0, noChat: 0, bytesToCopy: 0 };
  for (const r of dstList) {
    if (merged.demoGone.has(r.id)) { plan.remove.push(r.id); have.delete(r.id); continue; }
    const to = merged.movedOnSupabase.get(r.id);
    if (!to) continue;
    have.delete(r.id);
    // The chat was folded into another: its picture follows, unless the surviving chat has its own.
    if (have.has(to) || !convs.has(to)) plan.remove.push(r.id);
    else { plan.move.push({ from: r.id, to }); have.set(to, { ...r, id: to }); }
  }
  const at = (r) => new Date(r.at ?? 0).getTime() || 0;
  for (const [to, list] of group(srcList.map((r) => ({ ...r, to: merged.convMap.get(r.id) ?? r.id })), (r) => r.to)) {
    const conv = convs.get(to);
    if (!conv) { plan.noChat += list.length; continue; }
    // Several db2 chats joined into one: the picture the chat record names as saved wins, then the newest.
    const best = [...list].sort((a, b2) => Number(b2.url === conv.avatarSaved) - Number(a.url === conv.avatarSaved) || at(b2) - at(a) || (a.id < b2.id ? -1 : 1))[0];
    const cur = have.get(to);
    if (cur && cur.url === best.url) { plan.sameAlready++; continue; }
    // Supabase already has a picture for this chat: db2's replaces it only when the chat record says db2's is the saved one.
    if (cur && conv.avatarSaved !== best.url) { plan.supabaseKept++; continue; }
    plan.copy.push({ from: best.id, to, url: best.url, bytes: Number(best.n) || 0, replaces: Boolean(cur) });
    plan.bytesToCopy += Number(best.n) || 0;
  }
  return plan;
}

// ---------- reading and writing the databases ----------

const cleanName = (s) => String(s).replace(/[^a-z0-9_]/gi, "");
const isNeon = (url) => /\.neon\.tech/i.test(url);
/** Takes any address out of an error text, so a password can never end up on screen or in a file. */
const scrub = (s) => String(s ?? "").replace(/postgres(ql)?:\/\/\S+/gi, "<address hidden>").slice(0, 400);

/** One way to ask either kind of database. Neon is read over its web driver, as the app does; anything else over a single connection. */
function open(url) {
  if (isNeon(url)) { const n = neon(url); return { neon: true, q: (t, p = []) => n.query(t, p), end: async () => {} }; }
  const u = new URL(url);
  // The address carries options this driver does not know, so they are dropped and encryption is switched on here (as in web/lib/pg.ts).
  u.search = "";
  const pool = new pg.Pool({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 15_000, allowExitOnIdle: true });
  pool.on("error", () => {});
  return { neon: false, pool, q: async (t, p = []) => (await pool.query(t, p)).rows, end: () => pool.end() };
}

/** Why a database refuses to answer, when the reason is that its free allowance ran out. null for any other error. */
export function lockedReason(e) {
  const t = [e?.message, e?.sourceError?.message, e?.cause?.message].filter(Boolean).join(" ");
  if (!/\b402\b/.test(t) && !(/quota/i.test(t) && /exceed/i.test(t))) return null;
  // Neon wraps its reason in a block of empty fields: only the sentence is worth showing.
  return scrub(t.match(/"message":"([^"]+)"/)?.[1] ?? t);
}

/** Every row of a store table, a page at a time so no single answer is too large for Neon's web driver. */
async function readRows(q, t) {
  const rows = [];
  for (let after = -1; ; ) {
    const part = await q(`select coll, id, data, ver, ord from ${t} where ord > $1 order by ord limit 3000`, [after]);
    rows.push(...part);
    if (part.length < 3000) return rows;
    after = part[part.length - 1].ord;
  }
}
const versionOf = async (q, t) => Number((await q(`select v from ${t}_meta where k = 'version'`))[0]?.v ?? 0);
const hasTable = async (q, t) => Boolean((await q(`select to_regclass($1) as t`, [t]))[0]?.t);
const avatarRows = async (q, t) => ((await hasTable(q, `${t}_avatars`)) ? await q(`select id, url, at, length(data) as n from ${t}_avatars order by id`) : []);

/**
 * Writes a plan the way the app writes (pushOnce in web/lib/hosted.ts): the version goes up by one, every row
 * written carries the new version, and every row removed leaves a marker. Running copies of the app see the new
 * version on their next request and read just these rows. Must be called inside an open transaction.
 */
async function writePlan(c, t, plan) {
  const v = Number((await c.query(`update ${t}_meta set v = v + 1 where k = 'version' returning v`)).rows[0].v);
  for (let i = 0; i < plan.ups.length; i += 400) {
    const part = plan.ups.slice(i, i + 400);
    await c.query(
      `insert into ${t} (coll, id, data, ver) select a, b, c, $4::bigint from unnest($1::text[], $2::text[], $3::text[]) as x(a, b, c) on conflict (coll, id) do update set data = excluded.data, ver = excluded.ver`,
      [part.map((x) => x[0]), part.map((x) => x[1]), part.map((x) => x[2]), v],
    );
  }
  for (let i = 0; i < plan.dels.length; i += 2000) {
    const part = plan.dels.slice(i, i + 2000);
    const a = [part.map((x) => x[0]), part.map((x) => x[1])];
    await c.query(`delete from ${t} where (coll, id) in (select * from unnest($1::text[], $2::text[]))`, a);
    await c.query(`insert into ${t}_del (coll, id, ver) select a, b, $3::bigint from unnest($1::text[], $2::text[]) as x(a, b)`, [...a, v]);
  }
  if (plan.dels.length) await c.query(`delete from ${t}_del where ver < $1::bigint - ${KEEP_DELETIONS}`, [v]);
  return v;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const snapshotDir = (env) => env.MERGE_SNAPSHOT_DIR || path.join(here, "..", "..", ".data", "merge-snapshots");

/** Saves what is about to change to a file only this user can read. It holds keys and logins, so it stays on this machine. */
function writeSnapshot(env, snap) {
  const dir = snapshotDir(env);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${snap.table}-before-${snap.reason}-${snap.takenAt.replace(/[-:.]/g, "")}-v${snap.version}.json.gz`);
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(snap)), { mode: 0o600 });
  return file;
}

/** Carries out the picture plan. Runs after the store is saved; it can be run again safely if it is cut short. */
async function applyAvatars(dest, destT, src, srcT, plan) {
  const t = `${destT}_avatars`;
  await dest.q(`create table if not exists ${t} (id text primary key, url text not null, type text not null, data text not null, at timestamptz not null default now())`);
  await dest.q(`alter table ${t} enable row level security`);
  for (const m of plan.move) await dest.q(`update ${t} set id = $2 where id = $1 and not exists (select 1 from ${t} where id = $2)`, [m.from, m.to]);
  const gone = [...plan.remove, ...plan.move.map((m) => m.from)];
  if (gone.length) await dest.q(`delete from ${t} where id = any($1::text[])`, [gone]);
  let batch = [], bytes = 0, done = 0;
  const flush = async () => {
    if (!batch.length) return;
    const by = new Map((await src.q(`select id, url, type, data, at from ${srcT}_avatars where id = any($1::text[])`, [batch.map((x) => x.from)])).map((r) => [r.id, r]));
    const got = batch.filter((x) => by.has(x.from)).map((x) => ({ ...by.get(x.from), id: x.to }));
    if (got.length) {
      await dest.q(
        `insert into ${t} (id, url, type, data, at) select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[]) on conflict (id) do update set url = excluded.url, type = excluded.type, data = excluded.data, at = excluded.at`,
        [got.map((r) => r.id), got.map((r) => r.url), got.map((r) => r.type), got.map((r) => r.data), got.map((r) => new Date(r.at).toISOString())],
      );
    }
    done += got.length;
    batch = [];
    bytes = 0;
  };
  // Small batches: a picture can be 400 KB of text and Neon's web driver caps the size of one answer.
  for (const x of plan.copy) {
    if (batch.length >= 40 || bytes + x.bytes > 3_000_000) await flush();
    batch.push(x);
    bytes += x.bytes;
  }
  await flush();
  return done;
}

// ---------- the command ----------

export function parseArgs(argv) {
  const a = { ws: {}, config: {}, join: [], separate: [], bringBack: [], names: "evidence", keepDemo: false, keepMissing: false, apply: false, base: true, avatars: true, all: false };
  const val = (i, f) => { if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) throw new Error(`${f} needs a value.`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === "--apply") a.apply = true;
    else if (f === "--keep-demo") a.keepDemo = true;
    else if (f === "--keep-missing") a.keepMissing = true;
    else if (f === "--no-base") a.base = false;
    else if (f === "--no-avatars") a.avatars = false;
    else if (f === "--all") a.all = true;
    else if (f === "--help" || f === "-h") a.help = true;
    else if (f === "--env" || f === "--env-file") a.env = val(i++, f);
    else if (f === "--restore") a.restore = val(i++, f);
    else if (f === "--json") a.json = val(i++, f);
    else if (f === "--join") a.join.push(val(i++, f));
    else if (f === "--separate") a.separate.push(val(i++, f));
    else if (f === "--bring-back") a.bringBack.push(val(i++, f));
    else if (f === "--cutover") { const d = new Date(val(i++, f)); if (Number.isNaN(d.getTime())) throw new Error("--cutover needs a time such as 2026-11-19T00:00:00Z."); a.cutover = d.toISOString(); }
    else if (f === "--names") { a.names = val(i++, f); if (!["evidence", "unique", "off"].includes(a.names)) throw new Error("--names takes evidence, unique or off."); }
    else if (f === "--ws" || f === "--config") {
      const v = val(i++, f), at = v.indexOf("=");
      if (at < 1) throw new Error(`${f} takes key=db2, key=supabase or key=merge.`);
      const side = v.slice(at + 1);
      if (!["db2", "supabase", "merge"].includes(side)) throw new Error(`${f} ${v}: the side must be db2, supabase or merge.`);
      a[f.slice(2)][v.slice(0, at)] = side;
    } else throw new Error(`Unknown option ${f}. Run with --help to see them all.`);
  }
  return a;
}

function loadEnv(file) {
  const env = { ...process.env };
  if (file) {
    for (const l of fs.readFileSync(file, "utf8").split("\n")) {
      const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  }
  return env;
}

const say = (...x) => console.log(...x);
const tally = (list) => { const t = {}; for (const [c] of list) t[c] = (t[c] ?? 0) + 1; return t; };
const kb = (n) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(n ? 1 : 0, Math.round(n / 1024))} KB`);

/** The report, in plain words. Every decision is here; long lists are cut unless --all is given, and --json has all of them. */
function printReport(x) {
  const { a, w, info } = x;
  const R = w.merged.report;
  const cap = a.all ? Infinity : 15;
  const list = (title, items, fmt) => {
    if (!items?.length) return;
    say(`\n  ${title} (${items.length})`);
    for (const it of items.slice(0, cap)) say(`    ${fmt(it)}`);
    if (items.length > cap) say(`    ... and ${items.length - cap} more. Add --all to print them, or --json <file> to save them.`);
  };
  const counts = (o2) => Object.entries(o2).filter(([, v]) => typeof v === "number" && v).map(([k, v]) => `${k} ${v}`).join(", ") || "none";

  say("\nWHERE THE DATA COMES FROM");
  say(`  db2 (read only)       table ${info.srcT}, version ${info.srcV}: ${R.conv.db2} chats, ${R.msg.db2} messages, ${R.ev.db2} events, ${info.srcPics} saved pictures`);
  say(`  Supabase (written)    table ${info.destT}, version ${info.destV}: ${R.conv.supabase} chats, ${R.msg.supabase} messages, ${R.ev.supabase} events, ${info.dstPics} saved pictures`);
  say(`  older Neon copy       ${info.baseNote}`);

  say("\nWORKSPACE KEYS: WHICH SIDE WINS");
  say("  Change any line with --ws <key>=db2, --ws <key>=supabase or --ws <key>=merge.");
  say("  merge = db2's value, order and removals, except the parts changed on Supabase since the copy, which are kept.");
  say("  A stage, tag, trigger, answer or setting db2 removed is removed here too. --keep-missing keeps them all.\n");
  const pad = (s, n) => String(s).padEnd(n);
  say(`  ${pad("key", 20)}${pad("rule", 10)}${pad("set by", 15)}result`);
  for (const k of R.ws) {
    say(`  ${pad(k.key, 20)}${pad(k.rule, 10)}${pad(k.setBy, 15)}${k.result}  [${kb(k.size.supabase)} on Supabase, ${kb(k.size.db2)} in db2]`);
    say(`  ${pad("", 20)}why: ${k.why}`);
    if (k.keptFromSupabase) say(`  ${pad("", 20)}kept from Supabase: ${k.keptFromSupabase.join(", ")}`);
    if (k.takenFromDb2) say(`  ${pad("", 20)}taken from db2: ${k.takenFromDb2.join(", ")}`);
    if (k.removedAsInDb2) say(`  ${pad("", 20)}removed because db2 removed it: ${k.removedAsInDb2.join(", ")}`);
    if (k.keptAlthoughDb2DoesNotHaveIt) say(`  ${pad("", 20)}kept although db2 does not have it: ${k.keptAlthoughDb2DoesNotHaveIt.join(", ")}  (take db2's whole with --ws ${k.key}=db2)`);
    if (k.note) say(`  ${pad("", 20)}${k.note}`);
  }
  if (R.members.after !== undefined) say(`\n  Team: ${R.members.supabase} on Supabase, ${R.members.db2} in db2, ${R.members.after} after. Passwords kept: ${R.members.passwords}. Use --ws members=db2 for db2's passwords.`);
  say("\nSAVED SETUP KEYS (values are never shown). Change one with --config <KEY>=db2|supabase|merge.");
  if (!R.config.length) say("  none on either side");
  for (const k of R.config) say(`  ${pad(k.key, 34)}${pad(k.rule, 10)}${k.result}`);

  const C = R.conv;
  say("\nCHATS");
  say(`  ${C.supabase} on Supabase + ${C.db2} in db2 -> ${C.after} after the merge`);
  say(`  joined to a chat already on Supabase: ${C.joined}   (${Object.entries(C.joinedBy).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"})`);
  say(`  brought across as new chats: ${C.addedFromDb2}`);
  say(`  only on Supabase, kept as they are: ${C.onlyOnSupabaseKept}`);
  say(`  demo chats removed (db2 does not have them): ${C.demoRemoved}${a.keepDemo ? "   (--keep-demo is on)" : "   (keep them with --keep-demo)"}`);
  if (C.inSupabaseAndOlderCopyButGoneFromDb2Kept) say(`  in the older copy and on Supabase but no longer in db2 (removed there): ${C.inSupabaseAndOlderCopyButGoneFromDb2Kept}, all kept`);
  const strong = new Set(["same chat id"]);
  list("Joined chats that had different ids (db2 chat -> Supabase chat that survives)", C.joins.filter((j) => !strong.has(j.why)), (j) => `${j.db2} -> ${j.supabase}  ${j.name}  [${j.why}${j.sharedMessages ? `, ${j.sharedMessages} shared messages` : ""}]`);
  list("Supabase chats folded together because one db2 chat matched both", C.supabaseChatsFoldedTogether, (j) => `${j.from} -> ${j.into}`);
  list("Same name on both sides but no shared message: left as two chats. Join one with --join <db2 id>=<supabase id>, or all with --names unique", C.possibleSamePersonLeftSeparate, (j) => `${j.src} and ${j.supabase}  ${j.name}`);
  list("Name used by more than one chat: left separate. Join by hand with --join", C.ambiguousNamesLeftSeparate, (j) => `${j.src}  ${j.name}  (Supabase: ${j.supabaseChats.join(", ")})${j.note ? "  " + j.note : ""}`);
  list("Linked by handle or name but with different Instagram ids: different people, left separate", C.differentPeopleLeftSeparate, (j) => `${j.names.join(" / ")}  db2: ${j.db2Chats.join(", ")}  Supabase: ${j.supabaseChats.join(", ")}`);
  list("Chats removed on Supabase after the move: they stay removed. Bring one back with --bring-back <id>", C.removedOnSupabaseSinceCopyNotBroughtBack, (j) => `${j.id}  ${j.name}`);
  list("Chat details kept from Supabase because they changed there since the copy", C.supabaseFieldsKept, (j) => `${j.chat}: ${j.fields.join(", ")}`);
  list("Demo chats being removed that were changed on Supabase since the copy", C.demoRemovedThatChangedSinceCopy, (id) => id);

  const M = R.msg;
  say("\nMESSAGES");
  say(`  ${M.supabase} on Supabase + ${M.db2} in db2 -> ${M.after} after the merge`);
  say(`  added from db2: ${M.addedFromDb2}`);
  say(`  the same record on both sides: ${M.sameRecord} (${M.sameRecordUpdated} updated from db2)`);
  say(`  duplicates not added: ${Object.values(M.duplicates).reduce((s, n) => s + n, 0)}   (${Object.entries(M.duplicates).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"})`);
  say(`  guessed times replaced by the real time: ${M.timesCorrected}`);
  say(`  removed with the demo chats: ${M.removedWithDemoChats}`);
  say(`  not brought back: ${M.removedOnSupabaseSinceCopyNotBroughtBack} removed on Supabase since the copy, ${M.alreadyArchivedNotBroughtBack} already in the Sheets archive`);
  if (M.forChatsThatNoLongerExist) say(`  added although their chat is not in either store: ${M.forChatsThatNoLongerExist}`);
  list("Examples of duplicates found", M.duplicateExamples, (d) => `${d.chat}: "${d.text}"  [${d.how}]`);

  say("\nEVENTS");
  say(`  ${R.ev.supabase} on Supabase + ${R.ev.db2} in db2 -> ${R.ev.after} after.  ${counts({ ...R.ev, db2: 0, supabase: 0, after: 0 })}`);
  say("\nLABEL JOBS WAITING FOR THE HELPER");
  say(`  ${R.lq.supabase} on Supabase + ${R.lq.db2} in db2 -> ${R.lq.after} after.  ${counts({ ...R.lq, db2: 0, supabase: 0, after: 0 })}`);

  say("\nSAVED PROFILE PICTURES");
  if (!w.pics) say("  left alone (--no-avatars)");
  else say(`  to copy from db2: ${w.pics.copy.length} (${kb(w.pics.bytesToCopy)}, ${w.pics.copy.filter((p) => p.replaces).length} replace a Supabase picture), already there: ${w.pics.sameAlready}, Supabase's kept: ${w.pics.supabaseKept}, moved with a folded chat: ${w.pics.move.length}, removed with demo or folded chats: ${w.pics.remove.length}, db2 pictures with no chat: ${w.pics.noChat}`);

  const up = tally(w.plan.ups), del = tally(w.plan.dels);
  say("\nROWS THIS WOULD WRITE TO SUPABASE");
  for (const c of ["ws", "config", ...LISTS]) say(`  ${pad(c, 15)}write ${pad(up[c] ?? 0, 7)}remove ${del[c] ?? 0}`);
  say(`  total: write ${w.plan.ups.length}, remove ${w.plan.dels.length}, about ${kb(w.plan.ups.reduce((s, r) => s + r[2].length, 0))}. Version ${info.destV} -> ${w.plan.ups.length || w.plan.dels.length ? info.destV + 1 : info.destV}.`);

  if (R.settling.passes > 1) list("Settling passes", R.settling.later, (p) => `pass ${p.pass}: ${p.rowsChanged} rows changed, ${p.rowsRemoved} removed, ${p.chatsFolded.length} chats folded`);
  if (R.warnings.length) { say("\nPLEASE READ"); for (const m of R.warnings) say(`  - ${m}`); }
}

/** Puts a snapshot back, through the same versioned write, so running copies of the app pick it up. */
async function restore(a, env, dest, destT) {
  const snap = JSON.parse(zlib.gunzipSync(fs.readFileSync(a.restore)).toString("utf8"));
  if (snap.table !== destT) { say(`This snapshot is of the table ${snap.table}, not ${destT}. Nothing was changed.`); return 1; }
  const target = fromRows(snap.rows);
  const picsBack = snap.avatarsBefore ?? [], picsOut = (snap.avatarsAdded ?? []).filter((id) => !picsBack.some((r) => r.id === id));
  const describe = (plan, v) => {
    const up = tally(plan.ups), del = tally(plan.dels);
    say(`Snapshot taken ${snap.takenAt} at version ${snap.version}. Supabase is now at version ${v}.`);
    for (const c of ["ws", "config", ...LISTS]) say(`  ${c.padEnd(15)}put back ${String(up[c] ?? 0).padEnd(7)}remove ${del[c] ?? 0}`);
    say(`  Rows removed here are ones written after the snapshot. They would be lost.`);
    say(`  Pictures: ${picsBack.length} put back, ${picsOut.length} removed.`);
  };
  if (!a.apply) {
    describe(planRows(fromRows(await readRows(dest.q, destT)), target), await versionOf(dest.q, destT));
    say("\nDRY RUN: nothing was written. Add --apply to put the snapshot back.");
    return 0;
  }
  const c = await dest.pool.connect();
  try {
    await c.query("begin");
    const cq = async (t, p = []) => (await c.query(t, p)).rows;
    const v0 = Number((await cq(`select v from ${destT}_meta where k = 'version' for update`))[0].v);
    const rows = await readRows(cq, destT);
    const plan = planRows(fromRows(rows), target);
    describe(plan, v0);
    if (!plan.ups.length && !plan.dels.length && !picsBack.length && !picsOut.length) { await c.query("rollback"); say("\nNothing to do: Supabase already matches the snapshot."); return 0; }
    const file = writeSnapshot(env, { tool: "merge-db2", reason: "restore", table: destT, takenAt: new Date().toISOString(), version: v0, rows: rows.map(({ coll, id, data, ver }) => ({ coll, id, data, ver })), del: await cq(`select coll, id, ver from ${destT}_del`), avatarsBefore: [], avatarsAdded: [] });
    say(`\nSnapshot of how things were just now: ${file}`);
    const v1 = plan.ups.length || plan.dels.length ? await writePlan(c, destT, plan) : v0;
    await c.query("commit");
    say(`Restored. Version ${v0} -> ${v1}.`);
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  const t = `${destT}_avatars`;
  if (picsOut.length) await dest.q(`delete from ${t} where id = any($1::text[])`, [picsOut]);
  for (const r of picsBack) await dest.q(`insert into ${t} (id, url, type, data, at) values ($1, $2, $3, $4, $5) on conflict (id) do update set url = excluded.url, type = excluded.type, data = excluded.data, at = excluded.at`, [r.id, r.url, r.type, r.data, r.at]);
  return 0;
}

async function main(argv) {
  let a;
  try { a = parseArgs(argv); } catch (e) { console.error(e.message); return 1; }
  if (a.help) {
    // The notes at the top of this file are the help text.
    const top = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1);
    say(top.slice(0, top.findIndex((l) => !l.startsWith("//"))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    return 0;
  }
  let env;
  try { env = loadEnv(a.env ?? process.env.ENV_FILE); } catch { console.error(`The env file ${a.env ?? process.env.ENV_FILE} could not be read.`); return 1; }
  const destUrl = env.MERGE_DEST_URL || env.SUPA_POSTGRES_URL_NON_POOLING || env.SUPA_POSTGRES_URL || "";
  const destT = cleanName(env.MERGE_DEST_TABLE || "setter_store");
  const srcUrl = env.MERGE_SRC_URL || env.SETTER_DATABASE_URL || "";
  const srcT = cleanName(env.MERGE_SRC_TABLE || "setter_store");
  const baseUrl = env.MERGE_BASE_URL || env.DATABASE_URL || "";
  const baseT = cleanName(env.MERGE_BASE_TABLE || "setter_store");
  const hint = "Give the file that holds the addresses with --env <file> (one made by `vercel env pull` works).";
  if (!destUrl) { console.error(`No address for Supabase (SUPA_POSTGRES_URL_NON_POOLING or SUPA_POSTGRES_URL). ${hint}`); return 1; }
  if (isNeon(destUrl)) { console.error("The store to write must be the Supabase database, not a Neon one. Nothing was changed."); return 1; }
  const opened = [];
  const use = (url) => { const d = open(url); opened.push(d); return d; };
  try {
    if (a.restore) return await restore(a, env, use(destUrl), destT);
    if (!srcUrl) { console.error(`No address for db2 (SETTER_DATABASE_URL). ${hint}`); return 1; }
    if (srcUrl === destUrl && srcT === destT) { console.error("db2 and Supabase point at the same table. Nothing was changed."); return 1; }
    say(a.apply ? "APPLY: the merge will be written to Supabase after a snapshot is taken." : "DRY RUN: nothing will be written. Add --apply to write.");

    // ----- db2 first: if it is still locked there is nothing to do -----
    const src = use(srcUrl);
    let srcV;
    try {
      srcV = await versionOf(src.q, srcT);
    } catch (e) {
      const why = lockedReason(e);
      if (!why) { console.error(`db2 could not be read: ${scrub(e.message)}`); return 1; }
      say("\ndb2 IS STILL LOCKED.");
      say("Neon refuses every query on it because the free allowance for this month is used up (HTTP 402).");
      say(`Neon's answer: ${why}`);
      say("Nothing was read from db2 and nothing was written anywhere. Supabase was not touched.");
      say("The allowance resets at the start of the month, so try again on or after 1 Dec 2026:");
      say("  node web/scripts/merge-db2.mjs --env <env file>");
      return a.apply ? 2 : 0;
    }
    const srcStore = fromRows(await readRows(src.q, srcT));
    const srcPics = a.avatars ? await avatarRows(src.q, srcT) : [];

    // ----- the older copy Supabase was filled from, to see what changed on Supabase since -----
    let base = null, baseNote = "not read (--no-base)";
    if (a.base) {
      if (!baseUrl) baseNote = "no address given (DATABASE_URL), so not read";
      else if ((baseUrl === destUrl && baseT === destT) || (baseUrl === srcUrl && baseT === srcT)) baseNote = "points at one of the other two stores, so not used";
      else {
        try {
          const rows = await readRows(use(baseUrl).q, baseT);
          if (rows.length) { base = fromRows(rows); baseNote = `table ${baseT}: ${base.conversations.length} chats, ${base.messages.length} messages. Used to see what changed on Supabase since the move.`; }
          else baseNote = "empty, so not used";
        } catch (e) {
          baseNote = lockedReason(e) ? "locked too (Neon allowance used up), so not used" : `could not be read (${scrub(e.message)}), so not used`;
        }
      }
    }
    const opts = { ws: a.ws, config: a.config, join: a.join, separate: a.separate, bringBack: a.bringBack, names: a.names, keepDemo: a.keepDemo, keepMissing: a.keepMissing, ...(a.cutover ? { cutover: a.cutover } : {}) };
    const work = (dstStore, dstPics) => {
      let b = base, note = baseNote;
      // The older copy only helps if Supabase really started from it.
      if (b && b.ws.id !== dstStore.ws.id) { b = null; note = "belongs to a different workspace than Supabase, so not used"; }
      const merged = mergeStores(srcStore, dstStore, b, opts);
      if (srcStore.ws.id !== undefined && srcStore.ws.id !== dstStore.ws.id) merged.report.warnings.push("db2 and Supabase carry different workspace ids. Supabase's id is kept. Check this is the right pair of databases before applying.");
      return { merged, note, plan: planRows(dstStore, merged.store), pics: a.avatars ? planAvatars(srcPics, dstPics, merged) : null };
    };
    const dest = use(destUrl);
    for (const t of [destT, `${destT}_meta`, `${destT}_del`]) if (!(await hasTable(dest.q, t))) { console.error(`Supabase has no table ${t}. Open the app once so it creates its tables, then run this again.`); return 1; }
    const infoOf = (w, v, dstPics) => ({ srcT, destT, srcV, destV: v, baseNote: w.note, srcPics: srcPics.length, dstPics: dstPics.length });
    const saveJson = (w, info, extra) => {
      if (!a.json) return;
      fs.writeFileSync(a.json, JSON.stringify({ tool: "merge-db2", mode: a.apply ? "apply" : "dry run", at: new Date().toISOString(), options: opts, sources: info, report: w.merged.report, pictures: w.pics, rows: { write: tally(w.plan.ups), remove: tally(w.plan.dels), removedIds: w.plan.dels.map((d) => d.join("/")) }, ...extra }, null, 2), { mode: 0o600 });
      say(`\nFull report saved to ${a.json}`);
    };

    if (!a.apply) {
      const v = await versionOf(dest.q, destT);
      const dstPics = await avatarRows(dest.q, destT);
      const w = work(fromRows(await readRows(dest.q, destT)), dstPics);
      const info = infoOf(w, v, dstPics);
      printReport({ a, w, info });
      saveJson(w, info, {});
      const nothing = !w.plan.ups.length && !w.plan.dels.length && !(w.pics && (w.pics.copy.length || w.pics.move.length || w.pics.remove.length));
      say(nothing ? "\nNOTHING TO DO: Supabase already holds everything db2 has." : "\nDRY RUN: nothing was written. Read the report, then run again with --apply (at a quiet moment, with the inbox closed).");
      return 0;
    }

    // ----- apply: one transaction, holding the version row so the app cannot save half way through -----
    let w, v0, v1, file;
    const c = await dest.pool.connect();
    try {
      await c.query("begin");
      const cq = async (t, p = []) => (await c.query(t, p)).rows;
      v0 = Number((await cq(`select v from ${destT}_meta where k = 'version' for update`))[0]?.v);
      if (!Number.isFinite(v0)) throw new Error("Supabase has no version row. Open the app once, then run this again.");
      const rows = await readRows(cq, destT);
      const dstPics = await avatarRows(cq, destT);
      w = work(fromRows(rows), dstPics);
      const info = infoOf(w, v0, dstPics);
      printReport({ a, w, info });
      if (!w.merged.settled) { await c.query("rollback"); say("\nNOT APPLIED: the merge did not settle. Nothing was written."); return 1; }
      const p = w.pics;
      const picWork = Boolean(p && (p.copy.length || p.move.length || p.remove.length));
      if (!w.plan.ups.length && !w.plan.dels.length && !picWork) { await c.query("rollback"); saveJson(w, info, {}); say("\nNOTHING TO DO: Supabase already holds everything db2 has. Nothing was written."); return 0; }
      const picIds = p ? [...p.remove, ...p.move.map((m) => m.from), ...p.copy.filter((x) => x.replaces).map((x) => x.to)] : [];
      file = writeSnapshot(env, {
        tool: "merge-db2", reason: "merge", table: destT, takenAt: new Date().toISOString(), version: v0,
        rows: rows.map(({ coll, id, data, ver }) => ({ coll, id, data, ver })), del: await cq(`select coll, id, ver from ${destT}_del`),
        // Pictures that are replaced or removed are saved whole; added ones only by id, since undoing them is a delete.
        avatarsBefore: picIds.length ? await cq(`select id, url, type, data, at from ${destT}_avatars where id = any($1::text[])`, [picIds]) : [],
        avatarsAdded: p ? [...p.copy.map((x) => x.to), ...p.move.map((m) => m.to)] : [],
      });
      say(`\nSnapshot of Supabase as it was: ${file}`);
      v1 = w.plan.ups.length || w.plan.dels.length ? await writePlan(c, destT, w.plan) : v0;
      await c.query("commit");
      saveJson(w, info, { snapshot: file, versionBefore: v0, versionAfter: v1 });
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
    say(`APPLIED: wrote ${w.plan.ups.length} rows and removed ${w.plan.dels.length}. Version ${v0} -> ${v1}. Running copies of the app pick this up on their next request.`);
    if (w.pics && (w.pics.copy.length || w.pics.move.length || w.pics.remove.length)) {
      const done = await applyAvatars(dest, destT, src, srcT, w.pics);
      say(`Pictures: ${done} copied, ${w.pics.move.length} moved, ${w.pics.remove.length} removed.`);
    }
    say(`To undo: node web/scripts/merge-db2.mjs --env <env file> --restore ${file} --apply`);
    say("Now run the dry run once more. It should say there is nothing to do.");
    return 0;
  } finally {
    for (const d of opened) await d.end().catch(() => {});
  }
}

// Only runs when started as a command, so the test can load the functions above without touching a database.
const started = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
if (started === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(`Stopped: ${scrub(e?.message ?? e)}`); process.exitCode = 1; });
}
