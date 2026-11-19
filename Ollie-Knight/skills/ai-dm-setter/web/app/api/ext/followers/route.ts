import { extAuth, fail, json } from "@/lib/api";
import { followersBatch, followersJob } from "@/lib/outreach";
import { saveDb } from "@/lib/store";

/** Whether the app wants the owner's newest followers read, so they can be left out of cold messages. */
export async function GET(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  return json(followersJob(db));
}

/** One page of followers read by the Chrome helper, or the reason it stopped. Recorded as followers only, never as prospects. */
export async function POST(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  const b = (await req.json().catch(() => ({}))) as { users?: unknown; end?: unknown; error?: unknown; note?: unknown };
  const out = followersBatch(db, b);
  saveDb();
  return json(out);
}
