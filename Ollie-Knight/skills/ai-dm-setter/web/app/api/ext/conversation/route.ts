import { extAuth, fail, json } from "@/lib/api";
import { findConversation, setAvatar } from "@/lib/engine";
import { saveDb } from "@/lib/store";
import { pipelineOf, windowState } from "@/lib/pipeline";

export async function GET(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  const q = new URL(req.url).searchParams;
  const c = findConversation(db, {
    platform: q.get("platform") === "messenger" ? "messenger" : "instagram",
    externalId: q.get("externalId") ?? undefined, handle: q.get("handle"), name: q.get("name") ?? undefined,
  });
  if (!c) return json({ found: false });
  // A thread from the history download has a name but no username until the helper sees it in Instagram.
  // With the username the app can send to it through the helper.
  const handle = (q.get("handle") ?? "").trim().replace(/^@/, "").toLowerCase();
  const named = !c.handle && /^[a-z0-9._]{1,30}$/.test(handle);
  if (named) c.handle = handle;
  // The helper passes the picture it sees in the thread header, which keeps the inbox picture current.
  if (setAvatar(c, q.get("avatar")) || named) saveDb();
  return json({
    found: true, conversationId: c.id, stage: pipelineOf(db.workspace.pipeline).stage(c.stage).name, labels: c.labels, aiMode: c.aiMode,
    windowOpen: windowState(c.lastInboundAt).open,
    suggestion: c.suggestion ? { bubbles: c.suggestion.bubbles, reason: c.suggestion.reason } : null,
  });
}
