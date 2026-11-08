// Self linking, end to end: real Google Chrome + the real extension + the app, against the local Instagram stand-in.
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
let r;
const events = async () => (await fetch(IG + "/__events")).json();

const token = (await call("/api/state")).workspace.apiToken;

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

// The helper has just been added. Nothing is typed anywhere from here on: no address, no token.
const connect = async () => call("/api/connect");
const until = async (fn, sec) => { const t0 = Date.now(); while (Date.now() - t0 < sec * 1000) { const v = await fn(); if (v) return v; await sleep(1500); } return null; };
const targets = async () => (await cdp("Target.getTargets")).targetInfos;
let opened = await until(async () => (await targets()).find((t) => t.type === "page" && t.url.startsWith(APP + "/connect")), 20);
ok("adding the helper opens the app's Get connected page by itself", Boolean(opened), JSON.stringify((await targets()).map((t) => t.url)));
if (!opened) { const t = await cdp("Target.createTarget", { url: APP + "/connect" }); opened = { targetId: t.targetId }; }
ok("helper links itself to the app with nothing typed", Boolean(await until(async () => (await connect()).helper.connected, 40)), JSON.stringify((await connect()).helper));
const stored = await sw(`chrome.storage.local.get("settings").then((d) => JSON.stringify(d.settings || {}))`).then(JSON.parse);
ok("helper holds this app's address and key", stored.baseUrl === APP && stored.token === token, JSON.stringify({ baseUrl: stored.baseUrl, token: Boolean(stored.token) }));

// Instagram (the stand-in) opened in a tab, as a person would to sign in.
await cdp("Target.createTarget", { url: IG.replace("localhost:8443", "www.instagram.com") + "/" });
ok("signed in Instagram account is picked up from the open tab", Boolean(await until(async () => (await connect()).helper.account === "owner.acct", 60)), JSON.stringify((await connect()).helper));
ok("outreach is tied to that account without typing it", (await connect()).outreach.account === "owner.acct");

// Test message from the Get connected screen, with campaigns and outreach switched off in the app.
ok("outreach is off in the app", (await connect()).outreach.enabled === false);
r = await call("/api/connect", "POST", { action: "test", handle: "@Lead.One", text: "hey, quick test from my new setup. no need to reply", mode: "auto" });
ok("test message queued", r.tests?.[0]?.status === "queued" && r.tests[0].handle === "lead.one", JSON.stringify(r));
r = await call("/api/connect", "POST", { action: "test", handle: "lead.two", text: "x", mode: "auto" });
ok("a second test is refused while one is on its way", /already on its way/.test(r.error || ""), JSON.stringify(r));
const page = (await cdp("Target.attachToTarget", { targetId: opened.targetId, flatten: true })).sessionId;
await cdp("Runtime.evaluate", { expression: `window.postMessage({ source: "ainable-app", type: "outreach", enabled: true }, location.origin)` }, page);
ok("the page can switch sending on in the helper", Boolean(await until(async () => (await sw(`chrome.storage.local.get("outreach").then((d) => d.outreach && d.outreach.enabled === true)`)), 15)));
const tick = () => sw(`Promise.resolve(Outreach.onAlarm({ name: "aidm-outreach" })).then(() => true)`).catch(() => {});
const sent = await until(async () => { await tick(); const t = (await connect()).tests[0]; return t.status === "sent" || t.status === "failed" ? t : null; }, 240);
ok("test message reported as sent", sent?.status === "sent", JSON.stringify(sent));
const ev = (await events()).filter((e) => e.kind === "sent");
ok("Instagram stand-in received exactly the test text", ev.length === 1 && ev[0].handle === "lead.one" && ev[0].text === "hey, quick test from my new setup. no need to reply", JSON.stringify(ev));
r = await call("/api/ext/outreach/next", "POST", { account: "owner.acct" }, { Authorization: `Bearer ${token}` });
ok("with the test done and outreach off, nothing else is handed out", r.task === null && /switched off/.test(r.reason), JSON.stringify(r));
r = await (await fetch(APP + "/api/ext/hello", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer wrong" }, body: "{}" })).json();
ok("heartbeat needs the key", /Bad token/.test(r.error || ""));
done();
