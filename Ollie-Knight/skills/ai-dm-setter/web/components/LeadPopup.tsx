"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Avatar, avatarSrc, Banner, Button, nudgeHelper, StageBadge, type PublicWorkspace } from "./ui";
import { Icon, ICONS } from "./layout";
import { Activity, Composer, instagramChatUrl, LeadFacts, LeadMeta, Messages, reach, StagePicker, SummaryCard, TagPicker, useThread } from "./thread";

/**
 * Opens a lead without leaving the board: their details in a panel on the right, and a chat window docked at the
 * bottom to message them from. The board stays live underneath, so clicking another card switches lead.
 */
export default function LeadPopup({ id, ws, canSuggest, onClose, onChange }: { id: string; ws: PublicWorkspace; canSuggest: boolean; onClose: () => void; onChange: () => void }) {
  const t = useThread(id, onChange);
  const [draft, setDraft] = useState("");
  const [small, setSmall] = useState(false);
  const [note, setNote] = useState("");
  const [sim, setSim] = useState("");

  useEffect(() => { setDraft(""); setNote(""); setSmall(false); }, [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const d = t.d;
  if (!d) {
    return (
      <aside className="pop fixed right-3 top-3 bottom-3 z-40 w-[360px] flex items-center justify-center text-mute" aria-label="Lead details">
        {t.err || "Loading lead…"}
        <button onClick={onClose} aria-label="Close lead" className="absolute top-3 right-3 text-mute hover:text-ink"><Icon d={ICONS.close} /></button>
      </aside>
    );
  }
  const c = d.conversation;
  const r = reach(c);
  const isDemo = c.externalId.startsWith("demo_");
  const send = (bubbles: string[]) => t.run("send", async () => {
    const res = await api<{ simulated: boolean; via?: string }>(`/api/conversations/${id}/send`, "POST", { bubbles, sender: "owner" });
    if (res.via === "helper") nudgeHelper();
    setNote(res.simulated ? "Demo thread: recorded here only, nothing was sent to Meta." : "");
    setDraft("");
  });
  const suggest = () => t.run("suggest", async () => {
    const res = await api<{ conversation: { suggestion: { bubbles: string[]; reason: string } | null } }>(`/api/conversations/${id}/suggest`, "POST");
    const s = res.conversation.suggestion;
    if (s?.bubbles.length) { setDraft(s.bubbles.join("\n---\n")); setNote(`AI draft: ${s.reason}`); }
    else setNote(s?.reason ?? "No draft was produced.");
  });
  const simulate = () => t.run("sim", async () => { await api(`/api/conversations/${id}/simulate`, "POST", { text: sim }); setSim(""); });

  const section = (title: string, body: React.ReactNode) => (
    <div className="px-4 py-3 border-b border-line">
      <h3 className="label mb-2">{title}</h3>
      {body}
    </div>
  );

  return (
    <>
      <aside className="pop fixed right-3 top-3 bottom-3 z-40 w-[360px] max-w-[calc(100%-24px)] flex flex-col overflow-hidden" aria-label="Lead details">
        <div className="px-4 py-3 border-b border-line flex items-center gap-3 shrink-0">
          <Avatar name={c.name} platform={c.platform} src={avatarSrc(c)} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[15px] truncate">{c.name}</div>
            <div className="text-[12px] text-mute truncate">{c.handle ? `@${c.handle} · ` : ""}{c.messageCount} messages</div>
          </div>
          <button onClick={onClose} aria-label="Close lead" title="Close (Esc)" className="text-mute hover:text-ink"><Icon d={ICONS.close} /></button>
        </div>
        <div className="px-4 py-2 border-b border-line flex items-center gap-2 shrink-0">
          <StageBadge stage={c.stage} />
          <span className="flex-1" />
          {c.profileUrl && <a href={c.profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-medium underline underline-offset-2">Profile<Icon d={ICONS.external} size={12} /></a>}
          <Link href={`/inbox?c=${c.id}`} className="text-[12.5px] font-medium underline underline-offset-2">Open in inbox</Link>
        </div>
        <div className="flex-1 overflow-y-auto scroll">
          {section("Summary so far", <SummaryCard t={t} />)}
          {section("Lead stage", <StagePicker c={c} patch={t.patch} />)}
          {section("Tags", <TagPicker key={c.id} labels={c.labels} patch={t.patch} />)}
          {section("Profile and owner", <LeadMeta c={c} ws={ws} patch={t.patch} />)}
          {section("What we know", <LeadFacts key={c.id} c={c} patch={t.patch} />)}
          {section("Notes", <textarea key={c.id} className="field text-[13px]" rows={2} defaultValue={c.notes} placeholder="Private notes" onBlur={(e) => e.target.value !== c.notes && t.patch({ notes: e.target.value })} />)}
          {section("Activity", <Activity events={d.events} limit={10} />)}
        </div>
      </aside>

      <section className={`pop fixed bottom-0 z-40 w-[380px] max-w-[calc(100%-24px)] flex flex-col overflow-hidden !rounded-b-none right-[384px] max-[820px]:right-3 ${small ? "" : "h-[min(520px,calc(100%-24px))]"}`} aria-label={`Chat with ${c.name}`}>
        <header className="px-3 h-11 flex items-center gap-2 bg-ink text-onbrand shrink-0 cursor-pointer" onClick={() => setSmall((v) => !v)} title={small ? "Open chat" : "Minimise chat"}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.window.open ? "var(--c-ok)" : "var(--c-mute)" }} title={c.window.open ? "Inside the 24 hour window" : "24 hour window closed"} />
          <span className="font-medium text-[13.5px] truncate flex-1">{c.name}</span>
          {c.unread && <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-onbrand text-ink">NEW</span>}
          <button onClick={(e) => { e.stopPropagation(); setSmall((v) => !v); }} aria-label={small ? "Open chat" : "Minimise chat"} className="opacity-80 hover:opacity-100"><Icon d={small ? ICONS.chevUp : ICONS.minus} /></button>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close chat" className="opacity-80 hover:opacity-100"><Icon d={ICONS.close} /></button>
        </header>
        {!small && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto scroll px-3 py-2 bg-canvas"><Messages messages={d.messages} compact who={{ name: c.name, src: avatarSrc(c) }} /></div>
            <div className="border-t border-line p-2.5 flex flex-col gap-1.5 shrink-0">
              {t.err && <Banner tone="error">{t.err}</Banner>}
              {note && <Banner tone="info">{note}</Banner>}
              {!r.ok && <Banner tone="warn">{r.text}.{instagramChatUrl(c) && <> <a href={instagramChatUrl(c)} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">Open in Instagram</a></>}</Banner>}
              {r.ok && !c.window.open && !isDemo && <Banner tone="warn">{r.text}.</Banner>}
              <Composer c={c} ws={ws} value={draft} onChange={setDraft} onSend={send} busy={t.busy === "send"} disabled={!r.ok} compact
                extra={canSuggest && c.aiMode !== "off" ? <Button disabled={!!t.busy} onClick={suggest} title="Have the AI draft the next reply">{t.busy === "suggest" ? "…" : "AI"}</Button> : null} />
              {isDemo && (
                <div className="flex gap-1.5">
                  <input className="field flex-1 !py-1 text-[12.5px]" placeholder="Demo: what the lead says next" value={sim} onChange={(e) => setSim(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && sim.trim()) simulate(); }} aria-label="Simulate a lead message" />
                  <Button disabled={!sim.trim() || !!t.busy} onClick={simulate}>Add</Button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </>
  );
}
