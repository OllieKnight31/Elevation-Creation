"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BrainKey, ConversionGoal, Intake } from "@/lib/types";
import { api, Banner, Button, useAppState } from "@/components/ui";
import ImportHistory from "@/components/ImportHistory";
import { Speak } from "@/components/Speak";
import BrainSection, { type BrainView, type SectionView } from "@/components/BrainSection";
import { GOAL_TYPES } from "@/lib/shortcuts";

const STEPS = ["Business", "Offer", "Ideal client", "Conversion goals", "Voice and rules", "Additional information", "Connect and import", "Review"];
// The first six steps each have a long form part, kept in the brain.
const BRAIN_STEP: BrainKey[] = ["business", "offer", "idealClient", "goals", "voice", "extra"];
const CONNECT = 6, REVIEW = 7;

const EXAMPLE: Intake = {
  businessName: "Northbound Coaching", ownerName: "Alex", niche: "Coaches and consultants who sell a service online",
  businessModel: "12 week done-with-you programme. We build one inbound content channel, a DM process that turns replies into booked calls, and a single offer at one price. Weekly group call plus direct message support.",
  offer: "Inbound Client Engine, 12 weeks", price: "£3,000 or 3 payments of £1,100",
  idealClient: "Already has paying clients, earns £1k to £8k a month, wants consistent inbound leads without cold outreach",
  notAFit: "No offer or clients yet, wants done-for-you, under 18",
  qualifyingQuestions: ["What do you sell and who to?", "Roughly what are you earning from it each month right now?", "Where do you want that to be in 6 months?", "What has stopped you getting there so far?"],
  breakdownMessage: "here is how we do it. we build one inbound channel from your content, a DM process that books the calls, and one simple offer at one price. no cold outreach. most people see their first booked calls inside 3 weeks.",
  goals: [
    { id: "g1", type: "call", label: "Strategy call", url: "https://cal.example.com/strategy-call", when: "Qualified and wants to talk it through" },
    { id: "g2", type: "vsl", label: "How it works video", url: "https://example.com/watch", when: "Interested but not ready for a call, or asks how it works" },
  ],
  voiceNotes: "Lowercase, short messages, one question at a time, no exclamation marks, friendly and direct.",
  neverSay: "No income guarantees. Never promise specific results. Never discuss refunds, pass those to me.",
  approvedClaims: "Most clients see their first booked calls inside 3 weeks. Over 140 coaches have been through the programme.",
  identity: "team",
  aboutMe: "Ran a coaching business for 4 years before starting this. Spent the first year cold messaging and hated it, which is why the programme is all inbound.",
  slang: "tbh, mate",
};

export default function Onboarding() {
  const { state, reload } = useAppState(20000);
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Intake | null>(null);
  const [disclosure, setDisclosure] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [brain, setBrain] = useState<BrainView | null>(null);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (state && !f) { setF(state.workspace.intake); setDisclosure(state.workspace.settings.disclosure); }
  }, [state, f]);
  useEffect(() => {
    api<{ brain: BrainView }>("/api/brain").then((r) => setBrain(r.brain)).catch((e) => setSaveError((e as Error).message));
  }, []);

  if (!state || !f) return <div className="p-8 text-mute">Loading…</div>;
  const set = <K extends keyof Intake>(k: K, v: Intake[K]) => setF({ ...f, [k]: v });
  // Answers and own questions travel with the rest of the brief. Documents are saved when they are added,
  // so only their list comes back and the copy on screen is replaced by what was stored.
  const saveBrain = async () => {
    if (!brain) return;
    const sections = Object.fromEntries(BRAIN_STEP.map((k) => [k, { answers: brain.sections[k].answers, custom: brain.sections[k].custom }]));
    const r = await api<{ brain: BrainView }>("/api/brain", "PUT", { sections });
    setBrain((cur) => (cur ? { ...r.brain, sections: Object.fromEntries(BRAIN_STEP.map((k) => [k, { ...cur.sections[k], docs: r.brain.sections[k].docs }])) as BrainView["sections"] } : r.brain));
  };
  const save = async () => {
    setSaveError("");
    try {
      await api("/api/workspace", "PUT", { intake: f, settings: { disclosure } });
      await saveBrain();
    } catch (e) {
      setSaveError((e as Error).message);
      throw e;
    }
  };
  const go = async (n: number) => { try { await save(); } catch { return; } setStep(Math.max(0, Math.min(STEPS.length - 1, n))); window.scrollTo?.(0, 0); };
  const brainWords = brain ? Math.round(brain.chars / 6) : 0;
  const deeper = (i: number) => brain && (
    <BrainSection
      sectionKey={BRAIN_STEP[i]}
      value={brain.sections[BRAIN_STEP[i]]}
      onChange={(next: SectionView) => setBrain({ ...brain, sections: { ...brain.sections, [BRAIN_STEP[i]]: next } })}
      onBrain={(b) => setBrain((cur) => (cur ? { ...b, sections: Object.fromEntries(BRAIN_STEP.map((k) => [k, { ...cur.sections[k], docs: b.sections[k].docs }])) as BrainView["sections"] } : b))}
      beforeUpload={save}
    />
  );
  const missing = [
    !f.businessName && "business name", !f.businessModel && "business model", !f.offer && "offer", !f.idealClient && "ideal client",
    !f.qualifyingQuestions.some(Boolean) && "a qualifying question", !f.goals.some((g) => g.url) && "a conversion link",
  ].filter(Boolean) as string[];
  const threads = state.conversations.length;

  const T = (label: string, k: keyof Intake, rows = 3, hint = "") => (
    <div className="mb-4">
      <label htmlFor={`bf_${k}`} className="block font-semibold">{label}</label>
      {hint && <span className="block text-[12.5px] text-mute mb-1">{hint}</span>}
      {rows === 1
        ? <input id={`bf_${k}`} className="field mt-1" value={(f[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} />
        : <textarea id={`bf_${k}`} className="field mt-1" rows={rows} value={(f[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} />}
      {rows > 1 && <Speak value={(f[k] as string) ?? ""} onChange={(v) => set(k, v as never)} />}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto scroll">
      <div className="max-w-[1000px] mx-auto p-6 flex gap-8">
        <ol className="w-[200px] shrink-0 pt-14 space-y-1">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button onClick={() => go(i)} className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-semibold text-[13.5px] ${i === step ? "bg-surface shadow-sm text-ink" : "text-mute hover:text-ink"}`}>
                <span className={`w-6 h-6 rounded-full text-[12px] flex items-center justify-center ${i < step ? "bg-surface2 text-ink" : i === step ? "bg-ink text-onbrand" : "bg-surface2 text-mute"}`}>{i + 1}</span>
                {s}
              </button>
            </li>
          ))}
        </ol>

        <div className="flex-1 min-w-0">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h1 className="text-[22px] font-semibold">Business brief</h1>
              <p className="text-mute">This is the brain of your setter. The AI answers from this brief and nothing else, so the more you put in, the better it sets. Each part has the short fields the app relies on, then a deeper set of questions and a place to upload your intake forms.</p>
              {brain && brain.chars > 0 && <p className="text-[12.5px] text-mute mt-1">The brain holds about {brainWords.toLocaleString()} words so far ({Math.round((brain.chars / brain.limit) * 100)}% of the room available).</p>}
            </div>
            <Button onClick={() => setF({ ...EXAMPLE })}>Fill with example</Button>
          </div>

          <div className="card p-6">
            <h2 className="text-[17px] font-semibold mb-4">{step + 1}. {STEPS[step]}</h2>

            {step === 0 && <>
              <div className="grid grid-cols-2 gap-4">{T("Business name", "businessName", 1)}{T("Your first name", "ownerName", 1, "")}</div>
              {T("Who you serve", "niche", 1, "The niche, in one line.")}
              {T("How your business model works", "businessModel", 6, "Explain it the way you would to a lead: what they get, how it is delivered, how long it takes. The AI uses this to explain your offer inside the DMs.")}
              {deeper(0)}
            </>}

            {step === 1 && <>
              {T("Offer name and what is included", "offer", 3)}
              {T("Price and payment options", "price", 1, "The AI only quotes what is written here.")}
              {T("Claims the AI is allowed to make", "approvedClaims", 4, "Results, numbers and proof you can stand behind. Anything not listed here will not be said.")}
              {deeper(1)}
            </>}

            {step === 2 && <>
              {T("Your ideal client", "idealClient", 3, "Who should be sent a link.")}
              {T("Who is not a fit", "notAFit", 3, "These leads are tagged Disqualified and let down politely.")}
              <span className="font-semibold">Qualifying questions</span>
              <span className="block text-[12.5px] text-mute mb-2">Asked one at a time, in your voice, woven into the chat.</span>
              {f.qualifyingQuestions.map((q, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input className="field" value={q} placeholder={`Question ${i + 1}`} onChange={(e) => set("qualifyingQuestions", f.qualifyingQuestions.map((x, k) => (k === i ? e.target.value : x)))} />
                  <Button variant="ghost" onClick={() => set("qualifyingQuestions", f.qualifyingQuestions.filter((_, k) => k !== i))}>Remove</Button>
                </div>
              ))}
              <Button onClick={() => set("qualifyingQuestions", [...f.qualifyingQuestions, ""])}>Add question</Button>
              {deeper(2)}
            </>}

            {step === 3 && <>
              <p className="text-mute mb-3">Where can a conversation lead? Add every destination you use: a call, a VSL, a webinar, a free resource, a community. The AI picks the one that fits where the conversation is going and only ever sends these exact links.</p>
              {f.goals.map((g, i) => {
                const upd = (p: Partial<ConversionGoal>) => set("goals", f.goals.map((x, k) => (k === i ? { ...x, ...p } : x)));
                return (
                  <div key={g.id} className="rounded-lg border border-line p-3 mb-3 grid grid-cols-[190px_1fr_auto] gap-2">
                    <select className="field" value={g.type} onChange={(e) => upd({ type: e.target.value as ConversionGoal["type"] })} aria-label="Goal type">
                      {GOAL_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input className="field" placeholder="Name, for example Strategy call" value={g.label} onChange={(e) => upd({ label: e.target.value })} />
                    <Button variant="ghost" onClick={() => set("goals", f.goals.filter((_, k) => k !== i))}>Remove</Button>
                    <input className="field col-span-3" placeholder="https:// link" value={g.url} onChange={(e) => upd({ url: e.target.value })} />
                    <input className="field col-span-3" placeholder="When should the AI send this one?" value={g.when} onChange={(e) => upd({ when: e.target.value })} />
                  </div>
                );
              })}
              <Button onClick={() => set("goals", [...f.goals, { id: "g" + Date.now(), type: "call", label: "", url: "", when: "" }])}>Add destination</Button>
              <div className="mt-5">{T("Business model breakdown message", "breakdownMessage", 4, "The message you send to explain how it works before the link. Write it how you would type it. Sending it moves the lead to Business model sent.")}</div>
              {deeper(3)}
            </>}

            {step === 4 && <>
              {T("How you write in DMs", "voiceNotes", 3, "Optional. Once your inbox is analysed the AI learns this from your real messages.")}
              {T("About me and my story", "aboutMe", 4, "Facts the AI may share as you to relate to a lead, one line at a time, for example how you started or what you were doing before. It shares nothing personal that is not here.")}
              {T("Slang you are happy to use", "slang", 1, "Optional, comma separated, for example: mate, tbh, ngl. The AI uses one only when the lead texts that casually. Leave empty for none. It never swears.")}
              <label className="block mb-4">
                <span className="font-semibold">Messages before the AI moves toward your offer</span>
                <span className="block text-[12.5px] text-mute mb-1">Until a chat has this many messages (half from the lead) and their situation, goal and what is in the way are clear from their own words, the AI only gets to know them: no offer, no link, no call, no assumptions. A chat quiet for a month starts again. 5 to 10 works for most businesses.</span>
                <input type="number" min={2} max={40} className="field mt-1 w-28" value={f.discoveryMessages ?? 10} onChange={(e) => set("discoveryMessages", Math.max(2, Math.min(40, Number(e.target.value) || 10)))} />
              </label>
              <p className="text-[12.5px] text-mute mb-4">The AI mirrors how each lead texts: short lines in bursts get short lines back, paragraphs get a fuller reply, and it matches their casing, full stops and emoji. The words stay yours.</p>
              {T("Never say", "neverSay", 3, "Topics, promises and phrases that are off limits.")}
              <span className="font-semibold">Who is the AI speaking as?</span>
              <div className="grid grid-cols-3 gap-2 mt-2 mb-4">
                {([["owner", "As you", "First person, as if you typed it."], ["team", "As your team", "Same voice, speaks as part of the team."], ["assistant", "As your assistant", "Openly an assistant."]] as const).map(([v, t, d]) => (
                  <button key={v} onClick={() => set("identity", v)} className={`text-left rounded-lg border p-3 ${f.identity === v ? "border-brand bg-brandsoft" : "border-line"}`}>
                    <div className="font-semibold">{t}</div><div className="text-[12.5px] text-mute">{d}</div>
                  </button>
                ))}
              </div>
              <label className="block">
                <span className="font-semibold">AI disclosure message</span>
                <span className="block text-[12.5px] text-mute mb-1">Sent once, before the AI&apos;s first automatic message in a thread. Laws in the EU and California require telling people when they are talking to an AI, so clear this only on legal advice. Whatever you choose, the AI never denies being an AI.</span>
                <textarea className="field" rows={2} value={disclosure} onChange={(e) => setDisclosure(e.target.value)} />
              </label>
              {deeper(4)}
            </>}

            {step === 5 && <>
              <p className="text-mute">Anything that did not fit in the other parts. Upload whole documents, paste scripts, or write your own questions and answers. It all becomes part of what the AI knows.</p>
              {deeper(5)}
            </>}

            {step === CONNECT && <>
              <h3 className="font-semibold mb-1">Connect Instagram</h3>
              <p className="text-mute mb-2">Uses Meta&apos;s official login. Lets the app receive new messages as they arrive and send replies.</p>
              {state.workspace.meta.instagram
                ? <Banner tone="ok">Connected as @{state.workspace.meta.instagram.username}.</Banner>
                : <Banner tone="info">Connect it in <a className="font-semibold underline" href="/settings">Settings, Meta connection</a>. It takes one token from your Meta app. You can finish the brief first and explore with the demo inbox.</Banner>}

              <h3 className="font-semibold mt-6 mb-1">Import your full message history</h3>
              <p className="text-mute mb-2">Meta&apos;s API only returns the 20 most recent messages in each conversation. Your own data export has everything, so this is how the AI learns your voice and your leads&apos; objections and questions in depth.</p>
              <ImportHistory onDone={reload} />

              <h3 className="font-semibold mt-6 mb-1">Chrome extension</h3>
              <p className="text-mute">Reads full threads straight from your open inbox, shows suggested replies beside the chat, and applies your stage and labels inside Meta Business Suite. Set it up from Settings.</p>
            </>}

            {step === REVIEW && <>
              {missing.length > 0 ? <Banner tone="warn">Still missing: {missing.join(", ")}. The AI will work without them, but worse.</Banner> : <Banner tone="ok">The brief is complete.</Banner>}
              <ul className="mt-4 space-y-1.5 text-[13.5px]">
                <li>Brain: {brain && brain.chars > 0 ? `about ${brainWords.toLocaleString()} words across ${BRAIN_STEP.filter((k) => Object.keys(brain.sections[k].answers).length || brain.sections[k].custom.length || brain.sections[k].docs.length).length} of 6 parts, ${BRAIN_STEP.reduce((n, k) => n + brain.sections[k].docs.length, 0)} documents` : "nothing added beyond the short fields yet"}.</li>
                <li><b>{threads}</b> conversations in the inbox{state.flags.demoData ? " (demo data)" : ""}.</li>
                <li>Playbook: {state.workspace.playbook ? `built from ${state.workspace.playbook.conversationsAnalysed} conversations` : "not built yet"}.</li>
                <li>Instagram: {state.workspace.meta.instagram ? `connected as @${state.workspace.meta.instagram.username}` : "not connected"}.</li>
                <li>AI engine: {state.flags.ai ? "Claude" : "demo engine (no Anthropic key set)"}.</li>
              </ul>
              {msg && <div className="mt-3"><Banner tone="error">{msg}</Banner></div>}
              <div className="flex gap-2 mt-5">
                <Button disabled={!!busy || threads === 0} onClick={async () => { setBusy("pb"); setMsg(""); try { await save(); await api("/api/playbook", "POST"); await reload(); } catch (e) { setMsg((e as Error).message); } setBusy(""); }}>
                  {busy === "pb" ? "Analysing inbox…" : state.workspace.playbook ? "Re-analyse inbox" : "Analyse inbox"}
                </Button>
                <Button variant="primary" disabled={!!busy} onClick={async () => { setBusy("fin"); try { await save(); await api("/api/workspace", "PUT", { onboardingComplete: true }); router.push("/inbox"); } catch { setBusy(""); } }}>Finish and open inbox</Button>
              </div>
            </>}
          </div>

          {saveError && <div className="mt-3"><Banner tone="error">Not saved: {saveError}</Banner></div>}
          <div className="flex justify-between mt-4">
            <Button disabled={step === 0} onClick={() => go(step - 1)}>Back</Button>
            {step < STEPS.length - 1 && <Button variant="primary" onClick={() => go(step + 1)}>Save and continue</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}
