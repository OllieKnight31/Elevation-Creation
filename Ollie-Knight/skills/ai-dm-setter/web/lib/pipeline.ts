import type { StageId } from "./types";

export interface StageDef {
  id: StageId;
  name: string;
  color: string;
  group: "intake" | "qualified" | "converted" | "closed";
  /** Business messaging Conversions API event sent when a lead enters this stage */
  capiEvent?: "LeadSubmitted" | "QualifiedLead" | "Purchase";
  needsReason?: boolean;
  /** Built in stage the automation relies on. Can be renamed, recoloured, reordered or hidden, never deleted. */
  system?: boolean;
  /** Hidden from pickers, filters and the board unless a lead is sitting in it. */
  hidden?: boolean;
}

export type TagTone = "warn" | "err" | "ink";
export interface TagDef {
  name: string;
  group: string;
  /** Plain words telling the AI when to apply this tag. */
  rule?: string;
  tone?: TagTone;
  /** The automation refers to this tag by name, so it cannot be renamed or removed. */
  locked?: boolean;
}
export interface PipelineConfig { stages: StageDef[]; tags: TagDef[] }

export const STAGES: StageDef[] = [
  { id: "inbound", system: true, name: "Inbound message", color: "#1877f2", group: "intake" },
  { id: "outbound", system: true, name: "Outbound message", color: "#6b7280", group: "intake" },
  { id: "in_conversation", system: true, name: "In conversation", color: "#0891b2", group: "intake" },
  { id: "business_model_sent", system: true, name: "Business model sent", color: "#7c3aed", group: "intake" },
  { id: "qualified", system: true, name: "Qualified", color: "#ca8a04", group: "qualified", capiEvent: "QualifiedLead" },
  { id: "link_sent", system: true, name: "Link sent", color: "#ea580c", group: "qualified" },
  { id: "booked", system: true, name: "Booked call", color: "#16a34a", group: "qualified", capiEvent: "LeadSubmitted" },
  { id: "showed", system: true, name: "Showed", color: "#15803d", group: "qualified" },
  { id: "no_show", system: true, name: "No show", color: "#dc2626", group: "qualified" },
  { id: "won", system: true, name: "Won", color: "#047857", group: "converted", capiEvent: "Purchase" },
  { id: "lost", system: true, name: "Lost", color: "#78716c", group: "closed", needsReason: true },
  { id: "disqualified", system: true, name: "Disqualified", color: "#9ca3af", group: "closed", needsReason: true },
  { id: "nurture", system: true, name: "Nurture", color: "#db2777", group: "closed", needsReason: true },
];

export const SYSTEM_STAGE_IDS = STAGES.map((s) => s.id);
export const CAPI_EVENTS = ["QualifiedLead", "LeadSubmitted", "Purchase"] as const;

const t = (group: string, names: string[], extra: Record<string, Partial<TagDef>> = {}): TagDef[] => names.map((name) => ({ name, group, ...extra[name] }));
export const DEFAULT_TAGS: TagDef[] = [
  ...t("Origin", ["Inbound DM", "Story reply", "Comment keyword", "Ad click", "Referral"]),
  ...t("Temperature", ["Hot", "Warm", "Cold"], { Hot: { tone: "warn" } }),
  ...t("Objection", ["Price", "Timing", "Needs partner", "Trust", "Has a solution"]),
  ...t("Engagement", ["Unresponsive", "Reply due", "Window closing"], { "Reply due": { tone: "warn" }, "Window closing": { tone: "warn" } }),
  ...t("Handling", ["Needs human", "Escalated"], { "Needs human": { tone: "err", locked: true }, Escalated: { tone: "err" } }),
  ...t("Compliance", ["Do not contact", "Close friend"], { "Do not contact": { tone: "ink", locked: true }, "Close friend": { tone: "ink", locked: true, rule: "Set by the owner only. The AI and every automation leave this lead alone until the tag is removed." } }),
];

/** Owner only: while a lead has this tag, nothing automatic ever messages them. Only a person can. */
export const CLOSE_FRIEND = "Close friend";

export interface Pipeline {
  stages: StageDef[];
  /** Stages offered in pickers, filters and board columns. */
  visible: StageDef[];
  tags: TagDef[];
  groups: { group: string; labels: string[] }[];
  allTags: string[];
  has(id: StageId): boolean;
  stage(id: StageId): StageDef;
  rank(id: StageId): number;
  tagClass(label: string): string;
}

/** The pipeline in force: the owner's edited one, or the built in set. */
export function pipelineOf(cfg?: PipelineConfig | null): Pipeline {
  const stages = cfg?.stages?.length ? cfg.stages : STAGES;
  const own = cfg?.tags?.length ? cfg.tags : DEFAULT_TAGS;
  // Built in tags the app relies on (Do not contact, Close friend) are always there, even in an edited set.
  const tags = [...own, ...DEFAULT_TAGS.filter((x) => x.locked && !own.some((y) => y.name === x.name))];
  const byId = new Map(stages.map((s) => [s.id, s]));
  const byTag = new Map(tags.map((x) => [x.name, x]));
  const groups: Pipeline["groups"] = [];
  for (const x of tags) {
    const g = groups.find((y) => y.group === x.group);
    if (g) g.labels.push(x.name);
    else groups.push({ group: x.group, labels: [x.name] });
  }
  return {
    stages,
    visible: stages.filter((s) => !s.hidden),
    tags,
    groups,
    allTags: tags.map((x) => x.name),
    has: (id) => byId.has(id),
    // A lead can sit in a stage that was since removed from the config file by hand: show it rather than crash.
    stage: (id) => byId.get(id) ?? { id, name: id.replace(/_/g, " "), color: "#9ca3af", group: "closed" },
    rank: (id) => stages.findIndex((s) => s.id === id),
    tagClass: (label) => {
      const tone = byTag.get(label)?.tone;
      if (tone === "ink") return "bg-ink text-onbrand border-transparent";
      if (tone === "err") return "tone-err border-transparent";
      if (tone === "warn") return "tone-warn border-transparent";
      return "bg-surface text-ink2 border-linestrong";
    },
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Validates a pipeline sent from the browser. Throws with a message the owner can act on. */
export function cleanPipeline(input: unknown): PipelineConfig {
  const raw = (input ?? {}) as { stages?: unknown; tags?: unknown };
  if (!Array.isArray(raw.stages) || !Array.isArray(raw.tags)) throw new Error("Stages and tags are both required.");
  if (raw.stages.length > 30) throw new Error("30 stages is the limit.");
  // An empty list is never a real edit: it would hide every stage or take every tag off every lead.
  if (!raw.stages.length) throw new Error("Keep at least one stage.");
  if (!raw.tags.length) throw new Error("Keep at least one tag. Removing a tag takes it off every lead that has it.");
  if (raw.tags.length > 80) throw new Error("80 tags is the limit.");

  const stages: StageDef[] = [];
  for (const r of raw.stages as Record<string, unknown>[]) {
    const id = str(r.id, 40);
    const name = str(r.name, 40);
    if (!/^[a-z0-9_]+$/.test(id)) throw new Error("A stage has an invalid id.");
    if (!name) throw new Error("Every stage needs a name.");
    if (stages.some((s) => s.id === id)) throw new Error(`Stage "${name}" is listed twice.`);
    if (stages.some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new Error(`Two stages are called "${name}".`);
    const base = STAGES.find((s) => s.id === id);
    stages.push({
      id,
      name,
      color: /^#[0-9a-fA-F]{6}$/.test(str(r.color, 7)) ? str(r.color, 7) : base?.color ?? "#6b7280",
      group: base?.group ?? "qualified",
      ...(CAPI_EVENTS.includes(r.capiEvent as (typeof CAPI_EVENTS)[number]) ? { capiEvent: r.capiEvent as StageDef["capiEvent"] } : {}),
      ...(r.needsReason ? { needsReason: true } : {}),
      ...(base ? { system: true } : {}),
      ...(r.hidden ? { hidden: true } : {}),
    });
  }
  for (const s of STAGES) if (!stages.some((x) => x.id === s.id)) stages.push({ ...s, hidden: true });
  if (!stages.some((s) => !s.hidden)) throw new Error("Keep at least one stage visible.");

  const tags: TagDef[] = [];
  for (const r of raw.tags as Record<string, unknown>[]) {
    const name = str(r.name, 30);
    const group = str(r.group, 24) || "Other";
    if (!name) throw new Error("Every tag needs a name.");
    if (tags.some((x) => x.name.toLowerCase() === name.toLowerCase())) throw new Error(`Two tags are called "${name}".`);
    const locked = DEFAULT_TAGS.find((x) => x.locked && x.name === name);
    const rule = str(r.rule, 240);
    tags.push({
      name,
      group: locked?.group ?? group,
      ...(rule ? { rule } : {}),
      ...(["warn", "err", "ink"].includes(r.tone as string) ? { tone: r.tone as TagTone } : {}),
      ...(locked ? { locked: true, tone: locked.tone } : {}),
    });
  }
  for (const x of DEFAULT_TAGS) if (x.locked && !tags.some((y) => y.name === x.name)) tags.push(x);
  return { stages, tags };
}

export const WINDOW_HOURS = 24;

/** Meta allows automated sends only within 24 hours of the lead's last message. */
export function windowState(lastInboundAt: string | null, now = Date.now()) {
  if (!lastInboundAt) return { open: false, hoursLeft: 0, closing: false };
  const hoursLeft = WINDOW_HOURS - (now - new Date(lastInboundAt).getTime()) / 36e5;
  return { open: hoursLeft > 0, hoursLeft: Math.max(0, hoursLeft), closing: hoursLeft > 0 && hoursLeft < 4 };
}

/** Stages a lead can be moved out of automatically. Later stages are only changed by events or a human. */
export const EARLY_STAGES: StageId[] = ["inbound", "outbound", "in_conversation", "business_model_sent", "qualified"];
