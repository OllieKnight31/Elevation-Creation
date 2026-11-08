import { extAuth, fail, json } from "@/lib/api";
import { suggestReply } from "@/lib/ai";
import { applyAiTagging } from "@/lib/engine";
import { pipelineOf } from "@/lib/pipeline";
import { saveDb } from "@/lib/store";

export async function POST(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  const { conversationId } = await req.json();
  const c = db.conversations.find((x) => x.id === conversationId);
  if (!c) return fail("Conversation not found", 404);
  try {
    const { suggestion, lead, summary } = await suggestReply(db, c);
    c.suggestion = suggestion;
    applyAiTagging(db, c, suggestion, lead, summary);
    saveDb();
    return json({ bubbles: suggestion.bubbles, reason: suggestion.reason, stage: pipelineOf(db.workspace.pipeline).stage(c.stage).name, labels: c.labels });
  } catch (e) {
    return fail("AI request failed: " + (e as Error).message, 502);
  }
}
