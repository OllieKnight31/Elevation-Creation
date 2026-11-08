"use client";
import { useMemo, useState } from "react";
import type { StageId } from "@/lib/types";
import type { Pipeline } from "@/lib/pipeline";
import { api, Avatar, avatarSrc, Button, hasArea, LabelChip, PageHeader, Segmented, StageBadge, timeAgo, useAppState, usePipeline, type ConvView } from "@/components/ui";
import { Icon, ICONS, setLayout, useLayout, type BoardView, type Layout } from "@/components/layout";
import LeadPopup from "@/components/LeadPopup";

// Ready made board views. The owner's own saved views sit beside these.
const PRESET_VIEWS: { name: string; hint: string; hide: StageId[] }[] = [
  { name: "Everything", hint: "Every stage", hide: [] },
  { name: "Setter view", hint: "First message to link sent", hide: ["booked", "showed", "no_show", "won", "lost"] },
  { name: "Closer view", hint: "Qualified to won", hide: ["inbound", "outbound", "in_conversation", "business_model_sent", "disqualified", "nurture"] },
];
const SWATCHES = ["#0891b2", "#7c3aed", "#ca8a04", "#ea580c", "#16a34a", "#dc2626", "#db2777", "#6b7280"];

// Stages that share a column until the owner arranges the board themselves.
const STACKS: StageId[][] = [["inbound", "outbound"], ["showed", "no_show"], ["lost", "disqualified", "nurture"]];

/** Board columns in force: the owner's arrangement, kept in step with the stages that exist now. */
function boardColumns(leads: Layout["leads"], pipe: Pipeline, inUse: Set<StageId>): StageId[][] {
  const usable = (id: StageId) => pipe.has(id) && !leads.hiddenCols.includes(id) && (!pipe.stage(id).hidden || inUse.has(id));
  const cols: StageId[][] = (leads.columns ?? []).map((g) => g.filter(usable)).filter((g) => g.length);
  const placed = new Set(cols.flat());
  for (const s of pipe.stages) {
    if (placed.has(s.id) || !usable(s.id)) continue;
    // Stages added since the board was arranged go on the end; on an untouched board the usual pairs stack.
    const stack = leads.columns ? [s.id] : (STACKS.find((g) => g.includes(s.id)) ?? [s.id]).filter((id) => usable(id) && !placed.has(id));
    stack.sort((a, b) => pipe.rank(a) - pipe.rank(b));
    cols.push(stack);
    stack.forEach((id) => placed.add(id));
  }
  return cols;
}

export default function Leads() {
  const { state, reload } = useAppState();
  const layout = useLayout();
  const pipe = usePipeline();
  const [view, setView] = useState<"pipeline" | "table">("pipeline");
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<StageId | null>(null);
  const [tag, setTag] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [newStage, setNewStage] = useState("");
  const [swatch, setSwatch] = useState(SWATCHES[0]);
  const [stageErr, setStageErr] = useState("");

  const convs = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (state?.conversations ?? []).filter((c) => (!tag || c.labels.includes(tag)) && (!needle || `${c.name} ${c.handle ?? ""}`.toLowerCase().includes(needle)));
  }, [state, tag, q]);
  const inUse = useMemo(() => new Set((state?.conversations ?? []).map((c) => c.stage)), [state]);

  if (!state) return <div className="p-8 text-mute">Loading leads…</div>;
  const fit = layout.leads.board === "fit";
  const columns = boardColumns(layout.leads, pipe, inUse);
  const flat = columns.flatMap((g) => g.map((id, i) => ({ id, stacked: i > 0 })));
  const hiddenStages = pipe.stages.filter((s) => layout.leads.hiddenCols.includes(s.id));

  // The editor works on a flat list: each stage either starts a column or stacks under the one before it.
  const saveFlat = (list: { id: StageId; stacked: boolean }[], hiddenCols = layout.leads.hiddenCols) => {
    const cols: StageId[][] = [];
    for (const x of list) {
      if (x.stacked && cols.length) cols[cols.length - 1].push(x.id);
      else cols.push([x.id]);
    }
    setLayout((l) => ({ ...l, leads: { ...l.leads, columns: cols, hiddenCols } }));
  };
  const shift = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= flat.length) return;
    const next = [...flat];
    [next[i], next[j]] = [next[j], next[i]];
    saveFlat(next);
  };

  const canEditStages = hasArea(state.me, "pipeline");
  const savePipeline = async (stages: typeof pipe.stages) => {
    setStageErr("");
    try { await api("/api/workspace", "PUT", { pipeline: { stages, tags: pipe.tags } }); await reload(); return true; } catch (e) { setStageErr((e as Error).message); return false; }
  };
  const addStage = async () => {
    const name = newStage.trim().slice(0, 40);
    if (!name) return;
    // New stages go in before the closing ones (Won, Lost and so on), where a working stage belongs.
    const at = pipe.stages.findIndex((x) => x.group === "converted" || x.group === "closed");
    const fresh = { id: "c_" + Date.now().toString(36), name, color: swatch, group: "qualified" as const };
    const stages = at < 0 ? [...pipe.stages, fresh] : [...pipe.stages.slice(0, at), fresh, ...pipe.stages.slice(at)];
    if (await savePipeline(stages)) { setNewStage(""); setSwatch(SWATCHES[(SWATCHES.indexOf(swatch) + 1) % SWATCHES.length]); }
  };
  const removeStage = async (id: StageId) => {
    const def = pipe.stage(id);
    if (!window.confirm(def.system ? `Remove "${def.name}" from every screen? It is a built in stage, so it is hidden rather than deleted and can be brought back in Stages and tags.` : `Delete the stage "${def.name}"?`)) return;
    await savePipeline(def.system ? pipe.stages.map((x) => (x.id === id ? { ...x, hidden: true } : x)) : pipe.stages.filter((x) => x.id !== id));
  };
  const applyView = (v: { columns: StageId[][] | null; hiddenCols: StageId[]; tag: string }) => {
    setLayout((l) => ({ ...l, leads: { ...l.leads, columns: v.columns, hiddenCols: v.hiddenCols } }));
    setTag(v.tag);
    setViewsOpen(false);
  };
  const saveView = () => {
    const name = window.prompt("Name this view")?.trim().slice(0, 30);
    if (!name) return;
    const v: BoardView = { name, columns: layout.leads.columns, hiddenCols: layout.leads.hiddenCols, tag };
    setLayout((l) => ({ ...l, leads: { ...l.leads, views: [...l.leads.views.filter((x) => x.name !== name), v] } }));
  };

  const moveLead = async (id: string, stage: StageId) => {
    const c = convs.find((x) => x.id === id);
    if (!c || c.stage === stage) return;
    const def = pipe.stage(stage);
    const reason = def.needsReason ? window.prompt(`Reason for moving ${c.name} to ${def.name}?`) ?? undefined : undefined;
    if (def.needsReason && !reason) return;
    await api(`/api/conversations/${id}`, "PATCH", { stage, reason });
    reload();
  };

  const column = (id: StageId) => {
    const s = pipe.stage(id);
    const items = convs.filter((c) => c.stage === id);
    return (
      <div
        key={id}
        onDragOver={(e) => { e.preventDefault(); setOver(id); }}
        onDragLeave={() => setOver((o) => (o === id ? null : o))}
        onDrop={() => { if (drag) moveLead(drag, id); setDrag(null); setOver(null); }}
        className={`rounded-[12px] flex flex-col min-h-0 min-w-0 border ${fit ? "flex-1 basis-0" : "w-[240px] shrink-0 h-full"} ${over === id ? "border-ink bg-surface" : "border-transparent bg-surface2"}`}
        aria-label={`${s.name}, ${items.length} leads`}
      >
        <div className={`px-2.5 py-2 flex items-center gap-1.5 ${fit ? "min-h-[44px]" : ""}`}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
          <span className={`font-semibold flex-1 min-w-0 ${fit ? "text-[12px] leading-tight [overflow-wrap:anywhere]" : "text-[12.5px] truncate"}`} title={s.name}>{s.name}</span>
          <span className="text-[12px] text-mute tabular-nums">{items.length}</span>
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto scroll px-1.5 pb-1.5 ${fit ? "space-y-1" : "space-y-2"}`}>
          {items.map((c) => (fit ? <CompactCard key={c.id} c={c} onDrag={setDrag} onOpen={setOpen} active={open === c.id} /> : <FullCard key={c.id} c={c} onDrag={setDrag} onOpen={setOpen} active={open === c.id} />))}
        </div>
      </div>
    );
  };

  return (
    <div className={`d-page h-full flex flex-col p-4 ${open ? "min-[1100px]:!pr-[388px]" : ""}`}>
      <PageHeader title="Leads centre" sub={`${convs.length} leads. Click a lead to open their details and message them here. Drag a card to move it.`}>
        <input className="field !py-1.5 !w-[170px] text-[13px]" placeholder="Search leads" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search leads" />
        <select className="field !py-1.5 !w-[150px] text-[13px]" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag">
          <option value="">All tags</option>
          {pipe.groups.map((g) => <optgroup key={g.group} label={g.group}>{g.labels.map((l) => <option key={l}>{l}</option>)}</optgroup>)}
        </select>
        {view === "pipeline" && (
          <div className="relative">
            <Button variant={viewsOpen ? "primary" : "secondary"} aria-expanded={viewsOpen} onClick={() => { setViewsOpen((v) => !v); setEditing(false); }}><Icon d={ICONS.filter} size={14} />Views</Button>
            {viewsOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setViewsOpen(false)} />
                <div role="dialog" aria-label="Board views" className="pop absolute right-0 top-10 z-40 w-[280px] p-3 text-[13px]">
                  <p className="text-[12px] text-mute leading-snug mb-2">A view is a set of columns plus a tag filter. Pick one, or arrange the board and save your own.</p>
                  {PRESET_VIEWS.map((v) => (
                    <button key={v.name} onClick={() => applyView({ columns: null, hiddenCols: v.hide, tag: "" })} className="w-full text-left rounded-[8px] px-2 py-1.5 hover:bg-surface2">
                      <div className="font-medium">{v.name}</div>
                      <div className="text-[11.5px] text-mute">{v.hint}</div>
                    </button>
                  ))}
                  {layout.leads.views.length > 0 && <div className="label mt-2 mb-1">Saved by you</div>}
                  {layout.leads.views.map((v) => (
                    <div key={v.name} className="flex items-center rounded-[8px] hover:bg-surface2">
                      <button onClick={() => applyView(v)} className="flex-1 min-w-0 text-left px-2 py-1.5 font-medium truncate">{v.name}{v.tag ? <span className="text-mute font-normal"> · {v.tag}</span> : null}</button>
                      <button aria-label={`Delete view ${v.name}`} className="px-2 text-mute hover:text-ink" onClick={() => setLayout((l) => ({ ...l, leads: { ...l.leads, views: l.leads.views.filter((x) => x.name !== v.name) } }))}>×</button>
                    </div>
                  ))}
                  <button onClick={saveView} className="mt-2 w-full rounded-[10px] border border-dashed border-linestrong py-1.5 font-medium hover:border-ink">Save current board as a view</button>
                </div>
              </>
            )}
          </div>
        )}
        {view === "pipeline" && (
          <div className="relative">
            <Button variant={editing ? "primary" : "secondary"} aria-expanded={editing} onClick={() => { setEditing((v) => !v); setViewsOpen(false); }}><Icon d={ICONS.columns} size={14} />Stages</Button>
            {editing && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setEditing(false)} />
                <div role="dialog" aria-label="Board columns" className="pop absolute right-0 top-10 z-40 w-[360px] max-h-[74vh] overflow-y-auto scroll p-3 text-[13px]">
                  <p className="text-[12px] text-mute leading-snug mb-2">Order the columns, stack a stage under the one before it, or take it off this board with the eye. The bin removes a stage everywhere.</p>
                  {flat.map((x, i) => (
                    <div key={x.id} className={`flex items-center gap-1 py-1 ${x.stacked ? "pl-5" : ""}`}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: pipe.stage(x.id).color }} />
                      <span className="flex-1 truncate">{pipe.stage(x.id).name}</span>
                      <button disabled={i === 0} aria-pressed={x.stacked} aria-label={`Stack ${pipe.stage(x.id).name} under the previous column`} title="Stack under the column before" className={`px-1.5 h-6 rounded-md text-[11px] font-medium border disabled:opacity-25 ${x.stacked ? "bg-ink text-onbrand border-transparent" : "border-line hover:border-ink"}`} onClick={() => saveFlat(flat.map((y, k) => (k === i ? { ...y, stacked: !y.stacked } : y)))}>Stack</button>
                      <button aria-label={`Move ${pipe.stage(x.id).name} earlier`} disabled={i === 0} className="p-0.5 rounded hover:bg-surface2 disabled:opacity-25" onClick={() => shift(i, -1)}><Icon d={ICONS.chevUp} size={14} /></button>
                      <button aria-label={`Move ${pipe.stage(x.id).name} later`} disabled={i === flat.length - 1} className="p-0.5 rounded hover:bg-surface2 disabled:opacity-25" onClick={() => shift(i, 1)}><Icon d={ICONS.chevDown} size={14} /></button>
                      <button aria-label={`Hide ${pipe.stage(x.id).name} column`} className="p-0.5 rounded text-mute hover:text-ink" onClick={() => saveFlat(flat.filter((y) => y.id !== x.id), [...layout.leads.hiddenCols, x.id])}><Icon d={ICONS.eyeOff} size={14} /></button>
                      {canEditStages && <button aria-label={`Remove stage ${pipe.stage(x.id).name}`} title={inUse.has(x.id) ? "Move the leads out of this stage first" : "Remove this stage everywhere"} disabled={inUse.has(x.id)} className="p-0.5 rounded text-mute hover:text-err disabled:opacity-25" onClick={() => removeStage(x.id)}><Icon d={ICONS.trash} size={14} /></button>}
                    </div>
                  ))}
                  {hiddenStages.length > 0 && (
                    <>
                      <div className="label mt-3 mb-1">Off the board</div>
                      {hiddenStages.map((s) => (
                        <div key={s.id} className="flex items-center gap-1.5 py-1 text-mute">
                          <span className="flex-1 truncate">{s.name}</span>
                          <button aria-label={`Show ${s.name} column`} className="px-2 h-6 rounded-md text-[11px] font-medium border border-line text-ink hover:border-ink" onClick={() => saveFlat([...flat, { id: s.id, stacked: false }], layout.leads.hiddenCols.filter((id) => id !== s.id))}>Show</button>
                        </div>
                      ))}
                    </>
                  )}
                  {canEditStages && (
                    <>
                      <div className="label mt-3 mb-1.5">Add a stage</div>
                      <div className="flex gap-1.5">
                        <input className="field !py-1.5 text-[13px]" placeholder="Stage name, for example Proposal sent" value={newStage} maxLength={40} onChange={(e) => setNewStage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addStage(); }} aria-label="New stage name" />
                        <Button variant="primary" disabled={!newStage.trim()} onClick={addStage}>Add</Button>
                      </div>
                      <div className="flex gap-1.5 mt-1.5" role="radiogroup" aria-label="Stage colour">
                        {SWATCHES.map((col) => <button key={col} role="radio" aria-checked={swatch === col} aria-label={`Colour ${col}`} onClick={() => setSwatch(col)} className={`w-5 h-5 rounded-full border-2 ${swatch === col ? "border-ink" : "border-transparent"}`} style={{ background: col }} />)}
                      </div>
                      {stageErr && <p className="text-[12px] text-err mt-1.5">{stageErr}</p>}
                      <p className="text-[11.5px] text-mute mt-1.5 leading-snug">Rename, recolour, reorder and set Meta events for any stage in <a href="/pipeline" className="underline">Stages and tags</a>.</p>
                    </>
                  )}
                  <button className="mt-3 w-full rounded-[10px] border border-linestrong py-1.5 font-medium hover:border-ink" onClick={() => setLayout((l) => ({ ...l, leads: { ...l.leads, columns: null, hiddenCols: [] } }))}>Reset columns</button>
                </div>
              </>
            )}
          </div>
        )}
        {view === "pipeline" && <Segmented label="Board width" value={layout.leads.board} options={[["fit", "Fit screen"], ["wide", "Wide"]]} onChange={(v) => setLayout((l) => ({ ...l, leads: { ...l.leads, board: v } }))} />}
        <Segmented label="View" value={view} options={[["pipeline", "Pipeline"], ["table", "Table"]]} onChange={setView} />
      </PageHeader>

      {view === "pipeline" && fit && (
        <div className="flex-1 min-h-0 flex gap-2">
          {columns.map((group) => (
            <div key={group[0]} className="flex-1 basis-0 min-w-0 flex flex-col gap-2">{group.map(column)}</div>
          ))}
        </div>
      )}
      {view === "pipeline" && !fit && (
        <div className="flex-1 min-h-0 overflow-x-auto scroll">
          <div className="flex gap-3 h-full pb-2" style={{ width: columns.flat().length * 252 }}>{columns.flat().map(column)}</div>
        </div>
      )}
      {view === "table" && (
        <div className="card flex-1 min-h-0 overflow-auto scroll">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-surface text-left">
              <tr className="border-b border-line">
                {["Lead", "Stage", "Tags", "Source", "Goal", "Email", "AI", "Messages", "Last activity"].map((h) => <th key={h} className="px-3 py-2.5 label whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {convs.map((c) => (
                <tr key={c.id} className="border-b border-line hover:bg-canvas">
                  <td className="px-3 py-2"><button onClick={() => setOpen(c.id)} className="flex items-center gap-2 font-medium hover:underline text-left"><Avatar name={c.name} platform={c.platform} size={26} src={avatarSrc(c)} />{c.name}</button></td>
                  <td className="px-3 py-2"><StageBadge stage={c.stage} small /></td>
                  <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{c.labels.map((l) => <LabelChip key={l} label={l} />)}</div></td>
                  <td className="px-3 py-2 whitespace-nowrap">{c.origin}</td>
                  <td className="px-3 py-2 max-w-[220px] truncate">{c.lead.goal ?? ""}</td>
                  <td className="px-3 py-2">{c.lead.email ?? ""}</td>
                  <td className="px-3 py-2 capitalize">{c.aiMode}</td>
                  <td className="px-3 py-2 tabular-nums">{c.messageCount}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-mute">{timeAgo(c.lastMessageAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <LeadPopup id={open} ws={state.workspace} canSuggest onClose={() => setOpen(null)} onChange={reload} />}
    </div>
  );
}

interface CardProps { c: ConvView; onDrag: (id: string) => void; onOpen: (id: string) => void; active: boolean }

function CompactCard({ c, onDrag, onOpen, active }: CardProps) {
  const flag = c.labels.includes("Needs human") ? "bg-err" : c.unread ? "bg-ink" : "";
  return (
    <button onClick={() => onOpen(c.id)} draggable onDragStart={() => onDrag(c.id)} aria-pressed={active} title={`${c.name} · ${c.origin}${c.lead.goal ? ` · ${c.lead.goal}` : ""}${c.labels.length ? ` · ${c.labels.join(", ")}` : ""}`} className={`d-row block w-full text-left rounded-[8px] bg-surface border hover:border-ink px-2 py-1.5 cursor-pointer ${active ? "border-ink" : "border-line"}`}>
      <div className="flex items-center gap-1.5">
        <span data-name className="text-[12px] font-medium truncate flex-1">{c.name}</span>
        {flag && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${flag}`} />}
      </div>
      <div className="d-extra text-[10.5px] text-mute truncate">{timeAgo(c.lastMessageAt)} · {c.origin}</div>
    </button>
  );
}

function FullCard({ c, onDrag, onOpen, active }: CardProps) {
  return (
    <button onClick={() => onOpen(c.id)} draggable onDragStart={() => onDrag(c.id)} aria-pressed={active} className={`block w-full text-left card !rounded-[12px] p-2.5 hover:border-ink cursor-pointer ${active ? "!border-ink" : ""}`}>
      <div className="flex items-center gap-2">
        <Avatar name={c.name} platform={c.platform} size={28} src={avatarSrc(c)} />
        <div className="min-w-0">
          <div data-name className="font-medium text-[13px] truncate">{c.name}</div>
          <div className="text-[11px] text-mute">{timeAgo(c.lastMessageAt)} ago · {c.origin}</div>
        </div>
      </div>
      {c.lead.goal && <div className="text-[12px] text-mute mt-1.5 line-clamp-2">{c.lead.goal}</div>}
      <div className="flex flex-wrap gap-1 mt-1.5">{c.labels.slice(0, 3).map((l) => <LabelChip key={l} label={l} />)}</div>
    </button>
  );
}
