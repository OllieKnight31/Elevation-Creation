"use client";
import { useEffect, useRef, useState } from "react";
import { api, Button } from "./ui";

/**
 * The walkthrough shown the first time someone is in the app. Closing it or watching to the end records it,
 * so it does not come back; "Later" only hides it for this browser session. It is always in Video guides too.
 */
export default function WelcomeVideo({ onDone }: { onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/videos/welcome.mp4", { method: "HEAD" }).then((r) => setReady(r.ok)).catch(() => setReady(false));
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const finish = () => {
    api("/api/me", "POST", { action: "welcome-seen" }).catch(() => {});
    onDone();
  };
  const later = () => {
    try { sessionStorage.setItem("setter:welcome-later", "1"); } catch {}
    onDone();
  };

  if (ready === false) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="bg-surface rounded-[18px] border border-line shadow-2xl w-full max-w-[960px] max-h-full overflow-auto">
        <div className="px-5 pt-5 pb-3">
          <div className="label">Start here</div>
          <h2 id="welcome-title" className="display text-[26px] leading-tight mt-1">Welcome. Here is exactly how it works.</h2>
          <p className="text-mute text-[14px] mt-1">A few minutes, start to finish. You can watch it again any time from Video guides in the menu.</p>
        </div>
        <div className="px-5">
          <video ref={video} className="w-full rounded-[12px] border border-line bg-black aspect-video" controls autoPlay playsInline preload="auto" poster="/videos/welcome.jpg" onEnded={finish}>
            <source src="/videos/welcome.mp4" type="video/mp4" />
            <track kind="captions" src="/videos/welcome.vtt" srcLang="en" label="English" default />
          </video>
        </div>
        <div className="px-5 py-4 flex items-center justify-end gap-2">
          <Button onClick={later}>Watch later</Button>
          <Button variant="primary" onClick={finish}>I have seen it, close</Button>
        </div>
      </div>
    </div>
  );
}
