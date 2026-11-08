import type { Conversation, ConvSummary, Db, Message } from "./types";
import { pipelineOf, windowState } from "./pipeline";

const ago = (iso: string) => {
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 1) return "under an hour ago";
  if (h < 24) return `${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export const threadOf = (db: Db, conv: Conversation) => db.messages.filter((m) => m.conversationId === conv.id).sort((a, b) => a.sentAt.localeCompare(b.sentAt));

/**
 * Brief written without the AI, from what is already recorded: lead details, stage, links sent and who spoke last.
 * Used when Claude is not available and as the instant version while a Claude one is on its way.
 */
export function basicSummary(db: Db, conv: Conversation, msgs: Message[] = threadOf(db, conv)): ConvSummary {
  const pipe = pipelineOf(db.workspace.pipeline);
  const first = conv.name.split(/\s+/)[0];
  const l = conv.lead;
  const last = msgs[msgs.length - 1];
  const lastIn = [...msgs].reverse().find((m) => m.direction === "in");
  const link = [...db.events].reverse().find((e) => e.conversationId === conv.id && e.type === "link_sent");
  const sent = msgs.filter((m) => m.direction === "out").length;
  const parts: string[] = [];

  parts.push(`${first} came in through ${lower(conv.origin)} ${ago(conv.createdAt)}${msgs.length ? `, ${msgs.length} message${msgs.length === 1 ? "" : "s"} so far` : ""}.`);
  const known = [l.situation && `Situation: ${lower(l.situation)}`, l.goal && `wants ${lower(l.goal)}`, l.pain && `held back by ${lower(l.pain)}`].filter(Boolean);
  if (known.length) parts.push(known.join("; ") + ".");
  else if (lastIn) parts.push(`They have not shared much yet. Their latest message: "${clip(lastIn.text, 110)}"`);
  if (l.objections?.length) parts.push(`Objection${l.objections.length > 1 ? "s" : ""} raised: ${l.objections.join(", ").toLowerCase()}.`);
  if (l.budget) parts.push(`Budget: ${lower(l.budget)}.`);
  parts.push(`Stage is ${pipe.stage(conv.stage).name}${conv.lossReason && pipe.stage(conv.stage).needsReason ? ` (${lower(conv.lossReason)})` : ""}${link ? `; ${link.detail || "a link"} was sent ${ago(link.at)}` : ""}.`);
  if (last && known.length) parts.push(`${last.direction === "in" ? "They" : "We"} spoke last, ${ago(last.sentAt)}: "${clip(last.text, 110)}"`);

  const w = windowState(conv.lastInboundAt);
  let nextStep: string;
  if (conv.labels.includes("Do not contact")) nextStep = "Do not contact. No further messages.";
  else if (conv.labels.includes("Needs human")) nextStep = "A person needs to answer this one. Read their last message and reply yourself.";
  else if (conv.stage === "won") nextStep = "Closed and won. Nothing needed from the setter.";
  else if (conv.stage === "lost" || conv.stage === "disqualified") nextStep = "Closed. No action needed unless they come back.";
  else if (conv.stage === "nurture") nextStep = "Check back in when the timing they gave has passed.";
  else if (conv.stage === "no_show") nextStep = "Missed the call. Send a rebooking message with the link.";
  else if (conv.stage === "booked") nextStep = "Call is booked. Confirm the time and send anything they should see first.";
  else if (conv.stage === "showed") nextStep = "Call happened. Follow up on the outcome and update the stage.";
  else if (last?.direction === "in") nextStep = `Reply to their last message${w.open ? (w.closing ? `, the 24 hour window closes in about ${Math.ceil(w.hoursLeft)} hours` : "") : ", by hand, as the 24 hour window has closed"}.`;
  else if (conv.stage === "link_sent") nextStep = "Link is out and they have not booked. Follow up and ask if anything is in the way.";
  else if (!sent) nextStep = "No reply sent yet. Open with a question about what they are working on.";
  else if (conv.stage === "qualified") nextStep = "Qualified. Send the right conversion link.";
  else nextStep = "Waiting on them. Follow up if they stay quiet for a day.";

  return { text: parts.join(" "), nextStep, updatedAt: new Date().toISOString(), engine: "demo", messageCount: msgs.length, basis: basisOf(conv) };
}

/**
 * Makes sure a conversation carries a brief that reflects the thread as it stands.
 * A Claude brief is kept until the thread has moved on by a few messages; a basic one is rebuilt on any change.
 */
const basisOf = (conv: Conversation) => conv.stage + "|" + [...conv.labels].sort().join(",");

export function ensureSummary(db: Db, conv: Conversation): boolean {
  const n = db.messages.reduce((k, m) => k + (m.conversationId === conv.id ? 1 : 0), 0);
  const s = conv.summary;
  if (s && s.engine === "claude" && n - s.messageCount < 4) return false;
  if (s && s.engine === "demo" && s.messageCount === n && s.basis === basisOf(conv) && Date.now() - new Date(s.updatedAt).getTime() < 6 * 36e5) return false;
  if (s && s.engine === "claude") return false; // stale Claude brief: kept, the panel offers a refresh
  conv.summary = basicSummary(db, conv);
  return true;
}
