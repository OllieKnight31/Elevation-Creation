import { extAuth, fail, json } from "@/lib/api";
import { nextTask } from "@/lib/outreach";
import { saveDb } from "@/lib/store";
import { sweepTick } from "@/lib/sweep";

export async function POST(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  const body = (await req.json().catch(() => ({}))) as { account?: string; channel?: string };
  // A second clock for the inbox sweep, next to the timer in the database.
  sweepTick(db);
  // The helper asks twice: once for what is typed inside instagram.com (cold first messages), and once, with
  // channel "suite", for inbox messages that go out inside Meta Business Suite. A helper too old to know about
  // Business Suite never sends the channel, so it is never handed one of those.
  const res = nextTask(db, typeof body.account === "string" ? body.account : "", new Date(), body.channel === "suite" ? "suite" : "instagram");
  saveDb();
  return json(res);
}
