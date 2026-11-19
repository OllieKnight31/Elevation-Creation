// Checks the Meta only inbox sweep (web/lib/sweep.ts) on stand in data. Run: node test/sweep-check.mjs
// No Claude, no database, no network: the AI turn, the store and the background runner are stand ins that this
// file controls. sweep.ts, engine.ts and pipeline.ts are the real files, so the real sendVia, canAutopilot and
// windowState decide. Every other file they import is replaced by an empty stand in.
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, "..", "web");

// Loads the three real TypeScript files with the project's own compiler and swaps their other imports for stand ins.
const hooks = `
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
let ts, REAL;
export function initialize(d) { ts = createRequire(path.join(d.web, "package.json"))("typescript"); REAL = new Set(d.real); }
export async function resolve(spec, ctx, next) {
  if (spec.startsWith("stub:")) return { url: spec, shortCircuit: true };
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (url.startsWith("stub:")) {
    const u = new URL(url);
    const mod = u.pathname, names = (u.searchParams.get("n") || "").split(",").filter(Boolean);
    const fn = (n) => "(...a) => { const f = (globalThis.__sweepStubs?.[" + JSON.stringify(mod) + "] ?? {})[" + JSON.stringify(n) + "]; return f ? f(...a) : undefined; }";
    return { format: "module", shortCircuit: true, source: names.map((n) => n === "default" ? "export default " + fn(n) + ";" : "export const " + n + " = " + fn(n) + ";").join("\\n") };
  }
  if (!url.endsWith(".ts")) return next(url, ctx);
  const file = fileURLToPath(url);
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, fileName: file }).outputText;
  const out = js.replace(/import\\s+([\\w$]+\\s*,\\s*)?(?:([\\w$]+)|\\{([^}]*)\\})\\s+from\\s+["']((?:\\.{1,2}|@)\\/[^"']+)["'];?/g, (all, dflt, single, named, spec) => {
    const base = path.basename(spec).replace(/\\.(ts|json)$/, "");
    if (REAL.has(base)) return all.replace(spec, spec.endsWith(".ts") ? spec : spec + ".ts");
    const names = [...(dflt || single ? ["default"] : []), ...(named || "").split(",").map((x) => x.trim().split(/\\s+as\\s+/)[0]).filter(Boolean)];
    return all.replace(spec, "stub:" + base + "?n=" + names.join(","));
  });
  return { format: "module", shortCircuit: true, source: out };
}
`;
register("data:text/javascript," + encodeURIComponent(hooks), { data: { web, real: ["sweep", "engine", "pipeline"] } });

// ---------- stand ins ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const world = { db: null, jobs: [], events: [], ai: [], running: 0, peak: 0, onFlush: null, runJobs: true, aiMs: 15 };
/** What the stand in AI does with a chat, chosen by the chat's notes field. */
async function fakeAiTurn(db, conv, live, opts = {}) {
  world.events.push("ai");
  world.ai.push({ id: conv.id, opts, claim: conv.sweepClaim ? { ...conv.sweepClaim } : null, followUp: conv.followUp ? { ...conv.followUp } : null, tried: conv.sweepTriedAt });
  world.peak = Math.max(world.peak, ++world.running);
  await sleep(world.aiMs);
  world.running--;
  const act = conv.notes || "send";
  const say = (text) => db.messages.push({ id: "m" + db.messages.length, conversationId: conv.id, direction: "out", sender: "ai", text, sentAt: new Date().toISOString(), source: "app" });
  const draft = (over) => ({ bubbles: [], reason: "", stage: conv.stage, labels: [], needsHuman: false, engine: "claude", createdAt: new Date().toISOString(), ...over });
  if (act === "send") { say("hey, good to hear from you. what are you working on right now?"); conv.suggestion = null; return true; }
  if (act === "decline") { conv.suggestion = draft({ reason: "They said they are sorted." }); return false; }
  if (act === "human") { conv.suggestion = draft({ needsHuman: true, reason: "Asked about a refund." }); return false; }
  if (act === "fail") { conv.suggestion = null; return false; }
  if (act === "partial") { say("first half"); conv.suggestion = null; return false; }
  if (act === "demo") { conv.suggestion = draft({ engine: "demo", bubbles: ["hi"], reason: "The AI key was refused. Showing a basic draft instead." }); return false; }
  if (act === "throw") throw new Error("boom");
  return false;
}
globalThis.__sweepStubs = {
  live: { aiTurn: fakeAiTurn },
  store: {
    freshDb: async () => world.db,
    saveDb: () => { world.events.push("save"); },
    flushNow: async () => { world.events.push("flush"); if (world.onFlush) { const f = world.onFlush; world.onFlush = null; f(); } },
  },
  hosted: { background: (job) => { if (!world.runJobs) return Promise.resolve(); const p = Promise.resolve().then(job); world.jobs.push(p); return p; } },
};
const settle = async () => { while (world.jobs.length) await world.jobs.shift(); };

const sweep = await import(pathToFileURL(path.join(web, "lib", "sweep.ts")).href);
const { sweepTick, sweepDue, sweepStatus, sweepReach, reachOf, cleanSweep, sweepSettings, SWEEP_LIMITS, SWEEP_DEFAULTS, SWEEP_LOG_MAX } = sweep;

let pass = 0, fail = 0;
const ok = (name, cond, got) => { cond ? pass++ : (fail++, console.log("FAIL", name, got === undefined ? "" : JSON.stringify(got))); };

// ---------- stand in data ----------
const T = Date.now();
const H = 3600_000;
const ago = (hours) => new Date(T - hours * H).toISOString();
let n = 0;
function makeDb(sweepOver = {}) {
  const db = {
    workspace: {
      settings: { autopilotMaster: true, defaultAiMode: "autopilot", disclosure: "", replyDelaySeconds: 5, inboxSweep: { answerWaiting: true, followUp: true, followUpHours: 24, followUpMax: 1, gapMinutes: 1, batchSize: 6, maxAgeDays: 90, ...sweepOver } },
      meta: { instagram: { userId: "1", username: "owner", accessToken: "stand-in", connectedAt: ago(1000) }, capiEnabled: false, mirrorMessengerLabels: false },
      outreach: { settings: { timezone: "UTC", hourStart: 0, hourEnd: 24, paused: false, pauseReason: "" }, prospects: [] },
    },
    conversations: [], messages: [], events: [], labelQueue: [],
  };
  world.db = db;
  Object.assign(world, { jobs: [], events: [], ai: [], running: 0, peak: 0, onFlush: null, runJobs: true, aiMs: 15 });
  return db;
}
/** A chat. msgs is a list of [direction, hours ago]. The lead's last message time is worked out from it. */
function chat(db, name, msgs, over = {}) {
  const id = "c" + ++n;
  const ins = msgs.filter((m) => m[0] === "in").map((m) => m[1]);
  const conv = {
    id, platform: "instagram", externalId: "ig_" + id, scopedUserId: "sid_" + id, name, handle: name.toLowerCase().replace(/\W+/g, "_"), origin: "Inbound DM",
    stage: "in_conversation", labels: [], status: "open", aiMode: "autopilot", unread: false, lastInboundAt: ins.length ? ago(Math.min(...ins)) : null,
    lastMessageAt: ago(Math.min(...msgs.map((m) => m[1]))), lead: {}, notes: "", suggestion: null, createdAt: ago(500), ...over,
  };
  db.conversations.push(conv);
  for (const [direction, h, extra] of msgs) db.messages.push({ id: "m" + db.messages.length, conversationId: id, direction, sender: direction === "in" ? "lead" : "ai", text: direction === "in" ? "hi there" : "hello", sentAt: ago(h), source: "webhook", ...(extra ?? {}) });
  return conv;
}
const dueNames = (db, now = T) => sweepDue(db, now).map((d) => `${d.conv.name}:${d.kind}`).sort();
const reason = (db, key) => sweepReach(db, T).reasons.find((r) => r.key === key).count;

// ---------- 1. gates and the reach breakdown ----------
{
  const db = makeDb();
  chat(db, "Waiting", [["in", 2]]);
  chat(db, "JustIn", [["in", 0.05]]); // five minutes old: left to the normal reply
  chat(db, "Friend", [["in", 2]], { labels: ["Close friend"] });
  chat(db, "Dnc", [["in", 2]], { labels: ["Do not contact"] });
  chat(db, "Human", [["in", 2]], { labels: ["Needs human"] });
  chat(db, "AiOff", [["in", 2]], { aiMode: "off" });
  chat(db, "Booked", [["in", 2]], { stage: "booked" });
  chat(db, "LinkSent", [["in", 2]], { stage: "link_sent" });
  chat(db, "NoId", [["in", 2]], { scopedUserId: undefined });
  chat(db, "NeverWrote", [["out", 2]]);
  chat(db, "Closed30h", [["in", 30]]);
  chat(db, "Closed3d", [["in", 72]]);
  chat(db, "Closed10d", [["in", 240]]);
  chat(db, "Messenger", [["in", 2]], { platform: "messenger" });
  chat(db, "Demo", [["in", 2]], { externalId: "demo_x" });
  // The helper linked and Instagram typing switched on must change nothing: the sweep is Meta only.
  db.workspace.helper = { seenAt: ago(0), version: "9", account: "owner", outreachOn: true };
  db.workspace.settings.instagramTyping = true;
  ok("only reachable waiting chats are due", dueNames(db).join() === "LinkSent:answer,Waiting:answer", dueNames(db));
  const r = sweepReach(db, T);
  ok("demo chats are left out of the totals", r.total === 14, r.total);
  ok("reachable count", r.reachable === 3 && r.unreachable === 11, [r.reachable, r.unreachable]);
  for (const [key, want] of [["closeFriend", 1], ["doNotContact", 1], ["aiOff", 1], ["needsHuman", 1], ["lateStage", 1], ["notConnected", 1], ["noMetaId", 1], ["noInbound", 1], ["windowClosed", 3], ["other", 0]]) ok("reach " + key, reason(db, key) === want, reason(db, key));
  ok("reasons add up to the unreachable total", r.reasons.reduce((a, x) => a + x.count, 0) === r.unreachable);
  ok("every reason has plain words", r.reasons.every((x) => x.label && x.help));
  ok("window buckets", r.windowClosed.buckets.map((b) => b.count).join() === "1,1,1", r.windowClosed.buckets);
  ok("nearest closed chat first, with hours", r.windowClosed.nearest[0].name === "Closed30h" && Math.abs(r.windowClosed.nearest[0].hours - 30) < 0.2, r.windowClosed.nearest[0]);
  ok("human agent would unlock the two inside 7 days", r.humanAgent.wouldUnlock === 2 && r.humanAgent.approved === false && r.humanAgent.days === 7, r.humanAgent);
  // Approved for Human Agent: a person can send for 7 days, the sweep still stops at 24 hours.
  process.env.META_HUMAN_AGENT = "approved";
  ok("human agent approval never widens the sweep", dueNames(db).join() === "LinkSent:answer,Waiting:answer" && sweepReach(db, T).humanAgent.approved === true && reason(db, "windowClosed") === 3, dueNames(db));
  delete process.env.META_HUMAN_AGENT;
  sweepTick(db, T);
  await settle();
  ok("only the two due chats reached the AI", world.ai.length === 2, world.ai.length);
  ok("a chat with no Meta id is never written for", !world.ai.some((a) => a.id === db.conversations.find((c) => c.name === "NoId").id));
  // Old chats are left alone when the owner limits how far back to look.
  const db2 = makeDb({ maxAgeDays: 0 });
  chat(db2, "Recent", [["in", 3]]);
  ok("max age 0 means every chat", dueNames(db2).length === 1);
}

// ---------- 2. when the clock does nothing ----------
{
  const fresh = (over, tweak) => { const db = makeDb(over); chat(db, "A", [["in", 1]]); tweak?.(db); return db; };
  ok("Autopilot off", sweepTick(fresh({}, (d) => { d.workspace.settings.autopilotMaster = false; }), T) === false);
  ok("both switches off", sweepTick(fresh({ answerWaiting: false, followUp: false }), T) === false);
  ok("answer switch off leaves waiting chats", sweepTick(fresh({ answerWaiting: false }), T) === false);
  const hour = new Date(T).getUTCHours();
  ok("outside sending hours", sweepTick(fresh({}, (d) => { d.workspace.outreach.settings.hourStart = (hour + 2) % 24; d.workspace.outreach.settings.hourEnd = (hour + 2) % 24 + 1; }), T) === false);
  ok("another batch is running", sweepTick(fresh({ busyUntil: new Date(T + 60_000).toISOString(), busyBy: "other" }), T) === false);
  ok("inside the gap", sweepTick(fresh({ gapMinutes: 5, lastAt: ago(0.05) }), T) === false);
  ok("gap passed", sweepTick(fresh({ gapMinutes: 5, lastAt: ago(0.1) }), T) === true);
  await settle();
  ok("nothing was written while it was held", world.ai.length === 1, world.ai.length);
  const idle = fresh({ answerWaiting: true }, (d) => { d.conversations.length = 0; });
  ok("nothing due", sweepTick(idle, T) === false && world.events.filter((e) => e === "ai").length === 0);
  ok("the clock leaves a mark even when idle", Boolean(sweepSettings(idle).checkedAt));
  world.events.length = 0;
  sweepTick(idle, T + 60_000);
  ok("the idle mark is not saved every minute", !world.events.includes("save"), world.events);
  ok("a paused Chrome helper does not stop Meta sends", sweepTick(fresh({}, (d) => { d.workspace.outreach.settings.paused = true; }), T) === true);
  await settle();
}

// ---------- 3. a batch ----------
{
  const db = makeDb({ batchSize: 6 });
  for (let i = 0; i < 9; i++) chat(db, "Lead" + i, [["out", 5 + i], ["in", 1 + i]]);
  ok("nine due", sweepDue(db, T).length === 9);
  ok("tick starts a batch", sweepTick(db, T) === true);
  const s0 = sweepSettings(db);
  const claimed = db.conversations.filter((c) => c.sweepClaim);
  ok("six chats claimed before anything is written", claimed.length === 6 && world.ai.length === 0 && claimed.every((c) => c.sweepClaim.by === s0.busyBy && c.sweepTriedAt), claimed.length);
  ok("the turn is held under a run id", Boolean(s0.busyBy) && new Date(s0.busyUntil).getTime() > T);
  ok("a second tick while it runs does nothing", sweepTick(db, T + 1000) === false);
  await settle();
  ok("six written", world.ai.length === 6, world.ai.length);
  ok("claims saved and flushed before the first AI call", world.events.indexOf("save") < world.events.indexOf("flush") && world.events.indexOf("flush") < world.events.indexOf("ai"), world.events.slice(0, 6));
  ok("every AI call saw its claim", world.ai.every((a) => a.claim && a.claim.by === s0.busyBy));
  ok("a few in parallel, never more than four", world.peak > 1 && world.peak <= 4, world.peak);
  ok("newest first", world.ai[0].id === db.conversations[0].id);
  const s1 = sweepSettings(db);
  ok("the turn is given back", !s1.busyUntil && !s1.busyBy && s1.lastAt === new Date(T).toISOString(), s1);
  ok("no claim or tried mark left on a sent chat", db.conversations.every((c) => !c.sweepClaim && !c.sweepTriedAt));
  const st = sweepStatus(db, Date.now());
  ok("status: sent in the last hour and today", st.sent.lastHour === 6 && st.sent.today === 6 && st.today.skipped === 0 && st.today.failed === 0, st.sent);
  ok("status: three still due", st.due.answer === 3 && st.due.total === 3 && st.waiting === 3 && st.followUps === 0, st.due);
  ok("status: says it is pausing", st.state === "pausing" && st.on === true && st.note.length > 0, st.state);
  ok("log has six sent lines with who, what and when", st.log.length === 6 && st.log.every((e) => e.outcome === "sent" && e.kind === "answer" && e.conversationId && e.name && e.handle && e.at && e.text && e.reason === ""), st.log[0]);
  ok("gap holds the next batch", sweepTick(db, T + 20_000) === false);
  ok("next minute takes the rest", sweepTick(db, T + 61_000) === true);
  await settle();
  ok("all nine answered, none twice", world.ai.length === 9 && new Set(world.ai.map((a) => a.id)).size === 9 && sweepDue(db, Date.now()).length === 0);
  ok("log is newest first", sweepStatus(db, Date.now()).log[0].at >= sweepStatus(db, Date.now()).log[8].at);
}

// ---------- 4. follow ups: one per silence, only inside Meta's window ----------
{
  const db = makeDb();
  const closing = chat(db, "Closing", [["in", 21], ["out", 20.5]]);
  chat(db, "EarlyInWindow", [["in", 10], ["out", 9]]);
  chat(db, "JustAnswered", [["in", 21], ["out", 1]]);
  chat(db, "WindowShut", [["in", 25], ["out", 24.5]]);
  chat(db, "StillQueued", [["in", 21], ["out", 20.5, { delivery: "queued" }]]);
  const declined = chat(db, "Declined", [["in", 21.5], ["out", 20]], { notes: "decline" });
  ok("only chats in the last 4 hours of the window are due a follow up", dueNames(db).join() === "Closing:followUp,Declined:followUp", dueNames(db));
  sweepTick(db, T);
  await settle();
  const call = world.ai.find((a) => a.id === closing.id);
  ok("the follow up is counted before the AI writes", call.followUp?.count === 1 && call.followUp.anchor === closing.lastInboundAt && Boolean(call.tried), call);
  ok("the AI is told how long they have been quiet", Math.abs(call.opts.followUpAfterHours - 20.5) < 0.1, call.opts);
  ok("sent and counted once", closing.followUp.count === 1 && closing.followUp.anchor === closing.lastInboundAt);
  ok("a declined follow up is counted and not left as a draft", declined.followUp.count === 1 && declined.suggestion === null && Boolean(declined.sweepTriedAt));
  const log = sweepStatus(db, Date.now()).log;
  ok("log: one sent, one skipped with a reason", log.length === 2 && log.find((e) => e.conversationId === declined.id).outcome === "skipped" && log.find((e) => e.conversationId === declined.id).reason.includes("follow up") && log.find((e) => e.conversationId === closing.id).outcome === "sent", log);
  // Three hours on, still inside the window, their silence unbroken: the rule would allow it but for the count.
  const sentMsg = db.messages.filter((m) => m.conversationId === closing.id).at(-1);
  sentMsg.sentAt = ago(3.2);
  closing.lastInboundAt = ago(23.5);
  closing.followUp.anchor = closing.lastInboundAt;
  ok("never a second follow up for the same silence", dueNames(db, T).join() === "", dueNames(db, T));
  ok("a saved setting of 5 follow ups is ignored", (() => { db.workspace.settings.inboxSweep.followUpMax = 5; return dueNames(db, T).join() === "" && sweepSettings(db).followUpMax === 1; })());
  // The lead writes again and goes quiet again: that is a new silence.
  db.messages.push({ id: "x1", conversationId: closing.id, direction: "in", sender: "lead", text: "ok", sentAt: ago(22), source: "webhook" }, { id: "x2", conversationId: closing.id, direction: "out", sender: "ai", text: "nice", sentAt: ago(21.9), source: "app" });
  closing.lastInboundAt = ago(22);
  ok("a new silence can get its one follow up", dueNames(db, T).join() === "Closing:followUp", dueNames(db, T));

  // The window closes between the pick and the writing: nothing is written, and the chat is let go.
  const db2 = makeDb();
  const late = chat(db2, "Late", [["in", 23.9], ["out", 20]]);
  world.onFlush = () => { late.lastInboundAt = ago(24.1); };
  ok("picked while the window was open", sweepTick(db2, T) === true);
  await settle();
  ok("never a follow up outside Meta's window", world.ai.length === 0 && !late.sweepClaim && !late.followUp && (db2.workspace.sweepLog ?? []).length === 0, [world.ai.length, late.followUp]);

  // The server dies after the claim: the job never runs.
  const db3 = makeDb();
  const dead = chat(db3, "Dead", [["in", 21], ["out", 20.5]]);
  world.runJobs = false;
  sweepTick(db3, T);
  ok("a run that dies leaves the follow up counted", dead.followUp?.count === 1 && dueNames(db3, T + 10 * 60_000).join() === "" && dueNames(db3, T + 2 * H).join() === "", dead.followUp);
  ok("and frees the turn after its hold", sweepTick(db3, T + 60_000) === false && new Date(sweepSettings(db3).busyUntil).getTime() <= T + SWEEP_LIMITS.busyMs);
}

// ---------- 5. skipped and failed ----------
{
  const db = makeDb();
  const human = chat(db, "AsksHuman", [["in", 2]], { notes: "human" });
  const failed = chat(db, "Fails", [["in", 2]], { notes: "fail" });
  const partial = chat(db, "Partial", [["in", 2]], { notes: "partial" });
  const demo = chat(db, "NoAi", [["in", 2]], { notes: "demo" });
  const thrown = chat(db, "Throws", [["in", 2]], { notes: "throw" });
  const fuFail = chat(db, "FollowUpFails", [["in", 21], ["out", 20.5]], { notes: "fail" });
  sweepTick(db, T);
  await settle();
  const log = Object.fromEntries(sweepStatus(db, Date.now()).log.map((e) => [e.name, e]));
  ok("needs a person: skipped, with why", log.AsksHuman.outcome === "skipped" && log.AsksHuman.reason.includes("refund"), log.AsksHuman);
  ok("failed lines", ["Fails", "Partial", "NoAi", "Throws", "FollowUpFails"].every((k) => log[k].outcome === "failed" && log[k].reason), log);
  ok("part way is said plainly", log.Partial.reason.includes("part way"), log.Partial);
  ok("the AI's own error is passed on", log.NoAi.reason.includes("key was refused") && !log.NoAi.reason.includes("basic draft"), log.NoAi);
  ok("a failed follow up with nothing sent is not counted", !fuFail.followUp && fuFail.sweepFails === 1);
  ok("a skipped chat waits a day", !sweepDue(db, T + 23 * H).some((d) => d.conv === human));
  ok("a failed chat is held for half an hour", !sweepDue(db, Date.now() + 20 * 60_000).some((d) => d.conv === failed) && failed.sweepFails === 1);
  ok("then tried again", sweepDue(db, Date.now() + 31 * 60_000).some((d) => d.conv === failed));
  ok("a part sent chat is never tried again as an answer", !partial.sweepFails && !sweepDue(db, Date.now() + 31 * 60_000).some((d) => d.conv === partial));
  ok("a thrown error does not stop the batch", world.ai.length === 6 && !sweepSettings(db).busyUntil && thrown.sweepFails === 1);
  failed.sweepFails = 3;
  ok("three failures: wait a day", !sweepDue(db, Date.now() + 31 * 60_000).some((d) => d.conv === failed));
  const st = sweepStatus(db, Date.now());
  ok("today's totals", st.today.sent === 0 && st.today.skipped === 1 && st.today.failed === 5 && st.sent.lastHour === 0, st.today);
  ok("needs human is not due again and shows in the breakdown once tagged", (() => { human.labels.push("Needs human"); return reason(db, "needsHuman") === 1; })());
}

// ---------- 6. two servers ----------
{
  // Another copy takes the turn a moment after this one: this one lets every chat go untouched.
  const db = makeDb();
  const a = chat(db, "A", [["in", 2]]);
  const b = chat(db, "B", [["in", 21], ["out", 20.5]]);
  world.onFlush = () => { db.workspace.settings.inboxSweep = { ...db.workspace.settings.inboxSweep, busyBy: "other", busyUntil: new Date(T + 90_000).toISOString() }; };
  sweepTick(db, T);
  await settle();
  ok("the run that lost the turn writes nothing", world.ai.length === 0 && !a.sweepClaim && !a.sweepTriedAt && !b.sweepClaim && !b.followUp, [world.ai.length, b.followUp]);
  ok("and does not clear the other run's hold", sweepSettings(db).busyBy === "other" && Boolean(sweepSettings(db).busyUntil));
  // A chat claimed by another run is left to it.
  const db2 = makeDb();
  const mine = chat(db2, "Mine", [["in", 2]]);
  const theirs = chat(db2, "Theirs", [["in", 3]]);
  world.onFlush = () => { theirs.sweepClaim = { ...theirs.sweepClaim, by: "other" }; };
  sweepTick(db2, T);
  await settle();
  ok("only its own claims are worked", world.ai.length === 1 && world.ai[0].id === mine.id && theirs.sweepClaim.by === "other");
  ok("a chat another run holds is not due", !sweepDue(db2, T + 61_000).some((d) => d.conv === theirs));
  // The hold changes hands while this run is writing: it must not clear the new holder's mark.
  const db3 = makeDb();
  chat(db3, "C", [["in", 2]]);
  sweepTick(db3, T);
  db3.workspace.settings.inboxSweep = { ...db3.workspace.settings.inboxSweep };
  const run = sweepSettings(db3).busyBy;
  await sleep(5);
  db3.workspace.settings.inboxSweep.busyBy = "later-run";
  await settle();
  ok("only the run that set the hold clears it", run && sweepSettings(db3).busyBy === "later-run" && Boolean(sweepSettings(db3).busyUntil), sweepSettings(db3));
}

// ---------- 7. the time budget ----------
{
  const keep = { ...SWEEP_LIMITS };
  Object.assign(SWEEP_LIMITS, { parallel: 1, budgetMs: 60, turnMs: 0 });
  const db = makeDb({ batchSize: 5 });
  for (let i = 0; i < 5; i++) chat(db, "Slow" + i, [["in", 1 + i]]);
  world.aiMs = 40;
  sweepTick(db, T);
  await settle();
  Object.assign(SWEEP_LIMITS, keep);
  const worked = world.ai.length;
  ok("a batch stops starting chats when its time is up", worked >= 1 && worked < 5, worked);
  ok("chats it did not reach go back untouched, with no log line", db.workspace.sweepLog.length === worked && db.conversations.filter((c) => !c.sweepClaim && !c.sweepTriedAt).length === 5 && sweepDue(db, Date.now()).length === 5 - worked, db.workspace.sweepLog.length);
  ok("batch size 1 writes one", await (async () => { const d = makeDb({ batchSize: 1 }); chat(d, "X", [["in", 1]]); chat(d, "Y", [["in", 2]]); sweepTick(d, T); await settle(); return world.ai.length === 1; })());
}

// ---------- 8. the log and the settings ----------
{
  const db = makeDb({ batchSize: 3 });
  db.workspace.sweepLog = Array.from({ length: SWEEP_LOG_MAX - 1 }, (_, i) => ({ at: ago(100 - i / 10), conversationId: "old" + i, handle: "", name: "Old " + i, kind: "answer", outcome: "sent", reason: "" }));
  for (let i = 0; i < 3; i++) chat(db, "New" + i, [["in", 1 + i]]);
  sweepTick(db, T);
  await settle();
  const log = db.workspace.sweepLog;
  ok("the log keeps the newest 300", SWEEP_LOG_MAX === 300 && log.length === 300 && log[0].conversationId === "old2" && log.slice(-3).every((e) => e.name.startsWith("New")), [log.length, log[0].conversationId]);
  const st = sweepStatus(db, Date.now(), 5);
  ok("status can trim the list", st.log.length === 5 && st.log[0].name.startsWith("New"));
  ok("old lines do not count as the last hour", st.sent.lastHour === 3 && st.sent.today === 3, st.sent);
  ok("only 14 days of totals are kept", (() => { for (let i = 1; i <= 20; i++) db.workspace.sweepStats.days["2020-01-" + String(i).padStart(2, "0")] = { sent: 1, skipped: 0, failed: 0 }; chat(db, "More", [["in", 1]]); sweepTick(db, T + 61_000); return true; })());
  await settle();
  ok("14 days kept", Object.keys(db.workspace.sweepStats.days).length === 14 && sweepStatus(db, Date.now()).sent.today === 4, Object.keys(db.workspace.sweepStats.days).length);
  ok("status carries hours, reach and the clock", st.hours.open === true && st.hours.timezone === "UTC" && typeof st.reach.reachable === "number" && Boolean(st.lastAt) && Boolean(st.checkedAt));

  const prev = { ...SWEEP_DEFAULTS, lastAt: "L", busyUntil: "B", busyBy: "R", checkedAt: "C" };
  const c = cleanSweep({ answerWaiting: true, followUp: true, batchSize: 99, gapMinutes: 0, followUpMax: 5, maxAgeDays: -3, busyBy: "hacked", busyUntil: "x", lastAt: "y", queueDepth: 9, nonsense: 1 }, prev);
  ok("cleanSweep: batch size capped at 12", c.batchSize === 12 && cleanSweep({ batchSize: 0 }, prev).batchSize === 1 && cleanSweep({ batchSize: "abc" }, prev).batchSize === prev.batchSize, c.batchSize);
  ok("cleanSweep: gap may be 0, follow ups always 1", c.gapMinutes === 0 && c.followUpMax === 1 && c.maxAgeDays === 0);
  ok("cleanSweep: the sweep's own marks cannot be set from the browser", c.busyBy === "R" && c.busyUntil === "B" && c.lastAt === "L" && c.checkedAt === "C");
  ok("cleanSweep: nothing unknown is kept", !("queueDepth" in c) && !("nonsense" in c));
  ok("cleanSweep: empty input keeps what was there", JSON.stringify(cleanSweep(null, prev)) === JSON.stringify({ ...prev, followUpMax: 1 }));
  ok("defaults for a new customer are off, six a batch, one follow up", SWEEP_DEFAULTS.answerWaiting === false && SWEEP_DEFAULTS.followUp === false && SWEEP_DEFAULTS.batchSize === 6 && SWEEP_DEFAULTS.followUpMax === 1);
}

// ---------- 9. Meta only, in the source ----------
{
  const fs = await import("node:fs");
  const src = fs.readFileSync(path.join(web, "lib", "sweep.ts"), "utf8");
  // The sweep never queues anything itself. It takes one thing from the outreach file: how much room the Business
  // Suite queue has. Sending still goes through deliver(), which never types inside instagram.com for the inbox.
  ok("the sweep queues nothing itself and only asks how much room Business Suite has", !/queueReply|pendingReplies/.test(src) && /import \{ suiteRoom \} from "\.\/outreach"/.test(src));
  const dash = new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]");
  ok("no long dashes in the source", !dash.test(src) && !dash.test(fs.readFileSync(fileURLToPath(import.meta.url), "utf8")));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
