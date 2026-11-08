import { extAuth, fail, json } from "@/lib/api";
import { cleanHandle } from "@/lib/outreach";
import { saveDb } from "@/lib/store";
import { HELPER_VERSION } from "@/lib/helper-version";

/** Heartbeat from the Chrome helper: it is installed and linked, and this is the Instagram account Chrome is signed in to. */
export async function POST(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  const b = (await req.json().catch(() => ({}))) as { version?: unknown; account?: unknown; outreachOn?: unknown; code?: unknown; faces?: { done?: unknown; note?: unknown; last?: unknown; lastAt?: unknown } };
  const ws = db.workspace;
  const account = typeof b.account === "string" ? cleanHandle(b.account) : ws.helper?.account ?? "";
  ws.helper = { seenAt: new Date().toISOString(), version: typeof b.version === "string" ? b.version.slice(0, 20) : "", code: typeof b.code === "string" ? b.code.slice(0, 20) : "", account, outreachOn: b.outreachOn === true,
    // What the picture reader last did, so a stall shows on Get connected instead of going unnoticed.
    ...(b.faces ? { faces: { done: Number(b.faces.done) || 0, note: String(b.faces.note ?? "").slice(0, 200), last: String(b.faces.last ?? "").slice(0, 200), lastAt: Number(b.faces.lastAt) || 0 } } : {}) };
  // The first account seen becomes the one outreach is tied to, so nobody has to type it.
  if (account && !ws.outreach.settings.account) ws.outreach.settings.account = account;
  saveDb();
  // latest lets a helper loaded from the project folder reload itself onto newer files.
  return json({ ok: true, workspace: ws.intake.businessName || "Ainable Setter", account: ws.outreach.settings.account, latest: HELPER_VERSION });
}
