"use client";
import { useRef, useState } from "react";
import { api, Banner, Button } from "./ui";

type Thread = { title?: string; thread_path?: string; participants?: { name: string }[]; messages?: unknown[] };

/** Reads the user's own Meta data export in the browser and uploads only the DM text. Photos and videos never leave the machine. */
export default function ImportHistory({ onDone }: { onDone?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [platform, setPlatform] = useState<"instagram" | "messenger">("instagram");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const run = async (files: FileList) => {
    setResult(null);
    const picked = [...files].filter((f) => /messages\/(inbox|message_requests|archived_threads)\/[^/]+\/message_\d+\.json$/.test(f.webkitRelativePath || f.name));
    if (!picked.length) {
      setResult({ tone: "error", text: "No message files found. Choose the unzipped export folder, and make sure the export was requested in JSON format." });
      return;
    }
    try {
      const threads: Thread[] = [];
      for (let i = 0; i < picked.length; i++) {
        if (i % 25 === 0) setStatus(`Reading ${i + 1} of ${picked.length} files…`);
        threads.push(JSON.parse(await picked[i].text()));
      }
      const { ownerName } = await api<{ ownerName: string }>("/api/import", "PUT", { threads: threads.map((t) => ({ participants: t.participants })) });
      let conversations = 0, added = 0, groups = 0;
      for (let i = 0; i < threads.length; i += 30) {
        setStatus(`Uploading ${Math.min(i + 30, threads.length)} of ${threads.length} threads…`);
        const r = await api<{ conversations: number; added: number; skippedGroups: number }>("/api/import", "POST", { threads: threads.slice(i, i + 30), platform, ownerName });
        conversations += r.conversations; added += r.added; groups += r.skippedGroups;
      }
      setResult({ tone: "ok", text: `Imported ${added} messages across ${conversations} thread files as "${ownerName}".${groups ? ` Skipped ${groups} group chats.` : ""}` });
      onDone?.();
    } catch (e) {
      setResult({ tone: "error", text: (e as Error).message });
    } finally {
      setStatus("");
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div>
      <ol className="list-decimal pl-5 text-[13px] text-mute space-y-1 mb-3">
        <li>In Instagram: Settings, Accounts Centre, Your information and permissions, Download your information.</li>
        <li>Choose Messages only, format JSON, date range All time. Meta emails you a zip, usually within the hour.</li>
        <li>Unzip it and choose the folder below. Only message text is uploaded.</li>
      </ol>
      <div className="flex items-center gap-2">
        <select className="field !w-auto" value={platform} onChange={(e) => setPlatform(e.target.value as "instagram" | "messenger")} aria-label="Export source">
          <option value="instagram">Instagram export</option>
          <option value="messenger">Facebook Messenger export</option>
        </select>
        <Button variant="primary" disabled={!!status} onClick={() => input.current?.click()}>{status || "Choose export folder"}</Button>
        {/* @ts-expect-error webkitdirectory is not in the React input types */}
        <input ref={input} type="file" className="hidden" webkitdirectory="" multiple onChange={(e) => e.target.files && run(e.target.files)} />
      </div>
      {result && <div className="mt-3"><Banner tone={result.tone}>{result.text}</Banner></div>}
    </div>
  );
}
