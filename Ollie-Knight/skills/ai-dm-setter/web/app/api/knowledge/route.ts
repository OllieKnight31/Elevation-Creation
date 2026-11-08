import { saveDb } from "@/lib/store";
import { access } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { answerGap, deleteItem, dismissGap, knowledgeView, saveItem, waitingOn } from "@/lib/knowledge";
import { onAnswered } from "@/lib/live";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Questions the AI could not answer, and the answers it has been taught. */
export async function GET() {
  const a = await access(["playbook", "inbox"]);
  if (a instanceof Response) return a;
  return json(knowledgeView(a.db));
}

export async function POST(req: Request) {
  const a = await access(["playbook", "inbox"]);
  if (a instanceof Response) return a;
  const { db, me } = a;
  const b = await req.json();
  const by = me.id || undefined;
  try {
    let released = 0;
    if (b.action === "answer") {
      const { gap, item } = answerGap(db, String(b.gapId ?? ""), b.answer, by, b.question);
      released = waitingOn(db, gap).length;
      // Every conversation held on this question now gets its reply, written with the new answer.
      await onAnswered(db, gap, item, false);
    } else if (b.action === "dismiss") {
      const gap = dismissGap(db, String(b.gapId ?? ""));
      // Not worth teaching: the threads stay flagged for a person, they just stop waiting on this entry.
      for (const c of waitingOn(db, gap)) c.gapId = null;
    } else if (b.action === "save") {
      saveItem(db, b.item ?? {}, by);
    } else if (b.action === "delete") {
      deleteItem(db, String(b.id ?? ""));
    } else {
      return fail("Unknown action");
    }
    saveDb();
    return json({ ...knowledgeView(db), released });
  } catch (e) {
    return fail((e as Error).message);
  }
}
