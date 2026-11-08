import { access } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { saveDb } from "@/lib/store";
import { setStage } from "@/lib/engine";
import { calendarConnected, calendarView, calendarZone, connectCalendar, disconnectCalendar, findBookings, freeSlots, normaliseCalendar, pickSlots, refreshEventTypes, slotLabel, zoneName } from "@/lib/calendar";
import type { Db } from "@/lib/types";

/** The connection plus a live look at what the AI would offer right now. */
async function view(db: Db, fresh = false) {
  const ws = db.workspace;
  const tz = calendarZone(ws);
  let slots: { start: string; url: string; label: string }[] = [];
  let picks: string[] = [];
  let error = "";
  if (calendarConnected(ws) && ws.calendar.eventTypeUri) {
    try {
      const free = await freeSlots(ws, fresh);
      slots = free.slice(0, 60).map((s) => ({ ...s, label: slotLabel(s.start, tz) }));
      picks = pickSlots(free, ws.calendar.offer, tz).map((s) => slotLabel(s.start, tz));
      ws.calendar.lastError = "";
    } catch (e) {
      error = ws.calendar.lastError = (e as Error).message;
    }
  }
  return { calendar: calendarView(ws), slots, picks, zone: zoneName(tz), error };
}

/** Leads whose chosen time now holds a call in Calendly move to Booked call. */
async function markBooked(db: Db, force = false) {
  const booked = await findBookings(db, force).catch(() => []);
  for (const c of booked) setStage(db, c, "booked", "system");
  if (booked.length) saveDb();
  return booked.length;
}

export async function GET(req: Request) {
  const a = await access(["settings", "inbox"]);
  if (a instanceof Response) return a;
  const booked = await markBooked(a.db);
  return json({ ...(await view(a.db, new URL(req.url).searchParams.get("fresh") === "1")), booked });
}

export async function POST(req: Request) {
  const a = await access("settings");
  if (a instanceof Response) return a;
  const { db } = a;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (b.action === "connect") await connectCalendar(db, String(b.token ?? ""));
    else if (b.action === "disconnect") disconnectCalendar(db);
    else if (b.action === "refresh") await refreshEventTypes(db);
    else if (b.action === "bookings") { const n = await markBooked(db, true); return json({ ...(await view(db)), booked: n }); }
    else if (b.action === "save") {
      const cal = db.workspace.calendar;
      const next = normaliseCalendar({
        ...cal,
        ...(typeof b.enabled === "boolean" ? { enabled: b.enabled } : {}),
        ...(typeof b.offer === "number" ? { offer: b.offer } : {}),
        ...(typeof b.daysAhead === "number" ? { daysAhead: b.daysAhead } : {}),
        ...(typeof b.minNoticeHours === "number" ? { minNoticeHours: b.minNoticeHours } : {}),
        ...(typeof b.eventTypeUri === "string" && cal.eventTypes.some((e) => e.uri === b.eventTypeUri) ? { eventTypeUri: b.eventTypeUri } : {}),
      });
      if (typeof b.timezone === "string" && b.timezone.trim()) {
        try {
          new Intl.DateTimeFormat("en-GB", { timeZone: b.timezone.trim() });
          next.timezone = b.timezone.trim();
        } catch {
          return fail("That timezone is not recognised. Use a name like Europe/London or America/New_York.");
        }
      }
      db.workspace.calendar = next;
    } else return fail("Unknown action");
    saveDb();
    return json(await view(db, true));
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
