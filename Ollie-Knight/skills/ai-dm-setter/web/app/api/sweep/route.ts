import { access, canSee, isAdmin } from "@/lib/auth";
import { json } from "@/lib/api";
import { sweepStatus } from "@/lib/sweep";

export const dynamic = "force-dynamic";

/** Activity lines sent when the screen does not say how many it wants. The inbox strip asks for a few, the panel for more. */
const LOG_DEFAULT = 50;
const LOG_MAX = 300;

/**
 * What Autopilot's inbox sweep is doing: whether it is on, when the clock last ran, what it sent in the last hour
 * and today, what is due now, which chats it cannot reach and why, and its recent activity. Read only.
 * Open to anyone who can see the inbox, because the inbox shows it. Settings reads the same answer.
 * ?log=N sets how many activity lines come back (0 to 300).
 */
export async function GET(req: Request) {
  const a = await access(["inbox", "settings"]);
  if (!("db" in a)) return a;
  const raw = new URL(req.url).searchParams.get("log");
  const logMax = raw && /^\d{1,3}$/.test(raw) ? Math.min(LOG_MAX, Number(raw)) : LOG_DEFAULT;
  // Someone who only sees their own leads gets the whole workspace's counts, but never another person's lead by name.
  // So the lines are filtered first and trimmed after, or a busy teammate could push theirs out of view.
  const full = sweepStatus(a.db, Date.now(), LOG_MAX);
  const byId = new Map(a.db.conversations.map((c) => [c.id, c]));
  // A line whose chat has since been deleted stays for people who see every lead.
  const mine = (id: string) => { const c = byId.get(id); return c ? canSee(a.me, c) : isAdmin(a.me) || a.me.scope === "all"; };
  const { busyBy, ...settings } = full.settings;
  void busyBy; // the sweep's own lock, of no use to a screen
  return json({
    ...full,
    settings,
    log: full.log.filter((e) => mine(e.conversationId)).slice(0, logMax),
    reach: { ...full.reach, windowClosed: { ...full.reach.windowClosed, nearest: full.reach.windowClosed.nearest.filter((n) => mine(n.conversationId)) } },
  });
}
