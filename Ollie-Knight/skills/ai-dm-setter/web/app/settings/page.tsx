"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, backfillAll, Banner, Button, PageHeader, Toggle, useAppState, usePipeline } from "@/components/ui";
import ImportHistory from "@/components/ImportHistory";
import { Row, Section } from "@/components/settings/parts";
import TeamTab from "@/components/settings/Team";
import { GoalsTab, ShortcutsTab, TriggersTab } from "@/components/settings/Shortcuts";
import CrmTab from "@/components/settings/Crm";
import SetupTab from "@/components/settings/Setup";
import SheetsTab from "@/components/settings/Sheets";
import CalendarConnect from "@/components/CalendarConnect";

const TABS = [
  ["general", "AI"], ["team", "Team"], ["shortcuts", "Shortcuts"], ["keywords", "Keyword replies"], ["links", "Conversion links"],
  ["crm", "CRM"], ["calendar", "Calendar"], ["connections", "Connections"], ["sheets", "Google Sheets"], ["setup", "Database and setup"], ["data", "Data"],
] as const;
type Tab = (typeof TABS)[number][0];

export default function SettingsPage() {
  return <Suspense><Settings /></Suspense>;
}

function Settings() {
  const { state, reload } = useAppState(8000);
  const { stages } = usePipeline();
  const q = useSearchParams();
  const [dataset, setDataset] = useState("");
  const [token, setToken] = useState("");
  const [note, setNoteText] = useState("");
  const [tone, setTone] = useState<"info" | "ok" | "error">("info");
  const setNote = (text: string, t: "info" | "ok" | "error" = "info") => { setNoteText(text); setTone(t); };
  const [tab, setTabState] = useState<Tab>((TABS.find(([t]) => t === q.get("tab"))?.[0] ?? "general") as Tab);
  const setTab = (t: Tab) => { setTabState(t); setNoteText(""); window.history.replaceState(null, "", `/settings?tab=${t}`); };
  const [igToken, setIgToken] = useState("");
  const [igBusy, setIgBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => { if (state) setDataset((d) => d || state.workspace.meta.datasetId); }, [state]);
  if (!state) return <div className="p-8 text-mute">Loading settings…</div>;
  const ws = state.workspace;
  const put = async (body: unknown) => { await api("/api/workspace", "PUT", body); reload(); };
  const metaMsg = q.get("meta");
  const admin = state.me.role === "owner" || state.me.role === "admin";
  const tabs = TABS.filter(([t]) => admin || (t !== "team" && t !== "setup" && t !== "sheets"));
  const props = { state, reload, note: setNote };

  return (
    <div className="h-full overflow-y-auto scroll p-6">
      <div className="max-w-[980px]">
        <PageHeader title="Settings" />
        <div className="flex flex-wrap gap-1 mb-5 border-b border-line" role="tablist" aria-label="Settings sections">
          {tabs.map(([t, l]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-3 py-2 text-[13.5px] font-medium border-b-2 -mb-px ${tab === t ? "border-ink text-ink" : "border-transparent text-mute hover:text-ink"}`}>{l}</button>
          ))}
        </div>
        {metaMsg === "connected" && <div className="mb-4"><Banner tone="ok">Instagram connected.</Banner></div>}
        {metaMsg === "error" && <div className="mb-4"><Banner tone="error">Instagram connection failed: {q.get("detail")}</Banner></div>}
        {metaMsg === "not_configured" && <div className="mb-4"><Banner tone="warn">Add META_APP_ID and META_APP_SECRET to .env.local, then restart the app.</Banner></div>}
        {note && <div className="mb-4"><Banner tone={tone}>{note}</Banner></div>}

        {tab === "team" && admin && <TeamTab {...props} />}
        {tab === "shortcuts" && <ShortcutsTab {...props} />}
        {tab === "keywords" && <TriggersTab {...props} />}
        {tab === "links" && <GoalsTab {...props} />}
        {tab === "crm" && <CrmTab {...props} />}
        {tab === "calendar" && (
          <Section title="Calendar" sub="Connect Calendly and the AI stops sending a bare booking link. When a lead is ready for the call it reads your free times, offers a few by name, and sends the link for the one they pick.">
            <div className="p-4"><CalendarConnect onChange={reload} /></div>
          </Section>
        )}
        {tab === "setup" && admin && <SetupTab {...props} />}
        {tab === "sheets" && admin && <SheetsTab {...props} />}

        {tab === "general" && <>
        <Section title="AI" sub="How much the AI does on its own.">
          <Row title="Autopilot master switch" sub="Off: the AI only drafts. On: conversations set to Autopilot are answered automatically, inside Meta's 24 hour window, when the AI is confident and nothing sensitive is going on.">
            <Toggle label="Autopilot master switch" on={ws.settings.autopilotMaster} onChange={(v) => put({ settings: { autopilotMaster: v } })} />
          </Row>
          <Row title="Default for new conversations" sub="Applied when a new lead messages.">
            <select className="field !w-auto" value={ws.settings.defaultAiMode} onChange={(e) => put({ settings: { defaultAiMode: e.target.value } })} aria-label="Default AI mode">
              <option value="off">AI off</option><option value="suggest">Suggest replies</option><option value="autopilot">Autopilot</option>
            </select>
          </Row>
          <Row title="Reply delay" sub="Seconds to wait after the lead's last message, so a burst of messages gets one reply.">
            <input type="number" min={5} max={900} className="field !w-24" defaultValue={ws.settings.replyDelaySeconds} onBlur={(e) => put({ settings: { replyDelaySeconds: Number(e.target.value) || 45 } })} aria-label="Reply delay in seconds" />
          </Row>
          <Row title="Reply like a person" sub="Adds reading time before a reply and shows the typing bubble for as long as a person would take to type it.">
            <Toggle label="Reply like a person" on={ws.settings.humanTiming !== false} onChange={(v) => put({ settings: { humanTiming: v } })} />
          </Row>
          <Row title="Engine" sub={state.flags.aiError ? state.flags.aiError : state.flags.ai ? "A Claude key is set." : "No Anthropic key found. Running the demo engine, which never sends automatically. Add a key under Database and setup."}>
            <span className={`font-semibold ${state.flags.ai && !state.flags.aiError ? "text-ok" : "text-warn"}`}>{state.flags.aiError ? "Claude unavailable" : state.flags.ai ? "Claude" : "Demo"}</span>
          </Row>
        </Section>

        </>}

        {tab === "connections" && <>
        <Section title="Meta connection" sub="Official API. Receives and sends messages.">
          <Row title="Instagram" sub={ws.meta.instagram ? `Connected as @${ws.meta.instagram.username}. New messages are pulled every 20 seconds while the inbox is open.` : "Not connected"}>
            {ws.meta.instagram
              ? <Button variant="danger" onClick={async () => { if (confirm("Disconnect Instagram? Conversations already stored are kept.")) { await api("/api/meta/token", "DELETE"); reload(); } }}>Disconnect</Button>
              : <span className="font-semibold text-warn">Not connected</span>}
          </Row>
          {!ws.meta.instagram && (
            <div className="p-4 border-b border-line">
              <div className="font-semibold mb-1">Connect your own account with a token</div>
              <ol className="list-decimal pl-5 text-[13px] text-mute space-y-1 mb-3">
                <li>Your Instagram account must be a Business or Creator account.</li>
                <li>Go to developers.facebook.com, My Apps, Create app. Choose Other, then Business.</li>
                <li>In the app, add the Instagram product and open &quot;API setup with Instagram login&quot;.</li>
                <li>Under &quot;Generate access tokens&quot;, add your Instagram account, log in, approve messaging access, then press Generate token.</li>
                <li>Paste the token here.</li>
              </ol>
              <div className="flex gap-2">
                <input className="field" type="password" placeholder="Instagram access token" value={igToken} onChange={(e) => setIgToken(e.target.value)} aria-label="Instagram access token" />
                <Button variant="primary" disabled={igBusy || !igToken.trim()} onClick={async () => {
                  setIgBusy(true); setNote("");
                  try {
                    const r = await api<{ username: string; webhooks: boolean }>("/api/meta/token", "POST", { accessToken: igToken });
                    setIgToken(""); setNote(`Connected as @${r.username}. Now run the backfill below to pull in your conversations.`); reload();
                  } catch (e) { setNote((e as Error).message); }
                  setIgBusy(false);
                }}>{igBusy ? "Checking…" : "Connect"}</Button>
              </div>
              <p className="text-[12px] text-mute mt-2">For other people&apos;s accounts the app uses Meta&apos;s login screen instead{state.flags.meta ? <>: <a className="underline font-medium" href="/api/meta/connect">open Instagram login</a>.</> : ", which needs the app ID, secret and a public address set up first."}</p>
            </div>
          )}
          <Row title="Backfill from the API" sub="Pulls every conversation Meta will return. Capped by Meta at the 20 most recent messages per conversation.">
            <Button disabled={!ws.meta.instagram} onClick={async () => { setNote("Backfilling…"); try { const r = await backfillAll(true); setNote(`Backfilled ${r.added} messages from ${r.threads} conversations.`); reload(); } catch (e) { setNote((e as Error).message); } }}>Run backfill</Button>
          </Row>
          <Row title="Webhook URL" sub="Optional. Instant delivery instead of the 20 second poll. Needs a public https address for this app, plus the verify token from .env.local."><code className="text-[12px]">{origin}/api/meta/webhook</code></Row>
        </Section>

        <Section title="Full history import" sub="Gets past the 20 message limit using your own data export.">
          <div className="p-4"><ImportHistory onDone={reload} /></div>
        </Section>

        <Section title="Chrome extension" sub="Deep history capture from your open inbox, suggested replies beside the chat, and labels inside Meta Business Suite.">
          <Row title="App address" sub="Paste into the extension's options."><code className="text-[12px]">{origin}</code></Row>
          <Row title="Workspace token" sub="Paste into the extension's options. Treat it like a password.">
            <Button onClick={() => { navigator.clipboard.writeText(ws.apiToken); setNote("Token copied."); }}>Copy token</Button>
          </Row>
          <Row title="Business Suite label queue" sub={`${state.labelQueue.pending} waiting for the extension, ${state.labelQueue.done} applied.${state.labelQueue.failed.length ? ` Last failure: ${state.labelQueue.failed.at(-1)!.error}` : ""}`}>
            <span className="font-semibold tabular-nums">{state.labelQueue.pending}</span>
          </Row>
        </Section>

        <Section title="Meta Conversions API" sub="Tells Meta when a lead reaches a stage, so ad reporting and optimisation can use it. One way: it cannot read or send messages.">
          <Row title="Send stage events to Meta" sub="Off until a dataset and token are saved.">
            <Toggle label="Send stage events" on={ws.meta.capiEnabled} onChange={(v) => put({ meta: { capiEnabled: v } })} />
          </Row>
          <div className="p-4 grid grid-cols-2 gap-3 border-b border-line">
            <label><span className="font-semibold">Dataset ID</span><input className="field mt-1" value={dataset} onChange={(e) => setDataset(e.target.value)} /></label>
            <label><span className="font-semibold">Access token {ws.meta.capiTokenSet && <span className="text-mute font-normal">(saved)</span>}</span><input className="field mt-1" type="password" value={token} placeholder={ws.meta.capiTokenSet ? "Leave blank to keep" : ""} onChange={(e) => setToken(e.target.value)} /></label>
            <div><Button variant="primary" onClick={async () => { await put({ meta: { datasetId: dataset, capiToken: token } }); setToken(""); setNote("Conversions API details saved."); }}>Save</Button></div>
          </div>
          <div className="p-4">
            <div className="font-semibold mb-2">Stage to Meta event</div>
            <table className="text-[13px] w-full">
              <tbody>
                {stages.map((s) => <tr key={s.id} className="border-b border-line"><td className="py-1.5">{s.name}</td><td className="py-1.5 text-right">{s.capiEvent ? <code>{s.capiEvent}</code> : <span className="text-mute">not sent</span>}</td></tr>)}
              </tbody>
            </table>
          </div>
          <Row title="Mirror labels to Messenger" sub="Messenger has an official label API, so stage and labels are written straight to the Page inbox. Instagram has none, so those go through the extension.">
            <Toggle label="Mirror Messenger labels" on={ws.meta.mirrorMessengerLabels} onChange={(v) => put({ meta: { mirrorMessengerLabels: v } })} />
          </Row>
        </Section>

        <Section title="Bookings and payments" sub="Moves leads to Booked call, Showed, No show and Won automatically.">
          <Row title="Webhook" sub="Point Calendly, Cal.com, a GoHighLevel workflow, Stripe or Zapier here. Body: event (booked, showed, no_show, won, canceled) plus email, handle or name.">
            <Button onClick={() => { navigator.clipboard.writeText(`${origin}/api/hooks/booking?token=${ws.apiToken}`); setNote("Booking webhook URL copied."); }}>Copy URL</Button>
          </Row>
        </Section>

        </>}

        {tab === "data" && <>
        <Section title="Data" sub={state.flags.demoData ? "The inbox contains demo conversations." : "The inbox contains your own data."}>
          <Row title="Demo conversations" sub="Clear them before importing real history, or reload them to explore.">
            <div className="flex gap-2">
              <Button onClick={async () => { await api("/api/data", "POST", { action: "demo" }); reload(); setNote("Demo data reloaded."); }}>Load demo</Button>
              <Button variant="danger" onClick={async () => { if (confirm("Delete every conversation, message and event in this workspace? Your brief and connections are kept.")) { await api("/api/data", "POST", { action: "clear" }); reload(); setNote("All conversations cleared."); } }}>Clear all conversations</Button>
            </div>
          </Row>
        </Section>
        </>}
      </div>
    </div>
  );
}

