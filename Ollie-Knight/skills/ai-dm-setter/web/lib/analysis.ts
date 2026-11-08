import type { Conversation, Db, Member } from "./types";
import { isAdmin } from "./auth";
import { pipelineOf } from "./pipeline";

// The deeper read behind Insights: where leads drop out, how fast replies go, what each setter converts,
// what the month is on course for, and what to do about it. Everything here is worked out from stored
// conversations, so it is the same whether the AI is connected or not.

export const STEPS = [
  ["started", "New conversations"],
  ["engaged", "In conversation"],
  ["qualified", "Qualified"],
  ["link", "Link sent"],
  ["booked", "Booked"],
  ["showed", "Showed"],
  ["won", "Won"],
] as const;
export type StepKey = (typeof STEPS)[number][0];

const STAGE_STEP: Record<string, number> = { in_conversation: 1, business_model_sent: 1, qualified: 2, link_sent: 3, booked: 4, no_show: 4, showed: 5, won: 6 };
const HOUR = 36e5;
const DAY = 24 * HOUR;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const rate = (num: number, den: number) => (den ? num / den : null);
const pct = (r: number | null) => (r === null ? "n/a" : `${Math.round(r * 100)}%`);
const mins = (m: number | null) => (m === null ? "n/a" : m < 1 ? "under a minute" : m < 90 ? `${Math.round(m)} min` : m < 2880 ? `${(m / 60).toFixed(1)} hours` : `${Math.round(m / 1440)} days`);

interface Fact {
  c: Conversation;
  created: number;
  owner: string;
  step: number;
  firstReply: number | null;
  /** [minutes, who replied] for every lead message that got an answer */
  replies: [number, string][];
  followUps: number;
  waitingHours: number | null;
  mechanism: string | null;
  out: Record<string, number>;
}

function factsOf(db: Db): Fact[] {
  const byConv = new Map<string, { msgs: Db["messages"]; events: Db["events"] }>();
  for (const c of db.conversations) byConv.set(c.id, { msgs: [], events: [] });
  for (const m of db.messages) byConv.get(m.conversationId)?.msgs.push(m);
  for (const e of db.events) byConv.get(e.conversationId)?.events.push(e);
  const now = Date.now();
  return db.conversations.map((c) => {
    const { msgs, events } = byConv.get(c.id)!;
    msgs.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    let step = STAGE_STEP[c.stage] ?? 0;
    let mechanism: string | null = null;
    for (const e of events) {
      if (e.type === "stage_changed" && e.stage) step = Math.max(step, STAGE_STEP[e.stage] ?? 0);
      if (e.type === "link_sent") { step = Math.max(step, 3); mechanism = e.detail || "Link"; }
    }
    const replies: [number, string][] = [];
    const out: Record<string, number> = {};
    let pendingIn: number | null = null;
    let lastOut: number | null = null;
    let followUps = 0;
    let firstReply: number | null = null;
    for (const m of msgs) {
      const t = new Date(m.sentAt).getTime();
      if (m.direction === "in") {
        pendingIn ??= t;
        lastOut = null;
        continue;
      }
      const who = m.sender === "ai" || m.sender === "auto" ? "ai" : m.memberId || "";
      out[who] = (out[who] ?? 0) + 1;
      if (pendingIn !== null) {
        const gap = (t - pendingIn) / 60000;
        replies.push([gap, who]);
        firstReply ??= gap;
        pendingIn = null;
      } else if (lastOut !== null && t - lastOut > 20 * HOUR) followUps++;
      lastOut = t;
    }
    const open = c.status !== "done" && c.status !== "spam" && !["won", "lost", "disqualified", "nurture"].includes(c.stage);
    // Once a call is booked the setter's job on the thread is done, so those are not counted as waiting.
    // Past 7 days Meta will not accept a reply at all, so those are no longer something anyone can act on.
    const waited = pendingIn !== null ? (now - pendingIn) / HOUR : 0;
    const waitingHours = pendingIn !== null && open && step < 4 && waited <= 168 ? waited : null;
    const owner = c.assignedTo || (out.ai ? "ai" : Object.keys(out).find((k) => k) || "none");
    return { c, created: new Date(c.createdAt).getTime(), owner, step, firstReply, replies, followUps, waitingHours, mechanism, out };
  });
}

function funnel(fs: Fact[]) {
  const counts = STEPS.map((_, i) => fs.filter((f) => f.step >= i).length);
  return STEPS.map(([key, label], i) => ({ key, label, count: counts[i], rate: i === 0 ? null : rate(counts[i], counts[i - 1]), ofStart: rate(counts[i], counts[0]) }));
}
type Funnel = ReturnType<typeof funnel>;
const stepRate = (f: Funnel, key: StepKey) => f.find((s) => s.key === key)!.rate;
const stepCount = (f: Funnel, key: StepKey) => f.find((s) => s.key === key)!.count;

export interface Advice { title: string; detail: string; impact: number; kind: "fix" | "strength" | "watch" }

const STEP_ADVICE: Record<Exclude<StepKey, "started">, (who: string, mine: string, team: string) => [string, string]> = {
  engaged: (who, mine, team) => [`${who} is losing leads at the first reply`, `${mine} of new leads become a two way conversation, against ${team} for the team. Open with a question about the lead rather than a statement, and answer while they are still online.`],
  qualified: (who, mine, team) => [`${who} qualifies fewer conversations`, `${mine} of conversations reach Qualified, against ${team} for the team. Read five threads that stalled: check the qualifying questions go out one at a time and that the business model breakdown is being sent before the lead goes quiet.`],
  link: (who, mine, team) => [`${who} holds back the link`, `${mine} of qualified leads are sent a link, against ${team} for the team. Once a lead says the breakdown fits, the link should go in the next message.`],
  booked: (who, mine, team) => [`${who} sends links that do not turn into bookings`, `${mine} of links sent become a booking, against ${team} for the team. Say what the call covers and ask for a day in the same message, then follow up inside 24 hours when nothing is booked.`],
  showed: (who, mine, team) => [`${who} has a low show rate`, `${mine} of booked calls show, against ${team} for the team. Send a confirmation the day before and collect an email or phone number at booking so the reminder lands.`],
  won: (who, mine, team) => [`${who} has calls that show but do not close`, `${mine} of calls that showed were won, against ${team} for the team. Check the handover: the closer should have the lead's goal, pain and objections before the call.`],
};

function memberAdvice(name: string, mine: Funnel, team: Funnel, speed: { first: number | null; teamFirst: number | null; waiting: number; longest: number; stalledLinks: number; stalledFollowed: number }): Advice[] {
  const out: Advice[] = [];
  const first = name.split(" ")[0];
  // Bookings a month this setter would gain by matching the team at that step, used to rank the advice.
  const downstream = (i: number) => STEPS.slice(i + 1, 5).reduce((p, [k]) => p * (stepRate(team, k) ?? 0), 1);
  let best: { gap: number; key: StepKey } | null = null;
  STEPS.forEach(([key], i) => {
    if (i === 0) return;
    const den = mine[i - 1].count;
    const m = mine[i].rate;
    const t = team[i].rate;
    if (den < 4 || m === null || t === null) return;
    const gap = t - m;
    if (gap >= 0.12) {
      const [title, detail] = STEP_ADVICE[key as Exclude<StepKey, "started">](first, pct(m), pct(t));
      out.push({ title, detail, impact: i <= 4 ? gap * den * downstream(i) : gap * den * 0.5, kind: "fix" });
    } else if (-gap >= 0.12 && (!best || -gap > best.gap)) best = { gap: -gap, key };
  });
  if (speed.first !== null && speed.teamFirst !== null && speed.first > 30 && speed.first > speed.teamFirst * 2) {
    out.push({ title: `${first} is slow to the first reply`, detail: `Median first reply is ${mins(speed.first)}, against ${mins(speed.teamFirst)} for the team. Leads go cold within minutes. Turn on notifications for this inbox, or let the AI send the opener and hand over once the lead answers.`, impact: 1.5, kind: "fix" });
  }
  if (speed.waiting >= 3) {
    out.push({ title: `${speed.waiting} leads are waiting on ${first}`, detail: `The longest has been waiting ${mins(speed.longest * 60)}. Clear these first; every one is inside or close to Meta's 24 hour window.`, impact: 1 + speed.waiting * 0.2, kind: "fix" });
  }
  if (speed.stalledLinks >= 3 && speed.stalledFollowed / speed.stalledLinks < 0.5) {
    out.push({ title: `${first} is not following up on links`, detail: `${speed.stalledLinks} leads have a link and no booking, and only ${speed.stalledFollowed} got a follow up. One nudge the next day recovers a share of these.`, impact: speed.stalledLinks * 0.15, kind: "fix" });
  }
  if (best) {
    const b = best as { gap: number; key: StepKey };
    const label = STEPS.find(([k]) => k === b.key)![1].toLowerCase();
    out.push({ title: `${first} is the strongest at getting leads to ${label}`, detail: `${pct(stepRate(mine, b.key))} against ${pct(stepRate(team, b.key))} for the team. Worth having ${first} show the others how they handle that step.`, impact: 0, kind: "strength" });
  }
  if (!out.length) out.push({ title: mine[0].count < 5 ? `Not enough leads yet to judge ${first}` : `${first} is in line with the team`, detail: mine[0].count < 5 ? `${mine[0].count} lead${mine[0].count === 1 ? "" : "s"} in this period. Advice appears once there are at least 4 at a step.` : "No step is more than 12 points off the team average in this period.", impact: 0, kind: "watch" });
  return out.sort((a, b) => b.impact - a.impact);
}

export function analyse(db: Db, opts: { days: number; viewer: Member; member?: string }) {
  const { days, viewer } = opts;
  const pipe = pipelineOf(db.workspace.pipeline);
  const now = Date.now();
  const all = factsOf(db);
  const inRange = (f: Fact, from: number, to: number) => f.created >= from && f.created < to;
  const seeAll = isAdmin(viewer) || viewer.teamMetrics;
  // Someone without team metrics sees the whole picture only through their own leads.
  const scoped = seeAll ? (opts.member ? all.filter((f) => f.owner === opts.member) : all) : all.filter((f) => f.owner === viewer.id);
  const cur = scoped.filter((f) => inRange(f, now - days * DAY, now + 1));
  const prev = scoped.filter((f) => inRange(f, now - 2 * days * DAY, now - days * DAY));
  const fCur = funnel(cur);
  const fPrev = funnel(prev);

  // Team comparison always uses everyone, so a setter can be shown the average without the names.
  const teamCur = all.filter((f) => inRange(f, now - days * DAY, now + 1));
  const fTeam = funnel(teamCur);
  const teamFirst = median(teamCur.map((f) => f.firstReply).filter((x): x is number => x !== null));

  const nameOf = (id: string) => (id === "ai" ? "AI setter" : id === "none" ? "Unassigned" : db.workspace.members.find((m) => m.id === id)?.name ?? "Former member");
  const owners = [...new Set(teamCur.map((f) => f.owner))];
  const members = owners
    .filter((id) => seeAll || id === viewer.id)
    .map((id) => {
      const mine = teamCur.filter((f) => f.owner === id);
      const fm = funnel(mine);
      const firsts = mine.map((f) => f.firstReply).filter((x): x is number => x !== null);
      const waiting = all.filter((f) => f.owner === id && f.waitingHours !== null);
      const stalled = mine.filter((f) => f.step === 3);
      const m = db.workspace.members.find((x) => x.id === id);
      const first = median(firsts);
      return {
        id, name: nameOf(id), team: m?.team ?? "", kind: id === "ai" ? "ai" : id === "none" ? "unassigned" : "member",
        leads: mine.length,
        messages: mine.reduce((n, f) => n + (f.out[id] ?? 0), 0),
        firstReplyMin: first,
        within5: rate(firsts.filter((x) => x <= 5).length, firsts.length),
        followUps: mine.reduce((n, f) => n + f.followUps, 0),
        waiting: waiting.length,
        funnel: fm,
        overall: rate(stepCount(fm, "booked"), stepCount(fm, "started")),
        advice: id === "none" ? [] : memberAdvice(nameOf(id), fm, fTeam, {
          first, teamFirst, waiting: waiting.length, longest: Math.max(0, ...waiting.map((f) => f.waitingHours ?? 0)),
          stalledLinks: stalled.length, stalledFollowed: stalled.filter((f) => f.followUps > 0).length,
        }),
      };
    })
    .sort((a, b) => b.leads - a.leads);

  // Speed
  const firsts = cur.map((f) => f.firstReply).filter((x): x is number => x !== null);
  const allReplies = cur.flatMap((f) => f.replies.map(([m]) => m));
  const byHour = Array.from({ length: 24 }, () => 0);
  const ids = new Set(cur.map((f) => f.c.id));
  for (const m of db.messages) if (m.direction === "in" && ids.has(m.conversationId)) byHour[new Date(m.sentAt).getHours()]++;
  const waiting = scoped.filter((f) => f.waitingHours !== null).sort((a, b) => (b.waitingHours ?? 0) - (a.waitingHours ?? 0));
  const speed = {
    firstReplyMin: median(firsts),
    prevFirstReplyMin: median(prev.map((f) => f.firstReply).filter((x): x is number => x !== null)),
    replyMin: median(allReplies),
    within5: rate(firsts.filter((x) => x <= 5).length, firsts.length),
    within60: rate(firsts.filter((x) => x <= 60).length, firsts.length),
    neverReplied: cur.filter((f) => f.firstReply === null && !Object.keys(f.out).length).length,
    byHour,
    waiting: waiting.slice(0, 8).map((f) => ({ id: f.c.id, name: f.c.name, hours: Math.round((f.waitingHours ?? 0) * 10) / 10, owner: nameOf(f.owner), stage: pipe.stage(f.c.stage).name })),
    waitingTotal: waiting.length,
  };

  // Breakdowns
  const group = <K extends string>(fs: Fact[], key: (f: Fact) => K[] | K | null) => {
    const map = new Map<string, Fact[]>();
    for (const f of fs) for (const k of [key(f)].flat().filter(Boolean) as string[]) map.set(k, [...(map.get(k) ?? []), f]);
    return [...map.entries()].map(([name, xs]) => ({ name, leads: xs.length, booked: xs.filter((f) => f.step >= 4).length, rate: rate(xs.filter((f) => f.step >= 4).length, xs.length) })).sort((a, b) => b.leads - a.leads);
  };
  const objectionTags = new Set(pipe.groups.find((g) => g.group === "Objection")?.labels ?? []);
  const sources = group(cur, (f) => f.c.origin);
  const mechanisms = group(cur.filter((f) => f.mechanism), (f) => f.mechanism);
  const objections = group(cur, (f) => [...new Set([...(f.c.lead.objections ?? []), ...f.c.labels.filter((l) => objectionTags.has(l))])]);
  const losses = [...cur.reduce((m, f) => (f.c.lossReason && ["lost", "disqualified", "nurture"].includes(f.c.stage) ? m.set(f.c.lossReason, (m.get(f.c.lossReason) ?? 0) + 1) : m), new Map<string, number>())].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  // Forecast: what the month is on course for, what the target needs, and which step moves it most.
  const today = new Date(now);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const elapsed = Math.max(0.5, (now - monthStart) / DAY);
  const scopedIds = new Set(scoped.map((f) => f.c.id));
  const bookedThisMonth = db.events.filter((e) => e.type === "stage_changed" && e.stage === "booked" && scopedIds.has(e.conversationId) && new Date(e.at).getTime() >= monthStart).length;
  const target = Math.max(1, db.workspace.targets.bookedPerMonth);
  const rates = STEPS.slice(1, 5).map(([k]) => stepRate(fCur, k) ?? 0);
  const perMonth = (stepCount(fCur, "started") / days) * 30;
  const bookingsAt = (rs: number[], volume = perMonth) => rs.reduce((p, r) => p * r, volume);
  const baseline = bookingsAt(rates);
  const leadToBooked = rate(stepCount(fCur, "booked"), stepCount(fCur, "started"));
  const levers = [
    { step: "started" as StepKey, label: "10% more new conversations", gain: bookingsAt(rates, perMonth * 1.1) - baseline },
    ...STEPS.slice(1, 5).map(([k, label], i) => ({
      step: k as StepKey,
      label: `${label}: ${pct(rates[i])} to ${pct(Math.min(1, rates[i] + 0.1))}`,
      gain: bookingsAt(rates.map((r, j) => (j === i ? Math.min(1, r + 0.1) : r))) - baseline,
    })),
  ].sort((a, b) => b.gain - a.gain);
  // Chance that a lead sitting at each step ends up booked, from every lead old enough to have played out.
  const settled = scoped.filter((f) => f.created < now - 7 * DAY);
  const openNow = scoped.filter((f) => f.c.status !== "done" && f.step < 4 && !["lost", "disqualified", "nurture"].includes(f.c.stage));
  const pipeline = STEPS.slice(0, 4).map(([k, label], i) => {
    const reached = settled.filter((f) => f.step >= i);
    const p = rate(reached.filter((f) => f.step >= 4).length, reached.length) ?? 0;
    const sitting = openNow.filter((f) => f.step === i).length;
    return { step: k, label, open: sitting, chance: p, expected: sitting * p };
  });
  const forecast = {
    target,
    bookedThisMonth,
    projected: (bookedThisMonth / elapsed) * daysInMonth,
    daysLeft: Math.max(0, Math.ceil(daysInMonth - elapsed)),
    runRate: baseline,
    leadToBooked,
    neededConversations: leadToBooked ? target / leadToBooked : null,
    neededPerDay: leadToBooked ? target / leadToBooked / 30 : null,
    currentPerDay: stepCount(fCur, "started") / days,
    neededLinks: rates[3] ? target / rates[3] : null,
    levers,
    pipeline,
    pipelineExpected: pipeline.reduce((n, p) => n + p.expected, 0),
  };

  // What to do next, for the whole operation.
  const actions: Advice[] = [];
  const drops = fCur.slice(1, 5).map((s, i) => ({ s, lost: fCur[i].count - s.count, i })).filter((d) => fCur[d.i].count >= 5 && d.s.rate !== null).sort((a, b) => (a.s.rate ?? 1) - (b.s.rate ?? 1));
  if (drops[0]) {
    const d = drops[0];
    const lever = levers.find((l) => l.step === d.s.key);
    actions.push({ title: `Biggest leak: ${fCur[d.i].label} to ${d.s.label}`, detail: `${d.lost} of ${fCur[d.i].count} leads stop here (${pct(d.s.rate)} get through). Lifting this by 10 points is worth about ${(lever?.gain ?? 0).toFixed(1)} more bookings a month at current volume.`, impact: 5, kind: "fix" });
  }
  if (forecast.neededPerDay !== null) {
    const short = forecast.neededPerDay - forecast.currentPerDay;
    const need = `At ${pct(leadToBooked)} lead to booked, ${target} bookings a month takes about ${forecast.neededPerDay.toFixed(1)} new conversations a day; you are getting ${forecast.currentPerDay.toFixed(1)}.`;
    if (forecast.projected >= target) {
      actions.push({ title: `On course for ${Math.round(forecast.projected)} bookings against a target of ${target}`, detail: `${bookedThisMonth} booked so far with ${forecast.daysLeft} days left. ${need}${short > 0.05 ? " Recent volume is lighter than that, so keep new conversations coming to hold the pace next month." : ""}`, impact: 0.5, kind: "strength" });
    } else {
      actions.push({ title: `Behind the ${target} bookings target, on course for ${Math.round(forecast.projected)}`, detail: `${need} ${short > 0.05 ? `Add ${short.toFixed(1)} conversations a day, or raise conversion (see the levers).` : "Volume is there, so the gap is conversion: see the levers and the biggest leak."}`, impact: 4, kind: "fix" });
    }
  }
  if (speed.waitingTotal) actions.push({ title: `${speed.waitingTotal} lead${speed.waitingTotal === 1 ? " is" : "s are"} waiting on a reply`, detail: `Longest wait is ${mins((waiting[0].waitingHours ?? 0) * 60)} (${waiting[0].c.name}). Unanswered leads are the cheapest bookings to recover.`, impact: 3 + Math.min(2, speed.waitingTotal / 5), kind: "fix" });
  if (speed.firstReplyMin !== null && speed.firstReplyMin > 15) actions.push({ title: "First replies are slow", detail: `Median first reply is ${mins(speed.firstReplyMin)}, and ${pct(speed.within5)} of leads hear back within 5 minutes. Put new conversations on AI suggest or autopilot for the opener.`, impact: 3, kind: "fix" });
  const srcOk = sources.filter((s) => s.leads >= 5 && s.rate !== null);
  if (srcOk.length >= 2) {
    const top = [...srcOk].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
    if ((top[0].rate ?? 0) - (top[top.length - 1].rate ?? 0) >= 0.1) actions.push({ title: `${top[0].name} leads book best`, detail: `${pct(top[0].rate)} of ${top[0].name.toLowerCase()} leads book, against ${pct(top[top.length - 1].rate)} from ${top[top.length - 1].name.toLowerCase()}. Put more content and budget behind the first.`, impact: 2, kind: "strength" });
  }
  const mechOk = mechanisms.filter((m) => m.leads >= 4);
  if (mechOk.length >= 2) {
    const top = [...mechOk].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
    actions.push({ title: `${top[0].name} converts best once sent`, detail: mechOk.map((m) => `${m.name}: ${pct(m.rate)} booked of ${m.leads} sent`).join(". ") + ".", impact: 1.5, kind: "watch" });
  }
  if (objections[0] && objections[0].leads >= 3) actions.push({ title: `Most common objection: ${objections[0].name}`, detail: `Raised by ${objections[0].leads} leads; ${pct(objections[0].rate)} of them still booked. Make sure the playbook has a strong answer and add it as a shortcut.`, impact: 1, kind: "watch" });
  const stalled = cur.filter((f) => f.step === 3 && f.c.status !== "done");
  if (stalled.length >= 3) actions.push({ title: `${stalled.length} leads have a link and no booking`, detail: `${stalled.filter((f) => f.followUps > 0).length} have had a follow up. Filter the inbox by the Link sent stage and work through them with a follow up shortcut.`, impact: 2.5, kind: "fix" });

  return {
    days,
    scope: seeAll ? (opts.member ? nameOf(opts.member) : "Everyone") : viewer.name,
    canSeeTeam: seeAll,
    leads: cur.length,
    funnel: fCur.map((s, i) => ({ ...s, prevRate: fPrev[i].rate, prevCount: fPrev[i].count })),
    teamFunnel: fTeam,
    speed,
    members,
    memberOptions: seeAll ? owners.map((id) => ({ id, name: nameOf(id) })) : [],
    sources, mechanisms, objections, losses,
    forecast,
    actions: actions.sort((a, b) => b.impact - a.impact),
  };
}
export type Deep = ReturnType<typeof analyse>;
