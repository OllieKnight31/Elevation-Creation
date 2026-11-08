import { dataVersion, isDemoData, storeStatus } from "@/lib/store";
import { access, can, canSee, loginRequired, publicMember } from "@/lib/auth";
import { convView, json, messageStats, publicWorkspace } from "@/lib/api";
import { aiConfigured, aiError } from "@/lib/ai";
import { metaConfigured } from "@/lib/meta";
import { HELPER_VERSION, olderVersion } from "@/lib/helper-version";

export const dynamic = "force-dynamic";

export async function GET() {
  const a = await access("any");
  if (a instanceof Response) return a;
  const { db, me } = a;
  const leads = can(me, "inbox") || can(me, "leads");
  const stats = leads ? messageStats(db) : undefined;
  return json({
    version: dataVersion(),
    me: { ...publicMember(me), loginRequired: loginRequired(db) },
    workspace: publicWorkspace(db.workspace, me),
    conversations: leads ? db.conversations.filter((c) => canSee(me, c)).map((c) => convView(db, c, stats)).sort((x, y) => y.lastMessageAt.localeCompare(x.lastMessageAt)) : [],
    // The helper in Chrome, so the inbox can say when it is too old to keep the inbox live.
    helper: db.workspace.helper ? { version: db.workspace.helper.version, latest: HELPER_VERSION, outdated: /^\d/.test(db.workspace.helper.version) && olderVersion(db.workspace.helper.version, HELPER_VERSION), seenAt: db.workspace.helper.seenAt, faces: db.workspace.helper.faces } : null,
    flags: { ai: aiConfigured(), aiError: aiError(), meta: metaConfigured(), demoData: isDemoData(db) },
    store: storeStatus(),
    labelQueue: {
      pending: db.labelQueue.filter((q) => q.status === "pending").length,
      done: db.labelQueue.filter((q) => q.status === "done").length,
      failed: db.labelQueue.filter((q) => q.status === "failed").slice(-5),
    },
  });
}
