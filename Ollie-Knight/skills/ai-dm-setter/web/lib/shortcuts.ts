import type { ConversionGoal, GoalType, LeadProfile, Shortcut } from "./types";

// Shortcuts work the way text expanders do: type the trigger, get the message, with the lead's own details filled in.
// The command style ({formtext: name=...; default=...}) follows Text Blaze so setters who know it feel at home.

export const SHORTCUT_CATEGORIES = ["Opener", "Follow up", "Link", "Resource", "Objection", "Booking", "Other"];

export const GOAL_TYPES: [GoalType, string][] = [
  ["call", "Book a call"], ["vsl", "Watch a VSL"], ["webinar", "Webinar"], ["resource", "Free resource"],
  ["community", "Community (Skool, Discord)"], ["application", "Application form"], ["checkout", "Checkout page"], ["other", "Other"],
];

export interface FillContext {
  name: string;
  handle: string | null;
  lead: LeadProfile;
  stage: string;
  myName: string;
  business: string;
  goals: ConversionGoal[];
  shortcuts?: Shortcut[];
  now?: Date;
}

export interface FormField { name: string; kind: "text" | "menu"; options: string[]; fallback: string }

/** The variables a shortcut can use, shown in the editor. */
export const VARIABLES: [string, string][] = [
  ["{first_name}", "Lead's first name. {first_name: default=there} sets what to use when it is unknown"],
  ["{name}", "Lead's full name"],
  ["{handle}", "Their Instagram handle"],
  ["{goal} {pain} {situation} {budget}", "What the lead has told you so far"],
  ["{my_name} {business}", "Your name and business, from the brief"],
  ["{link: Strategy call}", "A conversion link, by its name or its type (call, vsl, webinar, resource, community)"],
  ["{time_of_day}", "morning, afternoon or evening"],
  ["{day: +1}", "A weekday name, counted from today. {date: +7} gives a date"],
  ["{formtext: name=Topic; default=...}", "Asks you for a value before the message is inserted"],
  ["{formmenu: Tuesday; Thursday; name=Day}", "Asks you to pick one"],
  ["{import: /other}", "Drops another shortcut in"],
  ["{note}...{endnote}", "A reminder for the setter. Shown in the preview, never sent"],
  ["{cursor}", "Where the typing cursor lands afterwards"],
  ["--- on its own line", "Splits the text into separate messages"],
];

const CMD = /\{([a-z_]+)(?::\s*([^{}]*))?\}/gi;

function settings(raw: string | undefined) {
  const pos: string[] = [];
  const named: Record<string, string> = {};
  for (const part of (raw ?? "").split(";").map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(/^([a-z_]+)=(.*)$/i);
    if (m) named[m[1].toLowerCase()] = m[2].trim();
    else pos.push(part);
  }
  return { pos, named };
}

function withImports(text: string, list: Shortcut[] | undefined, depth = 0): string {
  if (!list || depth > 3) return text;
  return text.replace(/\{import:\s*([^{}]+)\}/gi, (_, t: string) => {
    const hit = list.find((s) => s.trigger.toLowerCase() === t.trim().toLowerCase());
    return hit ? withImports(hit.text, list, depth + 1) : "";
  });
}

const stripNotes = (text: string) => text.replace(/\{note\}[\s\S]*?\{endnote\}\n?/gi, "");

/** Notes left for the setter inside a shortcut. */
export function notesIn(text: string, list?: Shortcut[]) {
  return [...withImports(text, list).matchAll(/\{note\}([\s\S]*?)\{endnote\}/gi)].map((m) => m[1].trim()).filter(Boolean);
}

/** Questions the setter must answer before this shortcut can be inserted. */
export function formFields(text: string, list?: Shortcut[]): FormField[] {
  const out: FormField[] = [];
  for (const m of stripNotes(withImports(text, list)).matchAll(CMD)) {
    const cmd = m[1].toLowerCase();
    if (cmd !== "formtext" && cmd !== "formmenu" && cmd !== "formparagraph") continue;
    const { pos, named } = settings(m[2]);
    const name = named.name || (cmd === "formmenu" ? "Choice" : "Text");
    if (out.some((f) => f.name === name)) continue;
    out.push({ name, kind: cmd === "formmenu" ? "menu" : "text", options: cmd === "formmenu" ? [...pos, ...(named.default && !pos.includes(named.default) ? [named.default] : [])] : [], fallback: named.default ?? (cmd === "formmenu" ? pos[0] ?? "" : "") });
  }
  return out;
}

function findGoal(goals: ConversionGoal[], key: string) {
  const k = key.trim().toLowerCase();
  const live = goals.filter((g) => g.url);
  return live.find((g) => g.label.toLowerCase() === k) ?? live.find((g) => g.type === k) ?? (k ? live.find((g) => g.label.toLowerCase().includes(k)) : live[0]);
}

/** Fills a shortcut in for one lead. `missing` lists anything that could not be filled, so the setter can see it before sending. */
export function expand(text: string, ctx: FillContext, answers: Record<string, string> = {}): { text: string; cursor: number | null; missing: string[] } {
  const now = ctx.now ?? new Date();
  const missing: string[] = [];
  const first = ctx.name.trim().split(/\s+/)[0] ?? "";
  // Names that arrive from Meta as "Instagram user 1234" are not names.
  const known = first && !/^(instagram|messenger|unknown)$/i.test(first);
  const vars: Record<string, string | undefined> = {
    first_name: known ? first : undefined,
    name: known ? ctx.name : undefined,
    handle: ctx.handle ? "@" + ctx.handle : undefined,
    goal: ctx.lead.goal, pain: ctx.lead.pain, situation: ctx.lead.situation, budget: ctx.lead.budget,
    stage: ctx.stage, my_name: ctx.myName || undefined, business: ctx.business || undefined,
    time_of_day: now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening",
  };
  const shift = (raw: string | undefined) => new Date(now.getTime() + (parseInt(raw ?? "0", 10) || 0) * 864e5);
  let out = stripNotes(withImports(text, ctx.shortcuts)).replace(CMD, (whole, c: string, raw: string | undefined) => {
    const cmd = c.toLowerCase();
    const { pos, named } = settings(raw);
    if (cmd === "cursor") return whole;
    if (cmd === "formtext" || cmd === "formparagraph" || cmd === "formmenu") {
      const name = named.name || (cmd === "formmenu" ? "Choice" : "Text");
      return answers[name] ?? named.default ?? (cmd === "formmenu" ? pos[0] ?? "" : "");
    }
    if (cmd === "link") {
      const g = findGoal(ctx.goals, pos[0] ?? "");
      if (!g) missing.push(`link "${pos[0] ?? ""}"`);
      return g?.url ?? "";
    }
    if (cmd === "day") return shift(pos[0]).toLocaleDateString("en-GB", { weekday: "long" });
    if (cmd === "date") return shift(pos[0]).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
    if (cmd in vars) {
      const v = vars[cmd] ?? named.default ?? (cmd === "first_name" ? "there" : undefined);
      if (v === undefined) { missing.push(cmd.replace(/_/g, " ")); return ""; }
      return v;
    }
    return whole;
  });
  const at = out.search(/\{cursor\}/i);
  out = out.replace(/\{cursor\}/gi, "");
  return { text: out.replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " "), cursor: at >= 0 ? at : null, missing };
}

/** A line holding only --- splits one text into several messages. */
export function bubblesOf(text: string) {
  return text.split(/\n\s*-{3,}\s*\n/).map((b) => b.trim()).filter(Boolean);
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Validates shortcuts sent from the browser. Throws with a message the owner can act on. */
export function cleanShortcuts(input: unknown): Shortcut[] {
  if (!Array.isArray(input)) throw new Error("Shortcuts must be a list.");
  if (input.length > 200) throw new Error("200 shortcuts is the limit.");
  const out: Shortcut[] = [];
  for (const r of input as Record<string, unknown>[]) {
    const trigger = str(r.trigger, 24).toLowerCase().replace(/\s+/g, "");
    const text = typeof r.text === "string" ? r.text.slice(0, 4000) : "";
    if (!/^[\/.;!][a-z0-9._-]+$/.test(trigger)) throw new Error(`"${trigger || "(blank)"}" is not a usable trigger. Start with / and use letters, numbers, dots or dashes, for example /open.`);
    if (!text.trim()) throw new Error(`${trigger} has no message.`);
    if (out.some((s) => s.trigger === trigger)) throw new Error(`Two shortcuts use ${trigger}.`);
    out.push({ id: str(r.id, 40) || "sc_" + Math.random().toString(36).slice(2, 10), trigger, name: str(r.name, 50) || trigger, category: str(r.category, 24) || "Other", text });
  }
  return out;
}

export const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: "sc_open", trigger: "/open", name: "Opener, inbound", category: "Opener", text: "hey {first_name}, glad you reached out\n---\nwhat are you working on right now?" },
  { id: "sc_story", trigger: "/story", name: "Opener, story reply", category: "Opener", text: "hey {first_name}, thanks for the reply on the story\n---\nwhat made that one land for you?" },
  { id: "sc_kw", trigger: "/keyword", name: "Opener, keyword or resource request", category: "Opener", text: "hey {first_name}, sending that over now\n---\n{link: resource}\n---\nwhat made you grab it?" },
  { id: "sc_fu1", trigger: "/fu1", name: "Follow up 1, gentle nudge", category: "Follow up", text: "hey {first_name}, just floating this back up. still keen to sort {formtext: name=Their goal; default=this}?" },
  { id: "sc_fu2", trigger: "/fu2", name: "Follow up 2, value", category: "Follow up", text: "{first_name}, thought of you when I saw this\n---\n{link: resource}\n---\nworth a look given what you said about {formtext: name=Their pain; default=where you are stuck}" },
  { id: "sc_fu3", trigger: "/fu3", name: "Follow up 3, close the loop", category: "Follow up", text: "hey {first_name}, I will leave this here so I am not filling your inbox. if the timing changes, message me and we will pick it up" },
  { id: "sc_call", trigger: "/call", name: "Send the call link", category: "Link", text: "sounds like a fit {first_name}\n---\ngrab a time here and we will map it out: {link: call}" },
  { id: "sc_vsl", trigger: "/vsl", name: "Send the video", category: "Link", text: "easiest way to see how it works is this short video {first_name}\n---\n{link: vsl}\n---\nhave a watch and tell me what stands out" },
  { id: "sc_webinar", trigger: "/webinar", name: "Invite to the webinar", category: "Link", text: "we are running a live session on exactly this {first_name}\n---\nsave your seat here: {link: webinar}" },
  { id: "sc_res", trigger: "/res", name: "Send a resource", category: "Resource", text: "here you go {first_name}: {link: resource}\n---\nlet me know what you think once you have been through it" },
  { id: "sc_comm", trigger: "/community", name: "Invite to the community", category: "Resource", text: "best next step is to join us in here {first_name}: {link: community}\n---\nintroduce yourself when you are in and I will point you to the right place" },
  { id: "sc_price", trigger: "/price", name: "Price question", category: "Objection", text: "{note}Only use after you know their goal. Never quote a number that is not in the brief.{endnote}fair question {first_name}\n---\nbefore numbers, what is the main thing you want fixed? I want to make sure it is the right fit first" },
  { id: "sc_think", trigger: "/think", name: "Needs to think about it", category: "Objection", text: "totally fair {first_name}\n---\nwhat is the part you are weighing up? happy to answer it properly" },
  { id: "sc_booked", trigger: "/booked", name: "Booking confirmed", category: "Booking", text: "locked in {first_name}, see you {formmenu: Monday; Tuesday; Wednesday; Thursday; Friday; name=Day}\n---\nbefore the call, have a think about where you want to be in 6 months" },
  { id: "sc_noshow", trigger: "/noshow", name: "Missed the call", category: "Booking", text: "hey {first_name}, missed you on the call today. everything ok?\n---\nhappy to rebook, here is the link again: {link: call}" },
];
