import { extAuth, fail, json } from "@/lib/api";
import { saveDb } from "@/lib/store";

export async function POST(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  const b = await req.json();
  const item = db.labelQueue.find((q) => q.id === b.id);
  if (!item) return fail("Queue item not found", 404);
  item.status = b.ok ? "done" : "failed";
  item.error = b.ok ? undefined : String(b.error ?? "Unknown error");
  saveDb();
  return json({ ok: true });
}
