import { saveDb } from "@/lib/store";
import { access, canSee } from "@/lib/auth";
import { convView, fail, json } from "@/lib/api";
import { addMessage, fireTrigger, matchTrigger } from "@/lib/engine";

/** Test helper for demo threads only: pretend the lead sent a message. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await access(["inbox", "leads"]);
  if (a instanceof Response) return a;
  const { db, me } = a;
  const c = db.conversations.find((x) => x.id === id);
  if (!c || !canSee(me, c)) return fail("Conversation not found", 404);
  if (!c.externalId.startsWith("demo_")) return fail("Only demo threads can be simulated");
  const { text } = await req.json();
  addMessage(db, c, { direction: "in", text: String(text ?? ""), sentAt: new Date().toISOString(), source: "seed" }, true);
  const trig = matchTrigger(db, c, String(text ?? ""));
  if (trig) await fireTrigger(db, c, trig);
  saveDb();
  return json({ conversation: convView(db, c), trigger: trig?.name ?? null });
}
