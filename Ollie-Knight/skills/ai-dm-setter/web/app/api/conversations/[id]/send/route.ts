import { saveDb } from "@/lib/store";
import { access, canSee } from "@/lib/auth";
import { convView, fail, json } from "@/lib/api";
import { addMessage, deliver, releaseHold, sendVia } from "@/lib/engine";
import { onHumanReply } from "@/lib/live";
import { openGap } from "@/lib/knowledge";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await access(["inbox", "leads"]);
  if (a instanceof Response) return a;
  const { db, me } = a;
  const c = db.conversations.find((x) => x.id === id);
  if (!c || !canSee(me, c)) return fail("Conversation not found", 404);
  const b = await req.json();
  const bubbles: string[] = (b.bubbles ?? []).map((x: string) => String(x).trim()).filter(Boolean);
  if (!bubbles.length) return fail("Nothing to send");
  const sender = b.sender === "ai" ? "ai" : "owner";
  // Whoever pressed send is credited, including when they approved an AI draft.
  const memberId = me.id || undefined;

  // A reply typed by a person on a thread held for a question the AI could not answer is the answer: it is
  // kept so the AI can handle that question from now on. teach false sends the reply without keeping it.
  const learn = () => {
    if (sender !== "owner" || !openGap(db, c)) return false;
    if (b.teach === false) { releaseHold(db, c); return false; }
    return Boolean(onHumanReply(db, c, bubbles.join("\n"), memberId));
  };

  // Demo threads are not real people: record the message locally and never call Meta.
  if (c.externalId.startsWith("demo_")) {
    for (const text of bubbles) addMessage(db, c, { direction: "out", sender, text, sentAt: new Date().toISOString(), source: "app", memberId }, true);
    c.unread = false;
    c.suggestion = null;
    const learned = learn();
    saveDb();
    return json({ conversation: convView(db, c), simulated: true, learned });
  }
  try {
    const via = sendVia(db, c);
    await deliver(db, c, bubbles, sender, memberId);
    const learned = learn();
    saveDb();
    return json({ conversation: convView(db, c), simulated: false, learned, via });
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
