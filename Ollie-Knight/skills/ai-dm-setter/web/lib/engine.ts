import { randomUUID } from "crypto";
import { calendarLinkIn, noteTimesSent } from "./calendar";
import type { Actor, Conversation, Db, KeywordTrigger, Message, MessageSource, Platform, StageId, Suggestion } from "./types";
import { CLOSE_FRIEND, EARLY_STAGES, pipelineOf, windowState } from "./pipeline";
import { fetchInstagramThreads, fetchProfile, fetchProfilePic } from "./meta";
import { applyMessengerLabels, sendMessage, sendStageEvent, sendTyping } from "./meta";
import { flushNow, saveDb } from "./store";
import { crmTouch } from "./crm";
import { sheetsTouch } from "./sheets";
import { bubblesOf, expand, type FillContext } from "./shortcuts";
import { flagGap } from "./knowledge";
import { queueReply } from "./outreach";

export const uid = (p: string) => `${p}_${randomUUID().slice(0, 12)}`;

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/^@/, "");

export function findConversation(db: Db, q: { platform: Platform; externalId?: string; scopedUserId?: string; handle?: string | null; name?: string }) {
  const same = db.conversations.filter((c) => c.platform === q.platform);
  return (
    (q.externalId && same.find((c) => c.externalId === q.externalId)) ||
    (q.scopedUserId && same.find((c) => c.scopedUserId === q.scopedUserId)) ||
    (q.handle && same.find((c) => norm(c.handle) === norm(q.handle))) ||
    (q.name && same.find((c) => norm(c.name) === norm(q.name))) ||
    undefined
  );
}

export function upsertConversation(
  db: Db,
  q: { platform: Platform; externalId: string; scopedUserId?: string; handle?: string | null; name: string; origin?: string; at?: string },
) {
  let c = findConversation(db, q);
  if (c) {
    if (q.scopedUserId && !c.scopedUserId) c.scopedUserId = q.scopedUserId;
    if (q.handle && !c.handle) c.handle = q.handle;
    return c;
  }
  const at = q.at ?? new Date().toISOString();
  c = {
    id: uid("c"), platform: q.platform, externalId: q.externalId, scopedUserId: q.scopedUserId, name: q.name || "Unknown",
    handle: q.handle ?? null, origin: q.origin ?? "Inbound DM", stage: "inbound", labels: q.origin ? [q.origin] : [],
    status: "open", aiMode: db.workspace.settings.defaultAiMode, unread: false, lastInboundAt: null, lastMessageAt: at,
    lead: {}, notes: "", suggestion: null, createdAt: at,
  };
  db.conversations.push(c);
  db.events.push({ id: uid("e"), conversationId: c.id, type: "conversation_started", by: "system", at });
  return c;
}

/**
 * The conversation for an Instagram scoped id. A new id is looked up first (username, name, picture), so a chat
 * already in the app from the history download or the helper is joined up instead of starting a second one.
 */
export async function identifyInstagram(db: Db, igsid: string, opts: { origin?: string; at?: string; username?: string } = {}) {
  const known = db.conversations.find((c) => c.platform === "instagram" && (c.scopedUserId === igsid || c.externalId === igsid));
  if (known) return known;
  const p = await fetchProfile(db.workspace, igsid);
  const username = (p.username || opts.username || "").toLowerCase();
  const conv = upsertConversation(db, {
    platform: "instagram", externalId: igsid, scopedUserId: igsid, handle: username || null,
    name: p.name || username || `Instagram user ${igsid.slice(-4)}`, origin: opts.origin, at: opts.at,
  });
  if (p.name && /^Instagram user \d{4}$/.test(conv.name)) conv.name = p.name;
  setAvatar(conv, p.pic);
  return conv;
}

/**
 * Looks the lead's name and picture up again. Meta shares a profile only once the lead has messaged since the
 * account was connected, so this runs when they message: a lead with no picture gets one straight away, and an
 * old one is renewed before Instagram's address expires.
 */
export async function refreshProfile(db: Db, conv: Conversation) {
  if (conv.platform !== "instagram" || !conv.scopedUserId) return false;
  if (conv.avatar && conv.avatarAt && Date.now() - new Date(conv.avatarAt).getTime() < 2 * 864e5) return false;
  const p = await fetchProfile(db.workspace, conv.scopedUserId);
  if (p.username && !conv.handle) conv.handle = p.username.toLowerCase();
  if (p.name && (conv.name === conv.handle || /^Instagram user \d{4}$/.test(conv.name))) conv.name = p.name;
  return setAvatar(conv, p.pic);
}

/** Only Instagram and Facebook picture servers are kept, so a stored address can never point the app anywhere else. */
export const avatarHostOk = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i.test(u.hostname);
  } catch {
    return false;
  }
};

/** Keeps the latest profile picture address. Returns true when it changed. */
export function setAvatar(conv: Conversation, url: unknown) {
  const u = typeof url === "string" ? url.trim() : "";
  if (!u || u.length > 2000 || !avatarHostOk(u) || conv.avatar === u) return false;
  conv.avatar = u;
  conv.avatarAt = new Date().toISOString();
  return true;
}

function goalUrlIn(db: Db, text: string) {
  const t = text.toLowerCase();
  return db.workspace.intake.goals.find((g) => g.url && t.includes(g.url.toLowerCase().replace(/\/$/, "")));
}

export interface IncomingMessage {
  direction: "in" | "out";
  sender?: Message["sender"];
  text: string;
  sentAt: string;
  source: MessageSource;
  externalId?: string;
  memberId?: string;
}

/**
 * Adds a message and applies the automatic stage rules.
 * live = it is happening now (webhook or sent from the app). Imports pass live false so history never fires Meta events.
 */
export function addMessage(db: Db, conv: Conversation, m: IncomingMessage, live: boolean): Message | null {
  const text = m.text.trim();
  if (!text) return null;
  const t = new Date(m.sentAt).getTime();
  const existing = db.messages.filter((x) => x.conversationId === conv.id);
  const dupe = existing.find(
    (x) =>
      (m.externalId && x.externalId === m.externalId) ||
      (x.direction === m.direction && x.text === text && Math.abs(new Date(x.sentAt).getTime() - t) < 90_000),
  );
  if (dupe) {
    if (m.externalId && !dupe.externalId) dupe.externalId = m.externalId;
    return null;
  }
  // Already moved to the Google Sheets archive: a fresh capture of old history must not add it back.
  if (conv.prunedUntil && m.sentAt <= conv.prunedUntil) return null;
  const msg: Message = {
    id: uid("m"), conversationId: conv.id, direction: m.direction,
    sender: m.sender ?? (m.direction === "in" ? "lead" : "owner"), text, sentAt: m.sentAt, source: m.source, externalId: m.externalId,
    ...(m.memberId ? { memberId: m.memberId } : {}),
  };
  db.messages.push(msg);
  sheetsTouch(db);

  if (t >= new Date(conv.lastMessageAt).getTime() || existing.length === 0) conv.lastMessageAt = m.sentAt;
  if (m.direction === "in" && (!conv.lastInboundAt || t > new Date(conv.lastInboundAt).getTime())) conv.lastInboundAt = m.sentAt;
  if (existing.length === 0 && m.direction === "out") conv.stage = "outbound";

  const hasOut = m.direction === "out" || existing.some((x) => x.direction === "out");
  const hasIn = m.direction === "in" || existing.some((x) => x.direction === "in");
  if (hasIn && hasOut && (conv.stage === "inbound" || conv.stage === "outbound")) {
    setStage(db, conv, "in_conversation", "system", undefined, { at: m.sentAt, live });
  }
  if (m.direction === "out") {
    noteTimesSent(db, conv, text, msg.sender === "ai" ? "ai" : msg.sender === "auto" ? "system" : "human", m.memberId);
    const goal = goalUrlIn(db, text) ?? calendarLinkIn(db.workspace, text);
    if (goal) {
      db.events.push({ id: uid("e"), conversationId: conv.id, type: "link_sent", detail: goal.label, by: msg.sender === "ai" ? "ai" : msg.sender === "auto" ? "system" : "human", ...(m.memberId ? { memberId: m.memberId } : {}), at: m.sentAt });
      if (pipelineOf(db.workspace.pipeline).rank(conv.stage) < pipelineOf(db.workspace.pipeline).rank("link_sent")) setStage(db, conv, "link_sent", "system", undefined, { at: m.sentAt, live });
    }
  }
  if (live && m.direction === "in") {
    conv.unread = true;
    conv.suggestion = null;
    if (conv.status === "done") conv.status = "open";
    conv.labels = conv.labels.filter((l) => l !== "Unresponsive");
    if (existing.length === 0) crmTouch(db, conv, "lead.created");
  }
  // The first person to reply by hand takes the lead, unless someone already has it.
  if (live && m.direction === "out" && m.memberId && !conv.assignedTo) conv.assignedTo = m.memberId;
  return msg;
}

export function setStage(
  db: Db,
  conv: Conversation,
  stage: StageId,
  by: Actor,
  reason?: string,
  opts: { at?: string; live?: boolean; memberId?: string } = {},
) {
  if (conv.stage === stage) return;
  const live = opts.live ?? true;
  const prevStage = conv.stage;
  conv.stage = stage;
  if (reason) conv.lossReason = reason;
  const closed = ["won", "lost", "disqualified"];
  if (closed.includes(stage)) conv.status = "done";
  // Moved back out of a closed stage (a cancelled booking after Won, for example): the lead is open again.
  else if (conv.status === "done" && closed.includes(prevStage)) conv.status = "open";
  const ev = { id: uid("e"), conversationId: conv.id, type: "stage_changed" as const, stage, detail: reason, by, ...(opts.memberId ? { memberId: opts.memberId } : {}), at: opts.at ?? new Date().toISOString() } as Db["events"][number];
  db.events.push(ev);
  if (!live) return;
  queueLabelSync(db, conv);
  crmTouch(db, conv, "lead.stage_changed");
  sendStageEvent(db.workspace, conv, pipelineOf(db.workspace.pipeline).stage(stage))
    .then((r) => {
      ev.capi = r;
      saveDb();
    })
    .catch(() => {});
}

export function setLabels(db: Db, conv: Conversation, labels: string[], by: Actor, memberId?: string) {
  const next = [...new Set(labels)];
  const added = next.filter((l) => !conv.labels.includes(l));
  conv.labels = next;
  for (const l of added) db.events.push({ id: uid("e"), conversationId: conv.id, type: "label_added", detail: l, by, ...(memberId ? { memberId } : {}), at: new Date().toISOString() });
  queueLabelSync(db, conv);
  crmTouch(db, conv);
}

/** Labels shown in Meta Business Suite: the stage plus every tag. */
export function metaLabelsFor(db: Db, conv: Conversation) {
  return [pipelineOf(db.workspace.pipeline).stage(conv.stage).name, ...conv.labels];
}

export function queueLabelSync(db: Db, conv: Conversation) {
  const labels = metaLabelsFor(db, conv);
  const ws = db.workspace;
  if (conv.platform === "messenger" && ws.meta.page && conv.scopedUserId && ws.meta.mirrorMessengerLabels) {
    applyMessengerLabels(ws, conv.scopedUserId, labels).catch(() => enqueue());
    return;
  }
  enqueue();
  function enqueue() {
    db.labelQueue = db.labelQueue.filter((q) => !(q.conversationId === conv.id && q.status === "pending"));
    db.labelQueue.push({
      id: uid("lq"), conversationId: conv.id, platform: conv.platform, name: conv.name, handle: conv.handle,
      externalId: conv.externalId, labels, status: "pending", createdAt: new Date().toISOString(),
    });
    if (db.labelQueue.length > 500) db.labelQueue = db.labelQueue.slice(-500);
  }
}

const AI_SETTABLE: StageId[] = ["in_conversation", "business_model_sent", "qualified", "disqualified", "nurture"];

/** Applies the AI's own tagging: stage (within the stages it is allowed to set), labels and lead details. */
export function applyAiTagging(db: Db, conv: Conversation, s: Suggestion, lead?: Conversation["lead"], summary?: { text: string; nextStep: string }) {
  const pipe = pipelineOf(db.workspace.pipeline);
  if (AI_SETTABLE.includes(s.stage) && s.stage !== conv.stage && (EARLY_STAGES.includes(conv.stage) || conv.stage === "nurture")) {
    const forward = pipe.rank(s.stage) > pipe.rank(conv.stage) || s.stage === "in_conversation";
    if (forward) setStage(db, conv, s.stage, "ai", s.stage === "disqualified" || s.stage === "nurture" ? s.reason : undefined);
  }
  // Close friend is the owner's call alone: the AI can never set it.
  // The model sometimes writes a tag with its group in front ("Temperature: Warm"): keep the tag itself.
  const named = s.labels.map((l) => (pipe.allTags.includes(l) ? l : l.includes(": ") ? l.slice(l.lastIndexOf(": ") + 2) : l));
  const valid = named.filter((l) => pipe.allTags.includes(l) && l !== CLOSE_FRIEND);
  const exclusive = ["Temperature"];
  let next = [...conv.labels];
  for (const l of valid) {
    const grp = pipe.groups.find((g) => g.labels.includes(l));
    if (grp && exclusive.includes(grp.group)) next = next.filter((x) => !grp.labels.includes(x));
    if (!next.includes(l)) next.push(l);
  }
  // A question the AI cannot answer is parked for a person; their answer is learned for next time.
  if (s.gap) flagGap(db, conv, s.gap);
  for (const id of s.usedKnowledge ?? []) {
    const item = db.workspace.knowledge.items.find((i) => i.id === id);
    if (item) item.used++;
  }
  if (s.needsHuman && !next.includes("Needs human")) next.push("Needs human");
  if (next.join("|") !== conv.labels.join("|")) setLabels(db, conv, next, "ai");
  if (lead) {
    for (const [k, v] of Object.entries(lead)) {
      if (v == null || (Array.isArray(v) && !v.length) || v === "") continue;
      (conv.lead as Record<string, unknown>)[k] = Array.isArray(v) ? [...new Set([...(conv.lead.objections ?? []), ...v])] : v;
    }
  }
  if (summary) {
    conv.summary = { ...summary, updatedAt: new Date().toISOString(), engine: "claude", messageCount: db.messages.filter((m) => m.conversationId === conv.id).length };
  }
  if (lead || summary) crmTouch(db, conv);
}

/** Takes a thread off hold once the question it was waiting on has an answer. */
export function releaseHold(db: Db, conv: Conversation) {
  conv.gapId = null;
  if (conv.labels.includes("Needs human")) setLabels(db, conv, conv.labels.filter((l) => l !== "Needs human"), "system");
}

export function canAutopilot(db: Db, conv: Conversation, s: Suggestion): { ok: boolean; why: string } {
  const ws = db.workspace;
  if (!ws.settings.autopilotMaster) return { ok: false, why: "Autopilot is switched off" };
  if (conv.aiMode === "off") return { ok: false, why: "AI is off for this conversation" };
  if (s.needsHuman) return { ok: false, why: "AI asked for a human: " + s.reason };
  if (conv.labels.includes("Do not contact")) return { ok: false, why: "Marked do not contact" };
  if (isCloseFriend(conv)) return { ok: false, why: "Tagged Close friend" };
  if (!EARLY_STAGES.includes(conv.stage) && conv.stage !== "link_sent") return { ok: false, why: "Stage is past the setter's remit" };
  const via = sendVia(db, conv);
  if (via === "none") return { ok: false, why: "This thread cannot be sent to yet" };
  if (via === "meta" && !windowState(conv.lastInboundAt).open) return { ok: false, why: "Outside Meta's 24 hour window" };
  if (s.engine !== "claude") return { ok: false, why: "Demo engine never sends automatically" };
  return { ok: true, why: "" };
}

/** How long a person takes to type this: 38 to 55 words a minute, never under a second or over 25. */
export function typingMs(text: string) {
  const wpm = 38 + Math.random() * 17;
  return Math.round(Math.min(25000, Math.max(1000, (text.length / 5 / wpm) * 60000 * (0.85 + Math.random() * 0.3))));
}

/** How long a person takes to notice and read a message before they start a reply. */
export function readingMs(text: string) {
  return Math.round(Math.min(20000, 1500 + text.length * 45 * (0.7 + Math.random() * 0.6)));
}

/** Sends bubbles through the official API and records them. Throws with Meta's message on failure. */
/**
 * How a message on this thread goes out. meta: the official connection. helper: typed by the helper in Chrome.
 * none: neither can reach it, and why.
 */
export function sendVia(db: Db, conv: Conversation): "meta" | "helper" | "none" {
  const ws = db.workspace;
  // Meta takes an app's message only within 24 hours of the lead's last one, unless the app is approved for the
  // Human Agent tag. Outside that, a reply goes through the helper when there is one.
  if (conv.scopedUserId && (conv.platform === "instagram" ? ws.meta.instagram : ws.meta.page) && (windowState(conv.lastInboundAt).open || humanAgentApproved())) return "meta";
  if (conv.platform === "instagram" && conv.handle && ws.helper) return "helper";
  return "none";
}

/** Why a thread cannot be sent to from the app, in words for the person who tried. */
/** Set META_HUMAN_AGENT=approved once Meta has approved the app for the Human Agent tag (App Review). */
export const humanAgentApproved = () => process.env.META_HUMAN_AGENT === "approved";

export function cannotSend(db: Db, conv: Conversation) {
  if (conv.scopedUserId && db.workspace.meta.instagram && !windowState(conv.lastInboundAt).open) {
    return "It is more than 24 hours since their last message, and Meta only lets apps reply within 24 hours. Reply in Instagram, or switch on the Chrome helper to send it from here.";
  }
  if (conv.platform !== "instagram") return "Connect the Facebook Page on Get connected to reply to Messenger threads from here.";
  if (!db.workspace.helper) return "Add the Ainable Setter Helper to Chrome on Get connected. It sends your replies for free.";
  return "This thread has no Instagram username yet. Open it once in Instagram with the helper on, then send again.";
}

/** Tagged Close friend by the owner: the AI and every automation leave this lead alone. */
export const isCloseFriend = (conv: Conversation) => conv.labels.includes(CLOSE_FRIEND);

export async function deliver(db: Db, conv: Conversation, bubbles: string[], sender: "owner" | "ai" | "auto", memberId?: string) {
  const ws = db.workspace;
  // The last gate every automatic message passes: whatever sent it, a close friend only hears from a person.
  if (sender !== "owner" && isCloseFriend(conv)) throw new Error("Tagged Close friend: nothing automatic messages them. Remove the tag to change that.");
  if (sendVia(db, conv) === "none") throw new Error(cannotSend(db, conv));
  const firstAi = sender === "ai" && !db.messages.some((m) => m.conversationId === conv.id && m.sender === "ai");
  const out = firstAi && ws.settings.disclosure.trim() ? [ws.settings.disclosure.trim(), ...bubbles] : bubbles;
  const sent: Message[] = [];
  // Without the Meta connection the helper types it into the thread in the owner's Chrome, which costs nothing.
  if (sendVia(db, conv) === "helper") {
    if (ws.outreach.settings.paused) throw new Error(`Sending from Chrome is paused. ${ws.outreach.settings.pauseReason}`);
    for (const text of out) {
      const m = addMessage(db, conv, { direction: "out", sender, text, sentAt: new Date().toISOString(), source: "app", memberId }, true);
      if (m) { m.delivery = "queued"; sent.push(m); }
    }
    queueReply(db, { conversationId: conv.id, handle: conv.handle!, messages: sent.map((m) => ({ id: m.id, text: m.text })) });
    conv.unread = false;
    conv.suggestion = null;
    saveDb();
    return sent;
  }
  const windowOpen = windowState(conv.lastInboundAt).open;
  if (!windowOpen && sender !== "owner") throw new Error("Outside Meta's 24 hour window. Only a person can send this.");
  const human = sender === "ai" && ws.settings.humanTiming !== false && !process.env.SETTER_NO_HUMAN_TIMING;
  for (let i = 0; i < out.length; i++) {
    if (human) {
      // Show the typing bubble for about as long as a person would take to type this.
      await sendTyping(ws, conv);
      await new Promise((r) => setTimeout(r, typingMs(out[i])));
    }
    const res = await sendMessage(ws, conv, out[i], !windowOpen && humanAgentApproved());
    const m = addMessage(db, conv, { direction: "out", sender, text: out[i], sentAt: new Date().toISOString(), source: "app", externalId: res?.message_id, memberId }, true);
    if (m) sent.push(m);
    if (i < out.length - 1) await new Promise((r) => setTimeout(r, human ? 600 + Math.random() * 1800 : 1200 + Math.min(4000, out[i + 1].length * 40)));
  }
  conv.unread = false;
  conv.suggestion = null;
  saveDb();
  return sent;
}

/**
 * Pulls recent threads from the Conversations API and stores anything new.
 * Messages newer than the connection time count as live, so the AI can respond to them.
 * This is what keeps the inbox current when webhooks are not reachable (for example on a laptop with no public address).
 */
export async function syncInstagram(db: Db, opts: { full: boolean; after?: string }) {
  const ig = db.workspace.meta.instagram;
  if (!ig) throw new Error("Instagram is not connected.");
  // A light sync reads the newest page. A backfill reads one page from the saved cursor; backfillInstagram loops it.
  const { threads, after } = await fetchInstagramThreads(db.workspace, { after: opts.full ? opts.after : undefined });
  const since = new Date(ig.connectedAt).getTime();
  let added = 0;
  const fresh: Conversation[] = [];
  for (const t of threads) {
    if (!t.messages.length) continue;
    const ordered = [...t.messages].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const conv = await identifyInstagram(db, t.participantId, { username: t.participantName, at: new Date(ordered[0].at).toISOString() });
    if (conv.name.startsWith("Instagram user ") && t.participantName) conv.name = t.participantName;
    for (const m of ordered) {
      const at = new Date(m.at);
      const live = !opts.full && at.getTime() > since;
      const msg = addMessage(db, conv, { direction: m.fromMe ? "out" : "in", text: m.text, sentAt: at.toISOString(), source: live ? "webhook" : "api_backfill", externalId: m.id }, live);
      if (!msg) continue;
      added++;
      if (live && !m.fromMe && !fresh.includes(conv)) fresh.push(conv);
    }
  }
  // Pictures for threads that have none, or whose address is old enough to have expired. A few per sync.
  const stale = Date.now() - 3 * 864e5;
  const faces = db.conversations.filter((c) => c.platform === "instagram" && c.scopedUserId && (!c.avatarAt || new Date(c.avatarAt).getTime() < stale)).slice(0, 30);
  for (const c of faces) {
    const pic = await fetchProfilePic(db.workspace, c.scopedUserId!);
    if (!setAvatar(c, pic)) c.avatarAt = new Date().toISOString(); // tried: not again for three days
  }
  saveDb();
  return { threads: threads.length, added, fresh, after };
}

/**
 * Reads past chats a page at a time until the history ends or the time budget runs out, saving after every page.
 * Where it stopped is kept on the connection, so the next call (the inbox's 20 second check, the daily job or the
 * button) carries on from there instead of starting again. Returns true once every page has been read.
 */
export async function backfillInstagram(db: Db, budgetMs: number) {
  const ig = db.workspace.meta.instagram;
  if (!ig || ig.backfillDone) return { done: true, threads: 0, added: 0 };
  const stop = Date.now() + budgetMs;
  let threads = 0, added = 0;
  do {
    const r = await syncInstagram(db, { full: true, after: ig.backfillAfter || undefined });
    threads += r.threads;
    added += r.added;
    ig.backfillAfter = r.after ?? "";
    if (!r.after) ig.backfillDone = true;
    saveDb();
    await flushNow();
  } while (!ig.backfillDone && Date.now() < stop);
  return { done: Boolean(ig.backfillDone), threads, added };
}

/** What a shortcut or keyword reply can fill in for this lead. */
export function fillContext(db: Db, conv: Conversation): FillContext {
  const ws = db.workspace;
  return {
    name: conv.name, handle: conv.handle, lead: conv.lead, stage: pipelineOf(ws.pipeline).stage(conv.stage).name,
    myName: ws.intake.ownerName, business: ws.intake.businessName, goals: ws.intake.goals, shortcuts: ws.shortcuts,
  };
}

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The keyword trigger, if any, that this inbound message sets off. */
export function matchTrigger(db: Db, conv: Conversation, text: string): KeywordTrigger | null {
  const t = text.trim().toLowerCase().replace(/[.!?,]+$/, "");
  for (const trig of db.workspace.triggers) {
    if (!trig.enabled || !trig.text.trim()) continue;
    if (trig.once && conv.firedTriggers?.includes(trig.id)) continue;
    for (const raw of trig.keywords) {
      const k = raw.trim().toLowerCase();
      if (!k) continue;
      if (trig.match === "exact" ? t === k : new RegExp(`(^|[^a-z0-9])${esc(k)}([^a-z0-9]|$)`).test(t)) return trig;
    }
  }
  return null;
}

/**
 * Sends a keyword trigger's reply straight away. It is the owner's own rule, so it does not wait for autopilot,
 * but it still respects Do not contact. Returns true when the reply went out.
 */
export async function fireTrigger(db: Db, conv: Conversation, trig: KeywordTrigger): Promise<boolean> {
  if (conv.labels.includes("Do not contact") || isCloseFriend(conv)) return false;
  const bubbles = bubblesOf(expand(trig.text, fillContext(db, conv)).text);
  if (!bubbles.length) return false;
  if (conv.externalId.startsWith("demo_")) {
    for (const text of bubbles) addMessage(db, conv, { direction: "out", sender: "auto", text, sentAt: new Date().toISOString(), source: "app" }, true);
    conv.unread = false;
  } else {
    await deliver(db, conv, bubbles, "auto");
  }
  (conv.firedTriggers ??= []).push(trig.id);
  trig.fired = (trig.fired ?? 0) + 1;
  db.events.push({ id: uid("e"), conversationId: conv.id, type: "trigger_fired", detail: trig.name, by: "system", at: new Date().toISOString() });
  const allowed = pipelineOf(db.workspace.pipeline).allTags;
  const tags = trig.addTags.filter((t) => allowed.includes(t) && !conv.labels.includes(t));
  if (tags.length) setLabels(db, conv, [...conv.labels, ...tags], "system");
  if (trig.aiAfter !== "keep") conv.aiMode = trig.aiAfter;
  saveDb();
  return true;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Validates keyword triggers sent from the browser. Throws with a message the owner can act on. */
export function cleanTriggers(input: unknown, previous: KeywordTrigger[]): KeywordTrigger[] {
  if (!Array.isArray(input)) throw new Error("Triggers must be a list.");
  if (input.length > 50) throw new Error("50 keyword triggers is the limit.");
  const seen = new Map<string, string>();
  return (input as Record<string, unknown>[]).map((r) => {
    const name = str(r.name, 50);
    const keywords = [...new Set((Array.isArray(r.keywords) ? r.keywords : String(r.keywords ?? "").split(",")).map((k: unknown) => str(k, 40).toLowerCase()).filter(Boolean))].slice(0, 20);
    const text = typeof r.text === "string" ? r.text.slice(0, 3000) : "";
    if (!keywords.length) throw new Error(`${name || "A trigger"} needs at least one keyword.`);
    if (!text.trim()) throw new Error(`${name || keywords[0]} has no message to send.`);
    for (const k of keywords) {
      if (seen.has(k)) throw new Error(`The keyword "${k}" is used by two triggers.`);
      seen.set(k, name);
    }
    const id = str(r.id, 40) || uid("kw");
    return {
      id, name: name || keywords[0].toUpperCase(), keywords, match: r.match === "contains" ? "contains" : "exact", text,
      addTags: Array.isArray(r.addTags) ? r.addTags.map((t: unknown) => str(t, 30)).filter(Boolean) : [],
      aiAfter: (["keep", "off", "suggest", "autopilot"] as const).includes(r.aiAfter as "keep") ? (r.aiAfter as KeywordTrigger["aiAfter"]) : "keep",
      once: r.once !== false, enabled: r.enabled !== false, fired: previous.find((p) => p.id === id)?.fired ?? 0,
    };
  });
}
