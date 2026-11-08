"use client";
import ImportHistory from "@/components/ImportHistory";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, backfillAll, Banner, Button, every, PageHeader, timeAgo, Toggle, useAppState } from "@/components/ui";

const ago = (iso: string) => (timeAgo(iso) === "now" ? "just now" : `${timeAgo(iso)} ago`);
import CalendarConnect from "@/components/CalendarConnect";

/** The helper version this app ships. An older one still running in Chrome is told to reload. */
import { HELPER_VERSION } from "@/lib/helper-version";
const older = (a: string, b: string) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false; };

interface Ext { linked?: boolean; version?: string; account?: string; outreachOn?: boolean; note?: string; error?: string; stale?: boolean }
interface Test { id: string; handle: string; status: string; detail: string; mode: string; text: string; sentAt: string }
interface View {
  helper: { connected: boolean; seenAt: string; version: string; staleCode?: boolean; account: string; outreachOn: boolean };
  helperFolder: string;
  helperZip: string;
  helperStore: string;
  canOpenChrome: boolean;
  meta: { configured: boolean; appId: string; dashId: string; redirect: string; https: boolean; webhook: string; site: string; verifyToken: string };
  ai: { configured: boolean; ok: boolean; error: string };
  inbox: { connected: boolean; username: string; lastWebhookAt: string; lastSyncAt: string; syncError: string };
  crm: boolean;
  calendar: { connected: boolean; ready: boolean; name: string; meeting: string };
  outreach: { account: string; enabled: boolean; paused: boolean; pauseReason: string };
  tests: Test[];
}

const toExt = (data: Record<string, unknown>) => window.postMessage({ source: "ainable-app", ...data }, window.location.origin);

const TEST_WORDS: Record<string, string> = {
  queued: "The AI wrote it. The helper picks it up within a minute.",
  sending: "The helper is typing the AI's message and sending it now. Leave it to work.",
  typed: "Typed into the message box and waiting for you. Go to the pinned Instagram tab and press send.",
  sent: "Sent by the AI with no clicks. Check the chat in Instagram.",
  not_found: "Instagram has no account with that username.",
  unreachable: "That account cannot be messaged from its profile.",
  failed: "It did not go through.",
};

/** One screen that gets a person from nothing to a working, tested setup, with nothing to copy between windows. */
export default function ConnectPage() {
  const { state } = useAppState(10000);
  const [v, setV] = useState<View | null>(null);
  const [ext, setExt] = useState<Ext | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const paired = useRef(false);
  // Why linking failed. Kept on screen: the next status check would otherwise wipe it within seconds.
  const [pairErr, setPairErr] = useState("");
  const [waitingSince, setWaitingSince] = useState(0);
  const [now, setNow] = useState(0);
  const [note, setNote] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  const [aiKey, setAiKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [igToken, setIgToken] = useState("");
  const [work, setWork] = useState("");

  // Coming back from Instagram's own sign in screen.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = q.get("meta");
    if (!m) return;
    setNote(m === "connected" ? { tone: "ok", text: "Instagram is connected. New messages will start to appear in the inbox." }
      : m === "denied" ? { tone: "warn", text: "Instagram was not connected because the request was cancelled. Press the button to try again." }
      : m === "not_configured" ? { tone: "warn", text: "The Instagram sign in button needs the one time set up below first." }
      : { tone: "error", text: `Instagram did not accept the connection. ${q.get("detail") ?? ""}` });
    window.history.replaceState(null, "", "/connect");
  }, []);
  const token = state?.workspace.apiToken ?? "";

  const load = useCallback(() => api<View>("/api/connect").then(setV).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => {
    load();
    return every(load, 4000);
  }, [load]);

  // The helper answers through the page. Asking every few seconds is how this screen notices it the moment it is added.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin || e.data?.source !== "ainable-ext") return;
      const d = e.data as Ext;
      setExt(d);
      if (d.linked) setPairErr("");
      else if (d.error) setPairErr(d.error);
    };
    window.addEventListener("message", on);
    toExt({ type: "status" });
    const t = setInterval(() => toExt({ type: "status" }), 3000);
    return () => { window.removeEventListener("message", on); clearInterval(t); };
  }, []);

  // Linking needs no action from the person: as soon as the helper is there, it is handed the key.
  // A helper that says it is linked but that the app has not heard from holds an old key (for example after the
  // app moved to a new database), so it is handed the current one too.
  const heard = Boolean(v?.helper.connected);
  useEffect(() => {
    if (!ext || (ext.linked && heard) || ext.stale || !token || paired.current) return;
    paired.current = true;
    toExt({ type: "pair", token });
    setTimeout(() => { paired.current = false; }, 8000);
  }, [ext, token, heard]);

  // Waiting to link: after a few seconds, show what to do instead of an endless "a few seconds".
  const stuck = Boolean(ext) && !ext?.linked && !v?.helper.connected;
  useEffect(() => {
    if (!stuck) { setWaitingSince(0); return; }
    setWaitingSince((s) => s || Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [stuck]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setWork(key); setNote(null);
    try { await fn(); setV(await api<View>("/api/connect?fresh=1")); setNote({ tone: "ok", text: ok }); return true; }
    catch (e) { setNote({ tone: "error", text: (e as Error).message }); return false; }
    finally { setWork(""); }
  };
  const copy = (key: string, value: string) => navigator.clipboard.writeText(value).then(() => { setCopied(key); setTimeout(() => setCopied(""), 2500); }).catch(() => setErr("Could not copy. Select the text and copy it by hand."));

  if (!v) return <div className="p-8 text-mute">Checking what is connected…</div>;

  const installed = Boolean(ext) || v.helper.connected;
  const linked = Boolean(ext?.linked) || v.helper.connected;
  const account = ext?.account || v.helper.account;
  const sendingOn = ext?.outreachOn ?? v.helper.outreachOn;
  const mismatch = Boolean(account && v.outreach.account && account !== v.outreach.account);
  const ready = installed && linked && Boolean(account) && !mismatch;
  const last = v.tests[0];
  const done = [installed && linked, Boolean(account) && !mismatch, Boolean(last && (last.status === "sent" || last.status === "typed"))];


  const sendTest = async () => {
    setBusy(true); setErr("");
    try {
      setV(await api<View>("/api/connect", "POST", { action: "test", handle }));
      // Sending in this browser has to be on for the helper to collect the test.
      toExt({ type: "outreach", enabled: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto scroll p-6">
      <PageHeader title="Get connected" sub="Connect your Instagram through Meta once and your inbox stays live all the time, with or without your computer on."><Link href="/learn?m=connect" className="inline-flex items-center justify-center rounded-[10px] border border-linestrong bg-surface px-3 h-8 text-[13px] font-medium hover:border-ink">Watch the 2 minute video</Link></PageHeader>
      <div className="max-w-[820px] space-y-4">
        {note && <Banner tone={note.tone}>{note.text}</Banner>}
        {err && <Banner tone="error">{err}</Banner>}
        {ext?.error && <Banner tone="error">{ext.error}</Banner>}
        {ext?.stale && <Banner tone="warn">The helper was updated while this page was open. Refresh this page (Cmd+R) and it reconnects.</Banner>}
        {v.outreach.paused && <Banner tone="error">Sending is paused. {v.outreach.pauseReason} <Link className="underline" href="/outreach">Open Outreach</Link> to resume.</Banner>}

        <Block ok={v.inbox.connected} title="Your Instagram, connected through Meta (always on)" status={v.inbox.connected ? `Connected as @${v.inbox.username}. Every message, sent or received, comes in by itself, day and night. No browser needed.` : "Not connected yet. This is the one connection that keeps your inbox live all the time. Set it up once, about 20 minutes."} video="connections">
          <InboxSetup v={v} business={state?.workspace.intake?.businessName ?? ""} appSecret={appSecret} setAppSecret={setAppSecret} igToken={igToken} setIgToken={setIgToken} work={work} act={act} copied={copied} copy={copy} reload={load} />
        </Block>

        <h2 className="font-semibold text-[17px] pt-3">Connect the rest</h2>
        <p className="text-[13px] text-mute !mt-1">The AI that writes replies, your calendar and your CRM. Every link below goes straight to the exact page you need.</p>


        <Block ok={v.ai.ok} title="The AI that writes replies" status={v.ai.ok ? "Working." : v.ai.configured ? v.ai.error || "A key is saved but it is not working." : "No key yet. Until there is one, replies come from a basic keyword engine."} video="connections">
          {!v.ai.ok && (
            <ol className="space-y-3 text-[14px]">
              {v.ai.configured && /credit/i.test(v.ai.error) ? (
                <Li n="1">The key is fine but the account has no credit. Add some on this page, then press Check again. <ExtLink href="https://console.anthropic.com/settings/billing">Open Anthropic billing</ExtLink></Li>
              ) : (
                <>
                  <Li n="1">Create a key on this page and copy it. If the account is new, add credit first. <ExtLink href="https://console.anthropic.com/settings/keys">Open Anthropic keys</ExtLink> <ExtLink href="https://console.anthropic.com/settings/billing">Open Anthropic billing</ExtLink></Li>
                  <Li n="2">
                    Paste the key here and press Save.
                    <span className="flex gap-2 mt-1.5">
                      <input className="field flex-1" type="password" placeholder="sk-ant-…" value={aiKey} onChange={(e) => setAiKey(e.target.value)} aria-label="Anthropic key" />
                      <Button variant="primary" disabled={work === "ai" || aiKey.trim().length < 20} onClick={async () => { if (await act("ai", () => api("/api/setup", "POST", { action: "keys", keys: { ANTHROPIC_API_KEY: aiKey.trim() } }), "Key saved and checked.")) setAiKey(""); }}>Save</Button>
                    </span>
                  </Li>
                </>
              )}
              <li><Button disabled={work === "aicheck"} onClick={() => act("aicheck", async () => {}, "Checked again.")}>{work === "aicheck" ? "Checking…" : "Check again"}</Button></li>
            </ol>
          )}
          {v.ai.ok && (
            <details className="rounded-[10px] border border-line p-3 text-[13.5px]">
              <summary className="cursor-pointer font-semibold">Every set up step, to check or redo it by hand</summary>
              <ol className="mt-2 space-y-2 list-decimal pl-5 text-ink2">
                <li>Sign in to Anthropic&apos;s console and add credit under <b>Plans and Billing</b>. $5 covers roughly 10,000 replies. <ExtLink href="https://console.anthropic.com/settings/billing">Open Anthropic billing</ExtLink></li>
                <li>Under <b>API keys</b>, press <b>Create key</b>, name it after this app, and copy it. It starts with sk-ant. <ExtLink href="https://console.anthropic.com/settings/keys">Open Anthropic keys</ExtLink></li>
                <li>To replace the key, paste the new one here and press Save. The old one keeps working until you delete it in the console.
                  <span className="flex gap-2 mt-1.5">
                    <input className="field flex-1" type="password" placeholder="sk-ant-…" value={aiKey} onChange={(e) => setAiKey(e.target.value)} aria-label="New Anthropic key" />
                    <Button variant="primary" disabled={work === "ai" || aiKey.trim().length < 20} onClick={async () => { if (await act("ai", () => api("/api/setup", "POST", { action: "keys", keys: { ANTHROPIC_API_KEY: aiKey.trim() } }), "Key saved and checked.")) setAiKey(""); }}>Save</Button>
                  </span>
                </li>
                <li>Replies, summaries and first messages use <b>Claude Haiku 5.5</b>, about $0.0005 a reply. Building the playbook uses <b>Claude Sonnet 5.5</b>, which runs rarely.</li>
                <li>If this ever says the account has no credit, top it up on the billing page and press Check again.</li>
              </ol>
            </details>
          )}
        </Block>

        <Block ok={v.calendar.ready} title="Your calendar" status={v.calendar.ready ? `Connected to ${v.calendar.name}'s Calendly. The AI offers free times for ${v.calendar.meeting}.` : v.calendar.connected ? "Connected, but no meeting type is chosen yet." : "Not connected. Connect Calendly and the AI offers leads your real free times instead of a bare booking link."} video="connections">
          <CalendarConnect onChange={() => load()} />
        </Block>

        <Block ok={v.crm} title="Your CRM (optional)" status={v.crm ? "Leads are being passed on." : "Not connected. Leads stay in this app only."} video="connections">
          {!v.crm && (
            <ol className="space-y-3 text-[14px]">
              <Li n="1">In GoHighLevel, open the sub account that should receive leads, go to Settings, Private Integrations, and create one with contacts, opportunities, locations and custom fields ticked. <ExtLink href="https://app.gohighlevel.com/">Open GoHighLevel</ExtLink></Li>
              <Li n="2">Paste the token and the location ID into the CRM section. <Link className="underline font-medium" href="/settings?tab=crm">Open Settings, CRM</Link></Li>
            </ol>
          )}
        </Block>

        <details className="card p-5 group">
          <summary className="cursor-pointer list-none flex items-center gap-3">
            <div className="flex-1">
              <h2 className="font-semibold">The Chrome helper, for chats older than 24 hours and first messages</h2>
              <p className="text-[13px] text-mute">Meta lets apps reply only within 24 hours of a lead&apos;s last message, and never lets an app message someone first. For those, the helper types the message in your own Chrome, like you would, for free. It works while that Chrome is open; anything written meanwhile waits and goes out when it is.</p>
            </div>
            <span className="text-[12.5px] underline text-mute group-open:hidden">Show</span>
          </summary>
          <div className="space-y-4 mt-4">
        <Step n={1} done={done[0]} title="Add the helper to Chrome" status={done[0] ? `Added and linked${v.helper.version || ext?.version ? ` (version ${ext?.version || v.helper.version})` : ""}.` : installed ? "Added. Linking it to this app…" : "Not added yet."}>
              {!done[0] && !installed && (
                <>
                  <p className="text-[14px] text-ink2 mb-3">The helper is a small add on for Chrome. It is what types and sends messages in your own Instagram, in your own browser. You add it once.</p>
                  {v.helperZip ? (
                    <HostedInstall zip={v.helperZip} store={v.helperStore} copied={copied} copy={copy} />
                  ) : v.canOpenChrome ? (
                    <ol className="space-y-3 text-[14px]">
                      <Li n="a">
                        Press this button. Chrome opens its add on page in a new tab, and the helper&apos;s folder is copied for you.
                        <span className="block mt-1.5"><Button variant="primary" disabled={work === "open"} onClick={() => act("open", () => api("/api/connect", "POST", { action: "open-helper" }), "Chrome's add on page is open in a new tab, and the folder is copied. Follow b and c there, then come back.")}>Open Chrome&apos;s add on page</Button></span>
                      </Li>
                      <Li n="b">On that page, switch on <b>Developer mode</b>. It is the switch in the top right corner.</Li>
                      <Li n="c">Click <b>Load unpacked</b>, top left. A file window opens. Press <b>Cmd + Shift + G</b>, then <b>Cmd + V</b>, then <b>Enter</b>, then click <b>Select</b>.</Li>
                    </ol>
                  ) : (
                    <ol className="space-y-3 text-[14px]">
                      <Li n="a">
                        Copy this address, open a new tab, paste it into the address bar and press Enter. Chrome does not let a web page link to it, which is why it has to be pasted.
                        <Copy label="chrome://extensions" value="chrome://extensions" on={copied === "addr"} onClick={() => copy("addr", "chrome://extensions")} />
                      </Li>
                      <Li n="b">On that page, switch on <b>Developer mode</b>. It is the switch in the top right corner.</Li>
                      <Li n="c">
                        Click <b>Load unpacked</b>, top left. A file window opens. Press <b>Cmd + Shift + G</b>, paste the folder below, press Enter, then click <b>Select</b>.
                        {v.helperFolder ? <Copy label={v.helperFolder} value={v.helperFolder} on={copied === "dir"} onClick={() => copy("dir", v.helperFolder)} /> : <span className="block text-mute mt-1">Ask the account owner for the folder. Only people who manage settings can see it.</span>}
                      </Li>
                    </ol>
                  )}
                  <p className="text-[13px] text-mute mt-3">That is all. Come back to this tab: it notices the helper by itself and links it, usually within a few seconds.</p>
                </>
              )}
              {done[0] && ext?.version && older(ext.version, HELPER_VERSION) && (
                <div className="rounded-[10px] border border-linestrong p-4 bg-surface">
                  <div className="font-semibold mb-1">A newer helper is ready (version {HELPER_VERSION})</div>
                  <ol className="space-y-2 text-[14px]">
                    <Li n="1">Delete the old <code>ainable-setter-helper</code> folder and zip from your Downloads folder.</Li>
                    <Li n="2"><a className="underline font-semibold" href={v.helperZip || "/ainable-setter-helper.zip"} download="ainable-setter-helper.zip">Download the new helper</a> and unzip it in Downloads, the same way as before.</Li>
                    <Li n="3">On chrome://extensions, switch Ainable Setter Helper off and back on (the round reload arrow alone does not always load new code). <Button className="ml-1 !h-7" onClick={() => copy("ext", "chrome://extensions")}>{copied === "ext" ? "Copied" : "Copy address"}</Button></Li>
                  </ol>
                </div>
              )}
              {done[0] && v.helper.connected && v.helper.staleCode && !(ext?.version && older(ext.version, HELPER_VERSION)) && (
                <div className="rounded-[10px] border border-linestrong p-4 bg-surface">
                  <div className="font-semibold mb-1">Chrome is running an old copy of the helper</div>
                  <p className="text-[13px] text-mute mb-3">The helper&apos;s files are version {v.helper.version}, but Chrome kept running older background code from before an update, so newer features such as profile pictures do not run. A Chrome restart does not fix this; switching the helper off and on does.</p>
                  <ol className="space-y-2 text-[14px]">
                    <Li n="1">Open a new tab, paste <b>chrome://extensions</b> into the address bar and press Enter. <Button className="ml-1 !h-7" onClick={() => copy("ext", "chrome://extensions")}>{copied === "ext" ? "Copied" : "Copy address"}</Button></Li>
                    <Li n="2">On <b>Ainable Setter Helper</b>, click the on and off switch to turn it off, then click it again to turn it back on.</Li>
                    <Li n="3">Come back here. This message goes within a minute.</Li>
                  </ol>
                </div>
              )}
              {installed && !linked && (() => {
                const outdated = Boolean(ext?.version && older(ext.version, HELPER_VERSION));
                const long = outdated || Boolean(pairErr) || (waitingSince > 0 && now - waitingSince > 10_000);
                if (!long) return <p className="text-[14px] text-ink2">Linking the helper to this app. This takes a few seconds.</p>;
                return (
                  <div className="rounded-[10px] border border-linestrong p-4 bg-surface">
                    <div className="font-semibold mb-1">The helper is in Chrome but has not linked yet</div>
                    <p className="text-[13px] text-mute mb-3">
                      {outdated ? `Chrome is still running an older copy of the helper (version ${ext?.version}). The latest is ${HELPER_VERSION}.` : "Chrome is usually still running an older copy of the helper, or the helper was linked to a different copy of the app."}
                      {pairErr && <> The helper said: &quot;{pairErr}&quot;</>}
                    </p>
                    <ol className="space-y-2 text-[14px]">
                      <Li n="1">Open a new tab, paste <b>chrome://extensions</b> into the address bar and press Enter. <Button className="ml-1 !h-7" onClick={() => copy("ext", "chrome://extensions")}>{copied === "ext" ? "Copied" : "Copy address"}</Button></Li>
                      <Li n="2">Find <b>Ainable Setter Helper</b> and press its round reload arrow, next to the on and off switch.</Li>
                      <Li n="3">Come back to this tab and press <b>Cmd+R</b>. It links within a few seconds.</Li>
                    </ol>
                    <p className="text-[12.5px] text-mute mt-3">Still stuck? On chrome://extensions press <b>Remove</b> on the helper, then add it again with the steps above, and refresh this page.</p>
                  </div>
                );
              })()}
            </Step>

            <Step n={2} done={done[1]} locked={!done[0]} title="Sign in to Instagram in this Chrome" status={mismatch ? `Chrome is signed in as @${account}, but sending is set up for @${v.outreach.account}.` : account ? `Signed in as @${account}. Messages will be sent from this account.` : "Not signed in yet, or Instagram is not open."}>
              {done[0] && !account && (
                <>
                  <p className="text-[14px] text-ink2 mb-3">Open Instagram and sign in the way you normally do. Nothing is asked for here: your password stays between you and Instagram. Leave that tab open for a few seconds, then come back.</p>
                  <ExtLink href="https://www.instagram.com/accounts/login/" primary>Open Instagram&apos;s sign in page</ExtLink>
                </>
              )}
              {account && !mismatch && (
                <>
                  <p className="text-[14px] text-ink2 mb-3">Open your Instagram inbox in this Chrome. While it is open, the helper brings your DM threads into Ainable Setter.</p>
                  <ExtLink href="https://www.instagram.com/direct/inbox/" primary>Open my Instagram inbox</ExtLink>
                </>
              )}
              {mismatch && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" onClick={() => api<View>("/api/connect", "POST", { action: "account" }).then(setV).catch((e) => setErr((e as Error).message))}>Use @{account} from now on</Button>
                  <span className="text-[13px] text-mute">Or sign in to Instagram as @{v.outreach.account} instead.</span>
                </div>
              )}
            </Step>

            <Step n={3} done={done[2]} locked={!ready} title="Let the AI send a test message by itself" status={last ? `@${last.handle}: ${TEST_WORDS[last.status] ?? last.status}${last.detail && last.status !== "sent" && last.status !== "typed" ? ` ${last.detail}` : ""}` : "Nothing sent yet."}>
              {ready && (
                <>
                  <p className="text-[14px] text-ink2 mb-3">This is the setter working on its own. You only say who gets it: pick someone who knows a test is coming, such as your own second account or a friend. The AI then writes the first message from your business brief, and the helper opens Instagram in a pinned tab, types it like a person and presses send. Nothing for you to click. It takes about a minute.</p>
                  <div className="grid gap-2">
                    <label className="text-[13px] font-medium">Who should the AI message?
                      <input className="field mt-1" placeholder="Their Instagram username, for example: jordan.smith" value={handle} onChange={(e) => setHandle(e.target.value)} />
                    </label>
                    <div><Button variant="primary" disabled={busy || !handle.trim() || last?.status === "queued" || last?.status === "sending"} onClick={sendTest}>{busy ? "The AI is writing the message…" : last?.status === "queued" || last?.status === "sending" ? "The AI is sending it…" : "Let the AI send it"}</Button></div>
                    {last?.text && (
                      <div className="rounded-[10px] border border-line bg-surface2 p-3 text-[13.5px]">
                        <div className="text-[12px] font-semibold text-mute mb-1">The AI wrote this to @{last.handle}</div>
                        <div className="text-ink">{last.text}</div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </Step>

            <div className="card p-5">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <h2 className="font-semibold">Sending from this browser</h2>
                  <p className="text-[13px] text-mute">{!installed ? "Add the helper first." : sendingOn ? "On. Replies you send from the inbox go out within seconds. Campaign messages go out at the pace set in Outreach." : "Off. Nothing is sent from this Chrome, whatever the campaigns say."}{ext?.note ? ` ${ext.note}` : ""}</p>
                </div>
                <Toggle on={Boolean(sendingOn)} label="Sending from this browser" onChange={(on) => { if (ext) toExt({ type: "outreach", enabled: on }); else setErr("Open this page in the Chrome that has the helper added."); }} />
              </div>
            </div>
          </div>
        </details>

        <FullGuide site={v.meta.site} />
      </div>
    </div>
  );
}

/**
 * Everything it took to get the setter running, start to finish, in one place, so anyone can set it up again by hand
 * or check a part that stopped working. The detailed Instagram and AI steps live in their own sections above.
 */
function FullGuide({ site }: { site: string }) {
  const H = ({ children }: { children: React.ReactNode }) => <h3 className="font-semibold text-ink mt-5 mb-1.5">{children}</h3>;
  return (
    <details className="card p-5 group">
      <summary className="cursor-pointer list-none flex items-center gap-3">
        <div className="flex-1">
          <h2 className="font-semibold">Set up from scratch: every step, start to finish</h2>
          <p className="text-[13px] text-mute">The full list of what it takes to get the setter running, in order. Use it to set up a new account by hand or to find what has stopped working.</p>
        </div>
        <span className="text-[12.5px] underline text-mute group-open:hidden">Show</span>
      </summary>
      <div className="text-[14px] text-ink2 mt-2">
        <H>1. Hosting and the database (whoever runs the app)</H>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>The app runs on <b>Vercel</b> at <b>{site}</b>. Deploy the <code>web</code> folder as a Vercel project.</li>
          <li>Add a database: in the Vercel project, <b>Storage</b>, <b>Create</b>, <b>Neon</b> (Postgres), free plan, region London. Connect it to the project with the prefix <code>SETTER_</code>, which adds <code>SETTER_DATABASE_URL</code>. The app makes its own tables the first time it runs.</li>
          <li>In the project&apos;s <b>Environment Variables</b>, add <code>APP_BASE_URL</code> (the address above), <code>META_VERIFY_TOKEN</code> (any long random text), <code>CRON_SECRET</code> (any long random text) and, if you like, <code>ANTHROPIC_API_KEY</code>. Redeploy after adding them.</li>
          <li>The free database has 100 hours of work a month. The app lets it sleep whenever nobody is looking, so normal use stays well inside that. If it ever runs out, every page shows an error: upgrade the Neon plan in Vercel, Storage, or wait for the monthly reset.</li>
          <li>A new database starts with a few demo chats. Delete them in the inbox, or they mix with your real ones.</li>
        </ol>

        <H>2. Your login and your team</H>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Open the app straight after it is deployed. The first account made becomes the <b>owner</b>, so do this before sharing the address.</li>
          <li>Add your team under <b>Settings</b>, <b>Team</b>: each person gets their own login and only the areas you tick. To change a password, set a new one there.</li>
        </ol>

        <H>3. Instagram, through Meta</H>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Follow <b>Every set up step</b> in the Instagram section at the top of this page. In short: make a Meta app, add the Instagram use case and its three permissions, add yourself as an Instagram tester and accept it, save the Instagram app ID and secret here, switch on webhooks, add the return address, fill in the basic details, publish the app, then press <b>Continue with Instagram</b>.</li>
          <li>Past chats load by themselves after connecting. About 2,000 chats took 20 minutes. Profile pictures follow over the next half hour; Instagram does not share one for every account.</li>
          <li>Seen receipts, new messages and replies you type in the Instagram app all arrive within seconds once the app is published.</li>
        </ol>

        <H>4. The AI that writes replies</H>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Make an Anthropic account, add credit ($5 covers roughly 10,000 replies), create an API key and save it in <b>The AI that writes replies</b> above. The section turns green once the key works.</li>
          <li>Replies use Claude Haiku 5.5. The playbook builder uses Claude Sonnet 5.5.</li>
          <li>To test it, open any chat in the inbox and press <b>Suggest</b>. A draft reply appears in a few seconds. Nothing is sent until you press Send.</li>
        </ol>

        <H>5. The Chrome helper</H>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>In the Chrome you use every day, add the helper with the steps in <b>The Chrome helper</b> section above, then open this page in that Chrome. It links itself within a few seconds.</li>
          <li>Sign in to Instagram in that same Chrome, with the account the setter replies from.</li>
          <li>Keep <b>Sending from this browser</b> on.</li>
          <li>Not linking, or linked but chats still say they cannot be sent? Open <code>chrome://extensions</code>, switch <b>Ainable Setter Helper</b> off and back on, come back here and refresh this page. This also fixes it after the app moves to a new database.</li>
        </ol>

        <H>6. Teach it your business, then switch it on</H>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Fill in the <b>business brief</b> in Settings: what you sell, the price, who it is for and your booking link. Without it the AI can only ask questions, and anything about price goes to you.</li>
          <li>In the brief&apos;s <b>Voice and rules</b> step, fill in <b>About me and my story</b> (the only personal facts the AI may share as you) and <b>Slang you are happy to use</b> (leave empty for none). The AI mirrors how each lead texts, short lines or paragraphs, casing and emoji, builds rapport before qualifying, and asks before it sends a link. Set <b>Messages before the AI moves toward your offer</b> there too (default 10): until then, and until the lead&apos;s situation, goal and blocker are clear from their own words, it only gets to know them and makes no assumptions.</li>
          <li>Optional: connect your calendar and CRM above.</li>
          <li>Tag anyone the AI must never message, such as friends and family, with <b>Close friend</b>. Remove the tag to change that.</li>
          <li>Switch on <b>Autopilot</b> at the top left of the inbox. Off, the AI only drafts replies for you to send.</li>
        </ol>

        <H>7. Check it all works</H>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Ask someone you know to DM your Instagram. It appears in the inbox within seconds.</li>
          <li>Reply from the inbox. It arrives on their phone, and once they open it the chat shows <b>Seen</b>.</li>
          <li>Reply to a chat older than 24 hours. It goes out through the helper within seconds while Chrome is open.</li>
          <li>Anything not working: the sections above each show a red status saying what is wrong.</li>
        </ol>
      </div>
    </details>
  );
}

function Step({ n, title, status, done, locked, children }: { n: number; title: string; status: string; done: boolean; locked?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`card p-5 ${locked ? "opacity-55" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[14px] font-semibold shrink-0 ${done ? "tone-ok" : "bg-surface2 text-ink"}`} aria-hidden>{done ? "✓" : n}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          <p className={`text-[13px] ${done ? "text-ok" : "text-mute"}`}>{locked ? "Finish the step above first." : status}</p>
          {!locked && children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  );
}

/** A link that always goes to one exact page, in a new tab. */
function ExtLink({ href, children, primary }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={primary ? "inline-flex items-center justify-center rounded-[10px] bg-ink text-onbrand px-3 h-8 text-[13px] font-medium hover:opacity-85" : "inline-flex items-center gap-1 underline font-medium whitespace-nowrap"}>{children}{!primary && <span aria-hidden>↗</span>}</a>;
}

function Block({ ok, title, status, video, children }: { ok: boolean; title: string; status: string; video: string; children?: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[14px] font-semibold shrink-0 ${ok ? "tone-ok" : "tone-warn"}`} aria-hidden>{ok ? "✓" : "!"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3"><h2 className="font-semibold flex-1">{title}</h2><Link href={`/learn?m=${video}`} className="text-[12.5px] underline text-mute hover:text-ink whitespace-nowrap">Watch how</Link></div>
          <p className={`text-[13px] ${ok ? "text-ok" : "text-mute"}`}>{status}</p>
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  );
}

function Li({ n, children }: { n: string; children: React.ReactNode }) {
  return <li className="flex gap-2.5"><span className="font-semibold text-mute w-4 shrink-0">{n}</span><div className="min-w-0 flex-1">{children}</div></li>;
}

function Copy({ label, value, on, onClick }: { label: string; value: string; on: boolean; onClick: () => void }) {
  return (
    <span className="flex items-center gap-2 mt-1.5">
      <code className="rounded-md bg-surface2 px-2 py-1 text-[12.5px] break-all min-w-0" title={value}>{label}</code>
      <Button onClick={onClick}>{on ? "Copied" : "Copy"}</Button>
    </span>
  );
}

type Os = "mac" | "win";
const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="rounded-md border border-linestrong bg-surface2 px-1.5 py-px text-[12px] font-mono font-semibold whitespace-nowrap">{children}</kbd>;

/** Adding the helper on the hosted app: download, unzip, load. Written for someone who has never done it. */
function HostedInstall({ zip, store, copied, copy }: { zip: string; store: string; copied: string; copy: (key: string, value: string) => void }) {
  const [os, setOs] = useState<Os>("mac");
  const [where, setWhere] = useState<"chrome" | "other" | "phone">("chrome");
  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Windows/i.test(ua)) setOs("win");
    const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands.map((b) => b.brand) ?? [];
    const brave = Boolean((navigator as Navigator & { brave?: unknown }).brave);
    if (/Mobi|Android|iPhone|iPad/i.test(ua)) setWhere("phone");
    else if (brave || /Edg\/|OPR\/|Firefox\//.test(ua) || !/Chrome\//.test(ua) || (brands.length > 0 && !brands.includes("Google Chrome"))) setWhere("other");
  }, []);
  const k = os === "mac" ? { cmd: "Cmd", newTab: "Cmd + T", paste: "Cmd + V", refresh: "Cmd + R" } : { cmd: "Ctrl", newTab: "Ctrl + T", paste: "Ctrl + V", refresh: "Ctrl + R" };
  const page = typeof window === "undefined" ? "" : window.location.origin + "/connect";

  if (where !== "chrome") {
    return (
      <div className="rounded-[10px] border border-linestrong p-4 bg-surface">
        <div className="font-semibold mb-1">{where === "phone" ? "Do this step on a computer" : "Open this page in Google Chrome"}</div>
        <p className="text-[14px] text-ink2 mb-3">{where === "phone" ? "The helper runs in Google Chrome on a Mac or Windows computer, not on a phone. Open this page there." : "The helper only works in Google Chrome. Copy this page's link and open it in Chrome. If you do not have Chrome yet, install it first; it is free."}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => copy("page", page)}>{copied === "page" ? "Link copied" : "Copy this page's link"}</Button>
          <ExtLink href="https://www.google.com/chrome/">Get Google Chrome</ExtLink>
        </div>
        <button className="text-[12.5px] text-mute underline mt-3" onClick={() => setWhere("chrome")}>I am already in Chrome, show me the steps</button>
      </div>
    );
  }

  const manual = (
    <div>
      <div className="flex items-center gap-2 mb-3 text-[13px]">
        <span className="text-mute">Your computer:</span>
        {(["mac", "win"] as Os[]).map((o) => (
          <button key={o} onClick={() => setOs(o)} aria-pressed={os === o} className={`px-2.5 h-7 rounded-[8px] border font-medium ${os === o ? "border-ink bg-ink text-onbrand" : "border-linestrong text-ink2 hover:border-ink"}`}>{o === "mac" ? "Mac" : "Windows"}</button>
        ))}
        <span className="text-mute ml-1">About 2 minutes, once.</span>
      </div>
      <Walkthrough id="helper" steps={[
        { title: "Download the helper", body: (<>
          It saves <code>ainable-setter-helper.zip</code> to your Downloads folder.
          <span className="block mt-1.5"><a className="inline-flex items-center justify-center rounded-[10px] bg-ink text-onbrand px-3 h-8 text-[13px] font-medium hover:opacity-85" href={zip} download="ainable-setter-helper.zip">Download the helper</a></span>
          <span className="block text-[12.5px] text-mute mt-1">Added it before? Delete the old <code>ainable-setter-helper</code> folder and zip from Downloads first, so the new one keeps the same name.</span>
        </>) },
        { title: "Unzip it", body: (<>
          {" "}
          {os === "mac"
            ? <>Open your Downloads folder and double click <code>ainable-setter-helper.zip</code>. A folder called <code>ainable-setter-helper</code> appears next to it.</>
            : <>Open your Downloads folder, right click <code>ainable-setter-helper.zip</code>, choose <b>Extract All</b>, then <b>Extract</b>.</>}
          <span className="block text-[12.5px] text-mute mt-1">Leave the folder where it is. Chrome runs the helper from it, so deleting or moving it switches the helper off.</span>
        </>) },
        { title: "Open Chrome's extensions page", body: (<>
          Copy the address, open a new tab with <Kbd>{k.newTab}</Kbd>, paste it with <Kbd>{k.paste}</Kbd> and press <Kbd>Enter</Kbd>. Chrome does not let websites link to this page, so it has to be pasted.
          <Copy label="chrome://extensions" value="chrome://extensions" on={copied === "addr"} onClick={() => copy("addr", "chrome://extensions")} />
        </>) },
        { title: "Switch on Developer mode", body: (<>
          , the switch in the top right corner of that page. Two new buttons appear on the left.
        </>) },
        { title: "Click Load unpacked and pick the folder", body: (<>
          , the first of those buttons. A window opens to choose a folder.{" "}
          {os === "mac"
            ? <>Press <Kbd>Cmd + Shift + G</Kbd>, paste the address below with <Kbd>Cmd + V</Kbd>, press <Kbd>Enter</Kbd>, then click <b>Select</b>.<Copy label="~/Downloads/ainable-setter-helper" value="~/Downloads/ainable-setter-helper" on={copied === "dir"} onClick={() => copy("dir", "~/Downloads/ainable-setter-helper")} /></>
            : <>Go to <b>Downloads</b> and open <code>ainable-setter-helper</code>. If there is another <code>ainable-setter-helper</code> folder inside, open that one too. When you can see a file called <code>manifest.json</code>, click <b>Select Folder</b>.</>}
          <figure className="mt-2.5">
            <img src="/guide/chrome-extensions-page.png" alt="Chrome's extensions page with Developer mode switched on in the top right and the Load unpacked button in the top left" className="w-full max-w-[640px] rounded-[10px] border border-line" />
            <figcaption className="text-[12px] text-mute mt-1">Developer mode is top right. Load unpacked is top left.</figcaption>
          </figure>
        </>) },
        { title: "Done: it links itself", body: (<>
          Ainable Setter Helper appears in the list, Chrome brings you back to this page, and the helper links itself within a few seconds. Nothing to copy or type. If this page has not moved on after a minute, press <Kbd>{k.refresh}</Kbd>.
        </>) },
      ]} />
      <details className="mt-4 rounded-[10px] border border-line p-3 text-[13.5px]">
        <summary className="cursor-pointer font-semibold">Something not working?</summary>
        <ul className="mt-2 space-y-2 text-ink2">
          <li><b>There is no Load unpacked button.</b> Developer mode is off. Switch it on, top right of chrome://extensions.</li>
          <li><b>&quot;Manifest file is missing or unreadable&quot;.</b> The wrong folder was chosen. Choose the <code>ainable-setter-helper</code> folder that has <code>manifest.json</code> inside it{os === "win" ? ", usually the one inside the first" : ""}.</li>
          <li><b>Developer mode is greyed out or &quot;managed by your organisation&quot;.</b> This is a work or school Chrome. Use your own Chrome profile instead: click your picture in Chrome&apos;s top right, then Add.</li>
          <li><b>The helper shows Errors on its card.</b> Press Remove on it, delete the folder and zip from Downloads, and start again from step 1.</li>
          <li><b>Using Edge, Brave or Arc.</b> Only Google Chrome is supported. Open this page in Chrome.</li>
          <li><b>Still stuck.</b> Send a screenshot of chrome://extensions to whoever gave you access to this app.</li>
        </ul>
      </details>
    </div>
  );

  if (!store) return manual;
  return (
    <div>
      <ol className="space-y-4 text-[14px]">
        <Li n="1">
          <b>Add the helper from the Chrome Web Store.</b> The button opens the helper&apos;s page in a new tab. Press <b>Add to Chrome</b> there, then <b>Add extension</b>.
          <span className="block mt-1.5"><ExtLink href={store} primary>Add to Chrome</ExtLink></span>
        </Li>
        <Li n="2">
          <b>That is it.</b> Chrome brings you back to this page and the helper links itself within a few seconds. If this page has not moved on after a minute, press <Kbd>{k.refresh}</Kbd>.
        </Li>
      </ol>
      <details className="mt-4 rounded-[10px] border border-line p-3 text-[13.5px]">
        <summary className="cursor-pointer font-semibold">Chrome will not let you add it? Add it by hand instead</summary>
        <div className="mt-3">{manual}</div>
      </details>
    </div>
  );
}

type Act = (key: string, fn: () => Promise<unknown>, ok: string) => Promise<boolean>;

/**
 * Instagram's official connection, explained for someone who has never opened Meta's developer site.
 * Once linked, new DMs arrive by webhook, past chats are pulled in, and the full history can be imported from Instagram's export.
 */
function InboxSetup({ v, business, appSecret, setAppSecret, igToken, setIgToken, work, act, copied, copy, reload }: {
  v: View; business: string; appSecret: string; setAppSecret: (s: string) => void; igToken: string; setIgToken: (s: string) => void;
  work: string; act: Act; copied: string; copy: (key: string, value: string) => void; reload: () => void;
}) {
  // The Meta app ID builds links to the right dashboard pages. It is saved to the account, so every
  // computer and every team member sees the same links. The Instagram app ID is a different number:
  // that one is what the sign in uses.
  const [typed, setTyped] = useState<string | null>(null);
  const [igId, setIgId] = useState("");
  const saved = v.meta.dashId;
  // A number pasted before saving existed is still in this browser: put it back in the box, ready to save.
  useEffect(() => { if (!saved) { try { const x = localStorage.getItem("setter.metaAppId"); if (x) setTyped(x); } catch {} } }, [saved]);
  const dash = typed ?? saved;
  const app = saved ? `https://developers.facebook.com/apps/${saved}` : "";
  const igSetup = `${app}/use_cases/customize/?use_case_enum=INSTAGRAM_BUSINESS&selected_tab=API-Setup&product_route=instagram-business`;
  const siteHost = (() => { try { return new URL(v.meta.site).host; } catch { return v.meta.site; } })();
  const saveDash = () => act("dash", () => api("/api/setup", "POST", { action: "keys", keys: { META_DASHBOARD_APP_ID: dash } }), "App ID saved. The next steps now have buttons that open your app's pages.").then((ok) => { if (ok) setTyped(null); });
  // Meta refuses app names containing its own brands, so the suggestion leaves them out.
  const appName = ((business || "My Business").replace(/\b(instagram|insta|ig|facebook|fb|meta|whatsapp)\b/gi, "").replace(/\s+/g, " ").trim() || "My Business") + " Inbox";
  const Say = ({ k, text }: { k: string; text: string }) => <Copy label={text} value={text} on={copied === k} onClick={() => copy(k, text)} />;
  const later = <span className="text-mute">The button appears once the App ID is saved in step 2.</span>;
  const history = (
    <div className="mt-4 rounded-[10px] border border-line p-4">
      <div className="font-semibold mb-1">Bring in every older message too</div>
      <p className="text-[13.5px] text-ink2 mb-2">Meta only lets apps read the last 20 messages of each chat. For the full history, ask Instagram for a copy of your messages and load it here. It is free and only message text is uploaded.</p>
      <p className="mb-3"><ExtLink href="https://accountscenter.instagram.com/info_and_permissions/dyi/">Open Instagram&apos;s Download your information page</ExtLink></p>
      <ImportHistory onDone={reload} />
    </div>
  );

  const rules = (
    <div className="mt-4 rounded-[10px] bg-surface2 p-3 text-[13px] text-ink2">
      <div className="font-semibold text-ink mb-1">Good to know</div>
      <ul className="list-disc pl-5 space-y-1">
        <li><b>The 24 hour rule.</b> Meta lets an app reply only within 24 hours of the lead&apos;s last message. After that, reply in Instagram (each chat has an Open in Instagram link) or switch on the Chrome helper, which sends it from your own Chrome.</li>
        <li><b>Human Agent.</b> Replying up to 7 days later through Meta needs Meta&apos;s approval for the Human Agent feature (App Review, with business verification). It is not needed to use the setter.</li>
        <li><b>Close friend tag.</b> A lead tagged Close friend never gets a message from the AI or any automation until the tag is removed. You can still message them yourself.</li>
        <li><b>The Instagram login lasts 60 days</b> and renews itself every week. If Instagram ever shows as disconnected, press Continue with Instagram again.</li>
      </ul>
    </div>
  );
  const guide = (
    <Walkthrough id="instagram-v2" steps={[
      { title: "Make your free Meta app", body: (<>
        Press the button below. A Meta page opens in a new tab. Go through it screen by screen like this:
        <span className="block mt-1.5"><ExtLink href="https://developers.facebook.com/apps/creation/" primary>Open Meta&apos;s create app page</ExtLink></span>
        <ul className="mt-2.5 space-y-2.5 list-disc pl-5">
          <li><b>Asked to log in?</b> Log in with the Facebook account you use for your business page.</li>
          <li><b>Asked to &quot;Register&quot; or &quot;Get started&quot; as a developer?</b> Press it, tick to accept, put in your phone number or email when asked, type the code Meta sends you, and press <b>Continue</b> until you see <b>Create app</b>. It is free.</li>
          <li>
            {business.trim() ? (
              <><b>App name.</b> Type this exactly. Meta says no to any name with Instagram, Facebook, Meta or IG in it, so do not add those.<Say k="appname" text={appName} /></>
            ) : (
              <><b>App name.</b> Type your business name, then a space, then the word <b>Inbox</b>. For example, a business called Bright Coaching types <b>Bright Coaching Inbox</b>. Do not use the words Instagram, Facebook, Meta or IG: Meta says no to them.</>
            )}
          </li>
          <li><b>App contact email.</b> Type the email you check every day. Meta sends important notices there.</li>
          <li><b>Press Next.</b></li>
          <li>
            <b>&quot;Add use cases&quot;.</b> This is a list of boxes that say what the app is for.
            <ul className="mt-1.5 space-y-1 list-[circle] pl-5">
              <li>On the left, press <b>All</b> (or <b>Featured</b>) so you see the whole list. You can also type <b>Instagram</b> in the search box.</li>
              <li>Tick the one box that says <b>Manage messaging and content on Instagram</b>. This is what lets the appointment setter read and answer your DMs.</li>
              <li>Do <b>not</b> tick anything else. Not Facebook Login, not WhatsApp, not Messenger, not ads. More boxes only make Meta ask more questions.</li>
              <li>Press <b>Next</b>.</li>
              <li>No list like this? If Meta asks for an <b>app type</b> instead, choose <b>Business</b>, press Next, and later add the <b>Instagram</b> product with its <b>Set up</b> button.</li>
            </ul>
          </li>
          <li><b>&quot;Business&quot; or &quot;Which business portfolio&quot;.</b> Pick your business if it is in the list. If the list is empty, choose <b>I don&apos;t want to connect a business portfolio yet</b>. Press <b>Next</b>.</li>
          <li><b>&quot;Requirements&quot; and &quot;Overview&quot;.</b> Just press <b>Next</b>, then <b>Go to dashboard</b>. If Meta asks for your Facebook password again, type it.</li>
        </ul>
        <span className="block mt-2 text-[12.5px] text-mute">You are done with this step when you see your app&apos;s dashboard with your app&apos;s name at the top left.</span>
      </>) },
      { title: "Paste your App ID", body: (<>
        On that dashboard, at the top left under the app name, is <b>App ID</b> followed by a long number, like 1234567890123456. Click the number to copy it, then click in this box and paste it with <Kbd>Cmd + V</Kbd>. The next steps then get buttons that open the exact pages inside your app.
        <span className="flex flex-wrap items-center gap-2 mt-1.5">
          <input className="field !w-72" inputMode="numeric" placeholder="Paste the App ID here" value={dash} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter" && dash.length >= 10 && dash !== saved) saveDash(); }} aria-label="Meta app ID" />
          <Button variant="primary" disabled={work === "dash" || dash.length < 10 || dash === saved} onClick={saveDash}>{work === "dash" ? "Saving…" : dash === saved && saved ? "Saved" : "Save"}</Button>
        </span>
        {dash.length > 0 && dash.length < 10 && <span className="block text-[12.5px] text-warn mt-1">That looks too short. It is usually 15 or 16 digits.</span>}
        {saved && dash === saved && <span className="block text-[12.5px] text-ok mt-1">Saved: {saved}. The buttons in the next steps open this app.</span>}
        {saved && dash !== saved && dash.length >= 10 && <span className="block text-[12.5px] text-mute mt-1">Press Save to use this number instead of {saved}.</span>}
      </>) },
      { title: "Give it permission to read your DMs", body: (<>
        These are the only three things it needs. The quickest way: press the button, and on the page that opens, under <b>1. Add required messaging permissions</b>, press <b>Add all required permissions</b>. Done.
        <span className="block mt-1.5">{app ? <ExtLink href={igSetup} primary>Open my app&apos;s Instagram set up</ExtLink> : later}</span>
        <span className="block mt-2 text-mute">No such button? Do it one by one:</span>
        <ul className="mt-1.5 space-y-2 list-disc pl-5">
          <li>Next to <b>Manage messaging and content on Instagram</b>, press <b>Customize</b> (or <b>Edit</b>).</li>
          <li>Press <b>Permissions and features</b> on the left.</li>
          <li>
            Find each of these three. If its button says <b>Add</b>, press it. If it already says <b>Ready for testing</b> or <b>Added</b>, leave it.
            <span className="block mt-1.5 space-y-1">
              <span className="block"><code className="rounded-md bg-surface2 px-1.5 py-0.5 text-[12.5px]">instagram_business_basic</code> <span className="text-mute">your username and profile</span></span>
              <span className="block"><code className="rounded-md bg-surface2 px-1.5 py-0.5 text-[12.5px]">instagram_business_manage_messages</code> <span className="text-mute">read your DMs and send replies</span></span>
              <span className="block"><code className="rounded-md bg-surface2 px-1.5 py-0.5 text-[12.5px]">instagram_business_manage_comments</code> <span className="text-mute">answer people who comment on your posts</span></span>
            </span>
          </li>
          <li>You do <b>not</b> need <b>Request advanced access</b> or App Review. Meta only asks for that when an app is used on accounts you do not own.</li>
        </ul>
      </>) },
      { title: "Add your Instagram as a tester", body: (<>
        While the app is new, it only works for accounts you add to it.
        <ul className="mt-2.5 space-y-2 list-disc pl-5">
          <li>Press this button: {app ? <ExtLink href={`${app}/roles/roles/`}>Open my app&apos;s roles</ExtLink> : later}</li>
          <li>Press <b>Add people</b>, choose <b>Instagram Tester</b>, type your Instagram username{v.outreach.account ? <> (<b>{v.outreach.account}</b>)</> : null} with no @, and press <b>Add</b>.</li>
          <li>Accept it on Instagram, signed in as that account: <b>Settings</b>, <b>Apps and websites</b>, the <b>Tester invitations</b> tab, then <b>Accept</b>. <ExtLink href="https://www.instagram.com/accounts/manage_access/">Open Instagram&apos;s apps and websites</ExtLink></li>
          <li>Already accepted? The app is listed there as <b>Authorised by you</b>. Nothing more to do.</li>
        </ul>
      </>) },
      { title: "Copy the Instagram app ID and secret", body: (<>
        Press the button. It opens <b>API setup with Instagram login</b>.
        <span className="block mt-1.5">{app ? <ExtLink href={igSetup} primary>Open my app&apos;s Instagram set up</ExtLink> : later}</span>
        <ul className="mt-2.5 space-y-2 list-disc pl-5">
          <li>Find <b>Instagram app ID</b> and <b>Instagram app secret</b> at the top of that page, under <b>Instagram app name</b>.</li>
          <li>The Instagram app ID is a <b>different</b> number from step 2. Copy it into the first box below.</li>
          <li>For the secret, press <b>Show</b>. Meta asks you to <b>re-enter your Facebook password</b> first: type it and press Submit. The secret is 32 letters and numbers. Copy it into the second box and press <b>Save</b>.</li>
        </ul>
        <span className="flex flex-wrap gap-2 mt-2">
          <input className="field !w-56" inputMode="numeric" placeholder="Instagram app ID" value={igId || v.meta.appId} onChange={(e) => setIgId(e.target.value.replace(/\D/g, ""))} aria-label="Instagram app ID" />
          <input className="field flex-1 min-w-[180px]" type="password" placeholder="Instagram app secret" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} aria-label="Instagram app secret" />
          <Button variant="primary" disabled={work === "meta" || !(igId || v.meta.appId) || appSecret.trim().length < 10} onClick={async () => { if (await act("meta", () => api("/api/setup", "POST", { action: "keys", keys: { META_APP_ID: igId || v.meta.appId, META_APP_SECRET: appSecret.trim() } }), "Saved. Now do the next step.")) setAppSecret(""); }}>Save</Button>
        </span>
        {v.meta.configured && <span className="block text-[12.5px] text-ok mt-1">Saved.</span>}
        {(igId && dash && igId === dash) ? <span className="block text-[12.5px] text-warn mt-1">This is the same number as step 2. Copy the Instagram app ID from the Instagram page instead.</span> : null}
      </>) },
      { title: "Switch on instant messages (webhooks)", body: (<>
        On the same <b>API setup with Instagram login</b> page, open <b>3. Configure webhooks</b> (on older pages it is number 2).
        <ul className="mt-2.5 space-y-2 list-disc pl-5">
          <li><b>Callback URL</b>: paste <Say k="hook" text={v.meta.webhook} /></li>
          <li><b>Verify token</b>: paste {v.meta.verifyToken ? <Say k="vt" text={v.meta.verifyToken} /> : <span className="text-mute">only the account owner can see it.</span>}</li>
          <li>Press <b>Verify and save</b>. A list of fields appears.</li>
          <li>Turn on (Subscribe) <b>messages</b>, <b>messaging_referral</b> and <b>comments</b>. Turn on <b>message_echoes</b> too if it is listed. The others (reactions, seen, postbacks) do no harm on or off.</li>
          <li>The section gets a green tick once Meta has checked the address. If Meta says it could not verify it, check the Callback URL has no space at the end and try again.</li>
        </ul>
      </>) },
      { title: "Add the return address for the sign in", body: (<>
        On the same page, open <b>4. Set up Instagram business login</b> (on older pages number 3), then press <b>Business login settings</b>.
        <ul className="mt-2.5 space-y-2 list-disc pl-5">
          <li>In <b>OAuth redirect URIs</b>, paste <Say k="redir" text={v.meta.redirect} /> and press <b>Save</b>.</li>
          <li>Meta sometimes adds a <b>/</b> to the end by itself. If it did, delete it and save again.</li>
          <li>Leave <b>Deauthorize callback URL</b> and <b>Data deletion request URL</b> empty.</li>
        </ul>
      </>) },
      { title: "Fill in the app's basic details", body: (<>
        Meta needs these before the app can go Live. Press the button: it opens <b>App settings</b>, then <b>Basic</b>.
        <span className="block mt-1.5">{app ? <ExtLink href={`${app}/settings/basic/`} primary>Open my app&apos;s basic settings</ExtLink> : later}</span>
        <ul className="mt-2.5 space-y-2 list-disc pl-5">
          <li><b>App domains</b>: paste <Say k="dom" text={siteHost} /> and press Enter so it turns into a tag.</li>
          <li><b>Privacy policy URL</b>: paste <Say k="pp" text={`${v.meta.site}/privacy`} /></li>
          <li><b>Terms of Service URL</b>: paste the same address, <Say k="tos" text={`${v.meta.site}/privacy`} /></li>
          <li><b>User data deletion</b>: choose <b>Data deletion instructions URL</b> and paste <Say k="dd" text={`${v.meta.site}/data-deletion`} /></li>
          <li><b>App icon</b>: press <b>choose file on your device</b>, pick a square logo at least 1024 by 1024 pixels, then <b>Upload</b>.</li>
          <li><b>Category</b>: choose <b>Business and pages</b>.</li>
          <li>Press <b>Save changes</b> at the bottom. You should see <b>Changes saved</b>, and the red <b>Currently ineligible for submission</b> box at the top goes away when you reload.</li>
        </ul>
      </>) },
      { title: "Switch the app to Live", body: (<>
        Meta only sends instant messages to apps that are <b>Live</b>.
        <ul className="mt-2.5 space-y-2 list-disc pl-5">
          <li>Press <b>Publish</b> in the left menu of your app (it shows <b>Unpublished</b> next to it). The page says <b>All required app settings are complete</b>. Press the <b>Publish</b> button at the bottom. Meta shows <b>Your app was successfully published</b>, and the left menu now says <b>Published</b>. {app ? <ExtLink href={`${app}/dashboard/`}>Open my app&apos;s dashboard</ExtLink> : later}</li>
          <li>On older dashboards it is a switch at the top: <b>App mode: Development</b>, turned to <b>Live</b>.</li>
          <li>If Meta lists something still missing, it links to it: fill it in and try again.</li>
          <li>If Meta asks you to verify your business first, start that and carry on with the last step anyway. Until the app is Live, messages come in every 20 seconds while the Ainable Setter inbox is open, instead of instantly all the time.</li>
        </ul>
      </>) },
      { title: "Connect your Instagram", body: (<>
        {v.meta.configured ? "Press the button." : "This button appears once step 5 is saved."} Instagram opens and says your app <b>is requesting access</b> to your account. Log in if it asks, then press <b>Allow</b>. You come straight back here, and this section now says <b>Connected as @yourname</b>.
        {v.meta.configured && v.meta.https && <span className="block mt-1.5"><a href="/api/meta/connect?back=connect" className="inline-flex items-center justify-center rounded-[10px] bg-ink text-onbrand px-4 h-10 text-[14px] font-medium hover:opacity-85">Continue with Instagram</a></span>}
      </>) },
      { title: "Let your past chats load", body: (<>
        Past chats start loading by themselves the moment you connect, 25 chats at a time, each with its last 20 messages.
        <ul className="mt-2.5 space-y-2 list-disc pl-5">
          <li>A big inbox takes a while: about 2,000 chats took 20 minutes. Keep the inbox open and it carries on by itself every 20 seconds until every chat is in.</li>
          <li>To finish it in one go, press <b>Pull in past chats again</b> at the top of this section and leave the page open until it says the chats are in.</li>
          <li>Profile pictures fill in 30 at a time over the next half hour. Instagram does not share a picture for every account; those keep their initials.</li>
        </ul>
      </>) },
      { title: "Check it all works", body: (<>
        <ul className="space-y-2 list-disc pl-5">
          <li>Ask someone to send your Instagram a DM. It should appear in the inbox within a few seconds, and this section shows <b>Instant messages: last one</b> a moment ago.</li>
          <li>Reply to them from the inbox. It should arrive on their phone straight away.</li>
          <li>Nothing arriving? Check step 6 has a green tick and step 9 says Published, then press <b>Continue with Instagram</b> again.</li>
        </ul>
      </>) },
    ]} />
  );
  // The same steps, folded away once they are done, for checking or redoing the set up by hand.
  const byHand = (
    <details className="mt-4 rounded-[10px] border border-line p-3 text-[13.5px]">
      <summary className="cursor-pointer font-semibold">Every set up step, to check or redo it by hand</summary>
      <p className="text-[13px] text-ink2 mt-2 mb-3">The exact steps used to connect this account, in order. Use them to check a setting, fix one that changed, or set up another account from scratch.</p>
      {guide}
      {rules}
    </details>
  );

  if (v.inbox.connected) {
    return (
      <>
        <ul className="text-[14px] text-ink2 space-y-1 list-disc pl-5">
          <li>Every message, received or sent from the Instagram app, arrives by itself, day and night. No browser needed.</li>
          <li>Instant messages (webhooks): {v.inbox.lastWebhookAt ? <>last one {ago(v.inbox.lastWebhookAt)}.</> : <>none received yet. Until the app is Live, messages come in every 20 seconds while the inbox is open.</>}</li>
          <li>Background check (renews the Instagram login, catches anything missed): {v.inbox.lastSyncAt ? <>last ran {ago(v.inbox.lastSyncAt)}.</> : <>has not run yet.</>}</li>
          <li>Your past chats were pulled in when you connected. Press the button to pull them again.</li>
        </ul>
        {v.inbox.syncError && <p className="mt-2 text-[13px] tone-err rounded-[8px] px-2.5 py-1.5">The last check failed: {v.inbox.syncError}</p>}
        <div className="mt-3"><Button disabled={work === "backfill"} onClick={() => act("backfill", () => backfillAll(true), "Past chats pulled in. Open the inbox to see them.")}>{work === "backfill" ? "Pulling in past chats… this can take a few minutes" : "Pull in past chats again"}</Button></div>
        {history}
        {byHand}
      </>
    );
  }

  return (
    <>
      <div className="rounded-[10px] bg-surface2 p-3 text-[13.5px] text-ink2 mb-4">
        <div className="font-semibold text-ink mb-1">What this gives you</div>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>Every new DM lands in the app on its own, even with your computer off. Nothing to capture by hand.</li>
          <li>All your past chats are pulled in straight away, with their last 20 messages each.</li>
          <li>Your full message history can be added from Instagram&apos;s download, further down.</li>
        </ul>
      </div>

      {v.meta.configured && v.meta.https ? (
        <>
          <p className="text-[14px] text-ink2 mb-3">Your Meta app is set up. Press the button: Instagram shows its own sign in and approval screen. Your password is typed on Instagram, never here. Past chats start coming in as soon as you approve.</p>
          <a href="/api/meta/connect?back=connect" className="inline-flex items-center justify-center rounded-[10px] bg-ink text-onbrand px-4 h-10 text-[14px] font-medium hover:opacity-85">Continue with Instagram</a>
          <p className="text-[12.5px] text-mute mt-2">Instagram says the app is not available, or the account is not a tester? Do step 4 of the set up again: <ExtLink href="https://www.instagram.com/accounts/manage_access/">accept the tester invite</ExtLink></p>
          {byHand}
        </>
      ) : (
        <>
          <p className="text-[14px] text-ink2 mb-1"><b>Set up once, about 20 minutes.</b> Meta only lets apps read DMs through an app of your own, so you make a free one. Do these in order in Chrome, signed in to the Facebook account that manages your business page. Every link opens the exact page.</p>
          <p className="text-[12.5px] text-mute mb-3">Your Instagram must be a Business or Creator account. If it is personal: Instagram, Settings, Account type and tools, Switch to professional account.</p>
          {guide}
          {rules}
          <details className="mt-4 rounded-[10px] border border-line p-3 text-[13.5px]">
            <summary className="cursor-pointer font-semibold">The button will not work? Connect with a token instead</summary>
            <ol className="space-y-3 mt-3">
              <Li n="a">On your app&apos;s Instagram page, find <b>Generate access tokens</b>. Press <b>Add account</b> and log in to your Instagram. Your account appears in the list: press <b>Generate token</b> next to it, tick the box to agree, and press <b>Copy</b>. {app ? <ExtLink href={`${app}/instagram-business/API-Setup/`}>Open your app&apos;s Instagram set up</ExtLink> : later}</Li>
              <Li n="b">
                Paste the token here and press Connect.
                <span className="flex gap-2 mt-1.5">
                  <input className="field flex-1" type="password" placeholder="Paste the token" value={igToken} onChange={(e) => setIgToken(e.target.value)} aria-label="Instagram token" />
                  <Button variant="primary" disabled={work === "ig" || igToken.trim().length < 20} onClick={async () => { if (await act("ig", () => api("/api/meta/token", "POST", { accessToken: igToken.trim() }), "Instagram is connected. Your past chats are coming in now.")) setIgToken(""); }}>{work === "ig" ? "Connecting…" : "Connect"}</Button>
                </span>
              </Li>
            </ol>
          </details>
          <details className="mt-3 rounded-[10px] border border-line p-3 text-[13.5px]">
            <summary className="cursor-pointer font-semibold">Letting clients connect their own Instagram</summary>
            <p className="mt-2 text-ink2">Testers work straight away. Before people you have not added can press Continue with Instagram, Meta reviews the app: in your app, open <b>App review</b>, request <b>instagram_business_manage_messages</b>, explain it answers the business&apos;s own DMs, and add a short screen recording. Approval usually takes one to two weeks.</p>
          </details>
        </>
      )}
      {history}
    </>
  );
}



/**
 * A long set of steps as a checklist. Every step is visible with a tick box; the first one not ticked is open,
 * so it is always clear what to do next. Ticks are remembered in this browser.
 */
function Walkthrough({ id, steps }: { id: string; steps: { title: string; body: React.ReactNode }[] }) {
  const key = `setter.check.${id}`;
  const [done, setDone] = useState<number[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    try { const d = JSON.parse(localStorage.getItem(key) || "[]"); if (Array.isArray(d)) setDone(d.filter((n) => typeof n === "number" && n < steps.length)); } catch {}
  }, [key, steps.length]);
  const next = steps.findIndex((_, i) => !done.includes(i));
  const shown = open ?? next;
  const save = (d: number[]) => { setDone(d); try { localStorage.setItem(key, JSON.stringify(d)); } catch {} };
  const tick = (i: number, on: boolean) => {
    const d = on ? [...new Set([...done, i])] : done.filter((n) => n !== i);
    save(d);
    setOpen(null);
    // Ticking a step opens the next one not done yet.
    const after = steps.findIndex((_, k) => !d.includes(k));
    if (on && after >= 0) setTimeout(() => rows.current[after]?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
  };
  const count = done.length;
  return (
    <div className="rounded-[12px] border border-linestrong bg-surface">
      <div className="px-4 pt-4 pb-3 border-b border-line">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-semibold text-ink">{count === steps.length ? "All done" : `${count} of ${steps.length} done`}</span>
          {count > 0 && <button className="text-mute underline" onClick={() => { save([]); setOpen(null); }}>Start again</button>}
        </div>
        <div className="h-1.5 rounded-full bg-surface2 mt-2 overflow-hidden"><div className="h-full bg-ink transition-all" style={{ width: `${(count / steps.length) * 100}%` }} /></div>
      </div>
      <ul>
        {steps.map((x, i) => {
          const isDone = done.includes(i);
          const isOpen = shown === i;
          return (
            <li key={i} ref={(el) => { rows.current[i] = el; }} className={`border-b border-line last:border-b-0 scroll-mt-4 ${isOpen ? "bg-surface2/40" : ""}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" className="w-5 h-5 shrink-0 cursor-pointer accent-[var(--c-ink)]" checked={isDone} onChange={(e) => tick(i, e.target.checked)} aria-label={`Mark step ${i + 1} done: ${x.title}`} />
                <button className="flex-1 text-left flex items-center gap-2 min-w-0" onClick={() => setOpen(isOpen ? -1 : i)} aria-expanded={isOpen}>
                  <span className={`text-[15px] font-semibold ${isDone ? "text-mute line-through" : "text-ink"}`}>{i + 1}. {x.title}</span>
                  {!isDone && i === next && !isOpen && <span className="text-[11.5px] font-semibold rounded-full bg-ink text-onbrand px-2 py-0.5">Do this next</span>}
                  <span className="ml-auto text-mute text-[12px]" aria-hidden>{isOpen ? "▲" : "▼"}</span>
                </button>
              </div>
              {isOpen && (
                <div className="px-4 pb-4 pl-12">
                  <div className="walk text-[15px] leading-relaxed text-ink2">{x.body}</div>
                  <label className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-ink text-onbrand px-4 h-10 text-[14px] font-medium cursor-pointer hover:opacity-85">
                    <input type="checkbox" className="w-4 h-4 accent-white" checked={isDone} onChange={(e) => tick(i, e.target.checked)} />
                    {isDone ? "Done" : "Tick when done"}
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
