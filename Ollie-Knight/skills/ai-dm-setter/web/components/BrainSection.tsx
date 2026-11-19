"use client";
import { useRef, useState } from "react";
import type { BrainEntry, BrainKey } from "@/lib/types";
import { BRAIN_SECTIONS } from "@/lib/brain";
import { api, Banner, Button } from "@/components/ui";
import { Speak } from "@/components/Speak";

export interface DocView { id: string; name: string; addedAt: string; chars: number; words: number }
export interface SectionView { answers: Record<string, string>; custom: BrainEntry[]; docs: DocView[] }
export interface BrainView { updatedAt: string; chars: number; limit: number; sections: Record<BrainKey, SectionView> }

const MAX_FILE_BYTES = 4_000_000;
const words = (n: number) => `${n.toLocaleString()} ${n === 1 ? "word" : "words"}`;

/**
 * The long form of one part of the brief: deep questions, the owner's own questions and uploaded intake forms.
 * Answers are kept by the page and saved with the rest of the brief. Documents save the moment they are added.
 */
export default function BrainSection({ sectionKey, value, onChange, onBrain, beforeUpload }: {
  sectionKey: BrainKey;
  value: SectionView;
  /** Answers or own questions edited; nothing is saved until the page saves. */
  onChange: (next: SectionView) => void;
  /** The server's copy after a document was added or removed. */
  onBrain: (brain: BrainView) => void;
  /** Saves typed answers first, so adding a document never loses them. */
  beforeUpload: () => Promise<unknown>;
}) {
  const def = BRAIN_SECTIONS.find((s) => s.key === sectionKey)!;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  const [paste, setPaste] = useState(false);
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [open, setOpen] = useState<{ id: string; text: string } | null>(null);
  const [over, setOver] = useState(false);

  const answered = def.questions.filter((q) => value.answers[q.id]?.trim()).length;
  const setAnswer = (id: string, v: string) => onChange({ ...value, answers: { ...value.answers, [id]: v } });
  const setCustom = (i: number, p: Partial<BrainEntry>) => onChange({ ...value, custom: value.custom.map((c, k) => (k === i ? { ...c, ...p } : c)) });

  async function upload(files: File[]) {
    if (!files.length) return;
    setNote(null);
    const done: string[] = [];
    try {
      await beforeUpload();
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) throw new Error(`"${file.name}" is over 4 MB. Save it without images, or paste the text in instead.`);
        setBusy(`Reading ${file.name}…`);
        const form = new FormData();
        form.set("section", sectionKey);
        form.set("file", file);
        const res = await fetch("/api/brain/upload", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `"${file.name}" could not be uploaded.`);
        onBrain(data.brain);
        done.push(`${file.name}${data.cut ? " (only the first part fitted)" : ""}`);
      }
      setNote({ tone: "ok", text: `Added ${done.join(", ")}. The AI reads ${done.length === 1 ? "it" : "them"} from the next reply on.` });
    } catch (e) {
      setNote({ tone: "error", text: (done.length ? `Added ${done.join(", ")}. ` : "") + (e as Error).message });
    }
    setBusy("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function addPasted() {
    setNote(null);
    setBusy("Saving…");
    try {
      await beforeUpload();
      const data = await api<{ brain: BrainView; cut: boolean }>("/api/brain/upload", "POST", { section: sectionKey, name: pasteName, text: pasteText });
      onBrain(data.brain);
      setPaste(false); setPasteName(""); setPasteText("");
      setNote({ tone: "ok", text: data.cut ? "Added, but it was too long to keep in full. Only the first part was saved." : "Added. The AI reads it from the next reply on." });
    } catch (e) {
      setNote({ tone: "error", text: (e as Error).message });
    }
    setBusy("");
  }

  async function remove(d: DocView) {
    if (!window.confirm(`Remove "${d.name}"? The AI will stop using it.`)) return;
    setBusy("Removing…");
    try {
      await beforeUpload();
      const data = await api<{ brain: BrainView }>("/api/brain", "PUT", { removeDocs: [d.id] });
      onBrain(data.brain);
      if (open?.id === d.id) setOpen(null);
    } catch (e) {
      setNote({ tone: "error", text: (e as Error).message });
    }
    setBusy("");
  }

  async function view(d: DocView) {
    if (open?.id === d.id) return setOpen(null);
    try {
      const data = await api<{ doc: { text: string } }>(`/api/brain?doc=${encodeURIComponent(d.id)}`);
      setOpen({ id: d.id, text: data.doc.text });
    } catch (e) {
      setNote({ tone: "error", text: (e as Error).message });
    }
  }

  return (
    <div className="mt-8 pt-6 border-t border-line">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="text-[15.5px] font-semibold">Go deeper: {def.title.toLowerCase()}</h3>
        <span className="text-[12.5px] text-mute shrink-0">{answered} of {def.questions.length} answered{value.docs.length ? `, ${value.docs.length} ${value.docs.length === 1 ? "document" : "documents"}` : ""}</span>
      </div>
      <p className="text-mute text-[13.5px] mb-5">{def.intro} Everything here becomes part of what the AI knows and is read before every reply. Answer as many as you can, in as much detail as you like. Skip any that do not apply.</p>

      <h4 className="font-semibold mb-1">Intake forms and documents</h4>
      <p className="text-[12.5px] text-mute mb-2">Already filled in an intake form for this? Upload it and the AI reads the whole thing. Word (.docx), PDF or text files, up to 4 MB each. From Google Docs, use File, Download, then upload the file.</p>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) upload([...e.dataTransfer.files]); }}
        className={`rounded-lg border border-dashed p-4 flex flex-wrap items-center gap-2 ${over ? "border-ink bg-surface2" : "border-linestrong"}`}
      >
        <input ref={fileRef} type="file" multiple className="hidden" accept=".docx,.pdf,.txt,.md,.markdown,.csv,.tsv,.rtf,.html,.htm,.json" onChange={(e) => upload([...(e.target.files ?? [])])} />
        <Button disabled={!!busy} onClick={() => fileRef.current?.click()}>Upload a file</Button>
        <Button variant="ghost" disabled={!!busy} onClick={() => setPaste(!paste)}>{paste ? "Cancel pasting" : "Paste text instead"}</Button>
        <span className="text-[12.5px] text-mute">{busy || "or drop files here"}</span>
      </div>
      {paste && (
        <div className="rounded-lg border border-line p-3 mt-2">
          <input className="field mb-2" placeholder="Name, for example Offer intake form" value={pasteName} onChange={(e) => setPasteName(e.target.value)} />
          <textarea className="field" rows={8} placeholder="Paste the form or notes here" value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
          <Speak value={pasteText} onChange={setPasteText} />
          <div className="flex items-center gap-3 mt-2">
            <Button variant="primary" disabled={!!busy || !pasteText.trim()} onClick={addPasted}>Add to the brief</Button>
            <span className="text-[12.5px] text-mute">{words(pasteText.split(/\s+/).filter(Boolean).length)}</span>
          </div>
        </div>
      )}
      {note && <div className="mt-2"><Banner tone={note.tone}>{note.text}</Banner></div>}
      {value.docs.length > 0 && (
        <ul className="mt-3 space-y-2">
          {value.docs.map((d) => (
            <li key={d.id} className="rounded-lg border border-line">
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{d.name}</div>
                  <div className="text-[12.5px] text-mute">{words(d.words)}, added {new Date(d.addedAt).toLocaleDateString()}</div>
                </div>
                <Button variant="ghost" onClick={() => view(d)}>{open?.id === d.id ? "Hide" : "View"}</Button>
                <Button variant="ghost" disabled={!!busy} onClick={() => remove(d)}>Remove</Button>
              </div>
              {open?.id === d.id && <pre className="border-t border-line px-3 py-2 text-[12.5px] whitespace-pre-wrap max-h-[320px] overflow-y-auto scroll font-sans">{open.text}</pre>}
            </li>
          ))}
        </ul>
      )}

      <h4 className="font-semibold mt-7 mb-3">Questions</h4>
      {def.questions.map((q, i) => (
        <div key={q.id} className="mb-4">
          <label htmlFor={`bq_${q.id}`} className="block font-semibold text-[13.5px]"><span className="text-mute font-normal">{i + 1}.</span> {q.q}</label>
          {q.hint && <span className="block text-[12.5px] text-mute">{q.hint}</span>}
          <textarea id={`bq_${q.id}`} className="field mt-1" rows={value.answers[q.id] ? Math.min(12, Math.max(3, Math.ceil(value.answers[q.id].length / 90))) : 2} value={value.answers[q.id] ?? ""} onChange={(e) => setAnswer(q.id, e.target.value)} />
          <Speak value={value.answers[q.id] ?? ""} onChange={(v) => setAnswer(q.id, v)} />
        </div>
      ))}

      <h4 className="font-semibold mt-7 mb-1">Your own questions</h4>
      <p className="text-[12.5px] text-mute mb-3">Add anything that was not asked above: write the question a lead might ask, or a heading, then the answer you want the AI to know.</p>
      {value.custom.map((c, i) => (
        <div key={c.id} className="rounded-lg border border-line p-3 mb-3">
          <div className="flex gap-2 mb-2">
            <input className="field" placeholder="Question or heading" value={c.question} onChange={(e) => setCustom(i, { question: e.target.value })} />
            <Button variant="ghost" onClick={() => onChange({ ...value, custom: value.custom.filter((_, k) => k !== i) })}>Remove</Button>
          </div>
          <textarea className="field" rows={3} placeholder="Answer" value={c.answer} onChange={(e) => setCustom(i, { answer: e.target.value })} />
          <Speak value={c.answer} onChange={(v) => setCustom(i, { answer: v })} />
        </div>
      ))}
      <Button onClick={() => onChange({ ...value, custom: [...value.custom, { id: "q_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), question: "", answer: "" }] })}>Add your own question</Button>
    </div>
  );
}
