"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Area, Conversation, CrmConfig, LabelQueueItem, Member, SheetsConfig, Workspace, KnowledgeGap } from "@/lib/types";
import { pipelineOf, type Pipeline } from "@/lib/pipeline";
import type { StageId } from "@/lib/types";

export type ConvView = Conversation & { window: { open: boolean; hoursLeft: number; closing: boolean }; preview: string; messageCount: number; profileUrl: string; summaryStale?: boolean; gap?: KnowledgeGap | null; sendVia?: "meta" | "helper" | "none"; helperReady?: boolean; seen?: boolean };
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
 * Live updates. Every open screen shares one tiny check, every two seconds while the tab is visible, of a number
 * that goes up whenever anything is saved. A change reloads what the screen shows, so a message sent or received
 * anywhere appears within about two seconds without downloading everything over and over.
 */
const changeListeners = new Set<() => void>();
let changeOff: (() => void) | null = null;
let seenVersion = "";
let checking = false;

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

async function checkVersion() {
  if (checking) return;
  checking = true;
  try {
    const { v } = await api<{ v: string }>("/api/version");
    if (seenVersion && v !== seenVersion) changeListeners.forEach((f) => f());
    seenVersion = v;
  } catch { /* the next check tries again */ } finally { checking = false; }
}
export function onDataChange(fn: () => void) {
  changeListeners.add(fn);
  if (!changeOff) {
    changeOff = every(checkVersion, 2000);
    checkVersion();
  }
  return () => {
    changeListeners.delete(fn);
    if (!changeListeners.size && changeOff) { changeOff(); changeOff = null; }
  };
}

/** pollMs is the slow fallback; changes arrive through onDataChange within about two seconds. */
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
