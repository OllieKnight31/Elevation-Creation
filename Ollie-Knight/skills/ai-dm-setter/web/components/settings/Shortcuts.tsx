"use client";
import { useMemo, useState } from "react";
import type { ConversionGoal, GoalType, KeywordTrigger, Shortcut } from "@/lib/types";
import { bubblesOf, expand, formFields, GOAL_TYPES, notesIn, SHORTCUT_CATEGORIES, VARIABLES } from "@/lib/shortcuts";
import { api, Banner, Button, Toggle, usePipeline } from "@/components/ui";
import { fillFor } from "@/components/thread";
import { Field, Section, type TabProps } from "./parts";

function Preview({ text, state }: { text: string; state: TabProps["state"] }) {
  const pipe = usePipeline();
  const sample = state.conversations.find((c) => c.lead.goal) ?? state.conversations[0];
  const list = state.workspace.shortcuts;
  const r = useMemo(() => {
    const ctx = sample ? fillFor(sample, state.workspace, pipe.stage(sample.stage).name) : { name: "Maya Thompson", handle: "maya", lead: {}, stage: "In conversation", myName: state.workspace.intake.ownerName, business: state.workspace.intake.businessName, goals: state.workspace.intake.goals, shortcuts: list };
    return expand(text, ctx);
  }, [text, sample, state.workspace, pipe, list]);
  const asks = formFields(text, list);
  return (
    <div>
      <div className="label mb-1">Preview{sample ? `, as sent to ${sample.name}` : ""}</div>
      <div className="rounded-[10px] bg-canvas p-2.5 space-y-1.5 min-h-[60px]">
        {bubblesOf(r.text).map((b, i) => <div key={i} className="inline-block max-w-full rounded-2xl bg-ink text-onbrand px-3 py-1.5 text-[13px] whitespace-pre-wrap break-words mr-6">{b}</div>)}
      </div>
      {asks.length > 0 && <p className="text-[12px] text-mute mt-1">Asks you for: {asks.map((a) => a.name).join(", ")}.</p>}
      {notesIn(text, list).map((n) => <p key={n} className="text-[12px] text-mute mt-1">Note shown to the setter: {n}</p>)}
      {r.missing.length > 0 && <p className="text-[12px] text-warn mt-1">Nothing to fill in for: {r.missing.join(", ")}.{r.missing.some((m) => m.startsWith("link")) ? " Add that link under Conversion links." : ""}</p>}
    </div>
  );
}

function Variables({ onPick }: { onPick: (v: string) => void }) {
  return (
    <details className="text-[12.5px]">
      <summary className="cursor-pointer font-medium">What can go in a message</summary>
      <table className="mt-2 w-full"><tbody>
        {VARIABLES.map(([v, d]) => (
          <tr key={v} className="border-t border-line align-top"><td className="py-1 pr-3 whitespace-nowrap"><button type="button" onClick={() => onPick(v.split(" ")[0].startsWith("{") && !v.includes(" on its") ? v.split(/ (?=\{)/)[0] : "\n---\n")} className="font-mono text-[11.5px] hover:underline text-left">{v}</button></td><td className="py-1 text-mute">{d}</td></tr>
        ))}
      </tbody></table>
    </details>
  );
}

export function ShortcutsTab({ state, reload, note }: TabProps) {
  const [list, setList] = useState<Shortcut[]>(state.workspace.shortcuts);
  const [sel, setSel] = useState<string | null>(state.workspace.shortcuts[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dirty = JSON.stringify(list) !== JSON.stringify(state.workspace.shortcuts);
  const cur = list.find((s) => s.id === sel) ?? null;
  const upd = (p: Partial<Shortcut>) => setList(list.map((s) => (s.id === sel ? { ...s, ...p } : s)));
  const cats = [...new Set([...SHORTCUT_CATEGORIES, ...list.map((s) => s.category)])];
  const add = () => {
    const id = "sc_" + Date.now().toString(36);
    let n = list.length + 1;
    while (list.some((s) => s.trigger === `/new${n}`)) n++;
    setList([...list, { id, trigger: `/new${n}`, name: "New shortcut", category: "Other", text: "hey {first_name}, " }]);
    setSel(id);
  };
  const save = async () => {
    setBusy(true); setErr("");
    try { await api("/api/workspace", "PUT", { shortcuts: list }); await reload(); note("Shortcuts saved. They work in every reply box.", "ok"); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <Section title="Shortcuts" sub="Saved messages for whoever is setting by hand. In any reply box type the trigger (for example /open) and the message drops in with the lead's name and details already filled."
      action={<div className="flex gap-2"><Button onClick={add}>Add shortcut</Button><Button variant="primary" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : dirty ? "Save changes" : "Saved"}</Button></div>}>
      {err && <div className="p-4 pb-0"><Banner tone="error">{err}</Banner></div>}
      <div className="grid grid-cols-[250px_1fr] min-h-[420px]">
        <div className="border-r border-line p-2 max-h-[620px] overflow-y-auto scroll">
          {cats.filter((c) => list.some((s) => s.category === c)).map((c) => (
            <div key={c} className="mb-2">
              <div className="label px-2 py-1">{c}</div>
              {list.filter((s) => s.category === c).map((s) => (
                <button key={s.id} onClick={() => setSel(s.id)} aria-pressed={sel === s.id} className={`w-full text-left rounded-[8px] px-2 py-1.5 ${sel === s.id ? "bg-surface2" : "hover:bg-canvas"}`}>
                  <code className="text-[12px] font-semibold">{s.trigger}</code>
                  <div className="text-[12.5px] text-mute truncate">{s.name}</div>
                </button>
              ))}
            </div>
          ))}
          {list.length === 0 && <p className="p-2 text-mute text-[13px]">No shortcuts yet.</p>}
        </div>
        {cur ? (
          <div className="p-4 space-y-3 min-w-0">
            <div className="grid grid-cols-[130px_1fr_150px] gap-3">
              <Field label="Trigger"><input className="field font-mono text-[13px]" value={cur.trigger} onChange={(e) => upd({ trigger: e.target.value.toLowerCase().replace(/\s/g, "") })} aria-label="Shortcut trigger" /></Field>
              <Field label="Name"><input className="field" value={cur.name} onChange={(e) => upd({ name: e.target.value })} aria-label="Shortcut name" /></Field>
              <Field label="Category"><input className="field" list="sc-cats" value={cur.category} onChange={(e) => upd({ category: e.target.value })} aria-label="Shortcut category" /><datalist id="sc-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></Field>
            </div>
            <Field label="Message"><textarea className="field font-mono text-[13px]" rows={7} value={cur.text} onChange={(e) => upd({ text: e.target.value })} aria-label="Shortcut message" /></Field>
            <Preview text={cur.text} state={state} />
            <Variables onPick={(v) => upd({ text: cur.text + v })} />
            <div className="flex gap-2 pt-1">
              <Button onClick={() => { const id = "sc_" + Date.now().toString(36); setList([...list, { ...cur, id, trigger: cur.trigger + "2", name: cur.name + " (copy)" }]); setSel(id); }}>Duplicate</Button>
              <Button variant="danger" onClick={() => { setList(list.filter((s) => s.id !== cur.id)); setSel(list.find((s) => s.id !== cur.id)?.id ?? null); }}>Delete</Button>
            </div>
          </div>
        ) : <p className="p-6 text-mute">Pick a shortcut to edit it, or add one.</p>}
      </div>
    </Section>
  );
}

export function TriggersTab({ state, reload, note }: TabProps) {
  const pipe = usePipeline();
  const [list, setList] = useState<KeywordTrigger[]>(state.workspace.triggers);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [words, setWords] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(list) !== JSON.stringify(state.workspace.triggers);
  const upd = (id: string, p: Partial<KeywordTrigger>) => setList(list.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const add = () => setList([...list, { id: "kw_" + Date.now().toString(36), name: "", keywords: [], match: "exact", text: "hey {first_name}, sending that over now\n---\n{link: resource}\n---\nwhat made you grab it?", addTags: pipe.allTags.includes("Comment keyword") ? ["Comment keyword"] : [], aiAfter: "keep", once: true, enabled: true, fired: 0 }]);
  const save = async () => {
    setBusy(true); setErr("");
    try { await api("/api/workspace", "PUT", { triggers: list }); await reload(); note("Keyword replies saved.", "ok"); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <Section title="Keyword replies" sub="When a lead sends one of these words, the reply goes out straight away, before the AI or a person gets involved. Typical use: a post says DM me GUIDE and everyone who does gets the opener and the link."
      action={<div className="flex gap-2"><Button onClick={add}>Add keyword</Button><Button variant="primary" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : dirty ? "Save changes" : "Saved"}</Button></div>}>
      {err && <div className="p-4 pb-0"><Banner tone="error">{err}</Banner></div>}
      {list.length === 0 && <p className="p-4 text-mute text-[13px]">No keyword replies yet. Add one, give it a word such as GUIDE, and write what should be sent back.</p>}
      {list.map((t) => (
        <div key={t.id} className="p-4 border-b border-line last:border-b-0">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <Field label="Keywords" hint="Separate with commas. Capitals do not matter">
              <input className="field" placeholder="GUIDE, SEND IT" value={words[t.id] ?? t.keywords.join(", ")} onChange={(e) => { setWords({ ...words, [t.id]: e.target.value }); upd(t.id, { keywords: e.target.value.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean) }); }} aria-label="Keywords" />
            </Field>
            <Field label="Name" hint="For your own reference"><input className="field" placeholder="Free guide" value={t.name} onChange={(e) => upd(t.id, { name: e.target.value })} aria-label="Keyword reply name" /></Field>
            <div className="flex items-center gap-2 pb-1.5"><span className="text-[12.5px] text-mute">{t.enabled ? "On" : "Off"}</span><Toggle label="Keyword reply on" on={t.enabled} onChange={(v) => upd(t.id, { enabled: v })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="Message sent back" hint="Same variables as shortcuts. A line with --- splits it into separate messages"><textarea className="field font-mono text-[13px]" rows={6} value={t.text} onChange={(e) => upd(t.id, { text: e.target.value })} aria-label="Keyword reply message" /></Field>
            <Preview text={t.text} state={state} />
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-[13px]">
            <label className="flex items-center gap-1.5">Fires when the message
              <select className="field !w-auto !py-1" value={t.match} onChange={(e) => upd(t.id, { match: e.target.value as "exact" | "contains" })} aria-label="Match type"><option value="exact">is exactly the keyword</option><option value="contains">contains the keyword</option></select>
            </label>
            <label className="flex items-center gap-1.5">Then set the AI to
              <select className="field !w-auto !py-1" value={t.aiAfter} onChange={(e) => upd(t.id, { aiAfter: e.target.value as KeywordTrigger["aiAfter"] })} aria-label="AI mode afterwards"><option value="keep">leave as it is</option><option value="autopilot">Autopilot</option><option value="suggest">Suggest</option><option value="off">Off</option></select>
            </label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={t.once} onChange={(e) => upd(t.id, { once: e.target.checked })} />Once per lead</label>
            <label className="flex items-center gap-1.5">Add tag
              <select className="field !w-auto !py-1" value="" onChange={(e) => e.target.value && upd(t.id, { addTags: [...new Set([...t.addTags, e.target.value])] })} aria-label="Add tag"><option value="">Choose…</option>{pipe.groups.map((g) => <optgroup key={g.group} label={g.group}>{g.labels.map((l) => <option key={l}>{l}</option>)}</optgroup>)}</select>
            </label>
            {t.addTags.map((l) => <span key={l} className="inline-flex items-center gap-1 rounded-md border border-linestrong text-[11.5px] font-medium px-1.5 py-0.5">{l}<button aria-label={`Remove tag ${l}`} onClick={() => upd(t.id, { addTags: t.addTags.filter((x) => x !== l) })}>×</button></span>)}
            <span className="flex-1" />
            <span className="text-mute tabular-nums">Sent {t.fired} time{t.fired === 1 ? "" : "s"}</span>
            <Button variant="danger" onClick={() => setList(list.filter((x) => x.id !== t.id))}>Delete</Button>
          </div>
        </div>
      ))}
      <p className="p-4 text-[12.5px] text-mute border-t border-line">Works on direct messages, where the lead writing first opens Meta&apos;s 24 hour window. It never replies to a lead tagged Do not contact. Replying by DM to a comment on a post is a separate Meta permission and is not built yet. To try one now, open a demo conversation and type the keyword as the lead.</p>
    </Section>
  );
}

export function GoalsTab({ state, reload, note }: TabProps) {
  const [list, setList] = useState<ConversionGoal[]>(state.workspace.intake.goals);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(list) !== JSON.stringify(state.workspace.intake.goals);
  const upd = (i: number, p: Partial<ConversionGoal>) => setList(list.map((g, k) => (k === i ? { ...g, ...p } : g)));
  const save = async () => {
    setBusy(true);
    try { await api("/api/workspace", "PUT", { intake: { goals: list } }); await reload(); note("Conversion links saved.", "ok"); } catch (e) { note((e as Error).message, "error"); }
    setBusy(false);
  };
  return (
    <Section title="Conversion links" sub="Every place a conversation can lead: a strategy call, a VSL, a webinar, a free resource, a Skool community, an application. The AI picks the one whose rule fits where the conversation is going, and only ever sends these exact links."
      action={<div className="flex gap-2"><Button onClick={() => setList([...list, { id: "g" + Date.now(), type: "call", label: "", url: "", when: "" }])}>Add a link</Button><Button variant="primary" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : dirty ? "Save changes" : "Saved"}</Button></div>}>
      {list.length === 0 && <p className="p-4 text-mute text-[13px]">No links yet.</p>}
      {list.map((g, i) => (
        <div key={g.id} className="p-4 border-b border-line last:border-b-0 grid grid-cols-[190px_1fr_auto] gap-3 items-end">
          <Field label="Type"><select className="field" value={g.type} onChange={(e) => upd(i, { type: e.target.value as GoalType })} aria-label="Link type">{GOAL_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Name"><input className="field" placeholder="Strategy call" value={g.label} onChange={(e) => upd(i, { label: e.target.value })} aria-label="Link name" /></Field>
          <Button variant="danger" onClick={() => setList(list.filter((_, k) => k !== i))}>Remove</Button>
          <Field label="Link" className="col-span-3"><input className="field" placeholder="https://" value={g.url} onChange={(e) => upd(i, { url: e.target.value })} aria-label="Link URL" /></Field>
          <Field label="When to send it" hint="Plain words. The AI follows this" className="col-span-3"><input className="field" placeholder="Qualified and ready to talk it through" value={g.when} onChange={(e) => upd(i, { when: e.target.value })} aria-label="When to send" /></Field>
          <Field label="How you introduce it" hint="Optional. The line that goes with the link, in your words" className="col-span-3"><input className="field" placeholder="grab a time here and we will map it out:" value={g.message ?? ""} onChange={(e) => upd(i, { message: e.target.value })} aria-label="Intro line" /></Field>
          <p className="col-span-3 text-[12px] text-mute">In shortcuts and keyword replies use <code>{`{link: ${g.label || g.type}}`}</code> or <code>{`{link: ${g.type}}`}</code>. Sending it moves the lead to Link sent and counts under this name in Insights.</p>
        </div>
      ))}
    </Section>
  );
}
