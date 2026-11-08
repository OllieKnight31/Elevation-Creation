"use client";
import { useCallback, useEffect, useState } from "react";
import { api, Banner, Button, timeAgo } from "@/components/ui";
import { Field, Row, Section, type TabProps } from "./parts";

type KeyInfo = { set: boolean; source: "app" | "env" | ""; shown: string };
type View = { keys: Record<string, KeyInfo>; store: TabProps["state"]["store"]; supabaseConfigured: boolean; check?: { ok: boolean; missing: string[]; error: string }; direction?: "loaded" | "uploaded" | null };

const KEYS: [string, string, string, boolean][] = [
  ["ANTHROPIC_API_KEY", "Anthropic API key", "Real replies, tagging, summaries and inbox analysis. From console.anthropic.com", true],
  ["META_APP_ID", "Meta app ID", "From your app at developers.facebook.com. Needed for the Instagram login screen and webhooks", false],
  ["META_APP_SECRET", "Meta app secret", "Same place. Verifies that webhooks really come from Meta", true],
  ["META_VERIFY_TOKEN", "Webhook verify token", "Any phrase you choose. Enter the same one in the Meta app's webhook settings", false],
  ["APP_BASE_URL", "Public address of this app", "The https address people reach it on. Used for Meta login, webhooks and links back from the CRM", false],
];

export default function SetupTab({ state, reload, note }: TabProps) {
  const [v, setV] = useState<View | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [sb, setSb] = useState({ url: "", key: "", accessToken: "" });
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(() => api<View>("/api/setup").then((x) => { setV(x); setSb((s) => ({ ...s, url: s.url || x.keys.SUPABASE_URL.shown })); }).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => { load(); }, [load]);
  if (err && !v) return <Banner tone="error">{err}</Banner>;
  if (!v) return <p className="text-mute">Loading setup…</p>;
  const store = v.store;
  const onSupabase = store.mode === "supabase";
  const hosted = store.mode === "postgres";

  const saveKey = async (k: string) => {
    setBusy(k);
    try { setV(await api<View>("/api/setup", "POST", { action: "keys", keys: { [k]: vals[k] ?? "" } })); setVals({ ...vals, [k]: "" }); await reload(); note("Saved. It is in use straight away, no restart needed.", "ok"); } catch (e) { note((e as Error).message, "error"); }
    setBusy("");
  };
  const connect = async () => {
    setBusy("sb"); setErr("");
    try {
      const r = await api<View>("/api/setup", "POST", { action: "supabase", url: sb.url, key: sb.key, accessToken: sb.accessToken });
      setV(r); setSb({ ...sb, key: "", accessToken: "" });
      if (r.check && !r.check.ok) setErr(r.check.error);
      else { note(r.direction === "loaded" ? "Connected. Supabase already held a workspace, so that copy is now in use." : "Connected. Everything on this machine has been copied into Supabase.", "ok"); await reload(); }
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };
  const copySchema = async () => { const r = await api<{ sql: string }>("/api/setup?what=schema"); await navigator.clipboard.writeText(r.sql); note("Table definitions copied. Paste them into the Supabase SQL editor and press Run."); };

  return (
    <>
      <Section title="Database" sub="Where conversations, leads and results are kept.">
        <Row title={hosted ? "Hosted database" : onSupabase ? "Supabase" : "This machine"} sub={hosted
          ? `This copy runs online and keeps everything in its own Postgres database. ${store.pending ? "Changes are on their way." : store.lastPushAt ? `Last saved ${timeAgo(store.lastPushAt)} ago.` : ""}`
          : onSupabase
          ? `Every change is mirrored into your Supabase project. ${store.pending ? "Changes are on their way." : store.lastPushAt ? `Last saved ${timeAgo(store.lastPushAt)} ago.` : ""} ${store.written} rows written since start.`
          : "One file beside the app. Fine for one person on one computer. Connect Supabase below for a real database you can query, back up and share."}>
          <span className={`font-semibold ${store.error ? "text-err" : "text-ok"}`}>{store.error ? "Problem" : "Working"}</span>
        </Row>
        {store.error && <div className="p-4 border-b border-line"><Banner tone="error">{store.error}{onSupabase ? " Nothing is lost: changes are kept on this machine and sent again automatically." : ""}</Banner></div>}
        {!hosted && <div className="p-4">
          <div className="font-semibold mb-1">{onSupabase ? "Supabase connection" : "Connect Supabase"}</div>
          <ol className="list-decimal pl-5 text-[13px] text-mute space-y-1 mb-3">
            <li>Create a project at supabase.com (the free plan is enough to start).</li>
            <li>Project Settings, API: copy the Project URL and the service role key (also called the secret key). Not the anon key.</li>
            <li>Create the tables: either paste a Supabase access token below and it is done for you, or press Copy table definitions and run them in the SQL editor.</li>
            <li>Press Connect. Leads, messages and events land in tables named setter_leads, setter_messages and setter_events.</li>
          </ol>
          {err && <div className="mb-3"><Banner tone="error">{err}</Banner></div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project URL"><input className="field" placeholder="https://abcd1234.supabase.co" value={sb.url} onChange={(e) => setSb({ ...sb, url: e.target.value })} aria-label="Supabase project URL" /></Field>
            <Field label={`Service role key${v.keys.SUPABASE_SERVICE_KEY.set ? ` (saved, ${v.keys.SUPABASE_SERVICE_KEY.shown})` : ""}`}><input className="field" type="password" placeholder={v.keys.SUPABASE_SERVICE_KEY.set ? "Leave blank to keep" : ""} value={sb.key} onChange={(e) => setSb({ ...sb, key: e.target.value })} aria-label="Supabase service key" /></Field>
            <Field label="Access token, optional" hint="Used once to create the tables, never stored. From supabase.com/dashboard/account/tokens" className="col-span-2"><input className="field" type="password" placeholder="sbp_…" value={sb.accessToken} onChange={(e) => setSb({ ...sb, accessToken: e.target.value })} aria-label="Supabase access token" /></Field>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="primary" disabled={busy === "sb" || !sb.url.trim() || (!sb.key.trim() && !v.keys.SUPABASE_SERVICE_KEY.set)} onClick={connect}>{busy === "sb" ? "Connecting…" : onSupabase ? "Reconnect" : "Connect"}</Button>
            <Button onClick={copySchema}>Copy table definitions</Button>
            {v.supabaseConfigured && <Button variant="danger" onClick={async () => { if (!confirm("Go back to storing data on this machine? What is in Supabase stays there.")) return; try { setV(await api<View>("/api/setup", "POST", { action: "disconnect" })); await reload(); note("Back on local storage."); } catch (e) { note((e as Error).message, "error"); } }}>Disconnect</Button>}
          </div>
          <p className="text-[12px] text-mute mt-3">For one long lived server (your computer, a VPS, Railway, Render). On Vercel the app uses its own Postgres database instead.</p>
        </div>}
      </Section>

      <Section title="Keys" sub="Each can be set here or in .env.local. A value saved here wins and takes effect without a restart.">
        {KEYS.map(([k, label, hint, secret]) => {
          const info = v.keys[k];
          return (
            <div key={k} className="p-4 border-b border-line last:border-b-0 grid grid-cols-[1fr_auto] gap-3 items-end">
              <Field label={label} hint={`${hint}. ${info.set ? `Set ${info.source === "app" ? "here" : "in .env.local"}${info.shown ? `: ${info.shown}` : ""}` : "Not set"}`}>
                <input className="field" type={secret ? "password" : "text"} placeholder={info.set ? "Type a new value to replace it" : ""} value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} aria-label={label} />
              </Field>
              <div className="flex gap-2">
                <Button variant="primary" disabled={!(vals[k] ?? "").trim() || busy === k} onClick={() => saveKey(k)}>Save</Button>
                {info.source === "app" && <Button onClick={() => { setVals({ ...vals, [k]: "" }); saveKey(k); }}>Clear</Button>}
              </div>
            </div>
          );
        })}
      </Section>

      <Section title="Setting up from the terminal" sub="The same setup, as questions in the terminal. Useful on a fresh copy of the project.">
        <div className="p-4 text-[13px] space-y-2">
          <p>From the project folder run <code className="font-mono bg-surface2 rounded px-1.5 py-0.5">npm run setup</code>. It asks for the same things as this page (database, keys, your login), writes them to <code className="font-mono">.env.local</code>, can create the Supabase tables, and offers to start the app. It also runs by itself the first time <code className="font-mono bg-surface2 rounded px-1.5 py-0.5">npm install</code> is used on a new copy.</p>
          <p className="text-mute">Signed in as {state.me.name || "owner"}. Only owners and admins see this page.</p>
        </div>
      </Section>
    </>
  );
}
