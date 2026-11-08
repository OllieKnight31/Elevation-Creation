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

export function defaultOutreach(): Outreach {
  return {
    settings: {
      enabled: false, mode: "auto", account: "", dailyMin: P.dailyMin, dailyMax: P.dailyMax, hourStart: P.hourStart, hourEnd: P.hourEnd,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London", ramp: true, rampStart: P.rampStart, rampStep: P.rampStep,
      daysSent: 0, minGapSeconds: P.minGapSeconds, typing: { ...defaults.typing }, paused: false, pauseReason: "",
    },
    lists: [], prospects: [], campaigns: [], log: [], day: { date: "", target: 0, sent: 0, errors: 0, nextAt: null },
    links: [], commentTriggers: [], repliedComments: [],
  };
}

/** Fills anything a saved workspace is missing, so older data keeps working. */
export function normaliseOutreach(o: Partial<Outreach> | undefined): Outreach {
  const d = defaultOutreach();
  if (!o) return d;
  return {
    ...d, ...o,
    settings: { ...d.settings, ...o.settings, typing: { ...d.settings.typing, ...o.settings?.typing } },
    day: { ...d.day, ...o.day },
  };
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
  const o = db.workspace.outreach;
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
    const name = str(listName, 60) || `List ${o.lists.length + 1}`;
    list = { id: id("l"), name, columns: cols, createdAt: new Date().toISOString() };
    o.lists.push(list);
  } else list.columns = [...new Set([...list.columns, ...cols])].slice(0, 30);

  const known = new Set(o.prospects.filter((p) => !p.test && !p.reply).map((p) => p.handle));
  const inbox = new Set(db.conversations.map((c) => c.handle?.toLowerCase()).filter(Boolean));
  let added = 0, duplicates = 0, invalid = 0, alreadyLeads = 0;
  const now = new Date().toISOString();
  for (const r of rows.slice(hasHeader ? 1 : 0)) {
    const handle = cleanHandle(r[hCol] ?? "");
    if (!handle) { invalid++; continue; }
    if (known.has(handle)) { duplicates++; continue; }
    if (inbox.has(handle)) { alreadyLeads++; continue; }
    if (o.prospects.length >= MAX_PROSPECTS) throw new Error(`The limit is ${MAX_PROSPECTS} prospects. Delete a finished list to make room.`);
    known.add(handle);
    const fields: Record<string, string> = {};
    if (hasHeader) header.forEach((h, i) => { if (h && i !== hCol && i !== nCol && cols.includes(h) && r[i]?.trim()) fields[h] = r[i].trim().slice(0, 300); });
    o.prospects.push({ id: id("p"), listId: list.id, handle, name: nCol >= 0 ? (r[nCol] ?? "").trim().slice(0, 80) : "", fields, status: "queued", attempts: 0, addedAt: now });
    added++;
  }
  if (!added && !o.prospects.some((p) => p.listId === list!.id)) o.lists = o.lists.filter((l) => l.id !== list!.id);
  return { listId: list.id, added, duplicates, invalid, alreadyLeads };
}

/* ---------- settings and campaigns ---------- */

export function cleanSettings(input: unknown, prev: OutreachSettings): OutreachSettings {
  const b = (input ?? {}) as Record<string, unknown>;
  const t = (b.typing ?? {}) as Record<string, unknown>;
  const dailyMax = Math.round(clamp(b.dailyMax, 1, P.hardMax, prev.dailyMax));
  const hourStart = Math.round(clamp(b.hourStart, 0, 23, prev.hourStart));
  const wpmMin = Math.round(clamp(t.wpmMin, 15, 110, prev.typing.wpmMin));
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
    if (p.reply) { replyDone(db, p, "failed", "The helper did not report back in time. Check the thread in Instagram before sending it again."); continue; }
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
  };
}

/** Hands the extension the next message to send, or the reason there is none and when to ask again. */
export function nextTask(db: Db, account: string, now = new Date()) {
  const o = db.workspace.outreach, s = o.settings;
  // First, so a task the helper never reported on is released even while outreach is switched off.
  expireLeases(db, now);
  // Without Meta, inbox replies go out through the helper, so it asks again within a minute and a reply never waits long.
  // With Meta connected, replies go through Meta and the helper can wait longer, which lets the database sleep.
  const cap = db.workspace.meta.instagram ? 900 : 60;
  const none = (reason: string, retryInSec = 60) => ({ task: null, reason, retryInSec: Math.round(Math.min(cap, retryInSec)) });
  // Inbox replies go first, then a test: both were asked for by a person just now.
  const test = o.prospects.find((p) => p.reply && p.status === "queued") ?? o.prospects.find((p) => p.test && p.status === "queued");
  if (!s.enabled && !test) return none("Outreach is switched off in the app.", 300);
  if (s.paused) return none(`Paused. ${s.pauseReason}`, 300);
  const acct = cleanHandle(account || "");
  if (s.account && acct && acct !== s.account) return none(`Chrome is signed in to Instagram as @${acct}, but outreach is set up for @${s.account}.`, 300);
  const day = rollDay(db, now);
  if (o.prospects.some((p) => p.status === "sending")) return none("A message is being sent.", 60);
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
  if (day.sent >= day.target) return none(`Today's ${day.target} messages are done.`, 900);
  if (day.nextAt && new Date(day.nextAt) > now) return none("Waiting for the next send time.", Math.min(600, Math.max(20, (new Date(day.nextAt).getTime() - now.getTime()) / 1000)));

  const inbox = new Set(db.conversations.map((c) => c.handle?.toLowerCase()).filter(Boolean));
  const campaigns = o.campaigns.filter((c) => c.status === "active" && c.variants.length).sort((a, b) => (a.lastSentAt ?? "").localeCompare(b.lastSentAt ?? ""));
  for (const camp of campaigns) {
    for (const p of o.prospects) {
      if (p.status !== "queued" || !camp.listIds.includes(p.listId)) continue;
      if (inbox.has(p.handle)) { p.status = "skipped"; p.detail = "Already in your inbox."; continue; }
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
    if (status === "sent" || status === "typed") replyDone(db, p, "sent", "");
    else replyDone(db, p, "failed", detail || "The helper could not send it.");
    if (status === "blocked") pause(db, `Instagram showed a warning or asked you to confirm it is you${detail ? `: ${detail.replace(/[.\s]+$/, "")}` : ""}. Open Instagram, clear it, wait at least a day, then resume.`);
    log(db, { handle: p.handle, campaign: "Inbox reply", status, detail, typedMs: typeof body.typedMs === "number" ? Math.round(body.typedMs) : undefined, typos: typeof body.typos === "number" ? body.typos : undefined });
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
 * Queues messages already written in the inbox for the helper to type into the thread in the owner's Chrome.
 * This is how the app sends without the Meta connection. Each message is one task, typed in order.
 */
export function queueReply(db: Db, input: { conversationId: string; handle: string; messages: { id: string; text: string }[] }) {
  const o = db.workspace.outreach;
  const now = new Date().toISOString();
  for (const m of input.messages) {
    o.prospects.push({ id: id("p"), listId: "reply", handle: input.handle, name: "", fields: {}, status: "queued", text: m.text, attempts: 0, reply: { conversationId: input.conversationId, messageId: m.id }, addedAt: now });
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
