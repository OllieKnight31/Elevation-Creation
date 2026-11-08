import { resetDb } from "@/lib/store";
import { access } from "@/lib/auth";
import { json } from "@/lib/api";

export async function POST(req: Request) {
  const a = await access("settings");
  if (a instanceof Response) return a;
  const { action } = await req.json();
  resetDb(action === "demo");
  return json({ ok: true });
}
