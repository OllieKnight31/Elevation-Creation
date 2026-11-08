import { defaultOutreach } from "./outreach";
import { defaultCalendar } from "./calendar";
import { normaliseSheets } from "./sheets";
import type { Conversation, Db, FunnelEvent, Member, Message, StageId, Workspace } from "./types";
import { randomBytes, randomUUID } from "crypto";
import { DEFAULT_SHORTCUTS } from "./shortcuts";

const H = 36e5;
const D = 24 * H;

export function emptyWorkspace(): Workspace {
  return {
    id: "ws_local",
    apiToken: "setter_" + randomUUID().replace(/-/g, ""),
    onboardingComplete: false,
    intake: {
      businessName: "",
      ownerName: "",
      niche: "",
      businessModel: "",
      offer: "",
      price: "",
      idealClient: "",
      notAFit: "",
      qualifyingQuestions: [""],
      breakdownMessage: "",
      goals: [{ id: "g1", type: "call", label: "Strategy call", url: "", when: "Qualified and ready to talk" }],
      voiceNotes: "",
      neverSay: "",
      approvedClaims: "",
      identity: "team",
      aboutMe: "",
      slang: "",
    },
    meta: { capiEnabled: false, mirrorMessengerLabels: true },
    settings: {
      defaultAiMode: "suggest",
      autopilotMaster: false,
      disclosure: "Quick heads up, I use an AI assistant to help me keep up with DMs. A real person reads everything.",
      replyDelaySeconds: 45,
    },
    playbook: null,
    secret: randomBytes(32).toString("hex"),
    members: [],
    shortcuts: DEFAULT_SHORTCUTS.map((x) => ({ ...x })),
    triggers: [],
    crm: { enabled: false, webhookUrl: "", ghl: { enabled: false, locationId: "", pipelineId: "", stageMap: {} }, log: [] },
    targets: { bookedPerMonth: 20 },
    outreach: defaultOutreach(),
    knowledge: { items: [], gaps: [] },
    calendar: defaultCalendar(),
    sheets: normaliseSheets(),
  };
}

const demoMember = (id: string, name: string, role: Member["role"]): Member => ({
  id, name, email: "", role, team: "Demo team", areas: ["inbox", "leads", "insights"], scope: "all", teamMetrics: false, active: true,
  createdAt: new Date(0).toISOString(), demo: true,
});
/** Sample setters that come with the demo conversations, so team numbers have something to show. They cannot sign in. */
export const DEMO_MEMBERS: Member[] = [demoMember("demo_sam", "Sam Carter (demo)", "setter"), demoMember("demo_jess", "Jess Moore (demo)", "setter"), demoMember("demo_ravi", "Ravi Patel (demo)", "setter")];

type Line = [dir: "in" | "out", text: string, hoursAfterPrev?: number];

interface Script {
  name: string;
  handle: string;
  platform?: "instagram" | "messenger";
  origin: string;
  stage: StageId;
  labels: string[];
  startedDaysAgo: number;
  lastHoursAgo: number;
  lines: Line[];
  lead?: Conversation["lead"];
  lossReason?: string;
  /** stages passed through, in order, as fractions of the conversation timeline */
  path: StageId[];
}

const LINK = "https://cal.example.com/strategy-call";
const VIDEO = "https://example.com/watch";

/** Small repeatable random source, so the demo looks the same on every load. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How each sample setter tends to perform: chance of getting a lead past each step, and how fast they reply (minutes).
const STYLE: Record<string, { engage: number; qualify: number; link: number; book: number; show: number; win: number; reply: number; backlog: number }> = {
  demo_sam: { engage: 0.92, qualify: 0.7, link: 0.9, book: 0.62, show: 0.8, win: 0.45, reply: 4, backlog: 0.05 },
  demo_jess: { engage: 0.7, qualify: 0.62, link: 0.85, book: 0.3, show: 0.7, win: 0.35, reply: 190, backlog: 0.45 },
  demo_ravi: { engage: 0.88, qualify: 0.2, link: 0.6, book: 0.55, show: 0.55, win: 0.4, reply: 28, backlog: 0.15 },
  ai: { engage: 0.9, qualify: 0.58, link: 0.88, book: 0.44, show: 0.72, win: 0.38, reply: 1, backlog: 0 },
};
const FIRST = ["Olivia", "Noah", "Amelia", "Liam", "Isla", "Ethan", "Ava", "Mason", "Freya", "Lucas", "Mia", "Oscar", "Zara", "Theo", "Ruby", "Kai", "Nina", "Felix", "Layla", "Jonah", "Esme", "Reuben", "Tia", "Caleb"];
const LAST = ["Hughes", "Santos", "Wright", "Ali", "Novak", "Greene", "Mendez", "Foster", "Lindqvist", "Okoye", "Barker", "Shah"];
const ORIGINS = ["Inbound DM", "Story reply", "Comment keyword", "Ad click", "Referral"];
const OPENERS = ["how does this work?", "saw your post, is this for coaches?", "GUIDE", "do you help with getting clients from instagram?", "a friend sent me your page", "is there a waitlist?"];
const ANSWERS = ["coaching, about 4 clients right now", "consulting, stuck around 3k a month", "online trainer, want to leave my job", "agency owner, referrals have dried up"];
const OBJ = ["Price", "Timing", "Trust", "Needs partner"];

const SCRIPTS: Script[] = [
  {
    name: "Maya Thompson", handle: "maya.coaches", origin: "Story reply", stage: "inbound",
    labels: ["Story reply", "Warm"], startedDaysAgo: 0, lastHoursAgo: 0.4, path: ["inbound"],
    lines: [["in", "this story hit home. how do you actually get clients without posting 3 times a day??"]],
  },
  {
    name: "Jordan Reyes", handle: "jordanreyes.fit", origin: "Comment keyword", stage: "in_conversation",
    labels: ["Comment keyword", "Warm"], startedDaysAgo: 1, lastHoursAgo: 2, path: ["inbound", "in_conversation"],
    lead: { situation: "Online fitness coach, 6 clients", goal: "Replace gym salary" },
    lines: [
      ["in", "SYSTEM"],
      ["out", "hey Jordan, sending that over now. what made you grab it?", 0.1],
      ["in", "been coaching online about 8 months, stuck at 6 clients and still working at the gym", 3],
      ["out", "got it. what would it take for you to drop the gym shifts?", 0.3],
      ["in", "honestly about 5k a month consistently. im at maybe 1.8k right now", 18],
    ],
  },
  {
    name: "Priya Nair", handle: "priya.designs", origin: "Inbound DM", stage: "business_model_sent",
    labels: ["Inbound DM", "Hot"], startedDaysAgo: 2, lastHoursAgo: 5, path: ["inbound", "in_conversation", "business_model_sent"],
    lead: { situation: "Brand designer, referrals only", goal: "10k months", pain: "Feast and famine" },
    lines: [
      ["in", "hi! found you through a friend. do you work with designers?"],
      ["out", "hey Priya, yes a few. what does your client flow look like right now?", 0.5],
      ["in", "all referrals. some months 8k some months 2k. its exhausting", 2],
      ["out", "that swing is the real problem, not the skill. where do you want it to sit?", 0.4],
      ["in", "steady 10k would change everything", 6],
      ["out", "ok so here is how we do it. we build one inbound channel from your content, a DM process that books calls, and a simple offer at one price. no cold outreach. most people see the first booked calls inside 3 weeks. want me to show you what that would look like for a design studio?", 0.6],
    ],
  },
  {
    name: "Dan Whitlock", handle: "danwhitlock", origin: "Ad click", stage: "qualified",
    labels: ["Ad click", "Hot", "Price"], startedDaysAgo: 3, lastHoursAgo: 9, path: ["inbound", "in_conversation", "business_model_sent", "qualified"],
    lead: { situation: "Mortgage broker turned consultant, 3 clients at 2k", goal: "15k a month", pain: "No time for content", objections: ["Price"], budget: "Asked about payment plans" },
    lines: [
      ["in", "saw the ad. how much is this"],
      ["out", "hey Dan, happy to get into numbers. what are you working on so I point you the right way?", 0.2],
      ["in", "consulting for brokers. 3 clients at 2k. want 15k months", 1],
      ["out", "nice base to build from. whats stopping you getting client 4 and 5?", 0.3],
      ["in", "time. no clue what to post and no time to do it", 4],
      ["out", "makes sense. the way we fix that is one inbound channel, a DM process that books the calls, and one offer. you are a fit for it. want to jump on a call this week and map it out?", 0.5],
      ["in", "maybe. is there a payment plan? money is tight this month", 22],
    ],
  },
  {
    name: "Sofia Marchetti", handle: "sofia.m.wellness", origin: "Story reply", stage: "link_sent",
    labels: ["Story reply", "Hot"], startedDaysAgo: 4, lastHoursAgo: 26, path: ["inbound", "in_conversation", "business_model_sent", "qualified", "link_sent"],
    lead: { situation: "Nutrition coach, 12 clients", goal: "Group programme", email: "sofia@example.com" },
    lines: [
      ["in", "love this. im trying to move from 1-1 to a group programme"],
      ["out", "hey Sofia, good move. how many 1-1 clients right now?", 0.3],
      ["in", "12 and im maxed out", 2],
      ["out", "then group is the right call. what price are you thinking?", 0.2],
      ["in", "around 400 a month per person?", 5],
      ["out", "that works. here is the short version of how we would launch it: waitlist from your stories, DM process to qualify, one call to enrol. sound like what you need?", 0.4],
      ["in", "yes exactly that", 1],
      ["out", `perfect. grab a time here and we will map your launch: ${LINK}`, 0.2],
    ],
  },
  {
    name: "Chris Okafor", handle: "chrisokafor.co", platform: "messenger", origin: "Ad click", stage: "booked",
    labels: ["Ad click", "Hot"], startedDaysAgo: 6, lastHoursAgo: 30, path: ["inbound", "in_conversation", "qualified", "link_sent", "booked"],
    lead: { situation: "Sales trainer, corporate background", goal: "First 5 clients", email: "chris@example.com" },
    lines: [
      ["in", "Hi, I clicked the ad. I'm leaving corporate in January and want clients lined up first."],
      ["out", "hey Chris, smart to start before you leave. what would you be offering?", 0.4],
      ["in", "Sales training for SaaS teams. 10 years doing it in house.", 3],
      ["out", "strong background. have you sold it to anyone outside your employer yet?", 0.3],
      ["in", "One pilot, paid 4k.", 8],
      ["out", `thats proof. lets map the first 5 on a call: ${LINK}`, 0.5],
      ["in", "Booked for Thursday 2pm.", 2],
      ["out", "see you then. ill send a short video to watch first", 0.1],
    ],
  },
  {
    name: "Hannah Lee", handle: "hannahlee.yoga", origin: "Comment keyword", stage: "showed",
    labels: ["Comment keyword", "Warm"], startedDaysAgo: 9, lastHoursAgo: 50, path: ["inbound", "in_conversation", "business_model_sent", "qualified", "link_sent", "booked", "showed"],
    lead: { situation: "Yoga teacher, retreats", goal: "Fill 2 retreats a year" },
    lines: [
      ["in", "GUIDE"],
      ["out", "hey Hannah, on its way. are you filling retreats or classes?", 0.1],
      ["in", "retreats. 2 a year, last one was half empty", 4],
      ["out", "half empty hurts. how are people finding out about them?", 0.3],
      ["in", "just my instagram and email list of 300", 3],
      ["out", "ok. we would build a waitlist and a DM process so the retreat is sold before you announce dates. worth a call?", 0.4],
      ["in", "yes please", 1],
      ["out", `here you go: ${LINK}`, 0.1],
      ["in", "booked!", 3],
      ["out", "great call today Hannah. sending the plan over tonight", 96],
    ],
  },
  {
    name: "Tom Brennan", handle: "tombrennan_pt", origin: "Inbound DM", stage: "no_show",
    labels: ["Inbound DM", "Unresponsive"], startedDaysAgo: 8, lastHoursAgo: 70, path: ["inbound", "in_conversation", "qualified", "link_sent", "booked", "no_show"],
    lead: { situation: "PT, in person only", goal: "Go online" },
    lines: [
      ["in", "mate how do i take my pt business online"],
      ["out", "hey Tom, depends where you are now. how many clients in person?", 0.5],
      ["in", "22. cant fit any more hours in", 2],
      ["out", "then online is the only way up. want to map it on a call?", 0.3],
      ["in", "yeah go on", 1],
      ["out", `grab a slot: ${LINK}`, 0.1],
      ["in", "done, tuesday", 5],
      ["out", "hey Tom, missed you on the call today. everything ok? happy to rebook", 72],
    ],
  },
  {
    name: "Aisha Rahman", handle: "aisha.builds", origin: "Referral", stage: "won",
    labels: ["Referral", "Hot"], startedDaysAgo: 16, lastHoursAgo: 120, path: ["inbound", "in_conversation", "business_model_sent", "qualified", "link_sent", "booked", "showed", "won"],
    lead: { situation: "Web agency owner, 4 staff", goal: "Productised offer", email: "aisha@example.com" },
    lines: [
      ["in", "Priya said I should message you. I run a small web agency."],
      ["out", "hey Aisha, glad she did. whats going on in the agency?", 0.3],
      ["in", "every project is custom and margins are terrible", 2],
      ["out", "classic. have you tried a fixed scope offer?", 0.2],
      ["in", "no idea how to price it or sell it", 4],
      ["out", "thats what we do. one offer, one price, inbound DMs to booked calls. want the breakdown?", 0.3],
      ["in", "yes", 0.5],
      ["out", `easier on a call. here: ${LINK}`, 0.2],
      ["in", "booked for Monday", 3],
      ["out", "welcome aboard Aisha. onboarding doc is in your inbox", 140],
    ],
  },
  {
    name: "Leo Fischer", handle: "leo.fischer", origin: "Inbound DM", stage: "disqualified", lossReason: "No business yet",
    labels: ["Inbound DM", "Cold"], startedDaysAgo: 5, lastHoursAgo: 100, path: ["inbound", "in_conversation", "disqualified"],
    lead: { situation: "Student, no offer yet" },
    lines: [
      ["in", "can you help me start a business"],
      ["out", "hey Leo, what are you thinking of starting?", 1],
      ["in", "not sure yet, im still at uni. just want to make money online", 3],
      ["out", "respect for starting early. we work with people who already have clients, so this is not the right fit yet. the free guide in my bio is the best place to start", 0.5],
    ],
  },
  {
    name: "Grace Kim", handle: "gracekim.studio", origin: "Story reply", stage: "nurture", lossReason: "On maternity leave until spring",
    labels: ["Story reply", "Warm", "Timing"], startedDaysAgo: 12, lastHoursAgo: 200, path: ["inbound", "in_conversation", "business_model_sent", "nurture"],
    lead: { situation: "Photographer", objections: ["Timing"] },
    lines: [
      ["in", "this is what I need but the timing is awful"],
      ["out", "hey Grace, whats going on with timing?", 0.4],
      ["in", "baby due in 6 weeks. back in spring", 2],
      ["out", "congratulations! lets pick this up in spring then. ill check in", 0.2],
    ],
  },
  {
    name: "Marcus Bell", handle: "marcusbell.coach", origin: "Inbound DM", stage: "lost", lossReason: "Went with another programme",
    labels: ["Inbound DM", "Has a solution"], startedDaysAgo: 20, lastHoursAgo: 300, path: ["inbound", "in_conversation", "qualified", "link_sent", "booked", "showed", "lost"],
    lead: { situation: "Executive coach", objections: ["Has a solution", "Price"] },
    lines: [
      ["in", "whats the difference between you and the other programmes out there"],
      ["out", "hey Marcus, fair question. what have you looked at so far?", 0.5],
      ["in", "two others, both around 5k", 3],
      ["out", `happy to walk you through how ours works on a call: ${LINK}`, 0.3],
      ["in", "booked", 2],
      ["in", "thanks for the call. going with the other one, they had a guarantee", 120],
    ],
  },
  {
    name: "Elena Popov", handle: "elena.popov", origin: "Ad click", stage: "in_conversation",
    labels: ["Ad click", "Warm", "Trust"], startedDaysAgo: 1, lastHoursAgo: 21, path: ["inbound", "in_conversation"],
    lead: { situation: "Language tutor", objections: ["Trust"] },
    lines: [
      ["in", "is this legit? ive been burned by a course before"],
      ["out", "hey Elena, sorry to hear that. what happened with the last one?", 0.3],
      ["in", "paid 2k, got videos and no support. do you have results from tutors?", 2],
    ],
  },
  {
    name: "Ben Carter", handle: "bencarter", platform: "messenger", origin: "Inbound DM", stage: "outbound",
    labels: ["Unresponsive"], startedDaysAgo: 3, lastHoursAgo: 60, path: ["outbound"],
    lines: [["out", "hey Ben, thanks for coming to the workshop. what was your biggest takeaway?"]],
  },
];

export function buildSeed(): Db {
  const now = Date.now();
  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  const events: FunnelEvent[] = [];

  SCRIPTS.forEach((s, i) => {
    const id = "c_demo_" + (i + 1);
    const owner = DEMO_MEMBERS[i % DEMO_MEMBERS.length].id;
    const end = now - s.lastHoursAgo * H;
    const start = Math.min(now - s.startedDaysAgo * D - 2 * H, end - s.lines.length * 0.2 * H);
    // lay messages out between start and end, keeping relative gaps
    const gaps = s.lines.map((l, k) => (k === 0 ? 0 : l[2] ?? 1));
    const totalGap = gaps.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    let lastInbound: string | null = null;
    s.lines.forEach((l, k) => {
      acc += gaps[k];
      const at = new Date(start + ((end - start) * acc) / totalGap).toISOString();
      if (l[0] === "in") lastInbound = at;
      const sender = l[0] === "in" ? "lead" : k % 3 === 1 ? "ai" : "owner";
      messages.push({
        id: `${id}_m${k}`, conversationId: id, direction: l[0], sender,
        text: l[1], sentAt: at, source: "seed", ...(sender === "owner" ? { memberId: owner } : {}),
      });
      if (l[0] === "out" && l[1].includes(LINK)) {
        events.push({ id: `${id}_l${k}`, conversationId: id, type: "link_sent", detail: "Strategy call", by: "ai", at });
      }
    });
    events.push({ id: `${id}_start`, conversationId: id, type: "conversation_started", by: "system", at: new Date(start).toISOString() });
    s.path.forEach((st, k) => {
      const at = new Date(start + ((end - start) * k) / Math.max(1, s.path.length - 1 || 1)).toISOString();
      events.push({ id: `${id}_s${k}`, conversationId: id, type: "stage_changed", stage: st, by: k % 2 ? "ai" : "system", at });
    });
    conversations.push({
      id, platform: s.platform ?? "instagram", externalId: "demo_" + s.handle, name: s.name, handle: s.handle,
      origin: s.origin, stage: s.stage, labels: s.labels, status: ["won", "lost", "disqualified"].includes(s.stage) ? "done" : "open",
      aiMode: "suggest", unread: s.lines[s.lines.length - 1][0] === "in", lastInboundAt: lastInbound,
      lastMessageAt: new Date(end).toISOString(), lead: s.lead ?? {}, notes: "", lossReason: s.lossReason,
      suggestion: null, createdAt: new Date(start).toISOString(), assignedTo: owner,
    });
  });

  // Generated leads spread over eight weeks, so conversion rates, team comparison and forecasts have real volume behind them.
  const rand = rng(20261009);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const owners = ["demo_sam", "demo_jess", "demo_ravi", "ai"];
  for (let i = 0; i < 80; i++) {
    const id = "c_demo_g" + (i + 1);
    const who = owners[i % owners.length];
    const st = STYLE[who];
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 5 + 3) % LAST.length]}`;
    const handle = name.toLowerCase().replace(" ", ".") + (i % 3 ? "" : ".co");
    const origin = pick(ORIGINS);
    const daysAgo = 1 + Math.floor(rand() * 50);
    let t = now - daysAgo * D - rand() * 10 * H;
    const start = t;
    const useVideo = rand() < 0.3;
    const lines: [("in" | "out"), string][] = [];
    const path: StageId[] = ["inbound"];
    const reached = { engage: rand() < st.engage, qualify: false, link: false, book: false, show: false, win: false };
    reached.qualify = reached.engage && rand() < st.qualify;
    reached.link = reached.qualify && rand() < st.link;
    reached.book = reached.link && rand() < (useVideo ? st.book * 0.6 : st.book);
    reached.show = reached.book && daysAgo > 3 && rand() < st.show;
    reached.win = reached.show && daysAgo > 6 && rand() < st.win;
    lines.push(["in", pick(OPENERS)]);
    const waiting = !reached.engage && rand() < st.backlog && daysAgo < 6;
    if (!waiting) lines.push(["out", `hey ${name.split(" ")[0]}, glad you reached out. what are you working on right now?`]);
    if (reached.engage) {
      path.push("in_conversation");
      lines.push(["in", pick(ANSWERS)], ["out", "got it. where do you want that to be in 6 months?"]);
    }
    if (reached.qualify) {
      path.push("business_model_sent", "qualified");
      lines.push(["in", "double it, without living on my phone"], ["out", "that is what we build: one inbound channel, a DM process that books calls, one offer. sound like what you need?"], ["in", "yes"]);
    }
    if (reached.link) {
      path.push("link_sent");
      lines.push(["out", useVideo ? `have a watch of this first, it shows how it works: ${VIDEO}` : `grab a time here and we will map it out: ${LINK}`]);
    }
    if (reached.book) { path.push("booked"); lines.push(["in", "booked"]); }
    if (reached.show) path.push("showed");
    else if (reached.book && daysAgo > 3) path.push("no_show");
    if (reached.win) path.push("won");
    const closed = !reached.win && reached.show && daysAgo > 10 ? "lost" : reached.engage && !reached.qualify && rand() < 0.4 ? (rand() < 0.5 ? "disqualified" : "nurture") : null;
    if (closed) path.push(closed);
    const stage = path[path.length - 1];
    const objection = reached.engage && rand() < 0.35 ? pick(OBJ) : null;

    let lastInbound: string | null = null;
    lines.forEach((l, k) => {
      if (k > 0) t += l[0] === "out" ? st.reply * 60_000 * (0.5 + rand()) : (1 + rand() * 9) * H;
      t = Math.min(t, now - (lines.length - k) * 60_000);
      const at = new Date(t).toISOString();
      if (l[0] === "in") lastInbound = at;
      const sender = l[0] === "in" ? "lead" : who === "ai" ? "ai" : "owner";
      messages.push({ id: `${id}_m${k}`, conversationId: id, direction: l[0], sender, text: l[1], sentAt: at, source: "seed", ...(sender === "owner" ? { memberId: who } : {}) });
      if (l[0] === "out" && (l[1].includes(LINK) || l[1].includes(VIDEO))) {
        events.push({ id: `${id}_l${k}`, conversationId: id, type: "link_sent", detail: l[1].includes(VIDEO) ? "How it works video" : "Strategy call", by: who === "ai" ? "ai" : "human", ...(who === "ai" ? {} : { memberId: who }), at });
      }
    });
    const end = t;
    events.push({ id: `${id}_start`, conversationId: id, type: "conversation_started", by: "system", at: new Date(start).toISOString() });
    path.forEach((p, k) => {
      const base = start + ((end - start) * k) / Math.max(1, path.length - 1);
      // Calls happen days after the booking, not in the same minute.
      const late = ["showed", "no_show", "won", "lost"].includes(p) ? Math.min(now - H, end + (p === "won" || p === "lost" ? 4 : 2) * D) : base;
      events.push({ id: `${id}_s${k}`, conversationId: id, type: "stage_changed", stage: p, by: who === "ai" ? "ai" : "system", at: new Date(late).toISOString() });
    });
    conversations.push({
      id, platform: i % 7 === 0 ? "messenger" : "instagram", externalId: "demo_" + handle + i, name, handle, origin, stage,
      labels: [origin, pick(["Hot", "Warm", "Warm", "Cold"]), ...(objection ? [objection] : [])],
      status: ["won", "lost", "disqualified"].includes(stage) || daysAgo > 21 ? "done" : "open", aiMode: who === "ai" ? "autopilot" : "suggest",
      unread: waiting, lastInboundAt: lastInbound, lastMessageAt: new Date(end).toISOString(),
      lead: { ...(reached.engage ? { situation: lines[2][1] } : {}), ...(reached.qualify ? { goal: "Double revenue without more hours" } : {}), ...(objection ? { objections: [objection] } : {}), ...(reached.book ? { email: handle.replace(/\./g, "") + "@example.com" } : {}) },
      notes: "", ...(closed ? { lossReason: closed === "lost" ? "Chose another option" : closed === "nurture" ? "Not ready yet" : "Not a fit" } : {}),
      suggestion: null, createdAt: new Date(start).toISOString(), assignedTo: who === "ai" ? null : who,
    });
  }

  const workspace = emptyWorkspace();
  workspace.members = DEMO_MEMBERS.map((m) => ({ ...m }));
  return { workspace, conversations, messages, events, labelQueue: [] };
}
