import { access, isAdmin } from "@/lib/auth";
import { json } from "@/lib/api";
import { insights, type Period } from "@/lib/insights";
import { analyse } from "@/lib/analysis";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await access("insights");
  if (a instanceof Response) return a;
  const { db, me } = a;
  const q = new URL(req.url).searchParams;
  if (q.get("view") === "deep") {
    const days = [7, 14, 30, 60, 90].includes(Number(q.get("days"))) ? Number(q.get("days")) : 30;
    return json(analyse(db, { days, viewer: me, member: q.get("member") || undefined }));
  }
  const p = q.get("period");
  const period: Period = p === "weekly" || p === "monthly" ? p : "daily";
  // Workspace totals are for people allowed to see the whole team's numbers.
  if (!isAdmin(me) && !me.teamMetrics) return json({ period, restricted: true, series: [], totals: null });
  return json(insights(db, period));
}
