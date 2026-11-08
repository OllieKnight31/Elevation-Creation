"use client";
import { useEffect, useMemo, useState } from "react";
import { CAPI_EVENTS, type StageDef, type TagDef, type TagTone } from "@/lib/pipeline";
import { api, Banner, Button, PageHeader, useAppState, usePipeline } from "@/components/ui";
import { Icon, ICONS } from "@/components/layout";

// A tag keeps the name it was loaded with so a rename can follow the leads that carry it.
type TagRow = TagDef & { was?: string; key: string };
type StageRow = StageDef & { isNew?: boolean };

const EVENT_HELP: Record<string, string> = { QualifiedLead: "Qualified lead", LeadSubmitted: "Lead submitted", Purchase: "Purchase" };
const TONES: ["" | TagTone, string][] = [["", "Plain"], ["warn", "Amber"], ["err", "Red"], ["ink", "Solid"]];
let seq = 0;
const rowKey = () => `k${++seq}`;

export default function PipelinePage() {
  const { state, reload } = useAppState(15000);
  const pipe = usePipeline();
  const [stages, setStages] = useState<StageRow[] | null>(null);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Load once, and again after a save. Edits in progress are never overwritten by the background refresh.
  useEffect(() => {
    if (!state || dirty || busy) return;
    setStages(pipe.stages.map((s) => ({ ...s })));
    setTags(pipe.tags.map((t) => ({ ...t, was: t.name, key: rowKey() })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipe, Boolean(state), dirty, busy]);

  const usage = useMemo(() => {
    const byStage: Record<string, number> = {};
    const byTag: Record<string, number> = {};
    for (const c of state?.conversations ?? []) {
      byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;
      for (const l of c.labels) byTag[l] = (byTag[l] ?? 0) + 1;
    }
    return { byStage, byTag };
  }, [state]);

  if (!state || !stages) return <div className="p-8 text-mute">Loading stages and tags…</div>;

  const touch = () => { setDirty(true); setMsg(null); };
  const setStage = (i: number, p: Partial<StageRow>) => { setStages(stages.map((s, k) => (k === i ? { ...s, ...p } : s))); touch(); };
  const setTag = (k: string, p: Partial<TagRow>) => { setTags(tags.map((t) => (t.key === k ? { ...t, ...p } : t))); touch(); };
  const shift = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[i], next[j]] = [next[j], next[i]];
    setStages(next); touch();
  };
  const groups = [...new Set(tags.map((t) => t.group))];

  const save = async () => {
    setBusy(true); setMsg(null);
    const tagRenames: Record<string, string> = {};
    for (const t of tags) if (t.was && t.was !== t.name.trim()) tagRenames[t.was] = t.name.trim();
    try {
      await api("/api/workspace", "PUT", {
        pipeline: {
          stages: stages.map(({ id, name, color, capiEvent, needsReason, hidden }) => ({ id, name, color, capiEvent, needsReason, hidden })),
          tags: tags.map(({ name, group, rule, tone }) => ({ name, group, rule, tone })),
        },
        tagRenames,
      });
      setDirty(false);
      await reload();
      setMsg({ tone: "ok", text: "Saved. The inbox, board, filters and the AI now use this set." });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    if (!window.confirm("Put the stages and tags back to the built in set? Tags you created come off their leads.")) return;
    setBusy(true); setMsg(null);
    try {
      await api("/api/workspace", "PUT", { pipeline: null });
      setDirty(false);
      await reload();
      setMsg({ tone: "ok", text: "Back to the built in stages and tags." });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="d-page h-full overflow-y-auto scroll p-6">
      <PageHeader title="Stages and tags" sub="Your pipeline, your words. The AI tags conversations with these and the board, filters and Business Suite labels follow.">
        <Button variant="ghost" disabled={busy} onClick={restore}>Restore built in set</Button>
        <Button variant="primary" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : dirty ? "Save changes" : "Saved"}</Button>
      </PageHeader>
      {msg && <div className="mb-4"><Banner tone={msg.tone}>{msg.text}</Banner></div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <section className="card p-4" aria-label="Stages">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">Stages</h2>
            <Button onClick={() => { setStages([...stages, { id: `c_${Date.now().toString(36)}`, name: "", color: "#6b7280", group: "qualified", isNew: true }]); touch(); }}><Icon d={ICONS.plus} size={14} />Add stage</Button>
          </div>
          <p className="text-[12px] text-mute leading-snug mb-3">A lead is in exactly one stage. Order here is the order everywhere. Built in stages can be renamed or hidden but not deleted, because messages, links and bookings move leads through them. Stages you add are moved by hand or by dragging.</p>
          <div className="grid grid-cols-[auto_1fr_150px_auto_auto] gap-x-2 gap-y-1.5 items-center text-[13px]">
            <span /><span className="label">Name</span><span className="label">Meta event</span><span className="label" title="Ask for a reason when a lead is moved here">Reason</span><span />
            {stages.map((s, i) => {
              const n = usage.byStage[s.id] ?? 0;
              return (
                <div key={s.id} className={`contents ${s.hidden ? "[&_input[type=text]]:opacity-50" : ""}`} data-stage={s.id}>
                  <input type="color" value={s.color} onChange={(e) => setStage(i, { color: e.target.value })} aria-label={`Colour of ${s.name || "new stage"}`} className="w-6 h-6 rounded-full border border-line bg-transparent p-0 cursor-pointer" />
                  <input type="text" className="field !py-1.5" value={s.name} placeholder="Stage name" maxLength={40} autoFocus={s.isNew && !s.name} onChange={(e) => setStage(i, { name: e.target.value })} aria-label={`Stage ${i + 1} name`} />
                  <select className="field !py-1.5 text-[12.5px]" value={s.capiEvent ?? ""} onChange={(e) => setStage(i, { capiEvent: (e.target.value || undefined) as StageDef["capiEvent"] })} aria-label={`Meta event for ${s.name}`}>
                    <option value="">None</option>
                    {CAPI_EVENTS.map((ev) => <option key={ev} value={ev}>{EVENT_HELP[ev]}</option>)}
                  </select>
                  <input type="checkbox" checked={Boolean(s.needsReason)} onChange={(e) => setStage(i, { needsReason: e.target.checked })} aria-label={`Ask for a reason when moving to ${s.name}`} className="w-4 h-4 justify-self-center accent-[var(--c-ink)]" />
                  <div className="flex items-center gap-0.5 text-mute">
                    <span className="text-[11.5px] tabular-nums w-7 text-right" title={`${n} leads in this stage`}>{n || ""}</span>
                    <button aria-label={`Move ${s.name} up`} disabled={i === 0} className="p-0.5 rounded hover:bg-surface2 hover:text-ink disabled:opacity-25" onClick={() => shift(i, -1)}><Icon d={ICONS.chevUp} size={14} /></button>
                    <button aria-label={`Move ${s.name} down`} disabled={i === stages.length - 1} className="p-0.5 rounded hover:bg-surface2 hover:text-ink disabled:opacity-25" onClick={() => shift(i, 1)}><Icon d={ICONS.chevDown} size={14} /></button>
                    {s.system ? (
                      <button aria-label={`${s.hidden ? "Show" : "Hide"} ${s.name}`} aria-pressed={Boolean(s.hidden)} title={s.hidden ? "Hidden from pickers and the board. Click to show" : "Hide this built in stage"} className={`px-1.5 h-6 rounded-md text-[11px] font-medium border ${s.hidden ? "bg-ink text-onbrand border-transparent" : "border-line hover:border-ink hover:text-ink"}`} onClick={() => setStage(i, { hidden: !s.hidden })}>{s.hidden ? "Hidden" : "Hide"}</button>
                    ) : (
                      <button aria-label={`Delete ${s.name || "new stage"}`} disabled={n > 0} title={n ? `Move the ${n} leads out first` : "Delete this stage"} className="px-1.5 h-6 rounded-md border border-line hover:border-err hover:text-err disabled:opacity-30" onClick={() => { setStages(stages.filter((_, k) => k !== i)); touch(); }}><Icon d={ICONS.trash} size={13} /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card p-4" aria-label="Tags">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">Tags</h2>
            <Button onClick={() => { const g = window.prompt("Name of the new tag group")?.trim().slice(0, 24); if (g) { setTags([...tags, { name: "", group: g, key: rowKey() }]); touch(); } }}><Icon d={ICONS.plus} size={14} />Add group</Button>
          </div>
          <p className="text-[12px] text-mute leading-snug mb-3">A lead can carry any number of tags. Write a rule in plain words and the AI applies the tag when a conversation meets it. Leave the rule empty to use the tag by hand only.</p>
          {groups.map((g) => (
            <div key={g} className="mb-4" data-group={g}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="label !text-ink flex-1">{g}</span>
                <button className="text-[12px] font-medium underline" onClick={() => { setTags([...tags, { name: "", group: g, key: rowKey() }]); touch(); }}>Add tag</button>
              </div>
              <div className="space-y-1.5">
                {tags.filter((t) => t.group === g).map((t) => {
                  const n = usage.byTag[t.was ?? ""] ?? 0;
                  return (
                    <div key={t.key} className="flex items-center gap-1.5">
                      <input type="text" className="field !py-1.5 !w-[150px] shrink-0" value={t.name} disabled={t.locked} placeholder="Tag name" maxLength={30} autoFocus={!t.was && !t.name} onChange={(e) => setTag(t.key, { name: e.target.value })} aria-label="Tag name" title={t.locked ? "The automation uses this tag by name, so it cannot be renamed" : undefined} />
                      <input type="text" className="field !py-1.5 flex-1 min-w-0 text-[12.5px]" value={t.rule ?? ""} placeholder="When should the AI apply it?" maxLength={240} onChange={(e) => setTag(t.key, { rule: e.target.value })} aria-label={`AI rule for ${t.name || "new tag"}`} />
                      <select className="field !py-1.5 !w-[82px] shrink-0 text-[12.5px]" value={t.tone ?? ""} disabled={t.locked} onChange={(e) => setTag(t.key, { tone: (e.target.value || undefined) as TagTone | undefined })} aria-label={`Colour of ${t.name || "new tag"}`}>
                        {TONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <span className="text-[11.5px] text-mute tabular-nums w-5 text-right shrink-0" title={`${n} leads carry this tag`}>{n || ""}</span>
                      <button aria-label={`Delete tag ${t.name || "new tag"}`} disabled={t.locked} title={t.locked ? "Needed by the automation" : n ? `Delete, and take it off ${n} leads` : "Delete this tag"} className="px-1.5 h-7 rounded-md border border-line text-mute hover:border-err hover:text-err disabled:opacity-30 shrink-0" onClick={() => { if (!n || window.confirm(`"${t.name}" is on ${n} leads. Delete it and take it off them?`)) { setTags(tags.filter((x) => x.key !== t.key)); touch(); } }}><Icon d={ICONS.trash} size={13} /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
