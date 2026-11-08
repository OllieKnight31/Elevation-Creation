"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/ui";

interface Guide { id: string; title: string; summary: string; group: string; screen: string; seconds: number; chapters: { at: number; title: string }[] }

const mins = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const WATCHED = "setter.guides.watched";

/** Short narrated videos for every part of the tool. Built by scripts/build-videos.mjs from the real screens. */
export default function LearnPage() {
  const [guides, setGuides] = useState<Guide[] | null>(null);
  const [id, setId] = useState("");
  const [watched, setWatched] = useState<string[]>([]);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    fetch("/videos/index.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []).then((list: Guide[]) => {
      setGuides(list);
      const want = new URLSearchParams(window.location.search).get("m");
      setId(list.find((g) => g.id === want)?.id ?? list[0]?.id ?? "");
    });
    try { setWatched(JSON.parse(localStorage.getItem(WATCHED) ?? "[]")); } catch { /* first visit */ }
  }, []);

  if (!guides) return <div className="p-8 text-mute">Loading the video guides…</div>;
  if (!guides.length) return <div className="p-8 text-mute">The video guides have not been built yet. Run <code>npm run videos</code> in the project folder.</div>;

  const g = guides.find((x) => x.id === id) ?? guides[0];
  const at = guides.indexOf(g);
  const next = guides[at + 1];
  const pick = (gid: string) => { setId(gid); window.history.replaceState(null, "", `/learn?m=${gid}`); };
  const done = () => { const list = [...new Set([...watched, g.id])]; setWatched(list); try { localStorage.setItem(WATCHED, JSON.stringify(list)); } catch { /* private window */ } };
  const groups = [...new Set(guides.map((x) => x.group))];
  const total = guides.reduce((n, x) => n + x.seconds, 0);

  return (
    <div className="h-full overflow-y-auto scroll p-6">
      <PageHeader title="Video guides" sub={`${guides.length} short videos, ${Math.round(total / 60)} minutes in all. Watch them in order the first time, then come back to any one when you need it.`} />
      <div className="flex gap-5 items-start max-[1100px]:flex-col">
        <nav className="w-[320px] shrink-0 max-[1100px]:w-full space-y-4" aria-label="Video guides">
          {groups.map((grp) => (
            <div key={grp}>
              <div className="label mb-1.5">{grp}</div>
              <ul className="space-y-1.5">
                {guides.filter((x) => x.group === grp).map((x) => (
                  <li key={x.id}>
                    <button onClick={() => pick(x.id)} aria-current={x.id === g.id} className={`w-full text-left card !rounded-[12px] p-2.5 flex gap-3 items-center hover:border-ink ${x.id === g.id ? "!border-ink" : ""}`}>
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0 ${watched.includes(x.id) ? "tone-ok" : "bg-surface2"}`}>{watched.includes(x.id) ? "✓" : guides.indexOf(x) + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-[13.5px] leading-snug">{x.title}</span>
                        <span className="block text-[12px] text-mute">{mins(x.seconds)} min</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex-1 min-w-0 max-w-[1100px]">
          <video ref={video} key={g.id} className="w-full rounded-[14px] border border-line bg-black aspect-video" controls preload="metadata" poster={`/videos/${g.id}.jpg`} onEnded={done}>
            <source src={`/videos/${g.id}.mp4`} type="video/mp4" />
            <track kind="captions" src={`/videos/${g.id}.vtt`} srcLang="en" label="English" default />
          </video>
          <div className="flex items-start gap-4 mt-4">
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-[18px]">{at + 1}. {g.title}</h2>
              <p className="text-mute text-[14px] mt-0.5">{g.summary}</p>
            </div>
            {g.screen && <Link href={g.screen} className="inline-flex items-center justify-center rounded-[10px] bg-ink text-onbrand px-3 h-9 text-[13px] font-medium hover:opacity-85 whitespace-nowrap">Open this screen</Link>}
            {next && <button onClick={() => pick(next.id)} className="inline-flex items-center justify-center rounded-[10px] border border-linestrong bg-surface px-3 h-9 text-[13px] font-medium hover:border-ink whitespace-nowrap">Next video</button>}
          </div>
          <div className="card p-4 mt-4">
            <div className="label mb-2">In this video. Click a line to jump to it</div>
            <ol className="grid grid-cols-2 max-[800px]:grid-cols-1 gap-x-6 gap-y-1">
              {g.chapters.map((c, i) => (
                <li key={i}>
                  <button className="w-full text-left flex gap-3 text-[13.5px] py-1 hover:underline" onClick={() => { const v = video.current; if (!v) return; v.currentTime = c.at + 0.05; v.play().catch(() => {}); }}>
                    <span className="text-mute tabular-nums w-9 shrink-0">{mins(c.at)}</span>
                    <span>{c.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
