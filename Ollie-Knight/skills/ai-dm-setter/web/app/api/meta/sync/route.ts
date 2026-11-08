import { access } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { backfillInstagram, syncInstagram } from "@/lib/engine";
import { onInbound } from "@/lib/live";
import { saveMissing } from "@/lib/avatars";
import { refreshInstagramToken, subscribeWebhooks, WEBHOOK_FIELDS_VERSION } from "@/lib/meta";
import { saveDb } from "@/lib/store";

const g = globalThis as unknown as { __setterSync?: { running: boolean; last: number; error: string } };
const state = (g.__setterSync ??= { running: false, last: 0, error: "" });

/** Light poll of the newest threads. Called by the open inbox every 20 seconds. */
export async function POST() {
  const a = await access(["inbox", "leads"]);
  if (a instanceof Response) return a;
  const { db } = a;
  if (!db.workspace.meta.instagram) return json({ connected: false });
  if (state.running || Date.now() - state.last < 15_000) return json({ connected: true, skipped: true, error: state.error });
  state.running = true;
  try {
    await refreshInstagramToken(db.workspace).catch(() => false);
    // Connected before seen receipts were added: subscribe the account to the newer list once.
    const sub = db.workspace.meta.instagram;
    if (sub && (sub.webhookFields ?? 1) < WEBHOOK_FIELDS_VERSION && (await subscribeWebhooks(sub.accessToken))) sub.webhookFields = WEBHOOK_FIELDS_VERSION;
    const r = await syncInstagram(db, { full: false });
    // Keep a copy of new profile pictures before Instagram's addresses expire.
    await saveMissing(db.conversations, 15).catch(() => 0);
    // Past chats not read yet: a little more each time, so a long history finishes on its own.
    if (!db.workspace.meta.instagram?.backfillDone) await backfillInstagram(db, 20_000);
    for (const c of r.fresh) {
      const last = db.messages.filter((m) => m.conversationId === c.id && m.direction === "in").sort((x, y) => y.sentAt.localeCompare(x.sentAt))[0];
      onInbound(db, c, last?.text ?? "");
    }
    state.error = "";
    const ig = db.workspace.meta.instagram;
    if (ig) { ig.lastSyncAt = new Date().toISOString(); ig.syncError = ""; saveDb(); }
    return json({ connected: true, added: r.added, threads: r.threads });
  } catch (e) {
    state.error = (e as Error).message;
    return fail(state.error, 502);
  } finally {
    state.running = false;
    state.last = Date.now();
  }
}
