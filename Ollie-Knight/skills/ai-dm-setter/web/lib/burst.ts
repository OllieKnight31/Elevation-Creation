import type { Message } from "./types";

/**
 * Several messages sent in a row. A lead who sends three messages before we reply must get an answer to all three,
 * not only the last one. These helpers find the messages still waiting for an answer, tell the AI to cover each,
 * and check afterwards that it did.
 */

const FILLER = /^\[(attachment|commented)\]/i;

/**
 * The lead's messages that no reply has covered yet, oldest first.
 * Normally that is everything since our last message. One case needs more: a message that landed while the AI was
 * still writing or typing sits BEFORE that reply in the thread, yet the reply never read it. answeredThrough (the time
 * of the newest lead message the last AI reply had read) picks those up too.
 */
export function unanswered(msgs: Message[], answeredThrough?: string | null): Message[] {
  let lastOut = -1;
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].direction === "out") { lastOut = i; break; }
  const out: Message[] = [];
  if (lastOut >= 0 && answeredThrough && msgs[lastOut].sender === "ai") {
    // Walk back over the AI's own last run of messages, picking up anything the lead slipped in after the reply was written.
    for (let i = lastOut - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.direction === "out" && m.sender !== "ai") break;
      if (m.sentAt <= answeredThrough) break;
      if (m.direction === "in") out.unshift(m);
    }
  }
  for (let i = lastOut + 1; i < msgs.length; i++) if (msgs[i].direction === "in") out.push(msgs[i]);
  return out.filter((m) => m.text.trim()).slice(-12);
}

/** True when a message asks something, so a reply that skips it would leave the lead hanging. */
export function asksSomething(text: string) {
  const t = text.trim();
  if (FILLER.test(t)) return false;
  // Leads often drop the question mark and open with "and", "also" or "so".
  const lead = t.replace(/^((and|also|so|but|oh|ok|okay|btw|plus)[,\s]+)+/i, "");
  return /\?/.test(t) || /^(what|whats|what's|how|hows|how's|when|where|why|who|which|do|does|did|is|are|can|could|would|will|should|have|has)\b/i.test(lead);
}

/** How many messages a reply to this burst may use, so each point can have its own. */
export const burstRoom = (count: number) => Math.min(4, Math.max(1, count));

/** The numbered list of waiting messages, written for the model. Empty when there is only one, which needs no special handling. */
export function burstBlock(waiting: Message[]) {
  if (waiting.length < 2) return "";
  return `<unanswered_messages note="the lead sent these ${waiting.length} messages and none has had a reply yet">
${waiting.map((m, i) => `${i + 1}. ${m.text.trim()}`).join("\n")}
</unanswered_messages>
Read every one of these before you write. Your reply must respond to each of them, in the order they were sent: answer every question they asked and react to every separate point they made. Do not answer only the last one. A message that is pure filler (a greeting, a laugh, fixing their own typo) needs no answer of its own.
You may use up to ${burstRoom(waiting.length)} messages for this reply so each point gets its own, which overrides the message count in lead_style. Keep each one short. The one question rule still applies to the questions YOU ask, not to how many of theirs you answer.
If any one of these is something you cannot answer from what you have, handle it as unknown exactly as the rules say, and send nothing.
In addressed, list the number of every message above that your reply responds to.
`;
}

/** Waiting messages that ask something and that the reply did not say it covered. Any here means the draft is held. */
export function missed(waiting: Message[], addressed: number[]): Message[] {
  if (waiting.length < 2) return [];
  const got = new Set(addressed);
  return waiting.filter((m, i) => asksSomething(m.text) && !got.has(i + 1));
}
