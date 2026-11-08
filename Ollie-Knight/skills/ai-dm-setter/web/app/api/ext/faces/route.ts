import { extAuth, fail, json } from "@/lib/api";
import { facesNeeded, fetchAndSave } from "@/lib/avatars";
import { setAvatar } from "@/lib/engine";
import { saveDb } from "@/lib/store";

/*
 * Profile pictures Meta will not share. Meta gives a lead's picture only after they message you since the account
 * was connected, and Instagram refuses the app's own servers, so the Chrome helper reads it from the lead's public
 * profile preview on the user's computer and hands the address over here. The picture is saved at once, before the address expires.
 */

const handleOk = (h: string) => /^[a-z0-9._]{1,30}$/.test(h);

/** The next handles to look up: Instagram chats with no picture, newest first, not tried in the last two weeks. */
export async function GET(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  const need = facesNeeded(db.conversations);
  return json({ handles: need.slice(0, 60).map((c) => c.handle), remaining: need.length });
}

/** One lookup result: the picture address read from the profile page, or none when the profile has no picture or is gone. */
export async function POST(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  const b = (await req.json().catch(() => null)) as { handle?: string; url?: string } | null;
  const handle = String(b?.handle ?? "").toLowerCase().replace(/^@/, "");
  if (!handleOk(handle)) return fail("handle is required");
  const convs = db.conversations.filter((c) => c.platform === "instagram" && c.handle === handle);
  if (!convs.length) return fail("No chat with that handle", 404);
  const url = typeof b?.url === "string" ? b.url.trim() : "";
  let saved = false;
  for (const c of convs) {
    c.faceTriedAt = new Date().toISOString();
    if (url && setAvatar(c, url)) {
      saved = Boolean(await fetchAndSave(c.id, url));
      c.avatarSaved = url;
    }
  }
  saveDb();
  return json({ saved });
}
