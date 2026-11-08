import { background } from "@/lib/hosted";
import { backfillInstagram, setAvatar } from "@/lib/engine";
import { fillFaces } from "@/lib/avatars";
import { flushNow, saveDb } from "@/lib/store";
import { access } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { connectWithToken } from "@/lib/meta";

/** Connect with a token generated in the Meta app dashboard. No redirect or public address needed. */
// Long enough for the first import of past chats, which runs after the answer is sent.
export const maxDuration = 300;

export async function POST(req: Request) {
  const a = await access("settings");
  if (a instanceof Response) return a;
  const { db } = a;
  const { accessToken } = await req.json().catch(() => ({}));
  const token = String(accessToken ?? "").trim();
  if (token.length < 20) return fail("Paste the full access token from your Meta app.");
  try {
    const ig = await connectWithToken(token);
    db.workspace.meta.instagram = { userId: ig.userId, username: ig.username, accessToken: ig.accessToken, connectedAt: new Date().toISOString(), backfillAfter: "", backfillDone: false, webhookFields: 2 };
    saveDb();
    // Past chats come in straight away, without anyone pressing a button.
    background(async () => { await backfillInstagram(db, 200_000); saveDb(); await flushNow(); await fillFaces(db.conversations, 45_000, setAvatar).catch(() => null); saveDb(); await flushNow(); });
    return json({ username: ig.username, webhooks: ig.webhooks });
  } catch (e) {
    return fail("Meta rejected the token: " + (e as Error).message, 400);
  }
}

export async function DELETE() {
  const a = await access("settings");
  if (a instanceof Response) return a;
  const { db } = a;
  delete db.workspace.meta.instagram;
  saveDb();
  return json({ ok: true });
}
