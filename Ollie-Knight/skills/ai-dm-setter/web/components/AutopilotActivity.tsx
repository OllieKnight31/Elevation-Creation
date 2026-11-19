"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SweepStatus } from "@/lib/sweep";
import { api, Banner, Button, every, onDataChange, timeAgo } from "./ui";
import { Icon, ICONS } from "./layout";

/*
 * Shows the owner that Autopilot is working. A strip at the top of the inbox says whether it is on and what it has
 * sent; the button opens a panel with what is due, who cannot be reached and why, and every recent action.
 * All of it comes from /api/sweep. It reloads on the same "something was saved" signal as the rest of the app, plus
 * one slow reload a minute for the numbers that move with the clock alone (sent in the last hour, due now).
 */

/** Activity lines asked for by the strip alone, by the open panel, and after Show more. */
const LINES_STRIP = 1;
const LINES_PANEL = 100;
const LINES_ALL = 300;
/** Counts that only time changes are refreshed this often. Slower than the data change signal, which is 30 seconds at its slowest. */
const SLOW_RELOAD_MS = 60_000;
/** The clock notes that it looked at most every 10 minutes, so it only counts as stopped well after that. */
const CLOCK_LATE_MS = 20 * 60_000;

const KIND = { answer: "Reply", followUp: "Follow up" } as const;
const OUTCOME = {
  sent: { text: "Sent", cls: "tone-ok" },
  skipped: { text: "Held back", cls: "bg-surface2 text-ink2" },
  failed: { text: "Failed", cls: "tone-err" },
} as const;

const n = (v: number) => v.toLocaleString("en-GB");
const ago = (iso: string) => { const t = timeAgo(iso); return t === "now" ? "just now" : /^\d+[mhd]$/.test(t) ? `${t} ago` : t; };
const clock = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function useSweep(lines: number) {
  const [s, setS] = useState<SweepStatus | null>(null);
  const [err, setErr] = useState("");
  // One load at a time, and an answer that arrives after a newer question is dropped.
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const r = await api<SweepStatus>(`/api/sweep?log=${lines}`);
      if (mine === seq.current) { setS(r); setErr(""); }
    } catch (e) {
      if (mine === seq.current) setErr((e as Error).message);
    }
  }, [lines]);
  useEffect(() => {
    load();
    const off = onDataChange(load);
    const stop = every(load, SLOW_RELOAD_MS);
    return () => { seq.current++; off(); stop(); };
  }, [load]);
  return { s, err };
}

/** The one line that says what Autopilot is doing, and whether that is good news. */
function headline(s: SweepStatus): { text: string; tone: "ok" | "warn" | "mute" } {
  if (!s.on) return { text: "Autopilot is off", tone: "mute" };
  if (s.state === "off") return { text: "Autopilot is on, catching up is off", tone: "warn" };
  if (s.state === "running") return { text: "Autopilot is sending now", tone: "ok" };
  if (s.state === "outsideHours") return { text: "Autopilot is on, outside sending hours", tone: "mute" };
  return { text: "Autopilot is on and working", tone: "ok" };
}

/** When the clock last looked, and whether it looks stopped. */
function clockOf(s: SweepStatus) {
  const last = [s.checkedAt, s.lastAt].filter(Boolean).sort().pop() ?? "";
  const running = s.on && s.state !== "off";
  const late = running && (!last || Date.now() - new Date(last).getTime() > CLOCK_LATE_MS);
  return { last, late };
}

const DOT = { ok: "bg-ok", warn: "bg-warn", mute: "bg-linestrong" } as const;

export default function AutopilotActivity({ onOpenChat, canSettings }: { onOpenChat: (id: string) => void; canSettings: boolean }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const { s, err } = useSweep(open ? (all ? LINES_ALL : LINES_PANEL) : LINES_STRIP);

  if (!s) {
    // Nothing to show yet. A failed load says so in a line, never a blank gap the owner reads as "not working".
    return err ? <div className="mt-3 text-[12px] text-mute">Autopilot activity could not be loaded: {err}</div> : null;
  }
  const h = headline(s);
  const ck = clockOf(s);
  const dueText = s.due.total ? `${n(s.due.total)} due now` : "nothing due";

  return (
    <>
      <div className="mt-3 rounded-[12px] border border-line px-3 py-2 flex items-center gap-2.5" aria-label="Autopilot activity">
        <span className={`w-2 h-2 rounded-full shrink-0 ${ck.late ? DOT.warn : DOT[h.tone]} ${s.state === "running" ? "animate-pulse" : ""}`} />
        <div className="min-w-0 flex-1 leading-snug">
          <div className="text-[12.5px] font-medium truncate">{ck.late ? "Autopilot is on, but its clock looks stopped" : h.text}</div>
          <div className="text-[11.5px] text-mute truncate tabular-nums">{n(s.sent.lastHour)} sent this hour · {n(s.sent.today)} today · {dueText}</div>
        </div>
        <Button className="shrink-0 !h-7 !px-2.5 !text-[12px]" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>Activity</Button>
      </div>
      {open && <Panel s={s} err={err} all={all} onAll={() => setAll(true)} canSettings={canSettings} onClose={() => setOpen(false)} onOpenChat={(id) => { setOpen(false); onOpenChat(id); }} />}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[12px] border border-line px-3 py-2.5 min-w-0">
      <div className="label truncate">{label}</div>
      <div className="text-[22px] font-semibold leading-tight tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-[11.5px] text-mute leading-snug mt-0.5">{sub}</div>}
    </div>
  );
}

function Panel({ s, err, all, onAll, canSettings, onClose, onOpenChat }: { s: SweepStatus; err: string; all: boolean; onAll: () => void; canSettings: boolean; onClose: () => void; onOpenChat: (id: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const h = headline(s);
  const ck = clockOf(s);
  const r = s.reach;
  const reasons = r.reasons.filter((x) => x.count > 0);
  const ha = r.humanAgent;
  const chat = (id: string, body: React.ReactNode, cls: string) => (
    <a href={`/inbox?c=${encodeURIComponent(id)}`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); onOpenChat(id); }} className={cls}>{body}</a>
  );

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label="Autopilot activity" className="pop fixed right-3 top-3 bottom-3 z-50 w-[460px] max-w-[calc(100%-24px)] flex flex-col text-[13px]">
        <div className="px-4 h-12 flex items-center gap-2 border-b border-line shrink-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${ck.late ? DOT.warn : DOT[h.tone]} ${s.state === "running" ? "animate-pulse" : ""}`} />
          <h2 className="font-semibold text-[15px] flex-1 truncate">Autopilot activity</h2>
          <button onClick={onClose} aria-label="Close Autopilot activity" className="text-mute hover:text-ink"><Icon d={ICONS.close} /></button>
        </div>

        <div className="flex-1 overflow-y-auto scroll">
          <div className="px-4 py-3 border-b border-line flex flex-col gap-2">
            {err && <Banner tone="error">Could not refresh: {err}. Showing the last numbers loaded.</Banner>}
            <div>
              <div className="text-[14px] font-medium">{h.text}</div>
              <div className="text-mute leading-snug mt-0.5">{s.note}</div>
            </div>
            {ck.late && (
              <Banner tone="warn">
                {ck.last ? `The clock last checked in ${ago(ck.last)}. It should check in at least every 10 minutes.` : "The clock has not checked in yet."} Until it does, waiting chats are not answered by themselves.{canSettings && <> Ask whoever set the app up to check the once a minute timer.</>}
              </Banner>
            )}
            <div className="text-[12px] text-mute leading-snug">
              <span title={ck.last ? clock(ck.last) : undefined}>Clock last checked in: <b className="text-ink2 font-medium">{ck.last ? ago(ck.last) : "not yet"}</b></span>
              {" · "}
              <span title={s.lastAt ? clock(s.lastAt) : undefined}>Last batch started: <b className="text-ink2 font-medium">{s.lastAt ? ago(s.lastAt) : "none yet"}</b></span>
              {" · "}
              Sending hours {s.hours.start}:00 to {s.hours.end}:00 ({s.hours.timezone})
            </div>
            {canSettings && (!s.on || s.state === "off") && <div><Link href="/settings" className="underline font-medium">Open Settings to switch it on</Link></div>}
          </div>

          <div className="px-4 py-3 border-b border-line">
            <h3 className="label mb-2">Sent by Autopilot</h3>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Last hour" value={n(s.sent.lastHour)} sub="chats messaged" />
              <Stat label="Today" value={n(s.sent.today)} sub={`${n(s.today.skipped)} held back · ${n(s.today.failed)} failed`} />
            </div>
            <h3 className="label mt-3.5 mb-2">Due now</h3>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Waiting for a reply" value={n(s.due.answer)} sub={s.settings.answerWaiting ? "their message has no answer yet" : "switched off in Settings"} />
              <Stat label="Due a follow up" value={n(s.due.followUp)} sub={s.settings.followUp ? "quiet, and the 24 hours are nearly up" : "switched off in Settings"} />
            </div>
            <p className="text-[11.5px] text-mute leading-snug mt-2">
              Autopilot takes up to {s.settings.batchSize ?? 6} chats a batch{s.settings.gapMinutes ? `, with ${s.settings.gapMinutes} ${s.settings.gapMinutes === 1 ? "minute" : "minutes"} between batches` : ""}. These counts cover the chats it catches up on and follows up. A reply sent the moment a message arrives shows in that chat.
            </p>
          </div>

          <div className="px-4 py-3 border-b border-line">
            <h3 className="label mb-2">Who Autopilot can reach</h3>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Can be messaged now" value={n(r.reachable)} sub={`of ${n(r.total)} chats`} />
              <Stat label="Cannot be reached" value={n(r.unreachable)} sub="reasons below" />
            </div>
            {reasons.length > 0 && (
              <ul className="mt-2.5 flex flex-col">
                {reasons.map((x) => (
                  <li key={x.key} className="py-2 border-t border-line first:border-t-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium flex-1">{x.label}</span>
                      <span className="tabular-nums font-semibold">{n(x.count)}</span>
                    </div>
                    <div className="text-[12px] text-mute leading-snug">{x.help}</div>
                    {x.key === "windowClosed" && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.windowClosed.buckets.map((b) => (
                          <span key={b.label} className="rounded-full bg-surface2 text-ink2 px-2 py-0.5 text-[11.5px] tabular-nums">{b.label}: {n(b.count)}</span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {r.windowClosed.count > 0 && (
              <div className="mt-2 rounded-[10px] bg-surface2 text-ink2 px-3 py-2 leading-snug">
                {ha.approved
                  ? <>Meta&apos;s Human Agent approval is active. A person can reply from the app to <b>{n(ha.wouldUnlock)}</b> of the chats outside 24 hours, up to {ha.days} days after the lead&apos;s last message.</>
                  : <>Meta&apos;s Human Agent approval would unlock <b>{n(ha.wouldUnlock)}</b> of these: the leads who wrote in the last {ha.days} days. It lets a person reply from the app for {ha.days} days, not 24 hours.</>}
                {" "}Autopilot itself still stops at 24 hours, which is Meta&apos;s rule for automatic messages.{" "}
                <Link href="/connect" className="underline font-medium">{ha.approved ? "See Messaging after 24 hours on Get connected" : "How to apply, on Get connected"}</Link>
              </div>
            )}
            {r.windowClosed.nearest.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[12px] font-medium">The {r.windowClosed.nearest.length} closest to the 24 hours</summary>
                <ul className="mt-1">
                  {r.windowClosed.nearest.map((c) => (
                    <li key={c.conversationId}>
                      {chat(c.conversationId, <>
                        <span className="flex-1 min-w-0 truncate">{c.name}{c.handle && <span className="text-mute"> @{c.handle}</span>}</span>
                        <span className="text-[12px] text-mute tabular-nums shrink-0">{c.hours < 48 ? `${Math.round(c.hours)}h` : `${Math.round(c.hours / 24)}d`} since they wrote</span>
                      </>, "flex items-baseline gap-2 py-1 hover:underline")}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className="px-4 py-3">
            <div className="flex items-baseline gap-2 mb-1">
              <h3 className="label flex-1">Recent activity</h3>
              <span className="text-[11.5px] text-mute">Newest first · updates by itself</span>
            </div>
            {s.log.length === 0 && (
              <p className="text-mute leading-snug py-3">
                Nothing yet. {s.on && s.state !== "off" ? "Each chat Autopilot answers or follows up appears here the moment it is done, with who, what and when." : "Once Autopilot is on, each chat it answers or follows up appears here."}
              </p>
            )}
            <ul>
              {s.log.map((e, i) => {
                const o = OUTCOME[e.outcome];
                return (
                  <li key={`${e.at}:${e.conversationId}:${i}`} className="border-t border-line first:border-t-0">
                    {chat(e.conversationId, <>
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate min-w-0">{e.name || (e.handle ? `@${e.handle}` : "Unnamed chat")}</span>
                        {e.handle && e.name && <span className="text-[12px] text-mute truncate shrink-[2] min-w-0">@{e.handle}</span>}
                        <span className="flex-1" />
                        <span className="text-[11.5px] text-mute tabular-nums shrink-0" title={clock(e.at)}>{ago(e.at)}</span>
                      </div>
                      <div className="flex items-start gap-2 mt-1">
                        <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 uppercase shrink-0 ${o.cls}`}>{o.text}</span>
                        <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 uppercase shrink-0 border border-linestrong">{KIND[e.kind]}</span>
                        <span className="text-[12.5px] text-ink2 leading-snug min-w-0 break-words">{e.outcome === "sent" ? (e.text ? `"${e.text}"` : "Message sent") : e.reason || "Nothing was sent"}</span>
                      </div>
                    </>, "block py-2.5 -mx-2 px-2 rounded-[8px] hover:bg-surface2")}
                  </li>
                );
              })}
            </ul>
            {!all && s.log.length >= LINES_PANEL && <div className="mt-2"><Button onClick={onAll}>Show older activity</Button></div>}
            {s.log.length > 0 && <p className="text-[11.5px] text-mute mt-2">The newest {LINES_ALL} are kept. Press one to open the chat.</p>}
          </div>
        </div>
      </aside>
    </>
  );
}
