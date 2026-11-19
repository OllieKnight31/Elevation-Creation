"use client";
import { useEffect, useRef, useState } from "react";

// Speech to text for a text box, using the browser's own speech recognition (Chrome, Edge, Safari).
// Nothing is installed and nothing goes through this app's server: the browser turns the speech into text.
type Rec = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start(): void; stop(): void;
};
const recCtor = () => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Only one box listens at a time: starting another stops this one. */
let stopActive: (() => void) | null = null;

const join = (a: string, b: string) => (!b ? a : !a.trim() ? b : a.replace(/\s+$/, "") + " " + b);
const tidy = (s: string) => { const t = s.trim(); return t ? t[0].toUpperCase() + t.slice(1) : ""; };

export function Speak({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState("");
  const rec = useRef<Rec | null>(null);
  const wanted = useRef(false);
  const base = useRef("");
  const change = useRef(onChange);
  const current = useRef(value);
  change.current = onChange;
  current.current = value;

  useEffect(() => { setSupported(!!recCtor()); return () => { wanted.current = false; rec.current?.stop(); }; }, []);
  if (!supported) return null;

  const stop = () => { wanted.current = false; rec.current?.stop(); setOn(false); if (stopActive === stop) stopActive = null; };

  const begin = () => {
    const C = recCtor();
    if (!C) return;
    const r = new C();
    r.lang = navigator.language || "en-GB";
    r.continuous = true;
    r.interimResults = true;
    base.current = current.current;
    r.onresult = (e) => {
      let done = "", live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) done += t; else live += t;
      }
      if (done) base.current = join(base.current, tidy(done));
      change.current(join(base.current, live.trim()));
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      wanted.current = false;
      setErr(e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Microphone is blocked. Allow it for this site in the browser's address bar, then try again."
        : e.error === "audio-capture" ? "No microphone found." : "Speech did not work (" + e.error + "). Try again.");
    };
    // Browsers end a session after a pause; carry on until the person presses stop.
    r.onend = () => { if (wanted.current) { try { begin(); } catch { stop(); } } else setOn(false); };
    rec.current = r;
    r.start();
  };

  const toggle = () => {
    if (on) return stop();
    stopActive?.();
    setErr("");
    wanted.current = true;
    try { begin(); setOn(true); stopActive = stop; } catch { wanted.current = false; setErr("Speech did not start. Try again."); }
  };

  return (
    <span className="flex items-center gap-2 mt-1">
      <button type="button" onClick={toggle} aria-pressed={on}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12.5px] ${on ? "border-red-500 text-red-600" : "border-line text-mute hover:text-ink"}`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v4" />
        </svg>
        {on ? "Listening, press to stop" : "Speak your answer"}
      </button>
      {on && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />}
      {err && <span className="text-[12.5px] text-red-600">{err}</span>}
    </span>
  );
}
