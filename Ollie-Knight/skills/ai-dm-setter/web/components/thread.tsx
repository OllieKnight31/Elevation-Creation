"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FunnelEvent, Message, Shortcut, StageId } from "@/lib/types";
import { bubblesOf, expand, formFields, notesIn, type FillContext, type FormField } from "@/lib/shortcuts";
import { api, Avatar, Button, every, LabelChip, onDataChange, timeAgo, usePipeline, type ConvView, type PublicWorkspace } from "./ui";
import { Icon, ICONS } from "./layout";

// The pieces of a conversation that more than one screen shows: the inbox, and the lead pop up in the leads centre.

export type Detail = { conversation: ConvView; messages: Message[]; events: FunnelEvent[] };

/** Whether Meta will accept a message typed by a person on this thread right now. */
export function reach(c: ConvView): { ok: boolean; text: string } {
  if (c.labels.includes("Do not contact")) return { ok: false, text: "Tagged Do not contact" };
  if (c.labels.includes("Close friend") && c.window.open) return { ok: true, text: "Close friend: only you message them. The AI and automations never will" };
  if (c.externalId.startsWith("demo_")) return { ok: true, text: "Demo thread, nothing is sent to Meta" };
  if (c.sendVia === "helper") return { ok: true, text: c.helperReady ? "Sends from your Chrome through the helper, free" : "Sends when the helper is on in Chrome" };
  if (c.window.open) return { ok: true, text: "Inside the 24 hour window" };
  if (c.sendVia === "meta") return { ok: true, text: "Window closed. Goes out as your own reply, allowed up to 7 days" };
  return { ok: false, text: c.platform === "instagram" && c.handle
    ? "Over 24 hours since their last message. Meta only lets apps reply within 24 hours, so reply in Instagram or switch on the Chrome helper"
    : "Over 24 hours since their last message. Meta only lets apps reply within 24 hours" };
}

/** The Instagram chat with this lead, for replying there when the app cannot. */
export const instagramChatUrl = (c: ConvView) => (c.platform === "instagram" && c.handle ? `https://ig.me/m/${encodeURIComponent(c.handle)}` : "");

export function fillFor(c: ConvView, ws: PublicWorkspace, stageName: string): FillContext {
  return { name: c.name, handle: c.handle, lead: c.lead, stage: stageName, myName: ws.intake.ownerName, business: ws.intake.businessName, goals: ws.intake.goals, shortcuts: ws.shortcuts };
}

export type ThreadData = ReturnType<typeof useThread>;

/** Loads one conversation and keeps it fresh. Shared by every panel showing that conversation. */
export function useThread(id: string | null, onChange: () => void) {
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  // A slow reply for the previous conversation must not overwrite the one now open.
  const latest = useRef(id);
  useEffect(() => { latest.current = id; }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const x = await api<Detail>(`/api/conversations/${id}`);
      if (latest.current === id) setD(x);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    setD(null); setErr("");
    load();
    const stop = every(load, 30000);
    const off = onDataChange(load);
    return () => { stop(); off(); };
  }, [load]);

  const unread = d?.conversation.unread;
  useEffect(() => {
    if (unread && id) api(`/api/conversations/${id}`, "PATCH", { unread: false }).then(onChange).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, id]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setErr("");
    try { await fn(); await load(); onChange(); return true; } catch (e) { setErr((e as Error).message); return false; } finally { setBusy(""); }
  };
  const patch = (body: Record<string, unknown>) => run("save", () => api(`/api/conversations/${id}`, "PATCH", body));
  const current = d && d.conversation.id === id ? d : null;
  return { id, d: current, busy, err, run, patch };
}

/** The thread. who is the lead, whose picture sits beside the first of each run of their messages. */
export function Messages({ messages, compact, who }: { messages: Message[]; compact?: boolean; who?: { name: string; src?: string } }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length]);
  // Like Instagram: "Seen" under the last message sent, when the lead has opened it and not replied since.
  const lastOut = messages.length && messages[messages.length - 1].direction === "out" ? messages.length - 1 : -1;
  return (
    <>
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const gap = !prev || new Date(m.sentAt).getTime() - new Date(prev.sentAt).getTime() > 36e5;
        const out = m.direction === "out";
        const face = !out && who && (gap || prev?.direction !== "in");
        return (
          <div key={m.id}>
            {gap && <div className="text-center label my-3">{new Date(m.sentAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>}
            <div className={`flex mb-1 items-end gap-2 ${out ? "justify-end" : "justify-start"}`}>
              {!out && who && (face ? <Avatar name={who.name} src={who.src} size={compact ? 22 : 28} /> : <span className="shrink-0" style={{ width: compact ? 22 : 28 }} />)}
              <div className={`${compact ? "max-w-[82%] text-[13px] px-3 py-1.5" : "max-w-[70%] text-[14px] px-3.5 py-2"} rounded-2xl leading-snug whitespace-pre-wrap break-words ${out ? "bg-ink text-onbrand" : "bg-surface border border-line text-ink"}`}>
                {m.text}
                {(m.sender === "ai" || m.sender === "auto") && <span className="ml-2 align-middle text-[9px] font-semibold border border-current/40 rounded px-1 py-0.5 opacity-70">{m.sender === "ai" ? "AI" : "AUTO"}</span>}
              </div>
            </div>
            {i === lastOut && m.seenAt && !m.delivery && (
              <div className="text-[11px] mb-1.5 text-right text-mute">{(() => { const t = timeAgo(m.seenAt); return t === "now" ? "Seen just now" : /^\d+[mhd]$/.test(t) ? `Seen ${t} ago` : `Seen ${t}`; })()}</div>
            )}
            {m.delivery && (
              <div className={`text-[11px] mb-1.5 text-right ${m.delivery === "failed" ? "text-err" : "text-mute"}`}>
                {m.delivery === "queued" ? "Waiting for the helper to send it from Chrome" : `Not sent. ${m.deliveryNote ?? ""}`}
              </div>
            )}
          </div>
        );
      })}
      <div ref={end} />
    </>
  );
}

/**
 * The reply box. Typing a shortcut trigger (for example /open) lists matches; Enter or Tab drops it in with the
 * lead's details filled. Typing the whole trigger and a space expands it straight away.
 */
export function Composer({ c, ws, value, onChange, onSend, busy, disabled, sendLabel = "Send", rows = 2, extra, compact }: {
  c: ConvView; ws: PublicWorkspace; value: string; onChange: (v: string) => void; onSend: (bubbles: string[]) => void;
  busy?: boolean; disabled?: boolean; sendLabel?: string; rows?: number; extra?: React.ReactNode; compact?: boolean;
}) {
  const pipe = usePipeline();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<{ token: string; start: number } | null>(null);
  const [browse, setBrowse] = useState(false);
  const [pick, setPick] = useState(0);
  const [form, setForm] = useState<{ sc: Shortcut; start: number; end: number; fields: FormField[]; answers: Record<string, string> } | null>(null);
  const [warn, setWarn] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const ctx = useMemo(() => fillFor(c, ws, pipe.stage(c.stage).name), [c, ws, pipe]);
  const all = ws.shortcuts ?? [];

  const matches = useMemo(() => {
    if (!menu && !browse) return [];
    const t = (menu?.token ?? "").toLowerCase();
    const bare = t.replace(/^[\/.;!]/, "");
    return all.filter((s) => !t || s.trigger.startsWith(t) || (bare && (s.name.toLowerCase().includes(bare) || s.category.toLowerCase().includes(bare)))).slice(0, 40);
  }, [menu, browse, all]);
  useEffect(() => { setPick(0); }, [menu?.token, browse]);

  const place = (sc: Shortcut, start: number, end: number, answers: Record<string, string> = {}) => {
    const r = expand(sc.text, ctx, answers);
    const next = value.slice(0, start) + r.text + value.slice(end);
    onChange(next);
    setWarn(r.missing);
    setNotes(notesIn(sc.text, all));
    setMenu(null); setBrowse(false); setForm(null);
    const caret = start + (r.cursor ?? r.text.length);
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(caret, caret); });
  };
  const insert = (sc: Shortcut, start: number, end: number) => {
    const fields = formFields(sc.text, all);
    if (fields.length) { setMenu(null); setBrowse(false); setForm({ sc, start, end, fields, answers: Object.fromEntries(fields.map((f) => [f.name, f.fallback])) }); }
    else place(sc, start, end);
  };
  const choose = (sc: Shortcut) => {
    const caret = ref.current?.selectionStart ?? value.length;
    if (menu) insert(sc, menu.start, caret);
    else insert(sc, caret, caret);
  };

  const onType = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    const caret = e.target.selectionStart ?? v.length;
    onChange(v);
    if (warn.length) setWarn([]);
    // Whole trigger followed by a space: expand without asking.
    const done = v.slice(0, caret).match(/(^|\s)([\/.;!][a-z0-9._-]+) $/i);
    if (done) {
      const sc = all.find((s) => s.trigger === done[2].toLowerCase());
      if (sc) {
        const start = caret - done[2].length - 1;
        const fields = formFields(sc.text, all);
        if (fields.length) { setMenu(null); setForm({ sc, start, end: caret, fields, answers: Object.fromEntries(fields.map((f) => [f.name, f.fallback])) }); }
        else {
          const r = expand(sc.text, ctx);
          onChange(v.slice(0, start) + r.text + v.slice(caret));
          setWarn(r.missing); setNotes(notesIn(sc.text, all)); setMenu(null);
          const at = start + (r.cursor ?? r.text.length);
          requestAnimationFrame(() => ref.current?.setSelectionRange(at, at));
        }
        return;
      }
    }
    const m = v.slice(0, caret).match(/(^|\s)([\/.;!][a-z0-9._-]*)$/i);
    setMenu(m && all.length ? { token: m[2], start: caret - m[2].length } : null);
  };

  const send = () => { const b = bubblesOf(value); if (b.length && !disabled && !busy) { onSend(b); setNotes([]); setWarn([]); } };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((menu || browse) && matches.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setPick((p) => (p + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setPick((p) => (p - 1 + matches.length) % matches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(matches[pick]); return; }
    }
    if (e.key === "Escape" && (menu || browse)) { e.stopPropagation(); setMenu(null); setBrowse(false); return; }
    // Enter sends, Shift and Enter starts a new line. Typing in another alphabet uses Enter to pick a word, so that is left alone.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };
  const parts = bubblesOf(value).length;
  const preview = form ? expand(form.sc.text, ctx, form.answers).text : "";

  return (
    <div className="relative">
      {(menu || browse) && (
        <div role="listbox" aria-label="Shortcuts" className="pop absolute bottom-full left-0 right-0 mb-1.5 z-30 max-h-[260px] overflow-y-auto scroll p-1.5">
          {matches.length === 0 && <p className="px-2 py-2 text-[12.5px] text-mute">No shortcut matches{menu ? ` ${menu.token}` : ""}. Add shortcuts in Settings, Shortcuts.</p>}
          {matches.map((s, i) => (
            <button key={s.id} role="option" aria-selected={i === pick} onMouseEnter={() => setPick(i)} onMouseDown={(e) => { e.preventDefault(); choose(s); }} className={`w-full text-left rounded-[8px] px-2 py-1.5 flex items-baseline gap-2 ${i === pick ? "bg-surface2" : ""}`}>
              <code className="text-[12px] font-semibold shrink-0">{s.trigger}</code>
              <span className="text-[12.5px] font-medium shrink-0">{s.name}</span>
              <span className="text-[12px] text-mute truncate flex-1">{expand(s.text, ctx).text.replace(/\n-{3,}\n/g, " / ").replace(/\s+/g, " ")}</span>
              <span className="label shrink-0">{s.category}</span>
            </button>
          ))}
        </div>
      )}
      {form && (
        <div role="dialog" aria-label={`Fill in ${form.sc.trigger}`} className="pop absolute bottom-full left-0 right-0 mb-1.5 z-30 p-3">
          <div className="flex items-center gap-2 mb-2"><code className="text-[12px] font-semibold">{form.sc.trigger}</code><span className="text-[13px] font-medium flex-1">{form.sc.name}</span></div>
          {form.fields.map((f, i) => (
            <label key={f.name} className="block mb-2 text-[12.5px]">
              <span className="text-mute">{f.name}</span>
              {f.kind === "menu"
                ? <select autoFocus={i === 0} className="field !py-1.5 mt-0.5" value={form.answers[f.name]} onChange={(e) => setForm({ ...form, answers: { ...form.answers, [f.name]: e.target.value } })}>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                : <input autoFocus={i === 0} className="field !py-1.5 mt-0.5" value={form.answers[f.name]} onChange={(e) => setForm({ ...form, answers: { ...form.answers, [f.name]: e.target.value } })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); place(form.sc, form.start, form.end, form.answers); } if (e.key === "Escape") setForm(null); }} />}
            </label>
          ))}
          <div className="rounded-[8px] bg-canvas px-2.5 py-2 text-[12.5px] whitespace-pre-wrap max-h-[110px] overflow-y-auto scroll">{preview}</div>
          <div className="flex gap-2 mt-2">
            <Button variant="primary" onClick={() => place(form.sc, form.start, form.end, form.answers)}>Insert</Button>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {notes.map((n) => <p key={n} className="text-[12px] text-ink2 bg-surface2 rounded-[8px] px-2.5 py-1.5 mb-1.5">Note: {n}</p>)}
      {warn.length > 0 && <p className="text-[12px] tone-warn rounded-[8px] px-2.5 py-1.5 mb-1.5">Could not fill in: {warn.join(", ")}. Check the message before sending.</p>}
      <div className="flex gap-2 items-end">
        <div className="flex-1 min-w-0">
          <textarea ref={ref} className={`field ${compact ? "text-[13px]" : ""}`} rows={rows} placeholder="Write a reply. Enter sends, / for shortcuts" title="Enter sends. Shift and Enter starts a new line." value={value} onChange={onType} onKeyDown={onKey} onBlur={() => setTimeout(() => setMenu(null), 150)} aria-label="Reply" />
          {parts > 1 && <div className="text-[11px] text-mute mt-0.5">Sends as {parts} separate messages</div>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Button variant="primary" disabled={!value.trim() || busy || disabled} onClick={send}>{busy ? "Sending…" : sendLabel}</Button>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => { setMenu(null); setBrowse((v) => !v); ref.current?.focus(); }} aria-label="Shortcuts" aria-expanded={browse} title="Shortcuts (or type /)" className={`h-8 w-8 rounded-[10px] border flex items-center justify-center shrink-0 ${browse ? "bg-ink text-onbrand border-transparent" : "border-linestrong text-ink2 hover:border-ink hover:text-ink"}`}><Icon d={ICONS.bolt} size={14} /></button>
            {extra}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Tick as many tags as you like. The panel stays open, and each change is saved in order. */
export function TagPicker({ labels, patch }: { labels: string[]; patch: (body: Record<string, unknown>) => Promise<boolean> }) {
  const pipe = usePipeline();
  const [sel, setSel] = useState(labels);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const pending = useRef(0);
  const latest = useRef(labels);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  // Follow changes made elsewhere (the AI, another tab) unless our own saves are still on their way.
  const incoming = labels.join("|");
  useEffect(() => { if (!pending.current) { latest.current = labels; setSel(labels); } }, [incoming]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (next: string[]) => {
    latest.current = next;
    setSel(next);
    pending.current++;
    chain.current = chain.current.then(() => patch({ labels: next })).finally(() => { pending.current--; });
  };
  // Read from the ref so two clicks landing before the next paint both count.
  const toggle = (l: string) => save(latest.current.includes(l) ? latest.current.filter((x) => x !== l) : [...latest.current, l]);

  const needle = q.trim().toLowerCase();
  const groups = pipe.groups.map((g) => ({ ...g, labels: g.labels.filter((l) => !needle || l.toLowerCase().includes(needle)) })).filter((g) => g.labels.length);
  const fresh = q.trim().slice(0, 30);
  const canCreate = Boolean(fresh) && !pipe.allTags.some((t) => t.toLowerCase() === fresh.toLowerCase());
  const create = async () => {
    setErr("");
    try {
      await api("/api/workspace", "PUT", { pipeline: { stages: pipe.stages, tags: [...pipe.tags, { name: fresh, group: "My tags" }] } });
      save([...latest.current, fresh]);
      setQ("");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-1.5" aria-label="Tags on this conversation">
        {sel.length === 0 && <span className="text-mute text-[13px]">No tags yet</span>}
        {sel.map((l) => <LabelChip key={l} label={l} onRemove={() => toggle(l)} />)}
      </div>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`mt-2 w-full h-8 rounded-[10px] border flex items-center justify-center gap-1.5 text-[13px] font-medium ${open ? "bg-ink text-onbrand border-transparent" : "border-linestrong hover:border-ink"}`}>
        <Icon d={open ? ICONS.check : ICONS.plus} size={14} />
        {open ? "Done" : "Add tags"}
      </button>
      {open && (
        <div className="mt-2 rounded-[12px] border border-linestrong p-2.5" aria-label="Choose tags">
          <input className="field !py-1.5 text-[13px]" autoFocus placeholder="Search or type a new tag" value={q} maxLength={30} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && canCreate) create(); if (e.key === "Escape") setOpen(false); }} aria-label="Search tags" />
          {err && <p className="text-[12px] text-err mt-1.5">{err}</p>}
          {canCreate && (
            <button onClick={create} className="mt-2 w-full text-left rounded-[8px] border border-dashed border-linestrong hover:border-ink px-2 py-1.5 text-[12.5px] font-medium">Create tag &ldquo;{fresh}&rdquo; and add it</button>
          )}
          {groups.map((g) => (
            <div key={g.group} className="mt-2">
              <div className="text-[11.5px] text-mute mb-1">{g.group}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.labels.map((l) => {
                  const on = sel.includes(l);
                  return (
                    <button key={l} role="checkbox" aria-checked={on} onClick={() => toggle(l)} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium border ${on ? "bg-ink text-onbrand border-transparent" : "border-linestrong text-ink hover:border-ink"}`}>
                      {on && <Icon d={ICONS.check} size={11} />}
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {groups.length === 0 && !canCreate && <p className="text-[12.5px] text-mute mt-2">No tag matches.</p>}
        </div>
      )}
    </>
  );
}

/** Every stage as one grid, so the lead can be moved with a single click and no scrolling. */
export function StagePicker({ c, patch }: { c: ConvView; patch: (body: Record<string, unknown>) => Promise<boolean> }) {
  const pipe = usePipeline();
  const pickStage = (s: StageId) => {
    if (s === c.stage) return;
    const def = pipe.stage(s);
    const reason = def.needsReason ? window.prompt(`Reason for moving to ${def.name}?`) ?? undefined : undefined;
    if (def.needsReason && !reason) return;
    patch({ stage: s, reason });
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Lead stage">
        {pipe.stages.filter((s) => !s.hidden || s.id === c.stage).map((s) => {
          const on = s.id === c.stage;
          return (
            <button key={s.id} role="radio" aria-checked={on} onClick={() => pickStage(s.id)} className={`flex items-center gap-1.5 rounded-[8px] px-1.5 h-7 text-[11.5px] font-medium text-left border ${on ? "bg-ink text-onbrand border-transparent" : "border-line text-ink2 hover:border-ink hover:text-ink"}`}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="truncate">{s.name}</span>
            </button>
          );
        })}
      </div>
      {c.lossReason && pipe.stage(c.stage).needsReason && <p className="text-[12px] text-mute mt-2">Reason: {c.lossReason}</p>}
    </>
  );
}

/** The brief of the conversation so far, with the next step, so anyone stepping in is up to speed. */
export function SummaryCard({ t }: { t: ThreadData }) {
  const c = t.d!.conversation;
  const s = c.summary;
  const refresh = () => t.run("summary", () => api(`/api/conversations/${c.id}/summary`, "POST"));
  return (
    <div aria-label="Conversation summary">
      {s ? (
        <>
          <p className="text-[13px] leading-snug">{s.text}</p>
          <div className="mt-2 rounded-[10px] bg-surface2 px-2.5 py-2">
            <div className="label mb-0.5">Next step</div>
            <p className="text-[13px] leading-snug font-medium">{s.nextStep}</p>
          </div>
        </>
      ) : <p className="text-[13px] text-mute">No summary yet.</p>}
      <div className="flex items-center gap-2 mt-2 text-[11px] text-mute">
        <span className="flex-1">{s ? `${s.engine === "claude" ? "Written by AI" : "Built from the lead details"} · ${timeAgo(s.updatedAt)}${c.summaryStale ? " · new messages since" : ""}` : ""}</span>
        <button onClick={refresh} disabled={t.busy === "summary"} className="inline-flex items-center gap-1 font-medium text-ink2 hover:text-ink disabled:opacity-50"><Icon d={ICONS.refresh} size={12} />{t.busy === "summary" ? "Writing…" : "Refresh"}</button>
      </div>
    </div>
  );
}

const FACTS: [string, "situation" | "goal" | "pain" | "objections" | "budget" | "email" | "phone"][] = [["Situation", "situation"], ["Goal", "goal"], ["Pain", "pain"], ["Objections", "objections"], ["Budget", "budget"], ["Email", "email"], ["Phone", "phone"]];

/** What is known about the lead. The AI fills these in; click any line to correct or add to it. */
export function LeadFacts({ c, patch }: { c: ConvView; patch: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [edit, setEdit] = useState<string | null>(null);
  const val = (k: (typeof FACTS)[number][1]) => (k === "objections" ? (c.lead.objections ?? []).join(", ") : c.lead[k] ?? "");
  return (
    <>
      <dl className="text-[13px] space-y-0.5">
        {FACTS.map(([label, k]) => (
          <div key={k} className="flex gap-2 items-baseline">
            <dt className="w-[76px] shrink-0 text-mute">{label}</dt>
            {edit === k ? (
              <input autoFocus className="field !py-0.5 !px-1.5 text-[13px] flex-1" defaultValue={val(k)} aria-label={label}
                onBlur={(e) => { setEdit(null); if (e.target.value.trim() !== val(k)) patch({ lead: { [k]: e.target.value } }); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEdit(null); }} />
            ) : (
              <dd className="flex-1 min-w-0"><button onClick={() => setEdit(k)} title="Click to edit" className={`text-left w-full rounded px-1 -mx-1 hover:bg-surface2 [overflow-wrap:anywhere] ${val(k) ? "" : "text-mute opacity-60"}`}>{val(k) || "Not known yet"}</button></dd>
            )}
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-mute mt-2">Filled in by the AI as the lead shares it. Click a line to edit.</p>
    </>
  );
}

export function Activity({ events, limit = 14 }: { events: FunnelEvent[]; limit?: number }) {
  const pipe = usePipeline();
  return (
    <ol className="space-y-2">
      {events.slice(0, limit).map((e) => (
        <li key={e.id} className="text-[12.5px] leading-snug">
          <div>
            {e.type === "stage_changed" && e.stage && <>Moved to <b className="font-semibold">{pipe.stage(e.stage).name}</b></>}
            {e.type === "link_sent" && <>Link sent{e.detail ? `: ${e.detail}` : ""}</>}
            {e.type === "label_added" && <>Tag added: {e.detail}</>}
            {e.type === "trigger_fired" && <>Keyword reply sent: {e.detail}</>}
            {e.type === "starter_fired" && <>Conversation starter: {e.detail}</>}
            {e.type === "question_flagged" && <>AI could not answer: {e.detail}</>}
            {e.type === "times_proposed" && <>Call times offered from Calendly: {e.detail}</>}
            {e.type === "answer_learned" && <>Answer added to the knowledge base: {e.detail}</>}
            {e.type === "conversation_started" && <>Conversation started</>}
            <span className="text-mute"> · {e.by === "ai" ? "AI" : e.by === "human" ? "person" : "auto"} · {timeAgo(e.at)}</span>
          </div>
          {e.capi && e.capi.status !== "skipped" && (
            <div className={e.capi.status === "sent" ? "text-ok" : "text-err"}>Meta event {e.capi.eventName}: {e.capi.status}{e.capi.note ? ` (${e.capi.note})` : ""}</div>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Who owns the lead, the link to their profile, and whether the CRM has them. */
export function LeadMeta({ c, ws, patch }: { c: ConvView; ws: PublicWorkspace; patch: (body: Record<string, unknown>) => Promise<boolean> }) {
  const people = ws.members.filter((m) => m.active);
  const crmOn = ws.crm.enabled;
  return (
    <div className="text-[13px] space-y-1.5">
      <div className="flex gap-2 items-center">
        <span className="w-[76px] shrink-0 text-mute">Profile</span>
        {c.profileUrl
          ? <a href={c.profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-2 min-w-0"><span className="truncate">{c.platform === "instagram" ? `@${c.handle}` : c.handle}</span><Icon d={ICONS.external} size={12} /></a>
          : <span className="text-mute opacity-60">No handle on record</span>}
      </div>
      <div className="flex gap-2 items-center">
        <span className="w-[76px] shrink-0 text-mute">Channel</span>
        <span className="capitalize">{c.platform}</span><span className="text-mute">· {c.origin}</span>
      </div>
      <div className="flex gap-2 items-center">
        <span className="w-[76px] shrink-0 text-mute">Owner</span>
        <select className="field !py-0.5 !px-1.5 !w-auto text-[13px]" aria-label="Assigned to" value={c.assignedTo ?? ""} onChange={(e) => patch({ assignedTo: e.target.value || null })}>
          <option value="">{c.aiMode === "autopilot" ? "AI setter" : "Unassigned"}</option>
          {people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      {crmOn && (
        <div className="flex gap-2 items-center">
          <span className="w-[76px] shrink-0 text-mute">CRM</span>
          <span className={c.crm?.lastStatus === "failed" ? "text-err" : c.crm?.lastSyncAt ? "text-ok" : "text-mute"}>
            {c.crm?.lastStatus === "failed" ? `Failed: ${c.crm.lastError}` : c.crm?.lastSyncAt ? `Synced ${timeAgo(c.crm.lastSyncAt)} ago` : c.externalId.startsWith("demo_") ? "Demo leads are not sent" : "Not sent yet"}
          </span>
        </div>
      )}
    </div>
  );
}
