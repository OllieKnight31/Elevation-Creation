"use client";
import { useCallback, useEffect, useState } from "react";
import { METRICS, type Counts, type MetricKey, type Period } from "@/lib/insights";
import type { Deep } from "@/lib/analysis";
import { api, Banner, Button, PageHeader, Segmented, useAppState } from "@/components/ui";
import { DEFAULT_CARD_SIZE, Icon, ICONS, move, setLayout, useLayout, type CardId, type CardSize } from "@/components/layout";

type Range = "today" | "week" | "month" | "last30";
type Data = { period: Period; restricted?: boolean; series: ({ label: string; start: string } & Counts)[]; totals: Record<Range, Counts> | null };

const RATE: [string, MetricKey, MetricKey][] = [
  ["Conversation to qualified", "qualified", "conversations"],
  ["Conversation to link sent", "linksSent", "conversations"],
  ["Link sent to booked", "booked", "linksSent"],
  ["Booked to showed", "showed", "booked"],
  ["Showed to won", "won", "showed"],
];
const CARD_NAMES: Record<CardId, string> = {
  actions: "What to do next", forecast: "Forecast and target", funnel: "Funnel", team: "Team performance", coaching: "Coaching notes",
  speed: "Speed and backlog", sources: "What converts", tiles: "Headline numbers", chart: "Trend chart", rates: "Event rates", totals: "Totals table", breakdown: "Period breakdown",
};
const SIZES: [CardSize, string][] = [[2, "Third"], [3, "Half"], [4, "Two thirds"], [6, "Full"]];
const RANGES: [Range, string][] = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["last30", "30 days"]];
const metricName = (k: string) => METRICS.find(([m]) => m === k)?.[1] ?? k;
const pct = (r: number | null | undefined) => (r === null || r === undefined ? "n/a" : `${Math.round(r * 100)}%`);
const mins = (m: number | null) => (m === null ? "n/a" : m < 1 ? "<1 min" : m < 90 ? `${Math.round(m)} min` : m < 2880 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m / 1440)} d`);
const one = (n: number | null) => (n === null ? "n/a" : n >= 100 ? Math.round(n).toString() : n.toFixed(1));

function Delta({ now, before }: { now: number | null; before: number | null }) {
  if (now === null || before === null) return null;
  const d = Math.round((now - before) * 100);
  if (!d) return <span className="text-mute">no change</span>;
  return <span className={d > 0 ? "text-ok" : "text-err"}>{d > 0 ? "+" : ""}{d} pts</span>;
}
const KIND = { fix: "bg-err", strength: "bg-ok", watch: "bg-mute" } as const;

export default function Insights() {
  const { state } = useAppState(30000);
  const layout = useLayout();
  const cfg = layout.insights;
  const [period, setPeriod] = useState<Period>("daily");
  const [metric, setMetric] = useState<MetricKey>("messagesSent");
  const [range, setRange] = useState<Range>("week");
  const [days, setDays] = useState(30);
  const [member, setMember] = useState("");
  const [breakdown, setBreakdown] = useState<"sources" | "mechanisms" | "objections" | "losses">("sources");
  const [editing, setEditing] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [deep, setDeep] = useState<Deep | null>(null);
  const [err, setErr] = useState("");
  const [target, setTarget] = useState("");

  useEffect(() => {
    api<Data>(`/api/insights?period=${period}`).then(setData).catch((e) => setErr((e as Error).message));
  }, [period]);
  const loadDeep = useCallback(() => {
    api<Deep>(`/api/insights?view=deep&days=${days}${member ? `&member=${encodeURIComponent(member)}` : ""}`).then((d) => { setDeep(d); setTarget((t) => t || String(d.forecast.target)); }).catch((e) => setErr((e as Error).message));
  }, [days, member]);
  useEffect(loadDeep, [loadDeep]);

  if (err && !deep) return <div className="p-8"><Banner tone="error">{err}</Banner></div>;
  if (!data || !deep) return <div className="p-8 text-mute">Loading insights…</div>;
  const t = data.totals;
  const max = Math.max(1, ...data.series.map((s) => s[metric]));
  const unit = period === "daily" ? "Day" : period === "weekly" ? "Week starting" : "Month";
  const set = (fn: (i: typeof cfg) => typeof cfg) => setLayout((l) => ({ ...l, insights: fn(l.insights) }));
  const tiles = cfg.tiles.filter((k) => METRICS.some(([m]) => m === k)) as MetricKey[];
  const f = deep.forecast;
  const top = deep.funnel[0].count || 1;
  const saveTarget = async (raw: string) => {
    const n = Math.round(Number(raw));
    if (!n || n === f.target) return;
    await api("/api/workspace", "PUT", { targets: { bookedPerMonth: n } }).catch((e) => setErr((e as Error).message));
    loadDeep();
  };
  const tables = { sources: deep.sources, mechanisms: deep.mechanisms, objections: deep.objections };
  const maxHour = Math.max(1, ...deep.speed.byHour);
  const rateOf = (m: Deep["members"][number], key: string) => m.funnel.find((s) => s.key === key)?.rate ?? null;
  const teamRate = (key: string) => deep.teamFunnel.find((s) => s.key === key)?.rate ?? null;
  // A rate well under the team's is marked, so weak steps stand out without reading every number.
  const cell = (mine: number | null, team: number | null, den: number) => (
    <td className={`px-3 py-2 text-right tabular-nums ${mine !== null && team !== null && den >= 4 ? (team - mine >= 0.12 ? "text-err font-semibold" : mine - team >= 0.12 ? "text-ok font-semibold" : "") : ""}`}>{pct(mine)}</td>
  );

  const deepCards: Partial<Record<CardId, React.ReactNode>> = {
    actions: (
      <div className="p-4">
        <h2 className="font-semibold mb-1">What to do next</h2>
        <p className="text-[12px] text-mute mb-3">Worked out from the last {deep.days} days, most valuable first.</p>
        <ol className="space-y-3">
          {deep.actions.map((a) => (
            <li key={a.title} className="flex gap-2.5">
              <span className={`w-1.5 h-1.5 rounded-full mt-[7px] shrink-0 ${KIND[a.kind]}`} />
              <div><div className="font-medium text-[13.5px]">{a.title}</div><div className="text-[12.5px] text-ink2 leading-snug">{a.detail}</div></div>
            </li>
          ))}
          {deep.actions.length === 0 && <li className="text-mute text-[13px]">Not enough conversations in this period to suggest anything yet.</li>}
        </ol>
      </div>
    ),
    forecast: (
      <div className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold">Forecast and target</h2>
          <label className="flex items-center gap-1.5 text-[12.5px] text-mute">Bookings a month
            <input className="field !w-16 !py-1 text-[13px] text-ink tabular-nums" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} onBlur={(e) => saveTarget(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-label="Monthly bookings target" />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([["Booked this month", String(f.bookedThisMonth)], ["On course for", one(f.projected)], [`Monthly pace, last ${deep.days} days`, one(f.runRate)]] as const).map(([l, v]) => (
            <div key={l} className="rounded-[12px] border border-line px-3 py-2"><div className="label">{l}</div><div className="display text-[26px] leading-tight tabular-nums">{v}</div></div>
          ))}
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[12px] text-mute"><span>{Math.round((f.projected / f.target) * 100)}% of the {f.target} target at this pace</span><span>{f.daysLeft} days left</span></div>
          <div className="h-2 rounded bg-surface2 mt-1 overflow-hidden"><div className={`h-full rounded ${f.projected >= f.target ? "bg-ok" : "bg-brand"}`} style={{ width: `${Math.min(100, (f.projected / f.target) * 100)}%` }} /></div>
        </div>
        <dl className="mt-3 text-[13px] space-y-1">
          <div className="flex justify-between"><dt className="text-ink2">New conversations needed a day</dt><dd className="tabular-nums font-medium">{one(f.neededPerDay)} <span className="text-mute font-normal">(now {one(f.currentPerDay)})</span></dd></div>
          <div className="flex justify-between"><dt className="text-ink2">Links to send a month</dt><dd className="tabular-nums font-medium">{f.neededLinks === null ? "n/a" : Math.ceil(f.neededLinks)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink2">Lead to booked</dt><dd className="tabular-nums font-medium">{pct(f.leadToBooked)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink2">Expected from leads open now</dt><dd className="tabular-nums font-medium">{one(f.pipelineExpected)} bookings</dd></div>
        </dl>
        <div className="label mt-3 mb-1.5">Biggest levers, extra bookings a month</div>
        <ul className="space-y-1">
          {f.levers.slice(0, 4).map((l) => (
            <li key={l.label} className="flex justify-between gap-3 text-[12.5px]"><span className="text-ink2">{l.label}</span><b className="tabular-nums font-semibold">+{l.gain.toFixed(1)}</b></li>
          ))}
        </ul>
      </div>
    ),
    funnel: (
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="font-semibold">Funnel, leads that started in the last {deep.days} days</h2>
          <span className="text-[12px] text-mute">{deep.scope} · compared with the {deep.days} days before</span>
        </div>
        <div className="space-y-2">
          {deep.funnel.map((s, i) => (
            <div key={s.key} className="grid grid-cols-[130px_1fr_150px] items-center gap-3 text-[13px]">
              <span className="font-medium truncate">{s.label}</span>
              <div className="h-6 rounded bg-surface2 overflow-hidden"><div className="h-full bg-brand rounded flex items-center justify-end pr-2 text-[11px] text-onbrand tabular-nums" style={{ width: `${Math.max(3, (s.count / top) * 100)}%` }}>{s.count}</div></div>
              <span className="text-[12px] text-right tabular-nums">{i === 0 ? <span className="text-mute">before: {s.prevCount}</span> : <><b className="font-semibold">{pct(s.rate)}</b> <span className="text-mute">of previous · </span><Delta now={s.rate} before={s.prevRate} /></>}</span>
            </div>
          ))}
        </div>
        <p className="text-[11.5px] text-mute mt-3">Each lead is counted at the furthest step it has reached, so the percentages are real conversion between steps, not event counts.</p>
      </div>
    ),
    team: (
      <div>
        <div className="px-4 pt-4 pb-2 flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">Team performance</h2>
          <span className="text-[12px] text-mute">{deep.canSeeTeam ? "Red is 12 points or more under the team, green 12 or more over. Click a row to focus on that person." : "Your own numbers beside the team average."}</span>
        </div>
        <div className="overflow-auto scroll">
          <table className="w-full text-[12.5px]">
            <thead className="text-left bg-canvas">
              <tr className="border-y border-line">
                {["Setter", "Leads", "Messages", "First reply", "In 5 min", "In conversation", "Qualified", "Link sent", "Booked", "Showed", "Lead to booked", "Waiting"].map((h, i) => <th key={h} className={`px-3 py-2 label whitespace-nowrap ${i ? "text-right" : ""}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {deep.members.map((m) => (
                <tr key={m.id} onClick={() => deep.canSeeTeam && setMember(member === m.id ? "" : m.id)} className={`border-b border-line ${deep.canSeeTeam ? "cursor-pointer" : ""} ${member === m.id ? "bg-surface2" : "hover:bg-canvas"}`}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{m.name}{m.team ? <span className="text-mute font-normal"> · {m.team}</span> : null}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.leads}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.messages}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{mins(m.firstReplyMin)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(m.within5)}</td>
                  {(["engaged", "qualified", "link", "booked", "showed"] as const).map((k, i) => <Cell key={k}>{cell(rateOf(m, k), teamRate(k), m.funnel[i].count)}</Cell>)}
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{pct(m.overall)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${m.waiting >= 3 ? "text-err font-semibold" : ""}`}>{m.waiting}</td>
                </tr>
              ))}
              <tr className="bg-canvas font-medium">
                <td className="px-3 py-2">Team average</td>
                <td className="px-3 py-2 text-right tabular-nums">{deep.teamFunnel[0].count}</td>
                <td className="px-3 py-2" /><td className="px-3 py-2" /><td className="px-3 py-2" />
                {(["engaged", "qualified", "link", "booked", "showed"] as const).map((k) => <td key={k} className="px-3 py-2 text-right tabular-nums">{pct(teamRate(k))}</td>)}
                <td className="px-3 py-2 text-right tabular-nums">{pct(deep.teamFunnel[0].count ? deep.teamFunnel[4].count / deep.teamFunnel[0].count : null)}</td>
                <td className="px-3 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11.5px] text-mute">Each percentage is the share of leads that got from the step before to this one. A lead belongs to whoever it is assigned to; the first person to reply by hand takes it.</p>
      </div>
    ),
    coaching: (
      <div className="p-4">
        <h2 className="font-semibold mb-3">Coaching notes{deep.canSeeTeam ? ", by person" : ""}</h2>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {deep.members.filter((m) => m.advice.length).map((m) => (
            <div key={m.id} className="rounded-[12px] border border-line p-3">
              <div className="flex items-baseline justify-between gap-2 mb-2"><span className="font-semibold">{m.name}</span><span className="text-[11.5px] text-mute tabular-nums">{m.leads} leads · {pct(m.overall)} booked</span></div>
              <ul className="space-y-2.5">
                {m.advice.slice(0, 4).map((a) => (
                  <li key={a.title} className="flex gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full mt-[7px] shrink-0 ${KIND[a.kind]}`} />
                    <div><div className="font-medium text-[13px] leading-snug">{a.title}</div><div className="text-[12px] text-ink2 leading-snug">{a.detail}</div></div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    ),
    speed: (
      <div className="p-4">
        <h2 className="font-semibold mb-3">Speed and backlog</h2>
        <div className="grid grid-cols-2 gap-2">
          {([["First reply, median", mins(deep.speed.firstReplyMin)], ["Any reply, median", mins(deep.speed.replyMin)], ["Answered in 5 min", pct(deep.speed.within5)], ["Answered in 1 hour", pct(deep.speed.within60)]] as const).map(([l, v]) => (
            <div key={l} className="rounded-[12px] border border-line px-3 py-2"><div className="label">{l}</div><div className="display text-[24px] leading-tight tabular-nums">{v}</div></div>
          ))}
        </div>
        <div className="label mt-3 mb-1.5">When leads message, by hour</div>
        <div className="flex items-end gap-[2px] h-[52px]" aria-label="Lead messages by hour of day">
          {deep.speed.byHour.map((n, h) => <div key={h} title={`${String(h).padStart(2, "0")}:00, ${n} messages`} className="flex-1 bg-brand rounded-t" style={{ height: `${(n / maxHour) * 100}%`, minHeight: n ? 2 : 0 }} />)}
        </div>
        <div className="flex justify-between text-[10px] text-mute mt-0.5"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
        <div className="label mt-3 mb-1.5">Waiting on a reply now ({deep.speed.waitingTotal})</div>
        {deep.speed.waiting.length === 0 && <p className="text-[12.5px] text-mute">Nobody is waiting. </p>}
        <ul className="space-y-1">
          {deep.speed.waiting.map((w) => (
            <li key={w.id} className="flex items-center gap-2 text-[12.5px]">
              <a href={`/inbox?c=${w.id}`} className="font-medium underline underline-offset-2 truncate flex-1">{w.name}</a>
              <span className="text-mute truncate">{w.owner}</span>
              <span className={`tabular-nums shrink-0 ${w.hours >= 20 ? "text-err font-semibold" : ""}`}>{w.hours >= 48 ? `${Math.round(w.hours / 24)} d` : `${w.hours} h`}</span>
            </li>
          ))}
        </ul>
      </div>
    ),
    sources: (
      <div className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="font-semibold">What converts</h2>
          <Segmented label="Breakdown" value={breakdown} options={[["sources", "Source"], ["mechanisms", "Link"], ["objections", "Objection"], ["losses", "Lost why"]]} onChange={setBreakdown} />
        </div>
        {breakdown === "losses" ? (
          <ul className="space-y-1.5">
            {deep.losses.length === 0 && <li className="text-mute text-[13px]">No lost, disqualified or nurture leads in this period.</li>}
            {deep.losses.map((l) => <li key={l.name} className="flex justify-between text-[13px]"><span>{l.name}</span><b className="tabular-nums font-semibold">{l.count}</b></li>)}
          </ul>
        ) : (
          <table className="w-full text-[13px]">
            <thead><tr className="text-left"><th className="label pb-1.5">{breakdown === "sources" ? "Where they came from" : breakdown === "mechanisms" ? "Link sent" : "Objection raised"}</th><th className="label pb-1.5 text-right">Leads</th><th className="label pb-1.5 text-right">Booked</th><th className="label pb-1.5 text-right">Rate</th></tr></thead>
            <tbody>
              {tables[breakdown].length === 0 && <tr><td colSpan={4} className="text-mute py-2">Nothing in this period.</td></tr>}
              {tables[breakdown].map((r) => (
                <tr key={r.name} className="border-t border-line"><td className="py-1.5">{r.name}</td><td className="py-1.5 text-right tabular-nums">{r.leads}</td><td className="py-1.5 text-right tabular-nums">{r.booked}</td><td className="py-1.5 text-right tabular-nums font-semibold">{pct(r.rate)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    ),
  };

  const basicCards: Partial<Record<CardId, React.ReactNode>> = !t ? {} : {
    tiles: (
      <div className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold">Headline numbers</h2>
          <Segmented label="Headline range" value={range} options={RANGES} onChange={setRange} />
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
          {tiles.map((k) => (
            <button key={k} onClick={() => setMetric(k)} aria-pressed={metric === k} title="Show this metric on the trend chart" className={`text-left rounded-[12px] border px-3 py-2.5 ${metric === k ? "border-ink" : "border-line hover:border-linestrong"}`}>
              <div className="label">{metricName(k)}</div>
              <div className="display text-[30px] leading-tight tabular-nums">{t![range][k]}</div>
            </button>
          ))}
          {tiles.length === 0 && <p className="text-mute text-[13px]">No numbers chosen. Press Customise to pick some.</p>}
        </div>
        {editing && (
          <div className="mt-3 pt-3 border-t border-line">
            <div className="label mb-1.5">Numbers shown</div>
            <div className="flex flex-wrap gap-1.5">
              {METRICS.map(([k, l]) => {
                const on = cfg.tiles.includes(k);
                return <button key={k} aria-pressed={on} onClick={() => set((i) => ({ ...i, tiles: on ? i.tiles.filter((x) => x !== k) : [...i.tiles, k] }))} className={`rounded-full px-2.5 py-1 text-[12px] font-medium border ${on ? "bg-ink text-onbrand border-transparent" : "border-linestrong hover:border-ink"}`}>{l}</button>;
              })}
            </div>
          </div>
        )}
      </div>
    ),
    chart: (
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{metricName(metric)}, {period}</h2>
          <select className="field !w-auto !py-1 text-[13px]" value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)} aria-label="Metric">
            {METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-1.5 h-[190px]" data-chart>
          {data.series.map((s) => (
            <div key={s.start} className="flex-1 h-full flex flex-col justify-end items-center gap-1 min-w-0" title={`${s.label}: ${s[metric]}`}>
              <span className="text-[11px] tabular-nums text-mute">{s[metric] || ""}</span>
              <div className="w-full rounded-t bg-brand" style={{ height: `${(s[metric] / max) * 82}%`, minHeight: s[metric] ? 3 : 0 }} />
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 mt-1.5">
          {data.series.map((s) => <div key={s.start} className="flex-1 text-center text-[10px] text-mute truncate">{s.label}</div>)}
        </div>
      </div>
    ),
    rates: (
      <div className="p-4">
        <h2 className="font-semibold mb-3">Event rates, last 30 days</h2>
        <ul className="space-y-3">
          {RATE.map(([label, num, den]) => {
            const d = t!.last30[den];
            const pct = d ? Math.round((t!.last30[num] / d) * 100) : null;
            return (
              <li key={label}>
                <div className="flex justify-between text-[13px]"><span>{label}</span><b className="tabular-nums font-semibold">{pct === null ? "n/a" : `${pct}%`}</b></div>
                <div className="h-1.5 rounded bg-surface2 mt-1"><div className="h-full rounded bg-brand" style={{ width: `${Math.min(100, pct ?? 0)}%` }} /></div>
                <div className="text-[11px] text-mute mt-0.5">{t!.last30[num]} of {d}</div>
              </li>
            );
          })}
        </ul>
      </div>
    ),
    totals: (
      <div className="overflow-auto scroll">
        <table className="w-full text-[13px]">
          <thead className="text-left bg-canvas">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 label">Metric</th>
              {["Today", "This week", "This month", "Last 30 days"].map((h) => <th key={h} className="px-4 py-2.5 label text-right whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {METRICS.map(([k, label]) => (
              <tr key={k} onClick={() => setMetric(k)} className={`border-b border-line cursor-pointer ${metric === k ? "bg-surface2" : "hover:bg-canvas"}`}>
                <td className="px-4 py-2 font-medium whitespace-nowrap">{label}</td>
                {[t!.today, t!.week, t!.month, t!.last30].map((c, i) => <td key={i} className="px-4 py-2 text-right tabular-nums">{c[k]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
    breakdown: (
      <div className="overflow-auto scroll">
        <table className="w-full text-[12.5px]">
          <thead className="text-left bg-canvas">
            <tr className="border-b border-line">
              <th className="px-3 py-2.5 label whitespace-nowrap">{unit}</th>
              {METRICS.map(([k, l]) => <th key={k} className="px-3 py-2.5 label text-right whitespace-nowrap">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...data.series].reverse().map((s) => (
              <tr key={s.start} className="border-b border-line">
                <td className="px-3 py-1.5 font-medium whitespace-nowrap">{s.label}</td>
                {METRICS.map(([k]) => <td key={k} className="px-3 py-1.5 text-right tabular-nums">{s[k]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  };

  const body: Partial<Record<CardId, React.ReactNode>> = { ...deepCards, ...basicCards };
  const shown = cfg.order.filter((c) => !cfg.hidden.includes(c) && body[c] && (deep.canSeeTeam || c !== "team" || deep.members.length > 0));

  return (
    <div className="d-page h-full overflow-y-auto scroll p-6">
      <PageHeader title="Insights" sub={`${deep.leads} leads started in the last ${deep.days} days. ${deep.canSeeTeam ? "Showing " + deep.scope.toLowerCase() + "." : "Showing your own leads."}`}>
        {deep.canSeeTeam && deep.memberOptions.length > 0 && (
          <select className="field !w-auto !py-1.5 text-[13px]" value={member} onChange={(e) => setMember(e.target.value)} aria-label="Team member">
            <option value="">Everyone</option>
            {deep.memberOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <select className="field !w-auto !py-1.5 text-[13px]" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Date range">
          {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
        {t && <Segmented label="Period" value={period} options={[["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]]} onChange={setPeriod} />}
        <Button variant={editing ? "primary" : "secondary"} aria-pressed={editing} onClick={() => setEditing((v) => !v)}><Icon d={ICONS.sliders} size={14} />{editing ? "Done" : "Customise"}</Button>
      </PageHeader>
      {state?.flags.demoData && <div className="mb-4"><Banner tone="warn">These numbers come from the built-in demo conversations, not a real account.</Banner></div>}

      {editing && (
        <div className="mb-4 rounded-[12px] border border-dashed border-linestrong p-3 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-ink2 flex-1 min-w-[220px]">Move, resize or hide each card with the bar above it. Your arrangement is saved in this browser.</span>
          {cfg.hidden.filter((c) => body[c]).map((c) => (
            <Button key={c} onClick={() => set((i) => ({ ...i, hidden: i.hidden.filter((x) => x !== c) }))}><Icon d={ICONS.plus} size={14} />{CARD_NAMES[c]}</Button>
          ))}
          <Button variant="ghost" onClick={() => setLayout((l) => ({ ...l, insights: { order: Object.keys(CARD_NAMES) as CardId[], hidden: ["totals", "breakdown"], size: DEFAULT_CARD_SIZE, tiles: ["conversations", "linksSent", "booked", "showed", "won"] } }))}>Reset</Button>
        </div>
      )}

      <div className="grid grid-cols-6 gap-4">
        {shown.map((c, i) => (
          <section key={c} aria-label={CARD_NAMES[c]} className="card overflow-hidden min-w-0" style={{ gridColumn: `span ${cfg.size[c]}` }}>
            {editing && (
              <div className="flex items-center gap-1 px-3 h-9 border-b border-line bg-canvas text-[12px]">
                <span className="label !text-ink flex-1 truncate">{CARD_NAMES[c]}</span>
                <button aria-label={`Move ${CARD_NAMES[c]} earlier`} disabled={i === 0} className="p-1 rounded hover:bg-surface2 disabled:opacity-25" onClick={() => set((x) => ({ ...x, order: move(x.order, c, x.order.indexOf(shown[i - 1]) - x.order.indexOf(c)) }))}><Icon d={ICONS.chevLeft} size={14} /></button>
                <button aria-label={`Move ${CARD_NAMES[c]} later`} disabled={i === shown.length - 1} className="p-1 rounded hover:bg-surface2 disabled:opacity-25" onClick={() => set((x) => ({ ...x, order: move(x.order, c, x.order.indexOf(shown[i + 1]) - x.order.indexOf(c)) }))}><Icon d={ICONS.chevRight} size={14} /></button>
                <select aria-label={`Width of ${CARD_NAMES[c]}`} className="field !w-auto !py-0.5 !px-1.5 text-[12px]" value={cfg.size[c]} onChange={(e) => set((x) => ({ ...x, size: { ...x.size, [c]: Number(e.target.value) as CardSize } }))}>
                  {SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button aria-label={`Hide ${CARD_NAMES[c]}`} className="p-1 rounded text-mute hover:text-ink" onClick={() => set((x) => ({ ...x, hidden: [...x.hidden, c] }))}><Icon d={ICONS.eyeOff} size={14} /></button>
              </div>
            )}
            {body[c]}
          </section>
        ))}
        {shown.length === 0 && <p className="col-span-6 text-mute text-center py-10">Every card is hidden. Press Customise to bring one back.</p>}
      </div>
    </div>
  );
}

/** Lets a table cell built elsewhere sit in a keyed list. */
function Cell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
