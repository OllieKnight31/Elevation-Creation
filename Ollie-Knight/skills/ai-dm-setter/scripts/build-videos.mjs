#!/usr/bin/env node
// Builds the narrated video guides shown on the app's Video guides screen.
//
//   node scripts/build-videos.mjs              all modules
//   node scripts/build-videos.mjs connect inbox   only these
//   node scripts/build-videos.mjs --shots      screenshots only, no voice or video (quick check after a UI change)
//
// Every scene is a real screenshot of the app, running on throwaway demo data, with one part spotlit and a caption
// bar, narrated by an American female voice (Kokoro "Heart" unless SETTER_VOICE names another). Edit scripts/video-modules.mjs and run again. Narration is
// cached by its text, so only reworded lines are voiced again.
// Output: web/public/videos/<id>.mp4, .jpg, .vtt and web/public/videos/index.json (read by the Video guides screen). Needs the app built (npm run serve once).
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MODULES } from "./video-modules.mjs";
import { startCalendly } from "./calendly-standin.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const WEB = path.join(ROOT, "web");
const OUT = path.join(WEB, "public", "videos");
const WORK = path.join(ROOT, ".video-work");
const CACHE = path.join(WORK, "voice");
const KOKORO = path.join(os.homedir(), ".cache", "eod-walkthrough-voice");
const TTS = [path.join(os.homedir(), ".claude/skills/eod-system/template/tools/walkthroughs/kokoro_tts.py"), path.join(os.homedir(), "Jarvis/EOD-system/tools/walkthroughs/kokoro_tts.py")].find((f) => fs.existsSync(f));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VOICE = process.env.SETTER_VOICE || "af_heart", SPEED = process.env.SETTER_VOICE_SPEED || "0.95", W = 1600, H = 900, BAR = 112, PAD = 0.6, PORT = 4488, DEBUG = 9488;
const APP = `http://localhost:${PORT}`;
const SHOTS_ONLY = process.argv.includes("--shots");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args, opts = {}) => { const r = spawnSync(cmd, args, { encoding: "utf8", ...opts }); if (r.status !== 0) throw new Error(`${cmd} failed: ${(r.stderr || "").slice(-400)}`); return r.stdout; };

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

/* ---------- the app, on throwaway data ---------- */

const data = path.join(WORK, "data");
fs.rmSync(data, { recursive: true, force: true });
fs.mkdirSync(data, { recursive: true });
const calendly = startCalendly(PORT + 11);
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: WEB, stdio: "ignore", env: { ...process.env, DATABASE_URL: "", CALENDLY_API_BASE: `http://localhost:${PORT + 11}`, SETTER_DATA_DIR: data, ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "", SETTER_NO_HUMAN_TIMING: "1", SETTER_HOSTED_VIEW: "1", SETTER_OUTREACH_GAP_SCALE: "0" } });
const call = async (p, method = "GET", body, headers = {}) => (await fetch(APP + p, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined })).json();
for (let i = 0; i < 60; i++) { try { await call("/api/me"); break; } catch { await sleep(500); } }
const token = (await call("/api/state")).workspace.apiToken;
// The welcome walkthrough would otherwise pop up over every screenshot.
await call("/api/me", "POST", { action: "welcome-seen" });
/** What a scene's `pre` step can use to put the app in the state it wants to show. */
const ctx = {
  call, token, sleep,
  ext: (p, body) => call(p, "POST", body, { Authorization: `Bearer ${token}` }),
  convs: async () => (await call("/api/state")).conversations,
};

/* ---------- Chrome ---------- */

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "setter-video-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
const stop = () => { try { calendly.close(); } catch {} try { chrome.kill(); } catch {} try { server.kill(); } catch {} spawnSync("pkill", ["-f", `next start -p ${PORT}`]); try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch {} };
process.on("exit", stop);
process.on("SIGINT", () => process.exit(1));
let wsUrl = "";
for (let i = 0; i < 40 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://localhost:${DEBUG}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(300); } }
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let nextId = 1;
const waiting = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); const w = waiting.get(m.id); if (!w) return; waiting.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); };
const cdp = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = nextId++; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
const { targetId } = await cdp("Target.createTarget", { url: "about:blank" });
const { sessionId: S } = await cdp("Target.attachToTarget", { targetId, flatten: true });
await cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false }, S);
await cdp("Page.enable", {}, S);
// The caption bar is drawn in a tab of its own and joined underneath, so it never covers part of the app.
const { targetId: barTarget } = await cdp("Target.createTarget", { url: "about:blank" });
const { sessionId: BS } = await cdp("Target.attachToTarget", { targetId: barTarget, flatten: true });
await cdp("Emulation.setDeviceMetricsOverride", { width: W, height: BAR, deviceScaleFactor: 1, mobile: false }, BS);
await cdp("Page.enable", {}, BS);
const size = (h) => cdp("Emulation.setDeviceMetricsOverride", { width: W, height: h, deviceScaleFactor: 1, mobile: false }, S);
const evalJs = async (expression) => { const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, S); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const goto = async (url) => { await cdp("Page.navigate", { url }, S); for (let i = 0; i < 40; i++) { await sleep(250); if ((await evalJs("document.readyState").catch(() => "")) === "complete") break; } };
const shot = async (file) => fs.writeFileSync(file, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" }, S)).data, "base64"));

/* ---------- what is drawn over the app ---------- */

const LOGO = fs.readFileSync(path.join(WEB, "public", "brand", "logo-lockup-horizontal.svg"), "utf8").replace(/<\?xml[^>]*>/, "").replace(/#0E0E10/gi, "currentColor").trim();
const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">';
const CSS = `#wtspot{position:fixed;z-index:99998;border-radius:14px;box-shadow:0 0 0 9999px rgba(10,10,11,.5);outline:3px solid #0E0E10;pointer-events:none}`;
const BAR_CSS = `*{box-sizing:border-box;margin:0}html,body{width:${W}px;height:${BAR}px;overflow:hidden}
#wtbar{position:fixed;left:0;right:0;bottom:0;height:${BAR}px;z-index:99999;background:#0A0A0B;color:#F5F5F7;display:flex;align-items:center;gap:22px;padding:0 40px;border-top:1px solid #2A2A2E;zoom:1}
#wtbar .n{flex:none;width:52px;height:52px;border-radius:50%;border:1px solid #F5F5F7;display:grid;place-items:center;font-family:'JetBrains Mono',monospace;font-size:18px}
#wtbar .t{flex:1;font-family:Fraunces,Georgia,serif;font-size:32px;line-height:1.2}#wtbar .t em{font-style:italic}
#wtbar .b{flex:none;color:#F5F5F7}#wtbar .b svg{height:36px;width:auto;display:block}
#wtprog{position:fixed;left:0;bottom:0;height:4px;background:#F5F5F7;z-index:100000}`;
// Helpers a scene's `js` and `hl` can use: T finds the smallest element showing some text, click presses it.
const HELPERS = `window.T=(text,sel)=>{let best=null;const want=text.toLowerCase();for(const el of document.querySelectorAll(sel||'body *')){const t=(el.innerText||'').trim();if(!t.toLowerCase().includes(want))continue;const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;if(!best||t.length<(best.innerText||'').trim().length)best=el;}return best;};
window.click=(text,sel)=>{const el=T(text,sel||'button,a,[role=tab],[role=button],label');if(el)el.click();return !!el;};
window.up=(el,sel)=>el&&el.closest(sel);`;

const cardHtml = (sc, frac, mod) => `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>*{box-sizing:border-box;margin:0}html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:#0A0A0B;color:#F5F5F7;font-family:Inter,system-ui,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 130px}
.k{font-family:'JetBrains Mono',monospace;font-size:16px;letter-spacing:.16em;text-transform:uppercase;color:#A8A8B0;margin-bottom:28px}
h1{font-family:Fraunces,Georgia,serif;font-weight:400;font-size:${sc.small ? 60 : 78}px;line-height:1.08;max-width:1250px}h1 em{font-style:italic}
p{font-size:28px;line-height:1.45;color:#A8A8B0;max-width:1040px;margin-top:30px}
ol,ul{padding:0;margin-top:34px;font-size:28px;line-height:1.75;color:#D6D6DC;list-style:none;counter-reset:n}
ol li{counter-increment:n}ol li::before{content:counter(n);display:inline-grid;place-items:center;width:42px;height:42px;border:1px solid #F5F5F7;border-radius:50%;font-family:'JetBrains Mono',monospace;font-size:16px;margin-right:20px;color:#F5F5F7}
ul li::before{content:'';display:inline-block;width:22px;height:1px;background:#F5F5F7;vertical-align:middle;margin-right:18px}
b{color:#F5F5F7;font-weight:500}
.lg{position:absolute;left:130px;top:70px;color:#F5F5F7}.lg svg{height:50px;width:auto;display:block}
.f{position:absolute;left:130px;bottom:56px;font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#73737B}
.pr{position:absolute;left:0;bottom:0;height:4px;background:#F5F5F7;width:${frac}%}</style></head><body>
<div class="lg">${LOGO}</div><div class="k">${sc.k ?? ""}</div><h1>${sc.h1}</h1>${sc.p ? `<p>${sc.p}</p>` : ""}${sc.steps ? `<ol>${sc.steps.map((x) => `<li>${x}</li>`).join("")}</ol>` : ""}${sc.list ? `<ul>${sc.list.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}
<div class="f">Ainable Setter · ${mod.title}</div><div class="pr"></div></body></html>`;

let lastGo = "", onCard = true;
async function capture(mod, sc, i, n, num, png) {
  const frac = Math.round(((i + 1) / n) * 100);
  if (sc.card) {
    const file = path.join(WORK, `${mod.id}-card-${i}.html`);
    fs.writeFileSync(file, cardHtml(sc, frac, mod));
    await size(H);
    await goto("file://" + file);
    await sleep(900);
    onCard = true;
    return shot(png);
  }
  if (sc.pre) await sc.pre(ctx);
  await size(H - BAR);
  // A scene with no page of its own carries on from the last one, also after a title card.
  if (sc.go) lastGo = sc.go;
  if (sc.go || onCard) await goto(APP + lastGo);
  onCard = false;
  await evalJs(`(()=>{const s=document.createElement('style');s.id='wtcss';s.textContent=${JSON.stringify(CSS)};document.getElementById('wtcss')?.remove();document.head.appendChild(s);document.getElementById('wtspot')?.remove();${HELPERS}})()`);
  await sleep(sc.wait ?? 1600);
  if (sc.js) { await evalJs(`(async()=>{${sc.js}})()`); await sleep(sc.after ?? 900); }
  const found = await evalJs(`(()=>{
    const el=${sc.hl ? `(()=>{try{return ${sc.hl}}catch(e){return null}})()` : "null"};
    if(el){el.scrollIntoView({block:'center',inline:'nearest'});}
    return !!el;})()`);
  if (sc.hl && !found) console.log(`   ! ${mod.id} scene ${i + 1}: nothing matched the highlight (${sc.hl.slice(0, 70)})`);
  await sleep(350);
  await evalJs(`(()=>{
    const el=${sc.hl ? `(()=>{try{return ${sc.hl}}catch(e){return null}})()` : "null"};
    if(el){const r=el.getBoundingClientRect(),p=8,top=Math.max(6,r.top-p),bot=Math.min(${H - BAR - 6},r.bottom+p),left=Math.max(6,r.left-p),right=Math.min(${W - 6},r.right+p);
      const d=document.createElement('div');d.id='wtspot';d.style.cssText='left:'+left+'px;top:'+top+'px;width:'+(right-left)+'px;height:'+(bot-top)+'px';document.body.appendChild(d);}
})()`);
  await sleep(250);
  const top = png.replace(/\.png$/, "-app.png"), bar = png.replace(/\.png$/, "-bar.png"), barFile = path.join(WORK, `${mod.id}-bar-${i}.html`);
  await shot(top);
  fs.writeFileSync(barFile, `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BAR_CSS}</style></head><body><div id="wtbar"><div class="n">${num}</div><div class="t">${sc.cap}</div><div class="b">${LOGO}</div></div><div id="wtprog" style="width:${frac}%"></div></body></html>`);
  await cdp("Page.navigate", { url: "file://" + barFile }, BS);
  await sleep(700);
  fs.writeFileSync(bar, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" }, BS)).data, "base64"));
  run("ffmpeg", ["-loglevel", "error", "-y", "-i", top, "-i", bar, "-filter_complex", "vstack", png]);
  fs.rmSync(top); fs.rmSync(bar);
}

/* ---------- voice and video ---------- */

// How words are said, where the spelling would be read wrongly. Captions keep the spelling.
// Written "AI enable": "A I" alone is read as "uh eye". Checked against the voice's phonemes, ay-eye en-able.
// "the A I" is read as "the uh eye" too, so spaced letters are joined before the voice reads them.
const SAY_AS = [[/\bAinable\b/g, "AI enable"], [/\bA I\b/g, "AI"]];
const spoken = (text) => SAY_AS.reduce((t, [re, to]) => t.replace(re, to), text);
const wavFor = (text) => path.join(CACHE, crypto.createHash("sha1").update(VOICE + "|" + SPEED + "|" + spoken(text)).digest("hex") + ".wav");
function voice(lines) {
  const jobs = lines.filter((t) => !fs.existsSync(wavFor(t)));
  if (!jobs.length) return;
  const py = path.join(KOKORO, "venv", "bin", "python");
  if (!fs.existsSync(py) || !TTS) throw new Error("The Kokoro voice is not installed at " + KOKORO);
  run(py, [TTS, path.join(KOKORO, "kokoro-v1.0.onnx"), path.join(KOKORO, "voices-v1.0.bin"), VOICE, SPEED], { input: jobs.map((t) => JSON.stringify({ text: spoken(t), out: wavFor(t) }) + "\n").join("") });
}
const dur = (f) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).trim());
const ts = (x) => `${String(Math.floor(x / 3600)).padStart(2, "0")}:${String(Math.floor((x % 3600) / 60)).padStart(2, "0")}:${(x % 60).toFixed(3).padStart(6, "0")}`;
// Narration spells some words out so they are said right; captions show them as normally written.
const caption = (text) => text.replace(/\bA I\b/g, "AI").replace(/\bC R M\b/g, "CRM").replace(/\bI D\b/g, "ID");
const plain = (html) => html.replace(/<[^>]+>/g, "");

const manifestFile = path.join(OUT, "index.json");
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")) : [];

try {
  for (const mod of MODULES) {
    if (only.length && !only.includes(mod.id)) continue;
    console.log(`\n${mod.id}: ${mod.title}`);
    const n = mod.scenes.length;
    if (!SHOTS_ONLY) voice(mod.scenes.map((s) => s.say));
    const parts = [], vtt = ["WEBVTT", ""], chapters = [];
    let t = 0, num = 0;
    for (let i = 0; i < n; i++) {
      const sc = mod.scenes[i];
      const png = path.join(WORK, `${mod.id}-${String(i).padStart(2, "0")}.png`);
      if (!sc.card) num++;
      await capture(mod, sc, i, n, num, png);
      if (SHOTS_ONLY) continue;
      const d = dur(wavFor(sc.say)) + PAD;
      const seg = path.join(WORK, `${mod.id}-${String(i).padStart(2, "0")}.mp4`);
      run("ffmpeg", ["-loglevel", "error", "-y", "-loop", "1", "-framerate", "25", "-i", png, "-i", wavFor(sc.say), "-t", d.toFixed(3), "-vf", `scale=${W}:${H},format=yuv420p`, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", "25", "-af", "apad", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", seg]);
      parts.push(seg);
      vtt.push(`${ts(t)} --> ${ts(t + d - 0.15)}`, caption(sc.say), "");
      chapters.push({ at: Math.round(t * 10) / 10, title: plain(sc.card ? sc.h1 : sc.cap) });
      t += d;
      process.stdout.write(`   scene ${i + 1}/${n} ${d.toFixed(1)}s\n`);
    }
    if (SHOTS_ONLY) {
      run("ffmpeg", ["-loglevel", "error", "-y", "-pattern_type", "glob", "-i", path.join(WORK, `${mod.id}-*.png`), "-vf", `scale=800:-1,tile=3x${Math.ceil(n / 3)}`, "-frames:v", "1", path.join(WORK, `${mod.id}-sheet.jpg`)]);
      continue;
    }
    const list = path.join(WORK, `${mod.id}-list.txt`);
    fs.writeFileSync(list, parts.map((p) => `file '${p}'\n`).join(""));
    run("ffmpeg", ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", path.join(OUT, `${mod.id}.mp4`)]);
    run("ffmpeg", ["-loglevel", "error", "-y", "-i", path.join(WORK, `${mod.id}-00.png`), "-q:v", "3", path.join(OUT, `${mod.id}.jpg`)]);
    fs.writeFileSync(path.join(OUT, `${mod.id}.vtt`), vtt.join("\n"));
    const entry = { id: mod.id, title: mod.title, summary: mod.summary, group: mod.group, screen: mod.screen ?? "", seconds: Math.round(t), chapters, builtAt: new Date().toISOString().slice(0, 10) };
    const at = manifest.findIndex((m) => m.id === mod.id);
    if (at >= 0) manifest[at] = entry; else manifest.push(entry);
    console.log(`   done, ${Math.round(t)} seconds`);
  }
  if (!SHOTS_ONLY) {
    const order = MODULES.map((m) => m.id);
    fs.writeFileSync(manifestFile, JSON.stringify(manifest.filter((m) => order.includes(m.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)), null, 2) + "\n");
  }
} finally {
  ws.close();
  stop();
}
process.exit(0);
