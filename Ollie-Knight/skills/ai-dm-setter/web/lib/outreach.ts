import { randomUUID } from "crypto";
import defaults from "./outreach-defaults.json";
import type { CommentTrigger, Db, EntryLink, Outreach, OutreachCampaign, OutreachSettings, Prospect, ProspectStatus } from "./types";

export const OUTREACH_DEFAULTS = defaults;
const P = defaults.pacing;
const id = (p: string) => `${p}_${randomUUID().slice(0, 12)}`;
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const int = (min: number, max: number) => Math.floor(rand(min, max + 1));
const clamp = (n: unknown, min: number, max: number, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const MAX_PROSPECTS = 20000;
/** Most follower handles kept for leaving followers out. The newest come first in Instagram's file, so they are the ones kept. */
export const MAX_FOLLOWERS = 50000;

/**
 * Fields this file keeps on the workspace for the cold outreach rules. They are optional so older saved data still
 * loads. They belong in types.ts next to OutreachSettings and Outreach.
 */
export type OutreachRules = OutreachSettings & {
  /** Fewest first messages aimed for in a clock hour (1 to hourlyMax) */
  hourlyMin?: number;
};
export type OutreachStore = Outreach & {
  settings: OutreachRules;
  /** Handles that follow the owner. They are never cold messaged. */
  followerHandles?: string[];
  /** When the follower handles were last added to */
  followersAt?: string;
  /** This clock hour's number of first messages, picked at random inside the hourly range */
  hour?: { key: string; target: number };
  /** lastAt: when the helper was last handed, or last reported on, a message for Meta Business Suite. errors: sends in a row that broke. */
  suite?: { lastAt: string; errors?: number; day?: { date: string; sent: number } };
};
const store = (db: Db) => db.workspace.outreach as OutreachStore;

/**
 * Marks a queued inbox message that the helper sends inside Meta Business Suite's inbox, never inside instagram.com.
 * name: the lead's name to search for. auto: written by the AI or a rule, so it waits for sending hours.
 * It belongs on Prospect in types.ts.
 */
export type SuiteMark = { name: string; auto: boolean };
type QueueRow = Prospect & { suite?: SuiteMark };
const suiteOf = (p: Prospect) => (p as QueueRow).suite;

/**
 * Whether the Chrome helper may send inbox messages inside Meta Business Suite (business.facebook.com). Off unless
 * the owner switches it on in Settings. Separate from instagramTyping: this never types inside instagram.com.
 * The field belongs in types.ts next to instagramTyping.
 */
export const suiteSending = (db: Db) => (db.workspace.settings as { businessSuiteSending?: boolean }).businessSuiteSending === true;

/**
 * Business Suite pacing. gapSeconds: the least time between two messages. waitingMax: the most the inbox sweep lets
 * wait in the queue. errorsBeforePause: broken sends in a row before everything stops. dailyMax: the most sent in a
 * day, 0 for no ceiling (the owner asked for one a minute and named no daily number, so none is set).
 */
export const SUITE = { gapSeconds: 60, waitingMax: 3, errorsBeforePause: 3, dailyMax: 300 };
const FOLLOWERS_LIST = "My followers";
const FOLLOWS_YOU = "Follows you. Cold messages only go to people who do not follow you.";

export function defaultOutreach(): Outreach {
  const settings: OutreachRules = {
      enabled: false, mode: "auto", account: "", dailyMin: P.dailyMin, dailyMax: P.dailyMax, hourStart: P.hourStart, hourEnd: P.hourEnd,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London", ramp: true, rampStart: P.rampStart, rampStep: P.rampStep,
      daysSent: 0, minGapSeconds: P.minGapSeconds, hourlyMin: P.hourlyMin, hourlyMax: P.hourlyMax, typing: { ...defaults.typing }, paused: false, pauseReason: "",
  };
  return {
    settings,
    lists: [], prospects: [], campaigns: [], log: [], day: { date: "", target: 0, sent: 0, errors: 0, nextAt: null },
    links: [], commentTriggers: [], repliedComments: [],
  };
}

/** Fills anything a saved workspace is missing, so older data keeps working. */
export function normaliseOutreach(o: Partial<Outreach> | undefined): Outreach {
  const d = defaultOutreach();
  if (!o) return d;
  const out: OutreachStore = {
    ...d, ...o,
    settings: { ...d.settings, ...o.settings, typing: { ...d.settings.typing, ...o.settings?.typing } },
    day: { ...d.day, ...o.day },
  };
  retireFollowersList(out);
  return out;
}

/**
 * Followers used to be imported as a list to message. They are now the people who are never cold messaged, so an
 * old "My followers" list becomes follower handles, its waiting rows go, and no campaign points at it any more.
 * Rows that were already sent stay on record under a list with a different name.
 */
function retireFollowersList(o: OutreachStore) {
  const ids = new Set(o.lists.filter((l) => l.name === FOLLOWERS_LIST).map((l) => l.id));
  if (!ids.size) return;
  const set = new Set(o.followerHandles ?? []);
  for (const p of o.prospects) if (ids.has(p.listId) && set.size < MAX_FOLLOWERS) set.add(p.handle);
  // followersAt is left alone: an old list was never the whole follower list, so cold messages wait for the full file.
  o.followerHandles = [...set];
  o.prospects = o.prospects.filter((p) => !ids.has(p.listId) || p.status === "sent" || p.status === "typed" || p.status === "sending");
  o.lists = o.lists.filter((l) => !ids.has(l.id) || o.prospects.some((p) => p.listId === l.id)).map((l) => (ids.has(l.id) ? { ...l, name: "Followers messaged before" } : l));
  o.campaigns = o.campaigns.map((c) => ({ ...c, listIds: c.listIds.filter((x) => !ids.has(x)) }));
}

/* ---------- handles, names and message filling ---------- */

/** Accepts a handle, an @handle or a profile link. Returns the bare lower case handle, or "" when it is not one. */
export function cleanHandle(raw: string) {
  let h = raw.trim();
  const url = h.match(/instagram\.com\/([^/?#\s]+)/i);
  if (url) h = url[1];
  h = h.replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) && !["p", "reel", "reels", "explore", "stories", "direct", "accounts"].includes(h) ? h : "";
}

const BUSINESS_WORDS = /\b(ltd|limited|llc|inc|co|company|group|agency|studio|studios|media|fitness|gym|coaching|academy|official|clinic|salon|services|solutions|consulting|consultancy|marketing|digital|club|team|hq|shop|store|the)\b/i;

function firstNameOf(p: Pick<Prospect, "name" | "fields">) {
  const given = p.fields.first_name || p.fields.firstname || "";
  const full = p.name.trim();
  const word = (given || full).split(/\s+/)[0] ?? "";
  // A business name, an emoji or initials is not something to greet a person with.
  if (!/^\p{L}{2,20}$/u.test(word)) return "";
  if (!given && (BUSINESS_WORDS.test(full) || full.split(/\s+/).length > 3 || (/\s/.test(full) && full === full.toUpperCase()))) return "";
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

const key = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * Fills {first_name}, {name}, {username} and any imported column. Both {x} and {{x}} work, and {x|fallback}
 * gives the words to use when the value is missing. An unknown or empty value with no fallback is removed.
 */
export function fill(text: string, p: Pick<Prospect, "handle" | "name" | "fields">, ws: { ownerName?: string; businessName?: string }) {
  const first = firstNameOf(p);
  const vars: Record<string, string> = {
    ...Object.fromEntries(Object.entries(p.fields).map(([k, v]) => [key(k), v])),
    first_name: first, firstname: first, name: p.name.trim(), username: p.handle, handle: p.handle,
    my_name: ws.ownerName ?? "", business: ws.businessName ?? "",
  };
  const missing: string[] = [];
  const out = text.replace(/\{\{?\s*([A-Za-z0-9_ .-]+?)\s*(?:\|([^{}]*))?\}?\}/g, (_m, k: string, fb?: string) => {
    const v = vars[key(k)] ?? "";
    if (v) return v;
    if (fb === undefined) missing.push(k.trim());
    return (fb ?? "").trim();
  });
  // Tidy what a removed value leaves behind: "Hey , saw" becomes "Hey, saw".
  const tidy = out.replace(/[ \t]+([,.!?])/g, "$1").replace(/[ \t]{2,}/g, " ").replace(/^[ \t]+|[ \t]+$/gm, "").trim();
  return { text: tidy, missing };
}

/* ---------- importing prospects ---------- */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const src = text.replace(/\r\n?/g, "\n");
  const sep = (src.split("\n")[0].match(/\t/g)?.length ?? 0) > (src.split("\n")[0].match(/,/g)?.length ?? 0) ? "\t" : src.split("\n")[0].includes(";") && !src.split("\n")[0].includes(",") ? ";" : ",";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const HANDLE_COLS = ["username", "handle", "instagram", "ig", "profile", "profile_url", "url", "link", "instagram_username", "instagram_url", "user"];
const NAME_COLS = ["name", "full_name", "fullname"];

/** Reads a pasted list or a CSV. One handle or profile link per line works; so does a sheet with a header row. */
export function importProspects(db: Db, listName: string, text: string, listId?: string) {
  const o = store(db);
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("Nothing to import. Paste handles, profile links or a CSV.");
  const header = rows[0].map(key);
  let hCol = header.findIndex((h) => HANDLE_COLS.includes(h));
  const hasHeader = hCol >= 0;
  if (!hasHeader) hCol = rows[0].findIndex((c) => cleanHandle(c));
  if (hCol < 0) throw new Error("No Instagram handles found. Add a column called username, or put one handle per line.");
  const nCol = hasHeader ? header.findIndex((h) => NAME_COLS.includes(h)) : -1;
  const cols = hasHeader ? header.filter((h, i) => h && i !== hCol && i !== nCol).slice(0, 30) : [];

  let list = listId ? o.lists.find((l) => l.id === listId) : undefined;
  if (!list) {
    // The old followers list is gone for good: followers are left out, never messaged.
    const name = (str(listName, 60) || `List ${o.lists.length + 1}`).replace(new RegExp(`^${FOLLOWERS_LIST}$`, "i"), "Prospects");
    list = { id: id("l"), name, columns: cols, createdAt: new Date().toISOString() };
    o.lists.push(list);
  } else list.columns = [...new Set([...list.columns, ...cols])].slice(0, 30);

  const known = new Set(o.prospects.filter((p) => !p.test && !p.reply).map((p) => p.handle));
  const inbox = new Set(db.conversations.map((c) => c.handle?.toLowerCase()).filter(Boolean));
  const follows = new Set(o.followerHandles ?? []);
  let added = 0, duplicates = 0, invalid = 0, alreadyLeads = 0, followers = 0;
  const now = new Date().toISOString();
  for (const r of rows.slice(hasHeader ? 1 : 0)) {
    const handle = cleanHandle(r[hCol] ?? "");
    if (!handle) { invalid++; continue; }
    if (known.has(handle)) { duplicates++; continue; }
    if (inbox.has(handle)) { alreadyLeads++; continue; }
    if (follows.has(handle)) { followers++; continue; }
    if (o.prospects.length >= MAX_PROSPECTS) throw new Error(`The limit is ${MAX_PROSPECTS} prospects. Delete a finished list to make room.`);
    known.add(handle);
    const fields: Record<string, string> = {};
    if (hasHeader) header.forEach((h, i) => { if (h && i !== hCol && i !== nCol && cols.includes(h) && r[i]?.trim()) fields[h] = r[i].trim().slice(0, 300); });
    o.prospects.push({ id: id("p"), listId: list.id, handle, name: nCol >= 0 ? (r[nCol] ?? "").trim().slice(0, 80) : "", fields, status: "queued", attempts: 0, addedAt: now });
    added++;
  }
  if (!added && !o.prospects.some((p) => p.listId === list!.id)) o.lists = o.lists.filter((l) => l.id !== list!.id);
  return { listId: list.id, added, duplicates, invalid, alreadyLeads, followers };
}

/* ---------- settings and campaigns ---------- */

export function cleanSettings(input: unknown, prev: OutreachSettings): OutreachRules {
  const b = (input ?? {}) as Record<string, unknown>;
  const t = (b.typing ?? {}) as Record<string, unknown>;
  const dailyMax = Math.round(clamp(b.dailyMax, 1, P.hardMax, prev.dailyMax));
  const hourStart = Math.round(clamp(b.hourStart, 0, 23, prev.hourStart));
  const wpmMin = Math.round(clamp(t.wpmMin, 15, 110, prev.typing.wpmMin));
  const was = hourlyRange(prev);
  const hourlyTop = Math.round(clamp(b.hourlyMax, 1, P.hourlyHardMax, was.max));
  let timezone = str(b.timezone, 60) || prev.timezone;
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { timezone = prev.timezone; }
  return {
    ...prev,
    enabled: typeof b.enabled === "boolean" ? b.enabled : prev.enabled,
    mode: b.mode === "assisted" || b.mode === "auto" ? b.mode : prev.mode,
    account: typeof b.account === "string" ? cleanHandle(b.account) : prev.account,
    dailyMax,
    dailyMin: Math.min(dailyMax, Math.round(clamp(b.dailyMin, 1, P.hardMax, prev.dailyMin))),
    hourStart,
    hourEnd: Math.max(hourStart + 1, Math.round(clamp(b.hourEnd, 1, 24, prev.hourEnd))),
    timezone,
    ramp: typeof b.ramp === "boolean" ? b.ramp : prev.ramp,
    rampStart: Math.round(clamp(b.rampStart, 1, P.hardMax, prev.rampStart)),
    rampStep: Math.round(clamp(b.rampStep, 1, 20, prev.rampStep)),
    minGapSeconds: Math.round(clamp(b.minGapSeconds, 60, 3600, prev.minGapSeconds)),
    hourlyMax: hourlyTop,
    hourlyMin: Math.min(hourlyTop, Math.round(clamp(b.hourlyMin, 1, P.hourlyHardMax, was.min))),
    typing: {
      wpmMin,
      wpmMax: Math.max(wpmMin, Math.round(clamp(t.wpmMax, 15, 130, prev.typing.wpmMax))),
      typoRate: clamp(t.typoRate, 0, 0.12, prev.typing.typoRate),
      rewriteRate: clamp(t.rewriteRate, 0, 0.5, prev.typing.rewriteRate),
      pauseRate: clamp(t.pauseRate, 0, 0.3, prev.typing.pauseRate),
    },
  };
}

export function saveCampaign(db: Db, input: unknown): OutreachCampaign {
  const o = db.workspace.outreach;
  const b = (input ?? {}) as Record<string, unknown>;
  const existing = o.campaigns.find((c) => c.id === b.id);
  const name = str(b.name, 80);
  if (!name) throw new Error("Give the campaign a name.");
  const listIds = (Array.isArray(b.listIds) ? b.listIds : []).filter((x): x is string => typeof x === "string" && o.lists.some((l) => l.id === x));
  const seen = new Set<string>();
  const variants = (Array.isArray(b.variants) ? b.variants : [])
    .map((v) => ({ id: str((v as { id?: string })?.id, 40) || id("v"), text: typeof (v as { text?: string })?.text === "string" ? (v as { text: string }).text.trim().slice(0, 1000) : "" }))
    .filter((v) => v.text && !seen.has(v.text.toLowerCase()) && seen.add(v.text.toLowerCase()))
    .slice(0, defaults.variants.maxPerCampaign);
  const want = b.status === "active" || b.status === "paused" || b.status === "draft" ? b.status : existing?.status ?? "draft";
  if (want === "active") {
    if (!listIds.length) throw new Error("Pick at least one prospect list before starting the campaign.");
    if (variants.length < defaults.variants.minPerCampaign) throw new Error(`Write at least ${defaults.variants.minPerCampaign} different versions of the message before starting. Identical messages are the fastest way to get an account restricted.`);
  }
  const c: OutreachCampaign = { id: existing?.id ?? id("oc"), name, listIds, variants, status: want, lastSentAt: existing?.lastSentAt, createdAt: existing?.createdAt ?? new Date().toISOString() };
  if (existing) o.campaigns[o.campaigns.indexOf(existing)] = c;
  else o.campaigns.push(c);
  return c;
}

/* ---------- pacing ---------- */

function local(tz: string, now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second) };
}

/** The range a clock hour's number of first messages is picked from. Never above the hard ceiling, whatever was saved. */
export function hourlyRange(s: OutreachSettings) {
  const max = Math.round(clamp(s.hourlyMax, 1, P.hourlyHardMax, P.hourlyMax));
  return { min: Math.min(max, Math.round(clamp((s as OutreachRules).hourlyMin, 1, P.hourlyHardMax, P.hourlyMin))), max };
}

/** This clock hour's number: a different one each hour, so the pace never looks like a timer. */
function hourTarget(db: Db, now: Date) {
  const o = store(db);
  const l = local(o.settings.timezone, now);
  const key = `${l.date}T${Math.floor(l.seconds / 3600)}`;
  const r = hourlyRange(o.settings);
  if (o.hour?.key !== key) o.hour = { key, target: int(r.min, r.max) };
  // A lower limit saved during the hour takes effect at once.
  else o.hour.target = Math.min(o.hour.target, r.max);
  return o.hour.target;
}

/** Today's ceiling: the chosen range, held down by the ramp while the account is new to outreach. */
export function capToday(s: OutreachSettings) {
  const ramp = s.ramp ? s.rampStart + s.rampStep * s.daysSent : Infinity;
  return { min: Math.min(s.dailyMin, ramp, P.hardMax), max: Math.min(s.dailyMax, ramp, P.hardMax), ramp: Number.isFinite(ramp) && ramp < s.dailyMax ? ramp : null };
}

function rollDay(db: Db, now: Date) {
  const o = db.workspace.outreach;
  const today = local(o.settings.timezone, now).date;
  if (o.day.date !== today) {
    const cap = capToday(o.settings);
    // A different number every day, and a first send that does not land on the hour.
    o.day = { date: today, target: int(Math.round(cap.min), Math.round(cap.max)), sent: 0, errors: 0, nextAt: null };
  } else {
    // A lower limit saved during the day takes effect at once. A higher one waits for tomorrow.
    o.day.target = Math.min(o.day.target, Math.round(capToday(o.settings).max));
  }
  return o.day;
}

function windowOf(s: OutreachSettings, now: Date) {
  const sec = local(s.timezone, now).seconds;
  const start = s.hourStart * 3600, end = s.hourEnd * 3600;
  return { open: sec >= start && sec < end, left: Math.max(0, end - sec), untilOpen: sec < start ? start - sec : sec >= end ? 86400 - sec + start : 0 };
}

function pause(db: Db, reason: string) {
  const s = db.workspace.outreach.settings;
  s.paused = true;
  s.pauseReason = reason.slice(0, 300);
  s.pausedAt = new Date().toISOString();
}

export function resume(db: Db) {
  const o = db.workspace.outreach;
  o.settings.paused = false;
  o.settings.pauseReason = "";
  o.day.errors = 0;
  const suite = store(db).suite;
  if (suite) suite.errors = 0;
  o.day.nextAt = new Date(Date.now() + rand(60, 240) * 1000 * Number(process.env.SETTER_OUTREACH_GAP_SCALE ?? 1)).toISOString();
}

const log = (db: Db, item: Omit<Outreach["log"][number], "at">) => {
  const o = db.workspace.outreach;
  o.log.push({ at: new Date().toISOString(), ...item });
  if (o.log.length > 300) o.log.splice(0, o.log.length - 300);
};

function expireLeases(db: Db, now: Date) {
  for (const p of db.workspace.outreach.prospects) {
    if (p.status !== "sending" || !p.leaseUntil || new Date(p.leaseUntil) > now) continue;
    // A reply may have gone out without the helper reporting it, so it is never typed a second time.
    if (p.reply) { replyDone(db, p, "failed", `The helper did not report back in time. Check the chat in ${suiteOf(p) ? "Meta Business Suite" : "Instagram"} before sending it again.`); continue; }
    if (p.test) { p.status = "failed"; p.detail = "The helper did not report back in time. Check the chat in Instagram before testing again."; p.taskId = p.leaseUntil = undefined; continue; }
    p.attempts++;
    p.status = p.attempts >= 2 ? "failed" : "queued";
    p.detail = "The extension did not report back in time.";
    p.taskId = p.leaseUntil = undefined;
  }
}

export function outreachStatus(db: Db, now = new Date()) {
  const o = db.workspace.outreach, s = o.settings;
  const day = rollDay(db, now);
  const w = windowOf(s, now);
  return {
    enabled: s.enabled, mode: s.mode, paused: s.paused, pauseReason: s.pauseReason, sentToday: day.sent, capToday: day.target,
    inWindow: w.open, nextAt: day.nextAt, account: s.account, detect: defaults.detect,
    // The helper reads this to know whether to ask for Business Suite messages at all.
    suiteSending: suiteSending(db), suiteWaiting: suiteWaiting(db),
  };
}

/**
 * Hands the extension the next message to send, or the reason there is none and when to ask again.
 * channel "instagram": what is typed inside instagram.com (cold first messages, tests, and inbox replies only when
 * instagramTyping is on). channel "suite": inbox messages for Meta Business Suite. Neither is ever handed to the other.
 */
export function nextTask(db: Db, account: string, now = new Date(), channel: "instagram" | "suite" = "instagram") {
  const o = db.workspace.outreach, s = o.settings;
  // First, so a task the helper never reported on is released even while outreach is switched off.
  expireLeases(db, now);
  // Without Meta, inbox replies go out through the helper, so it asks again within a minute and a reply never waits long.
  // With Meta connected, replies go through Meta and the helper can wait longer, which lets the database sleep.
  // With Autopilot on the inbox sweep sends follow ups through the helper, so it checks in every two minutes.
  const sweeping = db.workspace.settings.autopilotMaster && (db.workspace.settings.inboxSweep?.answerWaiting || db.workspace.settings.inboxSweep?.followUp);
  const cap = !db.workspace.meta.instagram ? 60 : sweeping ? 45 : db.workspace.settings.autopilotMaster ? 120 : 900;
  const none = (reason: string, retryInSec = 60) => ({ task: null, reason, retryInSec: Math.round(Math.min(cap, retryInSec)) });
  // Inbox replies and follow ups never go out by typing inside instagram.com unless the owner has switched that on,
  // and never inside Business Suite unless that is switched on. Anything still waiting for a switch that is off is
  // cancelled so it cannot go out later. First messages to new accounts (campaigns) are the one thing the helper
  // types inside instagram.com, under the caps below.
  const typing = db.workspace.settings.instagramTyping === true, suiteOn = suiteSending(db);
  for (const p of o.prospects) {
    if (p.status !== "queued" || !p.reply) continue;
    const suite = Boolean(suiteOf(p));
    if (suite ? suiteOn : typing) continue;
    p.status = "failed";
    p.detail = suite ? "Not sent: sending through Meta Business Suite is switched off." : "Not sent: inbox messages go through Meta only.";
    const m = db.messages.find((x) => x.id === p.reply!.messageId);
    if (m) { m.delivery = "failed"; m.deliveryNote = p.detail; }
  }
  // Dropped as well, so a cancelled reply can never be put back in the queue and the list does not grow.
  o.prospects = o.prospects.filter((p) => !(p.reply && p.status === "failed"));
  if (channel === "suite") return nextSuiteTask(db, now);
  // Inbox replies go first, then a test: both were asked for by a person just now. A Business Suite message is
  // never handed out here, so it can never be typed inside instagram.com.
  const test = o.prospects.find((p) => p.reply && !suiteOf(p) && p.status === "queued") ?? o.prospects.find((p) => p.test && p.status === "queued");
  if (!s.enabled && !test) return none("Outreach is switched off in the app.", 300);
  if (s.paused) return none(`Paused. ${s.pauseReason}`, 300);
  const acct = cleanHandle(account || "");
  if (s.account && acct && acct !== s.account) return none(`Chrome is signed in to Instagram as @${acct}, but outreach is set up for @${s.account}.`, 300);
  const day = rollDay(db, now);
  if (o.prospects.some((p) => p.status === "sending")) return none("A message is being sent.", 60);
  // A test is typed inside Instagram too, so it stops at the hard daily ceiling like everything else typed there.
  if (test && !test.reply && day.sent >= P.hardMax) {
    test.status = "failed";
    test.detail = `Not sent: today's ${P.hardMax} messages typed in Instagram are done. Try again tomorrow.`;
    return none(test.detail, 300);
  }
  // A test message asked for on the Get connected screen goes straight away: one person, chosen by the owner.
  if (test) {
    test.status = "sending";
    test.taskId = id("t");
    test.leaseUntil = new Date(now.getTime() + P.leaseMinutes * 60000).toISOString();
    return {
      task: {
        id: test.taskId, handle: test.handle, profileUrl: `https://www.instagram.com/${test.handle}/`, text: test.text ?? "", mode: test.reply ? "auto" : test.testMode ?? "assisted",
        readMs: int(defaults.typing.readMsMin, defaults.typing.readMsMax), typing: s.typing, detect: defaults.detect,
      },
    };
  }
  const w = windowOf(s, now);
  if (!w.open) return none(`Outside sending hours (${s.hourStart}:00 to ${s.hourEnd}:00).`, Math.min(w.untilOpen, 900));
  if (day.sent >= Math.min(day.target, P.hardMax)) return none(`Today's ${Math.min(day.target, P.hardMax)} messages are done.`, 900);
  // Never more than this hour's number in any 60 minutes, whatever the daily number allows. Tests count: they are
  // typed inside Instagram as well.
  const perHour = hourTarget(db, now);
  const hourAgo = now.getTime() - 3600_000;
  const lastHour = o.prospects.filter((p) => !p.reply && p.sentAt).map((p) => new Date(p.sentAt!).getTime()).filter((t) => t > hourAgo).sort((a, b) => a - b);
  if (lastHour.length >= perHour) {
    // Room opens when enough of the last hour's messages are more than 60 minutes old.
    const free = lastHour[lastHour.length - perHour] + 3600_000;
    return none(`This hour's ${perHour} messages are done.`, Math.min(600, Math.max(20, (free - now.getTime()) / 1000)));
  }
  if (day.nextAt && new Date(day.nextAt) > now) return none("Waiting for the next send time.", Math.min(600, Math.max(20, (new Date(day.nextAt).getTime() - now.getTime()) / 1000)));

  // Cold messages only go to people who do not follow the owner. Until the full follower file has been added nobody
  // can be told apart, so nothing goes out.
  const x = store(db);
  if (!x.followersAt) return none("Waiting for your follower list. Add it under Outreach, Prospects, so people who follow you are left out.", 900);
  const follows = new Set(x.followerHandles ?? []);
  const inbox = new Set(db.conversations.map((c) => c.handle?.toLowerCase()).filter(Boolean));
  const campaigns = o.campaigns.filter((c) => c.status === "active" && c.variants.length).sort((a, b) => (a.lastSentAt ?? "").localeCompare(b.lastSentAt ?? ""));
  for (const camp of campaigns) {
    for (const p of o.prospects) {
      if (p.status !== "queued" || !camp.listIds.includes(p.listId)) continue;
      if (inbox.has(p.handle)) { p.status = "skipped"; p.detail = "Already in your inbox."; continue; }
      if (follows.has(p.handle)) { p.status = "skipped"; p.detail = FOLLOWS_YOU; continue; }
      // Even rotation: the least used version goes next, so every version gets a fair test.
      const used = new Map(camp.variants.map((v) => [v.id, 0]));
      for (const q of o.prospects) if (q.campaignId === camp.id && q.variantId && used.has(q.variantId) && (q.status === "sent" || q.status === "typed")) used.set(q.variantId, used.get(q.variantId)! + 1);
      const low = Math.min(...used.values());
      const pool = camp.variants.filter((v) => used.get(v.id) === low);
      const variant = pool[int(0, pool.length - 1)];
      const text = fill(variant.text, p, { ownerName: db.workspace.intake.ownerName, businessName: db.workspace.intake.businessName }).text;
      if (!text) { p.status = "skipped"; p.detail = "The message came out empty for this prospect."; continue; }
      p.status = "sending";
      p.campaignId = camp.id;
      p.variantId = variant.id;
      p.text = text;
      p.taskId = id("t");
      p.leaseUntil = new Date(now.getTime() + P.leaseMinutes * 60000).toISOString();
      return {
        task: {
          id: p.taskId, handle: p.handle, profileUrl: `https://www.instagram.com/${p.handle}/`, text, mode: s.mode,
          readMs: int(defaults.typing.readMsMin, defaults.typing.readMsMax), typing: s.typing, detect: defaults.detect,
        },
      };
    }
  }
  return none("No prospects are waiting in an active campaign.", 300);
}

/* ---------- inbox messages for Meta Business Suite ---------- */

/** Messages waiting for, or being sent in, Business Suite. */
export const suiteWaiting = (db: Db) => db.workspace.outreach.prospects.filter((p) => p.reply && suiteOf(p) && (p.status === "queued" || p.status === "sending")).length;

/** How many more chats the inbox sweep may queue for Business Suite now. The helper sends one a minute at most, so the queue is kept short. */
export const suiteRoom = (db: Db) => (suiteSending(db) && !db.workspace.outreach.settings.paused ? Math.max(0, SUITE.waitingMax - suiteWaiting(db)) : 0);

/**
 * The next inbox message for Business Suite: the oldest one waiting, one a minute at most. A message the AI or a
 * rule wrote waits for sending hours; one a person wrote goes at any hour, since that person is awake and asked.
 * The helper is told what the chat should look like (name, username, the last messages on record), and types
 * nothing unless the chat it opens matches.
 */
function nextSuiteTask(db: Db, now: Date) {
  const o = store(db), s = o.settings;
  const none = (reason: string, retryInSec = 60) => ({ task: null, reason, retryInSec: Math.round(Math.min(900, Math.max(5, retryInSec))) });
  if (!suiteSending(db)) return none("Sending through Meta Business Suite is switched off in the app.", 900);
  if (s.paused) return none(`Paused. ${s.pauseReason}`, 300);
  if (o.prospects.some((p) => p.status === "sending")) return none("A message is being sent.", 60);
  const cancel = (p: Prospect, why: string) => replyDone(db, p, "failed", why);
  for (;;) {
    const rows = o.prospects.filter((p) => p.reply && suiteOf(p) && p.status === "queued");
    if (!rows.length) return none("No inbox message is waiting for Meta Business Suite.", 60);
    const today = local(s.timezone, now).date;
    const sentToday = o.suite?.day?.date === today ? o.suite.day.sent : 0;
    if (SUITE.dailyMax && sentToday >= SUITE.dailyMax) return none(`Today's ${SUITE.dailyMax} messages in Meta Business Suite are done.`, 900);
    const since = o.suite?.lastAt ? now.getTime() - new Date(o.suite.lastAt).getTime() : Infinity;
    if (since < SUITE.gapSeconds * 1000) return none("Leaving a minute between messages in Meta Business Suite.", SUITE.gapSeconds - since / 1000);
    const w = windowOf(s, now);
    // Bubbles of one reply stay in order: only the first waiting message of a chat can go.
    const p = rows.find((r) => (w.open || !suiteOf(r)!.auto) && rows.find((x) => x.reply!.conversationId === r.reply!.conversationId) === r);
    if (!p) return none(`Outside sending hours (${s.hourStart}:00 to ${s.hourEnd}:00).`, Math.min(w.untilOpen, 900));
    const mark = suiteOf(p)!;
    const conv = db.conversations.find((c) => c.id === p.reply!.conversationId);
    // Checked again now, because the message may have waited: the chat may be gone or tagged since it was written.
    if (!conv) { cancel(p, "Not sent: the chat is no longer in the app."); continue; }
    if (conv.labels.includes("Do not contact")) { cancel(p, "Not sent: the chat is tagged Do not contact."); continue; }
    if (mark.auto && conv.labels.includes("Close friend")) { cancel(p, "Not sent: the chat is tagged Close friend."); continue; }
    if (mark.auto && conv.lastInboundAt && conv.lastInboundAt > p.addedAt) { cancel(p, "Not sent: they wrote again before it went out, so it no longer fits."); continue; }
    // What the chat should show: the newest messages on record that really went out or came in.
    const known = db.messages
      .filter((m) => m.conversationId === conv.id && m.id !== p.reply!.messageId && !m.delivery)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
      .slice(0, 4);
    if (!known.length) { cancel(p, "Not sent: the app has no earlier message in this chat to check the Meta Business Suite chat against."); continue; }
    if (!conv.handle && !mark.name) { cancel(p, "Not sent: the chat has no username or name to find it by in Meta Business Suite."); continue; }
    p.status = "sending";
    p.taskId = id("t");
    p.leaseUntil = new Date(now.getTime() + P.leaseMinutes * 60000).toISOString();
    o.suite = { ...o.suite, lastAt: now.toISOString() };
    return {
      task: {
        id: p.taskId, channel: "suite" as const, handle: conv.handle ?? "", name: mark.name, text: p.text ?? "", mode: "auto" as const,
        expect: { last: known.map((m) => ({ text: m.text.slice(0, 2000), partial: m.partial === true, out: m.direction === "out" })) },
        readMs: int(defaults.typing.readMsMin, defaults.typing.readMsMax), typing: s.typing, detect: defaults.detect,
      },
    };
  }
}

const RESULTS = ["sent", "typed", "unreachable", "not_found", "blocked", "error", "skipped"] as const;
type Result = (typeof RESULTS)[number];

/** Records what happened to a task and decides when the next one may go. */
export function recordResult(db: Db, body: { id?: string; status?: string; detail?: string; typedMs?: number; typos?: number }, now = new Date()) {
  const o = db.workspace.outreach, s = o.settings;
  const p = o.prospects.find((x) => x.taskId && x.taskId === body.id);
  if (!p) return { ok: false, paused: s.paused, pauseReason: s.pauseReason };
  const status: Result = RESULTS.includes(body.status as Result) ? (body.status as Result) : "error";
  const detail = str(body.detail, 300);
  const camp = o.campaigns.find((c) => c.id === p.campaignId);
  const day = rollDay(db, now);
  const w = windowOf(s, now);
  // SETTER_OUTREACH_GAP_SCALE exists so tests do not have to sit through real gaps.
  const wait = (sec: number) => { day.nextAt = new Date(now.getTime() + sec * 1000 * Number(process.env.SETTER_OUTREACH_GAP_SCALE ?? 1)).toISOString(); };
  p.taskId = p.leaseUntil = undefined;
  p.detail = detail;

  if (p.reply) {
    const suite = Boolean(suiteOf(p));
    // The minute between Business Suite messages runs from when the last one finished.
    // "error" means the page did not behave as expected (a button or box was not found), not that this lead could
    // not be reached. A few in a row and Business Suite sending stops until a person has looked.
    const broke = suite && status === "error" ? (store(db).suite?.errors ?? 0) + 1 : 0;
    if (suite) {
      const today = local(s.timezone, now).date;
      const was = store(db).suite?.day?.date === today ? store(db).suite!.day!.sent : 0;
      store(db).suite = { lastAt: now.toISOString(), errors: broke, day: { date: today, sent: was + (status === "sent" ? 1 : 0) } };
    }
    // Business Suite messages are always sent by the helper: text left typed and unsent is not a send.
    if (status === "sent" || (status === "typed" && !suite)) replyDone(db, p, "sent", "");
    else replyDone(db, p, "failed", detail || "The helper could not send it.");
    if (broke >= SUITE.errorsBeforePause) pause(db, `${broke} messages in a row could not be sent in Meta Business Suite. Last one: ${detail || "no detail"}. Meta may have changed the page. Nothing more is sent until you resume.`);
    if (status === "blocked") {
      pause(db, suite
        ? `Meta Business Suite showed a warning or asked you to sign in${detail ? `: ${detail.replace(/[.\s]+$/, "")}` : ""}. Open Meta Business Suite in Chrome, clear it, then resume.`
        : `Instagram showed a warning or asked you to confirm it is you${detail ? `: ${detail.replace(/[.\s]+$/, "")}` : ""}. Open Instagram, clear it, wait at least a day, then resume.`);
    }
    log(db, { handle: p.handle || suiteOf(p)?.name || "", campaign: suite ? "Business Suite" : "Inbox reply", status, detail, typedMs: typeof body.typedMs === "number" ? Math.round(body.typedMs) : undefined, typos: typeof body.typos === "number" ? body.typos : undefined });
    return { ok: true, paused: s.paused, pauseReason: s.pauseReason };
  }

  if (p.test) {
    // A test counts towards today's number but never moves the schedule or the error count.
    if (status === "sent" || status === "typed") { p.status = status; p.sentAt = now.toISOString(); day.sent++; }
    else if (status === "unreachable" || status === "not_found") p.status = status;
    else p.status = "failed";
    if (status === "blocked") pause(db, `Instagram showed a warning or asked you to confirm it is you${detail ? `: ${detail.replace(/[.\s]+$/, "")}` : ""}. Open Instagram, clear it, wait at least a day, then resume.`);
    log(db, { handle: p.handle, campaign: "Test message", status, detail, typedMs: typeof body.typedMs === "number" ? Math.round(body.typedMs) : undefined, typos: typeof body.typos === "number" ? body.typos : undefined });
    return { ok: true, paused: s.paused, pauseReason: s.pauseReason };
  }

  if (status === "sent" || status === "typed") {
    p.status = status as ProspectStatus;
    p.sentAt = now.toISOString();
    day.sent++;
    if (day.sent === 1) s.daysSent++;
    if (camp) camp.lastSentAt = p.sentAt;
    // Spread what is left of today's number across what is left of the day, never evenly.
    const left = Math.max(1, day.target - day.sent);
    wait(Math.max(s.minGapSeconds * rand(0.8, 1.4), (w.left / left) * rand(0.45, 1.5)));
  } else if (status === "unreachable" || status === "not_found") {
    p.status = status;
    wait(rand(45, 150));
  } else if (status === "skipped") {
    p.status = "queued";
    wait(rand(240, 480));
  } else if (status === "blocked") {
    p.status = "queued";
    pause(db, `Instagram showed a warning or asked you to confirm it is you${detail ? `: ${detail.replace(/[.\s]+$/, "")}` : ""}. Open Instagram, clear it, wait at least a day, then resume.`);
  } else {
    p.attempts++;
    p.status = p.attempts >= 2 ? "failed" : "queued";
    day.errors++;
    wait(rand(480, 900));
    if (day.errors >= P.errorsBeforePause) pause(db, `${day.errors} sends failed today. Last one: ${detail || "no detail"}. Check the extension's selector health check, then resume.`);
  }
  log(db, { handle: p.handle, campaign: camp?.name ?? "", status, detail, typedMs: typeof body.typedMs === "number" ? Math.round(body.typedMs) : undefined, typos: typeof body.typos === "number" ? body.typos : undefined });
  return { ok: true, paused: s.paused, pauseReason: s.pauseReason };
}

/* ---------- results ---------- */

const BOOKED = new Set(["booked", "showed", "no_show", "won"]);

/** Sent, replied and booked for every campaign and message version. Replies are read from the inbox by handle. */
export function outreachStats(db: Db) {
  const o = db.workspace.outreach;
  const byHandle = new Map(db.conversations.filter((c) => c.handle).map((c) => [c.handle!.toLowerCase(), c]));
  const lastIn = new Map<string, string>();
  for (const m of db.messages) if (m.direction === "in" && (lastIn.get(m.conversationId) ?? "") < m.sentAt) lastIn.set(m.conversationId, m.sentAt);
  const blank = () => ({ sent: 0, replied: 0, booked: 0 });
  const camp = new Map(o.campaigns.map((c) => [c.id, { ...blank(), queued: 0, failed: 0, variants: new Map(c.variants.map((v) => [v.id, blank()])) }]));
  for (const p of o.prospects) {
    for (const c of o.campaigns) if (p.status === "queued" && c.listIds.includes(p.listId)) camp.get(c.id)!.queued++;
    const row = p.campaignId ? camp.get(p.campaignId) : undefined;
    if (!row) continue;
    if (p.status === "failed" || p.status === "unreachable" || p.status === "not_found") row.failed++;
    if (p.status !== "sent" && p.status !== "typed") continue;
    const conv = byHandle.get(p.handle);
    const replied = Boolean(conv && p.sentAt && (lastIn.get(conv.id) ?? "") > p.sentAt);
    const booked = Boolean(replied && conv && BOOKED.has(conv.stage));
    for (const t of [row, p.variantId ? row.variants.get(p.variantId) : undefined]) {
      if (!t) continue;
      t.sent++;
      if (replied) t.replied++;
      if (booked) t.booked++;
    }
  }
  return o.campaigns.map((c) => {
    const r = camp.get(c.id)!;
    return { id: c.id, sent: r.sent, replied: r.replied, booked: r.booked, queued: r.queued, failed: r.failed, variants: c.variants.map((v) => ({ id: v.id, ...r.variants.get(v.id)! })) };
  });
}

/* ---------- conversation starters inside Meta's rules ---------- */

export function cleanLinks(input: unknown, prev: EntryLink[]): EntryLink[] {
  if (!Array.isArray(input)) throw new Error("Links must be a list.");
  const refs = new Set<string>();
  return input.slice(0, 50).map((raw) => {
    const b = raw as Record<string, unknown>;
    const old = prev.find((l) => l.id === b.id);
    const label = str(b.label, 60);
    if (!label) throw new Error("Every link needs a name.");
    let ref = (str(b.ref, 40) || label).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "link";
    while (refs.has(ref)) ref += "-2";
    refs.add(ref);
    return { id: old?.id ?? id("el"), ref, label, opener: str(b.opener, 1000), tags: Array.isArray(b.tags) ? b.tags.filter((t): t is string => typeof t === "string").slice(0, 8) : [], opened: old?.opened ?? 0, createdAt: old?.createdAt ?? new Date().toISOString() };
  });
}

export function cleanCommentTriggers(input: unknown, prev: CommentTrigger[]): CommentTrigger[] {
  if (!Array.isArray(input)) throw new Error("Comment replies must be a list.");
  return input.slice(0, 50).map((raw) => {
    const b = raw as Record<string, unknown>;
    const old = prev.find((t) => t.id === b.id);
    const name = str(b.name, 60);
    const keywords = (Array.isArray(b.keywords) ? b.keywords : String(b.keywords ?? "").split(",")).map((k) => str(k, 40).toLowerCase()).filter(Boolean).slice(0, 20);
    const reply = str(b.reply, 1000);
    if (!name) throw new Error("Every comment reply needs a name.");
    if (!keywords.length) throw new Error(`"${name}" needs at least one keyword.`);
    if (!reply) throw new Error(`"${name}" needs a message to send.`);
    return { id: old?.id ?? id("ct"), name, keywords, match: b.match === "exact" ? "exact" : "contains", reply, tags: Array.isArray(b.tags) ? b.tags.filter((t): t is string => typeof t === "string").slice(0, 8) : [], enabled: b.enabled !== false, fired: old?.fired ?? 0 };
  });
}

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function matchComment(db: Db, text: string): CommentTrigger | null {
  const t = text.trim().toLowerCase().replace(/[.!?,]+$/, "");
  for (const trig of db.workspace.outreach.commentTriggers) {
    if (!trig.enabled) continue;
    for (const k of trig.keywords) if (trig.match === "exact" ? t === k : new RegExp(`(^|[^a-z0-9])${esc(k)}([^a-z0-9]|$)`).test(t)) return trig;
  }
  return null;
}

const hourly: number[] = [];
/** Meta allows 750 private replies an hour for each account. This keeps us under it. */
export function privateReplyAllowed(now = Date.now()) {
  while (hourly.length && hourly[0] < now - 3600_000) hourly.shift();
  if (hourly.length >= defaults.privateReply.perHour - 10) return false;
  hourly.push(now);
  return true;
}

/* ---------- test message ---------- */

/** Queues one test message to a handle the owner chose. The helper picks it up on its next check. */
export function queueTest(db: Db, input: { handle?: unknown; text?: unknown; mode?: unknown }) {
  const o = db.workspace.outreach;
  if (o.settings.paused) throw new Error(`Sending is paused. ${o.settings.pauseReason}`);
  const handle = cleanHandle(String(input.handle ?? ""));
  if (!handle) throw new Error("Type the Instagram username to send the test to, for example your second account.");
  const text = str(input.text, 1000);
  if (!text) throw new Error("The test message could not be written.");
  if (o.prospects.some((p) => p.test && (p.status === "queued" || p.status === "sending"))) throw new Error("A test message is already on its way. Give it a minute.");
  // Old tests are cleared so the list never grows.
  const old = o.prospects.filter((p) => p.test);
  if (old.length >= 10) o.prospects = o.prospects.filter((p) => !p.test || old.indexOf(p) >= old.length - 9);
  const p: Prospect = { id: id("p"), listId: "test", handle, name: "", fields: {}, status: "queued", text, attempts: 0, test: true, testMode: input.mode === "assisted" ? "assisted" : "auto", addedAt: new Date().toISOString() };
  o.prospects.push(p);
  return p;
}

export const testSends = (db: Db) => (expireLeases(db, new Date()), db.workspace.outreach.prospects.filter((p) => p.test).slice(-5).reverse().map((p) => ({ id: p.id, handle: p.handle, status: p.status, detail: p.detail ?? "", mode: p.testMode ?? "assisted", text: p.text, sentAt: p.sentAt ?? "", addedAt: p.addedAt })));

/**
 * Queues messages already written in the inbox for the helper to type in the owner's Chrome. Each message is one
 * task, typed in order. With suite set they go out inside Meta Business Suite's inbox and are never handed to the
 * part of the helper that types inside instagram.com.
 */
export function queueReply(db: Db, input: { conversationId: string; handle: string; messages: { id: string; text: string }[]; suite?: SuiteMark }) {
  const o = db.workspace.outreach;
  const now = new Date().toISOString();
  for (const m of input.messages) {
    const row: QueueRow = { id: id("p"), listId: "reply", handle: input.handle, name: "", fields: {}, status: "queued", text: m.text, attempts: 0, reply: { conversationId: input.conversationId, messageId: m.id }, addedAt: now };
    if (input.suite) row.suite = input.suite;
    o.prospects.push(row);
  }
}

/** Marks the inbox message with how the helper got on, and drops the finished task so the list never grows. */
function replyDone(db: Db, p: Prospect, outcome: "sent" | "failed", note: string) {
  const m = db.messages.find((x) => x.id === p.reply!.messageId);
  if (m) {
    if (outcome === "sent") { delete m.delivery; delete m.deliveryNote; m.sentAt = new Date().toISOString(); }
    else { m.delivery = "failed"; m.deliveryNote = note; }
  }
  const o = db.workspace.outreach;
  if (outcome === "failed") {
    // The rest of the same reply would arrive out of context, so it is held back too.
    for (const q of o.prospects) if (q !== p && q.reply?.conversationId === p.reply!.conversationId && q.status === "queued") replyDone(db, q, "failed", "Not sent because the message before it failed.");
  }
  o.prospects = o.prospects.filter((q) => q !== p);
}

/** Inbox replies the helper has not typed yet, for the screen that shows whether it is keeping up. */
export const pendingReplies = (db: Db) => db.workspace.outreach.prospects.filter((p) => p.reply && (p.status === "queued" || p.status === "sending")).length;

/* ---------- the owner's own followers: never cold messaged ---------- */

/**
 * Records handles that follow the owner. Nothing is added to any list to message: these are the people left out.
 * Anyone of them still waiting on a prospect list is taken off it straight away.
 * whole: the handles came from Instagram's own download, the only source that holds every follower. Only that
 * lets cold messages start. The helper's reader sees about the newest 14, so it tops the record up and no more.
 */
export function recordFollowers(db: Db, input: unknown, whole = true) {
  const o = store(db);
  const set = new Set(o.followerHandles ?? []);
  const before = set.size;
  let read = 0, full = false;
  for (const raw of Array.isArray(input) ? input.slice(0, MAX_FOLLOWERS) : []) {
    const h = typeof raw === "string" ? cleanHandle(raw) : "";
    if (!h) continue;
    read++;
    if (set.has(h)) continue;
    if (set.size >= MAX_FOLLOWERS) { full = true; continue; }
    set.add(h);
  }
  o.followerHandles = [...set];
  if (whole && Array.isArray(input)) o.followersAt = new Date().toISOString();
  let leftOut = 0;
  for (const p of o.prospects) {
    if (p.status !== "queued" || p.reply || p.test || !set.has(p.handle)) continue;
    p.status = "skipped";
    p.detail = FOLLOWS_YOU;
    leftOut++;
  }
  return { read, recorded: set.size - before, total: set.size, leftOut, full };
}

/** Forgets the recorded followers. Cold messages then wait until the list is added again. */
export function clearFollowers(db: Db) {
  const o = store(db);
  o.followerHandles = [];
  o.followersAt = undefined;
}

/** How many followers are on record and when the full file was last added, for the Outreach screen. The handles themselves stay on the server. */
export function followersKnown(db: Db) {
  const o = store(db);
  return { count: o.followerHandles?.length ?? 0, updatedAt: o.followersAt ?? "", max: MAX_FOLLOWERS };
}

/** Asks the Chrome helper to read the owner's newest followers, so they are left out of cold messages. */
export function requestFollowers(db: Db, max: unknown) {
  const o = db.workspace.outreach;
  o.followers = { status: "wanted", max: Math.max(50, Math.min(MAX_PROSPECTS, Math.round(Number(max)) || 500)), collected: 0, added: 0, cursor: "", listId: "", error: "", requestedAt: new Date().toISOString() };
  return o.followers;
}

/** What the helper should do next: nothing, or read the next page from this place. */
export function followersJob(db: Db) {
  const j = db.workspace.outreach.followers;
  if (!j || (j.status !== "wanted" && j.status !== "running")) return { want: false as const };
  return { want: true as const, account: db.workspace.outreach.settings.account || db.workspace.helper?.account || "", left: j.max - j.collected };
}

/** One page of followers from the helper. They are recorded as followers only, never as people to message. */
export function followersBatch(db: Db, b: { users?: unknown; end?: unknown; error?: unknown; note?: unknown }) {
  const o = db.workspace.outreach, j = o.followers;
  if (!j || (j.status !== "wanted" && j.status !== "running")) return { done: true, added: 0 };
  const stop = (status: "done" | "failed", error = "") => { j.status = status; j.error = error.slice(0, 300); j.finishedAt = new Date().toISOString(); return { done: true, added: j.added }; };
  if (typeof b.error === "string" && b.error) return stop("failed", b.error);
  const users = (Array.isArray(b.users) ? b.users : []).slice(0, 200) as { username?: unknown }[];
  j.status = "running";
  if (typeof b.note === "string") j.note = b.note.slice(0, 400);
  // "added" now counts followers newly put on record.
  j.added += recordFollowers(db, users.map((u) => String(u?.username ?? "")), false).recorded;
  j.collected += users.length;
  if (b.end === true || j.collected >= j.max) return stop("done", j.collected ? "" : "The list opened but no followers could be read from it.");
  return { done: false, added: j.added };
}
