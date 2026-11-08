import type { Conversation, Intake, Message } from "./types";

/*
 * The getting-to-know-them rule. Until enough has been said and the lead's situation, goal and what is in the way are
 * all clear from their own words, the AI only listens and asks: no offer, no breakdown, no link, no call. A chat that
 * went quiet for a month starts this over, because what they said back then may no longer be true.
 */

export const DEFAULT_DISCOVERY_MESSAGES = 10;
const RESTART_DAYS = 30;
// The lead asking for the next step themselves is not an assumption, so it may be answered.
const ASKED = /\b(link|price|pricing|cost|how much|how (do|does|can) (i|it|this|you) (work|join|start|sign)|sign up|join|book(ing)? a (quick )?call|(hop|jump|get) on (a )?(quick )?(call|zoom|facetime)|calendly|send (it|me) over|where do i|what (do|does) (you|it|this) do|what is (it|this)|what's (it|this) about|tell me more)\b/i;

export interface DiscoveryGate {
  open: boolean;
  total: number;
  fromLead: number;
  needTotal: number;
  needLead: number;
  missing: string[];
  restartedDaysAgo: number | null;
  asked: boolean;
}

export function discoveryGate(conv: Conversation, msgs: Message[], intake: Intake): DiscoveryGate {
  const needTotal = Math.max(2, Math.min(40, Math.round(intake.discoveryMessages ?? DEFAULT_DISCOVERY_MESSAGES)));
  const needLead = Math.ceil(needTotal / 2);
  // Only the current stretch of the chat counts: after a gap of a month, it starts again.
  let from = 0;
  let restartedDaysAgo: number | null = null;
  for (let i = 1; i < msgs.length; i++) {
    const gap = new Date(msgs[i].sentAt).getTime() - new Date(msgs[i - 1].sentAt).getTime();
    if (gap >= RESTART_DAYS * 864e5) {
      from = i;
      restartedDaysAgo = Math.round(gap / 864e5);
    }
  }
  const now = msgs.slice(from).filter((m) => m.text.trim());
  const total = now.length;
  const fromLead = now.filter((m) => m.direction === "in").length;
  const l = conv.lead ?? {};
  // In a chat that restarted, what was learned before may be out of date, so it has to be heard again.
  const missing = restartedDaysAgo !== null && fromLead < needLead
    ? ["where they are at now"]
    : [!l.situation && "their current situation", !l.goal && "what they want", !l.pain && "what is in the way"].filter(Boolean) as string[];
  const lastIn = [...now].reverse().find((m) => m.direction === "in")?.text ?? "";
  const open = total >= needTotal && fromLead >= needLead && missing.length === 0;
  return { open, total, fromLead, needTotal, needLead, missing, restartedDaysAgo, asked: ASKED.test(lastIn) };
}

export function discoveryBlock(g: DiscoveryGate) {
  if (g.open) {
    return `<discovery state="complete">You have heard enough from them to move them along the path when it fits. Still only use what they have actually said.</discovery>`;
  }
  const why = [
    g.total < g.needTotal || g.fromLead < g.needLead ? `${g.total} messages so far in this stretch of the chat (${g.fromLead} from them), and the minimum before any offer is ${g.needTotal} (${g.needLead} from them)` : "",
    g.missing.length ? `not clear yet from their own words: ${g.missing.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  return `<discovery state="getting to know them">
You are still getting to know this person: ${why}.
In this reply: no offer, no explanation of how the business works, no breakdown message, no link, no call, no call times, no money or revenue questions. Set stage to in_conversation or no_change.
Make no assumptions. Do not guess their business, niche, results, problems, goals or why they messaged, and do not answer as if you know them. Refer only to what they have said in this conversation. When something is unclear, ask about it simply, one thing at a time, starting with ${g.missing[0] ?? "whatever is least clear"}.
${[g.restartedDaysAgo !== null ? `The chat went quiet for ${g.restartedDaysAgo} days before this stretch, so anything they said earlier may be out of date. Find out where they are at now before building on it.` : "",
g.asked ? "They have just asked about the offer or the next step themselves (what you do, how it works, the price, a link or a call). Answer that question directly and briefly from the brief, that is the one exception, then turn the conversation back to them." : ""].filter(Boolean).join("\n")}
</discovery>`;
}
