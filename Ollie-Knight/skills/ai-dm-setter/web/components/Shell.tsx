"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import WelcomeVideo from "./WelcomeVideo";
import { usePathname } from "next/navigation";
import type { Area } from "@/lib/types";
import { api, every, hasArea, type PublicMember } from "./ui";
import { HELPER_VERSION } from "@/lib/helper-version";
import { applyArrangement, BUILT_IN_PRESETS, Icon, ICONS, move, resetLayout, ResizeHandle, savePreset, SCALES, setLayout, useLayout, type Layout, type PaneId } from "./layout";

const NAV: [string, string, string, Area][] = [
  ["/inbox", "Inbox", "M4 5h16v11H8l-4 4V5z", "inbox"],
  ["/leads", "Leads centre", "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z", "leads"],
  ["/outreach", "Outreach", "M3 11l18-7-7 18-3-8-8-3z", "outreach"],
  ["/insights", "Insights", "M4 19V5M4 19h16M8 15l3-4 3 2 4-6", "insights"],
  ["/playbook", "Playbook", "M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM9 9h6M9 13h6", "playbook"],
  ["/pipeline", "Stages and tags", "M4 6h10l3 3-3 3H4zM4 15h7l3 3-3 3H4z", "pipeline"],
  ["/onboarding", "Business brief", "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5", "brief"],
  ["/connect", "Get connected", "M9 12l2 2 4-4M12 3a9 9 0 100 18 9 9 0 000-18z", "settings"],
  ["/learn", "Video guides", "M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM10 9l5 3-5 3V9z", "inbox"],
  ["/settings", "Settings", "M12 9a3 3 0 100 6 3 3 0 000-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4", "settings"],
];

/** Ainable mark: the a carrying the dot of the i. Drawn in the current text colour. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Ainable">
      <circle cx="32" cy="39" r="15" fill="none" stroke="currentColor" strokeWidth="7" />
      <path d="M47 24V54" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <circle cx="47" cy="11.5" r="5.5" fill="currentColor" />
    </svg>
  );
}

export function LogoWordmark({ height = 20 }: { height?: number }) {
  const p = { stroke: "currentColor", strokeWidth: 7, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg height={height} viewBox="-4 32 277 72" role="img" aria-label="Ainable">
      <circle cx="20" cy="80" r="16.5" {...p} />
      <path d="M36.5 63.5V100M53.5 63.5V100M69.5 63.5V100M69.5 100V80a16.5 16.5 0 0 1 33 0v20M151.5 63.5V100M167.5 38V100M216.5 38V100M232.5 80H265.5A16.5 16.5 0 1 0 261.64 90.61" {...p} />
      <circle cx="135" cy="80" r="16.5" {...p} />
      <circle cx="184" cy="80" r="16.5" {...p} />
      <circle cx="53.5" cy="45" r="5.5" fill="currentColor" />
    </svg>
  );
}

const laterThisSession = () => {
  try { return sessionStorage.getItem("setter:welcome-later") === "1"; } catch { return false; }
};

const PANE_NAMES: Record<PaneId, string> = { list: "Conversation list", thread: "Conversation", detail: "Lead details" };

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const layout = useLayout();
  const { nav } = layout;
  const [menu, setMenu] = useState(false);
  const [who, setWho] = useState<{ loginRequired: boolean; member: PublicMember | null; openQuestions?: number; welcome?: boolean } | null>(null);
  const [welcomeOff, setWelcomeOff] = useState(false);
  const bare = path.startsWith("/login") || path.startsWith("/privacy") || path.startsWith("/data-deletion");

  // Who is signed in decides which screens appear in the menu. Checked again on every page change.
  useEffect(() => {
    if (bare) return;
    const check = () => api<{ loginRequired: boolean; member: PublicMember | null; openQuestions?: number; welcome?: boolean }>("/api/me").then((r) => {
      setWho(r);
      if (r.loginRequired && !r.member) window.location.replace(`/login?next=${encodeURIComponent(path)}`);
    }).catch(() => {});
    check();
    // The Team tab announces account changes, so the menu and sign out button follow without a page change.
    window.addEventListener("setter:auth", check);
    // Also on a timer, so the count of questions waiting for an answer stays current.
    const stop = every(check, 20000);
    return () => { window.removeEventListener("setter:auth", check); stop(); };
  }, [path, bare]);

  // Missing profile pictures fill in by themselves while anyone signed in has the app open, old chats and new. The
  // Chrome helper reads them (Instagram refuses cloud servers); a self hosted app on a normal connection also can.
  const member = Boolean(who?.member) || who?.loginRequired === false;
  useEffect(() => {
    if (bare || !member) return;
    // A helper older than this app reloads itself from its folder (it never does so mid send). Repeated, because the
    // helper may start listening on this page only after the first message.
    const update = () => window.postMessage({ source: "ainable-app", type: "update", latest: HELPER_VERSION }, window.location.origin);
    update();
    const again = setTimeout(update, 5000);
    let stopped = false, server = true;
    const fill = async () => {
      update();
      const r = await api<{ remaining: number }>("/api/avatars/fill").catch(() => null);
      if (!r || !r.remaining || stopped) return;
      window.postMessage({ source: "ainable-app", type: "faces" }, window.location.origin);
      if (!server) return;
      const s = await api<{ checked: number; blocked?: boolean }>("/api/avatars/fill", "POST").catch(() => null);
      if (!s || s.blocked || !s.checked) server = false;
      else if (!stopped) fill();
    };
    fill();
    const stop = every(fill, 120_000);
    return () => { stopped = true; clearTimeout(again); stop(); };
  }, [bare, member]);

  useEffect(() => {
    document.documentElement.dataset.theme = layout.theme;
    document.documentElement.dataset.density = layout.density;
  }, [layout.theme, layout.density]);

  // Keyboard: \ menu, [ conversation list, ] lead details. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      if (e.key === "\\") setLayout((l) => ({ ...l, nav: { ...l.nav, mode: l.nav.mode === "hidden" ? "full" : "hidden" } }));
      if (e.key === "[") setLayout((l) => ({ ...l, inbox: { ...l.inbox, hidden: { ...l.inbox.hidden, list: !l.inbox.hidden.list } } }));
      if (e.key === "]") setLayout((l) => ({ ...l, inbox: { ...l.inbox, hidden: { ...l.inbox.hidden, detail: !l.inbox.hidden.detail } } }));
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setNav = (p: Partial<Layout["nav"]>) => setLayout((l) => ({ ...l, nav: { ...l.nav, ...p } }));
  const icons = nav.mode === "icons";
  const right = nav.side === "right";
  const top = nav.side === "top";
  // Dropping the logo near the top edge docks the menu there; otherwise it goes to the nearer side.
  const dock = (e: React.DragEvent) => {
    if (e.clientX <= 0 && e.clientY <= 0) return;
    setNav({ side: e.clientY < 90 ? "top" : e.clientX > window.innerWidth / 2 ? "right" : "left" });
  };

  const me = who?.member ?? undefined;
  const allowed = NAV.filter(([, , , area]) => !who?.loginRequired || hasArea(me, area));
  const here = NAV.find(([href]) => path.startsWith(href));
  const blocked = Boolean(who?.loginRequired && me && here && !hasArea(me, here[3]));
  const signOut = async () => { await api("/api/auth/logout", "POST").catch(() => {}); window.location.replace("/login"); };
  const links = allowed.map(([href, label, d]) => {
    const active = path.startsWith(href);
    return (
      <Link key={href} href={href} title={icons ? label : undefined} aria-label={label} className={`relative flex items-center rounded-[10px] font-medium text-[13.5px] shrink-0 ${top ? "gap-2 h-9" : "gap-3"} ${icons ? (top ? "justify-center w-10" : "justify-center h-10") : top ? "px-3" : "px-3 py-2"} ${active ? "bg-ink text-onbrand" : "text-ink2 hover:bg-surface2 hover:text-ink"}`}>
        <Icon d={d} size={18} />
        {!icons && <span className="truncate">{label}</span>}
        {href === "/playbook" && Boolean(who?.openQuestions) && <span title="Questions waiting for your answer" className={`rounded-full bg-err text-white text-[10px] font-semibold leading-none px-1.5 py-1 ${icons ? "absolute translate-x-3 -translate-y-3" : "ml-auto"}`}>{who?.openQuestions}</span>}
      </Link>
    );
  });
  const brand = (
    <div draggable onDragEnd={dock} title="Drag to the left, right or top edge to move the menu" className={`flex items-center gap-2.5 cursor-grab active:cursor-grabbing shrink-0 ${top ? "" : icons ? "justify-center py-4" : "px-4 py-4"}`}>
      <span className="w-8 h-8 rounded-[9px] bg-ink text-onbrand flex items-center justify-center shrink-0"><LogoMark size={22} /></span>
      {!icons && (
        <div className="leading-tight min-w-0">
          <LogoWordmark height={15} />
          <div className="label mt-1">DM Setter</div>
        </div>
      )}
    </div>
  );
  const tools = (
    <>
      {who?.loginRequired && me && <NavButton label={`Sign out ${me.name}`} onClick={signOut} d={ICONS.logout} text={icons || top ? undefined : me.name.split(" ")[0]} />}
      <NavButton label="Layout" onClick={() => setMenu((m) => !m)} d={ICONS.sliders} text={icons ? undefined : "Layout"} active={menu} />
      {!icons && !top && <span className="flex-1" />}
      <NavButton label={layout.theme === "dark" ? "Switch to light" : "Switch to dark"} onClick={() => setLayout((l) => ({ ...l, theme: l.theme === "dark" ? "light" : "dark" }))} d={layout.theme === "dark" ? ICONS.sun : ICONS.moon} />
      <NavButton label={icons ? "Expand menu" : "Collapse menu to icons"} onClick={() => setNav({ mode: icons ? "full" : "icons" })} d={top ? (icons ? ICONS.chevRight : ICONS.chevLeft) : icons !== right ? ICONS.chevRight : ICONS.chevLeft} />
    </>
  );

  if (bare) return <div className="h-full">{children}</div>;
  // Hold the page back until we know whether this person has to sign in, so nothing flashes first.
  if (who?.loginRequired && !me) return <div className="h-full" />;

  return (
    <div
      className={`h-full flex ${top ? "flex-col" : right ? "flex-row-reverse" : ""}`}
      // A zoomed box is sized in zoomed pixels, so it is given the window size divided by the zoom to fill it exactly.
      style={layout.scale === 1 ? undefined : { zoom: layout.scale, width: `calc(100vw / ${layout.scale})`, height: `calc(100vh / ${layout.scale})` }}
    >
      {nav.mode !== "hidden" && top && (
        <nav className="shrink-0 bg-surface border-b border-line h-[52px] px-3 flex items-center gap-4" aria-label="Main menu">
          {brand}
          <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">{links}</div>
          <div className="flex items-center gap-1 shrink-0">{tools}</div>
        </nav>
      )}
      {nav.mode !== "hidden" && !top && (
        <nav className={`shrink-0 bg-surface flex flex-col ${right ? "border-l" : "border-r"} border-line`} style={{ width: icons ? 60 : nav.width }} aria-label="Main menu">
          {brand}
          <div className="px-2 flex flex-col gap-0.5">{links}</div>
          <div className={`mt-auto p-2 flex gap-1 ${icons ? "flex-col items-center" : "items-center"}`}>{tools}</div>
        </nav>
      )}
      {nav.mode === "full" && !top && <ResizeHandle dir={right ? -1 : 1} label="Resize menu" onResize={(d) => setNav({ width: nav.width + d })} />}
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
        {blocked ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-8">
            <h1 className="display text-[26px]">This screen is not part of your access</h1>
            <p className="text-mute max-w-[420px]">Your account can open {allowed.map(([, l]) => l).join(", ") || "nothing yet"}. Ask the account owner if you need {here?.[1]}.</p>
            {allowed[0] && <Link href={allowed[0][0]} className="underline font-medium">Go to {allowed[0][1]}</Link>}
          </div>
        ) : children}
      </main>

      {who?.welcome && !welcomeOff && !laterThisSession() && <WelcomeVideo onDone={() => setWelcomeOff(true)} />}

      {nav.mode === "hidden" && (
        <button onClick={() => setMenu((m) => !m)} aria-label="Open layout menu" title="Menu is hidden. Click for layout, or press \ to bring it back" className={`fixed bottom-3 ${right ? "right-3" : "left-3"} z-40 w-9 h-9 rounded-full bg-ink text-onbrand flex items-center justify-center shadow-lg opacity-70 hover:opacity-100`}>
          <LogoMark size={22} />
        </button>
      )}

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
          <div role="dialog" aria-label="Layout" className={`pop fixed z-50 ${top && nav.mode !== "hidden" ? "top-14 right-3" : `bottom-14 ${right ? "right-3" : "left-3"}`} w-[320px] max-h-[calc(100%-80px)] overflow-y-auto scroll p-4 text-[13px]`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="display text-[20px]">Layout</h2>
              <button onClick={() => setMenu(false)} aria-label="Close layout" className="text-mute hover:text-ink"><Icon d={ICONS.close} /></button>
            </div>

            <div className="label mb-1.5">Presets</div>
            <div className="grid grid-cols-2 gap-1.5">
              {BUILT_IN_PRESETS.map((p) => (
                <button key={p.name} onClick={() => applyArrangement(p.make(layout))} title={p.hint} className="text-left rounded-[10px] border border-line hover:border-ink px-2.5 py-1.5">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-[11px] text-mute leading-tight">{p.hint}</div>
                </button>
              ))}
              {layout.presets.map((p) => (
                <div key={p.name} className="flex items-stretch rounded-[10px] border border-linestrong hover:border-ink">
                  <button onClick={() => applyArrangement(p.layout)} className="flex-1 min-w-0 text-left px-2.5 py-1.5">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-[11px] text-mute leading-tight">Saved by you</div>
                  </button>
                  <button aria-label={`Delete preset ${p.name}`} onClick={() => setLayout((l) => ({ ...l, presets: l.presets.filter((x) => x.name !== p.name) }))} className="px-2 text-mute hover:text-ink">×</button>
                </div>
              ))}
            </div>
            <button onClick={() => { const name = window.prompt("Name this layout")?.trim().slice(0, 30); if (name) savePreset(name); }} className="mt-1.5 w-full rounded-[10px] border border-dashed border-linestrong py-1.5 font-medium hover:border-ink">Save current layout as a preset</button>

            <div className="label mt-4 mb-1">Look</div>
            <Row label="Theme">
              <Choice value={layout.theme} options={[["light", "Light"], ["dark", "Dark"]]} onChange={(v) => setLayout((l) => ({ ...l, theme: v }))} />
            </Row>
            <Row label="Density">
              <Choice value={layout.density} options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} onChange={(v) => setLayout((l) => ({ ...l, density: v }))} />
            </Row>
            <Row label="Text size">
              <select className="field !w-[130px] !py-1 text-[12.5px]" aria-label="Text size" value={layout.scale} onChange={(e) => setLayout((l) => ({ ...l, scale: Number(e.target.value) }))}>
                {SCALES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Row>

            <div className="label mt-4 mb-1">Menu</div>
            <Row label="Show as">
              <Choice value={nav.mode} options={[["full", "Full"], ["icons", "Icons"], ["hidden", "Hidden"]]} onChange={(v) => setNav({ mode: v })} />
            </Row>
            <Row label="Position">
              <Choice value={nav.side} options={[["left", "Left"], ["top", "Top"], ["right", "Right"]]} onChange={(v) => setNav({ side: v })} />
            </Row>

            <div className="label mt-4 mb-1.5">Inbox panels, left to right</div>
            {layout.inbox.order.map((p, i) => {
              const hidden = p !== "thread" && layout.inbox.hidden[p];
              return (
                <div key={p} className="flex items-center gap-1 py-1">
                  <span className={`flex-1 ${hidden ? "text-mute line-through" : ""}`}>{PANE_NAMES[p]}</span>
                  {p !== "thread" && (
                    <button className="px-2 py-1 rounded-md text-[12px] font-medium border border-line hover:border-ink" onClick={() => setLayout((l) => ({ ...l, inbox: { ...l.inbox, hidden: { ...l.inbox.hidden, [p]: !hidden } } }))}>{hidden ? "Show" : "Hide"}</button>
                  )}
                  <button aria-label={`Move ${PANE_NAMES[p]} left`} disabled={i === 0} className="p-1 rounded-md hover:bg-surface2 disabled:opacity-25" onClick={() => setLayout((l) => ({ ...l, inbox: { ...l.inbox, order: move(l.inbox.order, p, -1) } }))}><Icon d={ICONS.chevLeft} /></button>
                  <button aria-label={`Move ${PANE_NAMES[p]} right`} disabled={i === 2} className="p-1 rounded-md hover:bg-surface2 disabled:opacity-25" onClick={() => setLayout((l) => ({ ...l, inbox: { ...l.inbox, order: move(l.inbox.order, p, 1) } }))}><Icon d={ICONS.chevRight} /></button>
                </div>
              );
            })}

            <p className="text-mute text-[12px] leading-snug mt-3">Drag the dotted handle on any panel to move it, and the line between panels to resize. Shortcuts: <Kbd>\</Kbd> menu, <Kbd>[</Kbd> list, <Kbd>]</Kbd> details.</p>
            <button onClick={resetLayout} className="mt-3 w-full rounded-[10px] border border-linestrong py-1.5 font-medium hover:border-ink">Reset layout</button>
          </div>
        </>
      )}
    </div>
  );
}

function NavButton({ label, onClick, d, text, active }: { label: string; onClick: () => void; d: string; text?: string; active?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={`h-8 rounded-[9px] flex items-center justify-center gap-2 text-[12.5px] font-medium ${text ? "px-2.5" : "w-8"} ${active ? "bg-surface2 text-ink" : "text-ink2 hover:bg-surface2 hover:text-ink"}`}>
      <Icon d={d} />
      {text}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-ink2">{label}</span>
      {children}
    </div>
  );
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-[9px] bg-surface2 p-0.5">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={value === v} className={`px-2.5 h-7 rounded-[7px] text-[12.5px] font-medium ${value === v ? "bg-surface text-ink shadow-sm" : "text-mute hover:text-ink"}`}>{l}</button>
      ))}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="font-mono text-[11px] border border-linestrong rounded px-1">{children}</kbd>;
}
