import { randomUUID } from "crypto";
import type { CalendarConfig, CalendarSlot, Conversation, Db, Workspace } from "./types";

// The owner's Calendly calendar. When a conversation reaches the point of proposing a call, the free times are
// read from Calendly and the AI offers a few of them by name. When the lead picks one, the AI sends the link
// that opens Calendly on exactly that time, so the lead only has to confirm.
// Reads only: nothing here books, moves or cancels anything in the calendar.

const BASE = () => (process.env.CALENDLY_API_BASE || "https://api.calendly.com").replace(/\/$/, "");
/** Calendly accepts at most seven days per availability request. */
const WINDOW_DAYS = 7;
const CACHE_MS = 2 * 60_000;

export const defaultCalendar = (): CalendarConfig => ({
  provider: "calendly", enabled: true, eventTypes: [], eventTypeUri: "", offer: 3, daysAhead: 5, minNoticeHours: 3, timezone: "",
});

const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

export function normaliseCalendar(c?: Partial<CalendarConfig>): CalendarConfig {
  const d = defaultCalendar();
  return {
    ...d, ...c, provider: "calendly",
    enabled: c?.enabled !== false,
    eventTypes: Array.isArray(c?.eventTypes) ? c.eventTypes : [],
    offer: clamp(c?.offer, 2, 4, d.offer),
    daysAhead: clamp(c?.daysAhead, 1, 14, d.daysAhead),
    minNoticeHours: clamp(c?.minNoticeHours, 0, 72, d.minNoticeHours),
  };
}

export const calendarConnected = (ws: Workspace) => Boolean(ws.calendar.token && ws.calendar.user);
/** Connected, switched on and pointed at a meeting type. */
export const calendarReady = (ws: Workspace) => calendarConnected(ws) && ws.calendar.enabled && Boolean(eventType(ws));
export const eventType = (ws: Workspace) => ws.calendar.eventTypes.find((e) => e.uri === ws.calendar.eventTypeUri);
export const calendarZone = (ws: Workspace) => ws.calendar.timezone || ws.calendar.user?.timezone || "Europe/London";

async function call<T>(token: string, path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE() + path, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error("Calendly could not be reached. Check the internet connection and try again.");
  }
  if (res.status === 401) throw new Error("Calendly rejected the token. Copy a fresh one from the Calendly page and paste it again.");
  if (res.status === 403) throw new Error("Calendly refused this request. The token may belong to a different account than the meeting type.");
  if (res.status === 429) throw new Error("Calendly is asking us to slow down. Try again in a minute.");
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(`Calendly answered ${res.status}${body.message ? `: ${body.message}` : ""}.`);
  return body as T;
}

/** Checks the token, reads who it belongs to and which meeting types they have. */
export async function connectCalendar(db: Db, token: string) {
  const t = token.trim();
  if (!t) throw new Error("Paste the Calendly token first.");
  const me = await call<{ resource: { uri: string; name: string; scheduling_url: string; timezone: string } }>(t, "/users/me");
  const cal = db.workspace.calendar;
  cal.token = t;
  cal.user = { uri: me.resource.uri, name: me.resource.name, url: me.resource.scheduling_url, timezone: me.resource.timezone };
  cal.timezone ||= me.resource.timezone;
  cal.connectedAt = new Date().toISOString();
  cal.enabled = true;
  await refreshEventTypes(db);
  return cal;
}

export async function refreshEventTypes(db: Db) {
  const cal = db.workspace.calendar;
  if (!cal.token || !cal.user) throw new Error("Connect Calendly first.");
  const r = await call<{ collection: { uri: string; name: string; duration: number; scheduling_url: string; active: boolean }[] }>(cal.token, `/event_types?user=${encodeURIComponent(cal.user.uri)}&active=true&count=100`);
  cal.eventTypes = r.collection.filter((e) => e.active !== false).map((e) => ({ uri: e.uri, name: e.name, minutes: e.duration, url: e.scheduling_url }));
  if (!cal.eventTypes.some((e) => e.uri === cal.eventTypeUri)) {
    // The meeting type the call link in the business brief already points at is the obvious first choice.
    const goals = db.workspace.intake.goals.filter((g) => g.type === "call" && g.url).map((g) => g.url.toLowerCase().replace(/\/$/, ""));
    cal.eventTypeUri = (cal.eventTypes.find((e) => goals.some((g) => g.startsWith(e.url.toLowerCase()) || e.url.toLowerCase().startsWith(g))) ?? cal.eventTypes[0])?.uri ?? "";
  }
  cal.lastError = "";
  cache().clear();
  return cal.eventTypes;
}

export function disconnectCalendar(db: Db) {
  db.workspace.calendar = defaultCalendar();
  cache().clear();
}

const g = globalThis as unknown as { __setterSlots?: Map<string, { at: number; slots: CalendarSlot[] }> };
const cache = (): Map<string, { at: number; slots: CalendarSlot[] }> => (g.__setterSlots ??= new Map());

/** Every free time from now until daysAhead, earliest first. Cached for two minutes so a busy inbox does not hammer Calendly. */
export async function freeSlots(ws: Workspace, fresh = false): Promise<CalendarSlot[]> {
  const cal = ws.calendar;
  const type = eventType(ws);
  if (!cal.token || !type) return [];
  const key = `${type.uri}|${cal.daysAhead}|${cal.minNoticeHours}`;
  const hit = cache().get(key);
  const earliest = Date.now() + Math.max(cal.minNoticeHours * 3_600_000, 5 * 60_000);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.slots.filter((s) => new Date(s.start).getTime() >= earliest);
  const end = Date.now() + cal.daysAhead * 86_400_000;
  const slots: CalendarSlot[] = [];
  for (let from = earliest; from < end; from += WINDOW_DAYS * 86_400_000) {
    const to = Math.min(end, from + WINDOW_DAYS * 86_400_000);
    const q = `event_type=${encodeURIComponent(type.uri)}&start_time=${encodeURIComponent(new Date(from).toISOString())}&end_time=${encodeURIComponent(new Date(to).toISOString())}`;
    const r = await call<{ collection: { status: string; start_time: string; scheduling_url: string }[] }>(cal.token, `/event_type_available_times?${q}`);
    for (const s of r.collection) if (s.status === "available" && s.scheduling_url) slots.push({ start: new Date(s.start_time).toISOString(), url: s.scheduling_url });
  }
  slots.sort((a, b) => a.start.localeCompare(b.start));
  cache().set(key, { at: Date.now(), slots });
  return slots;
}

const part = (d: Date, tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...o }).format(d);
const dayKey = (iso: string, tz: string) => part(new Date(iso), tz, { year: "numeric", month: "2-digit", day: "2-digit" });
const hourOf = (iso: string, tz: string) => Number(part(new Date(iso), tz, { hour: "2-digit", hourCycle: "h23" }));

/** "2pm" or "2:30pm" */
export function clock(iso: string, tz: string) {
  const [h, m] = part(new Date(iso), tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

/** "today at 4pm", "tomorrow at 10am", "Thursday 16 Oct at 2:30pm" */
export function slotLabel(iso: string, tz: string, now = new Date()) {
  const k = dayKey(iso, tz);
  const day = k === dayKey(now.toISOString(), tz) ? "today"
    : k === dayKey(new Date(now.getTime() + 86_400_000).toISOString(), tz) ? "tomorrow"
      : `${part(new Date(iso), tz, { weekday: "long" })} ${part(new Date(iso), tz, { day: "numeric", month: "short" })}`;
  return `${day} at ${clock(iso, tz)}`;
}

/** How the timezone is said to a lead: "UK time" reads better than "GMT+1". */
export function zoneName(tz: string, at = new Date()) {
  if (tz === "Europe/London") return "UK time";
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? tz;
}

/**
 * The few times worth offering first: spread over different days, alternating a morning and an afternoon,
 * so the lead has a real choice instead of three slots in the same hour.
 */
export function pickSlots(slots: CalendarSlot[], n: number, tz: string): CalendarSlot[] {
  const days = new Map<string, CalendarSlot[]>();
  for (const s of slots) days.set(dayKey(s.start, tz), [...(days.get(dayKey(s.start, tz)) ?? []), s]);
  const out: CalendarSlot[] = [];
  let i = 0;
  for (const list of days.values()) {
    if (out.length >= n) break;
    const afternoon = list.find((s) => hourOf(s.start, tz) >= 13);
    out.push(i % 2 === 1 && afternoon ? afternoon : list[0]);
    i++;
  }
  // Fewer free days than times wanted: fill from what is left, keeping at least two hours between offers.
  for (const s of slots) {
    if (out.length >= n) break;
    if (out.every((o) => Math.abs(new Date(o.start).getTime() - new Date(s.start).getTime()) >= 2 * 3_600_000)) out.push(s);
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** A wider spread the AI can draw on when a lead asks for another day or time: up to six a day. */
function menu(slots: CalendarSlot[], tz: string) {
  const perDay = new Map<string, number>();
  return slots.filter((s) => {
    const k = dayKey(s.start, tz);
    const n = perDay.get(k) ?? 0;
    // Six a day, spaced, so mornings and afternoons both show up.
    if (n >= 6) return false;
    perDay.set(k, n + 1);
    return true;
  }).slice(0, 48);
}

export interface CalendarOffer {
  tz: string;
  zone: string;
  meeting: string;
  minutes: number;
  /** The times to lead with */
  picks: CalendarSlot[];
  /** Everything the AI may offer */
  all: CalendarSlot[];
  /** The plain booking page, for when no listed time suits */
  url: string;
}

/** What the AI needs to propose a call in this conversation, or null when the calendar is not in play. */
export async function offerFor(ws: Workspace): Promise<CalendarOffer | null> {
  if (!calendarReady(ws)) return null;
  const type = eventType(ws)!;
  const tz = calendarZone(ws);
  try {
    const slots = await freeSlots(ws);
    ws.calendar.lastError = "";
    const spread = spaced(slots, tz);
    return { tz, zone: zoneName(tz), meeting: type.name, minutes: type.minutes, picks: pickSlots(spread, ws.calendar.offer, tz), all: menu(spread, tz), url: type.url };
  } catch (e) {
    // A calendar problem must never stop a reply: the AI falls back to the plain booking link.
    ws.calendar.lastError = (e as Error).message;
    return null;
  }
}

/** Calendly can return a slot every 15 minutes. Offering 9:00, 9:15 and 9:30 is noise, so keep one an hour. */
function spaced(slots: CalendarSlot[], tz: string) {
  const seen = new Set<string>();
  return slots.filter((s) => {
    const k = `${dayKey(s.start, tz)}-${hourOf(s.start, tz)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The free times as the AI reads them in each turn. */
export function offerBlock(o: CalendarOffer | null, conv: Conversation) {
  if (!o) return "";
  const offered = conv.proposed?.slots.filter((s) => o.all.some((a) => a.start === s.start) || new Date(s.start).getTime() > Date.now()) ?? [];
  return `
<available_call_times meeting="${o.meeting}, ${o.minutes} minutes" timezone="${o.zone}" read_from_calendar_at="${new Date().toISOString()}">
${o.all.length ? o.all.map((s) => `- start=${s.start} | say: ${slotLabel(s.start, o.tz)} | link: ${s.url}`).join("\n") : "No free times in the coming days."}
Suggested to lead with: ${o.picks.map((s) => slotLabel(s.start, o.tz)).join("; ") || "none"}
Booking page if none of these suit: ${o.url}
</available_call_times>
<times_already_offered_to_this_lead>
${offered.length ? offered.map((s) => `- start=${s.start} | ${slotLabel(s.start, o.tz)} | link: ${s.url}`).join("\n") : "None yet."}
</times_already_offered_to_this_lead>
`;
}

/** The part of the AI's standing instructions that covers the calendar. Empty when no calendar is connected. */
export function calendarRules(ws: Workspace) {
  if (!calendarReady(ws)) return "";
  return `
Proposing the call: the owner's calendar is connected, and available_call_times in each turn lists what is free right now.
- When the conversation has reached the point of proposing the call (the lead is a fit, has reacted well, and the call goal's "send when" is met), do not send the bare booking link. Offer ${ws.calendar.offer === 2 ? "two" : "two or three"} of the listed times instead, in the owner's voice, the way a person would: "i've got tomorrow at 2pm or thursday at 10am, which is better for you?". Prefer times on different days. Say the timezone once.
- Use the wording after "say:" for each time. Never mention a time that is not on the list, and never say a time is free from memory of earlier in the thread: only the current list counts.
- Put the start value of every time you offer in offered_times.
- If the lead asks for a different day or part of the day, offer the closest listed times. If nothing listed suits them, send the booking page link so they can choose for themselves.
- When the lead picks one of the listed times, confirm it warmly and send that time's link exactly as listed, saying they just need to confirm their details there. Put its start value in picked_time. The call is only booked once they complete that page, so never say it is booked.
- If the time they picked is no longer on the list, say it has just gone and offer the nearest ones.
- If the list is empty, send the booking page link.`;
}

/** Every address the AI may send because of the calendar. */
export function calendarUrls(o: CalendarOffer | null) {
  return o ? [o.url, ...o.all.map((s) => s.url)] : [];
}

/** A sent message that contains the booking page or one of its time links. */
export function calendarLinkIn(ws: Workspace, text: string) {
  const type = eventType(ws);
  return type && text.toLowerCase().includes(type.url.toLowerCase().replace(/\/$/, "")) ? { label: `${type.name} (Calendly)` } : undefined;
}

/**
 * Called for every message that goes out. When it is the draft in which the AI offered times, the offer is
 * remembered on the conversation, so the next turn knows what the lead is choosing between.
 */
export function noteTimesSent(db: Db, conv: Conversation, text: string, by: "ai" | "human" | "system", memberId?: string) {
  // The link of a time on offer went out: that is the time this lead is booking.
  const sentLink = [...(conv.suggestion?.picked ? [conv.suggestion.picked] : []), ...(conv.proposed?.slots ?? [])].find((x) => text.includes(x.url));
  if (sentLink) conv.proposed = { at: conv.proposed?.at ?? new Date().toISOString(), draft: conv.proposed?.draft ?? "", slots: conv.proposed?.slots ?? [sentLink], picked: sentLink };
  const s = conv.suggestion;
  const tz = calendarZone(db.workspace);
  // The draft may have been reworded by a person before sending: it still counts if it names one of the times.
  if (!s?.times?.length || conv.proposed?.draft === s.createdAt || !(s.bubbles.includes(text) || s.times.some((x) => text.toLowerCase().includes(clock(x.start, tz))))) return;
  conv.proposed = { at: new Date().toISOString(), draft: s.createdAt, slots: s.times };
  db.events.push({ id: `e_${randomUUID().slice(0, 12)}`, conversationId: conv.id, type: "times_proposed", detail: s.times.map((t) => slotLabel(t.start, tz)).join(", "), by, ...(memberId ? { memberId } : {}), at: conv.proposed.at });
}

/**
 * Which offered time a lead means by "thursday works" or "2pm is good". Used by the keyword engine only;
 * Claude reads the reply itself. Returns nothing unless exactly one time fits.
 */
export function matchPick(text: string, slots: CalendarSlot[], tz: string, now = new Date()): CalendarSlot | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9: ]+/g, " ")} `;
  const ordinal = [/\b(first|1st|earlier|former)\b/, /\b(second|2nd|middle)\b/, /\b(third|3rd)\b/];
  if (/\b(last|latter|later one)\b/.test(t) && slots.length) return slots[slots.length - 1];
  for (let i = 0; i < ordinal.length; i++) if (ordinal[i].test(t) && slots[i]) return slots[i];
  const scored = slots.map((s) => {
    const d = new Date(s.start);
    const label = slotLabel(s.start, tz, now);
    const weekday = part(d, tz, { weekday: "long" }).toLowerCase();
    const day = label.startsWith("today") ? /\b(today|tonight)\b/.test(t) : label.startsWith("tomorrow") ? /\btomorrow\b/.test(t) : false;
    const named = t.includes(` ${weekday}`) || t.includes(` ${weekday.slice(0, 3)} `);
    const c = clock(s.start, tz);
    const [h, m] = part(d, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":");
    const time = t.includes(` ${c} `) || t.includes(` ${c.replace(/(am|pm)$/, " $1")} `) || t.includes(` ${h}:${m} `) || t.includes(` ${Number(h) % 12 || 12}:${m} `) || (m === "00" && new RegExp(` (at )?${Number(h) % 12 || 12} `).test(t) && !/\d (minutes|mins|days|weeks|k)\b/.test(t));
    return { s, score: (day || named ? 2 : 0) + (time ? 2 : 0) };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length || (scored[1] && scored[1].score === scored[0].score)) return null;
  return scored[0].s;
}

const sync = globalThis as unknown as { __setterBookingSync?: number };

/**
 * Looks in Calendly for calls that now exist at a time a lead was sent the link for, and returns those leads so
 * they can be marked as booked. Runs at most every three minutes unless forced.
 */
export async function findBookings(db: Db, force = false): Promise<Conversation[]> {
  const cal = db.workspace.calendar;
  const type = eventType(db.workspace);
  if (!cal.token || !cal.user || !type) return [];
  if (!force && Date.now() - (sync.__setterBookingSync ?? 0) < 180_000) return [];
  sync.__setterBookingSync = Date.now();
  const waiting = db.conversations.filter((c) => c.proposed?.picked && c.stage === "link_sent" && new Date(c.proposed.picked.start).getTime() > Date.now() - 3_600_000);
  if (!waiting.length) return [];
  const starts = waiting.map((c) => new Date(c.proposed!.picked!.start).getTime());
  const q = `user=${encodeURIComponent(cal.user.uri)}&status=active&count=100&min_start_time=${encodeURIComponent(new Date(Math.min(...starts) - 60_000).toISOString())}&max_start_time=${encodeURIComponent(new Date(Math.max(...starts) + 60_000).toISOString())}`;
  const r = await call<{ collection: { start_time: string; event_type: string }[] }>(cal.token, `/scheduled_events?${q}`);
  const taken = new Set(r.collection.filter((e) => e.event_type === type.uri).map((e) => new Date(e.start_time).getTime()));
  return waiting.filter((c) => taken.has(new Date(c.proposed!.picked!.start).getTime()));
}

/** What Settings and Get connected show. The token never leaves the server. */
export function calendarView(ws: Workspace) {
  const { token, ...rest } = ws.calendar;
  return { ...rest, tokenSet: Boolean(token), connected: calendarConnected(ws), ready: calendarReady(ws), zone: zoneName(calendarZone(ws)) };
}
