import { randomUUID } from "crypto";
import type { Conversation, Db, Knowledge, KnowledgeGap, KnowledgeItem, KnowledgeKind, Workspace } from "./types";

// What the AI has been taught by hand. When a lead asks something the AI has no answer for, the question is
// parked here as a gap and the conversation is flagged for a person. The answer that person gives is kept as a
// knowledge item and goes into every later prompt, so the same question never needs a person twice.
// This file only changes data. Sending, tagging and Claude calls live in live.ts.

export const MAX_ITEMS = 400;
export const MAX_GAPS = 300;
/** Replies typed in a burst within this long count as one answer. */
const BURST_MS = 3 * 60_000;

const kid = (p: string) => `${p}_${randomUUID().slice(0, 12)}`;
const now = () => new Date().toISOString();
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const defaultKnowledge = (): Knowledge => ({ items: [], gaps: [] });

export function normaliseKnowledge(k?: Partial<Knowledge>): Knowledge {
  return { items: Array.isArray(k?.items) ? k.items : [], gaps: Array.isArray(k?.gaps) ? k.gaps : [] };
}

const STOP = new Set("a an the is are was were be been do does did you your yours i me my we our it its this that these those to of in on for with and or but so if as at by from have has had can could would will should what how when where why who which there any some just about get got into than then them they their am not no yes ok also really very much many more most please thanks thank hey hi hello".split(" "));

/** The words that carry a question's meaning, lightly stemmed, for telling whether two questions are the same one. */
export function keywords(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.toLowerCase().replace(/[^a-z0-9£$€% ]+/g, " ").split(/\s+/)) {
    if (w.length < 2 || STOP.has(w)) continue;
    out.add(w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w);
  }
  return out;
}

/** 0 to 1: how much two questions overlap in meaning carrying words. */
export function similarity(a: string, b: string) {
  const x = keywords(a);
  const y = keywords(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

export const openGap = (db: Db, conv: Conversation): KnowledgeGap | undefined =>
  conv.gapId ? db.workspace.knowledge.gaps.find((g) => g.id === conv.gapId && g.status === "open") : undefined;

/**
 * Parks a question the AI could not answer. The same question from another lead joins the existing entry
 * instead of making a new one, so one answer clears every conversation waiting on it.
 */
export function flagGap(db: Db, conv: Conversation, g: { question: string; kind: KnowledgeKind; quote: string; sameAs?: string }): KnowledgeGap {
  const k = db.workspace.knowledge;
  const question = str(g.question, 300) || str(g.quote, 300);
  const open = k.gaps.filter((x) => x.status === "open");
  let gap = (g.sameAs && open.find((x) => x.id === g.sameAs)) || open.find((x) => similarity(x.question, question) >= 0.6);
  const at = now();
  if (!gap) {
    gap = { id: kid("g"), kind: g.kind === "objection" ? "objection" : "question", question, quote: str(g.quote, 500), status: "open", conversationIds: [], askedAt: at, lastAskedAt: at };
    k.gaps.push(gap);
    if (k.gaps.length > MAX_GAPS) {
      // Closed entries go first; an open question is never dropped while a closed one remains.
      const drop = k.gaps.find((x) => x.status !== "open") ?? k.gaps[0];
      k.gaps.splice(k.gaps.indexOf(drop), 1);
    }
  }
  gap.lastAskedAt = at;
  if (!gap.conversationIds.includes(conv.id)) {
    gap.conversationIds.push(conv.id);
    db.events.push({ id: kid("e"), conversationId: conv.id, type: "question_flagged", detail: gap.question, by: "ai", at });
  }
  conv.gapId = gap.id;
  return gap;
}

function addItem(db: Db, x: Omit<KnowledgeItem, "id" | "enabled" | "used" | "createdAt" | "updatedAt">): KnowledgeItem | null {
  const k = db.workspace.knowledge;
  if (k.items.length >= MAX_ITEMS) return null;
  const at = now();
  const item: KnowledgeItem = { ...x, id: kid("k"), enabled: true, used: 0, createdAt: at, updatedAt: at };
  k.items.push(item);
  return item;
}

/** Conversations still held on this question. */
export const waitingOn = (db: Db, gap: KnowledgeGap) => db.conversations.filter((c) => c.gapId === gap.id);

/** Closes a gap with the answer a person typed on the knowledge screen. */
export function answerGap(db: Db, gapId: string, answer: string, memberId?: string, question?: string): { gap: KnowledgeGap; item: KnowledgeItem } {
  const gap = db.workspace.knowledge.gaps.find((g) => g.id === gapId);
  if (!gap) throw new Error("That question is no longer in the list.");
  const text = str(answer, 2000);
  if (!text) throw new Error("Write the answer first.");
  const item = addItem(db, { kind: gap.kind, question: str(question, 300) || gap.question, answer: text, source: "manual", gapId: gap.id, memberId });
  if (!item) throw new Error(`The knowledge base holds ${MAX_ITEMS} answers. Remove some first.`);
  close(db, gap, item);
  return { gap, item };
}

function close(db: Db, gap: KnowledgeGap, item: KnowledgeItem) {
  gap.status = "answered";
  gap.answeredAt = now();
  gap.knowledgeId = item.id;
}

/**
 * A person replied to a lead. If the thread was waiting on a question the AI could not answer, their reply is the
 * answer: it is stored against the question. Further messages sent straight after are added to the same answer.
 */
export function learnFromReply(db: Db, conv: Conversation, text: string, memberId?: string): { gap: KnowledgeGap; item: KnowledgeItem } | null {
  const k = db.workspace.knowledge;
  const reply = str(text, 2000);
  if (!reply) return null;
  const gap = openGap(db, conv);
  if (gap) {
    const item = addItem(db, { kind: gap.kind, question: gap.question, answer: reply, raw: reply, source: "reply", gapId: gap.id, conversationId: conv.id, memberId });
    if (!item) return null;
    close(db, gap, item);
    conv.gapId = null;
    db.events.push({ id: kid("e"), conversationId: conv.id, type: "answer_learned", detail: gap.question, by: "human", ...(memberId ? { memberId } : {}), at: now() });
    return { gap, item };
  }
  // No open question: this may be the second or third message of an answer just captured from this thread.
  const recent = k.items.find((i) => i.source === "reply" && i.conversationId === conv.id && i.raw === i.answer && Date.now() - new Date(i.createdAt).getTime() < BURST_MS);
  const g = recent && k.gaps.find((x) => x.id === recent.gapId);
  if (!recent || !g) return null;
  recent.answer = recent.raw = `${recent.raw}\n${reply}`.slice(0, 2000);
  recent.updatedAt = now();
  return { gap: g, item: recent };
}

/** The reply was not really an answer ("let me check"): forget it and put the question back in the queue. */
export function reopen(db: Db, gap: KnowledgeGap, item: KnowledgeItem) {
  const k = db.workspace.knowledge;
  k.items = k.items.filter((i) => i.id !== item.id);
  gap.status = "open";
  delete gap.answeredAt;
  delete gap.knowledgeId;
}

/** A holding line such as "let me check" answers nothing and must not be learned. */
export function looksLikeAnswer(text: string) {
  const t = text.trim();
  if (t.length < 12) return false;
  const holding = /^(good question[,.! ]*)?(let me (check|find out|look|get back|confirm|ask|see)|i'?ll (check|find out|get back|look|confirm|ask|come back|see)|i will (check|find out|get back|look|confirm|ask|come back)|one (sec|second|min|minute|moment)|give me a|gimme a|hang on|hold on|bear with)\b.{0,60}$/i;
  return !holding.test(t);
}

export function dismissGap(db: Db, gapId: string): KnowledgeGap {
  const gap = db.workspace.knowledge.gaps.find((g) => g.id === gapId);
  if (!gap) throw new Error("That question is no longer in the list.");
  gap.status = "dismissed";
  return gap;
}

/** Adds or edits an answer from the knowledge screen. */
export function saveItem(db: Db, input: Record<string, unknown>, memberId?: string): KnowledgeItem {
  const k = db.workspace.knowledge;
  const question = str(input.question, 300);
  const answer = str(input.answer, 2000);
  if (!question) throw new Error("Write the question or objection this answers.");
  if (!answer) throw new Error("Write the answer first.");
  const kind: KnowledgeKind = input.kind === "objection" ? "objection" : "question";
  const existing = k.items.find((i) => i.id === input.id);
  if (existing) {
    Object.assign(existing, { question, answer, kind, enabled: input.enabled !== false, updatedAt: now() });
    return existing;
  }
  const item = addItem(db, { kind, question, answer, source: "manual", memberId });
  if (!item) throw new Error(`The knowledge base holds ${MAX_ITEMS} answers. Remove some first.`);
  return item;
}

export function deleteItem(db: Db, id: string) {
  const k = db.workspace.knowledge;
  k.items = k.items.filter((i) => i.id !== id);
}

/** Learned answers as they appear in the AI's instructions. */
export function knowledgeBlock(ws: Workspace) {
  const items = ws.knowledge.items.filter((i) => i.enabled);
  if (!items.length) return `<learned_answers>None yet.</learned_answers>`;
  const lines: string[] = [];
  let size = 0;
  // Newest first, so the most recent teaching always fits.
  for (const i of [...items].reverse()) {
    const line = `- [${i.id}] ${i.kind === "objection" ? "Objection" : "Question"}: ${i.question}\n  Answer: ${i.answer.replace(/\n+/g, " / ")}`;
    if (size + line.length > 40_000) break;
    size += line.length;
    lines.push(line);
  }
  return `<learned_answers source="answers the owner gave by hand to things you could not answer before">\n${lines.join("\n")}\n</learned_answers>`;
}

/** Open questions, so the AI files a repeat under the entry that already exists. */
export function gapsBlock(ws: Workspace) {
  const open = ws.knowledge.gaps.filter((g) => g.status === "open").slice(-40);
  return open.length ? open.map((g) => `- [${g.id}] ${g.question}`).join("\n") : "None.";
}

/** Closest learned answer to what the lead just said. Used by the keyword engine when Claude is not available. */
export function matchKnowledge(ws: Workspace, text: string): KnowledgeItem | null {
  let best: KnowledgeItem | null = null;
  let score = 0.45;
  for (const i of ws.knowledge.items) {
    if (!i.enabled) continue;
    const s = similarity(i.question, text);
    if (s > score) { best = i; score = s; }
  }
  return best;
}

/** What the knowledge screen shows. */
export function knowledgeView(db: Db) {
  const k = db.workspace.knowledge;
  const lead = (id: string) => {
    const c = db.conversations.find((x) => x.id === id);
    return c ? { id: c.id, name: c.name, waiting: c.gapId != null } : null;
  };
  return {
    gaps: k.gaps.filter((g) => g.status === "open").map((g) => ({ ...g, leads: g.conversationIds.map(lead).filter(Boolean), waiting: db.conversations.filter((c) => c.gapId === g.id).length })).sort((a, b) => b.waiting - a.waiting || b.lastAskedAt.localeCompare(a.lastAskedAt)),
    items: [...k.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((i) => ({ ...i, by: db.workspace.members.find((m) => m.id === i.memberId)?.name ?? "" })),
    limit: MAX_ITEMS,
  };
}
