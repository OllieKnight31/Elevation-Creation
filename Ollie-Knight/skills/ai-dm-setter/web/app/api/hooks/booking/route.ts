import { freshDb, saveDb } from "@/lib/store";
import { fail, json } from "@/lib/api";
import { setStage } from "@/lib/engine";
import type { StageId } from "@/lib/types";

const MAP: Record<string, StageId> = { booked: "booked", showed: "showed", no_show: "no_show", won: "won", canceled: "link_sent" };

/**
 * Generic booking and payment hook for Calendly, Cal.com, GHL, Stripe or Zapier.
 * POST ?token=<workspace token> with { event: booked|showed|no_show|won|canceled, email?, handle?, name? }.
 * Calendly's native payload ({ event: "invitee.created", payload: { email, name } }) is also accepted.
 */
export async function POST(req: Request) {
  const db = await freshDb();
  if (new URL(req.url).searchParams.get("token") !== db.workspace.apiToken) return fail("Bad token", 401);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = (await req.json().catch(() => null)) as Record<string, any> | null;
  if (!b || typeof b !== "object") return fail("The body must be JSON.");
  const native: Record<string, string> = { "invitee.created": "booked", "invitee.canceled": "canceled", "invitee_no_show.created": "no_show" };
  const event = native[b.event] ?? b.event;
  const stage = MAP[event];
  if (!stage) return fail("Unknown event");
  const email = String(b.email ?? b.payload?.email ?? "").toLowerCase();
  const handle = String(b.handle ?? "").toLowerCase().replace(/^@/, "");
  const name = String(b.name ?? b.payload?.name ?? "").toLowerCase();
  const c =
    (email && db.conversations.find((x) => x.lead.email?.toLowerCase() === email)) ||
    (handle && db.conversations.find((x) => x.handle?.toLowerCase() === handle)) ||
    (name && db.conversations.find((x) => x.name.toLowerCase() === name));
  if (!c) return json({ matched: false, note: "No conversation matched this email, handle or name" });
  setStage(db, c, stage, "system");
  saveDb();
  return json({ matched: true, conversationId: c.id, stage });
}
