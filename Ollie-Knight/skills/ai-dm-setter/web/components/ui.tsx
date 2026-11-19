"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Area, Conversation, CrmConfig, LabelQueueItem, Member, SheetsConfig, Workspace, KnowledgeGap } from "@/lib/types";
import { pipelineOf, type Pipeline } from "@/lib/pipeline";
import type { StageId } from "@/lib/types";

export type ConvView = Conversation & { window: { open: boolean; hoursLeft: number; closing: boolean }; preview: string; messageCount: number; profileUrl: string; summaryStale?: boolean; gap?: KnowledgeGap | null; sendVia?: "meta" | "suite" | "helper" | "none"; helperReady?: boolean; seen?: boolean };
export type PublicMember = Omit<Member, "passwordHash"> & { hasPassword: boolean };
export type PublicWorkspace = Omit<Workspace, "meta" | "secret" | "members" | "crm" | "outreach" | "knowledge" | "calendar" | "sheets"> & {
  sheets: Omit<SheetsConfig, "secret" | "leadHashes" | "tallies"> | null;
  calendar: Omit<Workspace["calendar"], "token"> & { tokenSet: boolean; connected: boolean; ready: boolean; zone: string };
  members: PublicMember[];
  crm: Omit<CrmConfig, "ghl"> & { ghl: Omit<CrmConfig["ghl"], "token"> & { tokenSet: boolean } };
  meta: {
    instagram: { username: string; connectedAt: string } | null;
    page: { name: string; connectedAt: string } | null;
    datasetId: string; capiTokenSet: boolean; capiEnabled: boolean; mirrorMessengerLabels: boolean;
  };
};
export interface AppState {
  me: PublicMember & { loginRequired: boolean };
  store: { mode: "file" | "supabase" | "postgres"; ready: boolean; lastPushAt: string; pending: boolean; error: string; written: number };
  workspace: PublicWorkspace;
  conversations: ConvView[];
  helper: { version: string; latest: string; outdated: boolean; seenAt: string } | null;
  flags: { ai: boolean; aiError: string; meta: boolean; demoData: boolean };
  labelQueue: { pending: number; done: number; failed: LabelQueueItem[] };
}

// The stages and tags in force, shared by every component and refreshed with each state load.
const DEFAULT_PIPELINE = pipelineOf(null);
let pipeline = DEFAULT_PIPELINE;
let pipelineKey = "";
const pipelineSubs = new Set<() => void>();
function publishPipeline(cfg: Workspace["pipeline"]) {
  const key = cfg ? JSON.stringify(cfg) : "";
  if (key === pipelineKey) return;
  pipelineKey = key;
  pipeline = cfg ? pipelineOf(cfg) : DEFAULT_PIPELINE;
  pipelineSubs.forEach((f) => f());
}
export function usePipeline(): Pipeline {
  return useSyncExternalStore((f) => { pipelineSubs.add(f); return () => { pipelineSubs.delete(f); }; }, () => pipeline, () => DEFAULT_PIPELINE);
}

export async function api<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  // Session ended or sign in was switched on: go to the sign in screen, once.
  if (res.status === 401 && data.login && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const hasArea = (me: PublicMember | undefined, area: Area) => !me || me.role === "owner" || me.role === "admin" || me.areas.includes(area);

/*
 * Live updates. Every open screen shares one tiny check of a number that goes up whenever anything is saved. A change
 * reloads what the screen shows, so a message sent or received anywhere appears without downloading everything over
 * and over.
 *
 * The check is paced, because each one wakes the server and asks the database a question, and the free plans count
 * both. Straight after something changes, or after the person comes back to the tab, it asks every 2 seconds, so a
 * chat that is going back and forth feels live. With nothing new it eases off in steps to once every 30 seconds.
 * Asking every 2 seconds all day was about 1,800 requests an hour for each open tab; this is about 120 on a quiet hour.
 */
export const PACE_STEPS = [
  { untilMs: 15_000, everyMs: 2_000 },
  { untilMs: 60_000, everyMs: 5_000 },
  { untilMs: 180_000, everyMs: 15_000 },
] as const;
export const PACE_SLOW_MS = 30_000;
/** A click or key press brings the next check forward when the last one is at least this old. */
export const NUDGE_MS = 10_000;
/** How long to wait between checks, given how long ago something last changed or the person last came back. */
export function paceMs(sinceBusyMs: number) {
  for (const s of PACE_STEPS) if (sinceBusyMs < s.untilMs) return s.everyMs;
  return PACE_SLOW_MS;
}

const changeListeners = new Set<() => void>();
let seenVersion = "";
let checking = false;
let busyAt = Date.now();
let lastCheckAt = 0;
let checkTimer: ReturnType<typeof setTimeout> | undefined;
/*
 * Windows of the same browser tell each other what they learned, so several windows side by side cost about the same
 * as one. For that to work only one of them may ask at a time: a window whose latest answer came from another window
 * holds back a little longer than the pace, so the one that asked last keeps asking and the rest keep listening. If
 * that one is closed or hidden, the others stop hearing from it and one of them takes over a couple of seconds late.
 * The extra wait has a random part so that two listeners do not both take over at the same moment, time after time.
 */
const FOLLOW_WAIT_MS = 1_500;
const FOLLOW_SPREAD_MS = 1_500;
let following = false;
const versionChannel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("setter-version") : null;
/** Hosted versions look like h123. The number lets the server say whether what changed since then matters to a screen. */
const versionNumber = (v: string) => (/^h\d+$/.test(v) ? Number(v.slice(1)) : null);

/*
 * Every timed check stops while nobody is looking: a hidden tab, or 10 minutes without a click, key or mouse move.
 * The database sleeps when nothing asks it anything, and on the free plan its hours run out if it never does.
 * The first touch after a pause runs every check at once, so the screen is current again straight away.
 */
const IDLE_MS = 10 * 60_000;
let lastInput = Date.now();
const wakers = new Set<() => void>();
export function pageActive() {
  return typeof document === "undefined" || (!document.hidden && Date.now() - lastInput < IDLE_MS);
}
if (typeof window !== "undefined") {
  const touch = () => {
    const was = pageActive();
    lastInput = Date.now();
    if (!was && pageActive()) wakers.forEach((f) => f());
  };
  for (const e of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "focus"]) window.addEventListener(e, touch, { passive: true });
  document.addEventListener("visibilitychange", touch);
}
/**
 * Wakes the Chrome helper so a reply queued for it goes out now, not at its next scheduled check (up to 15 minutes
 * later). The helper's script on this page passes it on; it is the same message as switching sending on.
 */
export function nudgeHelper() {
  try { window.postMessage({ source: "ainable-app", type: "outreach", enabled: true }, location.origin); } catch { /* no helper */ }
}

/** Pulls in past Instagram chats, calling again while the server says there is more. Returns the totals. */
export async function backfillAll(restart = false) {
  let threads = 0, added = 0, first = true;
  for (let i = 0; i < 40; i++) {
    const r = await api<{ done: boolean; threads: number; added: number }>("/api/meta/backfill", "POST", { restart: restart && first });
    first = false;
    threads += r.threads; added += r.added;
    if (r.done) break;
  }
  return { threads, added };
}

/** setInterval that skips while the page is idle and runs once on return. */
export function every(fn: () => void, ms: number) {
  const t = setInterval(() => { if (pageActive()) fn(); }, ms);
  wakers.add(fn);
  return () => { clearInterval(t); wakers.delete(fn); };
}

/** Records an answer, from the server or from another tab. Only a change that matters reloads screens and speeds the checks up. */
function tookVersion(v: string, quiet: boolean) {
  lastCheckAt = Date.now();
  const changed = Boolean(seenVersion) && v !== seenVersion;
  seenVersion = v;
  if (!changed || quiet) return;
  busyAt = Date.now();
  changeListeners.forEach((f) => f());
}

function scheduleCheck() {
  clearTimeout(checkTimer);
  if (!changeListeners.size) return;
  const now = Date.now();
  const holdBack = following ? FOLLOW_WAIT_MS + Math.random() * FOLLOW_SPREAD_MS : 0;
  checkTimer = setTimeout(timedCheck, Math.max(0, lastCheckAt + paceMs(now - busyAt) + holdBack - now));
}

function timedCheck() {
  if (pageActive()) { checkVersion(); return; }
  // Hidden or idle: ask the server nothing and look again later. Coming back runs a check at once, see backToBusy.
  clearTimeout(checkTimer);
  checkTimer = setTimeout(timedCheck, PACE_SLOW_MS);
}

async function checkVersion() {
  if (checking) return;
  checking = true;
  clearTimeout(checkTimer);
  try {
    const since = versionNumber(seenVersion);
    // Say so before asking, so the other windows wait for this answer even when the server is slow to give it.
    versionChannel?.postMessage({ asking: true });
    const r = await api<{ v: string; quiet?: boolean }>(since === null ? "/api/version" : `/api/version?since=${since}`);
    const quiet = r.quiet === true;
    // This window asked and got an answer, so it is the one that keeps asking; the others hear it and hold back.
    following = false;
    tookVersion(r.v, quiet);
    versionChannel?.postMessage({ v: r.v, quiet, since });
  } catch { /* the next check tries again */ } finally {
    checking = false;
    lastCheckAt = Date.now();
    scheduleCheck();
  }
}

/** The person came back to the tab or the window: check now and return to the fast pace. */
function backToBusy() {
  if (!changeListeners.size || !pageActive()) return;
  busyAt = Date.now();
  if (Date.now() - lastCheckAt >= PACE_STEPS[0].everyMs) checkVersion();
  else scheduleCheck();
}

/*
 * A click or a key press does not bring the fast pace back by itself: someone working in the inbox clicks and types
 * all day, and that would keep every tab asking every 2 seconds. It only brings a check forward when the last one is old.
 */
function nudge() {
  if (changeListeners.size && pageActive() && Date.now() - lastCheckAt >= NUDGE_MS) checkVersion();
}

if (typeof window !== "undefined") {
  window.addEventListener("focus", backToBusy);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) backToBusy(); });
  for (const e of ["pointerdown", "keydown"]) window.addEventListener(e, nudge, { passive: true });
  if (versionChannel) {
    versionChannel.onmessage = (e: MessageEvent) => {
      const d = (e.data ?? {}) as { v?: unknown; quiet?: unknown; since?: unknown; asking?: unknown };
      // A hidden or idle tab ignores it and checks for itself when the person returns.
      if (!changeListeners.size || !pageActive()) return;
      // Another window has just asked. Count the wait from now; if its answer never comes, this one asks after the usual wait.
      if (d.asking === true) {
        following = true;
        lastCheckAt = Date.now();
        if (!checking) scheduleCheck();
        return;
      }
      if (typeof d.v !== "string") return;
      const theirs = versionNumber(d.v), mine = versionNumber(seenVersion);
      // An answer older than what this tab already has would look like a change and reload the screen for nothing.
      if (theirs !== null && mine !== null && theirs < mine) return;
      // "Nothing that matters changed" was worked out from where the other tab stood. It holds here only if this tab was at least that far.
      const quiet = d.quiet === true && typeof d.since === "number" && mine !== null && mine >= d.since;
      following = true;
      tookVersion(d.v, quiet);
      if (!checking) scheduleCheck();
    };
  }
}

export function onDataChange(fn: () => void) {
  changeListeners.add(fn);
  if (changeListeners.size === 1) {
    wakers.add(backToBusy);
    if (Date.now() - lastCheckAt >= PACE_STEPS[0].everyMs) checkVersion();
    else scheduleCheck();
  }
  return () => {
    changeListeners.delete(fn);
    if (!changeListeners.size) { clearTimeout(checkTimer); wakers.delete(backToBusy); }
  };
}

/** pollMs is the slow fallback; changes arrive through onDataChange, within about two seconds while a chat is active. */
export function useAppState(pollMs = 6000) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  const alive = useRef(true);
  // One load at a time; a change noticed during a load gets one more load straight after.
  const flight = useRef<{ running: boolean; again: boolean }>({ running: false, again: false });
  const reload = useCallback(async () => {
    const f = flight.current;
    if (f.running) { f.again = true; return; }
    f.running = true;
    try {
      do {
        f.again = false;
        try {
          const s = await api<AppState>("/api/state");
          if (alive.current) { publishPipeline(s.workspace.pipeline); setState(s); setError(""); }
        } catch (e) {
          if (alive.current) setError((e as Error).message);
        }
      } while (f.again && alive.current);
    } finally {
      f.running = false;
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    reload();
    const stop = every(reload, Math.max(pollMs, 30000));
    const off = onDataChange(reload);
    return () => { alive.current = false; stop(); off(); };
  }, [reload, pollMs]);
  return { state, reload, error };
}

export function StageBadge({ stage, small }: { stage: StageId; small?: boolean }) {
  const s = usePipeline().stage(stage);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap bg-surface2 text-ink ${small ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1"}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      {s.name}
    </span>
  );
}

export function LabelChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  const labelClass = usePipeline().tagClass;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md text-[11px] font-medium px-1.5 py-0.5 whitespace-nowrap border ${labelClass(label)}`}>
      {label}
      {onRemove && <button onClick={onRemove} aria-label={`Remove ${label}`} className="opacity-60 hover:opacity-100">×</button>}
    </span>
  );
}

export function Button({ variant = "secondary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const v = {
    primary: "bg-ink text-onbrand hover:opacity-85 border-transparent",
    secondary: "bg-surface text-ink hover:border-ink border-linestrong",
    ghost: "bg-transparent text-ink2 hover:bg-surface2 border-transparent",
    danger: "bg-surface text-err hover:border-err border-linestrong",
  }[variant];
  return <button {...p} className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] border px-3 h-8 text-[13px] font-medium whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${v} ${className}`} />;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-ink" : "bg-linestrong"}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-surface shadow transition-transform ${on ? "translate-x-4" : ""}`} />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label?: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-[10px] bg-surface2 p-0.5 shrink-0">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={value === v} className={`px-3 h-7 rounded-[8px] text-[13px] font-medium whitespace-nowrap ${value === v ? "bg-surface shadow-sm text-ink" : "text-mute hover:text-ink"}`}>{l}</button>
      ))}
    </div>
  );
}

/** Where a lead's profile picture is served from. Instagram's own addresses expire, so the app fetches it on the browser's behalf. */
export const avatarSrc = (c: { id: string; avatar?: string; avatarAt?: string }) => (c.avatar ? `/api/avatar/${c.id}?v=${encodeURIComponent(c.avatarAt ?? "")}` : undefined);

export function Avatar({ name, platform, size = 40, src }: { name: string; platform?: string; size?: number; src?: string }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const [broken, setBroken] = useState("");
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-surface2 text-ink font-medium border border-line ${size >= 40 ? "d-avatar" : ""}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {src && broken !== src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" onError={() => setBroken(src)} className="w-full h-full rounded-full object-cover" />
        : initials}
      {platform && (
        <span title={platform} className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-surface bg-ink text-onbrand text-[8px] font-bold flex items-center justify-center">
          {platform === "instagram" ? "IG" : "M"}
        </span>
      )}
    </span>
  );
}

export function timeAgo(iso: string) {
  const m = (Date.now() - new Date(iso).getTime()) / 6e4;
  if (m < 1) return "now";
  if (m < 60) return `${Math.floor(m)}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  if (m < 10080) return `${Math.floor(m / 1440)}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function Banner({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: React.ReactNode }) {
  const c = { info: "bg-surface2 text-ink2", warn: "tone-warn", error: "tone-err", ok: "tone-ok" }[tone];
  return <div className={`rounded-[10px] px-3 py-2 text-[13px] ${c}`}>{children}</div>;
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div>
        <h1 className="display text-[30px] leading-tight">{title}</h1>
        {sub && <p className="text-mute mt-1">{sub}</p>}
      </div>
      <div className="flex flex-wrap justify-end items-center gap-2">{children}</div>
    </div>
  );
}
