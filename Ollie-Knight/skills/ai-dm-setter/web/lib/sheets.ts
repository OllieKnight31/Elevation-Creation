import { createHash, randomBytes } from "crypto";
import type { Db, SheetsConfig, Workspace } from "./types";
import { leadPayload } from "./crm";
import { calendarZone } from "./calendar";
import { pipelineOf } from "./pipeline";
import { flushNow, getDb, saveDb } from "./store";
import { background, sleep } from "./hosted";
import { SHEETS_SCRIPT } from "./sheets-script";

// Google Sheets archive. The owner deploys a small Apps Script (sheets-script.ts) as a web app in their own
// Google account and pastes its address here. Leads, messages and events are sent to it in batches; it writes
// them into tabs and starts a new tab when one is full, and a new spreadsheet file before Google's
// 10 million cell limit. Once a message is safely in the sheet and older than keepDays, it is removed from
// the database so the free database never fills. The newest messages of every thread always stay.

const BATCH = 1500;

/** Short fingerprint of a message's direction and text, used to recognise moved messages when a thread is captured again. */
export const textKey = (direction: string, text: string) => createHash("sha1").update(direction + "|" + text).digest("base64url").slice(0, 10);

/** Messages of a conversation that now live only in the sheet. */
export const prunedCount = (c: { pruned?: Record<string, number> }) => Object.values(c.pruned ?? {}).reduce((n, x) => n + x, 0);

export function normaliseSheets(s?: Partial<SheetsConfig>): SheetsConfig {
  return {
    enabled: false, url: "", keepDays: 90, keepPerThread: 30, leadHashes: {}, tallies: {}, files: [], sent: 0, pruned: 0,
    ...s,
    secret: s?.secret || randomBytes(18).toString("base64url"),
  };
}

export const sheetsActive = (ws: Workspace) => ws.sheets.enabled && Boolean(ws.sheets.url);

/** What the browser may see. The secret only travels inside the script the owner copies. */
export function sheetsView(ws: Workspace) {
  const { secret: _secret, leadHashes: _h, tallies: _t, ...rest } = ws.sheets;
  return rest;
}

export const sheetsScript = (ws: Workspace) => SHEETS_SCRIPT.replace("__SECRET__", ws.sheets.secret);

const real = (convId: string, demo: Set<string>) => convId !== "bg" && !demo.has(convId);

/** Text a sheet would read as a formula is kept as plain text. Cells hold at most 50,000 characters. */
const cell = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return (/^[=+\-@]/.test(s) ? "'" + s : s).slice(0, 49_000);
};

function when(ws: Workspace) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: calendarZone(ws), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  return (iso?: string | null) => {
    if (!iso) return "";
    const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
  };
}

const LEAD_KEYS = [
  "lead_id", "name", "instagram_handle", "platform", "profile_url", "source", "stage", "tags", "status", "ai_mode", "setter", "email", "phone",
  "situation", "goal", "pain", "objections", "budget", "summary", "next_step", "notes", "loss_reason", "link_sent", "message_count",
  "created_at", "last_message_at", "last_inbound_at", "inbox_url",
] as const;
const TIME_KEYS = new Set(["created_at", "last_message_at", "last_inbound_at"]);

const SENDER: Record<string, string> = { lead: "Lead", owner: "Team", ai: "AI", auto: "Keyword reply" };
const EVENT: Record<string, string> = {
  conversation_started: "Conversation started", message_sent: "Message sent", message_received: "Message received", stage_changed: "Stage changed",
  link_sent: "Link sent", label_added: "Tag added", trigger_fired: "Keyword reply sent", starter_fired: "Opener sent", question_flagged: "Question flagged",
  answer_learned: "Answer learned", times_proposed: "Call times offered",
};

/** Everything not yet in the sheet, at most one batch of each kind. */
function pending(db: Db) {
  const ws = db.workspace;
  const t = when(ws);
  const demo = new Set(db.conversations.filter((c) => c.externalId.startsWith("demo_")).map((c) => c.id));
  const conv = new Map(db.conversations.map((c) => [c.id, c]));
  const member = new Map(ws.members.map((m) => [m.id, m.name]));
  const pipe = pipelineOf(ws.pipeline);

  // A lead's message count includes what was already moved out of the database.
  const leads: { id: string; hash: string; row: string[] }[] = [];
  for (const c of db.conversations) {
    if (demo.has(c.id)) continue;
    const p = leadPayload(db, c) as unknown as Record<string, unknown>;
    const row = LEAD_KEYS.map((k) => cell(TIME_KEYS.has(k) ? t(p[k] as string) : p[k]));
    const hash = createHash("sha1").update(JSON.stringify(row)).digest("base64url").slice(0, 12);
    if (ws.sheets.leadHashes[c.id] !== hash) leads.push({ id: c.id, hash, row });
    if (leads.length >= BATCH) break;
  }

  const messages = db.messages.filter((m) => !m.archived && real(m.conversationId, demo)).slice(0, BATCH);
  const events = db.events.filter((e) => !e.archived && real(e.conversationId, demo)).slice(0, BATCH);
  return {
    leads,
    messages,
    events,
    rows: {
      leads: leads.map((l) => l.row),
      messages: messages.map((m) => {
        const c = conv.get(m.conversationId);
        return [t(m.sentAt), m.conversationId, c?.name ?? "", c?.handle ?? "", m.direction === "in" ? "In" : "Out", (m.memberId && member.get(m.memberId)) || SENDER[m.sender] || m.sender, m.text, m.source, m.id].map(cell);
      }),
      events: events.map((e) => {
        const c = conv.get(e.conversationId);
        return [t(e.at), e.conversationId, c?.name ?? "", EVENT[e.type] ?? e.type, e.stage ? pipe.stage(e.stage).name : "", e.detail ?? "", (e.memberId && member.get(e.memberId)) || (e.by === "ai" ? "AI" : e.by === "human" ? "Team" : "Automatic"), e.id].map(cell);
      }),
    },
  };
}

type Reply = { ok: boolean; error?: string; files?: { name: string; url: string }[] };

async function post(url: string, body: unknown): Promise<Reply> {
  // Apps Script answers a POST with a redirect to the result, which fetch follows.
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body), redirect: "follow", signal: AbortSignal.timeout(120_000) });
  const text = await r.text();
  let data: Reply;
  try {
    data = JSON.parse(text);
  } catch {
    if (/<html/i.test(text)) throw new Error(`Google answered with a web page (${r.status}), not the archive script. Check the address is the web app URL ending in /exec and that access is set to Anyone.`);
    throw new Error(`Unexpected answer from the archive script (${r.status}).`);
  }
  if (!data.ok) throw new Error(data.error || "The archive script refused the rows.");
  return data;
}

/** Checks the address and secret without writing anything. */
export async function testSheets(db: Db, url = db.workspace.sheets.url) {
  // SETTER_SHEETS_TEST_URL lets the automated check point at a local stand-in for Google.
  if (!/^https:\/\/script\.google(usercontent)?\.com\/\S+$/.test(url) && !(process.env.SETTER_SHEETS_TEST_URL && url.startsWith(process.env.SETTER_SHEETS_TEST_URL))) throw new Error("Paste the web app address from Apps Script. It starts with https://script.google.com/macros/s/");
  const r = await post(url, { secret: db.workspace.sheets.secret, ping: true });
  return { files: r.files ?? [] };
}

const lock = (globalThis as unknown as { __setterSheetsLock?: { p: Promise<unknown> } }).__setterSheetsLock ??= { p: Promise.resolve() };

/** Sends everything not yet in the sheet, one send at a time on this copy. Returns how many rows went. */
export function syncSheets(db: Db, rounds = 20): Promise<{ sent: number }> {
  const next = lock.p.catch(() => {}).then(() => sendAll(db, rounds));
  lock.p = next;
  return next;
}

async function sendAll(db: Db, rounds: number) {
  const s = db.workspace.sheets;
  if (!s.url) throw new Error("Add the archive script address first.");
  let sent = 0;
  try {
    for (let i = 0; i < rounds; i++) {
      const p = pending(db);
      const n = p.rows.leads.length + p.rows.messages.length + p.rows.events.length;
      if (!n) break;
      const r = await post(s.url, { secret: s.secret, ...p.rows });
      for (const l of p.leads) s.leadHashes[l.id] = l.hash;
      for (const m of p.messages) m.archived = true;
      for (const e of p.events) e.archived = true;
      if (r.files?.length) s.files = r.files;
      sent += n;
      s.sent += n;
      saveDb();
    }
    for (const id of Object.keys(s.leadHashes)) if (!db.conversations.some((c) => c.id === id)) delete s.leadHashes[id];
    s.lastSyncAt = new Date().toISOString();
    s.lastError = undefined;
  } catch (e) {
    s.lastError = (e as Error).message;
    throw e;
  } finally {
    saveDb();
  }
  return { sent };
}

/**
 * Removes messages that are in the sheet and older than keepDays, keeping the newest keepPerThread of every
 * thread. Their counts stay in tallies so insights do not change.
 */
export function pruneMessages(db: Db, now = Date.now()) {
  const s = db.workspace.sheets;
  if (!s.keepDays) return { pruned: 0 };
  const cutoff = new Date(now - s.keepDays * 864e5).toISOString();
  const byConv = new Map<string, Db["messages"]>();
  for (const m of db.messages) {
    const l = byConv.get(m.conversationId);
    if (l) l.push(m);
    else byConv.set(m.conversationId, [m]);
  }
  const drop = new Set<string>();
  for (const [convId, list] of byConv) {
    list.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    const old = list.slice(0, Math.max(0, list.length - s.keepPerThread)).filter((m) => m.archived && m.sentAt < cutoff);
    if (!old.length) continue;
    const c = db.conversations.find((x) => x.id === convId);
    for (const m of old) {
      drop.add(m.id);
      const day = m.sentAt.slice(0, 10);
      const t = (s.tallies[day] ??= { in: 0, out: 0, ai: 0 });
      if (m.direction === "in") t.in++;
      else t.out++;
      if (m.sender === "ai") t.ai++;
      if (c) {
        if (!c.prunedUntil || m.sentAt > c.prunedUntil) c.prunedUntil = m.sentAt;
        const k = textKey(m.direction, m.text);
        (c.pruned ??= {})[k] = (c.pruned[k] ?? 0) + 1;
      }
    }
  }
  if (drop.size) db.messages.splice(0, db.messages.length, ...db.messages.filter((m) => !drop.has(m.id)));
  s.pruned += drop.size;
  s.lastPruneAt = new Date(now).toISOString();
  saveDb();
  return { pruned: drop.size };
}

/** The daily job: send what is new, then clear out what is old. Pruning only runs when the send worked. */
export async function sheetsDaily(db: Db) {
  if (!sheetsActive(db.workspace)) return { skipped: true };
  const { sent } = await syncSheets(db, 60);
  const { pruned } = pruneMessages(db);
  return { sent, pruned };
}

const touch = (globalThis as unknown as { __setterSheets?: { turn: number } }).__setterSheets ??= { turn: 0 };

/** Call when something new happened. A burst of changes goes to the sheet as one send, a little later. */
export function sheetsTouch(db: Db) {
  if (!sheetsActive(db.workspace)) return;
  const turn = ++touch.turn;
  background(async () => {
    await sleep(Number(process.env.SETTER_SHEETS_DELAY_MS) || 8000);
    if (touch.turn !== turn || !sheetsActive(getDb().workspace)) return;
    await syncSheets(getDb(), 3).catch((e) => console.error("[setter] sheets archive failed:", (e as Error).message));
    await flushNow();
  });
}
