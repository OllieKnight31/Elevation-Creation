import { extAuth, fail, json } from "@/lib/api";
import { outreachStatus } from "@/lib/outreach";

export async function GET(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  return json(outreachStatus(db));
}
