"use client";
import { useCallback, useEffect, useState } from "react";
import { api, Banner, Button, Toggle } from "@/components/ui";

interface Cal {
  connected: boolean; ready: boolean; enabled: boolean; tokenSet: boolean; zone: string; timezone: string;
  user?: { name: string; url: string; timezone: string };
  eventTypes: { uri: string; name: string; minutes: number; url: string }[];
  eventTypeUri: string; offer: number; daysAhead: number; minNoticeHours: number; lastError?: string;
}
interface View { calendar: Cal; slots: { start: string; url: string; label: string }[]; picks: string[]; zone: string; error: string; booked?: number }

export const CALENDLY_TOKEN_PAGE = "https://calendly.com/integrations/api_webhooks";

/** Connects a Calendly account and shows, live, the times the AI would offer a lead right now. */
export default function CalendarConnect({ onChange }: { onChange?: () => void }) {
  const [v, setV] = useState<View | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const load = useCallback(() => api<View>("/api/calendar").then(setV).catch((e) => setMsg({ text: (e as Error).message, tone: "error" })), []);
  useEffect(() => { load(); }, [load]);

  const act = async (label: string, body: Record<string, unknown>, done?: string) => {
    setBusy(label); setMsg(null);
    try {
      const r = await api<View>("/api/calendar", "POST", body);
      setV(r);
      if (done) setMsg({ text: done, tone: "ok" });
      onChange?.();
    } catch (e) {
      setMsg({ text: (e as Error).message, tone: "error" });
    }
    setBusy("");
  };

  if (!v) return <p className="text-[13px] text-mute">Checking the calendar…</p>;
  const c = v.calendar;

  if (!c.connected) {
    return (
      <div className="text-[13.5px]">
        <ol className="space-y-3">
          <li className="flex gap-2"><span className="font-semibold">1.</span><span>Open this Calendly page, press <b>Generate new token</b>, give it any name, then press <b>Copy token</b>. <a href={CALENDLY_TOKEN_PAGE} target="_blank" rel="noopener noreferrer" className="underline font-medium whitespace-nowrap">Open Calendly&apos;s token page ↗</a></span></li>
          <li className="flex gap-2"><span className="font-semibold">2.</span>
            <span className="flex-1">Paste it here and press Connect.
              <span className="flex gap-2 mt-2">
                <input className="field" type="password" placeholder="Paste the Calendly token" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Calendly token" />
                <Button variant="primary" disabled={!token.trim() || busy === "connect"} onClick={() => act("connect", { action: "connect", token }, "Calendly connected.").then(() => setToken(""))}>{busy === "connect" ? "Connecting…" : "Connect"}</Button>
              </span>
            </span>
          </li>
        </ol>
        <p className="text-[12px] text-mute mt-3">The app only reads your free times and your booked calls. It cannot change or cancel anything in your calendar. The token stays on this computer.</p>
        {msg && <div className="mt-3"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
      </div>
    );
  }

  const type = c.eventTypes.find((e) => e.uri === c.eventTypeUri);
  const pick = (label: string, value: number, options: number[], key: string, unit: (n: number) => string) => (
    <label className="block">
      <span className="font-medium text-[13px]">{label}</span>
      <select className="field mt-1" value={value} onChange={(e) => act("save", { action: "save", [key]: Number(e.target.value) })} aria-label={label}>
        {options.map((n) => <option key={n} value={n}>{unit(n)}</option>)}
      </select>
    </label>
  );

  return (
    <div className="text-[13.5px]">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-semibold">Connected to {c.user?.name}&apos;s Calendly</div>
          <div className="text-[12.5px] text-mute [overflow-wrap:anywhere]">{c.user?.url}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0"><span className="text-[12.5px] text-mute">AI offers times</span><Toggle label="AI offers calendar times" on={c.enabled} onChange={(on) => act("save", { action: "save", enabled: on })} /></div>
      </div>

      {!c.eventTypes.length ? (
        <div className="mt-3"><Banner tone="warn">This Calendly account has no active meeting types. Create one in Calendly, then press Check again.</Banner></div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <label className="block col-span-2 md:col-span-1">
            <span className="font-medium text-[13px]">Meeting to book</span>
            <select className="field mt-1" value={c.eventTypeUri} onChange={(e) => act("save", { action: "save", eventTypeUri: e.target.value })} aria-label="Meeting to book">
              {c.eventTypes.map((e) => <option key={e.uri} value={e.uri}>{e.name} ({e.minutes} min)</option>)}
            </select>
          </label>
          {pick("Times offered at once", c.offer, [2, 3, 4], "offer", (n) => `${n} times`)}
          {pick("Look ahead", c.daysAhead, [2, 3, 5, 7, 10, 14], "daysAhead", (n) => `${n} days`)}
          {pick("Shortest notice", c.minNoticeHours, [0, 1, 2, 3, 6, 12, 24, 48], "minNoticeHours", (n) => (n ? `${n} hour${n === 1 ? "" : "s"}` : "None"))}
        </div>
      )}

      <div className="mt-4 rounded-[10px] border border-line p-3 bg-canvas">
        <div className="flex items-center gap-3">
          <div className="font-semibold flex-1">What the AI would offer a lead right now</div>
          <Button disabled={busy === "check"} onClick={async () => { setBusy("check"); await api<View>("/api/calendar?fresh=1").then(setV).catch((e) => setMsg({ text: (e as Error).message, tone: "error" })); setBusy(""); }}>{busy === "check" ? "Checking…" : "Check again"}</Button>
        </div>
        {v.error ? <p className="text-err mt-1">{v.error}</p>
          : !c.enabled ? <p className="text-mute mt-1">Switched off. The AI sends your normal booking link instead.</p>
            : v.picks.length ? (
              <>
                <p className="mt-1">&ldquo;i&apos;ve got {v.picks.length > 1 ? `${v.picks.slice(0, -1).join(", ")} or ${v.picks[v.picks.length - 1]}` : v.picks[0]} ({v.zone}). which works best for you?&rdquo;</p>
                <p className="text-[12.5px] text-mute mt-1">{v.slots.length}{v.slots.length === 60 ? "+" : ""} free times found for {type?.name} in the next {c.daysAhead} days. When the lead picks one, the AI sends the link that opens Calendly on that exact time.</p>
              </>
            ) : <p className="text-mute mt-1">No free times in the next {c.daysAhead} days for {type?.name}. Until some open up, the AI sends your normal booking link.</p>}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <Button disabled={busy === "bookings"} onClick={() => act("bookings", { action: "bookings" }).then(() => setMsg({ text: "Checked Calendly for new bookings.", tone: "ok" }))}>{busy === "bookings" ? "Checking…" : "Check for new bookings"}</Button>
        <Button disabled={busy === "refresh"} onClick={() => act("refresh", { action: "refresh" }, "Meeting types reloaded.")}>Reload meeting types</Button>
        <Button disabled={!!busy} onClick={() => { if (window.confirm("Disconnect Calendly? The AI will go back to sending your normal booking link.")) act("disconnect", { action: "disconnect" }, "Calendly disconnected."); }}>Disconnect</Button>
      </div>
      {msg && <div className="mt-3"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
    </div>
  );
}
