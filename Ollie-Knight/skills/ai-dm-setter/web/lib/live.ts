import type { Conversation, Db } from "./types";
import { distilAnswer, suggestReply } from "./ai";
import { applyAiTagging, canAutopilot, deliver, fireTrigger, isCloseFriend, matchTrigger, readingMs, releaseHold } from "./engine";
import { learnFromReply, reopen, waitingOn } from "./knowledge";
import type { KnowledgeGap, KnowledgeItem } from "./types";
import { flushNow, freshDb, saveDb } from "./store";
import { background, sleep } from "./hosted";

/**
 * Called after a real inbound message. Waits briefly so a burst of messages gets one reply,
 * then drafts, tags, and either sends (autopilot, all checks passing) or leaves the draft for the owner.
 * The wait runs after the response has gone (on Vercel too). When it ends, the turn only goes ahead if no
 * newer message arrived meanwhile: that message started its own wait and takes the turn.
 */
export function onInbound(db: Db, conv: Conversation, text = "") {
  // Nothing answers by itself unless Autopilot (top of the inbox) is on. Off, a person replies, and the AI only drafts when asked.
  if (!db.workspace.settings.autopilotMaster) return;
  // A close friend only ever hears from a person: no trigger, no AI turn, no cost.
  if (isCloseFriend(conv)) return;
  // A keyword trigger answers at once and takes this turn, so the AI does not also reply to the keyword.
  const trig = text ? matchTrigger(db, conv, text) : null;
  if (trig) {
    fireTrigger(db, conv, trig).catch((e) => console.error("Keyword trigger failed", (e as Error).message));
    return;
  }
  if (conv.aiMode === "off") return;
  // The set delay lets a burst of messages land; on top of it comes the time a person needs to read what was sent.
  const delay = Math.max(5, db.workspace.settings.replyDelaySeconds) * 1000 + (db.workspace.settings.humanTiming !== false ? readingMs(text) : 0);
  const id = conv.id;
  const stamp = conv.lastInboundAt;
  background(async () => {
    await sleep(delay);
    const now = await freshDb();
    const c = now.conversations.find((x) => x.id === id);
    if (!c || c.lastInboundAt !== stamp || c.aiMode === "off" || isCloseFriend(c)) return;
    await aiTurn(now, c);
    saveDb();
    await flushNow();
  });
}

/** One AI turn: draft, tag, then send (autopilot, all checks passing) or leave the draft for a person. */
export async function aiTurn(db: Db, conv: Conversation) {
  if (isCloseFriend(conv)) return;
  try {
    const { suggestion, lead, summary } = await suggestReply(db, conv);
    applyAiTagging(db, conv, suggestion, lead, summary);
    const gate = canAutopilot(db, conv, suggestion);
    if (gate.ok && suggestion.bubbles.length) {
      // Kept on the conversation while it sends, so any calendar times it offers are remembered.
      conv.suggestion = suggestion;
      await deliver(db, conv, suggestion.bubbles, "ai");
    } else {
      conv.suggestion = conv.aiMode === "autopilot" && !gate.ok ? { ...suggestion, reason: `${suggestion.reason} Not sent automatically: ${gate.why}.` } : suggestion;
    }
  } catch (e) {
    conv.suggestion = null;
    console.error("AI turn failed", (e as Error).message);
  }
}

const learning = ((globalThis as unknown as { __setterLearning?: Map<string, number> }).__setterLearning ??= new Map());

/**
 * A question now has an answer. The answer is tidied into a reusable one, then every other conversation that was
 * held on the same question gets its AI turn, this time with the answer to hand.
 * distil is false for answers typed on the knowledge screen, which are already written to be reused.
 */
export async function onAnswered(db: Db, gap: KnowledgeGap, item: KnowledgeItem, distil: boolean) {
  if (distil && item.raw) {
    const d = await distilAnswer(db.workspace, gap, item.raw);
    if (!d.reusable) {
      // "let me check" is not an answer: the question goes back in the queue and nobody is released.
      reopen(db, gap, item);
      saveDb();
      return;
    }
    Object.assign(item, { question: d.question, answer: d.answer, kind: d.kind, updatedAt: new Date().toISOString() });
  }
  for (const conv of waitingOn(db, gap)) {
    releaseHold(db, conv);
    const last = db.messages.filter((m) => m.conversationId === conv.id).reduce<(typeof db.messages)[number] | null>((a, m) => (!a || m.sentAt > a.sentAt ? m : a), null);
    conv.suggestion = null;
    if (conv.aiMode !== "off" && last?.direction === "in") await aiTurn(db, conv);
  }
  saveDb();
}

/**
 * A person replied on this thread. If it was waiting on a question the AI could not answer, the reply is learned.
 * wait lets a burst of messages typed in the Instagram app land before the answer is tidied and reused.
 */
export function onHumanReply(db: Db, conv: Conversation, text: string, memberId: string | undefined, waitMs = 0) {
  const got = learnFromReply(db, conv, text, memberId);
  if (!got) return null;
  releaseHold(db, conv);
  const go = () => onAnswered(db, got.gap, got.item, true).then(() => flushNow()).catch((e) => console.error("Learning the answer failed", (e as Error).message));
  if (!waitMs) {
    background(go);
    return got;
  }
  // A later reply on the same question restarts the wait; only the last wait does the work.
  const turn = (learning.get(got.item.id) ?? 0) + 1;
  learning.set(got.item.id, turn);
  background(async () => {
    await sleep(waitMs);
    if (learning.get(got.item.id) !== turn) return;
    learning.delete(got.item.id);
    await go();
  });
  return got;
}
