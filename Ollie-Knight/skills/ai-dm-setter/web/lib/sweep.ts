import type { Conversation, Db, InboxSweep, Message } from "./types";
import { isCloseFriend, sendVia } from "./engine";
import { EARLY_STAGES } from "./pipeline";
import { aiTurn } from "./live";
import { pendingReplies } from "./outreach";
import { background } from "./hosted";
import { flushNow, freshDb, saveDb } from "./store";

/*
 * The inbox sweep. With Autopilot on, it works through the inbox one chat at a time:
 *  - a chat whose last message is the lead's and has no answer gets its reply,
 *  - a chat where the lead has gone quiet for a day gets one follow up.
 * It runs on the server each time the Chrome helper checks in (about every two minutes) and once a day from the
 * timed job, so it needs no open screen and no terminal. One chat per run, with a gap between sends, newest first.
 * Every send still passes the same checks as any Autopilot reply (canAutopilot in engine.ts).
 */

export const SWEEP_DEFAULTS: InboxSweep = { answerWaiting: false, followUp: false, followUpHours: 24, followUpMax: 1, gapMinutes: 4, maxAgeDays: 90 };

export const sweepSettings = (db: Db): InboxSweep => ({ ...SWEEP_DEFAULTS, ...db.workspace.settings.inboxSweep });

export function cleanSweep(input: unknown, prev: InboxSweep): InboxSweep {
  const b = (input ?? {}) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : d);
  return {
    answerWaiting: typeof b.answerWaiting === "boolean" ? b.answerWaiting : prev.answerWaiting,
    followUp: typeof b.followUp === "boolean" ? b.followUp : prev.followUp,
    followUpHours: num(b.followUpHours, 1, 24 * 30, prev.followUpHours),
    followUpMax: num(b.followUpMax, 1, 5, prev.followUpMax),
    gapMinutes: num(b.gapMinutes, 1, 240, prev.gapMinutes),
    maxAgeDays: num(b.maxAgeDays, 0, 3650, prev.maxAgeDays),
    lastAt: prev.lastAt, busyUntil: prev.busyUntil,
  };
}

const HOUR = 3600_000;
type Due = { conv: Conversation; kind: "answer" | "followUp"; quietHours: number };

function lastMessages(db: Db) {
  const last = new Map<string, Message>();
  for (const m of db.messages) {
    const cur = last.get(m.conversationId);
    if (!cur || m.sentAt > cur.sentAt) last.set(m.conversationId, m);
  }
  return last;
}

/** Chats the sweep would act on now, newest first. */
export function sweepDue(db: Db, now = Date.now()): Due[] {
  const s = sweepSettings(db);
  const last = lastMessages(db);
  const out: Due[] = [];
  for (const conv of db.conversations) {
    if (conv.aiMode === "off" || isCloseFriend(conv) || conv.labels.includes("Do not contact") || conv.labels.includes("Needs human")) continue;
    if (conv.externalId.startsWith("demo_")) continue;
    if (!EARLY_STAGES.includes(conv.stage) && conv.stage !== "link_sent") continue;
    if (conv.sweepTriedAt && now - new Date(conv.sweepTriedAt).getTime() < 24 * HOUR) continue;
    const m = last.get(conv.id);
    if (!m || sendVia(db, conv) === "none") continue;
    const quiet = (now - new Date(m.sentAt).getTime()) / HOUR;
    if (s.maxAgeDays && quiet > s.maxAgeDays * 24) continue;
    if (m.direction === "in") {
      // Ten minutes, so a message that has just arrived is left to the normal reply.
      if (s.answerWaiting && quiet > 1 / 6) out.push({ conv, kind: "answer", quietHours: quiet });
      continue;
    }
    if (!s.followUp || quiet < s.followUpHours || m.delivery === "queued" || m.delivery === "failed") continue;
    const done = conv.followUp && conv.followUp.anchor === conv.lastInboundAt ? conv.followUp.count : 0;
    if (done < s.followUpMax) out.push({ conv, kind: "followUp", quietHours: quiet });
  }
  return out.sort((a, b) => a.quietHours - b.quietHours);
}

/** Counts for the Settings screen. */
export function sweepStatus(db: Db) {
  const due = sweepDue(db);
  const s = sweepSettings(db);
  return { settings: s, on: db.workspace.settings.autopilotMaster, waiting: due.filter((d) => d.kind === "answer").length, followUps: due.filter((d) => d.kind === "followUp").length, lastAt: s.lastAt ?? "" };
}

function inSendingHours(db: Db, now: Date) {
  const o = db.workspace.outreach.settings;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: o.timezone || "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(now));
  return hour >= o.hourStart && hour < o.hourEnd;
}

/** One step of the sweep, started after the response has gone. Safe to call often: it does nothing until the gap has passed. */
export function sweepTick(db: Db) {
  const ws = db.workspace;
  if (!ws.settings.autopilotMaster) return false;
  const s = sweepSettings(db);
  if (!s.answerWaiting && !s.followUp) return false;
  const now = Date.now();
  if (s.busyUntil && new Date(s.busyUntil).getTime() > now) return false;
  if (s.lastAt && now - new Date(s.lastAt).getTime() < s.gapMinutes * 60_000) return false;
  if (!inSendingHours(db, new Date(now))) return false;
  // One at a time through Chrome: the next waits until the helper has sent the last.
  if (pendingReplies(db) > 0 || ws.outreach.settings.paused) return false;
  const next = sweepDue(db, now)[0];
  if (!next) return false;
  // Claimed before the slow part, so another copy of the server leaves this chat and this turn alone.
  ws.settings.inboxSweep = { ...s, lastAt: new Date(now).toISOString(), busyUntil: new Date(now + 120_000).toISOString() };
  next.conv.sweepTriedAt = new Date(now).toISOString();
  saveDb();
  const id = next.conv.id, kind = next.kind, quiet = next.quietHours;
  background(async () => {
    await flushNow();
    const fresh = await freshDb();
    const conv = fresh.conversations.find((c) => c.id === id);
    if (conv) {
      const anchor = conv.lastInboundAt;
      const sent = await aiTurn(fresh, conv, false, kind === "followUp" ? { followUpAfterHours: quiet } : {});
      if (sent) {
        delete conv.sweepTriedAt;
        if (kind === "followUp") conv.followUp = { count: (conv.followUp && conv.followUp.anchor === anchor ? conv.followUp.count : 0) + 1, at: new Date().toISOString(), anchor };
      } else if (kind === "followUp" && conv.suggestion?.engine === "claude") {
        // The AI judged a follow up unwelcome, or a check stopped it: counted, so this silence is not asked about again.
        conv.followUp = { count: sweepSettings(fresh).followUpMax, at: new Date().toISOString(), anchor };
        conv.suggestion = null;
      }
    }
    fresh.workspace.settings.inboxSweep = { ...sweepSettings(fresh), busyUntil: undefined };
    saveDb();
    await flushNow();
  });
  return true;
}
