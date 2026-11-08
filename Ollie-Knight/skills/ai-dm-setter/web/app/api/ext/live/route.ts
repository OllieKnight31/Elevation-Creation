import { extAuth, fail, json } from "@/lib/api";
import { ingestLive, type LiveThread } from "@/lib/live-sync";
import { saveDb } from "@/lib/store";
import { onInbound } from "@/lib/live";

/** New messages the helper read from the owner's Instagram web inbox, sent and received. Called within seconds of each change. */
export async function POST(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  const b = (await req.json().catch(() => null)) as { threads?: LiveThread[] } | null;
  if (!b || !Array.isArray(b.threads)) return fail("threads is required");
  const { fresh, ...res } = ingestLive(db, b.threads);
  // A new message from a lead: Autopilot answers it when switched on (it checks, and waits a moment first).
  for (const f of fresh) {
    const c = db.conversations.find((x) => x.id === f.id);
    if (c) onInbound(db, c, f.text);
  }
  // Saved even with no new message: pictures and usernames change too. Only changed records are written.
  saveDb();
  return json(res);
}
