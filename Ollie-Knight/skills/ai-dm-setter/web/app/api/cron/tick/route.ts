import { fail, json } from "@/lib/api";
import { freshDb } from "@/lib/store";
import { sweepTick } from "@/lib/sweep";

export const maxDuration = 60;

/**
 * The once a minute clock for Autopilot's inbox sweep. Called by a timer inside the database (pg_cron, set up by
 * web/scripts/install-tick.mjs), so it runs with no browser, no helper and no terminal. Vercel's own timed jobs
 * only run once a day on the free plan, which is too slow for replies.
 */
export async function GET(req: Request) {
  const secret = process.env.TICK_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return fail("Not allowed", 401);
  const db = await freshDb();
  return json({ ok: true, started: sweepTick(db) });
}
