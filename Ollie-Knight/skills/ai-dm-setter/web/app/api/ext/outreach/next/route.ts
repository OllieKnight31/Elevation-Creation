import { extAuth, fail, json } from "@/lib/api";
import { nextTask } from "@/lib/outreach";
import { saveDb } from "@/lib/store";
import { sweepTick } from "@/lib/sweep";

export async function POST(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  const body = (await req.json().catch(() => ({}))) as { account?: string };
  // The helper checking in is the clock for the inbox sweep: unanswered chats and follow ups, one at a time.
  sweepTick(db);
  const res = nextTask(db, typeof body.account === "string" ? body.account : "");
  saveDb();
  return json(res);
}
