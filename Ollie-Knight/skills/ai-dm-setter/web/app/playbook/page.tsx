"use client";
import { useState } from "react";
import type { PlaybookItem } from "@/lib/types";
import { api, Banner, Button, PageHeader, useAppState } from "@/components/ui";
import { Knowledge } from "@/components/Knowledge";

export default function PlaybookPage() {
  const { state, reload } = useAppState(15000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  if (!state) return <div className="p-8 text-mute">Loading playbook…</div>;
  const pb = state.workspace.playbook;
  const threads = state.conversations.filter((c) => c.messageCount >= 2).length;

  const build = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ skipped: number }>("/api/playbook", "POST");
      setMsg(r.skipped ? { tone: "warn", text: `${r.skipped} conversations did not fit in one analysis pass and were left out. The longest threads were used first.` } : { tone: "ok", text: "Playbook rebuilt from your inbox." });
      reload();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto scroll p-6">
      <PageHeader title="Playbook" sub="What the AI knows: the answers you have taught it, and what it learned from your inbox about how you write and what leads ask and push back on.">
        <Button variant="primary" disabled={busy || threads === 0} onClick={build}>{busy ? "Analysing inbox…" : pb ? "Rebuild from inbox" : "Analyse inbox"}</Button>
      </PageHeader>
      <div className="space-y-3 mb-5">
        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
        {state.flags.aiError && <Banner tone="error">{state.flags.aiError} Until then the analysis below uses a basic keyword engine that finds objections and questions by pattern and cannot read meaning.</Banner>}
        {!state.flags.ai && <Banner tone="warn">No Anthropic key is set, so the analysis uses a basic keyword engine: it finds objections and questions by pattern and cannot read meaning. Add ANTHROPIC_API_KEY to .env.local for the real analysis.</Banner>}
        {state.flags.demoData && <Banner tone="info">The inbox currently holds demo conversations. Import your own history in Settings to learn from real ones.</Banner>}
      </div>

      <Knowledge />

      <h2 className="font-semibold text-[17px] mb-3">Learned from your inbox</h2>
      {!pb ? (
        <div className="card p-10 text-center text-mute">{threads} conversations are ready to analyse. Nothing has been analysed yet.</div>
      ) : (
        <>
          <p className="text-[12px] text-mute mb-3">Built {new Date(pb.generatedAt).toLocaleString("en-GB")} from {pb.conversationsAnalysed} conversations and {pb.messagesAnalysed} messages. Engine: {pb.engine === "claude" ? "Claude" : "demo keyword engine"}.</p>
          <div className="card p-5 mb-5">
            <h2 className="font-semibold mb-1.5">Your voice</h2>
            <p>{pb.voice.summary}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">{pb.voice.traits.map((t) => <span key={t} className="rounded-md bg-canvas px-2 py-1 text-[12px] font-semibold">{t}</span>)}</div>
            {pb.voice.phrases.length > 0 && <p className="text-[13px] text-mute mt-3">Phrases you reuse: {pb.voice.phrases.map((p) => `"${p}"`).join(", ")}</p>}
            <p className="text-[13px] text-mute mt-1">About {pb.voice.avgWordsPerBubble} words per message. Emoji: {pb.voice.emoji}.</p>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <List title="Objections" items={pb.objections} answerLabel="How you handle it" />
            <List title="Common questions" items={pb.questions} answerLabel="Your answer" />
            <List title="Pain points" items={pb.pains} />
            <List title="Desires" items={pb.desires} />
            <List title="Outcomes they want" items={pb.outcomes} />
          </div>
        </>
      )}
    </div>
  );
}

function List({ title, items, answerLabel }: { title: string; items: PlaybookItem[]; answerLabel?: string }) {
  return (
    <div className="card p-5">
      <h2 className="font-semibold mb-3">{title} <span className="text-mute font-normal">({items.length})</span></h2>
      {items.length === 0 && <p className="text-mute text-[13px]">Nothing found yet.</p>}
      <ul className="space-y-4">
        {items.map((it, i) => (
          <li key={i}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">{it.title}</span>
              <span className="text-[11px] text-mute whitespace-nowrap">{it.frequency} conversation{it.frequency === 1 ? "" : "s"}</span>
            </div>
            <p className="text-[13px] text-mute">{it.detail}</p>
            {it.quotes.slice(0, 2).map((q, k) => <blockquote key={k} className="text-[13px] border-l-2 border-line pl-2.5 mt-1.5 italic">{q}</blockquote>)}
            {answerLabel && it.response && <p className="text-[13px] mt-1.5 rounded-lg bg-brandsoft px-2.5 py-1.5"><b>{answerLabel}:</b> {it.response}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
