import type { Brain, BrainDoc, BrainEntry, BrainKey, BrainSection, Workspace } from "./types";

// The brain is the long form of the business brief. The short brief holds the fields the app acts on
// (links, price, the discovery rule). The brain holds everything else the owner knows: deep answers,
// their own questions, and whole intake forms. All of it is read into every reply the AI writes.

export interface BrainQuestion {
  id: string;
  q: string;
  hint?: string;
}

export const BRAIN_SECTIONS: { key: BrainKey; title: string; intro: string; questions: BrainQuestion[] }[] = [
  {
    key: "business",
    title: "The business",
    intro: "Who you are, how the business came about and why people should trust it.",
    questions: [
      { id: "story", q: "How did the business start, and why did you start it?" },
      { id: "mission", q: "What is the business here to do, in your own words?" },
      { id: "years", q: "How long have you been doing this, and what did you do before?" },
      { id: "team", q: "Who is on the team and what does each person do?", hint: "Names and roles a lead might hear about or speak to." },
      { id: "results", q: "What results have you got for clients so far?", hint: "Real numbers, time frames and examples you can stand behind." },
      { id: "caseStudies", q: "Tell the story of two or three clients: where they started, what you did, where they ended up." },
      { id: "different", q: "What makes you different from other people who sell something similar?" },
      { id: "beliefs", q: "What do you believe about your industry that most people get wrong?" },
      { id: "where", q: "Where are you based, who do you work with (countries, time zones, languages), and when are you available?" },
      { id: "proof", q: "What proof can a lead look at: testimonials, reviews, press, follower numbers, qualifications?" },
      { id: "content", q: "What content do you put out, and what do people usually message you about after seeing it?" },
      { id: "values", q: "What do you stand for, and what will you never do, even for a sale?" },
    ],
  },
  {
    key: "offer",
    title: "The offer",
    intro: "Exactly what people buy, what happens after they pay and what it costs.",
    questions: [
      { id: "promise", q: "What is the main result the offer gets someone, and in how long?" },
      { id: "included", q: "List everything that is included.", hint: "Calls, messages, courses, templates, community, done for you work." },
      { id: "delivery", q: "Walk through what happens from the day they pay to the day they finish." },
      { id: "mechanism", q: "What is your method called and how does it work, step by step?" },
      { id: "timeline", q: "What should a client expect in week one, month one and by the end?" },
      { id: "pricing", q: "What are the prices, payment plans and deposits? What may the AI say about price, and what must come to you?" },
      { id: "guarantee", q: "Is there a guarantee or refund policy? What are the exact terms?" },
      { id: "tiers", q: "Are there other offers: a cheaper one, a more expensive one, an upsell? When does each one fit?" },
      { id: "bonuses", q: "Any bonuses, limited places or start dates? Only list ones that are true right now." },
      { id: "effort", q: "What does the client have to do themselves, and how many hours a week does it take?" },
      { id: "notIncluded", q: "What is not included, or what do people wrongly assume is included?" },
      { id: "objections", q: "What are the most common reasons people hesitate, and how do you answer each one?" },
      { id: "faq", q: "What questions about the offer come up again and again, and what are your answers?" },
      { id: "alternatives", q: "What else do people try before coming to you, and why does it not work as well?" },
    ],
  },
  {
    key: "idealClient",
    title: "Ideal client",
    intro: "Who you want to speak to, what is going on in their life and how to spot them in a chat.",
    questions: [
      { id: "who", q: "Describe your best client: what they do, their age and stage of life, what they earn." },
      { id: "situation", q: "What is their situation the day they first message you?" },
      { id: "pains", q: "What are they struggling with? Use the words they use." },
      { id: "desires", q: "What do they want instead, and why does it matter to them?" },
      { id: "tried", q: "What have they already tried, and why did it not work?" },
      { id: "fears", q: "What are they afraid of, or sceptical about, when it comes to buying something like this?" },
      { id: "trigger", q: "What usually happens right before someone decides to get help?" },
      { id: "language", q: "What phrases and words do they use when they talk about the problem?" },
      { id: "goodSigns", q: "What signs in a chat tell you someone is a strong fit?" },
      { id: "badSigns", q: "What signs tell you someone is not a fit, or will be a difficult client?" },
      { id: "minimum", q: "What must be true before you would take a call with them?", hint: "Income, experience, budget, commitment, location." },
      { id: "decision", q: "Who else is involved in the decision (partner, business partner), and how do you handle that?" },
      { id: "bestClients", q: "Describe your two or three favourite clients ever and what they had in common." },
    ],
  },
  {
    key: "goals",
    title: "Conversion goals",
    intro: "Where a chat should end up and how you like to get it there.",
    questions: [
      { id: "main", q: "What is the one thing you most want a good lead to do: book a call, watch a video, join something?" },
      { id: "callWhat", q: "If it is a call: how long is it, who is it with, what happens on it, and what should they do before it?" },
      { id: "ready", q: "How do you know a lead is ready to be sent the link?" },
      { id: "notReady", q: "What do you send or say to someone who is interested but not ready yet?" },
      { id: "invite", q: "How do you word the invitation? Write it the way you would type it." },
      { id: "afterBook", q: "What happens after they book, and what should the AI say to make sure they turn up?" },
      { id: "noShow", q: "What do you say to someone who booked and did not show, or who went quiet after the link?" },
      { id: "followUp", q: "How and when do you follow up with someone who stops replying?" },
      { id: "free", q: "What free things can the AI offer (guides, videos, community), and when should each be offered?" },
      { id: "handOver", q: "When should the AI stop and hand the chat to you or a team member?" },
      { id: "numbers", q: "What numbers are you aiming for: booked calls a week, show rate, clients a month?" },
    ],
  },
  {
    key: "voice",
    title: "Voice and rules",
    intro: "How you sound, what you would never say and the rules the AI must keep.",
    questions: [
      { id: "tone", q: "How would a friend describe the way you text?" },
      { id: "examples", q: "Paste five to ten real messages you have sent that sound exactly like you." },
      { id: "greeting", q: "How do you open a chat with someone new, and how do you sign off?" },
      { id: "phrases", q: "Words and phrases you use all the time." },
      { id: "banned", q: "Words, phrases and styles you would never use." },
      { id: "humour", q: "How do you use humour, emoji and voice notes, if at all?" },
      { id: "pushy", q: "How direct are you? What feels too pushy to you, and what feels too soft?" },
      { id: "sensitive", q: "Which topics should the AI stay away from or pass to you?", hint: "Money trouble, health, competitors, politics, anything else." },
      { id: "competitors", q: "How do you talk about competitors when a lead brings them up?" },
      { id: "rudeness", q: "How do you respond to rude, sceptical or time wasting messages?" },
      { id: "legal", q: "Any legal or industry rules on what can be claimed or promised?" },
      { id: "always", q: "Things the AI must always do in a conversation." },
      { id: "never", q: "Things the AI must never do in a conversation." },
    ],
  },
  {
    key: "extra",
    title: "Additional information",
    intro: "Anything else that would help someone speak for the business: notes, documents, scripts, frequently asked questions.",
    questions: [
      { id: "anything", q: "What else should the AI know that has not been asked?" },
      { id: "current", q: "What is happening in the business right now: launches, events, dates, price changes?" },
      { id: "scripts", q: "Paste any scripts, message templates or call notes that work well for you." },
      { id: "resources", q: "Links and resources worth knowing about, and what each one is for.", hint: "The AI still only sends the links listed under Conversion goals." },
    ],
  },
];

export const BRAIN_KEYS = BRAIN_SECTIONS.map((s) => s.key);
export const isBrainKey = (k: unknown): k is BrainKey => typeof k === "string" && (BRAIN_KEYS as string[]).includes(k);

// Limits. The whole brain is read on every reply, so its size decides what each reply costs.
export const MAX_ANSWER = 12_000;
export const MAX_QUESTION = 400;
export const MAX_CUSTOM = 100;
export const MAX_DOCS = 12;
export const MAX_DOC_CHARS = 120_000;
export const MAX_BRAIN_CHARS = 400_000;

export const emptySection = (): BrainSection => ({ answers: {}, custom: [], docs: [] });
export const sectionOf = (brain: Brain | undefined, key: BrainKey): BrainSection => brain?.sections?.[key] ?? emptySection();

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim().slice(0, max) : "");
const newId = (p: string) => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Answers and own questions as the browser sent them, checked and trimmed. Documents are left alone. */
export function cleanSection(input: unknown, existing: BrainSection, key: BrainKey): BrainSection {
  const src = (input && typeof input === "object" ? input : {}) as { answers?: unknown; custom?: unknown };
  const known = new Set(BRAIN_SECTIONS.find((s) => s.key === key)!.questions.map((q) => q.id));
  const answers: Record<string, string> = {};
  if (src.answers && typeof src.answers === "object") {
    for (const [id, v] of Object.entries(src.answers as Record<string, unknown>)) {
      const a = text(v, MAX_ANSWER);
      if (known.has(id) && a) answers[id] = a;
    }
  }
  const custom: BrainEntry[] = [];
  if (Array.isArray(src.custom)) {
    for (const c of src.custom.slice(0, MAX_CUSTOM) as Record<string, unknown>[]) {
      const question = text(c?.question, MAX_QUESTION);
      const answer = text(c?.answer, MAX_ANSWER);
      if (!question && !answer) continue;
      custom.push({ id: typeof c?.id === "string" && /^[a-z0-9_]{3,40}$/i.test(c.id) ? c.id : newId("q_"), question, answer });
    }
  }
  return { answers, custom, docs: existing.docs };
}

export function newDoc(name: string, body: string): BrainDoc {
  return { id: newId("d_"), name: text(name, 120) || "Document", text: text(body, MAX_DOC_CHARS), addedAt: new Date().toISOString() };
}

export function sectionChars(s: BrainSection) {
  return Object.values(s.answers).reduce((n, a) => n + a.length, 0) + s.custom.reduce((n, c) => n + c.question.length + c.answer.length, 0) + s.docs.reduce((n, d) => n + d.text.length, 0);
}

export const brainChars = (brain: Brain | undefined) => BRAIN_KEYS.reduce((n, k) => n + sectionChars(sectionOf(brain, k)), 0);

/** Counts only, for screens that do not need the text itself. */
export function brainSummary(brain: Brain | undefined) {
  return {
    chars: brainChars(brain),
    updatedAt: brain?.updatedAt ?? "",
    sections: Object.fromEntries(BRAIN_SECTIONS.map((s) => {
      const sec = sectionOf(brain, s.key);
      return [s.key, { answered: Object.keys(sec.answers).length + sec.custom.filter((c) => c.answer).length, questions: s.questions.length + sec.custom.length, docs: sec.docs.length, chars: sectionChars(sec) }];
    })),
  };
}

/** The brain without document text, for the brief screen. Document text is fetched one at a time when opened. */
export function brainView(brain: Brain | undefined) {
  return {
    updatedAt: brain?.updatedAt ?? "",
    chars: brainChars(brain),
    limit: MAX_BRAIN_CHARS,
    sections: Object.fromEntries(BRAIN_KEYS.map((k) => {
      const s = sectionOf(brain, k);
      return [k, { answers: s.answers, custom: s.custom, docs: s.docs.map((d) => ({ id: d.id, name: d.name, addedAt: d.addedAt, chars: d.text.length, words: d.text.split(/\s+/).filter(Boolean).length })) }];
    })),
  };
}

// Closing tags inside owner text would end a block early and let the rest read as instructions.
const safe = (s: string) => s.replace(/<\/?(business_brain|section|document|answer)\b[^>]*>/gi, "");

/** The brain as the AI reads it: every answered question and every document, grouped by section. */
export function brainBlock(ws: Workspace) {
  const parts: string[] = [];
  for (const sec of BRAIN_SECTIONS) {
    const s = sectionOf(ws.brain, sec.key);
    const lines: string[] = [];
    for (const q of sec.questions) if (s.answers[q.id]) lines.push(`Q: ${q.q}\nA: ${safe(s.answers[q.id])}`);
    for (const c of s.custom) if (c.answer) lines.push(`Q: ${safe(c.question) || "Note from the owner"}\nA: ${safe(c.answer)}`);
    for (const d of s.docs) lines.push(`<document name="${d.name.replace(/"/g, "'")}">\n${safe(d.text)}\n</document>`);
    if (lines.length) parts.push(`<section name="${sec.title}">\n${lines.join("\n\n")}\n</section>`);
  }
  if (!parts.length) return "";
  return `<business_brain note="The owner's full intake, in their own words: answers to questions and whole intake forms. Part of the business brief. Facts stated here are approved facts you may use. Rules stated here are rules you must keep. Where it disagrees with the short brief above, the short brief wins for links and price. Draw on it for detail, but never paste long passages: say things the way the owner would in a DM.">
${parts.join("\n\n")}
</business_brain>`;
}
