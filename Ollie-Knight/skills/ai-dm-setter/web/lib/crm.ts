import { createHash } from "crypto";
import type { Conversation, CrmLogItem, Db } from "./types";
import { cfg } from "./config";
import { pipelineOf } from "./pipeline";
import { profileUrl } from "./supabase";
import { flushNow, getDb, saveDb } from "./store";
import { background, sleep } from "./hosted";
import { prunedCount, sheetsTouch } from "./sheets";

// Keeps the closer's CRM in step with the DMs. Two routes, usable together:
// 1. Webhook: one flat JSON POST per change, to GoHighLevel's inbound webhook trigger, Zapier, Make or n8n.
// 2. GoHighLevel direct: contact, tags, custom fields, a note and the pipeline opportunity through GHL's API.
// The direct calls follow GHL's published API and pass against a local stand-in. They have not run against a live sub-account yet.

const GHL = () => process.env.GHL_API_BASE_OVERRIDE || "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

/** Custom fields created in GoHighLevel, in this order. The key is ours, the name is what the closer sees. */
export const GHL_FIELDS: [string, string, "TEXT" | "LARGE_TEXT"][] = [
  ["stage", "DM stage", "TEXT"],
  ["source", "DM source", "TEXT"],
  ["instagram_handle", "Instagram handle", "TEXT"],
  ["profile_url", "DM profile link", "TEXT"],
  ["situation", "DM situation", "LARGE_TEXT"],
  ["goal", "DM goal", "LARGE_TEXT"],
  ["pain", "DM pain", "LARGE_TEXT"],
  ["objections", "DM objections", "LARGE_TEXT"],
  ["budget", "DM budget", "TEXT"],
  ["summary", "DM conversation summary", "LARGE_TEXT"],
  ["next_step", "DM next step", "LARGE_TEXT"],
  ["setter", "DM setter", "TEXT"],
  ["inbox_url", "DM conversation link", "TEXT"],
];

/** Everything known about a lead, as flat keys a CRM workflow can map without digging. */
export function leadPayload(db: Db, c: Conversation, event = "lead.updated") {
  const ws = db.workspace;
  const pipe = pipelineOf(ws.pipeline);
  const msgs = db.messages.filter((m) => m.conversationId === c.id);
  const parts = c.name.trim().split(/\s+/);
  const link = [...db.events].reverse().find((e) => e.conversationId === c.id && e.type === "link_sent");
  const base = cfg("APP_BASE_URL").replace(/\/+$/, "");
  return {
    event,
    lead_id: c.id,
    name: c.name,
    first_name: parts[0] ?? "",
    last_name: parts.slice(1).join(" "),
    email: c.lead.email ?? "",
    phone: c.lead.phone ?? "",
    platform: c.platform,
    instagram_handle: c.platform === "instagram" ? c.handle ?? "" : "",
    profile_url: profileUrl(c),
    source: c.origin,
    stage: pipe.stage(c.stage).name,
    stage_id: c.stage,
    tags: c.labels.join(", "),
    situation: c.lead.situation ?? "",
    goal: c.lead.goal ?? "",
    pain: c.lead.pain ?? "",
    objections: (c.lead.objections ?? []).join(", "),
    budget: c.lead.budget ?? "",
    summary: c.summary?.text ?? "",
    next_step: c.summary?.nextStep ?? "",
    notes: c.notes,
    loss_reason: c.lossReason ?? "",
    setter: ws.members.find((m) => m.id === c.assignedTo)?.name ?? "",
    ai_mode: c.aiMode,
    status: c.status,
    link_sent: link?.detail ?? "",
    message_count: msgs.length + prunedCount(c),
    last_message_at: c.lastMessageAt,
    last_inbound_at: c.lastInboundAt ?? "",
    created_at: c.createdAt,
    inbox_url: base ? `${base}/inbox?c=${c.id}` : "",
    business: ws.intake.businessName,
  };
}
export type LeadPayload = ReturnType<typeof leadPayload>;

function log(db: Db, item: Omit<CrmLogItem, "at">) {
  db.workspace.crm.log = [{ at: new Date().toISOString(), ...item }, ...db.workspace.crm.log].slice(0, 40);
}

async function postWebhook(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  return { ok: res.ok, status: res.status, text: res.ok ? "" : (await res.text().catch(() => "")).slice(0, 140) };
}

async function ghl(db: Db, path: string, method = "GET", body?: unknown) {
  const token = db.workspace.crm.ghl.token;
  if (!token) throw new Error("No GoHighLevel token saved.");
  const res = await fetch(GHL() + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, Version: GHL_VERSION, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join("; ") : data?.message || data?.error || "";
    const err = new Error(`GoHighLevel ${res.status}${msg ? `: ${msg}` : ""}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function ghlPipelines(db: Db): Promise<{ id: string; name: string; stages: { id: string; name: string }[] }[]> {
  const loc = db.workspace.crm.ghl.locationId;
  if (!loc) throw new Error("Add the GoHighLevel location ID first.");
  const d = await ghl(db, `/opportunities/pipelines?locationId=${encodeURIComponent(loc)}`);
  return (d.pipelines ?? []).map((p: { id: string; name: string; stages?: { id: string; name: string }[] }) => ({ id: p.id, name: p.name, stages: (p.stages ?? []).map((s) => ({ id: s.id, name: s.name })) }));
}

/** Finds our custom fields in GoHighLevel, creating any that are missing, and remembers their ids. */
export async function ghlPrepareFields(db: Db) {
  const g = db.workspace.crm.ghl;
  const d = await ghl(db, `/locations/${g.locationId}/customFields?model=contact`);
  const existing: { id: string; name: string }[] = d.customFields ?? [];
  const ids: Record<string, string> = {};
  let created = 0;
  for (const [key, name, dataType] of GHL_FIELDS) {
    let id = existing.find((f) => f.name?.toLowerCase() === name.toLowerCase())?.id;
    if (!id) {
      const made = await ghl(db, `/locations/${g.locationId}/customFields`, "POST", { name, dataType, model: "contact" });
      id = made.customField?.id ?? made.id;
      created++;
    }
    if (id) ids[key] = id;
  }
  g.fieldIds = ids;
  saveDb();
  return { fields: Object.keys(ids).length, created };
}

function e164(phone: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  return /^\+\d{8,15}$/.test(digits) ? digits : "";
}

async function pushGhl(db: Db, c: Conversation, p: LeadPayload) {
  const g = db.workspace.crm.ghl;
  if (!g.fieldIds) await ghlPrepareFields(db);
  const values: Record<string, string> = p as unknown as Record<string, string>;
  const fields = (key: "field_value" | "fieldValue") => Object.entries(g.fieldIds ?? {}).map(([k, id]) => ({ id, [key]: String(values[k] ?? "") }));
  const contact = (key: "field_value" | "fieldValue") => ({
    firstName: p.first_name, lastName: p.last_name, name: p.name,
    ...(p.email ? { email: p.email } : {}), ...(e164(p.phone) ? { phone: e164(p.phone) } : {}),
    source: `DM setter (${p.platform})`, customFields: fields(key),
  });
  const link = (c.crm ??= {});
  // GoHighLevel only matches existing contacts on email or phone, so the contact id is kept after the first sync.
  const save = async (key: "field_value" | "fieldValue") => {
    if (link.contactId) return ghl(db, `/contacts/${link.contactId}`, "PUT", contact(key));
    const made = await ghl(db, "/contacts/upsert", "POST", { locationId: g.locationId, ...contact(key) });
    link.contactId = made.contact?.id ?? made.id;
  };
  try {
    await save("field_value");
  } catch (e) {
    // GoHighLevel's two API versions name this property differently.
    if ((e as Error & { status?: number }).status === 422 && /field_value/i.test((e as Error).message)) await save("fieldValue");
    else throw e;
  }
  if (!link.contactId) throw new Error("GoHighLevel did not return a contact id.");
  // Tags are added, never replaced, so tags the closer set in GoHighLevel are left alone.
  const tags = [...c.labels, `DM: ${p.stage}`];
  if (tags.length) await ghl(db, `/contacts/${link.contactId}/tags`, "POST", { tags });

  const note = [p.summary && `Summary: ${p.summary}`, p.next_step && `Next step: ${p.next_step}`, p.situation && `Situation: ${p.situation}`, p.goal && `Goal: ${p.goal}`, p.pain && `Pain: ${p.pain}`, p.objections && `Objections: ${p.objections}`, p.budget && `Budget: ${p.budget}`, p.notes && `Setter notes: ${p.notes}`].filter(Boolean).join("\n");
  const noteKey = createHash("sha1").update(note).digest("hex").slice(0, 12);
  if (note && noteKey !== link.noteKey) {
    await ghl(db, `/contacts/${link.contactId}/notes`, "POST", { body: `DM setter update (${p.stage})\n${note}` });
    link.noteKey = noteKey;
  }

  const stageId = g.stageMap[c.stage];
  if (g.pipelineId && stageId) {
    const status = c.stage === "won" ? "won" : c.stage === "lost" || c.stage === "disqualified" ? "lost" : "open";
    if (link.opportunityId) {
      await ghl(db, `/opportunities/${link.opportunityId}`, "PUT", { pipelineId: g.pipelineId, pipelineStageId: stageId, status, name: p.name });
    } else {
      const made = await ghl(db, "/opportunities/", "POST", { pipelineId: g.pipelineId, locationId: g.locationId, name: p.name, contactId: link.contactId, status, pipelineStageId: stageId });
      link.opportunityId = made.opportunity?.id ?? made.id;
    }
  }
}

/** Sends one lead to every connected destination now. Never throws: the outcome is written to the log and the lead. */
export async function pushLead(db: Db, c: Conversation, event = "lead.updated") {
  const crm = db.workspace.crm;
  const p = leadPayload(db, c, event);
  const link = (c.crm ??= {});
  let failed = "";
  if (crm.webhookUrl) {
    try {
      const r = await postWebhook(crm.webhookUrl, p);
      log(db, { lead: c.name, target: "webhook", ok: r.ok, status: r.status, note: r.ok ? event : r.text || "Rejected" });
      if (!r.ok) failed = `Webhook answered ${r.status}`;
    } catch (e) {
      failed = (e as Error).message;
      log(db, { lead: c.name, target: "webhook", ok: false, note: failed });
    }
  }
  if (crm.ghl.enabled && crm.ghl.token && crm.ghl.locationId) {
    try {
      await pushGhl(db, c, p);
      log(db, { lead: c.name, target: "ghl", ok: true, note: `${p.stage}${link.opportunityId ? ", opportunity updated" : ""}` });
    } catch (e) {
      failed = (e as Error).message;
      log(db, { lead: c.name, target: "ghl", ok: false, status: (e as Error & { status?: number }).status, note: failed });
    }
  }
  link.lastSyncAt = new Date().toISOString();
  link.lastStatus = failed ? "failed" : "ok";
  link.lastError = failed || undefined;
  saveDb();
  return { ok: !failed, error: failed };
}

export function crmActive(db: Db) {
  const crm = db.workspace.crm;
  return crm.enabled && Boolean(crm.webhookUrl || (crm.ghl.enabled && crm.ghl.token && crm.ghl.locationId));
}

const touches = (globalThis as unknown as { __setterCrm?: Map<string, number> }).__setterCrm ??= new Map();

/**
 * Call whenever something about a lead changes. Changes that arrive together (a new stage, three tags and a
 * fresh summary from one AI turn) go out as a single update a few seconds later.
 */
export function crmTouch(db: Db, c: Conversation, event = "lead.updated") {
  sheetsTouch(db);
  if (!crmActive(db)) return;
  if (c.externalId.startsWith("demo_") && !db.workspace.crm.includeDemo) return;
  // Only the last touch in a burst sends. Runs after the response has gone, so it also works on Vercel.
  const turn = (touches.get(c.id) ?? 0) + 1;
  touches.set(c.id, turn);
  const id = c.id;
  background(async () => {
    await sleep(Number(process.env.SETTER_CRM_DELAY_MS) || 4000);
    if (touches.get(id) !== turn) return;
    touches.delete(id);
    const now = getDb();
    const lead = now.conversations.find((x) => x.id === id);
    if (lead) await pushLead(now, lead, event).catch(() => {});
    await flushNow();
  });
}

/** Sample payload for the Send test button, so the CRM side can be mapped before real leads flow. */
export async function sendTest(db: Db) {
  const url = db.workspace.crm.webhookUrl;
  if (!url) throw new Error("Add a webhook URL first.");
  const sample = db.conversations.find((c) => c.lead.goal) ?? db.conversations[0];
  const p = sample ? { ...leadPayload(db, sample, "test"), email: "test.lead@example.com", phone: "+447700900123" } : { event: "test" };
  const r = await postWebhook(url, { ...p, test: true });
  log(db, { lead: "Test payload", target: "webhook", ok: r.ok, status: r.status, note: r.ok ? "Test received" : r.text || "Rejected" });
  saveDb();
  if (!r.ok) throw new Error(`The webhook answered ${r.status}. ${r.text}`);
  return p;
}
