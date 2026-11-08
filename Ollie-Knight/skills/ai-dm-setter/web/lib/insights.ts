import type { Db } from "./types";

export type Period = "daily" | "weekly" | "monthly";

export const METRICS = [
  ["conversations", "New conversations"],
  ["messagesSent", "Messages sent"],
  ["messagesReceived", "Messages received"],
  ["aiMessages", "Sent by AI"],
  ["businessModelSent", "Business model sent"],
  ["qualified", "Qualified"],
  ["linksSent", "Links sent"],
  ["booked", "Calls booked"],
  ["showed", "Showed"],
  ["noShow", "No shows"],
  ["won", "Won"],
  ["disqualified", "Disqualified"],
] as const;

export type MetricKey = (typeof METRICS)[number][0];
export type Counts = Record<MetricKey, number>;

const zero = (): Counts => Object.fromEntries(METRICS.map(([k]) => [k, 0])) as Counts;

function bucketStart(d: Date, period: Period) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  if (period === "weekly") x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  if (period === "monthly") x.setDate(1);
  return x;
}

function step(d: Date, period: Period, n: number) {
  const x = new Date(d);
  if (period === "daily") x.setDate(x.getDate() + n);
  if (period === "weekly") x.setDate(x.getDate() + 7 * n);
  if (period === "monthly") x.setMonth(x.getMonth() + n);
  return x;
}

const STAGE_METRIC: Record<string, MetricKey> = {
  business_model_sent: "businessModelSent", qualified: "qualified", booked: "booked", showed: "showed",
  no_show: "noShow", won: "won", disqualified: "disqualified",
};

/** Every countable thing that happened, as (metric, time) pairs. */
function facts(db: Db): [MetricKey, number][] {
  const out: [MetricKey, number][] = [];
  for (const m of db.messages) {
    const t = new Date(m.sentAt).getTime();
    out.push([m.direction === "out" ? "messagesSent" : "messagesReceived", t]);
    if (m.sender === "ai") out.push(["aiMessages", t]);
  }
  // Messages moved to the Google Sheets archive are still counted, from the daily totals kept for them.
  for (const [day, n] of Object.entries(db.workspace.sheets?.tallies ?? {})) {
    const t = new Date(day + "T12:00:00Z").getTime();
    for (let i = 0; i < n.in; i++) out.push(["messagesReceived", t]);
    for (let i = 0; i < n.out; i++) out.push(["messagesSent", t]);
    for (let i = 0; i < n.ai; i++) out.push(["aiMessages", t]);
  }
  for (const e of db.events) {
    const t = new Date(e.at).getTime();
    if (e.type === "conversation_started") out.push(["conversations", t]);
    else if (e.type === "link_sent") out.push(["linksSent", t]);
    else if (e.type === "stage_changed" && e.stage && STAGE_METRIC[e.stage]) out.push([STAGE_METRIC[e.stage], t]);
    // seeded background volume is stored as events rather than messages
    else if (e.conversationId === "bg" && e.type === "message_sent") {
      out.push(["messagesSent", t]);
      if (e.by === "ai") out.push(["aiMessages", t]);
    } else if (e.conversationId === "bg" && e.type === "message_received") out.push(["messagesReceived", t]);
  }
  return out;
}

export function insights(db: Db, period: Period) {
  const n = period === "daily" ? 14 : period === "weekly" ? 12 : 6;
  const now = new Date();
  const first = step(bucketStart(now, period), period, -(n - 1));
  const buckets = Array.from({ length: n }, (_, i) => ({ start: step(first, period, i), counts: zero() }));
  const all = facts(db);
  for (const [k, t] of all) {
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (t >= buckets[i].start.getTime()) {
        if (t <= now.getTime()) buckets[i].counts[k]++;
        break;
      }
    }
  }
  const windowTotals = (since: number) => {
    const c = zero();
    for (const [k, t] of all) if (t >= since && t <= now.getTime()) c[k]++;
    return c;
  };
  const day = bucketStart(now, "daily").getTime();
  const fmt = (d: Date) =>
    period === "monthly" ? d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return {
    period,
    series: buckets.map((b) => ({ label: fmt(b.start), start: b.start.toISOString(), ...b.counts })),
    totals: {
      today: windowTotals(day),
      week: windowTotals(bucketStart(now, "weekly").getTime()),
      month: windowTotals(bucketStart(now, "monthly").getTime()),
      last30: windowTotals(now.getTime() - 30 * 864e5),
    },
  };
}
