import { access } from "@/lib/auth";
import { json } from "@/lib/api";
import { facesNeeded, fillFaces } from "@/lib/avatars";
import { setAvatar } from "@/lib/engine";
import { flushNow, freshDb, saveDb } from "@/lib/store";

export const maxDuration = 60;

/** How many Instagram chats still have no picture. */
export async function GET() {
  const a = await access(["inbox", "leads"]);
  if (a instanceof Response) return a;
  return json({ remaining: facesNeeded(a.db.conversations).length });
}

/**
 * Self hosted installs on a home or office connection: fills in missing profile pictures for up to 45 seconds and answers how many are left; the app calls again while
 * there are. Works for every chat, old or new, with no helper: see publicPicture. The results are copied onto a fresh
 * read of the data, so messages that arrived meanwhile are kept.
 */
export async function POST() {
  const a = await access(["inbox", "leads"]);
  if (a instanceof Response) return a;
  // Instagram sends cloud servers such as Vercel to its login page, so there the Chrome helper does this instead.
  if (process.env.VERCEL) return json({ saved: 0, checked: 0, remaining: facesNeeded(a.db.conversations).length, blocked: true, helper: true });
  const r = await fillFaces(a.db.conversations, 45_000, setAvatar);
  const done = new Map(a.db.conversations.filter((c) => c.faceTriedAt).map((c) => [c.id, c]));
  const db = await freshDb();
  for (const c of db.conversations) {
    const d = done.get(c.id);
    if (!d) continue;
    c.faceTriedAt = d.faceTriedAt;
    if (d.avatar && !c.avatar) Object.assign(c, { avatar: d.avatar, avatarAt: d.avatarAt, avatarSaved: d.avatarSaved });
  }
  saveDb();
  await flushNow();
  return json(r);
}
