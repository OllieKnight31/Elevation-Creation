"use client";
import { useEffect, useState } from "react";
import { api, Banner, Button, timeAgo, Toggle, usePipeline } from "@/components/ui";
import { Field, Row, Section, type TabProps } from "./parts";

type Pipe = { id: string; name: string; stages: { id: string; name: string }[] };

export default function CrmTab({ state, reload, note }: TabProps) {
  const crm = state.workspace.crm;
  const pipe = usePipeline();
  const [url, setUrl] = useState(crm.webhookUrl);
  const [token, setToken] = useState("");
  const [loc, setLoc] = useState(crm.ghl.locationId);
  const [sample, setSample] = useState<Record<string, unknown> | null>(null);
  const [pipes, setPipes] = useState<Pipe[] | null>(null);
  const [busy, setBusy] = useState("");
  const put = async (body: unknown) => { await api("/api/workspace", "PUT", { crm: body }); await reload(); };
  const run = async (label: string, fn: () => Promise<void>) => { setBusy(label); try { await fn(); } catch (e) { note((e as Error).message, "error"); } setBusy(""); };

  useEffect(() => { api<{ sample: Record<string, unknown> | null }>("/api/crm").then((r) => setSample(r.sample)).catch(() => {}); }, []);
  const loadPipes = () => run("pipes", async () => { setPipes((await api<{ pipelines: Pipe[] }>("/api/crm?what=pipelines")).pipelines); });
  const chosen = pipes?.find((p) => p.id === crm.ghl.pipelineId);
  const ready = Boolean(crm.webhookUrl || (crm.ghl.enabled && crm.ghl.tokenSet && crm.ghl.locationId));

  return (
    <>
      <Section title="CRM sync" sub="Everything captured in the DMs, by the AI or by a person, is pushed to your CRM so closers see it before the call and nothing is retyped.">
        <Row title="Send lead updates to the CRM" sub={ready ? "Goes out a few seconds after any change: new lead, stage, tags, lead details, summary, notes, owner. Demo conversations are never sent." : "Add a webhook URL or connect GoHighLevel below first."}>
          <Toggle label="CRM sync" on={crm.enabled} onChange={(v) => put({ enabled: v }).catch((e) => note(e.message, "error"))} />
        </Row>
        <div className="p-4 border-b border-line">
          <div className="font-semibold">Webhook</div>
          <p className="text-[12.5px] text-mute mb-2">Any address that accepts a JSON POST. In GoHighLevel: Automation, create a workflow, add the Inbound Webhook trigger, copy its URL here, press Send test, then pick the test under Mapping Reference and add a Create or Update Contact step. Zapier, Make and n8n work the same way.</p>
          <div className="flex gap-2">
            <input className="field" placeholder="https://services.leadconnectorhq.com/hooks/…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="CRM webhook URL" />
            <Button variant="primary" disabled={url.trim() === crm.webhookUrl} onClick={() => run("url", async () => { await put({ webhookUrl: url }); note("Webhook saved.", "ok"); })}>Save</Button>
            <Button disabled={!crm.webhookUrl || busy === "test"} onClick={() => run("test", async () => { await api("/api/crm", "POST", { action: "test" }); await reload(); note("Test lead sent. Check it arrived in your CRM.", "ok"); })}>{busy === "test" ? "Sending…" : "Send test"}</Button>
          </div>
          <p className="text-[12px] text-mute mt-2">GoHighLevel&apos;s webhook trigger is a premium trigger (100 free runs per sub-account, then charged per run) and its contact step needs an email or phone. Leads with neither still arrive, but cannot become a contact that way. The direct connection below has no such limit.</p>
          {sample && (
            <details className="mt-3 text-[12.5px]">
              <summary className="cursor-pointer font-medium">Fields sent with every update ({Object.keys(sample).length})</summary>
              <table className="mt-2 w-full"><tbody>
                {Object.entries(sample).map(([k, v]) => <tr key={k} className="border-t border-line align-top"><td className="py-1 pr-3 font-mono text-[11.5px] whitespace-nowrap">{k}</td><td className="py-1 text-mute [overflow-wrap:anywhere]">{String(v) || "(empty)"}</td></tr>)}
              </tbody></table>
            </details>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div><div className="font-semibold">GoHighLevel, direct</div><p className="text-[12.5px] text-mute">Creates or updates the contact, adds your tags, fills custom fields (situation, goal, pain, objections, budget, summary, next step, stage, profile link), posts the summary as a note and moves the opportunity through your GHL pipeline.</p></div>
            <Toggle label="GoHighLevel direct" on={crm.ghl.enabled} onChange={(v) => put({ ghl: { enabled: v } }).catch((e) => note(e.message, "error"))} />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label={`Private integration token${crm.ghl.tokenSet ? " (saved)" : ""}`} hint="GHL: Settings, Private Integrations. Scopes: contacts, opportunities, locations/customFields, each read and write"><input className="field" type="password" placeholder={crm.ghl.tokenSet ? "Leave blank to keep" : "pit-…"} value={token} onChange={(e) => setToken(e.target.value)} aria-label="GoHighLevel token" /></Field>
            <Field label="Location ID" hint="GHL: Settings, Business Profile"><input className="field" value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="GoHighLevel location ID" /></Field>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="primary" disabled={!token.trim() && loc.trim() === crm.ghl.locationId} onClick={() => run("ghl", async () => { await put({ ghl: { token, locationId: loc } }); setToken(""); note("GoHighLevel details saved.", "ok"); })}>Save</Button>
            <Button disabled={!crm.ghl.tokenSet || !crm.ghl.locationId || busy === "pipes"} onClick={loadPipes}>{busy === "pipes" ? "Loading…" : "Load my GHL pipelines"}</Button>
            <Button disabled={!crm.ghl.tokenSet || !crm.ghl.locationId || busy === "fields"} onClick={() => run("fields", async () => { const r = await api<{ fields: number; created: number }>("/api/crm", "POST", { action: "fields" }); note(`${r.fields} custom fields ready in GoHighLevel, ${r.created} newly created.`, "ok"); })}>{busy === "fields" ? "Working…" : "Create the custom fields"}</Button>
          </div>
          {pipes && (
            <div className="mt-4">
              <Field label="GHL pipeline for opportunities" hint="Leave on None to sync contacts only">
                <select className="field" value={crm.ghl.pipelineId} onChange={(e) => put({ ghl: { pipelineId: e.target.value } }).catch((x) => note(x.message, "error"))} aria-label="GoHighLevel pipeline"><option value="">None</option>{pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </Field>
              {chosen && (
                <table className="w-full text-[13px] mt-3">
                  <thead><tr className="text-left"><th className="label pb-1">Stage here</th><th className="label pb-1">Moves the GHL opportunity to</th></tr></thead>
                  <tbody>
                    {pipe.stages.filter((s) => !s.hidden).map((s) => (
                      <tr key={s.id} className="border-t border-line">
                        <td className="py-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full mr-2" style={{ background: s.color }} />{s.name}</td>
                        <td className="py-1"><select className="field !py-1" value={crm.ghl.stageMap[s.id] ?? ""} onChange={(e) => put({ ghl: { stageMap: { ...crm.ghl.stageMap, [s.id]: e.target.value } } }).catch((x) => note(x.message, "error"))} aria-label={`GHL stage for ${s.name}`}><option value="">Do not create or move</option>{chosen.stages.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {!pipes && crm.ghl.pipelineId && <p className="text-[12.5px] text-mute mt-3">Opportunities sync to a saved pipeline, {Object.keys(crm.ghl.stageMap).length} stages mapped. Load your pipelines to change the mapping.</p>}
        </div>
      </Section>

      <Section title="Send everything now" sub="Use once after connecting, so leads already in the app reach the CRM.">
        <Row title="Sync all leads" sub="Sends every real lead, one at a time. Leads already sent are updated, not duplicated.">
          <Button disabled={!crm.enabled || !ready || busy === "all"} onClick={() => run("all", async () => { const r = await api<{ ok: number; failed: number; skippedDemo: number }>("/api/crm", "POST", { action: "all" }); await reload(); note(`${r.ok} leads sent, ${r.failed} failed${r.skippedDemo ? `, ${r.skippedDemo} demo leads left out` : ""}.`, r.failed ? "error" : "ok"); })}>{busy === "all" ? "Sending…" : "Sync all leads"}</Button>
        </Row>
      </Section>

      <Section title="Delivery log" sub="The last 40 updates sent.">
        {crm.log.length === 0 && <p className="p-4 text-mute text-[13px]">Nothing sent yet.</p>}
        {crm.log.length > 0 && (
          <table className="w-full text-[12.5px]">
            <tbody>
              {crm.log.map((l, i) => (
                <tr key={i} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-1.5 whitespace-nowrap text-mute">{timeAgo(l.at)} ago</td>
                  <td className="px-2 py-1.5 font-medium">{l.lead}</td>
                  <td className="px-2 py-1.5">{l.target === "ghl" ? "GoHighLevel" : "Webhook"}</td>
                  <td className={`px-2 py-1.5 font-semibold ${l.ok ? "text-ok" : "text-err"}`}>{l.ok ? "Delivered" : "Failed"}{l.status ? ` (${l.status})` : ""}</td>
                  <td className="px-4 py-1.5 text-mute [overflow-wrap:anywhere]">{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      {!ready && <Banner tone="info">Bookings coming back the other way (GoHighLevel calendar to this app) use the booking webhook under Connections.</Banner>}
    </>
  );
}
