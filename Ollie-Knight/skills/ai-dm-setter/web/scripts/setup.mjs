#!/usr/bin/env node
// Guided setup in the terminal. Asks a few questions, writes .env.local, can create the Supabase tables,
// and prepares the owner's login. Everything here can also be done later in the app under Settings.
//   npm run setup          ask everything
//   npm run setup -- --auto   only on a fresh copy with a real terminal (this is what npm install runs)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { randomBytes, scryptSync } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV = process.env.SETTER_ENV_FILE || path.join(WEB, ".env.local");
const DATA = process.env.SETTER_DATA_DIR || path.join(WEB, "..", ".data");
const auto = process.argv.includes("--auto");
const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY);

if (auto && (!tty || process.env.CI || fs.existsSync(ENV))) {
  if (!fs.existsSync(ENV)) console.log("\nAinable Setter: run `npm run setup` to configure it (database, keys, your login). Or just `npm run serve` to try it with demo data.\n");
  process.exit(0);
}

const bold = (s) => (tty ? `\x1b[1m${s}\x1b[0m` : s);
const dim = (s) => (tty ? `\x1b[2m${s}\x1b[0m` : s);
const ok = (s) => console.log((tty ? "\x1b[32m✓\x1b[0m " : "OK: ") + s);
const warn = (s) => console.log((tty ? "\x1b[33m!\x1b[0m " : "NOTE: ") + s);

// One line reader for both a real terminal and piped answers (used by the tests).
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: tty });
const queue = [];
const waiting = [];
let closed = false;
rl.on("line", (l) => (waiting.length ? waiting.shift()(l) : queue.push(l)));
rl.on("close", () => { closed = true; waiting.splice(0).forEach((w) => w("")); });
let muted = false;
if (tty) {
  const write = rl._writeToOutput.bind(rl);
  rl._writeToOutput = (s) => { if (!muted || s.includes("\n")) write(s); };
}
function ask(question, { fallback = "", secret = false } = {}) {
  return new Promise((resolve) => {
    process.stdout.write(`${question}${fallback ? dim(` [${fallback}]`) : ""}: `);
    muted = secret && tty;
    const done = (l) => { if (muted) process.stdout.write("\n"); muted = false; resolve(l.trim() || fallback); };
    if (queue.length) done(queue.shift());
    else if (closed) done("");
    else waiting.push(done);
  });
}
const yes = async (q, def = true) => /^y/i.test(await ask(`${q} (y/n)`, { fallback: def ? "y" : "n" }));

function readEnv() {
  const out = {};
  if (fs.existsSync(ENV)) for (const line of fs.readFileSync(ENV, "utf8").split("\n")) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) out[m[1]] = m[2]; }
  return out;
}

async function supabase(url, key) {
  const missing = [];
  for (const t of ["setter_workspaces", "setter_leads", "setter_messages", "setter_events"]) {
    let res;
    try { res = await fetch(`${url}/rest/v1/${t}?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) }); }
    catch (e) { return { ok: false, error: `Could not reach ${url} (${e.message}).` }; }
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Supabase rejected the key. Use the service role (secret) key, not the anon key." };
    if (!res.ok) missing.push(t);
  }
  return { ok: missing.length === 0, missing };
}

async function main() {
  console.log(`\n${bold("Ainable Setter setup")}\n${dim("Press Enter to accept the value in brackets or to skip a question. Nothing is sent anywhere except the checks you ask for.")}\n`);
  const env = readEnv();
  const pending = {};

  console.log(bold("1. Your business"));
  pending.businessName = await ask("Business name");
  pending.ownerName = await ask("Your first name (the AI writes in your voice)");

  console.log(`\n${bold("2. Where to keep the data")}\n  1  This computer ${dim("(one file, nothing to set up)")}\n  2  Supabase ${dim("(a real database you can query and back up)")}`);
  const useSupabase = (await ask("Choose 1 or 2", { fallback: env.SUPABASE_URL ? "2" : "1" })) === "2";
  if (useSupabase) {
    env.SUPABASE_URL = (await ask("Supabase project URL", { fallback: env.SUPABASE_URL || "" })).replace(/\/+$/, "");
    env.SUPABASE_SERVICE_KEY = await ask("Service role key (Project Settings, API)", { secret: true, fallback: env.SUPABASE_SERVICE_KEY || "" });
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      let check = await supabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      if (check.error) warn(check.error + " You can fix this later in Settings, Database and setup.");
      else if (check.ok) ok("Supabase is reachable and the tables exist.");
      else {
        const sql = fs.readFileSync(path.join(WEB, "supabase", "schema.sql"), "utf8");
        const ref = new URL(env.SUPABASE_URL).hostname.split(".")[0];
        console.log(`The tables are not there yet (${check.missing.length} to create).`);
        const token = await ask("Supabase access token to create them now (supabase.com/dashboard/account/tokens), or Enter to do it by hand", { secret: true });
        if (token) {
          const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }) }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
          if (!res.ok) warn(`Could not create the tables (${res.status}: ${(await res.text()).slice(0, 120)}).`);
        } else {
          const editor = `https://supabase.com/dashboard/project/${ref}/sql/new`;
          console.log(`\n  Open ${editor}\n  Paste the contents of ${path.join(WEB, "supabase", "schema.sql")} and press Run.`);
          if (process.platform === "darwin" && (await yes("Copy the SQL to the clipboard and open the editor in Chrome?"))) {
            spawnSync("pbcopy", { input: sql });
            spawnSync("open", ["-a", "Google Chrome", editor]);
          }
          await ask("Press Enter when you have run it");
        }
        check = await supabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
        if (check.ok) ok("Tables created.");
        else warn("The tables are still missing. The app will start on local storage and say so; finish this in Settings, Database and setup.");
      }
    } else warn("URL or key left blank, staying on local storage.");
  } else { delete env.SUPABASE_URL; delete env.SUPABASE_SERVICE_KEY; }

  console.log(`\n${bold("3. Claude")} ${dim("(replies, tagging, summaries). Without a key the app runs a labelled demo engine.")}`);
  env.ANTHROPIC_API_KEY = await ask("Anthropic API key", { secret: true, fallback: env.ANTHROPIC_API_KEY || "" });
  if (env.ANTHROPIC_API_KEY && !env.ANTHROPIC_API_KEY.startsWith("sk-ant-")) warn("That does not look like an Anthropic key (they start with sk-ant-). Saved anyway.");

  console.log(`\n${bold("4. Meta app")} ${dim("(optional now). Needed for the Instagram login screen and live webhooks. A single account can also connect later by pasting a token in Settings.")}`);
  env.META_APP_ID = await ask("Meta app ID", { fallback: env.META_APP_ID || "" });
  if (env.META_APP_ID) {
    env.META_APP_SECRET = await ask("Meta app secret", { secret: true, fallback: env.META_APP_SECRET || "" });
    env.META_VERIFY_TOKEN = await ask("Webhook verify token", { fallback: env.META_VERIFY_TOKEN && env.META_VERIFY_TOKEN !== "choose-any-string" ? env.META_VERIFY_TOKEN : randomBytes(12).toString("hex") });
  }
  env.APP_BASE_URL = (await ask("Public https address of this app, if it has one", { fallback: env.APP_BASE_URL || "" })).replace(/\/+$/, "");
  env.META_GRAPH_VERSION ||= "v25.0";

  console.log(`\n${bold("5. Your login")} ${dim("(optional). Creating one switches sign in on. Team members are added in Settings, Team.")}`);
  const email = (await ask("Your email")).toLowerCase();
  if (email) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) warn("That is not an email address, so no login was created. Add it in Settings, Team.");
    else {
      const password = await ask("Choose a password (8 characters or more)", { secret: true });
      if (password.length < 8) warn("Too short, so no login was created. Add it in Settings, Team.");
      else {
        const salt = randomBytes(16);
        pending.owner = { name: pending.ownerName || email.split("@")[0], email, passwordHash: `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}` };
        ok(`Login prepared for ${email}.`);
      }
    }
  }

  console.log(`\n${bold("6. CRM")} ${dim("(optional). A webhook URL from GoHighLevel, Zapier, Make or n8n. Every lead update is posted to it.")}`);
  const hook = await ask("CRM webhook URL");
  if (hook) { if (/^https?:\/\//.test(hook)) pending.crmWebhook = hook; else warn("That is not a URL. Add it in Settings, CRM."); }

  const port = (await ask(`\n${bold("7. Port")} to run on`, { fallback: env.PORT || "3000" })).replace(/\D/g, "") || "3000";
  env.PORT = port;

  const lines = ["# Written by `npm run setup`. Safe to edit by hand. Never commit this file."];
  for (const [k, v] of Object.entries(env)) if (v) lines.push(`${k}=${v}`);
  fs.writeFileSync(ENV, lines.join("\n") + "\n", { mode: 0o600 });
  ok(`Saved ${path.relative(process.cwd(), ENV) || ".env.local"}`);
  if (pending.owner || pending.businessName || pending.ownerName || pending.crmWebhook) {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(path.join(DATA, "setup.json"), JSON.stringify(pending), { mode: 0o600 });
    ok("Your answers are applied the next time the app starts.");
  }

  console.log(`\n${bold("Done.")} Start it with ${bold("npm run serve")} and open http://localhost:${port}`);
  console.log(dim("Then: fill in the business brief, connect Instagram under Settings, Connections, and load your history.\n"));
  const start = !auto && tty && (await yes("Build and start it now?", true));
  rl.close();
  if (start) spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "serve"], { cwd: WEB, stdio: "inherit" });
}

main().catch((e) => { console.error("\nSetup stopped: " + e.message); rl.close(); process.exit(1); });
