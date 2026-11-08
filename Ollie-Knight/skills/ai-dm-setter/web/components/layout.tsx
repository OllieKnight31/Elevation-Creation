"use client";
import { useRef, useSyncExternalStore } from "react";
import type { StageId } from "@/lib/types";

// Everything about how the screen is arranged lives here and is remembered in this browser.
export type PaneId = "list" | "thread" | "detail";
export type SectionId = "summary" | "stage" | "labels" | "known" | "meta" | "notes" | "activity";
export type CardId = "actions" | "forecast" | "funnel" | "team" | "coaching" | "speed" | "sources" | "tiles" | "totals" | "chart" | "rates" | "breakdown";
/** A named arrangement of the leads board: which columns show, how they stack, and a tag filter. */
export interface BoardView { name: string; columns: StageId[][] | null; hiddenCols: StageId[]; tag: string }
/** Width of an insights card, in sixths of the page. */
export type CardSize = 2 | 3 | 4 | 6;
export interface SavedView { name: string; channel: string; filter: string; stages: StageId[]; labels: string[]; match: "any" | "all" }
export interface Layout {
  theme: "light" | "dark";
  density: "comfortable" | "compact";
  /** Text and control size, as a zoom factor. */
  scale: number;
  nav: { side: "left" | "right" | "top"; mode: "full" | "icons" | "hidden"; width: number };
  inbox: { order: PaneId[]; hidden: { list: boolean; detail: boolean }; widths: { list: number; detail: number } };
  detail: { order: SectionId[]; collapsed: Partial<Record<SectionId, boolean>> };
  /** `columns` is null until the owner arranges the board; each inner list is one column, stacked top to bottom. */
  leads: { board: "fit" | "wide"; columns: StageId[][] | null; hiddenCols: StageId[]; views: BoardView[] };
  insights: { order: CardId[]; hidden: CardId[]; size: Record<CardId, CardSize>; tiles: string[] };
  views: SavedView[];
  presets: { name: string; layout: Arrangement }[];
}
/** The part of a layout a preset captures. */
export type Arrangement = Omit<Layout, "views" | "presets" | "theme">;

export const SCALES: [number, string][] = [[0.9, "Small"], [1, "Medium"], [1.1, "Large"], [1.2, "Extra large"]];
const CARDS: CardId[] = ["actions", "forecast", "funnel", "team", "coaching", "speed", "sources", "tiles", "chart", "rates", "totals", "breakdown"];
export const DEFAULT_CARD_SIZE: Record<CardId, CardSize> = { actions: 3, forecast: 3, funnel: 6, team: 6, coaching: 6, speed: 3, sources: 3, tiles: 6, chart: 4, rates: 2, totals: 6, breakdown: 6 };
const SECTIONS: SectionId[] = ["summary", "stage", "labels", "known", "meta", "notes", "activity"];

export const DEFAULT_LAYOUT: Layout = {
  theme: "light",
  density: "comfortable",
  scale: 1,
  nav: { side: "left", mode: "full", width: 216 },
  inbox: { order: ["list", "thread", "detail"], hidden: { list: false, detail: false }, widths: { list: 340, detail: 320 } },
  detail: { order: SECTIONS, collapsed: { activity: true } },
  leads: { board: "fit", columns: null, hiddenCols: [], views: [] },
  insights: { order: CARDS, hidden: ["totals", "breakdown"], size: DEFAULT_CARD_SIZE, tiles: ["conversations", "linksSent", "booked", "showed", "won"] },
  views: [],
  presets: [],
};

const arrangement = (l: Layout): Arrangement => ({ density: l.density, scale: l.scale, nav: l.nav, inbox: l.inbox, detail: l.detail, leads: l.leads, insights: l.insights });

export const BUILT_IN_PRESETS: { name: string; hint: string; make: (l: Layout) => Arrangement }[] = [
  { name: "Standard", hint: "Menu, list, conversation, details", make: () => arrangement(DEFAULT_LAYOUT) },
  { name: "Focus", hint: "Just the conversation", make: (l) => ({ ...arrangement(l), nav: { ...l.nav, mode: "hidden" }, inbox: { ...l.inbox, hidden: { list: true, detail: true } } }) },
  { name: "Triage", hint: "Wide list, compact rows, no details", make: (l) => ({ ...arrangement(l), density: "compact", nav: { ...l.nav, mode: "icons" }, inbox: { ...l.inbox, hidden: { list: false, detail: true }, widths: { ...l.inbox.widths, list: 460 } } }) },
  { name: "Review", hint: "Details beside the list, menu on top", make: (l) => ({ ...arrangement(l), nav: { ...l.nav, side: "top", mode: "full" }, inbox: { order: ["list", "detail", "thread"], hidden: { list: false, detail: false }, widths: l.inbox.widths } }) },
];

export function applyArrangement(a: Arrangement) {
  setLayout((l) => ({ ...l, ...a }));
}
export function savePreset(name: string) {
  setLayout((l) => ({ ...l, presets: [...l.presets.filter((p) => p.name !== name), { name, layout: arrangement(l) }] }));
}

const KEY = "setter.layout.v1";
const subs = new Set<() => void>();
let current = DEFAULT_LAYOUT;
let loaded = false;

function sameSet<T>(a: T[] | undefined, b: T[]) {
  return Array.isArray(a) && a.length === b.length && b.every((x) => a.includes(x));
}
const clamp = (n: unknown, lo: number, hi: number, d: number) => (typeof n === "number" && isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d);

/** A saved order, with anything added since it was saved put on the end and anything removed dropped. */
function merged<T extends string>(saved: unknown, all: T[], front: T[] = []): T[] {
  const kept = Array.isArray(saved) ? [...new Set(saved.filter((x): x is T => all.includes(x as T)))] : [];
  if (!kept.length) return all;
  const missing = all.filter((x) => !kept.includes(x));
  return [...missing.filter((x) => front.includes(x)), ...kept, ...missing.filter((x) => !front.includes(x))];
}

function sanitise(raw: Partial<Layout>): Layout {
  const d = DEFAULT_LAYOUT;
  const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const size = (v: unknown, dflt: CardSize): CardSize => (v === 2 || v === 3 || v === 4 || v === 6 ? v : dflt);
  return {
    theme: raw.theme === "dark" ? "dark" : "light",
    density: raw.density === "compact" ? "compact" : "comfortable",
    scale: SCALES.some(([s]) => s === raw.scale) ? (raw.scale as number) : 1,
    nav: {
      side: raw.nav?.side === "right" || raw.nav?.side === "top" ? raw.nav.side : "left",
      mode: raw.nav?.mode === "icons" || raw.nav?.mode === "hidden" ? raw.nav.mode : "full",
      width: clamp(raw.nav?.width, 170, 340, d.nav.width),
    },
    inbox: {
      order: sameSet(raw.inbox?.order, d.inbox.order) ? raw.inbox!.order : d.inbox.order,
      hidden: { list: Boolean(raw.inbox?.hidden?.list), detail: Boolean(raw.inbox?.hidden?.detail) },
      widths: { list: clamp(raw.inbox?.widths?.list, 240, 560, d.inbox.widths.list), detail: clamp(raw.inbox?.widths?.detail, 240, 560, d.inbox.widths.detail) },
    },
    detail: {
      order: merged(raw.detail?.order, SECTIONS, ["summary"]),
      collapsed: raw.detail?.collapsed && typeof raw.detail.collapsed === "object" ? raw.detail.collapsed : d.detail.collapsed,
    },
    leads: {
      board: raw.leads?.board === "wide" ? "wide" : "fit",
      columns: Array.isArray(raw.leads?.columns) ? raw.leads!.columns.map(ids).filter((g) => g.length) : null,
      hiddenCols: ids(raw.leads?.hiddenCols),
      views: Array.isArray(raw.leads?.views) ? raw.leads!.views.filter((v) => v && typeof v.name === "string").slice(0, 12).map((v) => ({ name: v.name.slice(0, 30), columns: Array.isArray(v.columns) ? v.columns.map(ids).filter((g) => g.length) : null, hiddenCols: ids(v.hiddenCols), tag: typeof v.tag === "string" ? v.tag : "" })) : [],
    },
    insights: {
      order: merged(raw.insights?.order, CARDS, ["actions", "forecast", "funnel", "team", "coaching", "speed", "sources"]),
      hidden: ids(raw.insights?.hidden).filter((c): c is CardId => (CARDS as string[]).includes(c)),
      size: Object.fromEntries(CARDS.map((c) => [c, size(raw.insights?.size?.[c], DEFAULT_CARD_SIZE[c])])) as Record<CardId, CardSize>,
      tiles: Array.isArray(raw.insights?.tiles) ? ids(raw.insights!.tiles) : d.insights.tiles,
    },
    views: Array.isArray(raw.views) ? raw.views.filter((v) => v && typeof v.name === "string") : [],
    presets: Array.isArray(raw.presets) ? raw.presets.filter((p) => p && typeof p.name === "string" && p.layout && typeof p.layout === "object").slice(0, 12) : [],
  };
}

function read() {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) current = sanitise(JSON.parse(raw));
    } catch {}
  }
  return current;
}

export function setLayout(fn: (l: Layout) => Layout) {
  current = sanitise(fn(read()));
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch {}
  subs.forEach((f) => f());
}

export function resetLayout() {
  setLayout((l) => ({ ...DEFAULT_LAYOUT, theme: l.theme, views: l.views, presets: l.presets }));
}

export function useLayout() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f); }; },
    read,
    () => DEFAULT_LAYOUT,
  );
}

export function move<T>(list: T[], item: T, by: number) {
  const i = list.indexOf(item);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function swap<T>(list: T[], a: T, b: T) {
  return list.map((x) => (x === a ? b : x === b ? a : x));
}

/** Drag bar between two panels. `dir` is 1 when the panel it sizes sits to its left, -1 when to its right. */
export function ResizeHandle({ dir, onResize, onStart, label }: { dir: 1 | -1; onResize: (delta: number) => void; onStart?: () => void; label: string }) {
  const last = useRef<number | null>(null);
  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title="Drag to resize"
      onPointerDown={(e) => { onStart?.(); last.current = e.clientX; e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.dataset.active = "true"; }}
      onPointerMove={(e) => {
        if (last.current === null) return;
        const d = e.clientX - last.current;
        // Pointer distance is in screen pixels; panel widths are in zoomed ones.
        if (d) { last.current = e.clientX; onResize((d * dir) / read().scale); }
      }}
      onPointerUp={(e) => { last.current = null; e.currentTarget.dataset.active = "false"; }}
      onPointerCancel={(e) => { last.current = null; e.currentTarget.dataset.active = "false"; }}
    />
  );
}

export function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  panelLeft: "M4 5h16v14H4zM9 5v14",
  panelRight: "M4 5h16v14H4zM15 5v14",
  chevLeft: "M15 6l-6 6 6 6",
  chevRight: "M9 6l6 6-6 6",
  chevDown: "M6 9l6 6 6-6",
  chevUp: "M6 15l6-6 6 6",
  close: "M6 6l12 12M18 6L6 18",
  sliders: "M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4",
  filter: "M4 6h16M7 12h10M10 18h4",
  sun: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4",
  moon: "M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  check: "M5 12l5 5 9-10",
  send: "M4 12l16-8-6 16-3-7-7-1z",
  plus: "M12 5v14M5 12h14",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  columns: "M4 5h16v14H4zM10 5v14M15 5v14",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6l1-7z",
  external: "M14 5h5v5M19 5l-8 8M11 7H6v11h11v-5",
  refresh: "M4 12a8 8 0 0114-5l2-2v6h-6l2-2a5 5 0 10.9 5.5",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0",
  minus: "M5 12h14",
  logout: "M10 5H5v14h5M15 8l4 4-4 4M19 12H9",
  pencil: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  eyeOff: "M3 3l18 18M10.6 6.2A9.8 9.8 0 0112 6c5 0 9 6 9 6a15 15 0 01-3.2 3.6M6.3 7.6A15 15 0 003 12s4 6 9 6a9 9 0 003.3-.6M9.9 9.9a3 3 0 004.2 4.2",
};
