"use client";
import { useEffect, useState } from "react";
import { api, Button, timeAgo, Toggle } from "@/components/ui";
import { Field, Row, Section, type TabProps } from "./parts";

export default function SheetsTab({ state, reload, note }: TabProps) {
  const s = state.workspace.sheets;
  const [script, setScript] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { api<{ script: string }>("/api/sheets").then((r) => setScript(r.script)).catch(() => {}); }, []);
  if (!s) return null;
  const run = async (label: string, fn: () => Promise<void>) => { setBusy(label); try { await fn(); } catch (e) { note((e as Error).message, "error"); } setBusy(""); await reload(); };
  const set = (body: Record<string, unknown>) => run("set", async () => { await api("/api/sheets", "POST", { action: "settings", ...body }); });
  const copy = async () => { await navigator.clipboard.writeText(script); setCopied(true); setTimeout(() => setCopied(false), 2500); };

  return (
    <>
      <Section title="Google Sheets archive" sub="Every lead, message and stage change is copied into a Google Sheet in your own Google account. Old messages then leave the database, so the free database never fills. When a tab reaches 50,000 rows a new tab starts, and a new spreadsheet file starts before Google's 10 million cell limit.">
        {s.url ? (
          <>
            <Row title="Archive to Google Sheets" sub={s.lastError ? `Last send failed: ${s.lastError}` : s.lastSyncAt ? `Last sent ${timeAgo(s.lastSyncAt)} ago. ${s.sent.toLocaleString()} rows sent so far.` : "Connected. Nothing sent yet."}>
              <Toggle label="Archive to Google Sheets" on={s.enabled} onChange={(v) => set({ enabled: v })} />
            </Row>
            {s.files.length > 0 && (
              <Row title="Your spreadsheets" sub="Leads are in the first file. Messages and events carry on in the newest.">
                <div className="flex flex-col items-end gap-1">
                  {s.files.map((f) => <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="text-[13px] font-medium underline">{f.name}</a>)}
                </div>
              </Row>
            )}
            <Row title="Send now" sub="New things go across a few seconds after they happen, and again every night. This sends anything still waiting.">
              <Button disabled={busy === "sync"} onClick={() => run("sync", async () => { const r = await api<{ sent: number }>("/api/sheets", "POST", { action: "sync" }); note(r.sent ? `${r.sent.toLocaleString()} rows sent to Google Sheets.` : "Everything is already in the sheet.", "ok"); })}>{busy === "sync" ? "Sending…" : "Send now"}</Button>
            </Row>
          </>
        ) : (
          <div className="p-4">
            <ol className="list-decimal pl-5 text-[13px] space-y-2">
              <li>
                Copy the archive script. It holds a secret only your sheet knows.
                <div className="mt-1.5"><Button variant="primary" disabled={!script} onClick={copy}>{copied ? "Copied" : "Copy the script"}</Button></div>
              </li>
              <li>Open <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer" className="underline font-medium">script.google.com, new project</a>, signed in to the Google account that should own the sheets.</li>
              <li>Select everything in the editor, paste the script over it, and press Save.</li>
              <li>Press <b>Deploy</b>, then <b>New deployment</b>. Click the cog next to &quot;Select type&quot; and pick <b>Web app</b>.</li>
              <li>Set <b>Execute as</b> to Me and <b>Who has access</b> to Anyone, then press Deploy. Allow access when Google asks (on &quot;Google hasn&apos;t verified this app&quot; press Advanced, then Go to the project; it is your own script).</li>
              <li>Copy the <b>Web app URL</b> and paste it below.</li>
            </ol>
            <div className="flex gap-2 mt-3">
              <input className="field" placeholder="https://script.google.com/macros/s/…/exec" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Apps Script web app URL" />
              <Button variant="primary" disabled={!url.trim() || busy === "connect"} onClick={() => run("connect", async () => { const r = await api<{ sent: number }>("/api/sheets", "POST", { action: "connect", url }); setUrl(""); note(`Connected. ${r.sent.toLocaleString()} rows sent to your new spreadsheet.`, "ok"); })}>{busy === "connect" ? "Connecting…" : "Connect"}</Button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Keeping the database small" sub="Messages only leave the database once they are safely in the sheet. Insights keep counting them.">
        <Row title="Move messages out after" sub="Days. Set 0 to keep every message in the database as well.">
          <input type="number" min={0} max={3650} className="field !w-24" defaultValue={s.keepDays} onBlur={(e) => Number(e.target.value) !== s.keepDays && set({ keepDays: e.target.value })} aria-label="Days before messages move to the archive" />
        </Row>
        <Row title="Always keep the newest" sub="Messages per conversation that stay whatever their age, so the AI still knows the thread.">
          <input type="number" min={5} max={500} className="field !w-24" defaultValue={s.keepPerThread} onBlur={(e) => Number(e.target.value) !== s.keepPerThread && set({ keepPerThread: e.target.value })} aria-label="Messages always kept per conversation" />
        </Row>
        <Row title="Tidy up now" sub={s.lastPruneAt ? `Runs every night. Last run ${timeAgo(s.lastPruneAt)} ago, ${s.pruned.toLocaleString()} messages moved out in total.` : "Runs every night once connected."}>
          <Button disabled={!s.enabled || busy === "prune"} onClick={() => run("prune", async () => { const r = await api<{ pruned: number }>("/api/sheets", "POST", { action: "prune" }); note(r.pruned ? `${r.pruned.toLocaleString()} old messages moved out of the database.` : "Nothing old enough to move yet.", "ok"); })}>{busy === "prune" ? "Working…" : "Tidy up now"}</Button>
        </Row>
      </Section>

      {s.url && (
        <Section title="Change the sheet">
          <Field label="Updated the script or deployed it again?" hint="Paste the new web app address and press Connect. Rows already sent are not sent twice." className="p-4">
            <div className="flex gap-2">
              <input className="field" placeholder="https://script.google.com/macros/s/…/exec" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="New Apps Script web app URL" />
              <Button disabled={!url.trim() || busy === "connect"} onClick={() => run("connect", async () => { await api("/api/sheets", "POST", { action: "connect", url }); setUrl(""); note("Connected to the new address.", "ok"); })}>Connect</Button>
              <Button variant="ghost" disabled={!script} onClick={copy}>{copied ? "Copied" : "Copy the script"}</Button>
              <Button variant="danger" onClick={() => { if (confirm("Stop archiving? The spreadsheets stay in your Google Drive.")) run("off", async () => { await api("/api/sheets", "POST", { action: "disconnect" }); }); }}>Disconnect</Button>
            </div>
          </Field>
        </Section>
      )}
    </>
  );
}
