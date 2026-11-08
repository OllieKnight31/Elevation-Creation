import fs from "fs";
import path from "path";

// Keys can come from two places: .env.local (written by `npm run setup`) or the Setup tab in Settings,
// which saves to a small file beside the data. A value saved in the app wins, so a change there takes effect at once.
export const DATA_DIR = path.join(/* turbopackIgnore: true */ process.env.SETTER_DATA_DIR || path.join(process.cwd(), "..", ".data"));
const FILE = path.join(DATA_DIR, "config.json");

export const CONFIG_KEYS = ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "META_APP_ID", "META_APP_SECRET", "META_DASHBOARD_APP_ID", "META_VERIFY_TOKEN", "APP_BASE_URL"] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

// One copy per server process, shared by every route. Each route is bundled with its own copy of this module,
// so a module-level variable would let a key saved through one route stay unseen by the others.
const shared = globalThis as unknown as { __setterCfg?: Partial<Record<ConfigKey, string>> | null };

// When hosted, keys saved in the app live in the database with everything else; the store hands them over here.
const hook = globalThis as unknown as { __setterCfgSave?: () => void };
export function setSavedConfig(c: Partial<Record<ConfigKey, string>>) {
  shared.__setterCfg = { ...c };
}
export const savedConfig = () => ({ ...saved() }) as Record<string, string>;

function saved(): Partial<Record<ConfigKey, string>> {
  if (shared.__setterCfg) return shared.__setterCfg;
  if (process.env.SETTER_DATABASE_URL || process.env.DATABASE_URL) return (shared.__setterCfg = {});
  try {
    shared.__setterCfg = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    shared.__setterCfg = {};
  }
  return shared.__setterCfg!;
}

export function cfg(key: ConfigKey): string {
  return (saved()[key] || process.env[key] || "").trim();
}

/** Where a key is coming from, for the Setup tab. */
export function cfgSource(key: ConfigKey): "app" | "env" | "" {
  return saved()[key] ? "app" : process.env[key] ? "env" : "";
}

/** Saves keys from the Setup tab. An empty string removes the saved value, falling back to .env.local. */
export function setCfg(patch: Partial<Record<ConfigKey, string>>) {
  const next = { ...saved() };
  for (const k of CONFIG_KEYS) {
    if (typeof patch[k] !== "string") continue;
    const v = patch[k]!.trim();
    if (v) next[k] = v;
    else delete next[k];
  }
  shared.__setterCfg = next;
  if (hook.__setterCfgSave) return hook.__setterCfgSave();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
}
