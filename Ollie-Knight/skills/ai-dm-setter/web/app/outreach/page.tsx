"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CommentTrigger, EntryLink, OutreachCampaign, OutreachLogItem, OutreachSettings, Prospect, ProspectList } from "@/lib/types";
import { api, Banner, Button, every, PageHeader, timeAgo, Toggle } from "@/components/ui";
import { Field, Row, Section } from "@/components/settings/parts";

interface Stat { id: string; sent: number; replied: number; booked: number; queued: number; failed: number; variants: { id: string; sent: number; replied: number; booked: number }[] }
interface View {
  settings: OutreachSettings;
  status: { enabled: boolean; mode: string; paused: boolean; pauseReason: string; sentToday: number; capToday: number; inWindow: boolean; nextAt: string | null };
  cap: { min: number; max: number; ramp: number | null };
  lists: (ProspectList & { counts: Record<string, number> })[];
  campaigns: OutreachCampaign[];
  stats: Stat[];
  log: OutreachLogItem[];
  links: EntryLink[];
  commentTriggers: CommentTrigger[];
  igUsername: string;
  limits: { hardMax: number; minPerCampaign: number; maxPerCampaign: number; privateReplyPerHour: number };
}

const TABS = [["overview", "Overview"], ["campaigns", "Campaigns"], ["prospects", "Prospects"], ["starters", "Conversation starters"], ["sending", "Sending and typing"]] as const;
type Tab = (typeof TABS)[number][0];
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");
const STATUS_WORDS: Record<string, string> = { sent: "Sent", typed: "Typed, waiting for you to press send", unreachable: "Cannot be messaged", not_found: "Profile not found", blocked: "Instagram warning", error: "Failed", skipped: "Skipped", queued: "Waiting", sending: "Sending now", failed: "Failed" };

export default function OutreachPage() {
  return <Suspense><Outreach /></Suspense>;
}

function Outreach() {
  const q = useSearchParams();
  const [v, setV] = useState<View | null>(null);
  const [tab, setTabState] = useState<Tab>((TABS.find(([t]) => t === q.get("tab"))?.[0] ?? "overview") as Tab);
  const [note, setNote] = useState<{ text: string; tone: "ok" | "error" | "info" } | null>(null);
  const setTab = (t: Tab) => { setTabState(t); setNote(null); window.history.replaceState(null, "", `/outreach?tab=${t}`); };
  const load = useCallback(() => api<View>("/api/outreach").then(setV).catch((e) => setNote({ text: (e as Error).message, tone: "error" })), []);
  useEffect(() => { load(); return every(load, 10000); }, [load]);
  const act = async <T = View,>(body: Record<string, unknown>, ok?: string): Promise<(T & View) | null> => {
    try {
      const r = await api<T & View>("/api/outreach", "POST", body);
      setV(r);
      setNote(ok ? { text: ok, tone: "ok" } : null);
      return r;
    } catch (e) {
      setNote({ text: (e as Error).message, tone: "error" });
      return null;
    }
  };
  if (!v) return <div className="p-8 text-mute">{note?.tone === "error" ? note.text : "Loading outreach…"}</div>;
  const props = { v, act, setTab, say: (text: string) => setNote({ text, tone: "ok" as const }) };

  return (
    <div className="h-full overflow-y-auto scroll p-6">
      <div className="max-w-[1040px]">
        <PageHeader title="Outreach" sub="Start conversations with people who have not messaged you yet." />
        <div className="flex flex-wrap gap-1 mb-5 border-b border-line" role="tablist" aria-label="Outreach sections">
          {TABS.map(([t, l]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-3 py-2 text-[13.5px] font-medium border-b-2 -mb-px ${tab === t ? "border-ink text-ink" : "border-transparent text-mute hover:text-ink"}`}>{l}</button>
          ))}
        </div>
        {v.status.paused && (
          <div className="mb-4"><Banner tone="error"><div className="flex items-center justify-between gap-4"><span><b>Sending is paused.</b> {v.status.pauseReason}</span><Button onClick={() => act({ action: "resume" }, "Sending resumed.")}>Resume</Button></div></Banner></div>
        )}
        {note && <div className="mb-4"><Banner tone={note.tone}>{note.text}</Banner></div>}
        {tab === "overview" && <Overview {...props} />}
        {tab === "campaigns" && <Campaigns {...props} />}
        {tab === "prospects" && <Prospects {...props} />}
        {tab === "starters" && <Starters {...props} />}
        {tab === "sending" && <Sending {...props} />}
      </div>
    </div>
  );
}

interface P { v: View; act: <T = View>(body: Record<string, unknown>, ok?: string) => Promise<(T & View) | null>; setTab: (t: Tab) => void; say: (text: string) => void }

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return <div className="card p-4"><div className="label">{label}</div><div className="text-[26px] font-semibold leading-tight mt-1">{value}</div>{sub && <div className="text-[12.5px] text-mute mt-0.5">{sub}</div>}</div>;
}

function Overview({ v, act, setTab }: P) {
  const s = v.status;
  const waiting = v.stats.reduce((n, c) => n + (v.campaigns.find((x) => x.id === c.id)?.status === "active" ? c.queued : 0), 0);
  const sent = v.stats.reduce((n, c) => n + c.sent, 0), replied = v.stats.reduce((n, c) => n + c.replied, 0), booked = v.stats.reduce((n, c) => n + c.booked, 0);
  const state = !s.enabled ? "Off" : s.paused ? "Paused" : !waiting ? "Nothing to send" : !s.inWindow ? "Outside sending hours" : s.sentToday >= s.capToday ? "Done for today" : "Sending";
  const nextIn = s.nextAt ? Math.round((new Date(s.nextAt).getTime() - Date.now()) / 60000) : null;
  return (
    <>
      <Section title="Today" action={<div className="flex items-center gap-2 text-[13px]"><span className="text-mute">Outreach sending</span><Toggle label="Outreach sending" on={s.enabled} onChange={(on) => act({ action: "settings", settings: { enabled: on } })} /></div>}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3">
          <Tile label="Status" value={state} sub={s.enabled && !s.paused && s.inWindow && waiting && s.sentToday < s.capToday ? (nextIn !== null && nextIn > 0 ? `Next message in about ${nextIn} min` : "Next message when the extension checks in") : v.settings.mode === "auto" ? "The extension presses send" : "You press send"} />
          <Tile label="Sent today" value={`${s.sentToday} of ${s.capToday}`} sub={v.cap.ramp ? `Building up: the limit rises by ${v.settings.rampStep} each sending day` : v.settings.dailyMin === v.settings.dailyMax ? `${v.settings.dailyMax} a day` : `A different number each day, ${v.settings.dailyMin} to ${v.settings.dailyMax}`} />
          <Tile label="Waiting to be messaged" value={waiting} sub={waiting ? ((d) => `About ${d} sending ${d === 1 ? "day" : "days"}`)(Math.ceil(waiting / Math.max(1, v.settings.dailyMax))) : "Add prospects and start a campaign"} />
          <Tile label="Replied" value={`${replied} of ${sent}`} sub={`${pct(replied, sent)} reply rate, ${booked} booked`} />
        </div>
      </Section>
      {!v.campaigns.length && <div className="mb-6"><Banner>Three steps to start: add a list under <button className="underline" onClick={() => setTab("prospects")}>Prospects</button>, write a campaign with at least {v.limits.minPerCampaign} versions of the message under <button className="underline" onClick={() => setTab("campaigns")}>Campaigns</button>, then switch on Outreach sending here and in the Chrome extension.</Banner></div>}
      <Section title="Results by campaign" sub="A reply is counted when the person shows up in your inbox after the message went out.">
        {v.campaigns.length ? (
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-mute border-b border-line"><th className="p-3 font-medium">Campaign</th><th className="p-3 font-medium">Waiting</th><th className="p-3 font-medium">Sent</th><th className="p-3 font-medium">Replied</th><th className="p-3 font-medium">Booked</th><th className="p-3 font-medium">Could not send</th></tr></thead>
            <tbody>
              {v.campaigns.map((c) => {
                const st = v.stats.find((x) => x.id === c.id)!;
                return (
                  <tr key={c.id} className="border-b border-line last:border-b-0">
                    <td className="p-3 font-medium">{c.name} <span className="text-mute font-normal">({c.status})</span></td>
                    <td className="p-3">{st.queued}</td><td className="p-3">{st.sent}</td><td className="p-3">{st.replied} <span className="text-mute">{pct(st.replied, st.sent)}</span></td><td className="p-3">{st.booked}</td><td className="p-3">{st.failed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="p-4 text-mute text-[13px]">No campaigns yet.</div>}
      </Section>
      <Section title="Recent activity">
        {v.log.length ? (
          <div className="max-h-[320px] overflow-y-auto scroll">
            {v.log.map((l, i) => (
              <div key={i} className="flex items-baseline gap-3 px-4 py-2 border-b border-line last:border-b-0 text-[13px]">
                <span className="w-20 shrink-0 text-mute">{timeAgo(l.at)}</span>
                <span className="w-40 shrink-0 font-medium truncate">@{l.handle}</span>
                <span className={l.status === "sent" || l.status === "typed" ? "text-ok" : l.status === "blocked" || l.status === "error" ? "text-err" : "text-mute"}>{STATUS_WORDS[l.status] ?? l.status}</span>
                <span className="text-mute truncate">{l.typedMs ? `typed in ${Math.round(l.typedMs / 1000)}s${l.typos ? `, ${l.typos} slips fixed` : ""}` : l.detail}</span>
              </div>
            ))}
          </div>
        ) : <div className="p-4 text-mute text-[13px]">Nothing sent yet.</div>}
      </Section>
    </>
  );
}

function Campaigns({ v, act }: P) {
  const blank = (): OutreachCampaign => ({ id: "", name: "", listIds: [], variants: [{ id: "n1", text: "hey {first_name|there}, " }], status: "draft", createdAt: "" });
  const [cur, setCur] = useState<OutreachCampaign | null>(null);
  const [preview, setPreview] = useState<{ text: string; missing: string[]; sample: string } | null>(null);
  const stat = cur ? v.stats.find((s) => s.id === cur.id) : undefined;
  const save = async (status?: OutreachCampaign["status"]) => {
    if (!cur) return;
    const r = await act<{ campaign: OutreachCampaign }>({ action: "campaign.save", campaign: { ...cur, id: cur.id || undefined, status: status ?? cur.status } }, status === "active" ? "Campaign started." : "Campaign saved.");
    if (r) setCur(r.campaign);
  };
  const setVariant = (i: number, text: string) => cur && setCur({ ...cur, variants: cur.variants.map((x, j) => (j === i ? { ...x, text } : x)) });
  const show = async (text: string) => {
    const r = await act<{ preview: { text: string; missing: string[] }; sample: string }>({ action: "preview", text, listIds: cur?.listIds ?? [] });
    if (r) setPreview({ ...r.preview, sample: r.sample });
  };
  if (!cur) {
    return (
      <Section title="Campaigns" sub="A campaign sends one opening message to everyone on its lists, rotating through your versions of it." action={<Button variant="primary" onClick={() => setCur(blank())}>New campaign</Button>}>
        {v.campaigns.length ? v.campaigns.map((c) => {
          const st = v.stats.find((s) => s.id === c.id)!;
          return (
            <Row key={c.id} title={c.name} sub={`${c.variants.length} versions, ${st.queued} waiting, ${st.sent} sent, ${st.replied} replied`}>
              <div className="flex items-center gap-2">
                <span className={`text-[12.5px] font-semibold ${c.status === "active" ? "text-ok" : "text-mute"}`}>{c.status === "active" ? "Running" : c.status === "paused" ? "Paused" : "Draft"}</span>
                <Button onClick={() => { setCur(c); setPreview(null); }}>Open</Button>
              </div>
            </Row>
          );
        }) : <div className="p-4 text-mute text-[13px]">No campaigns yet.</div>}
      </Section>
    );
  }
  const enough = cur.variants.filter((x) => x.text.trim()).length >= v.limits.minPerCampaign;
  return (
    <>
      <div className="mb-3"><Button variant="ghost" onClick={() => setCur(null)}>Back to campaigns</Button></div>
      <Section title={cur.id ? cur.name || "Campaign" : "New campaign"} action={
        <div className="flex gap-2">
          {cur.id && <Button variant="danger" onClick={async () => { if (window.confirm("Delete this campaign? Its results go with it.")) { await act({ action: "campaign.delete", id: cur.id }); setCur(null); } }}>Delete</Button>}
          <Button onClick={() => save()}>Save</Button>
          {cur.status === "active" ? <Button onClick={() => save("paused")}>Pause campaign</Button> : <Button variant="primary" onClick={() => save("active")}>{cur.status === "paused" ? "Resume campaign" : "Start campaign"}</Button>}
        </div>
      }>
        <div className="p-4 grid gap-4">
          <Field label="Name"><input className="field" value={cur.name} onChange={(e) => setCur({ ...cur, name: e.target.value })} placeholder="Gym owners, October" /></Field>
          <Field label="Prospect lists" hint="Everyone waiting on these lists gets one message.">
            {v.lists.length ? (
              <div className="flex flex-wrap gap-2">
                {v.lists.map((l) => {
                  const on = cur.listIds.includes(l.id);
                  return <button key={l.id} type="button" aria-pressed={on} onClick={() => setCur({ ...cur, listIds: on ? cur.listIds.filter((x) => x !== l.id) : [...cur.listIds, l.id] })} className={`rounded-full border px-3 h-8 text-[13px] ${on ? "bg-ink text-onbrand border-transparent" : "border-linestrong"}`}>{l.name} ({l.counts.queued ?? 0} waiting)</button>;
                })}
              </div>
            ) : <span className="text-[13px] text-mute">Add a list under Prospects first.</span>}
          </Field>
        </div>
      </Section>
      <Section title="Message versions" sub={`Write at least ${v.limits.minPerCampaign}. Each prospect gets one, chosen in rotation, so no two people in a row receive the same words and you can see which version earns replies.`} action={<Button disabled={cur.variants.length >= v.limits.maxPerCampaign} onClick={() => setCur({ ...cur, variants: [...cur.variants, { id: "n" + Date.now().toString(36), text: "" }] })}>Add version</Button>}>
        <div className="p-4 grid gap-3">
          {!enough && <Banner tone="warn">{cur.variants.filter((x) => x.text.trim()).length} of {v.limits.minPerCampaign} versions written. The campaign cannot start until there are {v.limits.minPerCampaign}.</Banner>}
          {cur.variants.map((x, i) => {
            const st = stat?.variants.find((s) => s.id === x.id);
            return (
              <div key={x.id} className="rounded-[10px] border border-line p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="label">Version {i + 1}{st && st.sent ? ` · ${st.sent} sent, ${st.replied} replied (${pct(st.replied, st.sent)}), ${st.booked} booked` : ""}</span>
                  <span className="flex gap-1"><Button variant="ghost" onClick={() => show(x.text)}>Preview</Button><Button variant="ghost" disabled={cur.variants.length <= 1} onClick={() => setCur({ ...cur, variants: cur.variants.filter((_, j) => j !== i) })}>Remove</Button></span>
                </div>
                <textarea className="field min-h-[72px]" value={x.text} maxLength={1000} onChange={(e) => setVariant(i, e.target.value)} aria-label={`Version ${i + 1}`} />
              </div>
            );
          })}
          {preview && <div className="rounded-[10px] bg-canvas p-3"><div className="label mb-1">As @{preview.sample} would receive it</div><div className="inline-block rounded-2xl bg-ink text-onbrand px-3 py-1.5 text-[13px] whitespace-pre-wrap">{preview.text || "(empty)"}</div>{preview.missing.length > 0 && <p className="text-[12px] text-warn mt-1">Nothing to fill in for: {preview.missing.join(", ")}. Add a fallback like {"{first_name|there}"}.</p>}</div>}
          <details className="text-[12.5px]">
            <summary className="cursor-pointer font-medium">What can go in a message</summary>
            <ul className="mt-2 grid gap-1 text-ink2">
              <li><code>{"{first_name}"}</code> their first name, when the name on the list looks like a person's. <code>{"{first_name|there}"}</code> says "there" when it does not.</li>
              <li><code>{"{name}"}</code> full name, <code>{"{username}"}</code> their handle, <code>{"{my_name}"}</code> and <code>{"{business}"}</code> from your business brief.</li>
              <li>Any extra column from your import, by its header, for example <code>{"{city}"}</code> or <code>{"{niche|your space}"}</code>.</li>
              <li>Someone who does not follow you receives one text message as a request until they accept, so make the first message stand alone.</li>
            </ul>
          </details>
        </div>
      </Section>
    </>
  );
}

function Prospects({ v, act, say }: P) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [into, setInto] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [rows, setRows] = useState<{ total: number; rows: Prospect[] } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) api<{ total: number; rows: Prospect[] }>(`/api/outreach?list=${open}`).then(setRows); else setRows(null); }, [open, v.lists]);
  const run = async () => {
    const r = await act<{ added: number; duplicates: number; invalid: number; alreadyLeads: number }>({ action: "import", name, text, listId: into || undefined });
    if (r) { setText(""); setName(""); say(`${r.added} added.${r.duplicates ? ` ${r.duplicates} already on a list.` : ""}${r.alreadyLeads ? ` ${r.alreadyLeads} already in your inbox, left out.` : ""}${r.invalid ? ` ${r.invalid} rows had no usable handle.` : ""}`); }
  };
  return (
    <>
      <Section title="Add prospects" sub="Paste handles or profile links, one per line, or a CSV with a header row. A column called username (or a profile link) is required; a name column and any others are kept for the message.">
        <div className="p-4 grid gap-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Add to">
              <select className="field" value={into} onChange={(e) => setInto(e.target.value)} aria-label="List to add to"><option value="">A new list</option>{v.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            </Field>
            {!into && <Field label="New list name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gym owners, London" /></Field>}
          </div>
          <textarea className="field min-h-[140px] font-mono text-[12.5px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={"username,name,city\njordan.smith,Jordan Smith,Leeds\nhttps://www.instagram.com/fitwithsam/,Sam Lee,Bristol"} aria-label="Prospects to import" />
          <div className="flex gap-2">
            <Button variant="primary" disabled={!text.trim()} onClick={run}>Import</Button>
            <Button onClick={() => file.current?.click()}>Choose a CSV file</Button>
            <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); if (!name) setName(f.name.replace(/\.[^.]+$/, "")); } e.target.value = ""; }} />
          </div>
        </div>
      </Section>
      <Section title="Lists" sub="A handle is only ever on one list, and anyone already in your inbox is left out.">
        {v.lists.length ? v.lists.map((l) => (
          <div key={l.id} className="border-b border-line last:border-b-0">
            <Row title={l.name} sub={`${l.counts.total} people: ${l.counts.queued ?? 0} waiting, ${(l.counts.sent ?? 0) + (l.counts.typed ?? 0)} sent, ${(l.counts.unreachable ?? 0) + (l.counts.not_found ?? 0) + (l.counts.failed ?? 0)} could not be sent${l.columns.length ? `. Columns: ${l.columns.join(", ")}` : ""}`}>
              <div className="flex gap-2">
                {(l.counts.failed ?? 0) > 0 && <Button onClick={() => act({ action: "list.requeue", id: l.id }, "Failed sends are waiting again.")}>Retry failed</Button>}
                <Button onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? "Hide" : "View"}</Button>
                <Button variant="danger" onClick={() => window.confirm(`Delete "${l.name}"? People who were already messaged stay in your results.`) && act({ action: "list.delete", id: l.id })}>Delete</Button>
              </div>
            </Row>
            {open === l.id && rows && (
              <div className="px-4 pb-4"><div className="max-h-[320px] overflow-y-auto scroll rounded-[10px] border border-line">
                <table className="w-full text-[12.5px]"><tbody>
                  {rows.rows.map((p) => <tr key={p.id} className="border-b border-line last:border-b-0"><td className="p-2 font-medium">@{p.handle}</td><td className="p-2">{p.name}</td><td className="p-2 text-mute">{STATUS_WORDS[p.status] ?? p.status}{p.detail ? `: ${p.detail}` : ""}</td><td className="p-2 text-mute truncate max-w-[320px]">{p.text ?? ""}</td></tr>)}
                </tbody></table>
                {rows.total > rows.rows.length && <div className="p-2 text-[12px] text-mute">Showing the first {rows.rows.length} of {rows.total}.</div>}
              </div></div>
            )}
          </div>
        )) : <div className="p-4 text-mute text-[13px]">No lists yet.</div>}
      </Section>
    </>
  );
}

function Starters({ v, act }: P) {
  const [links, setLinks] = useState(v.links);
  const [com, setCom] = useState(v.commentTriggers.map((c) => ({ ...c, keywordsText: c.keywords.join(", ") })));
  const [user, setUser] = useState(v.igUsername);
  const dirtyL = JSON.stringify(links) !== JSON.stringify(v.links);
  const dirtyC = JSON.stringify(com.map(({ keywordsText: _k, ...c }) => c)) !== JSON.stringify(v.commentTriggers) || com.some((c) => c.keywordsText !== c.keywords.join(", "));
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  return (
    <>
      <div className="mb-5"><Banner>These three start conversations inside Meta's own rules, through the official connection, at any volume. They need Instagram connected under Settings, Connections. Comment replies also need the comments permission, so reconnect Instagram once after this update.</Banner></div>
      <Section title="Comment to DM" sub={`When someone comments a keyword on your post or reel, they get this message in their DMs. One message per comment, within 7 days, up to ${v.limits.privateReplyPerHour} an hour.`} action={<div className="flex gap-2"><Button onClick={() => setCom([...com, { id: "n" + Date.now().toString(36), name: "", keywords: [], keywordsText: "", match: "contains", reply: "hey {first_name|there}, here it is: ", tags: [], enabled: true, fired: 0 }])}>Add</Button><Button variant="primary" disabled={!dirtyC} onClick={async () => { const r = await act({ action: "comments", commentTriggers: com.map(({ keywordsText, ...c }) => ({ ...c, keywords: keywordsText.split(",") })) }, "Comment replies saved."); if (r) setCom(r.commentTriggers.map((c) => ({ ...c, keywordsText: c.keywords.join(", ") }))); }}>Save</Button></div>}>
        {com.length ? com.map((c, i) => {
          const upd = (p: Partial<(typeof com)[number]>) => setCom(com.map((x, j) => (j === i ? { ...x, ...p } : x)));
          return (
            <div key={c.id} className="p-4 border-b border-line last:border-b-0 grid gap-3">
              <div className="grid md:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
                <Field label="Name"><input className="field" value={c.name} onChange={(e) => upd({ name: e.target.value })} placeholder="Free guide" /></Field>
                <Field label="Keywords" hint="Separate with commas"><input className="field" value={c.keywordsText} onChange={(e) => upd({ keywordsText: e.target.value })} placeholder="guide, send it" /></Field>
                <Field label="Match"><select className="field" value={c.match} onChange={(e) => upd({ match: e.target.value as "exact" | "contains" })}><option value="contains">Comment contains it</option><option value="exact">Comment is exactly it</option></select></Field>
                <div className="flex items-center gap-2 h-9"><Toggle label="On" on={c.enabled} onChange={(on) => upd({ enabled: on })} /><Button variant="ghost" onClick={() => setCom(com.filter((_, j) => j !== i))}>Remove</Button></div>
              </div>
              <Field label="Message sent to their DMs" hint={c.fired ? `Sent ${c.fired} times` : undefined}><textarea className="field min-h-[64px]" value={c.reply} maxLength={1000} onChange={(e) => upd({ reply: e.target.value })} /></Field>
            </div>
          );
        }) : <div className="p-4 text-mute text-[13px]">None yet. Tell people in a post to comment a word, and add that word here.</div>}
      </Section>
      <Section title="Trackable chat links" sub="A link that opens your DMs. Put a different one in your bio, stories, emails and QR codes to see which brings conversations, and greet each differently." action={<div className="flex gap-2"><Button onClick={() => setLinks([...links, { id: "n" + Date.now().toString(36), ref: "", label: "", opener: "", tags: [], opened: 0, createdAt: "" }])}>Add</Button><Button variant="primary" disabled={!dirtyL} onClick={async () => { const r = await act({ action: "links", links }, "Links saved."); if (r) setLinks(r.links); }}>Save</Button></div>}>
        {!v.igUsername && <div className="p-4 border-b border-line"><Field label="Your Instagram username" hint="Used to build the links. Filled in automatically once Instagram is connected."><input className="field !w-64" value={user} onChange={(e) => setUser(e.target.value.replace(/^@/, "").trim())} placeholder="yourhandle" /></Field></div>}
        {links.length ? links.map((l, i) => {
          const upd = (p: Partial<EntryLink>) => setLinks(links.map((x, j) => (j === i ? { ...x, ...p } : x)));
          const url = `https://ig.me/m/${user || "yourhandle"}?ref=${l.ref || slug(l.label) || "link"}`;
          return (
            <div key={l.id} className="p-4 border-b border-line last:border-b-0 grid gap-3">
              <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                <Field label="Where it goes"><input className="field" value={l.label} onChange={(e) => upd({ label: e.target.value })} placeholder="Bio link" /></Field>
                <Field label="Link" hint={l.opened ? `Opened ${l.opened} chats` : undefined}><input className="field font-mono text-[12.5px]" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Chat link" /></Field>
                <div className="flex gap-2 h-9"><Button onClick={() => navigator.clipboard?.writeText(url)}>Copy</Button><Button variant="ghost" onClick={() => setLinks(links.filter((_, j) => j !== i))}>Remove</Button></div>
              </div>
              <Field label="Greeting" hint="Sent once, as soon as they message through this link. Leave empty to let the AI setter answer as usual."><textarea className="field min-h-[56px]" value={l.opener} maxLength={1000} onChange={(e) => upd({ opener: e.target.value })} /></Field>
            </div>
          );
        }) : <div className="p-4 text-mute text-[13px]">No links yet.</div>}
      </Section>
      <Section title="Click to message ads">
        <div className="p-4 text-[13px] text-ink2 grid gap-2">
          <p>Ads with the "Send message" button are the one way Meta allows you to reach people who have never heard of you. Create them in Ads Manager with Instagram Direct as the destination.</p>
          <p>Nothing to set up here: when someone messages from an ad, the conversation arrives in the inbox marked "Ad click", the AI setter answers it, and Insights shows ad conversations as their own source.</p>
        </div>
      </Section>
    </>
  );
}

function Num({ label, hint, value, onChange, min, max, step = 1 }: { label: string; hint?: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number }) {
  return <Field label={label} hint={hint}><input type="number" className="field !w-28" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} /></Field>;
}

function Sending({ v, act }: P) {
  const [s, setS] = useState(v.settings);
  const dirty = JSON.stringify(s) !== JSON.stringify(v.settings);
  const t = s.typing;
  const typ = (p: Partial<OutreachSettings["typing"]>) => setS({ ...s, typing: { ...t, ...p } });
  const sample = Math.round((120 / 5 / ((t.wpmMin + t.wpmMax) / 2)) * 60 * (1 + t.typoRate * 6 + t.rewriteRate * 0.3));
  return (
    <>
      <Section title="How messages are sent" sub="Messages are typed into Instagram by the Chrome extension, in the browser where you are signed in to Instagram. Chrome has to stay open." action={<Button variant="primary" disabled={!dirty} onClick={async () => { const r = await act({ action: "settings", settings: s }, "Sending settings saved."); if (r) setS(r.settings); }}>Save</Button>}>
        <Row title="Who presses send" sub="Automatic sends the message once it is typed. Assisted types it and waits for you to press send yourself.">
          <select className="field !w-auto" value={s.mode} onChange={(e) => setS({ ...s, mode: e.target.value as "auto" | "assisted" })} aria-label="Send mode"><option value="auto">Automatic</option><option value="assisted">Assisted</option></select>
        </Row>
        <Row title="Instagram account" sub="The handle Chrome must be signed in as. Sending stops if it is a different account. Leave empty to allow any.">
          <input className="field !w-56" value={s.account} onChange={(e) => setS({ ...s, account: e.target.value })} placeholder="yourhandle" aria-label="Instagram account" />
        </Row>
        <div className="p-4 border-b border-line grid grid-cols-2 md:grid-cols-4 gap-4">
          <Num label="Fewest a day" value={s.dailyMin} min={1} max={v.limits.hardMax} onChange={(n) => setS({ ...s, dailyMin: n })} />
          <Num label="Most a day" hint={`Never above ${v.limits.hardMax}`} value={s.dailyMax} min={1} max={v.limits.hardMax} onChange={(n) => setS({ ...s, dailyMax: n })} />
          <Num label="Start hour" value={s.hourStart} min={0} max={23} onChange={(n) => setS({ ...s, hourStart: n })} />
          <Num label="End hour" value={s.hourEnd} min={1} max={24} onChange={(n) => setS({ ...s, hourEnd: n })} />
          <Field label="Time zone" className="col-span-2"><input className="field" value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} aria-label="Time zone" /></Field>
          <Num label="Shortest gap" hint="Seconds between two messages" value={s.minGapSeconds} min={60} max={3600} onChange={(n) => setS({ ...s, minGapSeconds: n })} />
        </div>
        <Row title="Build up slowly" sub={`Start at ${s.rampStart} a day and add ${s.rampStep} each day messages go out, until the daily range is reached. ${s.daysSent} sending days so far.`}>
          <div className="flex items-center gap-3">
            <input type="number" className="field !w-20" min={1} max={v.limits.hardMax} value={s.rampStart} onChange={(e) => setS({ ...s, rampStart: Number(e.target.value) })} aria-label="First day limit" />
            <input type="number" className="field !w-20" min={1} max={20} value={s.rampStep} onChange={(e) => setS({ ...s, rampStep: Number(e.target.value) })} aria-label="Daily increase" />
            <Toggle label="Build up slowly" on={s.ramp} onChange={(on) => setS({ ...s, ramp: on })} />
          </div>
        </Row>
      </Section>
      <Section title="Typing like a person" sub={`Every message is typed key by key at a different speed, with random slips that are noticed and backspaced. A 120 character message takes about ${sample} seconds at these settings.`}>
        <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-4">
          <Num label="Slowest" hint="Words a minute" value={t.wpmMin} min={15} max={110} onChange={(n) => typ({ wpmMin: n })} />
          <Num label="Fastest" hint="Words a minute" value={t.wpmMax} min={15} max={130} onChange={(n) => typ({ wpmMax: n })} />
          <Num label="Slips" hint="Per 100 keys" value={Math.round(t.typoRate * 1000) / 10} min={0} max={12} step={0.5} onChange={(n) => typ({ typoRate: n / 100 })} />
          <Num label="Rewording" hint="% of messages" value={Math.round(t.rewriteRate * 100)} min={0} max={50} onChange={(n) => typ({ rewriteRate: n / 100 })} />
          <Num label="Pauses" hint="Per 100 keys" value={Math.round(t.pauseRate * 1000) / 10} min={0} max={30} step={0.5} onChange={(n) => typ({ pauseRate: n / 100 })} />
        </div>
        <div className="px-4 pb-4 text-[12.5px] text-mute">Slips are always corrected before sending, so what arrives is exactly what you wrote. Links, handles and emoji are never mistyped.</div>
      </Section>
      <Section title="When sending stops by itself">
        <div className="p-4 text-[13px] text-ink2 grid gap-1.5">
          <p>Any Instagram warning, "try again later" notice, request to confirm it is you, or a signed out session pauses everything until you press Resume.</p>
          <p>Two failed sends in one day pause sending too, which usually means Instagram changed its page and the extension needs its selector check.</p>
          <p>People already in your inbox are never messaged, and a handle is only ever contacted once.</p>
        </div>
      </Section>
    </>
  );
}
