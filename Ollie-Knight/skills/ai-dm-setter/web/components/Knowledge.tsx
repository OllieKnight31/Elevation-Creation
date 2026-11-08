"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { KnowledgeGap, KnowledgeItem } from "@/lib/types";
import { api, Banner, Button, every, timeAgo, Toggle } from "./ui";

type GapView = KnowledgeGap & { leads: { id: string; name: string; waiting: boolean }[]; waiting: number };
type ItemView = KnowledgeItem & { by: string };
interface View { gaps: GapView[]; items: ItemView[]; limit: number; released?: number }
type Draft = { id?: string; kind: "question" | "objection"; question: string; answer: string; enabled: boolean };

const BLANK: Draft = { kind: "question", question: "", answer: "", enabled: true };

/** Questions the AI could not answer, and the answers people have taught it. */
export function Knowledge() {
  const [v, setV] = useState<View | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<Draft | null>(null);
  const [find, setFind] = useState("");

  const load = useCallback(() => api<View>("/api/knowledge").then(setV).catch((e) => setMsg({ tone: "error", text: (e as Error).message })), []);
  useEffect(() => {
    load();
    return every(load, 15000);
  }, [load]);

  const act = async (key: string, body: Record<string, unknown>, done: (r: View) => string) => {
    setBusy(key); setMsg(null);
    try {
      const r = await api<View>("/api/knowledge", "POST", body);
      setV(r);
      setMsg({ tone: "ok", text: done(r) });
      window.dispatchEvent(new Event("setter:auth"));
      return true;
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
      return false;
    } finally {
      setBusy("");
    }
  };

  if (!v) return <div className="card p-5 mb-5 text-mute">Loading what the AI has been taught…</div>;
  const q = find.trim().toLowerCase();
  const items = q ? v.items.filter((i) => `${i.question} ${i.answer}`.toLowerCase().includes(q)) : v.items;

  return (
    <div className="space-y-5 mb-5">
      {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}

      <div className={`card p-5 ${v.gaps.length ? "border-err" : ""}`}>
        <h2 className="font-semibold">Waiting for your answer <span className="text-mute font-normal">({v.gaps.length})</span></h2>
        <p className="text-[13px] text-mute mt-0.5 mb-3">Things leads asked that the AI has not been told how to handle. It holds those conversations instead of guessing. Answer once here, or reply in the conversation, and the AI keeps the answer for every lead after.</p>
        {v.gaps.length === 0 && <p className="text-[13px] text-mute">Nothing is waiting. When the AI meets a question it cannot answer, it appears here and the conversation is tagged Needs human.</p>}
        <ul className="space-y-4">
          {v.gaps.map((g) => (
            <li key={g.id} className="border-t border-line pt-4 first:border-0 first:pt-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 tone-err uppercase">{g.kind}</span>
                <span className="font-semibold flex-1">{g.question}</span>
                <span className="text-[11px] text-mute whitespace-nowrap">{g.leads.length} lead{g.leads.length === 1 ? "" : "s"} · {timeAgo(g.lastAskedAt)}</span>
              </div>
              {g.quote && g.quote !== g.question && <blockquote className="text-[13px] border-l-2 border-line pl-2.5 mt-1.5 italic">{g.quote}</blockquote>}
              <p className="text-[12px] text-mute mt-1.5">Asked by {g.leads.map((l, i) => <span key={l.id}>{i > 0 && ", "}<Link className="underline hover:text-ink" href={`/inbox?c=${l.id}`}>{l.name}</Link></span>)}</p>
              <textarea className="field mt-2 text-[14px]" rows={3} placeholder="Write the answer the way you would say it. Include the facts the AI needs: numbers, conditions, what you offer instead." value={answers[g.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [g.id]: e.target.value })} aria-label={`Answer to: ${g.question}`} />
              <div className="flex gap-2 mt-1.5">
                <Button variant="primary" disabled={!!busy || !(answers[g.id] ?? "").trim()} onClick={async () => {
                  const ok = await act(g.id, { action: "answer", gapId: g.id, answer: answers[g.id] }, (r) => `Answer saved. The AI will use it from now on.${r.released ? ` ${r.released} held conversation${r.released === 1 ? " has" : "s have"} been picked back up.` : ""}`);
                  if (ok) setAnswers(({ [g.id]: _gone, ...rest }) => rest);
                }}>{busy === g.id ? "Saving…" : "Save answer and teach the AI"}</Button>
                <Button variant="ghost" disabled={!!busy} onClick={() => act(g.id, { action: "dismiss", gapId: g.id }, () => "Removed from the list. Nothing was taught.")}>Dismiss</Button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="font-semibold flex-1">What the AI has been taught <span className="text-mute font-normal">({v.items.length} of {v.limit})</span></h2>
          {v.items.length > 6 && <input className="field !w-56 !py-1.5 text-[13px]" placeholder="Search answers" value={find} onChange={(e) => setFind(e.target.value)} />}
          <Button onClick={() => setEdit({ ...BLANK })}>Add an answer</Button>
        </div>
        <p className="text-[13px] text-mute mb-3">Every answer here goes into the AI&apos;s instructions on each reply. Edit one to change how it handles that question, or switch it off.</p>
        {edit && !edit.id && <Editor d={edit} set={setEdit} busy={busy === "save"} onSave={async () => { if (await act("save", { action: "save", item: edit }, () => "Answer added.")) setEdit(null); }} />}
        {items.length === 0 && !edit && <p className="text-[13px] text-mute">{q ? "No answers match that search." : "Nothing yet. Answers you give to flagged questions land here."}</p>}
        <ul className="space-y-4">
          {items.map((i) => (
            <li key={i.id} className="border-t border-line pt-4 first:border-0 first:pt-0">
              {edit?.id === i.id ? (
                <Editor d={edit} set={setEdit} busy={busy === "save"} onSave={async () => { if (await act("save", { action: "save", item: edit }, () => "Answer updated.")) setEdit(null); }} />
              ) : (
                <div className={i.enabled ? "" : "opacity-50"}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-surface2 uppercase">{i.kind}</span>
                    <span className="font-semibold flex-1">{i.question}</span>
                    <Toggle on={i.enabled} label={`Use this answer: ${i.question}`} onChange={(on) => act(i.id, { action: "save", item: { ...i, enabled: on } }, () => (on ? "Answer switched on." : "Answer switched off. The AI will not use it."))} />
                  </div>
                  <p className="text-[13.5px] mt-1.5 rounded-lg bg-brandsoft px-2.5 py-1.5 whitespace-pre-wrap">{i.answer}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[12px] text-mute">
                    <span className="flex-1">{i.source === "reply" ? "Learned from a reply" : "Written here"}{i.by ? ` by ${i.by}` : ""} · {timeAgo(i.updatedAt)} · used {i.used} time{i.used === 1 ? "" : "s"}{i.conversationId && <> · <Link className="underline hover:text-ink" href={`/inbox?c=${i.conversationId}`}>conversation</Link></>}</span>
                    <button className="underline hover:text-ink" onClick={() => setEdit({ id: i.id, kind: i.kind, question: i.question, answer: i.answer, enabled: i.enabled })}>Edit</button>
                    <button className="underline hover:text-err" disabled={!!busy} onClick={() => { if (window.confirm("Remove this answer? The AI will ask for a person again if the question comes up.")) act(i.id, { action: "delete", id: i.id }, () => "Answer removed."); }}>Remove</button>
                  </div>
                  {i.raw && i.raw !== i.answer && <p className="text-[12px] text-mute mt-1">What was sent to the lead: {i.raw}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Editor({ d, set, onSave, busy }: { d: Draft; set: (d: Draft | null) => void; onSave: () => void; busy: boolean }) {
  return (
    <div className="rounded-[12px] border border-linestrong p-3 mb-4 bg-canvas space-y-2">
      <div className="flex gap-2">
        <select className="field !w-36 text-[13px]" value={d.kind} onChange={(e) => set({ ...d, kind: e.target.value as Draft["kind"] })} aria-label="Type">
          <option value="question">Question</option>
          <option value="objection">Objection</option>
        </select>
        <input className="field flex-1 text-[14px]" placeholder="The question or objection, in general terms" value={d.question} onChange={(e) => set({ ...d, question: e.target.value })} aria-label="Question or objection" />
      </div>
      <textarea className="field text-[14px]" rows={4} placeholder="The answer, the way you would say it" value={d.answer} onChange={(e) => set({ ...d, answer: e.target.value })} aria-label="Answer" />
      <div className="flex gap-2">
        <Button variant="primary" disabled={busy || !d.question.trim() || !d.answer.trim()} onClick={onSave}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="ghost" onClick={() => set(null)}>Cancel</Button>
      </div>
    </div>
  );
}
