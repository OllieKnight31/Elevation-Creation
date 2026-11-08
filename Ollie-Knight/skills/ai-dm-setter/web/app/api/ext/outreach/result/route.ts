import { extAuth, fail, json } from "@/lib/api";
import { recordResult } from "@/lib/outreach";
import { saveDb } from "@/lib/store";

export async function POST(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  const res = recordResult(db, (await req.json().catch(() => ({}))) as Record<string, never>);
  saveDb();
  return res.ok ? json(res) : fail("Unknown task", 404);
}
