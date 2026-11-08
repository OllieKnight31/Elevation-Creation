import { access, canSee } from "@/lib/auth";
import { fail } from "@/lib/api";
import { avatarHostOk } from "@/lib/engine";
import { fetchAndSave, savedAvatar } from "@/lib/avatars";

export const dynamic = "force-dynamic";

/**
 * A lead's profile picture. Instagram's picture servers do not let other sites show their images and their addresses
 * expire after a few days, so the app keeps the picture the first time it fetches it and serves that copy from then on.
 * An older saved copy is still shown when Instagram's current address has expired. The browser keeps it for a day.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await access(["inbox", "leads"]);
  if (a instanceof Response) return a;
  const c = a.db.conversations.find((x) => x.id === id);
  if (!c || !canSee(a.me, c)) return fail("No picture", 404);
  const send = (x: { type: string; data: Buffer }) => new Response(new Uint8Array(x.data), { headers: { "Content-Type": x.type, "Cache-Control": "private, max-age=86400" } });
  const kept = await savedAvatar(c.id);
  if (kept && (!c.avatar || kept.url === c.avatar)) return send(kept);
  if (c.avatar && avatarHostOk(c.avatar)) {
    const got = await fetchAndSave(c.id, c.avatar);
    if (got) return send(got);
    c.avatarSaved = c.avatar;
  }
  return kept ? send(kept) : fail("No picture", 404);
}
