import { extAuth, fail, json } from "@/lib/api";

export async function GET(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  return json({ ok: true, workspace: db.workspace.intake.businessName || "AI DM Setter" });
}
