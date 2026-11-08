import type { Intake, Message } from "./types";

/**
 * How the lead texts, read from their recent messages: how many messages they send in a row, how long each one is,
 * their casing, full stops, emoji and laughter. The AI mirrors this shape so a reply reads like a person texting back,
 * while the words themselves stay the owner's.
 */
export interface LeadStyle {
  turns: number;
  perTurn: number;
  words: number;
  lastTurnWords: number;
  lower: boolean;
  stops: boolean;
  emoji: string[];
  laugh: string | null;
  exclaims: boolean;
}

const EMOJI = /\p{Extended_Pictographic}/gu;
const LAUGH = /\b(haha+|hahah\w*|lol|lmao|ahah\w*|hehe)\b/i;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** The lead's style from up to their last 8 turns. Null when they have not written anything yet. */
export function leadStyle(msgs: Message[]): LeadStyle | null {
  const turns: string[][] = [];
  let prev: Message["direction"] | null = null;
  for (const m of msgs) {
    const text = m.text.trim();
    if (m.direction === "in" && text && !/^\[(attachment|commented)\]/i.test(text)) {
      if (prev === "in" && turns.length) turns[turns.length - 1].push(text);
      else turns.push([text]);
    }
    prev = m.direction;
  }
  const recent = turns.slice(-8);
  const lines = recent.flat();
  if (!lines.length) return null;
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  const letters = lines.filter((t) => /^[^\p{L}]*\p{L}/u.test(t));
  const lowerCount = letters.filter((t) => { const c = t.match(/\p{L}/u)?.[0] ?? ""; return c === c.toLowerCase() && c !== c.toUpperCase(); }).length;
  const emoji = [...new Set(lines.flatMap((t) => t.match(EMOJI) ?? []))].slice(0, 6);
  const laugh = lines.map((t) => t.match(LAUGH)?.[0]?.toLowerCase()).find(Boolean) ?? null;
  return {
    turns: recent.length,
    perTurn: Math.round((lines.length / recent.length) * 10) / 10,
    words: median(lines.map(words)),
    lastTurnWords: recent[recent.length - 1].reduce((n, t) => n + words(t), 0),
    lower: letters.length > 0 && lowerCount / letters.length >= 0.6,
    stops: lines.filter((t) => /[^.]\.$/.test(t)).length / lines.length >= 0.4,
    emoji,
    laugh,
    exclaims: lines.some((t) => t.includes("!")),
  };
}

/** The concrete style target for this reply, written for the model. */
export function styleBlock(style: LeadStyle | null, intake: Intake) {
  const slang = (intake.slang ?? "").trim();
  const slangLine = slang
    ? `Slang the owner is happy to use: ${slang}. Use one of these only when the lead's own messages are that casual, and never more than one per reply.`
    : "The owner has not listed any slang, so use none beyond what the owner's own messages in this thread already use.";
  if (!style) {
    return `<lead_style>
The lead has not written anything yet. Keep it to one or two short messages, warm and casual.
${slangLine}
Never swear.
</lead_style>`;
  }
  const many = style.perTurn >= 1.6;
  const short = style.words <= 12;
  const long = style.words >= 35 || (!many && style.lastTurnWords >= 50);
  const shape = long
    ? `They write in fuller messages (about ${style.words} words each). Reply in one message, or two at most, with similar depth: reflect the detail they gave so they feel heard. Still only one question.`
    : many && short
      ? `They text in bursts of short lines (about ${style.perTurn} messages per turn, ${style.words} words each). Reply the same way: ${Math.max(2, Math.min(4, Math.round(style.perTurn)))} short messages of a few words each, like texting back and forth. Put each thought in its own message.`
      : short
        ? `They send single short messages (about ${style.words} words). Reply with one or two short messages, about as long as theirs.`
        : `They send one medium message per turn (about ${style.words} words). Reply with one or two messages of similar length.`;
  return `<lead_style note="read from the lead's own messages; mirror the shape, keep the owner's words">
${shape}
Their last turn was ${style.lastTurnWords} words in total. Your whole reply should land near that, and never several times longer.
Casing: ${style.lower ? "they start messages in lowercase, so do the same (names and \"I\" can stay capitalised)." : "they use normal sentence case, so do the same."}
Full stops: ${style.stops ? "they end sentences with full stops, so you can too." : "they rarely end a message with a full stop, so leave it off the end of each message."}
Emoji: ${style.emoji.length ? `they use emoji (${style.emoji.join(" ")}). You may use one in a reply when it fits, preferring the kinds they use.` : "they use none, so use none."}
${style.laugh ? `They laugh with "${style.laugh}". You can use it too when something is actually light or funny.` : "They have not laughed in text, so do not add haha or lol."}
${style.exclaims ? "They use exclamation marks, so one is fine where it fits." : "They do not use exclamation marks, so avoid them."}
${slangLine}
Never swear, even if they do.
This shape overrides the owner's voice notes and playbook on length, casing, full stops and emoji.
Before you answer, count the questions across all your messages, including ones without a question mark. More than one: keep the one that matters most and cut the rest. If they asked you something, answer it first.
</lead_style>`;
}

/**
 * How a real setter talks. Built into every reply the AI writes, for every business using the setter, so drafts read
 * like a person on the other end rather than a form being filled in.
 */
export const HUMAN_RULES = `How a real person texts, and how you must:
- React first. Open with a short, specific reaction to what they just said (their news, their situation, the thing they are proud of or annoyed by) before anything else. Generic praise does not count.
- One question at most, and only when it follows naturally from what they said. Never two questions in one reply, and never two joined with "and". Some replies have no question at all: if they are mid story or just shared something big, react and let them keep going.
- Ask casually, the way a friend who is good at this would. Not "So what's the company you run and where is it at month to month?" but "oh nice, what's the business?" and, later, "roughly where's it at right now?"
- Match their energy: excited gets upbeat, short and dry gets short and relaxed, sceptical gets calm and plain with no hype.
- Do not start every message with their name, and do not start replies with "So".
- Never correct the lead: not their spelling, not the name they call the owner, not how they put things.
- Words that make it sound like a bot or a salesperson, never use them: "I appreciate you sharing", "Great question", "That's awesome!", "Love that!", "Absolutely!", "I hear you", "I understand", "Feel free to", "Let me know if you have any questions", "touch base", "circle back", "reach out", "journey", "game changer", "leverage", "value", "no worries at all", "just checking in".
- No dashes as pauses, no semicolons, no lists, no bold, no headings, no sign offs. Plain text messages only.
- Do not repeat their words back like a script, and do not summarise what they said unless you are bridging to the offer.
- Share something about the owner only from about_owner, in one line, when it genuinely relates to what they said, and not every reply.

The path every conversation follows (move one step at a time, at the lead's pace):
Never assume anything about the lead. Their business, niche, results, problems, goals and reasons for messaging come only from what they have said in this conversation. With only a few messages, you know very little, so ask instead of filling gaps. The discovery block says whether you may move toward the offer yet; until it does, you only listen and ask.
1. Connect. The first exchanges are about them: why they messaged, what they do, what caught their eye. No money questions, no pitch, no link.
2. Discover. Get a clear understanding of their current situation, then their goal, then what is in the way, one light question at a time, woven into your reactions. Revenue or budget questions only once they have opened up about a goal or a problem. In an older chat where you cannot tell where they are at now, start here again before anything else.
3. Bridge. Reflect their goal and what is stopping them in a sentence or two, in their words, then explain how the offer works (the breakdown message, adapted to them).
4. Invite. Ask before you send: "want me to send you the video that breaks it down?" or "would a quick call to map it out be worth it?" Send the link once they say yes. If they ask for the link, the price or how to join, answer that directly, but keep getting to know them if the discovery block says you have not yet.
Someone guarded should never be rushed to a link.`;

/**
 * Last pass over a draft so it matches the lead's shape even when the model drifts: no more messages than the lead
 * would send, no dashes as pauses, no emoji to someone who uses none, no full stops to someone who never uses them.
 */
export function shapeBubbles(bubbles: string[], style: LeadStyle | null): string[] {
  const plain = Boolean(style && !style.emoji.length);
  const tidy = (b: string) => (plain ? b.replace(EMOJI, "").replace(/️/g, "") : b).replace(/\s*[—–]\s*/g, ", ").replace(/\s+([,.!?])/g, "$1").replace(/\s{2,}/g, " ").replace(/^,\s*/, "").trim();
  let out = bubbles.map(tidy).filter(Boolean);
  // Two questions joined in one message ("what's the business, and where's it at?") keep only the first.
  out = out.map((b) => b.replace(/,?\s+(and|or)\s+(what|whats|what's|where|where's|how|hows|how's|when|why|who|which|is|are|do|does|did|have|has)\b[^?]*\?\s*$/i, "?"));
  // One question per reply: any later message that is also a question is dropped.
  const asks = (b: string) => !/https?:\/\//.test(b) && (/\?\s*\S{0,3}$/.test(b) || /^(what|whats|what's|how|hows|how's|when|where|why|who|which|do|does|did|is|are|was|were|can|could|would|will|should|have|has|still)\b[^.!]*$/i.test(b));
  const first = out.findIndex(asks);
  if (first >= 0) out = out.filter((b, i) => i <= first || !asks(b));
  if (!style) return out;
  const max = style.perTurn >= 1.6 && style.words <= 12 ? 4 : 2;
  if (out.length > max) out = [...out.slice(0, max - 1), out.slice(max - 1).join(" ")];
  // Sentence case for a lead who writes that way, even when the owner's own habit is lowercase.
  if (!style.lower) out = out.map((b) => b.replace(/^(\p{Ll})/u, (c) => c.toUpperCase()));
  if (!style.stops) out = out.map((b) => (/[^.]\.$/.test(b) && !/https?:\/\/\S+$/.test(b) ? b.slice(0, -1) : b));
  return out;
}
