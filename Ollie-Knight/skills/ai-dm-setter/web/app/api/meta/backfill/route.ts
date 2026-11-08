import { access } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { backfillInstagram } from "@/lib/engine";

export const maxDuration = 300;

/**
 * Pulls in past chats, a page of 25 threads at a time, for up to four minutes per call. Answers done: false when there
 * is more, and the screen calls again; each call carries on where the last one stopped. Meta shares the 20 most recent
 * messages per thread. `restart` reads the whole history again from the newest thread.
 */
export async function POST(req: Request) {
  const a = await access("settings");
  if (a instanceof Response) return a;
  const ig = a.db.workspace.meta.instagram;
  if (!ig) return fail("Instagram is not connected.");
  const b = await req.json().catch(() => ({}));
  if (b.restart) { ig.backfillAfter = ""; ig.backfillDone = false; }
  try {
    return json(await backfillInstagram(a.db, 240_000));
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
