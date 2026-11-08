// End to end check of every API route and every page of a running copy, focused on data flowing across the app:
// a message that arrives or goes out must show at once in the thread, the inbox list (preview, time, order, unread),
// the leads centre, the stage, insights, the lead brief and the helper's view. Pages are opened in headless Chrome.
//
// Usage:
//   OWNER_PASSWORD=... node test/full-check.mjs [base url]        (default https://ainable-setter.vercel.app)
//   OWNER_EMAIL     owner login (default owner@example.com)
//   OWNER_PASSWORD_FILE  read the password from this file instead
//   SKIP_BROWSER=1  skip the headless Chrome page checks
//   NO_SWEEP=1      do not delete leftovers of earlier check runs (chats named "Check Lead ..." or with handles check_lead_...,
//                   team members check-...@example.com, outreach lists "Check list ...", knowledge "Check question ...")
//
// Safety: only touches conversations it creates ("Check Lead ..." / handles check_lead_...) and demo threads (demo_...).
// Never sends to a real thread (helper or Meta), never queues outreach, never writes Meta / Calendly / Sheets / CRM settings.
// Settings it changes for a moment (targets, keyword triggers, helper heartbeat) are put back exactly. Everything it
// creates is deleted at the end.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = (process.argv[2] || "https://ainable-setter.vercel.app").replace(/\/+$/, "");
const env = process.env;
const OWNER_EMAIL = env.OWNER_EMAIL || "owner@example.com";
const OWNER_PASSWORD = env.OWNER_PASSWORD || (env.OWNER_PASSWORD_FILE ? fs.readFileSync(env.OWNER_PASSWORD_FILE, "utf8").trim() : "");
if (!OWNER_PASSWORD) { console.error("Set OWNER_PASSWORD or OWNER_PASSWORD_FILE"); process.exit(2); }

// ---------- harness ----------
let section = "";
const results = [];
const head = (s) => { section = s; console.log(`\n== ${s}`); };
const ok = (name, cond, extra = "") => {
  results.push({ section, name, ok: !!cond, extra: cond ? "" : String(extra) });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + String(extra).slice(0, 600)}`);
  return !!cond;
};
const notes = [];
const note = (s) => { notes.push(s); console.log(`NOTE  ${s}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString(36);
const short = (x, n = 300) => String(typeof x === "string" ? x : JSON.stringify(x) ?? "").slice(0, n);

const owner = { cookie: "" };
async function call(p, method = "GET", body, opts = {}) {
  const jar = opts.jar === undefined ? owner : opts.jar; // jar null = no cookie
  const headers = { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(opts.auth ? { authorization: opts.auth } : {}), ...(jar?.cookie ? { cookie: jar.cookie } : {}) };
  const t0 = Date.now();
  let r;
  for (let i = 0; i < 6; i++) {
    try {
      r = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), redirect: "manual" });
      break;
    } catch (e) {
      if (i === 5) return { status: 0, _text: String(e), _ms: Date.now() - t0 };
      await sleep(2000 * (i + 1));
    }
  }
  const set = r.headers.get("set-cookie");
  if (jar && set && /setter_session=/.test(set)) jar.cookie = set.split(";")[0];
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { text }; }
  if (Array.isArray(data)) data = { list: data };
  return { ...data, status: r.status, _text: text, _ms: Date.now() - t0, _location: r.headers.get("location") || "" };
}
const ext = (token) => ({ auth: `Bearer ${token}`, jar: null });

/**
 * Checks a condition straight away, then keeps looking for up to 12s. Two results: whether it ever became true,
 * and whether it was true on the first read ("immediately", which is what the person in the app sees).
 */
async function flow(name, read, test, { wait = 12000 } = {}) {
  const t0 = Date.now();
  let v = await read();
  let first = test(v);
  let good = first;
  while (!good && Date.now() - t0 < wait) {
    await sleep(1500);
    v = await read();
    good = test(v);
  }
  ok(name, good, typeof good === "string" ? good : describe(v));
  if (good && !first) ok(`${name} (on the first read, not ${((Date.now() - t0) / 1000).toFixed(1)}s later)`, false, "the first read after the write returned the old data");
  return v;
}
let describe = (v) => short(v, 400);

// state helpers
async function state(jar) {
  const s = await call("/api/state", "GET", undefined, { jar });
  return s;
}
const findIn = (s, id) => (s.conversations || []).find((c) => c.id === id);
const posOf = (s, id) => (s.conversations || []).findIndex((c) => c.id === id);
const sortedDesc = (list) => {
  for (let i = 1; i < list.length; i++) if (list[i - 1].lastMessageAt.localeCompare(list[i].lastMessageAt) < 0) return `out of order at ${i}: ${list[i - 1].lastMessageAt} before ${list[i].lastMessageAt}`;
  return true;
};
const ahead = (s, c) => (s.conversations || []).filter((x) => x.lastMessageAt > c.lastMessageAt).length;
async function insightsToday() {
  for (let i = 0; i < 3; i++) {
    const r = await call("/api/insights?period=daily");
    if (r.totals?.today) return r.totals.today;
    await sleep(1500);
  }
  return {};
}
const deep = async (q = "") => call(`/api/insights?view=deep&days=30${q}`);
const step = (d, key) => d.funnel?.find((f) => f.key === key)?.count ?? NaN;
const msgsOf = async (id) => (await call(`/api/conversations/${id}`)).messages || [];

const created = []; // conversation ids made by this run
let setterId = null;
let restore = []; // functions run at the end
let token = "";
let A = null, B = null, C = null;
let targets0 = null, triggers0 = null;

try {
  // =====================================================================================
  head("sign in and locks");
  const bad = await call("/api/auth/login", "POST", { email: OWNER_EMAIL, password: "wrong-" + stamp }, { jar: null });
  ok("POST /api/auth/login with a wrong password is refused (401)", bad.status === 401, `${bad.status} ${bad._text}`);
  const li = await call("/api/auth/login", "POST", { email: OWNER_EMAIL, password: OWNER_PASSWORD });
  ok("POST /api/auth/login signs the owner in and sets the session cookie", li.status === 200 && owner.cookie && li.member?.role === "owner", short(li));
  if (!owner.cookie) throw new Error("cannot continue without a session");
  const me = await call("/api/me");
  ok("GET /api/me returns the owner and loginRequired", me.status === 200 && me.member?.email === OWNER_EMAIL && me.loginRequired === true, short(me));
  const anonMe = await call("/api/me", "GET", undefined, { jar: null });
  ok("GET /api/me without a session answers with member null (no error)", anonMe.status === 200 && anonMe.member === null, short(anonMe));
  const meBad = await call("/api/me", "POST", { action: "nope" });
  ok("POST /api/me with an unknown action is refused (400)", meBad.status === 400, meBad.status);
  if (me.welcome === false) {
    const ws = await call("/api/me", "POST", { action: "welcome-seen" });
    ok("POST /api/me welcome-seen (already seen, so nothing changes)", ws.status === 200 && ws.ok, short(ws));
  }
  const anonWelcome = await call("/api/me", "POST", { action: "welcome-seen" }, { jar: null });
  ok("POST /api/me without a session is refused (401)", anonWelcome.status === 401, anonWelcome.status);

  // Every signed in route refuses a visitor. Bodies carry unknown actions so nothing could change even if a lock failed.
  const locked = [
    ["GET", "/api/state"], ["GET", "/api/insights"], ["GET", "/api/insights?view=deep"], ["GET", "/api/connect"], ["GET", "/api/calendar"],
    ["GET", "/api/knowledge"], ["GET", "/api/outreach"], ["GET", "/api/crm"], ["GET", "/api/setup"], ["GET", "/api/sheets"],
    ["GET", "/api/conversations/x"], ["PATCH", "/api/conversations/x", {}], ["DELETE", "/api/conversations/x"],
    ["POST", "/api/conversations/x/send", {}], ["POST", "/api/conversations/x/simulate", {}], ["POST", "/api/conversations/x/suggest", {}],
    ["POST", "/api/conversations/x/summary", {}], ["GET", "/api/avatar/x"], ["PUT", "/api/workspace", {}], ["POST", "/api/team", {}],
    ["PUT", "/api/team", {}], ["DELETE", "/api/team?id=x"], ["POST", "/api/knowledge", { action: "nope" }], ["POST", "/api/outreach", { action: "nope" }],
    ["POST", "/api/calendar", { action: "nope" }], ["POST", "/api/connect", { action: "nope" }], ["POST", "/api/crm", { action: "nope" }],
    ["POST", "/api/sheets", { action: "nope" }], ["POST", "/api/setup", { action: "nope" }], ["POST", "/api/import", {}],
    ["POST", "/api/meta/sync", {}], ["POST", "/api/meta/backfill", {}], ["POST", "/api/meta/token", {}], ["GET", "/api/version"],
  ];
  const leaks = [];
  for (const [m, p, b] of locked) {
    const r = await call(p, m, b, { jar: null });
    if (r.status !== 401) leaks.push(`${m} ${p} -> ${r.status}`);
  }
  ok(`all ${locked.length} signed in routes refuse a visitor with 401`, !leaks.length, leaks.join("; "));
  note("Not called even signed out: POST /api/data (resets the database) and POST /api/playbook (rewrites the live playbook).");
  const imp = await call("/api/import", "PUT", { threads: [{ participants: [{ name: "A" }, { name: "B" }] }, { participants: [{ name: "A" }, { name: "C" }] }] }, { jar: null });
  ok("PUT /api/import (owner name guess) refuses a visitor", imp.status === 401, short(imp));

  // =====================================================================================
  head("baseline");
  const s0 = await state();
  ok("GET /api/state loads", s0.status === 200 && Array.isArray(s0.conversations), s0.status);
  ok("GET /api/state lists conversations newest first", sortedDesc(s0.conversations) === true, sortedDesc(s0.conversations));
  ok("GET /api/state reports no storage error", !s0.store?.error, short(s0.store));
  token = s0.workspace?.apiToken || "";
  ok("owner sees the workspace token (for the helper)", token.length > 10, "no token");
  ok("GET /api/state never sends password hashes", !/passwordHash"\s*:\s*"scrypt/.test(s0._text), "hash found");
  ok("GET /api/state never sends the workspace secret", !("secret" in (s0.workspace || {})), "secret key present");
  const ownerId = s0.me?.id;
  targets0 = s0.workspace?.targets?.bookedPerMonth ?? null;
  triggers0 = s0.workspace?.triggers ?? null;
  const conn0 = await call("/api/connect");
  ok("GET /api/connect answers with the helper status", conn0.status === 200 && conn0.helper, short(conn0));
  const helper0 = conn0.helper || {};
  const ins0 = await insightsToday();
  const deep0 = await deep();
  ok("GET /api/insights daily answers with totals", typeof ins0.messagesReceived === "number", short(ins0));
  ok("GET /api/insights?view=deep answers with a funnel", deep0.status === 200 && Array.isArray(deep0.funnel), short(deep0));
  for (const p of ["weekly", "monthly"]) {
    const r = await call(`/api/insights?period=${p}`);
    ok(`GET /api/insights?period=${p} answers with ${p === "weekly" ? 12 : 6} buckets`, r.status === 200 && r.series?.length === (p === "weekly" ? 12 : 6), short(r));
  }
  for (const d of [7, 14, 60, 90]) {
    const rr = await call(`/api/insights?view=deep&days=${d}`);
    ok(`GET /api/insights?view=deep&days=${d} answers for ${d} days`, rr.status === 200 && rr.days === d, short(rr));
  }

  // =====================================================================================
  head("lead A arrives through the helper (ingest)");
  const handle = "check_lead_" + stamp;
  const threadA = { externalId: "check-" + stamp, name: "Check Lead " + stamp, handle };
  const tA = Date.now();
  const firstThree = [
    { direction: "in", text: `hey, saw your post about booked calls ${stamp}`, sentAt: new Date(tA - 120000).toISOString(), order: 0 },
    { direction: "out", text: `hey, what are you working on right now ${stamp}`, sentAt: new Date(tA - 60000).toISOString(), order: 1 },
    { direction: "in", text: `coaching business, about 8k a month, want 20k ${stamp}`, sentAt: new Date(tA - 10000).toISOString(), order: 2 },
  ];
  let r = await call("/api/ext/ingest", "POST", { platform: "instagram", thread: threadA, messages: firstThree }, ext(token));
  A = r.conversationId;
  if (A) created.push(A);
  ok("POST /api/ext/ingest stores a new thread with 3 messages", r.status === 200 && r.added === 3 && r.total === 3, short(r));
  if (!A) throw new Error("ingest failed, cannot continue the data flow checks");

  let d = await flow("thread detail shows the 3 messages in order", () => call(`/api/conversations/${A}`), (x) => x.messages?.length === 3 && x.messages.map((m) => m.text).join("|") === firstThree.map((m) => m.text).join("|"));
  const cA = d.conversation || {};
  ok("detail: stage moved to In conversation (both sides have spoken)", cA.stage === "in_conversation", cA.stage);
  ok("detail: lastMessageAt is the newest message time", cA.lastMessageAt === firstThree[2].sentAt, `${cA.lastMessageAt} vs ${firstThree[2].sentAt}`);
  ok("detail: lastInboundAt is the newest inbound time", cA.lastInboundAt === firstThree[2].sentAt, cA.lastInboundAt);
  ok("detail: preview is the newest message", cA.preview === firstThree[2].text, cA.preview);
  ok("detail: messageCount is 3", cA.messageCount === 3, cA.messageCount);
  ok("detail: the 24 hour window is open", cA.window?.open === true, short(cA.window));
  ok("detail: lead summary exists and counts 3 messages", cA.summary?.messageCount === 3 && /3 messages/.test(cA.summary?.text || ""), short(cA.summary));
  ok("detail: summary is not stale", cA.summaryStale === false, cA.summaryStale);
  ok("detail: sendVia is helper (handle known, helper linked)", cA.sendVia === "helper", cA.sendVia);
  ok("detail: events include conversation_started", (d.events || []).some((e) => e.type === "conversation_started"), short(d.events));

  let s = await flow("inbox list (/api/state) shows lead A with its preview and time", () => state(), (x) => { const c = findIn(x, A); return c && c.preview === firstThree[2].text && c.lastMessageAt === firstThree[2].sentAt && c.messageCount === 3; });
  ok("inbox list stays newest first with lead A in it", sortedDesc(s.conversations) === true, sortedDesc(s.conversations));
  ok("inbox list puts lead A after only threads with newer messages", posOf(s, A) === ahead(s, findIn(s, A) || {}), `pos ${posOf(s, A)} ahead ${ahead(s, findIn(s, A) || {})}`);
  ok("leads centre data: lead A has stage, name and handle", findIn(s, A)?.stage === "in_conversation" && findIn(s, A)?.handle === handle && findIn(s, A)?.name === threadA.name, short(findIn(s, A)));
  const inConv = (x) => x.conversations.filter((c) => c.stage === "in_conversation").length;
  ok("stage counts: In conversation went up by one", inConv(s) === inConv(s0) + 1, `${inConv(s0)} -> ${inConv(s)}`);
  ok("leads total went up by one", s.conversations.length === s0.conversations.length + 1, `${s0.conversations.length} -> ${s.conversations.length}`);

  let ins = await insightsToday();
  ok("insights today: New conversations +1", ins.conversations >= ins0.conversations + 1, `${ins0.conversations} -> ${ins.conversations}`);
  ok("insights today: Messages received +2", ins.messagesReceived >= ins0.messagesReceived + 2, `${ins0.messagesReceived} -> ${ins.messagesReceived}`);
  ok("insights today: Messages sent +1", ins.messagesSent >= ins0.messagesSent + 1, `${ins0.messagesSent} -> ${ins.messagesSent}`);
  let dp = await deep();
  ok("deep insights: leads in the last 30 days +1", dp.leads >= deep0.leads + 1, `${deep0.leads} -> ${dp.leads}`);
  ok("deep insights: funnel started +1 and engaged +1", step(dp, "started") >= step(deep0, "started") + 1 && step(dp, "engaged") >= step(deep0, "engaged") + 1, `${step(deep0, "started")}/${step(deep0, "engaged")} -> ${step(dp, "started")}/${step(dp, "engaged")}`);
  ok("deep insights: leads waiting on a reply +1 (last word is theirs)", dp.speed?.waitingTotal >= (deep0.speed?.waitingTotal ?? 0) + 1, `${deep0.speed?.waitingTotal} -> ${dp.speed?.waitingTotal}`);

  // =====================================================================================
  head("a new message arrives on lead A");
  const tNew = new Date().toISOString();
  const newIn = { direction: "in", text: `can do a call this week ${stamp}`, sentAt: tNew, order: 3 };
  r = await call("/api/ext/ingest", "POST", { platform: "instagram", thread: threadA, messages: [...firstThree, newIn] }, ext(token));
  ok("re-capture of the thread adds only the one new message", r.status === 200 && r.added === 1 && r.total === 4, short(r));
  d = await flow("thread detail shows the new message last", () => call(`/api/conversations/${A}`), (x) => x.messages?.length === 4 && x.messages[3].text === newIn.text);
  ok("detail: brief now counts 4 messages and is not stale", d.conversation?.summary?.messageCount === 4 && d.conversation?.summaryStale === false, short(d.conversation?.summary));
  s = await flow("inbox list: preview and time follow the new message", () => state(), (x) => { const c = findIn(x, A); return c && c.preview === newIn.text && c.lastMessageAt === tNew && c.messageCount === 4; });
  ok("inbox list: lead A sits above every thread with an older last message", posOf(s, A) === ahead(s, findIn(s, A) || {}), `pos ${posOf(s, A)}`);
  ok("history read in by /api/ext/ingest does not mark the thread unread (new messages come through /api/ext/live)", findIn(s, A)?.unread === false, `unread=${findIn(s, A)?.unread}`);
  ins = await insightsToday();
  ok("insights today: Messages received +3 in total", ins.messagesReceived >= ins0.messagesReceived + 3, `${ins0.messagesReceived} -> ${ins.messagesReceived}`);

  r = await call("/api/ext/ingest", "POST", { platform: "instagram", thread: threadA, messages: [...firstThree, newIn].map((m) => ({ ...m, sentAt: null })) }, ext(token));
  ok("re-capture without timestamps adds nothing (no duplicates)", r.status === 200 && r.added === 0 && r.total === 4, short(r));
  r = await call("/api/ext/ingest", "POST", { platform: "instagram", thread: {}, messages: [] }, ext(token));
  ok("POST /api/ext/ingest without thread.externalId is refused (400)", r.status === 400, short(r));
  r = await call("/api/ext/ingest", "POST", "not json", ext(token));
  ok("POST /api/ext/ingest with a body that is not JSON is refused (400)", r.status === 400, short(r));

  const dpW = await deep();
  head("the owner replies in Instagram (helper reads the outgoing message)");
  const tOut = new Date(Date.now() + 1000).toISOString();
  const ownOut = { direction: "out", text: `nice, what does your week look like ${stamp}`, sentAt: tOut, order: 4 };
  r = await call("/api/ext/ingest", "POST", { platform: "instagram", thread: threadA, messages: [...firstThree, newIn, ownOut] }, ext(token));
  ok("outgoing message is stored", r.status === 200 && r.added === 1 && r.total === 5, short(r));
  s = await flow("inbox list: preview reads \"You: ...\" for our own last message", () => state(), (x) => findIn(x, A)?.preview === "You: " + ownOut.text && findIn(x, A)?.lastMessageAt === tOut);
  ins = await insightsToday();
  ok("insights today: Messages sent +2 in total", ins.messagesSent >= ins0.messagesSent + 2, `${ins0.messagesSent} -> ${ins.messagesSent}`);
  dp = await deep();
  ok("deep insights: lead A no longer counted as waiting once answered", dp.speed?.waitingTotal <= (dpW.speed?.waitingTotal ?? 0) - 1, `${dpW.speed?.waitingTotal} -> ${dp.speed?.waitingTotal}`);

  // =====================================================================================
  head("editing lead A (PATCH) flows to the list, the brief and insights");
  const email = `check-${stamp}@example.com`;
  r = await call(`/api/conversations/${A}`, "PATCH", { lead: { goal: "Reach 20k a month", situation: "Coaching business at 8k", email, objections: "Price, Timing" } });
  ok("PATCH lead details saves", r.status === 200 && r.conversation?.lead?.email === email && r.conversation?.lead?.objections?.length === 2, short(r));
  ok("PATCH lead details rebuilds the brief with them", /wants reach 20k a month/i.test(r.conversation?.summary?.text || "") && /Objections raised: price, timing/i.test(r.conversation?.summary?.text || ""), r.conversation?.summary?.text);
  await flow("inbox list shows the new lead details and brief", () => state(), (x) => findIn(x, A)?.lead?.goal === "Reach 20k a month" && /wants reach 20k/i.test(findIn(x, A)?.summary?.text || ""));
  r = await call(`/api/conversations/${A}`, "PATCH", { lead: { email: "" } });
  ok("PATCH an empty lead field removes it", r.status === 200 && !("email" in (r.conversation?.lead || {})), short(r.conversation?.lead));
  await call(`/api/conversations/${A}`, "PATCH", { lead: { email } });

  const note1 = "check note " + stamp;
  r = await call(`/api/conversations/${A}`, "PATCH", { notes: note1, unread: true, status: "follow_up", aiMode: "off" });
  ok("PATCH notes, unread, status and AI mode save", r.status === 200 && r.conversation?.notes === note1 && r.conversation?.unread === true && r.conversation?.status === "follow_up" && r.conversation?.aiMode === "off", short(r.conversation));
  await flow("inbox list reflects notes, unread, status and AI mode", () => state(), (x) => { const c = findIn(x, A); return c?.notes === note1 && c?.unread === true && c?.status === "follow_up" && c?.aiMode === "off"; });
  r = await call(`/api/conversations/${A}`, "PATCH", { unread: false, status: "open" });
  await flow("marking read shows in the inbox list", () => state(), (x) => findIn(x, A)?.unread === false && findIn(x, A)?.status === "open");

  r = await call(`/api/conversations/${A}`, "PATCH", { labels: ["Hot", "Price"] });
  ok("PATCH tags saves", r.status === 200 && r.conversation?.labels?.join() === "Hot,Price", short(r.conversation?.labels));
  d = await call(`/api/conversations/${A}`);
  ok("activity shows the tags added", (d.events || []).filter((e) => e.type === "label_added" && ["Hot", "Price"].includes(e.detail)).length === 2, short(d.events));
  await flow("inbox list shows the tags", () => state(), (x) => findIn(x, A)?.labels?.join() === "Hot,Price");

  r = await call(`/api/conversations/${A}`, "PATCH", { stage: "not_a_stage" });
  ok("PATCH an unknown stage is refused (400)", r.status === 400, short(r));
  r = await call(`/api/conversations/${A}`, "PATCH", { assignedTo: "m_nobody" });
  ok("PATCH assigning to someone who does not exist is refused (400)", r.status === 400, short(r));
  r = await call(`/api/conversations/${A}`, "PATCH", { assignedTo: ownerId });
  ok("PATCH assigning to the owner saves", r.status === 200 && r.conversation?.assignedTo === ownerId, short(r.conversation?.assignedTo));

  const insQ0 = await insightsToday();
  const deepQ0 = await deep();
  r = await call(`/api/conversations/${A}`, "PATCH", { stage: "qualified" });
  ok("PATCH stage to Qualified saves", r.status === 200 && r.conversation?.stage === "qualified", short(r));
  d = await call(`/api/conversations/${A}`);
  ok("activity shows the stage change by a person", (d.events || []).some((e) => e.type === "stage_changed" && e.stage === "qualified" && e.by === "human" && e.memberId === ownerId), short(d.events?.slice(0, 3)));
  ok("brief follows the stage", /Stage is Qualified/.test(d.conversation?.summary?.text || ""), d.conversation?.summary?.text);
  s = await flow("pipeline: lead A is in the Qualified column of the leads centre", () => state(), (x) => findIn(x, A)?.stage === "qualified");
  ins = await insightsToday();
  ok("insights today: Qualified +1", ins.qualified >= insQ0.qualified + 1, `${insQ0.qualified} -> ${ins.qualified}`);
  dp = await deep();
  ok("deep insights: funnel Qualified +1", step(dp, "qualified") >= step(deepQ0, "qualified") + 1, `${step(deepQ0, "qualified")} -> ${step(dp, "qualified")}`);
  const mine = await deep(`&member=${ownerId}`);
  ok("deep insights for the owner include lead A (assigned to them)", mine.status === 200 && mine.scope === s.me?.name && mine.leads >= 1, short({ scope: mine.scope, leads: mine.leads }));

  // label queue for the helper: a stage change asks the helper to mirror the labels in Instagram
  r = await call("/api/ext/label-queue", "GET", undefined, ext(token));
  const job = (r.items || []).find((i) => i.externalId === threadA.externalId);
  ok("helper label queue holds lead A's new labels (stage + tags)", r.status === 200 && job && job.labels.includes("Qualified") && job.labels.includes("Hot"), short(r.items?.slice(-3)));
  if (job) {
    r = await call("/api/ext/label-queue/ack", "POST", { id: job.id, ok: false, error: "check run, not a real thread" }, ext(token));
    ok("POST /api/ext/label-queue/ack records the result", r.status === 200 && r.ok, short(r));
    r = await call("/api/ext/label-queue", "GET", undefined, ext(token));
    ok("acknowledged job leaves the queue", !(r.items || []).some((i) => i.id === job.id), short(r.items));
    s = await state();
    ok("state reports the failed label job", (s.labelQueue?.failed || []).some((f) => f.id === job.id), short(s.labelQueue));
  }
  r = await call("/api/ext/label-queue/ack", "POST", { id: "lq_nope", ok: true }, ext(token));
  ok("ack for an unknown job is refused (404)", r.status === 404, short(r));

  // =====================================================================================
  head("booking hook moves lead A and the numbers follow");
  const insB0 = await insightsToday();
  const deepB0 = await deep();
  r = await call(`/api/hooks/booking?token=${token}`, "POST", { event: "booked", handle: "@" + handle.toUpperCase() });
  ok("POST /api/hooks/booking booked (matched by handle, any case, with @)", r.status === 200 && r.matched && r.conversationId === A && r.stage === "booked", short(r));
  await flow("leads centre: lead A is Booked call", () => state(), (x) => findIn(x, A)?.stage === "booked");
  ins = await insightsToday();
  ok("insights today: Calls booked +1", ins.booked >= insB0.booked + 1, `${insB0.booked} -> ${ins.booked}`);
  dp = await deep();
  ok("deep insights: booked this month +1", dp.forecast?.bookedThisMonth >= (deepB0.forecast?.bookedThisMonth ?? 0) + 1, `${deepB0.forecast?.bookedThisMonth} -> ${dp.forecast?.bookedThisMonth}`);
  ok("deep insights: funnel Booked +1", step(dp, "booked") >= step(deepB0, "booked") + 1, `${step(deepB0, "booked")} -> ${step(dp, "booked")}`);
  d = await call(`/api/conversations/${A}`);
  ok("brief next step follows the booking", /Call is booked/.test(d.conversation?.summary?.nextStep || ""), d.conversation?.summary?.nextStep);
  r = await call(`/api/hooks/booking?token=${token}`, "POST", { event: "invitee_no_show.created", payload: { email: email.toUpperCase() } });
  ok("booking hook: Calendly no-show payload matched by email", r.status === 200 && r.conversationId === A && r.stage === "no_show", short(r));
  r = await call(`/api/hooks/booking?token=${token}`, "POST", { event: "showed", name: threadA.name.toLowerCase() });
  ok("booking hook: showed matched by name", r.status === 200 && r.conversationId === A && r.stage === "showed", short(r));
  r = await call(`/api/hooks/booking?token=${token}`, "POST", { event: "won", handle });
  ok("booking hook: won", r.status === 200 && r.stage === "won", short(r));
  s = await flow("won lead is marked done in the list", () => state(), (x) => findIn(x, A)?.stage === "won" && findIn(x, A)?.status === "done");
  ins = await insightsToday();
  ok("insights today: No shows, Showed and Won each +1", ins.noShow >= insB0.noShow + 1 && ins.showed >= insB0.showed + 1 && ins.won >= insB0.won + 1, short({ before: insB0, after: ins }));
  r = await call(`/api/hooks/booking?token=${token}`, "POST", { event: "canceled", handle });
  ok("booking hook: canceled moves the lead back to Link sent", r.status === 200 && r.stage === "link_sent", short(r));
  s = await state();
  ok("a lead moved back out of Won is open again (not left as done)", findIn(s, A)?.status !== "done", `stage ${findIn(s, A)?.stage}, status ${findIn(s, A)?.status}: setStage sets status done for won/lost/disqualified but nothing reopens it when the stage moves back (web/lib/engine.ts:154), so the lead stays hidden from the inbox's default views`);
  await call(`/api/conversations/${A}`, "PATCH", { status: "open" });
  r = await call(`/api/hooks/booking?token=${token}`, "POST", { event: "rescheduled", handle });
  ok("booking hook: unknown event is refused (400)", r.status === 400, short(r));
  r = await call(`/api/hooks/booking?token=${token}`, "POST", { event: "booked", handle: "check_nobody_" + stamp });
  ok("booking hook: no match answers matched false", r.status === 200 && r.matched === false, short(r));
  r = await call(`/api/hooks/booking?token=wrong`, "POST", { event: "booked", handle });
  ok("booking hook: wrong token is refused (401)", r.status === 401, short(r));
  r = await call(`/api/hooks/booking?token=${token}`, "POST", "not json");
  ok("booking hook: a body that is not JSON gets a 400, not a crash", r.status === 400, `${r.status} ${r._text.slice(0, 120)}  (web/app/api/hooks/booking/route.ts:16 calls req.json() without a catch)`);
  await call(`/api/conversations/${A}`, "PATCH", { stage: "in_conversation" });
  r = await call("/api/ext/label-queue", "GET", undefined, ext(token));
  for (const j of (r.items || []).filter((i) => i.externalId === threadA.externalId)) await call("/api/ext/label-queue/ack", "POST", { id: j.id, ok: false, error: "check run" }, ext(token));

  // =====================================================================================
  head("helper view of lead A");
  r = await call(`/api/ext/conversation?platform=instagram&externalId=${threadA.externalId}`, "GET", undefined, ext(token));
  ok("GET /api/ext/conversation finds lead A by thread id", r.status === 200 && r.found && r.conversationId === A, short(r));
  ok("helper sees the stage name, tags, AI mode and open window", r.stage === "In conversation" && r.labels?.join() === "Hot,Price" && r.aiMode === "off" && r.windowOpen === true, short(r));
  r = await call(`/api/ext/conversation?platform=instagram&handle=@${handle}`, "GET", undefined, ext(token));
  ok("helper finds lead A by handle alone", r.found && r.conversationId === A, short(r));
  r = await call(`/api/ext/conversation?platform=instagram&externalId=nope-${stamp}`, "GET", undefined, ext(token));
  ok("helper gets found false for an unknown thread", r.status === 200 && r.found === false, short(r));
  const pic = `https://scontent.cdninstagram.com/v/check-${stamp}.jpg`;
  r = await call(`/api/ext/conversation?platform=instagram&externalId=${threadA.externalId}&avatar=${encodeURIComponent("https://evil.example.com/x.jpg")}`, "GET", undefined, ext(token));
  s = await state();
  ok("a picture from a host that is not Instagram is ignored", !findIn(s, A)?.avatar, findIn(s, A)?.avatar);
  r = await call(`/api/ext/conversation?platform=instagram&externalId=${threadA.externalId}&avatar=${encodeURIComponent(pic)}`, "GET", undefined, ext(token));
  await flow("an Instagram picture from the helper shows on the lead", () => state(), (x) => findIn(x, A)?.avatar === pic);
  r = await call(`/api/avatar/${A}`);
  ok("GET /api/avatar/<id> answers 404 in plain words when Instagram does not serve the picture", r.status === 404 && /Picture/.test(r.error || ""), short(r));
  r = await call(`/api/avatar/nope`);
  ok("GET /api/avatar for an unknown lead is 404", r.status === 404, short(r));

  // =====================================================================================
  head("AI drafts and the brief for lead A");
  r = await call(`/api/conversations/${A}/suggest`, "POST");
  const bubbles = r.conversation?.suggestion?.bubbles || [];
  ok("POST /api/conversations/<id>/suggest returns a draft", r.status === 200 && bubbles.length > 0, short(r));
  const engine = r.conversation?.suggestion?.engine;
  note(`AI engine answering drafts: ${engine === "claude" ? "Claude" : "basic keyword engine (" + (s0.flags?.aiError || "Claude unavailable") + ")"}`);
  await flow("the draft shows on the lead in the inbox list", () => state(), (x) => JSON.stringify(findIn(x, A)?.suggestion?.bubbles) === JSON.stringify(bubbles));
  r = await call(`/api/ext/conversation?platform=instagram&externalId=${threadA.externalId}`, "GET", undefined, ext(token));
  ok("the helper sees the same draft", JSON.stringify(r.suggestion?.bubbles) === JSON.stringify(bubbles), short(r.suggestion));
  r = await call("/api/ext/suggest", "POST", { conversationId: A }, ext(token));
  ok("POST /api/ext/suggest returns a draft with stage and tags", r.status === 200 && r.bubbles?.length > 0 && typeof r.stage === "string" && Array.isArray(r.labels), short(r));
  r = await call("/api/ext/suggest", "POST", { conversationId: "nope" }, ext(token));
  ok("POST /api/ext/suggest for an unknown lead is 404", r.status === 404, short(r));
  r = await call(`/api/conversations/nope/suggest`, "POST");
  ok("POST /api/conversations/<unknown>/suggest is 404", r.status === 404, short(r));
  r = await call(`/api/conversations/${A}/summary`, "POST");
  ok("POST /api/conversations/<id>/summary rewrites the brief from the 5 messages", r.status === 200 && r.conversation?.summary?.messageCount === 5 && r.conversation.summary.text.length > 20, short(r.conversation?.summary));
  ok("the brief names the lead and what they want", /Check/.test(r.conversation?.summary?.text || "") && /20k/i.test(r.conversation?.summary?.text || ""), r.conversation?.summary?.text);
  r = await call(`/api/conversations/${A}/simulate`, "POST", { text: "hi" });
  ok("POST /api/conversations/<id>/simulate is refused for a real (non demo) thread", r.status === 400, short(r));
  const kv = await call("/api/knowledge");
  ok("no knowledge question was opened for the check lead", !(kv.gaps || []).some((g) => (g.leads || []).some((l) => l.id === A)), short(kv.gaps?.slice(0, 2)));


  // =====================================================================================
  head("lead L arrives through the helper's live sync (/api/ext/live)");
  {
    const v0 = await call("/api/version");
    ok("GET /api/version answers with a version", v0.status === 200 && typeof v0.v === "string" && v0.v.length > 0, short(v0));
    const hL = `check_lead_l_${stamp}`, nL = `Check Lead L ${stamp}`;
    const insL0 = await insightsToday();
    const p1 = `hey saw your reel about booked calls ${stamp}`;
    let lr = await call("/api/ext/live", "POST", { threads: [{ kind: "preview", thread: { name: nL, handle: hL }, messages: [{ direction: "in", text: p1, ageSec: 5 }] }] }, ext(token));
    const L = lr.conversations?.[0];
    if (L) created.push(L);
    ok("POST /api/ext/live (chat list preview) creates the chat with the new message", lr.status === 200 && lr.added === 1 && L, short(lr));
    await flow("GET /api/version changes after the live message is saved", () => call("/api/version"), (x) => x.v && x.v !== v0.v);
    let sL = await flow("inbox list: the live chat shows unread with its preview", () => state(), (x) => { const c = findIn(x, L); return c && c.unread === true && c.preview === p1 && c.handle === hL && c.name === nL; });
    ok("inbox list: the live chat sits above every chat with an older message", posOf(sL, L) === ahead(sL, findIn(sL, L) || {}), `pos ${posOf(sL, L)}`);
    ok("inbox list: the live chat's time is now (within a minute)", Math.abs(Date.parse(findIn(sL, L)?.lastMessageAt) - Date.now()) < 60000, findIn(sL, L)?.lastMessageAt);
    ok("leads centre: the live chat is an Inbound message lead with an open window", findIn(sL, L)?.stage === "inbound" && findIn(sL, L)?.window?.open === true, short({ stage: findIn(sL, L)?.stage, window: findIn(sL, L)?.window }));

    const out1 = `thanks for reaching out, what do you do ${stamp}`, in2 = `coaching, about 8k a month right now ${stamp}`;
    lr = await call("/api/ext/live", "POST", { threads: [{ kind: "thread", thread: { name: nL, handle: hL }, messages: [{ direction: "in", text: p1 }, { direction: "out", text: out1 }, { direction: "in", text: in2 }] }] }, ext(token));
    ok("live sync of the open chat lines up the known message and adds the 2 new ones", lr.status === 200 && lr.added === 2 && lr.matched === 1 && lr.conversations?.includes(L), short(lr));
    let dL = await flow("thread detail shows all 3 live messages in order", () => call(`/api/conversations/${L}`), (x) => x.messages?.map((m) => m.text).join("|") === [p1, out1, in2].join("|"));
    ok("detail: stage moved to In conversation", dL.conversation?.stage === "in_conversation", dL.conversation?.stage);
    ok("detail: brief counts the 3 messages", dL.conversation?.summary?.messageCount === 3, short(dL.conversation?.summary));
    sL = await flow("inbox list: preview, count and unread follow the live thread", () => state(), (x) => { const c = findIn(x, L); return c?.preview === in2 && c?.messageCount === 3 && c?.unread === true; });
    let insL = await insightsToday();
    ok("insights today: New conversations +1, received +2, sent +1 from live sync", insL.conversations >= insL0.conversations + 1 && insL.messagesReceived >= insL0.messagesReceived + 2 && insL.messagesSent >= insL0.messagesSent + 1, short({ before: insL0, after: insL }));

    lr = await call("/api/ext/live", "POST", { threads: [{ kind: "thread", thread: { name: nL, handle: hL }, messages: [{ direction: "in", text: p1 }, { direction: "out", text: out1 }, { direction: "in", text: in2 }] }] }, ext(token));
    ok("the same chat sent again adds nothing", lr.status === 200 && lr.added === 0 && lr.matched === 3, short(lr));
    lr = await call("/api/ext/live", "POST", { threads: [{ kind: "preview", thread: { name: nL, handle: hL }, messages: [{ direction: "in", text: in2.slice(0, 20) + "…" }] }] }, ext(token));
    ok("a shortened chat list preview of a known message adds nothing", lr.status === 200 && lr.added === 0 && lr.matched === 1, short(lr));

    await call(`/api/conversations/${L}`, "PATCH", { unread: false });
    const late = `old message found late ${stamp}`;
    lr = await call("/api/ext/live", "POST", { threads: [{ kind: "preview", thread: { name: nL, handle: hL }, messages: [{ direction: "in", text: late, ageSec: 3600 }] }] }, ext(token));
    ok("a preview dated an hour back is stored", lr.status === 200 && lr.added === 1, short(lr));
    sL = await state();
    ok("an hour-old message found late does not mark the chat unread", findIn(sL, L)?.unread === false, findIn(sL, L)?.unread);
    const fresh = `are you around later ${stamp}`.replace("?", "");
    lr = await call("/api/ext/live", "POST", { threads: [{ kind: "preview", thread: { name: nL, handle: hL }, messages: [{ direction: "in", text: fresh, ageSec: 2 }] }] }, ext(token));
    sL = await flow("a fresh live message marks the chat unread again and leads the preview", () => state(), (x) => findIn(x, L)?.unread === true && findIn(x, L)?.preview === fresh);
    const out2 = `yes, free after 3 ${stamp}`;
    lr = await call("/api/ext/live", "POST", { threads: [{ kind: "thread", thread: { name: nL, handle: hL }, messages: [{ direction: "in", text: fresh }, { direction: "out", text: out2 }] }] }, ext(token));
    ok("a reply typed in Instagram is picked up by live sync", lr.status === 200 && lr.added === 1, short(lr));
    sL = await flow("inbox list: preview reads \"You: ...\" after the reply typed in Instagram", () => state(), (x) => findIn(x, L)?.preview === "You: " + out2);
    dL = await call(`/api/conversations/${L}`);
    ok("detail: messages stay in time order after late and live additions", dL.messages?.every((m, i, a) => !i || a[i - 1].sentAt <= m.sentAt) && dL.messages?.at(-1)?.text === out2, short(dL.messages?.map((m) => m.text)));

    // An existing chat (lead A, read in by ingest) gets a new message through live sync.
    if (A) {
      await call(`/api/conversations/${A}`, "PATCH", { unread: false });
      const aNew = `just checking in on this ${stamp}`;
      lr = await call("/api/ext/live", "POST", { threads: [{ kind: "preview", thread: { name: "Check Lead " + stamp, handle: "check_lead_" + stamp, externalId: "check-" + stamp }, messages: [{ direction: "in", text: aNew, ageSec: 1 }] }] }, ext(token));
      ok("live sync adds a new message to an existing chat found by its thread id", lr.status === 200 && lr.added === 1 && lr.conversations?.includes(A), short(lr));
      await flow("existing chat: unread, preview and position follow the live message", () => state(), (x) => { const c = findIn(x, A); return c?.unread === true && c?.preview === aNew && posOf(x, A) === ahead(x, c); });
    }
    lr = await call("/api/ext/live", "POST", { threads: [{ kind: "preview", thread: { name: "" }, messages: [{ direction: "in", text: "x" }] }] }, ext(token));
    ok("live sync skips a chat with no name or handle", lr.status === 200 && lr.added === 0, short(lr));
    lr = await call("/api/ext/live", "POST", { threads: [{ kind: "preview", thread: { name: `Check Lead Q ${stamp}` }, messages: [] }] }, ext(token));
    ok("live sync does not create a chat that has no messages", lr.status === 200 && !(lr.conversations || []).length && !findIn(await state(), (await state()).conversations?.find((c) => c.name === `Check Lead Q ${stamp}`)?.id), short(lr));
    lr = await call("/api/ext/live", "POST", { nope: 1 }, ext(token));
    ok("POST /api/ext/live without threads is refused (400)", lr.status === 400, short(lr));
  }

  // =====================================================================================
  head("lead B: a thread with no username yet");
  const threadB = { externalId: "check-b-" + stamp, name: "Check Lead B " + stamp };
  r = await call("/api/ext/ingest", "POST", { platform: "instagram", thread: threadB, messages: [{ direction: "in", text: `hello there ${stamp}`, sentAt: new Date().toISOString(), order: 0 }] }, ext(token));
  B = r.conversationId;
  if (B) created.push(B);
  ok("ingest creates lead B with one inbound message", r.status === 200 && r.added === 1, short(r));
  s = await flow("lead B appears in the list as Inbound message with no handle", () => state(), (x) => findIn(x, B)?.stage === "inbound" && findIn(x, B)?.handle === null);
  ok("lead B cannot be sent to (sendVia none)", findIn(s, B)?.sendVia === "none", findIn(s, B)?.sendVia);
  r = await call(`/api/conversations/${B}/send`, "POST", { bubbles: ["check, must not send"] });
  ok("POST /api/conversations/<id>/send refuses with a plain reason when no username is known", r.status === 502 && /username/i.test(r.error || ""), short(r));
  ok("refused send records nothing", (await msgsOf(B)).length === 1, "a message was stored");
  r = await call("/api/outreach?list=reply");
  ok("refused send queues nothing for the helper", !(r.rows || []).some((p) => p.reply?.conversationId === B), short(r.rows));
  r = await call(`/api/conversations/${B}/send`, "POST", { bubbles: ["  ", ""] });
  ok("send with only blank bubbles is refused (400)", r.status === 400, short(r));
  r = await call(`/api/ext/conversation?platform=instagram&externalId=${threadB.externalId}&handle=check_lead_b_${stamp}`, "GET", undefined, ext(token));
  ok("helper finds lead B", r.found && r.conversationId === B, short(r));
  await flow("the username the helper saw is saved on lead B", () => state(), (x) => findIn(x, B)?.handle === `check_lead_b_${stamp}` && findIn(x, B)?.sendVia === "helper");

  // =====================================================================================
  head("lead C: imported from an Instagram data export");
  const day = 864e5;
  const exportThread = {
    title: "Check Lead Imp " + stamp, thread_path: `inbox/check_lead_imp_${stamp}`,
    participants: [{ name: "Check Lead Imp " + stamp }, { name: "Check Owner " + stamp }],
    messages: [
      { sender_name: "Check Lead Imp " + stamp, timestamp_ms: Date.now() - 3 * day, content: `old question ${stamp}` },
      { sender_name: "Check Owner " + stamp, timestamp_ms: Date.now() - 3 * day + 60000, content: `old answer ${stamp}` },
      { sender_name: "Check Owner " + stamp, timestamp_ms: Date.now() - 3 * day + 70000, content: "You sent an attachment." },
    ],
  };
  r = await call("/api/import", "POST", { threads: [exportThread], platform: "instagram", ownerName: "Check Owner " + stamp });
  ok("POST /api/import brings in the thread (system lines skipped)", r.status === 200 && r.conversations === 1 && r.added === 2, short(r));
  s = await state();
  C = (s.conversations || []).find((c) => c.externalId === `export_check_lead_imp_${stamp}`)?.id;
  if (C) created.push(C);
  const cC = findIn(s, C) || {};
  ok("imported lead shows with the right stage, preview and time", cC.stage === "in_conversation" && cC.preview === `You: old answer ${stamp}` && cC.lastMessageAt === new Date(exportThread.messages[1].timestamp_ms).toISOString(), short(cC));
  ok("imported lead is placed by its old date, not at the top", posOf(s, C) === ahead(s, cC) && posOf(s, C) > 0, `pos ${posOf(s, C)}`);
  ok("imported history is not marked unread", cC.unread === false, cC.unread);
  r = await call("/api/import", "POST", { threads: [exportThread], platform: "instagram", ownerName: "Check Owner " + stamp });
  ok("importing the same export again adds nothing", r.status === 200 && r.added === 0, short(r));
  r = await call("/api/import", "PUT", { threads: [{ participants: [{ name: "A" }, { name: "B" }] }, { participants: [{ name: "A" }, { name: "C" }] }] });
  ok("PUT /api/import guesses the owner's name for a signed in owner", r.status === 200 && r.ownerName === "A", short(r));
  r = await call("/api/import", "POST", { threads: [] });
  ok("POST /api/import with no threads is refused (400)", r.status === 400, short(r));

  // =====================================================================================
  head("demo thread: incoming test message and a reply from the inbox");
  const pool = s.conversations.filter((c) => c.externalId.startsWith("demo_") && !c.labels.includes("Needs human") && !c.labels.includes("Do not contact") && !c.gap && c.status !== "done");
  const demo = pool.find((c) => c.stage === "in_conversation") || pool[0];
  if (!demo) ok("a demo thread exists to test with", false, "none");
  else {
    const before = await msgsOf(demo.id);
    const insD0 = await insightsToday();
    const inText = `yeah that sounds interesting, tell me more ${stamp}`;
    r = await call(`/api/conversations/${demo.id}/simulate`, "POST", { text: inText });
    ok("POST /api/conversations/<demo>/simulate stores the incoming message", r.status === 200 && r.trigger === null, short(r));
    await flow("demo thread detail shows the new incoming message last", () => call(`/api/conversations/${demo.id}`), (x) => x.messages?.length === before.length + 1 && x.messages.at(-1).text === inText && x.messages.at(-1).direction === "in");
    s = await flow("inbox list: demo thread preview, time and unread follow the incoming message", () => state(), (x) => { const c = findIn(x, demo.id); return c?.preview === inText && c?.unread === true && c?.messageCount === before.length + 1; });
    ok("inbox list: demo thread moved to the top", posOf(s, demo.id) === ahead(s, findIn(s, demo.id) || {}) && posOf(s, demo.id) <= 2, `pos ${posOf(s, demo.id)}`);
    ok("inbox list: the window is open after an incoming message", findIn(s, demo.id)?.window?.open === true, short(findIn(s, demo.id)?.window));
    ins = await insightsToday();
    ok("insights today: Messages received +1 from the incoming test message", ins.messagesReceived >= insD0.messagesReceived + 1, `${insD0.messagesReceived} -> ${ins.messagesReceived}`);
    d = await call(`/api/conversations/${demo.id}`);
    ok("demo brief counts the new message", d.conversation?.summary?.messageCount === before.length + 1 || d.conversation?.summary?.engine === "claude", short(d.conversation?.summary));

    const reply = [`thanks, here is how it works ${stamp}`, `want me to send the details? ${stamp}`];
    r = await call(`/api/conversations/${demo.id}/send`, "POST", { bubbles: reply, sender: "owner" });
    ok("POST /api/conversations/<demo>/send records both bubbles", r.status === 200 && r.simulated === true, short(r));
    d = await flow("demo thread detail shows both bubbles last, sent by the owner", () => call(`/api/conversations/${demo.id}`), (x) => x.messages?.length === before.length + 3 && x.messages.at(-1).text === reply[1] && x.messages.at(-2).text === reply[0] && x.messages.at(-1).memberId === ownerId);
    s = await flow("inbox list: demo preview is the reply, unread cleared, draft cleared", () => state(), (x) => { const c = findIn(x, demo.id); return c?.preview === "You: " + reply[1] && c?.unread === false && c?.suggestion === null; });
    ok("replying by hand gives the lead to that person when nobody had it", findIn(s, demo.id)?.assignedTo === (demo.assignedTo || ownerId), findIn(s, demo.id)?.assignedTo);
    ins = await insightsToday();
    ok("insights today: Messages sent +2 from the reply", ins.messagesSent >= insD0.messagesSent + 2, `${insD0.messagesSent} -> ${ins.messagesSent}`);

    // keyword trigger: owner's own rule answers at once
    const trig0 = s.workspace?.triggers ?? [];
    const kw = `checkkw${stamp}`;
    r = await call("/api/workspace", "PUT", { triggers: [...trig0, { name: "Check " + stamp, keywords: [kw], match: "exact", text: `trigger reply ${stamp}`, addTags: ["Warm"], aiAfter: "keep", once: true, enabled: true }] });
    restore.push(async () => {
      const back = await call("/api/workspace", "PUT", { triggers: trig0 });
      ok("keyword triggers put back as they were", back.status === 200 && JSON.stringify(back.workspace?.triggers) === JSON.stringify(trig0), short(back.workspace?.triggers));
    });
    ok("PUT /api/workspace saves a keyword trigger", r.status === 200 && r.workspace?.triggers?.some((t) => t.keywords.includes(kw)), short(r));
    r = await call(`/api/conversations/${demo.id}/simulate`, "POST", { text: kw.toUpperCase() + "!" });
    ok("an incoming keyword fires the trigger", r.status === 200 && r.trigger === "Check " + stamp, short(r));
    d = await flow("the trigger's reply is in the thread, sent automatically", () => call(`/api/conversations/${demo.id}`), (x) => x.messages?.at(-1)?.text === `trigger reply ${stamp}` && x.messages.at(-1).sender === "auto");
    ok("activity shows the trigger and the tag it added", (d.events || []).some((e) => e.type === "trigger_fired") && d.conversation?.labels?.includes("Warm"), short(d.events?.slice(0, 3)));
    r = await call(`/api/conversations/${demo.id}/simulate`, "POST", { text: kw });
    ok("a once-only trigger does not fire twice", r.status === 200 && r.trigger === null, short(r));
    r = await call("/api/workspace", "PUT", { triggers: [{ name: "x", keywords: [], text: "y" }] });
    ok("a trigger without keywords is refused (400)", r.status === 400, short(r));
    await restore.pop()();
    await call(`/api/conversations/${demo.id}`, "PATCH", { unread: false });
  }

  // =====================================================================================
  head("team member with a narrow account");
  const setterEmail = `check-setter-${stamp}@example.com`;
  const setterPw = "check-pass-" + stamp;
  r = await call("/api/team", "POST", { name: "Check Setter " + stamp, email: setterEmail, password: setterPw, role: "setter", areas: ["inbox"], scope: "assigned" });
  setterId = r.member?.id;
  ok("POST /api/team adds a setter who only sees leads given to them", r.status === 200 && setterId && r.member.scope === "assigned" && !("passwordHash" in r.member), short(r));
  r = await call("/api/team", "POST", { name: "Dupe", email: setterEmail, password: setterPw, role: "setter" });
  ok("a second account with the same email is refused (400)", r.status === 400, short(r));
  r = await call("/api/team", "POST", { name: "Short", email: `check-short-${stamp}@example.com`, password: "short", role: "setter" });
  ok("a password under 8 characters is refused (400)", r.status === 400, short(r));
  if (setterId) {
    r = await call("/api/team", "PUT", { id: setterId, team: "Check team" });
    ok("PUT /api/team updates the setter", r.status === 200 && r.member?.team === "Check team", short(r));
    const sj = { cookie: "" };
    r = await call("/api/auth/login", "POST", { email: setterEmail.toUpperCase(), password: setterPw }, { jar: sj });
    ok("the setter signs in (email in any case)", r.status === 200 && sj.cookie, short(r));
    let ss = await state(sj);
    ok("setter sees no leads before any are given to them", ss.status === 200 && ss.conversations.length === 0, `${ss.status} ${ss.conversations?.length}`);
    ok("setter does not get the workspace token", ss.workspace?.apiToken === "", "token visible");
    await call(`/api/conversations/${A}`, "PATCH", { assignedTo: setterId });
    ss = await flow("a lead assigned to the setter shows in their inbox at once", () => state(sj), (x) => x.conversations?.length === 1 && x.conversations[0].id === A);
    r = await call(`/api/conversations/${A}`, "GET", undefined, { jar: sj });
    ok("setter opens their lead", r.status === 200 && r.messages?.length === 6, short(r));
    r = await call(`/api/conversations/${B}`, "GET", undefined, { jar: sj });
    ok("setter cannot open a lead that is not theirs (404)", r.status === 404, short(r));
    r = await call(`/api/conversations/${B}/suggest`, "POST", undefined, { jar: sj });
    ok("setter cannot draft on a lead that is not theirs (404)", r.status === 404, `${r.status}: the suggest route returns the whole lead (${short(r.conversation?.name, 60)}) and re-tags it. web/app/api/conversations/[id]/suggest/route.ts:12 finds the lead without canSee(), unlike GET/PATCH/send/summary.`);
    if (demo) {
      r = await call(`/api/conversations/${demo.id}/simulate`, "POST", { text: "check" }, { jar: sj });
      ok("setter cannot add messages to a lead that is not theirs (simulate, 404)", r.status === 404, `${r.status}: web/app/api/conversations/[id]/simulate/route.ts:12 has no canSee() check (demo threads only, but it also returns the lead)`);
      if (r.status === 200) await call(`/api/conversations/${demo.id}`, "PATCH", { unread: false });
    }
    r = await call(`/api/conversations/${A}`, "PATCH", { notes: note1 + " by setter" }, { jar: sj });
    ok("setter can edit their own lead", r.status === 200 && r.conversation?.notes === note1 + " by setter", short(r));
    for (const [m, p, b, why] of [
      ["GET", "/api/insights", undefined, "insights"], ["GET", "/api/setup", undefined, "setup"], ["GET", "/api/crm", undefined, "CRM"],
      ["GET", "/api/sheets", undefined, "Sheets"], ["GET", "/api/outreach", undefined, "outreach"], ["POST", "/api/team", { name: "x" }, "team"],
      ["DELETE", `/api/conversations/${B}`, undefined, "delete a lead"], ["PUT", "/api/workspace", { targets: { bookedPerMonth: 1 } }, "change targets"],
      ["POST", "/api/import", { threads: [] }, "import"], ["POST", "/api/calendar", { action: "save" }, "calendar"],
    ]) {
      const x = await call(p, m, b, { jar: sj });
      ok(`setter is refused: ${why} (403)`, x.status === 403, `${x.status} ${x._text.slice(0, 120)}`);
    }
    r = await call("/api/connect", "GET", undefined, { jar: sj });
    ok("setter's Get connected view hides the Meta app id and verify token", r.status === 200 && r.meta?.appId === "" && r.meta?.verifyToken === "", short(r.meta));
    r = await call("/api/team", "PUT", { id: setterId, active: false });
    ok("deactivating the setter saves", r.status === 200 && r.member?.active === false, short(r));
    r = await state(sj);
    ok("a deactivated setter's session stops working at once (401)", r.status === 401, r.status);
    await call(`/api/conversations/${A}`, "PATCH", { assignedTo: ownerId });
  }

  // =====================================================================================
  head("settings, knowledge, outreach, calendar, CRM, Sheets, setup");
  const t0 = s0.workspace?.targets?.bookedPerMonth;
  const target = t0 === 23 ? 24 : 23;
  r = await call("/api/workspace", "PUT", { targets: { bookedPerMonth: target } });
  restore.push(async () => {
    const x = await call("/api/workspace", "PUT", { targets: { bookedPerMonth: t0 } });
    ok("bookings target put back", x.status === 200 && x.workspace?.targets?.bookedPerMonth === t0, short(x.workspace?.targets));
  });
  ok("PUT /api/workspace saves the bookings target", r.status === 200 && r.workspace?.targets?.bookedPerMonth === target, short(r.workspace?.targets));
  dp = await deep();
  ok("deep insights forecast uses the new target at once", dp.forecast?.target === target, dp.forecast?.target);
  await restore.pop()();
  // Never send a pipeline the app could accept: an empty tag list is a valid edit and strips every tag from every lead.
  r = await call("/api/workspace", "PUT", { pipeline: { stages: "x" } });
  ok("PUT /api/workspace refuses a malformed pipeline (400)", r.status === 400, short(r));
  r = await call("/api/workspace", "PUT", { crm: { webhookUrl: "ftp://nope" } });
  ok("PUT /api/workspace refuses a CRM webhook that is not http(s) (400)", r.status === 400, short(r));
  s = await state();
  if (!ok("CRM settings unchanged after the refused write", s.workspace?.crm?.webhookUrl === s0.workspace?.crm?.webhookUrl && s.workspace?.crm?.enabled === s0.workspace?.crm?.enabled, short(s.workspace?.crm)))
    await call("/api/workspace", "PUT", { crm: { webhookUrl: s0.workspace?.crm?.webhookUrl ?? "" } });
  ok("pipeline unchanged after the refused writes", JSON.stringify(s.workspace?.pipeline ?? null) === JSON.stringify(s0.workspace?.pipeline ?? null), "pipeline changed");

  const q = "Check question " + stamp + "?";
  r = await call("/api/knowledge", "POST", { action: "save", item: { question: q, answer: "Check answer.", kind: "question" } });
  const kid = (r.items || []).find((i) => i.question === q)?.id;
  ok("POST /api/knowledge save adds an answer", r.status === 200 && kid, short(r));
  r = await call("/api/knowledge");
  ok("GET /api/knowledge lists it", (r.items || []).some((i) => i.id === kid), short(r.items?.slice(0, 2)));
  if (kid) {
    r = await call("/api/knowledge", "POST", { action: "delete", id: kid });
    ok("POST /api/knowledge delete removes it", r.status === 200 && !(r.items || []).some((i) => i.id === kid), short(r));
  }
  r = await call("/api/knowledge", "POST", { action: "save", item: { question: "", answer: "" } });
  ok("knowledge: an empty answer is refused (400)", r.status === 400, short(r));
  r = await call("/api/knowledge", "POST", { action: "dismiss", gapId: "g_nope" });
  ok("knowledge: dismissing an unknown question is refused (400)", r.status === 400, short(r));
  r = await call("/api/knowledge", "POST", { action: "answer", gapId: "g_nope", answer: "x" });
  ok("knowledge: answering an unknown question is refused (400)", r.status === 400, short(r));

  const o0 = await call("/api/outreach");
  ok("GET /api/outreach answers", o0.status === 200 && o0.settings && Array.isArray(o0.lists), short(o0));
  r = await call("/api/outreach", "POST", { action: "import", name: "Check list " + stamp, text: `check_handle_one_${stamp}\ncheck_handle_two_${stamp}\n${handle}\ncheck_handle_one_${stamp}` });
  const list = (r.lists || []).find((l) => l.name === "Check list " + stamp);
  ok("outreach import: 2 added, 1 already a lead (lead A), 1 duplicate", r.status === 200 && list && r.added === 2 && r.alreadyLeads === 1 && r.duplicates === 1, short({ added: r.added, alreadyLeads: r.alreadyLeads, duplicates: r.duplicates, invalid: r.invalid }));
  if (list) {
    restore.push(async () => { await call("/api/outreach", "POST", { action: "list.delete", id: list.id }); });
    r = await call(`/api/outreach?list=${list.id}`);
    ok("GET /api/outreach?list=<id> pages the prospects", r.status === 200 && r.total === 2 && r.rows.every((p) => p.status === "queued"), short(r));
    r = await call("/api/outreach", "POST", { action: "preview", text: "hey {first_name|there}, {handle}", listIds: [list.id] });
    ok("outreach preview fills from the chosen list", r.status === 200 && r.sample === `check_handle_one_${stamp}` && r.preview?.text === `hey there, check_handle_one_${stamp}`, short({ status: r.status, sample: r.sample, preview: r.preview, error: r.error }));
    r = await call("/api/outreach", "POST", { action: "campaign.save", campaign: { name: "Check campaign " + stamp, listIds: [list.id], variants: [{ text: "a" }], status: "active" } });
    ok("an active campaign with one message version is refused (400)", r.status === 400, short(r));
    r = await call("/api/outreach", "POST", { action: "campaign.save", campaign: { name: "Check campaign " + stamp, listIds: [list.id], variants: [{ text: "hey {first_name}" }], status: "draft" } });
    const camp = r.campaign;
    ok("POST /api/outreach campaign.save keeps a draft (never active)", r.status === 200 && camp?.status === "draft", short(r.campaign));
    if (camp) {
      r = await call("/api/outreach", "POST", { action: "campaign.delete", id: camp.id });
      ok("POST /api/outreach campaign.delete removes it", r.status === 200 && !r.campaigns.some((c) => c.id === camp.id), short(r.campaigns));
    }
    r = await call("/api/outreach", "POST", { action: "list.requeue", id: list.id });
    ok("POST /api/outreach list.requeue answers", r.status === 200, short(r));
    await restore.pop()();
    r = await call("/api/outreach");
    ok("POST /api/outreach list.delete removes the check list", !(r.lists || []).some((l) => l.id === list.id), short(r.lists));
  }
  r = await call("/api/outreach", "POST", { action: "import", name: "x", text: "" });
  ok("outreach import with nothing to import is refused (400)", r.status === 400, short(r));
  r = await call("/api/outreach", "POST", { action: "nope" });
  ok("outreach unknown action is refused (400)", r.status === 400, short(r));
  r = await call("/api/outreach");
  ok("outreach settings unchanged by the run", JSON.stringify(r.settings) === JSON.stringify(o0.settings) && JSON.stringify(r.campaigns) === JSON.stringify(o0.campaigns), "settings or campaigns changed");

  r = await call("/api/calendar");
  ok("GET /api/calendar answers", r.status === 200 && r.calendar, short(r));
  const cal0 = r.calendar;
  r = await call("/api/calendar", "POST", { action: "save", timezone: "Not/AZone" });
  ok("calendar: an unknown timezone is refused (400)", r.status === 400, short(r));
  r = await call("/api/calendar", "POST", { action: "connect", token: "not-a-real-token-" + stamp });
  ok("calendar: a bad Calendly token is refused in plain words", r.status >= 400 && /token/i.test(r.error || ""), short(r));
  r = await call("/api/calendar", "POST", { action: "nope" });
  ok("calendar: unknown action is refused (400)", r.status === 400, short(r));
  r = await call("/api/calendar");
  ok("calendar settings unchanged", JSON.stringify(r.calendar) === JSON.stringify(cal0), short(r.calendar));

  r = await call("/api/connect", "POST", { action: "nope" });
  ok("POST /api/connect unknown action is refused (400)", r.status === 400, short(r));
  r = await call("/api/connect", "POST", { action: "open-helper" });
  ok("POST /api/connect open-helper is refused on the hosted copy (400)", r.status === 400, short(r));
  note("Not called: POST /api/connect action test (queues a real Instagram test message through the helper).");
  if ((conn0.outreach?.account || "") === (conn0.helper?.account || "")) {
    r = await call("/api/connect", "POST", { action: "account" });
    ok("POST /api/connect account (outreach account already equals the helper's, so nothing changes)", r.status === 200 && r.outreach?.account === conn0.outreach?.account, short(r.outreach));
  } else note("POST /api/connect account skipped: it would change the outreach account.");

  r = await call("/api/crm");
  ok("GET /api/crm answers with a sample lead payload and the log", r.status === 200 && "sample" in r && Array.isArray(r.log), short(r));
  if (r.sample) ok("CRM sample payload has the documented fields", ["lead_id", "name", "stage", "tags", "summary", "message_count", "last_message_at", "instagram_handle"].every((k) => k in r.sample), Object.keys(r.sample).join(","));
  r = await call("/api/crm?what=pipelines");
  ok("GET /api/crm?what=pipelines without GoHighLevel answers a plain error", r.status === 502 && typeof r.error === "string", short(r));
  if (!s0.workspace?.crm?.enabled) {
    r = await call("/api/crm", "POST", { action: "lead", id: A });
    ok("POST /api/crm lead is refused while the CRM sync is off (400)", r.status === 400, short(r));
    r = await call("/api/crm", "POST", { action: "all" });
    ok("POST /api/crm all is refused while the CRM sync is off (400)", r.status === 400, short(r));
  }
  if (!s0.workspace?.crm?.webhookUrl) {
    r = await call("/api/crm", "POST", { action: "test" });
    ok("POST /api/crm test without a webhook says to add one", r.status === 502 && /webhook/i.test(r.error || ""), short(r));
  }
  r = await call("/api/crm", "POST", { action: "nope" });
  ok("POST /api/crm unknown action is refused (400)", r.status === 400, short(r));
  note("CRM per-lead view: the only per-lead CRM output is the push itself (POST /api/crm lead, or the automatic push), which is off on live. Lead A's payload could not be read without sending it to a real CRM.");

  r = await call("/api/sheets");
  ok("GET /api/sheets answers with the script and the archive status", r.status === 200 && typeof r.script === "string" && r.sheets && !("secret" in r.sheets), short(r.sheets));
  ok("Sheets script has the workspace secret filled in", r.script && !r.script.includes("__SECRET__"), "placeholder left in");
  const sh0 = r.sheets;
  if (!sh0?.enabled) {
    r = await call("/api/sheets", "POST", { action: "prune" });
    ok("POST /api/sheets prune is refused while the archive is off (400)", r.status === 400, short(r));
  }
  r = await call("/api/sheets", "POST", { action: "nope" });
  ok("POST /api/sheets unknown action is refused (400)", r.status === 400, short(r));
  r = await call("/api/sheets");
  ok("Sheets archive status unchanged", JSON.stringify(r.sheets) === JSON.stringify(sh0), short(r.sheets));

  r = await call("/api/setup");
  ok("GET /api/setup answers with key status (secrets masked)", r.status === 200 && r.keys && r.store?.mode === "postgres", short(r.store));
  const leaked = Object.entries(r.keys || {}).filter(([k, v]) => /KEY|SECRET/.test(k) && v.set && v.shown && v.shown !== "saved" && !v.shown.includes("…"));
  ok("GET /api/setup masks every secret", !leaked.length, leaked.map(([k]) => k).join(","));
  r = await call("/api/setup?what=schema");
  ok("GET /api/setup?what=schema returns the database SQL", r.status === 200 && /create table/i.test(r.sql || ""), `${r.status} ${short(r, 200)}`);
  r = await call("/api/setup", "POST", { action: "flush" });
  ok("POST /api/setup flush reports the store with no error", r.status === 200 && !r.store?.error && r.store?.pending === false, short(r.store));
  r = await call("/api/setup", "POST", { action: "supabase" });
  ok("POST /api/setup supabase is refused on the hosted copy (400)", r.status === 400, short(r));
  r = await call("/api/setup", "POST", { action: "nope" });
  ok("POST /api/setup unknown action is refused (400)", r.status === 400, short(r));
  note("Not called: POST /api/setup keys (writes live API keys).");

  // =====================================================================================
  head("Meta, cron and the helper's other routes");
  const igConnected = Boolean(s0.workspace?.meta?.instagram);
  r = await call("/api/meta/sync", "POST");
  ok("POST /api/meta/sync answers (connected false while Instagram is not linked)", r.status === 200 && (igConnected || r.connected === false), short(r));
  if (!igConnected) {
    r = await call("/api/meta/backfill", "POST");
    ok("POST /api/meta/backfill says Instagram is not connected", r.status === 502 && /not connected/i.test(r.error || ""), short(r));
  } else note("POST /api/meta/backfill skipped: Instagram is connected and a full import would run.");
  r = await call("/api/meta/token", "POST", { accessToken: "short" });
  ok("POST /api/meta/token refuses a short token (400)", r.status === 400, short(r));
  r = await call("/api/meta/token", "POST", { accessToken: "EAAcheck" + stamp + "x".repeat(30) });
  ok("POST /api/meta/token refuses a fake token in plain words (400)", r.status === 400 && /Meta rejected/i.test(r.error || ""), short(r));
  s = await state();
  ok("Meta connection unchanged", JSON.stringify(s.workspace?.meta) === JSON.stringify(s0.workspace?.meta), short(s.workspace?.meta));
  note("Not called: DELETE /api/meta/token (disconnects Instagram).");
  r = await call("/api/meta/connect", "GET", undefined, { jar: null });
  ok("GET /api/meta/connect redirects (Instagram sign in, or not configured)", [302, 303, 307, 308].includes(r.status) && (/instagram\.com|meta=not_configured/.test(r._location)), `${r.status} ${r._location}`);
  r = await call("/api/meta/connect?back=connect", "GET", undefined, { jar: null });
  ok("GET /api/meta/connect?back=connect returns to Get connected", [302, 303, 307, 308].includes(r.status) && (/\/connect\?meta=|instagram\.com/.test(r._location)), `${r.status} ${r._location}`);
  r = await call("/api/meta/callback", "GET", undefined, { jar: null });
  ok("GET /api/meta/callback without a code redirects with meta=denied", [302, 303, 307, 308].includes(r.status) && /meta=denied/.test(r._location), `${r.status} ${r._location}`);
  r = await call("/api/meta/callback?code=abc&state=wrong", "GET", undefined, { jar: null });
  ok("GET /api/meta/callback with a wrong state redirects with meta=denied", [302, 303, 307, 308].includes(r.status) && /meta=denied/.test(r._location), `${r.status} ${r._location}`);
  r = await call("/api/meta/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x", "GET", undefined, { jar: null });
  ok("GET /api/meta/webhook refuses a wrong verify token (403)", r.status === 403, r.status);
  r = await call("/api/meta/webhook", "POST", { object: "instagram", entry: [] }, { jar: null });
  ok("POST /api/meta/webhook refuses an unsigned post (401)", r.status === 401, r.status);
  const wr = await fetch(BASE + "/api/meta/webhook", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + "0".repeat(64) }, body: JSON.stringify({ object: "instagram", entry: [] }) });
  ok("POST /api/meta/webhook refuses a wrong signature (401)", wr.status === 401, wr.status);
  r = await call("/api/cron/sheets", "GET", undefined, { jar: null });
  ok("GET /api/cron/sheets without the cron secret is refused (401)", r.status === 401, r.status);
  r = await call("/api/cron/sheets", "GET", undefined, { jar: null, auth: "Bearer wrong" });
  ok("GET /api/cron/sheets with a wrong secret is refused (401)", r.status === 401, r.status);

  const extRoutes = [["GET", "/api/ext/ping"], ["POST", "/api/ext/hello", {}], ["POST", "/api/ext/ingest", {}], ["GET", "/api/ext/conversation"], ["POST", "/api/ext/suggest", {}],
    ["GET", "/api/ext/label-queue"], ["POST", "/api/ext/label-queue/ack", {}], ["GET", "/api/ext/outreach/status"], ["POST", "/api/ext/outreach/next", {}], ["POST", "/api/ext/outreach/result", {}],
    ["POST", "/api/ext/live", { threads: [] }]];
  const open = [];
  for (const [m, p, b] of extRoutes) {
    const x = await call(p, m, b, { auth: "Bearer wrong", jar: null });
    const y = await call(p, m, b, { jar: null });
    if (x.status !== 401 || y.status !== 401) open.push(`${m} ${p} -> ${x.status}/${y.status}`);
  }
  ok(`all ${extRoutes.length} helper routes refuse a wrong or missing key (401)`, !open.length, open.join("; "));
  r = await call("/api/ext/ping", "GET", undefined, ext(token));
  ok("GET /api/ext/ping answers with the workspace name", r.status === 200 && r.ok && r.workspace, short(r));
  r = await call("/api/ext/hello", "POST", { version: helper0.version, account: helper0.account, outreachOn: helper0.outreachOn }, ext(token));
  ok("POST /api/ext/hello (sent with the real helper's own values)", r.status === 200 && r.ok, short(r));
  r = await call("/api/connect");
  ok("Get connected shows the helper linked with its version and account", r.helper?.connected === true && r.helper.version === helper0.version && r.helper.account === helper0.account && r.helper.outreachOn === helper0.outreachOn, short(r.helper));
  r = await call("/api/ext/outreach/status", "GET", undefined, ext(token));
  ok("GET /api/ext/outreach/status matches the app's outreach settings", r.status === 200 && r.enabled === o0.settings.enabled && r.paused === o0.settings.paused && r.account === o0.settings.account, short(r));
  r = await call("/api/ext/outreach/result", "POST", { id: "t_nope", status: "sent" }, ext(token));
  ok("POST /api/ext/outreach/result for an unknown task is 404", r.status === 404, short(r));
  // Asking for work could hand the check a real queued reply or test, so it only runs when nothing real is waiting.
  const replies = (await call("/api/outreach?list=reply")).rows || [];
  const conn1 = await call("/api/connect");
  const waiting = replies.some((p) => p.status === "queued") || (conn1.tests || []).some((t) => t.status === "queued");
  if (!o0.settings.enabled && !waiting) {
    r = await call("/api/ext/outreach/next", "POST", { account: helper0.account }, ext(token));
    ok("POST /api/ext/outreach/next hands out nothing while outreach is off", r.status === 200 && r.task === null && typeof r.reason === "string", short(r));
  } else note("POST /api/ext/outreach/next skipped: outreach is on or a real message is waiting, and the check would take that task from the real helper.");
} catch (e) {
  ok("the run finished without an exception", false, e.stack);
}

// =====================================================================================
// Pages in headless Chrome, while the check leads still exist.
if (!env.SKIP_BROWSER) {
  head("pages in headless Chrome");
  try {
    await browserChecks();
  } catch (e) {
    ok("headless Chrome checks ran", false, e.stack);
  }
}

// =====================================================================================
head("tidy up");
for (const f of restore.reverse()) await f().catch((e) => ok("restore step", false, e.message));
{
  const now = await state();
  if (targets0 !== null && now.workspace?.targets?.bookedPerMonth !== targets0) await call("/api/workspace", "PUT", { targets: { bookedPerMonth: targets0 } });
  if (triggers0 !== null && JSON.stringify(now.workspace?.triggers) !== JSON.stringify(triggers0)) await call("/api/workspace", "PUT", { triggers: triggers0 });
  const back = await state();
  ok("settings the run touched are as they were (targets, triggers)", (targets0 === null || back.workspace?.targets?.bookedPerMonth === targets0) && (triggers0 === null || JSON.stringify(back.workspace?.triggers) === JSON.stringify(triggers0)), short({ targets: back.workspace?.targets, triggers: back.workspace?.triggers }));
}
try {
  const insX0 = await insightsToday();
  const counted = {};
  for (const id of created) counted[id] = await msgsOf(id);
  for (const id of created) {
    const r = await call(`/api/conversations/${id}`, "DELETE");
    if (r.status === 404) { note(`${id} was already gone before the tidy up (removed by someone else during the run).`); continue; }
    ok(`DELETE /api/conversations/${id} removes the check lead`, r.status === 200 && r.ok, short(r));
    if (r.status === 405) {
      await call(`/api/conversations/${id}`, "PATCH", { stage: "disqualified", labels: [], notes: "Created by the full check, safe to ignore." });
      note(`${id} could not be deleted and was marked Disqualified instead.`);
    }
  }
  const sx = await flow("deleted leads are gone from the inbox list", () => state(), (x) => created.every((id) => !findIn(x, id)));
  for (const id of created) {
    const g = await call(`/api/conversations/${id}`);
    ok(`GET /api/conversations/${id} is 404 after delete`, g.status === 404, g.status);
  }
  const lq = await call("/api/ext/label-queue", "GET", undefined, ext(token));
  ok("deleted leads leave nothing in the helper's label queue", !(lq.items || []).some((i) => i.externalId.includes(stamp)), short(lq.items));
  const insX = await insightsToday();
  const todayIn = Object.values(counted).flat().filter((m) => m.direction === "in" && m.sentAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
  ok(`insights today: deleted leads' ${todayIn} received messages come off the count`, insX.messagesReceived <= insX0.messagesReceived - todayIn, `${insX0.messagesReceived} -> ${insX.messagesReceived}`);
  const conv = await call("/api/ext/conversation?platform=instagram&externalId=check-" + stamp, "GET", undefined, ext(token));
  ok("the helper no longer finds the deleted lead", conv.found === false, short(conv));
  void sx;
  if (setterId) {
    const r = await call(`/api/team?id=${setterId}`, "DELETE");
    ok("DELETE /api/team removes the check setter", r.status === 200, short(r));
  }
  if (!env.NO_SWEEP) {
    const now = await state();
    const old = (now.conversations || []).filter((c) => /^Check Lead /.test(c.name) || /^check_lead_/.test(c.handle || ""));
    for (const c of old) {
      const r = await call(`/api/conversations/${c.id}`, "DELETE");
      ok(`leftover check chat "${c.name}" deleted`, r.status === 200 || r.status === 404, short(r));
    }
    for (const m of (now.workspace?.members || []).filter((m) => /^check-.*@example\.com$/.test(m.email || ""))) {
      const r = await call(`/api/team?id=${m.id}`, "DELETE");
      ok(`leftover check team member ${m.email} removed`, r.status === 200, short(r));
    }
    const ol = await call("/api/outreach");
    for (const l of (ol.lists || []).filter((l) => /^Check list /.test(l.name))) await call("/api/outreach", "POST", { action: "list.delete", id: l.id });
    for (const c of (ol.campaigns || []).filter((c) => /^Check campaign /.test(c.name))) await call("/api/outreach", "POST", { action: "campaign.delete", id: c.id });
    const kn = await call("/api/knowledge");
    for (const i of (kn.items || []).filter((i) => /^Check question /.test(i.question))) await call("/api/knowledge", "POST", { action: "delete", id: i.id });
    const fin = await state();
    const left = (fin.workspace?.members || []).filter((m) => /^check-.*@example\.com$/.test(m.email || ""));
    ok("no check team members left", !left.length, left.map((m) => m.email).join(","));
    ok("no check chats left anywhere (name Check Lead / handle check_lead_)", !(fin.conversations || []).some((c) => /^Check Lead /.test(c.name) || /^check_lead_/.test(c.handle || "")), (fin.conversations || []).filter((c) => /^Check Lead /.test(c.name)).map((c) => c.name).join(", "));
  }
} catch (e) {
  ok("tidy up finished", false, e.stack);
}
const lo = await call("/api/auth/logout", "POST");
ok("POST /api/auth/logout", lo.status === 200, lo.status);
const after = await call("/api/state", "GET", undefined, { jar: owner });
ok("after sign out the session cookie is cleared and data is locked", after.status === 401, after.status);

// ---------- summary ----------
const fails = results.filter((x) => !x.ok);
console.log(`\n${results.length - fails.length} passed, ${fails.length} failed`);
if (fails.length) {
  console.log("\nFAILED:");
  for (const f of fails) console.log(`- [${f.section}] ${f.name}\n    ${f.extra.slice(0, 800)}`);
}
if (notes.length) { console.log("\nNOTES:"); for (const n of notes) console.log(`- ${n}`); }
process.exit(fails.length ? 1 : 0);

// =====================================================================================
async function browserChecks() {
  const dir = path.join(env.CHECK_TMP || os.tmpdir(), `full-check-chrome-${stamp}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--user-data-dir=${dir}`, "--remote-debugging-pipe", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank"], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  let buf = "", nextId = 1;
  const waiting = new Map();
  const listeners = [];
  chrome.stdio[4].on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\0")) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); }
      else if (m.method) for (const f of listeners) f(m);
    }
  });
  const cdp = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = nextId++;
    waiting.set(id, { res, rej });
    chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + "\0");
    setTimeout(() => waiting.has(id) && (waiting.delete(id), rej(new Error("timeout " + method))), 60000);
  });
  try {
    const host = new URL(BASE).hostname;
    const login = await call("/api/auth/login", "POST", { email: OWNER_EMAIL, password: OWNER_PASSWORD }, { jar: owner });
    if (login.status !== 200) throw new Error("could not sign in for the browser");
    const [cname, cvalue] = [owner.cookie.slice(0, owner.cookie.indexOf("=")), owner.cookie.slice(owner.cookie.indexOf("=") + 1)];

    async function open(url, withCookie) {
      const { browserContextId } = await cdp("Target.createBrowserContext", {});
      const { targetId } = await cdp("Target.createTarget", { url: "about:blank", browserContextId });
      const sid = (await cdp("Target.attachToTarget", { targetId, flatten: true })).sessionId;
      const errors = [];
      const on = (m) => {
        if (m.sessionId !== sid) return;
        if (m.method === "Runtime.exceptionThrown") errors.push("exception: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split("\n")[0]);
        if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push("console.error: " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
        // A 404 from /api/avatar is the app's designed answer for an expired Instagram picture (the page falls back to initials).
        const avatar = (u) => /\/api\/avatar\//.test(u || "");
        if (m.method === "Log.entryAdded" && m.params.entry.level === "error" && !avatar(m.params.entry.url)) errors.push("log: " + m.params.entry.text.slice(0, 200) + (m.params.entry.url ? " " + m.params.entry.url : ""));
        if (m.method === "Network.responseReceived" && m.params.response.status >= 400 && new URL(m.params.response.url).hostname === host && !avatar(m.params.response.url)) errors.push(`HTTP ${m.params.response.status} ${new URL(m.params.response.url).pathname}`);
      };
      listeners.push(on);
      await cdp("Runtime.enable", {}, sid);
      await cdp("Log.enable", {}, sid);
      await cdp("Network.enable", {}, sid);
      await cdp("Page.enable", {}, sid);
      await cdp("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false }, sid);
      if (withCookie) await cdp("Network.setCookie", { name: cname, value: cvalue, domain: host, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }, sid);
      await cdp("Page.navigate", { url }, sid);
      const ev = async (e) => (await cdp("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }, sid)).result.value;
      const close = async () => { listeners.splice(listeners.indexOf(on), 1); await cdp("Target.closeTarget", { targetId }).catch(() => {}); await cdp("Target.disposeBrowserContext", { browserContextId }).catch(() => {}); };
      return { ev, errors, close };
    }
    // The page's own content: <main> inside the app shell, the whole body on pages without it.
    const text = (ev) => ev(`(document.querySelector("main") || document.body)?.innerText || ""`);
    async function settle(ev, until, ms = 25000) {
      const t0 = Date.now();
      let t = "";
      while (Date.now() - t0 < ms) {
        await sleep(1000);
        t = (await text(ev).catch(() => "")) || "";
        if (until(t)) return t;
      }
      return t;
    }
    const loading = (t) => /^\s*$|^\s*Loading/.test(t.slice(0, 200));

    const pages = ["/inbox", "/leads", "/pipeline", "/insights", "/playbook", "/outreach", "/settings", "/connect", "/learn", "/onboarding", "/privacy", "/login"];
    for (const p of pages) {
      const h = await fetch(BASE + p, { headers: { cookie: owner.cookie }, redirect: "manual" });
      ok(`page ${p} answers 200`, h.status === 200, h.status);
      try {
      let pg = await open(BASE + p, p !== "/privacy" && p !== "/login");
      let t = await settle(pg.ev, (x) => x.length > 40 && !loading(x));
      if (pg.errors.some((e) => /net::ERR_(NETWORK_CHANGED|INTERNET_DISCONNECTED|CONNECTION_RESET|NAME_NOT_RESOLVED)/.test(e))) {
        note(`page ${p}: this computer's network dropped while loading, opened it again`);
        await pg.close();
        pg = await open(BASE + p, p !== "/privacy" && p !== "/login");
        t = await settle(pg.ev, (x) => x.length > 40 && !loading(x));
      }
      await sleep(2500); // let polling and late errors land
      const url = await pg.ev("location.pathname");
      const crashed = /Application error|client-side exception|Unhandled Runtime Error|This page could not be found/i.test(t);
      ok(`page ${p} renders in Chrome (${t.length} chars, at ${url})`, t.length > 80 && !loading(t) && !crashed, t.slice(0, 200).replace(/\n/g, " "));
      ok(`page ${p} has no client errors`, !pg.errors.length, [...new Set(pg.errors)].join(" | "));
      if (p !== "/login" && p !== "/privacy") ok(`page ${p} keeps the signed in owner (no bounce to /login)`, url === p, url);
      await pg.close();
      } catch (e) {
        ok(`page ${p} opens in Chrome`, false, e.message);
      }
    }
    const anonPg = await open(BASE + "/inbox", false);
    await settle(anonPg.ev, () => false, 6000);
    ok("page /inbox without a session sends the visitor to /login", /^\/login/.test(await anonPg.ev("location.pathname")), await anonPg.ev("location.href"));
    await anonPg.close();

    // The check leads as the owner sees them
    if (A) try {
      const pg = await open(`${BASE}/inbox?c=${A}`, true);
      const t = await settle(pg.ev, (x) => x.includes("Check Lead " + stamp) && x.includes(`nice, what does your week look like ${stamp}`));
      ok("inbox page opens lead A with its name and newest message", t.includes("Check Lead " + stamp) && t.includes(`nice, what does your week look like ${stamp}`), t.slice(0, 300).replace(/\n/g, " "));
      ok("inbox page shows lead A's brief", /wants reach 20k a month/i.test(t), "brief text not on the page");
      ok("inbox page with lead A open has no client errors", !pg.errors.length, [...new Set(pg.errors)].join(" | "));
      await pg.close();
      const lp = await open(`${BASE}/leads`, true);
      const names = `[...document.querySelectorAll("[data-name]")].map((e) => e.textContent).join("|")`;
      let found = false;
      for (let i = 0; i < 25 && !found; i++) { await sleep(1000); found = ((await lp.ev(names)) || "").includes("Check Lead " + stamp); }
      ok("leads centre shows lead A on the board", found, "no card with the name");
      ok("leads centre has no client errors", !lp.errors.length, [...new Set(lp.errors)].join(" | "));
      await lp.close();
    } catch (e) {
      ok("lead A opens in the inbox and leads pages", false, e.message);
    }
  } finally {
    chrome.kill();
    await sleep(500);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
