"use client";
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { AiMode, StageId } from "@/lib/types";
import { bubblesOf, expand } from "@/lib/shortcuts";
import { api, Avatar, avatarSrc, Banner, Button, every, hasArea, LabelChip, nudgeHelper, Segmented, StageBadge, timeAgo, Toggle, useAppState, usePipeline, type ConvView, type PublicWorkspace } from "@/components/ui";
import { Icon, ICONS, move, ResizeHandle, setLayout, swap, useLayout, type PaneId, type SectionId } from "@/components/layout";
import { Activity, Composer, fillFor, instagramChatUrl, LeadFacts, LeadMeta, Messages, reach, StagePicker, SummaryCard, TagPicker, useThread, type ThreadData } from "@/components/thread";

type Filter = "all" | "unread" | "follow_up" | "needs_human" | "autopilot" | "done";
type Channel = "all" | "instagram" | "messenger";
type Outreach = { template: string; queue: string[]; done: Record<string, "sent" | "skipped"> };

const FILTERS: [Filter, string][] = [["all", "All"], ["unread", "Unread"], ["follow_up", "Follow up"], ["needs_human", "Needs human"], ["autopilot", "Autopilot"], ["done", "Done"]];
const SECTION_NAMES: Record<SectionId, string> = { summary: "Summary so far", stage: "Lead stage", labels: "Tags", known: "What we know", meta: "Profile and owner", notes: "Notes", activity: "Activity" };

// The outreach template takes the same variables as shortcuts, including {link: ...}.
const personalise = (template: string, c: ConvView, ws: PublicWorkspace, stage: string) => expand(template, fillFor(c, ws, stage)).text;

export default function InboxPage() {
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const { state, reload } = useAppState(5000);
  const layout = useLayout();
  const pipe = usePipeline();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params.get("c"));
  const [channel, setChannel] = useState<Channel>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [stages, setStages] = useState<StageId[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [match, setMatch] = useState<"any" | "all">("any");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [outreach, setOutreach] = useState<Outreach | null>(null);
  const [dragPane, setDragPane] = useState<PaneId | null>(null);
  const [overPane, setOverPane] = useState<PaneId | null>(null);

  const all = useMemo(() => state?.conversations ?? [], [state]);
  const narrowed = Boolean(search.trim() || stages.length || labels.length);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((c) => {
      if (channel !== "all" && c.platform !== channel) return false;
      if (stages.length && !stages.includes(c.stage)) return false;
      if (labels.length && !(match === "all" ? labels.every((l) => c.labels.includes(l)) : labels.some((l) => c.labels.includes(l)))) return false;
      if (q && !`${c.name} ${c.handle ?? ""} ${c.preview}`.toLowerCase().includes(q)) return false;
      if (filter === "done") return c.status === "done";
      if (c.status === "done" || c.status === "spam") return filter === "all" && narrowed;
      if (filter === "unread") return c.unread;
      if (filter === "follow_up") return c.status === "follow_up" || (!c.window.open && !c.unread);
      if (filter === "needs_human") return c.labels.includes("Needs human");
      if (filter === "autopilot") return c.aiMode === "autopilot";
      return true;
    });
  }, [all, channel, filter, stages, labels, match, search, narrowed]);

  const shown = useMemo(() => (outreach ? outreach.queue.map((id) => all.find((c) => c.id === id)).filter((c): c is ConvView => Boolean(c)) : list), [outreach, all, list]);

  const counts = useMemo(() => {
    const byLabel: Record<string, number> = {};
    const byStage: Record<string, number> = {};
    for (const c of all) {
      byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;
      for (const l of c.labels) byLabel[l] = (byLabel[l] ?? 0) + 1;
    }
    return { byLabel, byStage };
  }, [all]);

  useEffect(() => {
    if (!selected && shown.length) setSelected(shown[0].id);
  }, [shown, selected]);

  // Replies queued for the Chrome helper go out when the inbox opens, not at the helper's next scheduled check.
  // Only when sending from Chrome is already on: this never switches it on by itself.
  const helperOn = Boolean(state?.conversations.some((c) => c.helperReady));
  useEffect(() => { if (helperOn) nudgeHelper(); }, [helperOn]);

  // While the inbox is open, pull new Instagram messages every 20 seconds.
  const connected = Boolean(state?.workspace.meta.instagram);
  const [syncError, setSyncError] = useState("");
  useEffect(() => {
    if (!connected) return;
    const tick = () => api("/api/meta/sync", "POST").then(() => { setSyncError(""); reload(); }).catch((e) => setSyncError((e as Error).message));
    tick();
    return every(tick, 20000);
  }, [connected, reload]);

  const thread = useThread(selected, reload);

  if (!state) return <div className="p-8 text-mute">Loading inbox…</div>;
  const ws = state.workspace;
  const { order, hidden, widths } = layout.inbox;
  const active = stages.length + labels.length;
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const setHidden = (p: "list" | "detail", v: boolean) => setLayout((l) => ({ ...l, inbox: { ...l.inbox, hidden: { ...l.inbox.hidden, [p]: v } } }));
  const clearFilters = () => { setStages([]); setLabels([]); setFilter("all"); setChannel("all"); setSearch(""); };

  const startOutreach = () => {
    const queue = list.filter((c) => !c.labels.includes("Do not contact")).map((c) => c.id);
    if (!queue.length) return;
    setOutreach({ template: "Hey {first_name}, ", queue, done: {} });
    setSelected(queue[0]);
    setHidden("list", false);
  };
  const advance = (id: string, result: "sent" | "skipped") => {
    if (!outreach) return;
    const done = { ...outreach.done, [id]: result };
    setOutreach({ ...outreach, done });
    const i = outreach.queue.indexOf(id);
    const next = [...outreach.queue.slice(i + 1), ...outreach.queue.slice(0, i)].find((x) => !done[x]);
    if (next) setSelected(next);
  };

  const grip = (p: PaneId) => (
    <span
      draggable
      onDragStart={(e) => { setDragPane(p); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p); }}
      onDragEnd={() => { setDragPane(null); setOverPane(null); }}
      title="Drag onto another panel to swap places"
      aria-label="Drag to move this panel"
      className="cursor-grab active:cursor-grabbing text-mute hover:text-ink shrink-0 -ml-1"
    >
      <Icon d={ICONS.grip} />
    </span>
  );
  const dropProps = (p: PaneId) => ({
    onDragOver: (e: React.DragEvent) => { if (dragPane && dragPane !== p) { e.preventDefault(); setOverPane(p); } },
    onDrop: () => { if (dragPane && dragPane !== p) setLayout((l) => ({ ...l, inbox: { ...l.inbox, order: swap(l.inbox.order, dragPane, p) } })); setDragPane(null); setOverPane(null); },
    "data-drop": overPane === p && dragPane !== p ? "true" : undefined,
  });
  const dropRing = "data-[drop=true]:outline data-[drop=true]:outline-2 data-[drop=true]:-outline-offset-2 data-[drop=true]:outline-ink";

  const visible = order.filter((p) => p === "thread" || !hidden[p]);
  const threadAt = visible.indexOf("thread");
  const outreachDone = outreach ? Object.keys(outreach.done).length : 0;

  const panes: Record<PaneId, React.ReactNode> = {
    list: (
      <section {...dropProps("list")} className={`bg-surface flex flex-col ${dropRing}`} style={{ flex: `0 1 ${widths.list}px`, minWidth: 240 }} aria-label="Conversation list">
        <div className="px-4 pt-3.5 pb-2.5 border-b border-line">
          <div className="flex items-center gap-2">
            {grip("list")}
            <h1 className="display text-[24px] leading-none flex-1">Inbox</h1>
{hasArea(state.me, "settings") && (            <label className="flex items-center gap-2 label !text-ink2" title="On: the AI answers new messages by itself, except in chats set to Off. Off: nothing is sent without you.">
              Autopilot
              <Toggle label="Autopilot master switch" on={ws.settings.autopilotMaster} onChange={async (v) => { await api("/api/workspace", "PUT", { settings: { autopilotMaster: v } }); reload(); }} />
            </label>)}
            <button onClick={() => setHidden("list", true)} aria-label="Hide conversation list" title="Hide this panel ( [ )" className="text-mute hover:text-ink"><Icon d={ICONS.eyeOff} /></button>
          </div>

          {!ws.meta.instagram && hasArea(state.me, "settings") && (
            <div className="mt-3 rounded-[12px] tone-warn px-3 py-2.5 text-[12.5px] leading-snug">
              <b>Your inbox is not live yet.</b> Connect your Instagram through Meta and every message comes in by itself, day and night. <Link className="underline font-semibold" href="/connect">Open Get connected</Link>
            </div>
          )}
          {outreach ? (
            <div className="mt-3 rounded-[12px] border border-linestrong p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="label !text-ink flex-1">Outreach · {outreachDone} of {outreach.queue.length} done</span>
                <button className="text-[12px] font-medium underline" onClick={() => setOutreach(null)}>Finish</button>
              </div>
              {(ws.shortcuts ?? []).length > 0 && (
                <select className="field !py-1 text-[12.5px] mb-1.5" aria-label="Start from a shortcut" value="" onChange={(e) => { const sc = ws.shortcuts.find((x) => x.id === e.target.value); if (sc) setOutreach({ ...outreach, template: sc.text }); }}>
                  <option value="">Start from a shortcut…</option>
                  {ws.shortcuts.map((sc) => <option key={sc.id} value={sc.id}>{sc.trigger} · {sc.name}</option>)}
                </select>
              )}
              <textarea className="field text-[13px]" rows={3} value={outreach.template} onChange={(e) => setOutreach({ ...outreach, template: e.target.value })} aria-label="Outreach message template" placeholder="Write the message. {first_name} becomes each lead's first name." />
              <p className="text-[11.5px] text-mute mt-1.5 leading-snug">Each lead opens with this message filled in. You check it, then press Send and next. Nothing goes out in bulk.</p>
            </div>
          ) : (
            <>
              <div className="flex gap-4 mt-3 text-[13px] font-medium">
                {(["all", "instagram", "messenger"] as const).map((c) => (
                  <button key={c} onClick={() => setChannel(c)} className={`pb-1.5 border-b-2 capitalize ${channel === c ? "border-ink text-ink" : "border-transparent text-mute hover:text-ink"}`}>
                    {c === "all" ? "All messages" : c}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-2.5">
                <input className="field !py-1.5" placeholder="Search people and messages" value={search} onChange={(e) => setSearch(e.target.value)} />
                <button onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} aria-label="Filters" className={`shrink-0 h-[35px] px-2.5 rounded-[10px] border flex items-center gap-1.5 text-[13px] font-medium ${showFilters || active ? "bg-ink text-onbrand border-transparent" : "border-linestrong hover:border-ink"}`}>
                  <Icon d={ICONS.filter} />
                  Filters{active ? ` ${active}` : ""}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {FILTERS.map(([f, l]) => (
                  <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${filter === f ? "bg-ink text-onbrand" : "bg-surface2 text-ink2 hover:text-ink"}`}>{l}</button>
                ))}
              </div>

              {showFilters && (
                <div className="mt-3 rounded-[12px] border border-linestrong p-3 max-h-[52vh] overflow-y-auto scroll" aria-label="Filter by stage and tag">
                  {layout.views.length > 0 && (
                    <div className="mb-3">
                      <div className="label mb-1.5">Saved views</div>
                      <div className="flex flex-wrap gap-1.5">
                        {layout.views.map((v) => (
                          <span key={v.name} className="inline-flex items-center rounded-full border border-linestrong text-[12px] font-medium">
                            <button className="pl-2.5 pr-1 py-1 hover:underline" onClick={() => { setChannel(v.channel as Channel); setFilter(v.filter as Filter); setStages(v.stages); setLabels(v.labels); setMatch(v.match); }}>{v.name}</button>
                            <button className="pr-2 pl-0.5 text-mute hover:text-ink" aria-label={`Delete view ${v.name}`} onClick={() => setLayout((l) => ({ ...l, views: l.views.filter((x) => x.name !== v.name) }))}>×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-1">
                    <span className="label">Tags</span>
                    <span className="flex items-center gap-1.5 text-[12px] text-mute">
                      Match
                      <Segmented value={match} label="Tag matching" options={[["any", "Any"], ["all", "All"]]} onChange={setMatch} />
                    </span>
                  </div>
                  {pipe.groups.map((g) => (
                    <div key={g.group} className="mt-2">
                      <div className="text-[11.5px] text-mute mb-1">{g.group}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.labels.map((l) => (
                          <FilterChip key={l} on={labels.includes(l)} onClick={() => setLabels(toggle(labels, l))} count={counts.byLabel[l] ?? 0}>{l}</FilterChip>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="label mt-3.5 mb-1.5">Stage</div>
                  <div className="flex flex-wrap gap-1.5">
                    {pipe.stages.filter((s) => !s.hidden || counts.byStage[s.id]).map((s) => (
                      <FilterChip key={s.id} on={stages.includes(s.id)} onClick={() => setStages(toggle(stages, s.id))} count={counts.byStage[s.id] ?? 0} dot={s.color}>{s.name}</FilterChip>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3.5">
                    <Button disabled={!active && filter === "all" && channel === "all"} onClick={() => {
                      const name = window.prompt("Name this view")?.trim();
                      if (name) setLayout((l) => ({ ...l, views: [...l.views.filter((v) => v.name !== name), { name, channel, filter, stages, labels, match }] }));
                    }}>Save view</Button>
                    <Button variant="ghost" onClick={clearFilters}>Clear all</Button>
                  </div>
                </div>
              )}

              {active > 0 && !showFilters && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {stages.map((s) => <ActiveChip key={s} onRemove={() => setStages(stages.filter((x) => x !== s))}>{pipe.stage(s).name}</ActiveChip>)}
                  {labels.map((l) => <ActiveChip key={l} onRemove={() => setLabels(labels.filter((x) => x !== l))}>{l}</ActiveChip>)}
                </div>
              )}

              <div className="flex items-center gap-2 mt-2.5">
                <span className="text-[12px] text-mute flex-1">{list.length} {list.length === 1 ? "lead" : "leads"}{narrowed || filter !== "all" || channel !== "all" ? " match" : ""}</span>
                <Button disabled={!list.length} onClick={startOutreach} title="Work through these leads one by one with a message template">
                  <Icon d={ICONS.send} size={14} />
                  Message these {list.length}
                </Button>
              </div>
            </>
          )}
        </div>
        {syncError && <div className="px-4 py-2"><Banner tone="error">Instagram sync failed: {syncError}</Banner></div>}
        <div className="flex-1 overflow-y-auto scroll">
          {shown.length === 0 && <p className="p-6 text-mute text-center">No conversations match.</p>}
          {shown.map((c) => {
            const r = outreach ? reach(c) : null;
            const result = outreach?.done[c.id];
            return (
              <button key={c.id} onClick={() => setSelected(c.id)} className={`d-row w-full text-left px-4 py-3 flex gap-3 border-b border-line ${selected === c.id ? "bg-surface2" : "hover:bg-canvas"} ${result ? "opacity-55" : ""}`}>
                <Avatar name={c.name} platform={c.platform} src={avatarSrc(c)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${c.unread ? "font-semibold" : "font-medium"}`}>{c.name}</span>
                    <span className="text-[11px] text-mute shrink-0">{timeAgo(c.lastMessageAt)}</span>
                  </div>
                  <div className={`truncate text-[13px] ${c.unread ? "text-ink font-medium" : "text-mute"}`}>{c.preview}{c.seen && <span className="text-mute font-normal"> · Seen</span>}</div>
                  <div className="d-extra flex items-center gap-1.5 mt-1.5 overflow-hidden">
                    <StageBadge stage={c.stage} small />
                    {result && <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-ink text-onbrand uppercase">{result}</span>}
                    {r && !result && !r.ok && <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 tone-err">CANNOT SEND</span>}
                    {!outreach && c.aiMode === "autopilot" && <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 border border-linestrong">AI</span>}
                    {!outreach && c.labels.includes("Needs human") && <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 tone-err">HUMAN</span>}
                    {!outreach && c.window.closing && <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 tone-warn">{Math.ceil(c.window.hoursLeft)}h left</span>}
                    {!outreach && labels.filter((l) => c.labels.includes(l)).slice(0, 2).map((l) => <LabelChip key={l} label={l} />)}
                  </div>
                </div>
                {c.unread && <span className="w-2 h-2 rounded-full bg-ink mt-2 shrink-0" />}
              </button>
            );
          })}
        </div>
      </section>
    ),
    thread: selected && thread.d ? (
      <ThreadPane
        key={`${selected}:${outreach && !outreach.done[selected] && outreach.queue.includes(selected) ? "outreach" : "chat"}`}
        t={thread}
        ws={ws}
        demoEngine={!state.flags.ai || Boolean(state.flags.aiError)}
        grip={grip("thread")}
        dropProps={dropProps("thread")}
        dropRing={dropRing}
        listHidden={hidden.list}
        detailHidden={hidden.detail}
        listFirst={order.indexOf("list") < order.indexOf("thread")}
        detailFirst={order.indexOf("detail") < order.indexOf("thread")}
        onShow={(p) => setHidden(p, false)}
        outreach={outreach && !outreach.done[selected] && outreach.queue.includes(selected) ? { text: personalise(outreach.template, thread.d.conversation, ws, pipe.stage(thread.d.conversation.stage).name), advance: (r) => advance(selected, r) } : null}
      />
    ) : (
      <section {...dropProps("thread")} className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-3 text-mute bg-surface ${dropRing}`}>
        {thread.err || (selected ? "Loading…" : "Select a conversation")}
        {hidden.list && <Button onClick={() => setHidden("list", false)}>Show conversation list</Button>}
      </section>
    ),
    detail: selected && thread.d ? (
      <DetailPane t={thread} ws={ws} width={widths.detail} grip={grip("detail")} dropProps={dropProps("detail")} dropRing={dropRing} onHide={() => setHidden("detail", true)} />
    ) : null,
  };

  return (
    <div className="h-full flex">
      {visible.map((p, i) => {
        if (!panes[p]) return null;
        const before = p !== "thread" && i > threadAt;
        const after = p !== "thread" && i < threadAt;
        const handle = (dir: 1 | -1) => (
          <ResizeHandle
            dir={dir}
            label={`Resize ${p === "list" ? "conversation list" : "lead details"}`}
            // On a small window the panel is drawn narrower than its saved width. Start the drag from what is on screen.
            onStart={() => {
              const el = document.querySelector(p === "list" ? 'section[aria-label="Conversation list"]' : 'aside[aria-label="Lead details"]');
              if (el) setLayout((l) => ({ ...l, inbox: { ...l.inbox, widths: { ...l.inbox.widths, [p]: Math.round(el.getBoundingClientRect().width / l.scale) } } }));
            }}
            onResize={(d) => setLayout((l) => ({ ...l, inbox: { ...l.inbox, widths: { ...l.inbox.widths, [p]: l.inbox.widths[p as "list" | "detail"] + d } } }))} />
        );
        return (
          <Fragment key={p}>
            {i > 0 && <div className="w-px bg-line shrink-0" />}
            {before && handle(-1)}
            {panes[p]}
            {after && handle(1)}
          </Fragment>
        );
      })}
    </div>
  );
}

function FilterChip({ on, onClick, count, dot, children }: { on: boolean; onClick: () => void; count: number; dot?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium border ${on ? "bg-ink text-onbrand border-transparent" : count ? "border-linestrong text-ink hover:border-ink" : "border-line text-mute hover:border-ink"}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />}
      {children}
      <span className={`tabular-nums ${on ? "opacity-70" : "text-mute"}`}>{count}</span>
    </button>
  );
}

function ActiveChip({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink text-onbrand pl-2.5 pr-1.5 py-0.5 text-[12px] font-medium">
      {children}
      <button onClick={onRemove} aria-label="Remove filter" className="opacity-70 hover:opacity-100">×</button>
    </span>
  );
}

interface PaneChrome { grip: React.ReactNode; dropProps: Record<string, unknown>; dropRing: string }

function ThreadPane({ t, ws, demoEngine, grip, dropProps, dropRing, listHidden, detailHidden, listFirst, detailFirst, onShow, outreach }: PaneChrome & {
  t: ThreadData; ws: PublicWorkspace; demoEngine: boolean; listHidden: boolean; detailHidden: boolean; listFirst: boolean; detailFirst: boolean;
  onShow: (p: "list" | "detail") => void; outreach: { text: string; advance: (r: "sent" | "skipped") => void } | null;
}) {
  const d = t.d!;
  const id = t.id!;
  const c = d.conversation;
  const [draft, setDraft] = useState(outreach?.text ?? "");
  // While working an outreach queue, a change to the template flows into the open reply, unless it has been edited by hand.
  const applied = useRef(outreach?.text ?? "");
  useEffect(() => {
    if (!outreach || outreach.text === applied.current) return;
    const before = applied.current;
    const next = outreach.text;
    applied.current = next;
    setDraft((d) => (d === before ? next : d));
  }, [outreach?.text]); // eslint-disable-line react-hooks/exhaustive-deps
  const [bubbles, setBubbles] = useState<string[] | null>(null);
  const [note, setNote] = useState("");
  const [sim, setSim] = useState("");
  const [teach, setTeach] = useState(true);
  const { busy, err, run, patch } = t;

  const sug = c.suggestion ?? null;
  useEffect(() => { setBubbles(sug && !outreach ? sug.bubbles : null); }, [sug?.createdAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDemo = c.externalId.startsWith("demo_");
  const send = async (list: string[], sender: "owner" | "ai") => {
    setNote("");
    const ok = await run("send", async () => {
      const r = await api<{ simulated: boolean; learned?: boolean; via?: string; conversation?: ConvView }>(`/api/conversations/${id}/send`, "POST", { bubbles: list, sender, teach });
      if (r.via === "helper") nudgeHelper();
      if (r.via === "helper" && !r.conversation?.helperReady) setNote("Saved. The helper sends it from Chrome once it is on: open Chrome, keep it signed in to Instagram, and switch sending on in the helper.");
      else if (r.learned) setNote("Answer saved to the knowledge base. The AI will handle this question itself from now on. You can edit it in Playbook.");
      else if (r.simulated) setNote("Demo thread: message recorded here only, nothing was sent to Meta.");
      setDraft(""); setBubbles(null);
    });
    if (ok && outreach) outreach.advance("sent");
  };
  const suggest = () => run("suggest", () => api(`/api/conversations/${id}/suggest`, "POST"));
  const simulate = () => run("sim", async () => {
    const r = await api<{ trigger: string | null }>(`/api/conversations/${id}/simulate`, "POST", { text: sim });
    setSim("");
    if (r.trigger) setNote(`Keyword trigger "${r.trigger}" replied straight away.`);
  });
  const r = reach(c);

  const showBtn = (p: "list" | "detail") => (
    <button onClick={() => onShow(p)} aria-label={p === "list" ? "Show conversation list" : "Show lead details"} title={p === "list" ? "Show conversation list ( [ )" : "Show lead details ( ] )"} className="h-8 w-8 rounded-[9px] border border-linestrong flex items-center justify-center text-ink2 hover:border-ink hover:text-ink shrink-0">
      <Icon d={(p === "list" ? listFirst : detailFirst) ? ICONS.panelLeft : ICONS.panelRight} />
    </button>
  );

  return (
    <section {...dropProps} className={`@container flex-1 min-w-[380px] flex flex-col bg-surface ${dropRing}`} aria-label="Conversation">
      <header className="border-b border-line">
        <div className="px-4 pt-3 pb-2.5 flex items-center gap-3">
          {listHidden && listFirst && showBtn("list")}
          {detailHidden && detailFirst && showBtn("detail")}
          {grip}
          <Avatar name={c.name} platform={c.platform} src={avatarSrc(c)} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[15px] truncate">{c.name}</div>
            <div className="text-[12px] text-mute truncate">{c.handle ? `@${c.handle} · ` : ""}{c.origin} · {c.messageCount} messages</div>
          </div>
          <span className="hidden @md:inline-flex"><StageBadge stage={c.stage} /></span>
          {listHidden && !listFirst && showBtn("list")}
          {detailHidden && !detailFirst && showBtn("detail")}
        </div>
        <div className="px-4 pb-2.5 flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <span className="label hidden @md:inline">AI</span>
            <Segmented<AiMode> label="AI for this chat" value={c.aiMode === "off" ? "off" : "suggest"} options={[["suggest", "AI on"], ["off", "AI off"]]} onChange={(v) => patch({ aiMode: v })} />
          </div>
          <span className="text-[12px] text-mute flex-1 min-w-0 truncate invisible @2xl:visible">
            {c.aiMode === "off" ? "AI off here, even with Autopilot on." : !ws.settings.autopilotMaster ? "Autopilot is off: the AI drafts only when you press Suggest." : "Autopilot on: the AI answers new messages here by itself."}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant={c.status === "follow_up" ? "primary" : "secondary"} aria-pressed={c.status === "follow_up"} title="Flag this conversation for follow up" onClick={() => patch({ status: c.status === "follow_up" ? "open" : "follow_up" })}>
              <Icon d={ICONS.flag} size={14} />
              <span className="hidden @md:inline">{c.status === "follow_up" ? "Following up" : "Follow up"}</span>
            </Button>
            <Button variant={c.status === "done" ? "primary" : "secondary"} aria-pressed={c.status === "done"} title="Mark this conversation done" onClick={() => patch({ status: c.status === "done" ? "open" : "done" })}>
              <Icon d={ICONS.check} size={14} />
              <span className="hidden @md:inline">{c.status === "done" ? "Reopen" : "Done"}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="d-msgs flex-1 overflow-y-auto scroll px-5 py-4 bg-canvas">
        <Messages messages={d.messages} who={{ name: c.name, src: avatarSrc(c) }} />
      </div>

      <div className="border-t border-line p-3 flex flex-col gap-2">
        {err && <Banner tone="error">{err}</Banner>}
        {note && <Banner tone="info">{note}</Banner>}
        {!outreach && !c.window.open && c.lastInboundAt && c.sendVia !== "helper" && (
          <Banner tone="warn">The 24 hour window has closed. Meta only allows a person to send here, up to 7 days after the lead&apos;s last message. The AI can still draft it for you.</Banner>
        )}
        {!outreach && !isDemo && c.sendVia === "none" && (
          <Banner tone="warn">{c.platform !== "instagram" ? "Connect the Facebook Page on Get connected to reply to Messenger threads from here." : !c.handle ? "This chat came from your Instagram history download, which has no username, so it cannot be sent from here yet. Open the chat once in Instagram with the helper on and it links up." : "Add the Ainable Setter Helper to Chrome on Get connected. It sends your replies from here for free."}</Banner>
        )}
        {ws.settings.autopilotMaster && c.aiMode !== "off" && demoEngine && <Banner tone="warn">Autopilot is on, but Claude is not available (no key, or no credit on the account), so nothing is sent automatically. Add credit to the Anthropic account to let it reply.</Banner>}

        {c.gap && !outreach && (
          <div className="rounded-[12px] border border-err p-3 bg-canvas">
            <div className="flex items-center gap-2 mb-1">
              <span className="label !text-err">The AI needs your answer</span>
              <span className="text-[12px] text-mute flex-1">It has not been told how to handle this {c.gap.kind}, so it has not replied.</span>
            </div>
            <p className="text-[14px] font-medium">{c.gap.question}</p>
            {c.gap.quote && c.gap.quote !== c.gap.question && <blockquote className="text-[13px] border-l-2 border-line pl-2.5 mt-1.5 italic text-ink2">{c.gap.quote}</blockquote>}
            <label className="flex items-center gap-2 mt-2.5 text-[13px] cursor-pointer">
              <input type="checkbox" checked={teach} onChange={(e) => setTeach(e.target.checked)} />
              <span>Reply below and the AI learns your answer for every future lead{c.gap.conversationIds.length > 1 ? `. ${c.gap.conversationIds.length} leads have asked this` : ""}.</span>
            </label>
          </div>
        )}

        {bubbles && sug && !(c.gap && !bubbles.length) && (
          <div className={`rounded-[12px] border p-3 ${sug.needsHuman ? "border-err" : "border-linestrong"} bg-canvas`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`label ${sug.needsHuman ? "!text-err" : "!text-ink"}`}>{sug.needsHuman ? "Needs you" : "Suggested reply"}</span>
              <span className="text-[12px] text-mute flex-1">{sug.reason}</span>
            </div>
            {(sug.times?.length || sug.picked) && (
              <div className="text-[12px] mb-2 rounded-[8px] tone-ok px-2 py-1">
                {sug.picked ? "Sends the Calendly link for " : "Free in your Calendly right now: "}
                <b>{(sug.picked ? [sug.picked] : sug.times ?? []).map((x) => new Date(x.start).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: ws.calendar.timezone || ws.calendar.user?.timezone || undefined })).join(" · ")}</b>
                {" "}({ws.calendar.zone})
              </div>
            )}
            {bubbles.map((b, i) => (
              <textarea key={i} className="field mb-1.5 text-[14px]" rows={Math.min(5, Math.max(1, Math.ceil(b.length / 70)))} value={b} onChange={(e) => setBubbles(bubbles.map((x, k) => (k === i ? e.target.value : x)))} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy) send(bubbles, "ai"); } }} aria-label={`Suggested message ${i + 1}`} />
            ))}
            <div className="flex gap-2 mt-1">
              {bubbles.length > 0 && <Button variant="primary" disabled={!!busy} onClick={() => send(bubbles, "ai")}>{busy === "send" ? "Sending…" : `Send ${bubbles.length > 1 ? `${bubbles.length} messages` : "reply"}`}</Button>}
              <Button disabled={!!busy} onClick={suggest}>{busy === "suggest" ? "Thinking…" : "Rewrite"}</Button>
              <Button variant="ghost" onClick={() => setBubbles(null)}>Dismiss</Button>
            </div>
          </div>
        )}

        {outreach && (
          <div className={`rounded-[10px] px-3 py-2 text-[13px] flex items-center gap-2 ${r.ok ? "bg-surface2 text-ink2" : "tone-err"}`}>
            <span className="label !text-current">Outreach</span>
            <span className="flex-1">{r.text}</span>
          </div>
        )}

        {!outreach && !r.ok && (
          <div className="rounded-[10px] px-3 py-2 text-[13px] flex items-center gap-2 tone-warn">
            <span className="flex-1">{r.text}.</span>
            {instagramChatUrl(c) && <a href={instagramChatUrl(c)} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2 shrink-0">Open in Instagram</a>}
          </div>
        )}

        <Composer
          c={c} ws={ws} value={draft} onChange={setDraft} rows={outreach ? 3 : 2} busy={busy === "send"}
          disabled={!r.ok} sendLabel={outreach ? "Send and next" : "Send"} onSend={(list) => send(list, "owner")}
          extra={<>
            {outreach && <Button onClick={() => outreach.advance("skipped")}>Skip</Button>}
            {!outreach && !bubbles && c.aiMode !== "off" && <Button disabled={!!busy} onClick={suggest}>{busy === "suggest" ? "Thinking…" : "Suggest"}</Button>}
          </>}
        />
        {isDemo && !outreach && (
          <div className="flex gap-2 items-center">
            <input className="field flex-1 !py-1.5 text-[13px]" placeholder="Demo thread: type what the lead says next, to test the AI" value={sim} onChange={(e) => setSim(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && sim.trim()) simulate(); }} />
            <Button disabled={!sim.trim() || !!busy} onClick={simulate}>Add lead message</Button>
          </div>
        )}
      </div>
    </section>
  );
}

function DetailPane({ t, ws, width, grip, dropProps, dropRing, onHide }: PaneChrome & { t: ThreadData; ws: PublicWorkspace; width: number; onHide: () => void }) {
  const layout = useLayout();
  const d = t.d!;
  const c = d.conversation;
  const { patch } = t;
  const { order, collapsed } = layout.detail;

  const sections: Record<SectionId, React.ReactNode> = {
    summary: <SummaryCard t={t} />,
    stage: <StagePicker c={c} patch={patch} />,
    labels: <TagPicker key={c.id} labels={c.labels} patch={patch} />,
    known: <LeadFacts key={c.id} c={c} patch={patch} />,
    meta: <LeadMeta c={c} ws={ws} patch={patch} />,
    notes: <textarea key={c.id} className="field text-[13px]" rows={2} defaultValue={c.notes} placeholder="Private notes" onBlur={(e) => e.target.value !== c.notes && patch({ notes: e.target.value })} />,
    activity: <Activity events={d.events} />,
  };

  return (
    <aside {...dropProps} className={`bg-surface flex flex-col ${dropRing}`} style={{ flex: `0 1 ${width}px`, minWidth: 240 }} aria-label="Lead details">
      <div className="px-4 h-11 flex items-center gap-2 border-b border-line shrink-0">
        {grip}
        <span className="label !text-ink flex-1">Lead details</span>
        <button onClick={onHide} aria-label="Hide lead details" title="Hide this panel ( ] )" className="text-mute hover:text-ink"><Icon d={ICONS.eyeOff} /></button>
      </div>
      <div className="flex-1 overflow-y-auto scroll">
        {order.map((s, i) => {
          const closed = Boolean(collapsed[s]);
          return (
            <div key={s} className="d-sec group px-4 py-2.5 border-b border-line">
              <div className="flex items-center gap-1">
                <button className="flex items-center gap-1.5 flex-1 text-left" aria-expanded={!closed} onClick={() => setLayout((l) => ({ ...l, detail: { ...l.detail, collapsed: { ...l.detail.collapsed, [s]: !closed } } }))}>
                  <span className="text-mute"><Icon d={closed ? ICONS.chevRight : ICONS.chevDown} size={13} /></span>
                  <h3 className="label">{SECTION_NAMES[s]}</h3>
                  {closed && s === "stage" && <span className="ml-1"><StageBadge stage={c.stage} small /></span>}
                  {closed && s === "labels" && <span className="ml-1 text-[12px] text-mute">{c.labels.length}</span>}
                </button>
                <span className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 text-mute">
                  <button aria-label={`Move ${SECTION_NAMES[s]} up`} disabled={i === 0} className="p-0.5 hover:text-ink disabled:opacity-25" onClick={() => setLayout((l) => ({ ...l, detail: { ...l.detail, order: move(l.detail.order, s, -1) } }))}><Icon d={ICONS.chevUp} size={14} /></button>
                  <button aria-label={`Move ${SECTION_NAMES[s]} down`} disabled={i === order.length - 1} className="p-0.5 hover:text-ink disabled:opacity-25" onClick={() => setLayout((l) => ({ ...l, detail: { ...l.detail, order: move(l.detail.order, s, 1) } }))}><Icon d={ICONS.chevDown} size={14} /></button>
                </span>
              </div>
              {!closed && <div className="mt-2">{sections[s]}</div>}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
