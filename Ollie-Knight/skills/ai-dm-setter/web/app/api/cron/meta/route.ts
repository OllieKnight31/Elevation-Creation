import { fail, json } from "@/lib/api";
import { freshDb, flushNow, saveDb } from "@/lib/store";
import { backfillInstagram, setAvatar, syncInstagram } from "@/lib/engine";
import { fillFaces, saveMissing } from "@/lib/avatars";
import { refreshInstagramToken, subscribeWebhooks, WEBHOOK_FIELDS_VERSION } from "@/lib/meta";
import { onInbound } from "@/lib/live";

export const maxDuration = 60;

/**
 * Run by Vercel Cron (vercel.json), signed with CRON_SECRET: daily on the Hobby plan, every minute on Pro or
 * from any outside scheduler that sends the same Authorization header. Keeps the inbox current with nobody
 * signed in and no browser open: reads the newest Instagram chats, renews the Instagram login when it is due, and
 * hands new messages to Autopilot. Webhooks deliver messages instantly; this catches anything they miss.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return fail("Not allowed", 401);
  const db = await freshDb();
  const ig = db.workspace.meta.instagram;
  if (!ig) return json({ connected: false });
  let renewed = false, renewError = "";
  try {
    renewed = await refreshInstagramToken(db.workspace);
  } catch (e) {
    renewError = "Renewing the Instagram login failed: " + (e as Error).message;
  }
  try {
    // Connected before seen receipts were added: subscribe the account to the newer list once.
    const sub = db.workspace.meta.instagram;
    if (sub && (sub.webhookFields ?? 1) < WEBHOOK_FIELDS_VERSION && (await subscribeWebhooks(sub.accessToken))) sub.webhookFields = WEBHOOK_FIELDS_VERSION;
    const r = await syncInstagram(db, { full: false });
    // Keep a copy of new profile pictures before Instagram's addresses expire.
    await saveMissing(db.conversations, 60).catch(() => 0);
    // Past chats not read yet: a little more each time, so a long history finishes on its own.
    if (!db.workspace.meta.instagram?.backfillDone) await backfillInstagram(db, 40_000);
    else await fillFaces(db.conversations, 30_000, setAvatar).catch(() => null);
    for (const c of r.fresh) {
      const last = db.messages.filter((m) => m.conversationId === c.id && m.direction === "in").sort((x, y) => y.sentAt.localeCompare(x.sentAt))[0];
      onInbound(db, c, last?.text ?? "");
    }
    ig.lastSyncAt = new Date().toISOString();
    ig.syncError = renewError;
    saveDb();
    await flushNow();
    return json({ connected: true, added: r.added, threads: r.threads, renewed });
  } catch (e) {
    ig.syncError = (e as Error).message;
    saveDb();
    await flushNow();
    return fail(ig.syncError, 502);
  }
}
