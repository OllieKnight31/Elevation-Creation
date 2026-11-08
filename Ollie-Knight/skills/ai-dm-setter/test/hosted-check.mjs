// Checks every part of a running copy of the app through its own API, the way the browser and the helper use it.
// Usage: node test/hosted-check.mjs <base url>
//   OWNER_EMAIL / OWNER_PASSWORD   sign in with this account (required once sign in is on)
//   CREATE_OWNER=1                 a fresh copy with sign in off: create that owner first
//   SECOND=<base url>              another copy on the same database, to check both see the same data
//   ROUNDTRIP_CRM=1                point the CRM webhook at the app itself to prove after-response jobs run
// Test records are named "Check ..." and removed at the end where the app allows it.

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");
const env = process.env;
let cookie = "";
let pass = 0, fail = 0;
const results = [];
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + String(extra).slice(0, 300)}`);
};
async function call(path, method = "GET", body, opts = {}) {
  const base = opts.base || BASE;
  const headers = { "content-type": "application/json", ...(opts.auth ? { authorization: opts.auth } : {}), ...(opts.noCookie || !cookie ? {} : { cookie }) };
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), redirect: "manual" });
  const set = r.headers.get("set-cookie");
  if (set && !opts.noCookie && /setter_session=/.test(set)) cookie = set.split(";")[0];
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { text }; }
  return { ...data, status: r.status, _text: text };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString(36);

// ---------- sign in ----------
if (env.CREATE_OWNER) {
  const r = await call("/api/team", "POST", { name: "Check Owner", email: env.OWNER_EMAIL, password: env.OWNER_PASSWORD, role: "owner" });
  ok("first account becomes the owner and signs in", r.status === 200 && cookie, JSON.stringify(r).slice(0, 200));
} else if (env.OWNER_EMAIL) {
  const bad = await call("/api/auth/login", "POST", { email: env.OWNER_EMAIL, password: "wrong-" + stamp }, { noCookie: true });
  ok("a wrong password is refused", bad.status === 401 || bad.status === 400, bad.status);
  const r = await call("/api/auth/login", "POST", { email: env.OWNER_EMAIL, password: env.OWNER_PASSWORD });
  ok("owner signs in", r.status === 200 && cookie, JSON.stringify(r).slice(0, 200));
}
const anon = await call("/api/state", "GET", undefined, { noCookie: true });
ok("data is locked to signed in people", anon.status === 401 || anon.status === 403, anon.status);
const home = await fetch(BASE + "/", { redirect: "manual" });
ok("home page sends a visitor to sign in", home.status === 307 || home.status === 302 || home.status === 303, home.status);

// ---------- pages ----------
for (const p of ["/", "/inbox", "/leads", "/insights", "/outreach", "/pipeline", "/playbook", "/settings", "/connect", "/learn", "/onboarding", "/login"]) {
  const r = await fetch(BASE + p, { headers: { cookie }, redirect: "manual" });
  ok(`page ${p} opens`, r.status === 200 || (p === "/" && r.status >= 300 && r.status < 400), r.status);
}

// ---------- reading ----------
const st = await call("/api/state");
ok("state loads with conversations", st.status === 200 && Array.isArray(st.conversations), st.status);
const me = await call("/api/me");
ok("me returns the signed in owner", me.status === 200 && (me.member?.role === "owner" || me.me?.role === "owner" || me.role === "owner"), JSON.stringify(me).slice(0, 200));
for (const p of ["/api/insights", "/api/connect", "/api/calendar", "/api/knowledge", "/api/outreach", "/api/crm", "/api/setup"]) {
  const r = await call(p);
  ok(`${p} answers`, r.status === 200, r.status + " " + r._text.slice(0, 150));
}
const setup = await call("/api/setup");
ok(`storage is the hosted database (${setup.store?.mode})`, !env.EXPECT_MODE || setup.store?.mode === env.EXPECT_MODE, JSON.stringify(setup.store));
ok("storage reports no error", !setup.store?.error, setup.store?.error);
const token = st.workspace?.apiToken || setup.workspace?.apiToken || (await call("/api/connect")).token;

// ---------- workspace and settings ----------
const target = 20 + (Date.now() % 7);
let r = await call("/api/workspace", "PUT", { targets: { bookedPerMonth: target } });
ok("settings save", r.status === 200, r._text.slice(0, 200));
r = await call("/api/state");
ok("saved settings read back", r.workspace?.targets?.bookedPerMonth === target, JSON.stringify(r.workspace?.targets));

// ---------- team ----------
r = await call("/api/team", "POST", { name: "Check Setter " + stamp, email: `check-${stamp}@example.com`, password: "check-pass-" + stamp, role: "setter" });
const memberId = r.member?.id || r.id || r.workspace?.members?.find?.((m) => m.email === `check-${stamp}@example.com`)?.id || (await call("/api/state")).workspace?.members?.find((m) => m.email === `check-${stamp}@example.com`)?.id;
ok("team member added", r.status === 200 && memberId, r._text.slice(0, 200));
if (memberId) {
  r = await call("/api/team", "PUT", { id: memberId, name: "Check Setter renamed" });
  ok("team member updated", r.status === 200, r._text.slice(0, 200));
  r = await call(`/api/team?id=${memberId}`, "DELETE");
  ok("team member removed", r.status === 200, r._text.slice(0, 200));
}

// ---------- conversations ----------
const pool = (await call("/api/state")).conversations || [];
const free = (c) => String(c.externalId || "").startsWith("demo_") && !c.labels?.includes("Needs human") && !c.labels?.includes("Do not contact");
const demo = pool.find((c) => free(c) && c.stage === "in_conversation") || pool.find(free);
if (demo) {
  r = await call(`/api/conversations/${demo.id}`);
  ok("conversation opens with messages", r.status === 200 && Array.isArray(r.messages), r.status);
  const note = "check note " + stamp;
  r = await call(`/api/conversations/${demo.id}`, "PATCH", { notes: note });
  ok("notes save", r.status === 200 && (await call(`/api/conversations/${demo.id}`)).conversation?.notes === note);
  const before = (await call(`/api/conversations/${demo.id}`)).messages.length;
  r = await call(`/api/conversations/${demo.id}/simulate`, "POST", { text: "yeah that sounds interesting, tell me more" });
  ok("an incoming test message is stored", r.status === 200 && (await call(`/api/conversations/${demo.id}`)).messages.length === before + 1, r._text.slice(0, 200));
  r = await call(`/api/conversations/${demo.id}/suggest`, "POST");
  const bubbles = r.conversation?.suggestion?.bubbles || r.suggestion?.bubbles || [];
  ok("AI drafts a reply", r.status === 200 && bubbles.length > 0, r._text.slice(0, 300));
  ok(`AI engine in use: ${/no credit|basic draft|demo/i.test(JSON.stringify(r)) ? "basic keyword engine (Claude unavailable)" : "Claude"}`, true);
  r = await call(`/api/conversations/${demo.id}/summary`, "POST");
  ok("conversation summary", r.status === 200, r._text.slice(0, 200));
  if (bubbles.length) {
    r = await call(`/api/conversations/${demo.id}/send`, "POST", { bubbles, sender: "owner" });
    ok("sending a reply records it", r.status === 200 && (await call(`/api/conversations/${demo.id}`)).messages.length >= before + 1 + bubbles.length, r._text.slice(0, 200));
  }
} else ok("a demo conversation exists to test with", false, "none");

// ---------- knowledge ----------
r = await call("/api/knowledge", "POST", { action: "save", item: { question: "Check question " + stamp + "?", answer: "Check answer.", kind: "faq" } });
const kid = r.item?.id || (await call("/api/knowledge")).items?.find?.((i) => i.question?.includes(stamp))?.id || (await call("/api/knowledge")).knowledge?.items?.find?.((i) => i.question?.includes(stamp))?.id;
ok("knowledge answer saved", r.status === 200 && kid, r._text.slice(0, 200));
if (kid) {
  r = await call("/api/knowledge", "POST", { action: "delete", id: kid });
  ok("knowledge answer removed", r.status === 200, r._text.slice(0, 200));
}

// ---------- outreach ----------
r = await call("/api/outreach", "POST", { action: "import", name: "Check list " + stamp, text: "check_handle_one_" + stamp + "\ncheck_handle_two_" + stamp });
const list = (await call("/api/outreach")).lists?.find?.((l) => l.name === "Check list " + stamp) || r.lists?.find?.((l) => l.name === "Check list " + stamp);
ok("outreach list imports two handles", r.status === 200 && list, r._text.slice(0, 200));
r = await call("/api/outreach", "POST", { action: "preview", text: "hey {first_name}" });
ok("outreach preview", r.status === 200, r._text.slice(0, 200));
if (list) {
  r = await call("/api/outreach", "POST", { action: "list.delete", id: list.id });
  ok("outreach list removed", r.status === 200, r._text.slice(0, 200));
}

// ---------- CRM and calendar ----------
r = await call("/api/crm");
ok("CRM settings load", r.status === 200);
r = await call("/api/calendar", "POST", { action: "connect", token: "not-a-real-token-" + stamp });
ok("Calendly rejects a bad token in plain words", r.status >= 400 && /token/i.test(r.error || ""), r._text.slice(0, 200));

// ---------- helper (extension) routes ----------
const auth = `Bearer ${token}`;
r = await call("/api/ext/ping", "GET", undefined, { auth, noCookie: true });
ok("helper link check (ping)", r.status === 200, r._text.slice(0, 150));
r = await call("/api/ext/ping", "GET", undefined, { auth: "Bearer wrong", noCookie: true });
ok("helper with a wrong key is refused", r.status === 401);
// The heartbeat overwrites what the real helper reported, so it is put back straight after.
const realHelper = (await call("/api/connect")).helper;
r = await call("/api/ext/hello", "POST", { version: "check", account: "", outreachOn: false }, { auth, noCookie: true });
ok("helper heartbeat (hello)", r.status === 200, r._text.slice(0, 150));
if (realHelper?.version && realHelper.version !== "check") {
  await call("/api/ext/hello", "POST", { version: realHelper.version, account: realHelper.account, outreachOn: realHelper.outreachOn }, { auth, noCookie: true });
}
const handle = "check_lead_" + stamp;
const thread = { externalId: "check-" + stamp, name: "Check Lead " + stamp, handle };
r = await call("/api/ext/ingest", "POST", { platform: "instagram", thread, messages: [
  { direction: "in", text: "hey, saw your post about booked calls", sentAt: new Date(Date.now() - 120000).toISOString(), order: 0 },
  { direction: "out", text: "hey, what are you working on right now?", sentAt: new Date(Date.now() - 60000).toISOString(), order: 1 },
  { direction: "in", text: "coaching business, about 8k a month, want 20k", sentAt: new Date().toISOString(), order: 2 },
] }, { auth, noCookie: true });
const cid = r.conversationId;
ok("helper reads a thread into the app (ingest)", r.status === 200 && r.added === 3, r._text.slice(0, 200));
r = await call(`/api/ext/conversation?platform=instagram&externalId=${thread.externalId}&handle=${handle}&name=${encodeURIComponent(thread.name)}`, "GET", undefined, { auth, noCookie: true });
ok("helper finds the conversation", r.status === 200, r._text.slice(0, 150));
r = await call("/api/ext/suggest", "POST", { conversationId: cid }, { auth, noCookie: true });
ok("helper gets a drafted reply (Insert reply)", r.status === 200 && r.bubbles?.length > 0, r._text.slice(0, 200));
r = await call("/api/ext/label-queue", "GET", undefined, { auth, noCookie: true });
ok("helper label queue", r.status === 200, r._text.slice(0, 150));
r = await call("/api/ext/outreach/status", "GET", undefined, { auth, noCookie: true });
ok("helper outreach status", r.status === 200, r._text.slice(0, 150));
r = await call("/api/ext/outreach/next", "POST", { account: "" }, { auth, noCookie: true });
ok("helper asks for outreach work (none while off)", r.status === 200 && !r.task, r._text.slice(0, 150));

// ---------- booking hook ----------
r = await call(`/api/hooks/booking?token=${token}`, "POST", { event: "booked", handle });
ok("booking hook marks the lead Booked", r.status === 200 && r.matched && r.stage === "booked", r._text.slice(0, 200));
r = await call(`/api/hooks/booking?token=wrong`, "POST", { event: "booked", handle });
ok("booking hook refuses a wrong key", r.status === 401);

// ---------- Meta webhook ----------
const verify = env.META_VERIFY_TOKEN;
if (verify) {
  const v = await fetch(`${BASE}/api/meta/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verify)}&hub.challenge=check${stamp}`);
  ok("Meta webhook verification answers the challenge", v.status === 200 && (await v.text()) === "check" + stamp);
}
const unsigned = await fetch(`${BASE}/api/meta/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ object: "instagram", entry: [] }) });
ok("Meta webhook refuses an unsigned post", unsigned.status === 401, unsigned.status);

// ---------- jobs that run after the response ----------
if (env.ROUNDTRIP_CRM && cid) {
  const prev = (await call("/api/crm")).crm ?? (await call("/api/state")).workspace?.crm;
  r = await call("/api/workspace", "PUT", { crm: { ...prev, enabled: true, webhookUrl: `${BASE}/api/hooks/booking?token=${token}` } });
  ok("CRM webhook pointed at the app itself", r.status === 200, r._text.slice(0, 200));
  await call(`/api/conversations/${cid}`, "PATCH", { stage: "qualified" });
  let logged = null;
  for (let i = 0; i < 20 && !logged; i++) {
    await sleep(1500);
    const s = await call("/api/state");
    logged = (s.workspace?.crm?.log || []).find((l) => (l.lead || "").includes(thread.name));
  }
  ok("a timed job ran after the response (CRM push 4s later reached its destination)", logged, "no CRM log entry for the check lead");
  await call("/api/workspace", "PUT", { crm: prev });
}

// ---------- two copies, one database ----------
if (env.SECOND) {
  const note = "seen by both " + stamp;
  await call(`/api/conversations/${cid}`, "PATCH", { notes: note });
  const saved = cookie;
  const other = await fetch(`${env.SECOND}/api/conversations/${cid}`, { headers: { cookie: saved } });
  const o = await other.json().catch(() => ({}));
  ok("a second copy sees a change made on the first", o.conversation?.notes === note, JSON.stringify(o).slice(0, 200));
  const note2 = "changed on the second " + stamp;
  await fetch(`${env.SECOND}/api/conversations/${cid}`, { method: "PATCH", headers: { cookie: saved, "content-type": "application/json" }, body: JSON.stringify({ notes: note2 }) });
  await sleep(500);
  const back = await call(`/api/conversations/${cid}`);
  ok("the first copy sees a change made on the second", back.conversation?.notes === note2, back.conversation?.notes);
  // Both copies write different records at the same time: neither change may be lost.
  const [a, b] = [pool[0], pool[1]];
  await Promise.all([
    call(`/api/conversations/${a.id}`, "PATCH", { notes: "parallel A " + stamp }),
    fetch(`${env.SECOND}/api/conversations/${b.id}`, { method: "PATCH", headers: { cookie: saved, "content-type": "application/json" }, body: JSON.stringify({ notes: "parallel B " + stamp }) }),
  ]);
  await sleep(1500);
  const sa = (await call(`/api/conversations/${a.id}`)).conversation?.notes;
  const sb = (await call(`/api/conversations/${b.id}`)).conversation?.notes;
  ok("two copies writing at once lose nothing", sa === "parallel A " + stamp && sb === "parallel B " + stamp, `${sa} | ${sb}`);
}

// ---------- tidy up ----------
if (cid) {
  r = await call(`/api/conversations/${cid}`, "DELETE");
  ok("the check's own test chat is deleted", r.status === 200, r._text.slice(0, 150));
}
r = await call("/api/auth/logout", "POST");
ok("sign out", r.status === 200 || r.status === 204 || r.status === 303 || r.status === 307, r.status);
const after = await call("/api/state");
ok("signed out session no longer reads data", after.status === 401 || after.status === 403 || !env.OWNER_EMAIL, after.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
