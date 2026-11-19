import { randomUUID } from "crypto";
import type { Conversation, Db, InboxSweep, Message, SweepLogEntry } from "./types";
import { canAutopilot, humanAgentApproved, isCloseFriend, sendVia } from "./engine";
import { EARLY_STAGES, windowState } from "./pipeline";
import { aiTurn } from "./live";
import { background } from "./hosted";
import { suiteRoom } from "./outreach";
import { flushNow, freshDb, saveDb } from "./store";

/*
 * The inbox sweep. With Autopilot on, it works through the inbox a batch at a time:
 *  - a chat whose last message is the lead's and has no answer gets its reply,
 *  - a chat where the lead has gone quiet gets one follow up, shortly before Meta's 24 hour window closes.
 * It only ever sends through Meta's official connection, and only inside that window. A chat Meta cannot reach is
 * left alone and counted in the reach breakdown (sweepStatus), never handed to the Chrome helper.
 * The clock is /api/cron/tick, once a minute from a timer inside the database, so it needs no open screen, no
 * helper and no terminal. Every send still passes the same checks as any Autopilot reply (canAutopilot in engine.ts).
 */

export const SWEEP_DEFAULTS: InboxSweep = { answerWaiting: false, followUp: false, followUpHours: 24, followUpMax: 1, gapMinutes: 1, batchSize: 6, maxAgeDays: 90 };

/** One follow up per silence, whatever was saved before. */
const FOLLOW_UP_MAX = 1;
/** Activity lines kept on the workspace. */
export const SWEEP_LOG_MAX = 300;
/**
 * How a batch is paced. parallel: chats written at once. budgetMs: the time one background job has. turnMs: the
 * room one chat needs (the AI writes, then the typing pause), so no chat starts with less than that left.
 * busyMs: how long a batch holds the turn if its server dies before letting go.
 */
export const SWEEP_LIMITS = { parallel: 4, budgetMs: 45_000, turnMs: 30_000, busyMs: 120_000 };

const HOUR = 3600_000;
const MIN = 60_000;
const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);
const iso = (t: number) => new Date(t).toISOString();
const short = (s: string, max = 140) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > max ? t.slice(0, max - 3).trimEnd() + "..." : t; };

export const sweepSettings = (db: Db): InboxSweep => ({ ...SWEEP_DEFAULTS, ...db.workspace.settings.inboxSweep, followUpMax: FOLLOW_UP_MAX });

export function cleanSweep(input: unknown, prev: InboxSweep): InboxSweep {
  const b = (input ?? {}) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : d);
  return {
    answerWaiting: typeof b.answerWaiting === "boolean" ? b.answerWaiting : prev.answerWaiting,
    followUp: typeof b.followUp === "boolean" ? b.followUp : prev.followUp,
    followUpHours: num(b.followUpHours, 1, 24 * 30, prev.followUpHours),
    followUpMax: FOLLOW_UP_MAX,
    gapMinutes: num(b.gapMinutes, 0, 240, prev.gapMinutes),
    batchSize: num(b.batchSize, 1, 12, prev.batchSize ?? SWEEP_DEFAULTS.batchSize!),
    maxAgeDays: num(b.maxAgeDays, 0, 3650, prev.maxAgeDays),
    // The sweep's own marks are never taken from the browser.
    lastAt: prev.lastAt, busyUntil: prev.busyUntil, busyBy: prev.busyBy, checkedAt: prev.checkedAt,
  };
}

/* ---------- who can be reached ---------- */

export type ReachKey = "closeFriend" | "doNotContact" | "aiOff" | "needsHuman" | "lateStage" | "notConnected" | "noMetaId" | "noInbound" | "windowClosed" | "other";

/** Why Autopilot cannot message a chat right now, in words for the owner. The order is the order they are checked in. */
export const REACH_REASONS: { key: ReachKey; label: string; help: string }[] = [
  { key: "closeFriend", label: "Close friend", help: "Tagged Close friend, so nothing automatic messages them." },
  { key: "doNotContact", label: "Do not contact", help: "Tagged Do not contact." },
  { key: "aiOff", label: "AI off", help: "The AI is switched off for this chat." },
  { key: "needsHuman", label: "Needs human", help: "Waiting for a person to answer. Autopilot starts again once the tag is removed." },
  { key: "lateStage", label: "Late stage", help: "Past Link sent (booked, won, lost and so on), where a person takes over." },
  { key: "notConnected", label: "Meta not connected", help: "The account for this chat is not connected through Meta on Get connected." },
  { key: "noMetaId", label: "No Meta id", help: "Meta has not shared this chat with the app yet. It does once the lead messages after the account was connected." },
  { key: "noInbound", label: "They have not messaged", help: "The lead has never written. Meta only lets an app reply to someone who messaged first." },
  { key: "windowClosed", label: "24 hour window closed", help: "More than 24 hours since their last message. Meta only lets an app reply inside 24 hours." },
  { key: "other", label: "Cannot be sent through Meta", help: "Meta's connection cannot send to this chat." },
];

/** The first reason Autopilot cannot message this chat through Meta now, or null when it can. */
export function reachOf(db: Db, conv: Conversation, now = Date.now()): ReachKey | null {
  if (isCloseFriend(conv)) return "closeFriend";
  if (conv.labels.includes("Do not contact")) return "doNotContact";
  if (conv.aiMode === "off") return "aiOff";
  if (conv.labels.includes("Needs human")) return "needsHuman";
  if (!EARLY_STAGES.includes(conv.stage) && conv.stage !== "link_sent") return "lateStage";
  // Outside Meta's reach (window closed however long ago, never replied, no Meta id): the helper sends it inside
  // Meta Business Suite when the owner has switched that on. No age limit.
  if (sendVia(db, conv) === "suite") return null;
  if (!(conv.platform === "instagram" ? db.workspace.meta.instagram : db.workspace.meta.page)) return "notConnected";
  if (!conv.scopedUserId) return "noMetaId";
  if (!conv.lastInboundAt) return "noInbound";
  if (!windowState(conv.lastInboundAt, now).open) return "windowClosed";
  // Meta only: a chat that would go any other way (the Chrome helper) is not the sweep's to send.
  if (sendVia(db, conv) !== "meta") return "other";
  return null;
}

/* ---------- what is due ---------- */

type Kind = "answer" | "followUp";
type Route = "meta" | "suite";
type Due = { conv: Conversation; kind: Kind; quietHours: number; via: Route };

function lastMessages(db: Db) {
  const last = new Map<string, Message>();
  for (const m of db.messages) {
    const cur = last.get(m.conversationId);
    if (!cur || m.sentAt > cur.sentAt) last.set(m.conversationId, m);
  }
  return last;
}

function lastMessageOf(db: Db, id: string) {
  let last: Message | null = null;
  for (const m of db.messages) if (m.conversationId === id && (!last || m.sentAt > last.sentAt)) last = m;
  return last;
}

/** Follow ups counted in f for the silence the lead is in now. The count starts again when the lead writes. */
const countFor = (conv: Conversation, f: Conversation["followUp"] | null) => (f && f.anchor === conv.lastInboundAt ? f.count : 0);
const followUpsDone = (conv: Conversation) => countFor(conv, conv.followUp);

/** What a reachable chat is due, if anything. done is the follow ups already counted for this silence. */
const routeOf = (db: Db, conv: Conversation): Route => (sendVia(db, conv) === "suite" ? "suite" : "meta");

function dueKind(conv: Conversation, m: Message, s: InboxSweep, now: number, done: number, via: Route = "meta"): Kind | null {
  const quiet = (now - ms(m.sentAt)) / HOUR;
  if (s.maxAgeDays && quiet > s.maxAgeDays * 24) return null;
  if (m.direction === "in") {
    // Ten minutes, so a message that has just arrived is left to the normal reply.
    return s.answerWaiting && quiet > 1 / 6 ? "answer" : null;
  }
  if (!s.followUp || m.delivery === "queued" || m.delivery === "failed") return null;
  // Through Business Suite there is no window to race: one follow up per silence, once our last message has sat
  // unanswered for followUpHours.
  if (via === "suite") return quiet >= s.followUpHours && done < FOLLOW_UP_MAX ? "followUp" : null;
  // Meta takes an app's message only within 24 hours of the lead's last one. So the follow up goes while that
  // window is still open: in its last 4 hours, once our last message has sat unanswered for 3.
  const w = windowState(conv.lastInboundAt, now);
  if (!w.open || w.hoursLeft > 4 || quiet < 3) return null;
  return done < FOLLOW_UP_MAX ? "followUp" : null;
}

/** Taken by a run that is still working, or tried lately. */
function held(conv: Conversation, now: number) {
  if (conv.sweepClaim && now - ms(conv.sweepClaim.at) < SWEEP_LIMITS.busyMs) return true;
  if (!conv.sweepTriedAt) return false;
  // A try that failed with nothing sent comes round again after half an hour, up to three times. Anything else waits a day.
  const wait = conv.sweepFails && conv.sweepFails < 3 ? 30 * MIN : 24 * HOUR;
  return now - ms(conv.sweepTriedAt) < wait;
}

/** Chats the sweep would act on now, newest first. */
export function sweepDue(db: Db, now = Date.now()): Due[] {
  const s = sweepSettings(db);
  const last = lastMessages(db);
  const out: Due[] = [];
  for (const conv of db.conversations) {
    if (conv.externalId.startsWith("demo_") || held(conv, now) || reachOf(db, conv, now)) continue;
    const m = last.get(conv.id);
    const via = routeOf(db, conv);
    const kind = m ? dueKind(conv, m, s, now, followUpsDone(conv), via) : null;
    if (m && kind) out.push({ conv, kind, quietHours: (now - ms(m.sentAt)) / HOUR, via });
  }
  return out.sort((a, b) => a.quietHours - b.quietHours);
}

/* ---------- the clock ---------- */

function sendingHours(db: Db, now: number) {
  const o = db.workspace.outreach.settings;
  const timezone = o.timezone || "Europe/London";
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(new Date(now)));
  return { open: hour >= o.hourStart && hour < o.hourEnd, start: o.hourStart, end: o.hourEnd, timezone };
}

/** The date in the sending timezone, as YYYY-MM-DD. */
function dayOf(db: Db, now: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: sendingHours(db, now).timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

export type SweepState = "off" | "outsideHours" | "running" | "pausing" | "ready";

/** Whether a batch could start now, and if not, why. */
export function sweepState(db: Db, now = Date.now()): { state: SweepState; note: string } {
  const s = sweepSettings(db);
  if (!db.workspace.settings.autopilotMaster) return { state: "off", note: "Autopilot is off." };
  if (!s.answerWaiting && !s.followUp) return { state: "off", note: "Answer every waiting chat and Follow up when a lead goes quiet are both off in Settings." };
  if (s.busyUntil && ms(s.busyUntil) > now) return { state: "running", note: "A batch is being written and sent now." };
  const h = sendingHours(db, now);
  if (!h.open) return { state: "outsideHours", note: `Outside sending hours (${h.start}:00 to ${h.end}:00, ${h.timezone}).` };
  // Ten seconds of give, so a clock that ticks a moment early does not lose a whole minute.
  if (s.lastAt && now - ms(s.lastAt) < s.gapMinutes * MIN - 10_000) return { state: "pausing", note: `Pausing ${s.gapMinutes} ${s.gapMinutes === 1 ? "minute" : "minutes"} between batches.` };
  return { state: "ready", note: "Ready. The next batch starts on the next tick of the clock, once a minute." };
}

/**
 * One tick of the clock. Picks a batch, marks every chat in it, and starts the writing after the response has gone.
 * Safe to call often: it does nothing while a batch is running, between batches, or outside sending hours.
 */
export function sweepTick(db: Db, now = Date.now()) {
  const ws = db.workspace;
  const st = sweepState(db, now);
  if (st.state === "off") return false;
  const s = sweepSettings(db);
  // Proof for the owner that the clock is alive, saved rarely so an idle clock does not make every screen reload.
  if (!s.checkedAt || now - ms(s.checkedAt) >= 10 * MIN) {
    ws.settings.inboxSweep = { ...s, checkedAt: iso(now) };
    saveDb();
  }
  if (st.state !== "ready") return false;
  // Meta sends go as a batch. Business Suite sends are typed by the helper one a minute, so only as many are written
  // as its short queue has room for: more would only sit and go stale.
  const due = sweepDue(db, now);
  const picks = [...due.filter((d) => d.via === "meta").slice(0, s.batchSize ?? SWEEP_DEFAULTS.batchSize), ...due.filter((d) => d.via === "suite").slice(0, suiteRoom(db))];
  if (!picks.length) return false;
  // Claimed before the slow part, so another copy of the server leaves these chats and this turn alone.
  const runId = randomUUID().slice(0, 12);
  const at = iso(now);
  ws.settings.inboxSweep = { ...sweepSettings(db), lastAt: at, checkedAt: at, busyUntil: iso(now + SWEEP_LIMITS.busyMs), busyBy: runId };
  for (const { conv, kind } of picks) {
    conv.sweepClaim = { by: runId, at, kind, prev: conv.followUp ?? null, ...(conv.sweepFails ? { fails: conv.sweepFails } : {}) };
    // Marked as tried, and the follow up counted, before anything is written: a run that dies part way can then
    // never lead to a second answer or a second follow up.
    conv.sweepTriedAt = at;
    delete conv.sweepFails;
    if (kind === "followUp") conv.followUp = { count: followUpsDone(conv) + 1, at, anchor: conv.lastInboundAt };
  }
  saveDb();
  background(() => sweepRun(runId, picks.map((p) => p.conv.id)));
  return true;
}

/** Lets a chat go untouched: everything the claim changed is put back, so the next batch can take it. */
function release(conv: Conversation) {
  const claim = conv.sweepClaim;
  if (!claim) return;
  if (claim.kind === "followUp") {
    if (claim.prev) conv.followUp = claim.prev;
    else delete conv.followUp;
  }
  if (claim.fails) conv.sweepFails = claim.fails;
  delete conv.sweepTriedAt;
  delete conv.sweepClaim;
}

/** Writes and sends one batch. Runs after the response has gone. */
async function sweepRun(runId: string, ids: string[]) {
  const started = Date.now();
  // The claims reach the database before the AI is asked for anything.
  await flushNow();
  let db = await freshDb();
  const mine = (id: string) => db.conversations.find((c) => c.id === id && c.sweepClaim?.by === runId);
  if (sweepSettings(db).busyBy !== runId) {
    // Another copy of the server took the turn a moment later. It works its own batch; this one lets go.
    for (const id of ids) { const c = mine(id); if (c) release(c); }
    saveDb();
    await flushNow();
    return;
  }
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const conv = mine(id);
      if (!conv) continue;
      // Not enough of this job's time left for a whole chat: it goes back for the next batch.
      if (Date.now() - started > SWEEP_LIMITS.budgetMs - SWEEP_LIMITS.turnMs) release(conv);
      else await workChat(db, conv);
      saveDb();
    }
  };
  await Promise.all(Array.from({ length: Math.min(SWEEP_LIMITS.parallel, ids.length) }, worker));
  await flushNow();
  db = await freshDb();
  const s = sweepSettings(db);
  // Only the run that took the turn gives it back.
  if (s.busyBy === runId) {
    db.workspace.settings.inboxSweep = { ...s, busyUntil: undefined, busyBy: undefined };
    saveDb();
  }
  await flushNow();
}

const outgoing = (db: Db, id: string) => db.messages.filter((m) => m.conversationId === id && m.direction === "out");

/** One chat of a batch: checks it is still due, lets the AI write and send, then records what happened. */
async function workChat(db: Db, conv: Conversation) {
  const claim = conv.sweepClaim!;
  const id = conv.id, kind = claim.kind;
  const now = Date.now();
  const last = lastMessageOf(db, id);
  // Checked again on fresh data: the lead may have replied, a person may have answered, or the window may have closed.
  // The claim already counted a follow up, so that check uses the count from before the claim.
  const still = last && !reachOf(db, conv, now) ? dueKind(conv, last, sweepSettings(db), now, kind === "followUp" ? countFor(conv, claim.prev) : followUpsDone(conv), routeOf(db, conv)) : null;
  if (!last || still !== kind) return release(conv);
  const before = outgoing(db, id).length;
  let sent = false;
  try {
    sent = await aiTurn(db, conv, false, kind === "followUp" ? { followUpAfterHours: (now - ms(last.sentAt)) / HOUR } : {});
  } catch (e) {
    console.error("Inbox sweep: a chat failed", (e as Error).message);
    conv.suggestion = null;
  }
  // The working copy can swap a record for a newer one while the AI writes: the marks go on the one that will be saved.
  const cur = db.conversations.find((c) => c.id === id) ?? conv;
  const added = outgoing(db, id).slice(before);
  const sug = conv.suggestion;
  const at = iso(Date.now());
  let outcome: SweepLogEntry["outcome"], reason = "", text = "";
  if (sent) {
    outcome = "sent";
    // A Business Suite message is written and queued here; the helper sends it within a minute or so.
    if (added.some((m) => m.delivery === "queued")) reason = "Queued for Meta Business Suite";
    const disclosure = db.workspace.settings.disclosure.trim();
    text = short((added.find((m) => m.text !== disclosure) ?? added[0])?.text ?? "", 90);
    delete cur.sweepTriedAt;
    delete cur.sweepFails;
  } else if (sug && sug.engine === "claude") {
    // The AI or one of Autopilot's checks held it back. Not asked about again for a day, and a follow up stays counted.
    outcome = "skipped";
    const gate = canAutopilot(db, cur, sug);
    reason = sug.needsHuman ? `The AI asked for a person: ${sug.reason}` : !gate.ok ? gate.why : kind === "followUp" ? "The AI judged a follow up would not be welcome" : "The AI wrote nothing to send";
    cur.sweepTriedAt = at;
    // A follow up that was not sent is not left as a draft: it was never an answer to anything.
    if (kind === "followUp") cur.suggestion = null;
  } else {
    outcome = "failed";
    cur.sweepTriedAt = at;
    if (added.length) reason = "Stopped part way through sending";
    else {
      reason = sug ? `The AI did not write a reply. ${sug.reason.replace(" Showing a basic draft instead.", "")}` : "It could not be written or sent";
      // Nothing went, so the count goes back and the chat gets another try in half an hour (three at most).
      if (kind === "followUp") { if (claim.prev) cur.followUp = claim.prev; else delete cur.followUp; }
      cur.sweepFails = (claim.fails ?? 0) + 1;
    }
  }
  delete cur.sweepClaim;
  logLine(db, { at, conversationId: id, handle: cur.handle ?? "", name: short(cur.name, 60), kind, outcome, reason: short(reason), ...(text ? { text } : {}) });
}

function logLine(db: Db, e: SweepLogEntry) {
  const ws = db.workspace;
  const log = (ws.sweepLog ??= []);
  log.push(e);
  if (log.length > SWEEP_LOG_MAX) log.splice(0, log.length - SWEEP_LOG_MAX);
  const stats = (ws.sweepStats ??= { days: {} });
  stats.days ??= {};
  const day = dayOf(db, ms(e.at));
  const d = (stats.days[day] ??= { sent: 0, skipped: 0, failed: 0 });
  d[e.outcome]++;
  for (const k of Object.keys(stats.days).sort().slice(0, -14)) delete stats.days[k];
}

/* ---------- what the owner sees ---------- */

export interface SweepReach {
  /** Real chats looked at (demo chats are left out) */
  total: number;
  /** Chats Autopilot could message through Meta this minute */
  reachable: number;
  unreachable: number;
  /** Every reason with its count, in the order they are checked. Each chat is counted once, under its first reason. */
  reasons: { key: ReachKey; label: string; help: string; count: number }[];
  /** The chats under "24 hour window closed", by how long ago the lead last wrote */
  windowClosed: {
    count: number;
    buckets: { label: string; count: number }[];
    /** The ten closest to the window, with hours since their last message */
    nearest: { conversationId: string; name: string; handle: string; hours: number }[];
  };
  /**
   * Meta's Human Agent approval lets a person reply from the app for 7 days instead of 24 hours.
   * wouldUnlock: chats under "24 hour window closed" whose lead wrote in the last 7 days. Autopilot itself still
   * stops at 24 hours (engine.ts deliver), so these become reachable for a person, not for the AI.
   */
  humanAgent: { approved: boolean; days: number; wouldUnlock: number };
}

/** Every chat Autopilot cannot message now, by reason. */
export function sweepReach(db: Db, now = Date.now()): SweepReach {
  const counts = new Map<ReachKey, number>();
  const closed: SweepReach["windowClosed"]["nearest"] = [];
  let total = 0, reachable = 0;
  for (const conv of db.conversations) {
    if (conv.externalId.startsWith("demo_")) continue;
    total++;
    const why = reachOf(db, conv, now);
    if (!why) { reachable++; continue; }
    counts.set(why, (counts.get(why) ?? 0) + 1);
    if (why === "windowClosed") closed.push({ conversationId: conv.id, name: short(conv.name, 60), handle: conv.handle ?? "", hours: Math.round(((now - ms(conv.lastInboundAt)) / HOUR) * 10) / 10 });
  }
  closed.sort((a, b) => a.hours - b.hours);
  const between = (lo: number, hi: number) => closed.filter((c) => c.hours >= lo && c.hours < hi).length;
  return {
    total, reachable, unreachable: total - reachable,
    reasons: REACH_REASONS.map((r) => ({ ...r, count: counts.get(r.key) ?? 0 })),
    windowClosed: {
      count: closed.length,
      buckets: [
        { label: "24 to 48 hours ago", count: between(0, 48) },
        { label: "2 to 7 days ago", count: between(48, 7 * 24) },
        { label: "Over 7 days ago", count: between(7 * 24, Infinity) },
      ],
      nearest: closed.slice(0, 10),
    },
    humanAgent: { approved: humanAgentApproved(), days: 7, wouldUnlock: between(0, 7 * 24) },
  };
}

export interface SweepStatus {
  settings: InboxSweep;
  /** Autopilot's main switch */
  on: boolean;
  state: SweepState;
  note: string;
  /** Chats due now. waiting and followUps are the same two counts, kept for the Settings screen. */
  due: { answer: number; followUp: number; total: number };
  waiting: number;
  followUps: number;
  /** Chats messaged by the sweep */
  sent: { lastHour: number; today: number };
  today: { sent: number; skipped: number; failed: number };
  /** When the last batch started, and when the clock last looked (saved at most every 10 minutes) */
  lastAt: string;
  checkedAt: string;
  hours: { open: boolean; start: number; end: number; timezone: string };
  reach: SweepReach;
  /** Newest first */
  log: SweepLogEntry[];
}

/** Everything the owner needs to see that Autopilot is working. logMax trims the activity list. */
export function sweepStatus(db: Db, now = Date.now(), logMax = SWEEP_LOG_MAX): SweepStatus {
  const due = sweepDue(db, now);
  const s = sweepSettings(db);
  const answer = due.filter((d) => d.kind === "answer").length;
  const log = db.workspace.sweepLog ?? [];
  const day = db.workspace.sweepStats?.days?.[dayOf(db, now)];
  const today = { sent: day?.sent ?? 0, skipped: day?.skipped ?? 0, failed: day?.failed ?? 0 };
  return {
    settings: s,
    on: db.workspace.settings.autopilotMaster,
    ...sweepState(db, now),
    due: { answer, followUp: due.length - answer, total: due.length },
    waiting: answer,
    followUps: due.length - answer,
    sent: { lastHour: log.filter((e) => e.outcome === "sent" && now - ms(e.at) < HOUR).length, today: today.sent },
    today,
    lastAt: s.lastAt ?? "",
    checkedAt: s.checkedAt ?? "",
    hours: sendingHours(db, now),
    reach: sweepReach(db, now),
    log: log.slice(-Math.max(0, logMax)).reverse(),
  };
}
