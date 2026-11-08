import fs from "fs";
import path from "path";
import { access } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { cfg, cfgSource, CONFIG_KEYS, setCfg, type ConfigKey } from "@/lib/config";
import { checkSupabase, createTables, supabaseConfigured } from "@/lib/supabase";
import { flushNow, initStore, storeStatus } from "@/lib/store";

export const maxDuration = 120;

const mask = (v: string) => (v ? (v.length > 12 ? `${v.slice(0, 4)}…${v.slice(-4)}` : "saved") : "");
const SECRET: ConfigKey[] = ["ANTHROPIC_API_KEY", "SUPABASE_SERVICE_KEY", "META_APP_SECRET"];
const schemaSql = () => fs.readFileSync(path.join(/* turbopackIgnore: true */ process.cwd(), "supabase", "schema.sql"), "utf8");

function view() {
  return {
    keys: Object.fromEntries(CONFIG_KEYS.map((k) => [k, { set: Boolean(cfg(k)), source: cfgSource(k), shown: SECRET.includes(k) ? mask(cfg(k)) : cfg(k) }])),
    store: storeStatus(),
    supabaseConfigured: supabaseConfigured(),
  };
}

export async function GET(req: Request) {
  const a = await access("admin");
  if (a instanceof Response) return a;
  if (new URL(req.url).searchParams.get("what") === "schema") {
    // The schema file is only on a copy that runs from the project folder, not on a hosted one.
    try { return json({ sql: schemaSql() }); } catch { return fail("The database schema file is not part of this copy. It is in the project folder at web/supabase/schema.sql.", 404); }
  }
  return json(view());
}

export async function POST(req: Request) {
  const a = await access("admin");
  if (a instanceof Response) return a;
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "keys") {
      setCfg(b.keys ?? {});
      return json(view());
    }
    if ((b.action === "supabase" || b.action === "disconnect") && storeStatus().mode === "postgres") return fail("This copy is hosted and already keeps everything in its own database.");
    if (b.action === "supabase") {
      // Save, check, optionally create the tables, then switch storage over without a restart.
      if (b.url !== undefined || b.key !== undefined) setCfg({ ...(typeof b.url === "string" ? { SUPABASE_URL: b.url } : {}), ...(typeof b.key === "string" && b.key.trim() ? { SUPABASE_SERVICE_KEY: b.key } : {}) });
      if (!supabaseConfigured()) return fail("Add both the project URL and the service key.");
      if (!/^https?:\/\/[^\s/]+/.test(cfg("SUPABASE_URL"))) return fail("The project URL should look like https://abcd1234.supabase.co");
      let check = await checkSupabase();
      if (!check.ok && check.missing.length && typeof b.accessToken === "string" && b.accessToken.trim()) {
        await createTables(b.accessToken.trim(), schemaSql());
        check = await checkSupabase();
      }
      if (!check.ok) return json({ ...view(), check }, 200);
      const s = await initStore();
      return json({ ...view(), check, direction: s.direction ?? null });
    }
    if (b.action === "disconnect") {
      setCfg({ SUPABASE_URL: "", SUPABASE_SERVICE_KEY: "" });
      if (supabaseConfigured()) return fail("Supabase is set in .env.local. Remove SUPABASE_URL and SUPABASE_SERVICE_KEY there and restart.");
      await initStore();
      return json(view());
    }
    if (b.action === "flush") return json({ ...view(), store: await flushNow() });
    return fail("Unknown action");
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
