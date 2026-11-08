// End to end: real Google Chrome + the real extension + the app, against the local Instagram stand-in.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { spawn } from "node:child_process";
import fs from "node:fs";
const APP = "http://localhost:3000", IG = "https://localhost:8443";
const EXT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const PROFILE = new URL("./profile", import.meta.url).pathname;
const HEADED = process.argv.includes("--headed");
fs.rmSync(PROFILE, { recursive: true, force: true });
let pass = 0, failN = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : failN++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + extra}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (path, method = "GET", body, headers = {}) => (await fetch(APP + path, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined })).json();
const o = (b) => call("/api/outreach", "POST", b);
const events = async () => (await fetch(IG + "/__events")).json();

// --- app setup
const token = (await call("/api/state")).workspace.apiToken;
let r = await o({ action: "import", name: "E2E", text: "username,name,city\nlead.one,Maya Thompson,Leeds\nmissing.user,Gone Person,York\nlead.two,ACME FITNESS LTD,Hull\nlead.three,Sam Lee,Bath\nblocked.user,Blocked Person,Derby" });
const variants = ["hey {first_name|there}, saw you're building something in {city}. quick question, are you taking on new clients right now? 🙌", "hi {first_name|there}! loved your recent posts, do you run everything yourself or with a team?", "{first_name|hey}, random one but how are you finding client enquiries in {city} lately?", "morning {first_name|there}, came across @{username} and had to ask, what's the main thing you're working on this quarter?", "yo {first_name|there}, been following for a bit. are you open to a quick idea for {city}? https://example.com/idea"].map((text) => ({ text }));
await o({ action: "campaign.save", campaign: { name: "E2E", listIds: [r.listId], variants, status: "active" } });
await o({ action: "settings", settings: { enabled: true, mode: "auto", hourStart: 0, hourEnd: 24, ramp: false, dailyMin: 40, dailyMax: 40 } });

// --- chrome over the debugging pipe
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  ...(HEADED ? [] : ["--headless=new"]), `--user-data-dir=${PROFILE}`, "--remote-debugging-pipe", "--enable-unsafe-extension-debugging", "--no-first-run", "--no-default-browser-check",
  "--host-resolver-rules=MAP www.instagram.com 127.0.0.1:8443", "--ignore-certificate-errors", "about:blank",
], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
let buf = "", nextId = 1;
const waiting = new Map();
chrome.stdio[4].on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\0")) >= 0) {
    const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); }
  }
});
const cdp = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = nextId++; waiting.set(id, { res, rej }); chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + "\0"); setTimeout(() => waiting.has(id) && (waiting.delete(id), rej(new Error("timeout " + method))), 30000); });
const done = (code) => { try { chrome.kill(); } catch {} console.log(`\n${pass} passed, ${failN} failed`); process.exit(code ?? (failN ? 1 : 0)); };
process.on("unhandledRejection", (e) => { console.log("FATAL", e.message); done(2); });

const loaded = await cdp("Extensions.loadUnpacked", { path: EXT });
ok("extension loads in real Google Chrome", Boolean(loaded.id), JSON.stringify(loaded));
const extId = loaded.id;
const swSession = async () => {
  for (let i = 0; i < 40; i++) {
    const { targetInfos } = await cdp("Target.getTargets");
    const sw = targetInfos.find((t) => t.type === "service_worker" && t.url.includes(extId));
    if (sw) return (await cdp("Target.attachToTarget", { targetId: sw.targetId, flatten: true })).sessionId;
    // An idle worker is woken by opening one of the extension's own pages.
    if (i === 3) await cdp("Target.createTarget", { url: `chrome-extension://${extId}/popup/popup.html` });
    await sleep(500);
  }
  throw new Error("service worker never appeared");
};
const sw = async (expression) => {
  const s = await swSession();
  const res = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, s);
  if (res.exceptionDetails) throw new Error("SW: " + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
  return res.result.value;
};
await sw(`chrome.storage.local.set({ settings: { baseUrl: "${APP}", token: "${token}" } }).then(() => true)`);
ok("extension reaches the app with the workspace token", (await sw(`outreachApi("outreachStatus").then((s) => s.enabled)`)) === true);
await sw(`Outreach.setEnabled(true).then(() => true)`);
const tick = () => sw(`Promise.resolve(Outreach.onAlarm({ name: "aidm-outreach" })).then(() => true)`).catch((e) => console.log("tick:", e.message));
const logLen = async () => (await call("/api/outreach")).log.length;
const waitLog = async (n, maxSec) => {
  const t0 = Date.now();
  while (Date.now() - t0 < maxSec * 1000) {
    if ((await logLen()) >= n) return true;
    await tick();
    await sleep(3000);
  }
  return false;
};
const st = async () => sw(`Outreach.status().then((s) => JSON.stringify(s))`).then(JSON.parse).catch(() => ({}));

// 1. normal send
ok("message 1 completes", await waitLog(1, 240), JSON.stringify(await st()).slice(0, 600));
let v = await call("/api/outreach");
let l = v.log[0] ?? {};
ok("message 1 reported as sent", l.status === "sent" && l.handle === "lead.one", JSON.stringify(l));
let rows = (await call(`/api/outreach?list=${v.lists[0].id}`)).rows;
let ev = (await events()).filter((e) => e.kind === "sent");
ok("Instagram stand-in received exactly the planned text", ev.length === 1 && ev[0].text === rows[0].text, JSON.stringify({ got: ev[0]?.text, want: rows[0].text }));
ok("first name was filled", /Maya/.test(rows[0].text), rows[0].text);
ok("typing took a human amount of time", l.typedMs > 8000 && l.typedMs < 150000, String(l.typedMs));
console.log(`      typed in ${Math.round(l.typedMs / 1000)}s, ${l.typos} slips fixed, ${ev[0]?.inputs} key inputs of which ${ev[0]?.deletes} were backspaces, for ${rows[0].text.length} characters`);
ok("more key inputs than characters, with backspaces", ev[0] && ev[0].inputs >= [...rows[0].text].length && (l.typos === 0 || ev[0].deletes > 0), JSON.stringify(ev[0]));

// 2. profile that does not exist
ok("message 2 completes", await waitLog(2, 120), JSON.stringify(await st()).slice(0, 600));
v = await call("/api/outreach"); l = v.log[0] ?? {};
ok("missing profile reported as not found", l.status === "not_found" && l.handle === "missing.user", JSON.stringify(l));

// 3. business name, no first name
ok("message 3 completes", await waitLog(3, 240), JSON.stringify(await st()).slice(0, 600));
v = await call("/api/outreach"); l = v.log[0] ?? {};
rows = (await call(`/api/outreach?list=${v.lists[0].id}`)).rows;
ev = (await events()).filter((e) => e.kind === "sent");
ok("message 3 sent with the fallback greeting", l.status === "sent" && ev.length === 2 && ev[1].text === rows[2].text && !/ACME|Acme|acme/.test(rows[2].text), JSON.stringify({ l, got: ev[1]?.text, want: rows[2].text }));
ok("a different version was used", rows[0].variantId !== rows[2].variantId);

// 4. assisted mode
await o({ action: "settings", settings: { mode: "assisted" } });
ok("message 4 completes", await waitLog(4, 240), JSON.stringify(await st()).slice(0, 600));
v = await call("/api/outreach"); l = v.log[0] ?? {};
ev = (await events()).filter((e) => e.kind === "sent");
ok("assisted mode types but does not send", l.status === "typed" && ev.length === 2, JSON.stringify({ l, sent: ev.length }));
const { targetInfos } = await cdp("Target.getTargets");
const tab = targetInfos.find((t) => t.type === "page" && t.url.includes("instagram.com"));
ok("one outreach tab exists", targetInfos.filter((t) => t.type === "page" && t.url.includes("instagram.com")).length === 1, targetInfos.map((t) => t.type + " " + t.url).join(" | "));
const ps = (await cdp("Target.attachToTarget", { targetId: tab.targetId, flatten: true })).sessionId;
rows = (await call(`/api/outreach?list=${v.lists[0].id}`)).rows;
const boxed = (await cdp("Runtime.evaluate", { expression: `document.getElementById("c").innerText`, returnByValue: true }, ps)).result.value;
ok("the typed text is waiting in the box", boxed.trim() === rows[3].text, JSON.stringify({ boxed, want: rows[3].text }));
await tick(); await sleep(2000); await tick();
ok("no new task while the typed text is still in the box", (await logLen()) === 4);
await cdp("Runtime.evaluate", { expression: `document.getElementById("s").click()` }, ps);   // the person presses send

// 5. Instagram warning
await o({ action: "settings", settings: { mode: "auto" } });
ok("message 5 completes", await waitLog(5, 240), JSON.stringify(await st()).slice(0, 600));
v = await call("/api/outreach"); l = v.log[0] ?? {};
ok("warning reported as blocked", l.status === "blocked" && l.handle === "blocked.user", JSON.stringify(l));
ok("app paused sending", v.status.paused === true && /warning/.test(v.status.pauseReason), v.status.pauseReason);
ev = (await events()).filter((e) => e.kind === "sent");
ok("nothing was sent to the blocked profile", ev.length === 3 && !ev.some((e) => e.handle === "blocked.user"), JSON.stringify(ev.map((e) => e.handle)));
const s5 = await st();
ok("extension switched itself off after the warning", s5.enabled === false || s5.local?.enabled === false || /off/i.test(JSON.stringify(s5)), JSON.stringify(s5).slice(0, 300));
console.log("\nfinal extension status:", JSON.stringify(s5).slice(0, 500));
done();
