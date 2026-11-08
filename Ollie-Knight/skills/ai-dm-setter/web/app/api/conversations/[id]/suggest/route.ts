import { saveDb } from "@/lib/store";
import { access, canSee } from "@/lib/auth";
import { convView, fail, json } from "@/lib/api";
import { suggestReply } from "@/lib/ai";
import { applyAiTagging } from "@/lib/engine";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await access(["inbox", "leads"]);
  if (a instanceof Response) return a;
  const { db, me } = a;
  const c = db.conversations.find((x) => x.id === id);
  if (!c || !canSee(me, c)) return fail("Conversation not found", 404);
  try {
    const { suggestion, lead, summary } = await suggestReply(db, c);
    c.suggestion = suggestion;
    applyAiTagging(db, c, suggestion, lead, summary);
    saveDb();
    return json({ conversation: convView(db, c) });
  } catch (e) {
    return fail("AI request failed: " + (e as Error).message, 502);
  }
}
