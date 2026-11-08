// A local stand-in for instagram.com, served over HTTPS so the extension's host permission applies.
// It is my own guess at the page shape, written separately from the extension's fixture.
import https from "node:https";
import fs from "node:fs";
const events = [];
const page = (handle) => `<!doctype html><html><head><meta charset="utf-8"><title>${handle} • Instagram</title></head><body>
<nav><a href="/owner.acct/" role="link"><img alt="owner.acct's profile picture">Profile</a></nav>
<main role="main"><div id="root"></div></main>
<script>
const handle = ${JSON.stringify(handle)};
const root = document.getElementById("root");
const log = (kind, extra) => fetch("/__event", { method: "POST", body: JSON.stringify({ handle, kind, ...extra }) });
let inputs = 0, deletes = 0, trusted = 0;
function profile() {
  if (handle === "missing.user") { root.innerHTML = "<h2>Sorry, this page isn't available.</h2><p>The link you followed may be broken, or the page may have been removed.</p>"; return; }
  root.innerHTML = '<header><section><h2>' + handle + '</h2><div role="button" tabindex="0">Follow</div><div role="button" tabindex="0" id="m">Message</div></section></header><article>posts</article>';
  if (handle === "blocked.user") setTimeout(() => { const d = document.createElement("div"); d.setAttribute("role", "dialog"); d.innerHTML = "<h3>Try Again Later</h3><p>We restrict certain activity to protect our community.</p><button>OK</button>"; document.body.appendChild(d); }, 1500);
  document.getElementById("m").addEventListener("click", () => setTimeout(thread, 700));
}
function thread() {
  history.pushState({}, "", "/direct/t/1234567890/");
  root.innerHTML = '<div><header><a href="/' + handle + '/" role="link"><h2>' + handle + '</h2></a></header><div role="grid" aria-label="Messages in conversation with ' + handle + '" id="grid"></div><div role="textbox" contenteditable="true" aria-label="Message..." aria-describedby="x" id="c" style="min-height:30px;border:1px solid #999;white-space:pre-wrap"></div></div>';
  const c = document.getElementById("c"), grid = document.getElementById("grid");
  c.addEventListener("beforeinput", (e) => { inputs++; if (e.isTrusted) trusted++; if (/^delete/.test(e.inputType)) deletes++; });
  const send = () => {
    const text = c.innerText.replace(/\\n$/, "");
    if (!text.trim()) return;
    const row = document.createElement("div"); row.setAttribute("role", "row");
    row.innerHTML = '<div dir="auto"></div>'; row.firstChild.textContent = text;
    grid.appendChild(row); c.textContent = "";
    log("sent", { text, inputs, deletes, trusted });
  };
  c.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  // Like the real page, the Send control only exists while the box holds text.
  new MutationObserver(() => {
    const has = c.innerText.trim().length > 0, b = document.getElementById("s");
    if (has && !b) { const s = document.createElement("div"); s.id = "s"; s.setAttribute("role", "button"); s.textContent = "Send"; s.addEventListener("click", send); c.after(s); }
    if (!has && b) b.remove();
  }).observe(c, { childList: true, characterData: true, subtree: true });
}
profile();
log("load", {});
</script></body></html>`;
https.createServer({ key: fs.readFileSync(new URL("./key.pem", import.meta.url)), cert: fs.readFileSync(new URL("./cert.pem", import.meta.url)) }, (req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.url === "/__event") { events.push({ ...JSON.parse(body), at: Date.now() }); return res.end("{}"); }
    if (req.url === "/__events") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify(events)); }
    const handle = decodeURIComponent(req.url.split("?")[0].split("/")[1] || "home");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(page(handle));
  });
}).listen(8443, () => console.log("fake instagram on 8443"));
