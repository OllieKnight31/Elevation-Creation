import { access } from "@/lib/auth";
import { json } from "@/lib/api";
import { dataVersion } from "@/lib/store";
import { hostedSql, hostedTable } from "@/lib/hosted";

export const dynamic = "force-dynamic";

// Records the app rewrites as routine housekeeping: the time Instagram was last checked (every 20 seconds while an
// inbox is open) and the Chrome helper's last check in. On their own they change nothing a screen shows that cannot
// wait for its slow reload, so they must not make every open tab reload and go back to asking every 2 seconds.
const QUIET_ROWS = ["meta", "helper"];

/**
 * A few bytes that change whenever anything is saved. Open screens ask at a pace that follows how busy things are
 * (see the live updates note in components/ui.tsx) and reload only on a change.
 *
 * Costs one small database question when nothing was saved. A screen may say which version it already has (since).
 * When the version moved on, one more small question finds out whether anything other than housekeeping was saved;
 * if not the answer carries quiet, and the screen notes the new version without reloading.
 */
export async function GET(req: Request) {
  const a = await access("any");
  if (a instanceof Response) return a;
  const v = dataVersion();
  const raw = new URL(req.url).searchParams.get("since");
  const since = raw && /^\d{1,15}$/.test(raw) ? Number(raw) : null;
  const now = /^h\d+$/.test(v) ? Number(v.slice(1)) : null;
  // Further behind than this and the markers left by deletions may be gone, so it counts as a real change.
  if (since === null || now === null || now <= since || now - since > 1000) return json({ v });
  try {
    const t = hostedTable();
    const rows = (await hostedSql().query(
      `select (exists (select 1 from ${t} where ver > $1 and not (coll = 'ws' and id = any($2::text[]))) or exists (select 1 from ${t}_del where ver > $1)) as real`,
      [since, QUIET_ROWS],
    )) as { real: boolean }[];
    if (rows[0]?.real === false) return json({ v, quiet: true });
  } catch {
    // Could not tell: treat it as a real change, which only costs one reload.
  }
  return json({ v });
}
