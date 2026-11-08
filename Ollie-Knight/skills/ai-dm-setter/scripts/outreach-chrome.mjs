#!/usr/bin/env node
// Opens the dedicated Google Chrome profile used for outreach, with the extension loaded and pointed at the app.
// Sign in to Instagram in the window that opens. The profile lives in .chrome-outreach and is only ever used for this.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE = path.join(ROOT, ".chrome-outreach");
const EXT = path.join(ROOT, "extension");
const envFile = path.join(ROOT, "web", ".env.local");
const port = process.env.PORT || (fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8").match(/^PORT=(\d+)/m)?.[1] : "") || "3000";
const APP = process.env.APP_BASE_URL || `http://localhost:${port}`;
const url = process.argv.find((a) => a.startsWith("http")) || "https://www.instagram.com/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(CHROME)) { console.error("Google Chrome is not installed in /Applications."); process.exit(1); }
const dbFile = [process.env.SETTER_DATA_DIR, path.join(ROOT, ".data"), path.join(ROOT, "web", ".data")].filter(Boolean).map((d) => path.join(d, "db.json")).find((f) => fs.existsSync(f));
if (!dbFile) { console.error("The app has no data yet. Start it once with npm run serve, then run this again."); process.exit(1); }
const token = JSON.parse(fs.readFileSync(dbFile, "utf8")).workspace.apiToken;

// Chrome only accepts an unpacked extension from the command line through its debugging pipe, and it stays
// loaded only while that pipe is open. So this script starts Chrome, loads the extension, and stays running
// until the window is closed. (Loading it by hand at chrome://extensions, Load unpacked, makes it permanent.)
const extra = process.argv.filter((a) => a.startsWith("--"));
const chrome = spawn(CHROME, [`--user-data-dir=${PROFILE}`, "--remote-debugging-pipe", "--enable-unsafe-extension-debugging", "--no-first-run", "--no-default-browser-check", ...extra, url], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
let buf = "", next = 1;
const waiting = new Map();
chrome.stdio[4].on("data", (d) => {
  buf += d.toString();
  for (let i; (i = buf.indexOf("\0")) >= 0; ) {
    const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    const w = waiting.get(m.id);
    if (w) { waiting.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); }
  }
});
const cdp = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = next++; waiting.set(id, { res, rej }); chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + "\0"); setTimeout(() => waiting.delete(id) && rej(new Error("No answer from Chrome to " + method)), 30000); });
chrome.on("exit", () => process.exit(0));

try {
  const { id } = await cdp("Extensions.loadUnpacked", { path: EXT });
  let session;
  for (let i = 0; i < 40 && !session; i++) {
    const { targetInfos } = await cdp("Target.getTargets");
    const sw = targetInfos.find((t) => t.type === "service_worker" && t.url.includes(id));
    if (sw) session = (await cdp("Target.attachToTarget", { targetId: sw.targetId, flatten: true })).sessionId;
    else await sleep(500);
  }
  if (!session) throw new Error("The extension did not start.");
  const expression = `chrome.storage.local.get("settings").then((d) => chrome.storage.local.set({ settings: { ...(d.settings || {}), baseUrl: ${JSON.stringify(APP)}, token: ${JSON.stringify(token)} } })).then(() => true)`;
  const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, session);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  await cdp("Target.detachFromTarget", { sessionId: session }).catch(() => {});
  fs.writeFileSync(path.join(PROFILE, ".setter-extension"), JSON.stringify({ id, app: APP, at: new Date().toISOString() }));
  console.log(`Outreach Chrome is open with the extension loaded and pointed at ${APP}.`);
  console.log("Sign in to Instagram there, then switch on Outreach sending in the extension popup. Leave this running; it ends when you close that window.");
} catch (e) {
  console.error("Could not load the extension:", e.message);
  chrome.kill();
  process.exit(1);
}
