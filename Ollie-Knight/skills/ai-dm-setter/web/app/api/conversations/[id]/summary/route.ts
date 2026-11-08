import { saveDb } from "@/lib/store";
import { access, canSee } from "@/lib/auth";
import { convView, fail, json } from "@/lib/api";
import { summarise } from "@/lib/ai";
import { crmTouch } from "@/lib/crm";

/** Rewrites the conversation brief from the thread as it stands now. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await access(["inbox", "leads"]);
  if (a instanceof Response) return a;
  const { db, me } = a;
  const c = db.conversations.find((x) => x.id === id);
  if (!c || !canSee(me, c)) return fail("Conversation not found", 404);
  c.summary = await summarise(db, c);
  crmTouch(db, c);
  saveDb();
  return json({ conversation: convView(db, c) });
}
