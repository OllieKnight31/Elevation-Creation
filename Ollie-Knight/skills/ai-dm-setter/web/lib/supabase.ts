import type { Conversation, Db, FunnelEvent, Message } from "./types";
import { cfg } from "./config";
import { pipelineOf } from "./pipeline";

// Supabase is used through its REST interface with the service key, so there is no extra package to install.
// The app keeps a working copy in memory and mirrors every change into these tables.
export const TABLES = ["setter_workspaces", "setter_leads", "setter_messages", "setter_events"] as const;
type Table = (typeof TABLES)[number];
type Row = Record<string, unknown> & { id: string };

export function supabaseConfigured() {
  return Boolean(cfg("SUPABASE_URL") && cfg("SUPABASE_SERVICE_KEY"));
}

const base = () => cfg("SUPABASE_URL").replace(/\/+$/, "") + "/rest/v1";

async function call(path: string, init: RequestInit & { prefer?: string } = {}) {
  const key = cfg("SUPABASE_SERVICE_KEY");
  const res = await fetch(base() + path, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.prefer ? { Prefer: init.prefer } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = body.slice(0, 200);
    try { const j = JSON.parse(body); msg = j.message || j.error || msg; } catch {}
    const err = new Error(`Supabase ${res.status}: ${msg}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res;
}

/** ok when every table answers. missing lists the tables that still need creating. */
export async function checkSupabase(): Promise<{ ok: boolean; missing: string[]; error: string }> {
  const missing: string[] = [];
  for (const t of TABLES) {
    try {
      await call(`/${t}?select=id&limit=1`);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 404 || /does not exist|schema cache|PGRST205/i.test(err.message)) missing.push(t);
      else return { ok: false, missing, error: err.status === 401 || err.status === 403 ? "Supabase rejected the key. Use the service role (secret) key, not the anon key." : err.message };
    }
  }
  return { ok: missing.length === 0, missing, error: missing.length ? `Tables not created yet: ${missing.join(", ")}. Run supabase/schema.sql in the Supabase SQL editor.` : "" };
}

async function selectAll(table: Table, workspaceId?: string): Promise<Row[]> {
  const out: Row[] = [];
  const filter = workspaceId ? `&workspace_id=eq.${encodeURIComponent(workspaceId)}` : "";
  for (let offset = 0; ; offset += 1000) {
    const rows = (await (await call(`/${table}?select=*${filter}&order=id&limit=1000&offset=${offset}`)).json()) as Row[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export function profileUrl(c: Pick<Conversation, "platform" | "handle">) {
  if (!c.handle) return "";
  return c.platform === "instagram" ? `https://www.instagram.com/${c.handle}/` : `https://www.facebook.com/${c.handle}`;
}

const iso = (v: string | null | undefined) => (v ? new Date(v).toISOString() : null);

function rowsOf(db: Db): Record<Table, Row[]> {
  const ws = db.workspace;
  const pipe = pipelineOf(ws.pipeline);
  const member = (id?: string | null) => ws.members.find((m) => m.id === id)?.name ?? null;
  return {
    setter_workspaces: [{ id: ws.id, name: ws.intake.businessName || null, data: ws, label_queue: db.labelQueue }],
    setter_leads: db.conversations.map((c) => ({
      id: c.id, workspace_id: ws.id, platform: c.platform, external_id: c.externalId, name: c.name, handle: c.handle, profile_url: profileUrl(c) || null,
      origin: c.origin, stage: c.stage, stage_name: pipe.stage(c.stage).name, tags: c.labels, status: c.status, ai_mode: c.aiMode,
      assigned_to: c.assignedTo ?? null, assigned_name: member(c.assignedTo),
      situation: c.lead.situation ?? null, goal: c.lead.goal ?? null, pain: c.lead.pain ?? null, objections: c.lead.objections ?? [],
      budget: c.lead.budget ?? null, email: c.lead.email ?? null, phone: c.lead.phone ?? null,
      summary: c.summary?.text ?? null, next_step: c.summary?.nextStep ?? null, notes: c.notes || null, loss_reason: c.lossReason ?? null,
      unread: c.unread, last_inbound_at: iso(c.lastInboundAt), last_message_at: iso(c.lastMessageAt), created_at: iso(c.createdAt), data: c,
    })),
    setter_messages: db.messages.map((m) => ({
      id: m.id, workspace_id: ws.id, lead_id: m.conversationId, direction: m.direction, sender: m.sender, member_id: m.memberId ?? null,
      body: m.text, sent_at: iso(m.sentAt), source: m.source, external_id: m.externalId ?? null,
    })),
    setter_events: db.events.map((e) => ({
      id: e.id, workspace_id: ws.id, lead_id: e.conversationId, type: e.type, stage: e.stage ?? null, detail: e.detail ?? null,
      actor: e.by, member_id: e.memberId ?? null, at: iso(e.at), data: e,
    })),
  };
}

/** Reads a whole workspace back out of Supabase. null when nothing has been stored there yet. */
export async function loadFromSupabase(): Promise<Db | null> {
  const wsRows = await selectAll("setter_workspaces");
  const w = wsRows[0];
  if (!w) return null;
  const [leads, msgs, evs] = await Promise.all([selectAll("setter_leads", w.id), selectAll("setter_messages", w.id), selectAll("setter_events", w.id)]);
  const db: Db = {
    workspace: w.data as Db["workspace"],
    labelQueue: (w.label_queue as Db["labelQueue"]) ?? [],
    conversations: leads.map((r) => r.data as Conversation),
    messages: msgs.map((r) => ({
      id: r.id, conversationId: r.lead_id as string, direction: r.direction as Message["direction"], sender: r.sender as Message["sender"],
      text: r.body as string, sentAt: new Date(r.sent_at as string).toISOString(), source: r.source as Message["source"],
      ...(r.external_id ? { externalId: r.external_id as string } : {}), ...(r.member_id ? { memberId: r.member_id as string } : {}),
    })),
    events: evs.map((r) => r.data as FunnelEvent),
  };
  remember(db);
  return db;
}

// What Supabase held after the last successful push, so each save only sends what changed.
const g = globalThis as unknown as { __setterPushed?: Record<Table, Map<string, string>> };
const pushed = () => (g.__setterPushed ??= Object.fromEntries(TABLES.map((t) => [t, new Map<string, string>()])) as Record<Table, Map<string, string>>);

function remember(db: Db) {
  const rows = rowsOf(db);
  for (const t of TABLES) pushed()[t] = new Map(rows[t].map((r) => [r.id, JSON.stringify(r)]));
}

export function forgetPushed() {
  g.__setterPushed = undefined;
}

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));

/** Sends new and changed rows, removes deleted ones. Returns how many rows were written. */
export async function pushToSupabase(db: Db): Promise<{ written: number; removed: number }> {
  const rows = rowsOf(db);
  let written = 0;
  let removed = 0;
  const now = new Date().toISOString();
  // Leads go first so a message never arrives before the lead it belongs to.
  for (const t of TABLES) {
    const seen = pushed()[t];
    const fresh = rows[t].map((r) => [r, JSON.stringify(r)] as const).filter(([r, s]) => seen.get(r.id) !== s);
    for (const part of chunk(fresh, 400)) {
      const body = part.map(([r]) => (t === "setter_leads" || t === "setter_workspaces" ? { ...r, updated_at: now } : r));
      await call(`/${t}?on_conflict=id`, { method: "POST", body: JSON.stringify(body), prefer: "resolution=merge-duplicates,return=minimal" });
      for (const [r, s] of part) seen.set(r.id, s);
      written += part.length;
    }
  }
  for (const t of [...TABLES].reverse()) {
    const seen = pushed()[t];
    const live = new Set(rows[t].map((r) => r.id));
    const gone = [...seen.keys()].filter((id) => !live.has(id));
    for (const part of chunk(gone, 80)) {
      await call(`/${t}?id=in.(${part.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`, { method: "DELETE", prefer: "return=minimal" });
      for (const id of part) seen.delete(id);
      removed += part.length;
    }
  }
  return { written, removed };
}

/** Creates the tables through the Supabase management API. Needs a personal access token, used once and not stored. */
export async function createTables(accessToken: string, sql: string) {
  const ref = new URL(cfg("SUPABASE_URL")).hostname.split(".")[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Supabase management API ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
