import { normaliseOutreach } from "./outreach";
import { normaliseKnowledge } from "./knowledge";
import { normaliseCalendar } from "./calendar";
import { normaliseSheets } from "./sheets";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { Db, Workspace } from "./types";
import { buildSeed, DEMO_MEMBERS } from "./seed";
import { DATA_DIR, savedConfig, setSavedConfig } from "./config";
import { hostedConfigured, hostedFlush, hostedLoad, hostedRefresh, hostedSave, hostedStatus, hostedVersion } from "./hosted";
import { DEFAULT_SHORTCUTS } from "./shortcuts";
import { checkSupabase, forgetPushed, loadFromSupabase, pushToSupabase, supabaseConfigured } from "./supabase";

// Storage has three modes behind one small interface.
// Hosted: on Vercel with a Postgres database (DATABASE_URL), see hosted.ts. No file is written.
// File: one JSON file on local disk, the default, nothing to set up.
// Supabase: the same working copy is kept in memory and every change is mirrored into Supabase tables,
// which are read back on start. The local file stays as a cache either way.
// The file lives outside the Next.js project folder on purpose: the dev server watches the project,
// so writing here on every message made it recompile and reload the page in a loop.
const FILE = path.join(DATA_DIR, "db.json");

export interface StoreStatus {
  mode: "file" | "supabase" | "postgres";
  ready: boolean;
  lastPushAt: string;
  pending: boolean;
  error: string;
  written: number;
}

const g = globalThis as unknown as { __setterDb?: Db; __setterStore?: StoreStatus; __setterFlush?: { timer?: ReturnType<typeof setTimeout>; running: boolean; dirty: boolean } };
const status = () => (g.__setterStore ??= { mode: "file", ready: true, lastPushAt: "", pending: false, error: "", written: 0 });
const flush = () => (g.__setterFlush ??= { running: false, dirty: false });

export const storeStatus = (): StoreStatus => (status().mode === "postgres" ? { ...status(), ...hostedStatus(), ready: true } : { ...status() });

const hosted = () => status().mode === "postgres";

/**
 * The working copy, brought up to date first when hosted. Every route reaches the data through this
 * (or through access() and extAuth(), which call it).
 */
export async function freshDb(): Promise<Db> {
  if (hostedConfigured() && !g.__setterDb) await initStore();
  if (hosted()) await hostedRefresh(g.__setterDb!, setSavedConfig);
  return getDb();
}

/** Fills in anything a workspace saved by an older version does not have yet. */
export function normalise(db: Db): Db {
  const ws = db.workspace as Workspace & Partial<Pick<Workspace, "secret" | "members" | "shortcuts" | "triggers" | "crm" | "targets" | "outreach" | "knowledge" | "calendar" | "sheets">>;
  ws.secret ||= randomBytes(32).toString("hex");
  ws.members ??= [];
  ws.shortcuts ??= DEFAULT_SHORTCUTS.map((s) => ({ ...s }));
  ws.triggers ??= [];
  ws.crm ??= { enabled: false, webhookUrl: "", ghl: { enabled: false, locationId: "", pipelineId: "", stageMap: {} }, log: [] };
  ws.crm.ghl ??= { enabled: false, locationId: "", pipelineId: "", stageMap: {} };
  ws.crm.log ??= [];
  ws.targets ??= { bookedPerMonth: 20 };
  ws.outreach = normaliseOutreach(ws.outreach);
  ws.knowledge = normaliseKnowledge(ws.knowledge);
  ws.calendar = normaliseCalendar(ws.calendar);
  ws.sheets = normaliseSheets(ws.sheets);
  db.labelQueue ??= [];
  applySetupAnswers(db);
  return db;
}

/** Picks up what `npm run setup` collected in the terminal: the owner's login, names and a CRM webhook. Applied once. */
function applySetupAnswers(db: Db) {
  const file = path.join(DATA_DIR, "setup.json");
  if (!fs.existsSync(file)) return;
  try {
    const a = JSON.parse(fs.readFileSync(file, "utf8")) as { businessName?: string; ownerName?: string; crmWebhook?: string; owner?: { name: string; email: string; passwordHash: string } };
    const ws = db.workspace;
    if (a.businessName && !ws.intake.businessName) ws.intake.businessName = a.businessName;
    if (a.ownerName && !ws.intake.ownerName) ws.intake.ownerName = a.ownerName;
    if (a.crmWebhook && !ws.crm.webhookUrl) ws.crm.webhookUrl = a.crmWebhook;
    if (a.owner && !ws.members.some((m) => m.email === a.owner!.email)) {
      ws.members.push({
        id: "m_" + randomBytes(6).toString("hex"), name: a.owner.name, email: a.owner.email, role: "owner", team: "",
        areas: ["inbox", "leads", "outreach", "insights", "playbook", "pipeline", "brief", "settings"], scope: "all", teamMetrics: true, active: true,
        passwordHash: a.owner.passwordHash, createdAt: new Date().toISOString(),
      });
    }
    fs.rmSync(file);
    g.__setterDb = db;
    writeFile();
  } catch (e) {
    console.error("[setter] could not apply setup answers:", (e as Error).message);
  }
}

export function getDb(): Db {
  if (g.__setterDb) return g.__setterDb;
  if (hostedConfigured()) throw new Error("The database has not been read yet.");
  if (fs.existsSync(FILE)) {
    g.__setterDb = normalise(JSON.parse(fs.readFileSync(FILE, "utf8")) as Db);
  } else {
    g.__setterDb = normalise(buildSeed());
    saveDb();
  }
  return g.__setterDb!;
}

function writeFile() {
  if (hostedConfigured()) return;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(g.__setterDb));
  fs.renameSync(tmp, FILE);
}

/** Goes up whenever anything is saved, by any copy of the app. Screens poll it to know when to reload. */
export function dataVersion() {
  return hosted() ? `h${hostedVersion()}` : `l${(g as { __setterLocalVersion?: number }).__setterLocalVersion ?? 0}`;
}

export function saveDb() {
  if (!g.__setterDb) return;
  (g as { __setterLocalVersion?: number }).__setterLocalVersion = ((g as { __setterLocalVersion?: number }).__setterLocalVersion ?? 0) + 1;
  if (hosted()) {
    hostedSave(getDb, savedConfig);
    return;
  }
  writeFile();
  if (status().mode === "supabase") schedulePush();
}

function schedulePush(delay = 1200) {
  const f = flush();
  status().pending = true;
  clearTimeout(f.timer);
  f.timer = setTimeout(runPush, delay);
}

async function runPush() {
  const f = flush();
  if (f.running) { f.dirty = true; return; }
  f.running = true;
  try {
    const r = await pushToSupabase(getDb());
    const s = status();
    s.error = "";
    s.lastPushAt = new Date().toISOString();
    s.written += r.written;
    s.pending = f.dirty;
  } catch (e) {
    status().error = (e as Error).message;
    // Nothing is lost: the working copy and the local file are intact, so try again shortly.
    f.dirty = true;
  } finally {
    f.running = false;
    if (f.dirty) { f.dirty = false; schedulePush(status().error ? 15_000 : 1200); }
  }
}

/** Waits until everything saved so far has reached Supabase. Used by setup and tests. */
export async function flushNow() {
  if (hosted()) {
    await hostedFlush();
    return storeStatus();
  }
  if (status().mode !== "supabase") return storeStatus();
  clearTimeout(flush().timer);
  for (let i = 0; i < 100 && flush().running; i++) await new Promise((r) => setTimeout(r, 100));
  await runPush();
  return storeStatus();
}

/**
 * Chooses the storage mode. Runs once before the server takes requests, and again when Supabase is connected in Settings.
 * If Supabase already holds a workspace that copy wins; if it is empty, whatever is on this machine is uploaded.
 */
export async function initStore(): Promise<StoreStatus & { direction?: "loaded" | "uploaded" }> {
  const s = status();
  if (hostedConfigured()) return initHosted();
  if (!supabaseConfigured()) {
    Object.assign(s, { mode: "file", ready: true, error: "", pending: false });
    return storeStatus();
  }
  const check = await checkSupabase().catch((e) => ({ ok: false, missing: [] as string[], error: (e as Error).message }));
  if (!check.ok) {
    // Keep working from the local file and say why, rather than refusing to start.
    Object.assign(s, { mode: "file", ready: true, error: check.error });
    return storeStatus();
  }
  try {
    forgetPushed();
    const remote = await loadFromSupabase();
    let direction: "loaded" | "uploaded";
    if (remote) {
      g.__setterDb = normalise(remote);
      writeFile();
      direction = "loaded";
    } else {
      await pushToSupabase(getDb());
      direction = "uploaded";
    }
    Object.assign(s, { mode: "supabase", ready: true, error: "", lastPushAt: new Date().toISOString(), pending: false });
    return { ...storeStatus(), direction };
  } catch (e) {
    Object.assign(s, { mode: "file", ready: true, error: (e as Error).message });
    return storeStatus();
  }
}

const boot = globalThis as unknown as { __setterBoot?: Promise<StoreStatus> };

/** Hosted start: read the database, or fill an empty one with the bundled seed. Shared by every caller. */
function initHosted(): Promise<StoreStatus> {
  return (boot.__setterBoot ??= (async () => {
    const s = status();
    (globalThis as unknown as { __setterCfgSave?: () => void }).__setterCfgSave = () => saveDb();
    const got = await hostedLoad();
    Object.assign(s, { mode: "postgres", ready: true, error: "", pending: false });
    if (got) {
      setSavedConfig(got.config);
      g.__setterDb = normalise(got.db);
    } else {
      // An empty database is filled from this machine's data file when there is one (the first upload), else the seed.
      setSavedConfig({});
      g.__setterDb = normalise(fs.existsSync(FILE) ? (JSON.parse(fs.readFileSync(FILE, "utf8")) as Db) : buildSeed());
    }
    saveDb();
    await hostedFlush();
    return storeStatus();
  })().catch((e) => {
    boot.__setterBoot = undefined;
    throw e;
  }));
}

export function resetDb(withDemo: boolean) {
  const prev = getDb();
  const fresh = buildSeed();
  // keep the workspace (intake, connections, token); only conversation data is reset
  fresh.workspace = prev.workspace;
  fresh.workspace.members = prev.workspace.members.filter((m) => !m.demo);
  if (!withDemo) {
    fresh.conversations = [];
    fresh.messages = [];
    fresh.events = [];
  } else {
    fresh.workspace.members.push(...DEMO_MEMBERS.map((m) => ({ ...m })));
  }
  fresh.workspace.playbook = null;
  g.__setterDb = normalise(fresh);
  saveDb();
}

export function isDemoData(db: Db) {
  return db.conversations.some((c) => c.externalId.startsWith("demo_"));
}
