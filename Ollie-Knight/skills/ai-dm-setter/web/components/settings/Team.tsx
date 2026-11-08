"use client";
import { useState } from "react";
import type { Area, Role } from "@/lib/types";
import { api, Banner, Button, timeAgo, Toggle, type PublicMember } from "@/components/ui";
import { Field, Section, type TabProps } from "./parts";

const AREAS: [Area, string][] = [["inbox", "Inbox"], ["leads", "Leads centre"], ["outreach", "Outreach"], ["insights", "Insights"], ["playbook", "Playbook"], ["pipeline", "Stages and tags"], ["brief", "Business brief"], ["settings", "Settings"]];
const ROLES: [Role, string, string, Area[]][] = [
  ["owner", "Owner", "Everything, including team and setup", AREAS.map(([a]) => a)],
  ["admin", "Admin", "Everything, cannot change owners", AREAS.map(([a]) => a)],
  ["setter", "Setter", "Works conversations", ["inbox", "leads", "insights"]],
  ["closer", "Closer", "Takes booked calls", ["leads", "insights"]],
  ["viewer", "Viewer", "Reads the numbers", ["insights"]],
];
type Draft = { id?: string; name: string; email: string; password: string; role: Role; team: string; areas: Area[]; scope: "all" | "assigned"; teamMetrics: boolean; active: boolean };
const blank = (role: Role = "setter"): Draft => ({ name: "", email: "", password: "", role, team: "", areas: ROLES.find(([r]) => r === role)![3], scope: "all", teamMetrics: role !== "setter" && role !== "closer", active: true });

export default function TeamTab({ state, reload, note }: TabProps) {
  const members = state.workspace.members;
  const real = members.filter((m) => !m.demo);
  const loginOn = state.me.loginRequired;
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const teams = [...new Set(real.map((m) => m.team).filter(Boolean))];

  const edit = (m: PublicMember) => setD({ id: m.id, name: m.name, email: m.email, password: "", role: m.role, team: m.team, areas: m.areas, scope: m.scope, teamMetrics: m.teamMetrics, active: m.active });
  const save = async () => {
    if (!d) return;
    setBusy(true); setErr("");
    try {
      const r = await api<{ loginNowRequired?: boolean }>("/api/team", d.id ? "PUT" : "POST", { ...d, password: d.password || undefined });
      note(r.loginNowRequired ? `Sign in is now on. You are signed in as ${d.name}. Everyone else needs an account from this page.` : d.id ? `${d.name} updated.` : `${d.name} added. Send them the address of this app, their email and the password you set.`, "ok");
      setD(null);
      await reload();
      window.dispatchEvent(new Event("setter:auth"));
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const remove = async (m: PublicMember) => {
    if (!confirm(`Remove ${m.name}? Their past messages stay in the reports. Leads assigned to them become unassigned.`)) return;
    try { await api(`/api/team?id=${m.id}`, "DELETE"); await reload(); window.dispatchEvent(new Event("setter:auth")); note(`${m.name} removed.`); } catch (e) { note((e as Error).message, "error"); }
  };
  const first = !loginOn;
  const fullAccess = d && (d.role === "owner" || d.role === "admin" || first);

  return (
    <>
      {!loginOn && <div className="mb-4"><Banner tone="warn">Sign in is off: anyone who can reach this app can open it. Add your own account below. It becomes the owner and switches sign in on for everyone.</Banner></div>}
      <Section title="Team" sub="Each person gets their own login and only the screens you tick. Their messages and results are tracked under their name in Insights."
        action={!d && <Button variant="primary" onClick={() => setD(blank(first ? "owner" : "setter"))}>{first ? "Create your account" : "Add a team member"}</Button>}>
        {real.length === 0 && !d && <p className="p-4 text-mute text-[13px]">No accounts yet.</p>}
        {real.map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-4 border-b border-line last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{m.name} <span className="font-normal text-mute">· {ROLES.find(([r]) => r === m.role)?.[1]}{m.team ? ` · ${m.team}` : ""}{m.active ? "" : " · switched off"}</span></div>
              <div className="text-[12.5px] text-mute truncate">{m.email} · {m.lastLoginAt ? `last signed in ${timeAgo(m.lastLoginAt)} ago` : "has not signed in yet"}</div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {AREAS.filter(([a]) => m.role === "owner" || m.role === "admin" || m.areas.includes(a)).map(([a, l]) => <span key={a} className="text-[11px] font-medium rounded-md border border-linestrong px-1.5 py-0.5">{l}</span>)}
                {m.scope === "assigned" && <span className="text-[11px] font-medium rounded-md tone-warn px-1.5 py-0.5">Own leads only</span>}
                {!m.teamMetrics && m.role !== "owner" && m.role !== "admin" && <span className="text-[11px] font-medium rounded-md bg-surface2 px-1.5 py-0.5">Own numbers only</span>}
              </div>
            </div>
            <Button onClick={() => edit(m)}>Edit</Button>
            {m.id !== state.me.id && <Button variant="danger" onClick={() => remove(m)}>Remove</Button>}
          </div>
        ))}
        {d && (
          <div className="p-4 border-t border-line bg-canvas rounded-b-[16px]">
            <div className="font-semibold mb-3">{d.id ? `Edit ${d.name}` : first ? "Your account" : "New team member"}</div>
            {err && <div className="mb-3"><Banner tone="error">{err}</Banner></div>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name"><input className="field" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} aria-label="Member name" /></Field>
              <Field label="Email" hint="What they sign in with"><input className="field" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} aria-label="Member email" /></Field>
              <Field label={d.id ? "New password" : "Password"} hint={d.id ? "Leave blank to keep the current one" : "At least 8 characters. You pass it on to them"}><input className="field" type="text" autoComplete="off" value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} aria-label="Member password" /></Field>
              <Field label="Team" hint="Optional, for example Setters or Closers"><input className="field" list="team-names" value={d.team} onChange={(e) => setD({ ...d, team: e.target.value })} aria-label="Team name" /><datalist id="team-names">{teams.map((t) => <option key={t} value={t} />)}</datalist></Field>
            </div>
            {!first && (
              <>
                <div className="font-medium text-[13px] mt-4 mb-1.5">Role</div>
                <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Role">
                  {ROLES.map(([r, l, hint, areas]) => (
                    <button key={r} role="radio" aria-checked={d.role === r} onClick={() => setD({ ...d, role: r, areas, teamMetrics: r !== "setter" && r !== "closer" })} className={`text-left rounded-[10px] border px-2.5 py-1.5 ${d.role === r ? "border-ink bg-surface" : "border-line hover:border-linestrong"}`}>
                      <div className="font-medium text-[13px]">{l}</div><div className="text-[11px] text-mute leading-tight">{hint}</div>
                    </button>
                  ))}
                </div>
                <div className="font-medium text-[13px] mt-4 mb-1.5">Screens they can open</div>
                <div className="flex flex-wrap gap-1.5">
                  {AREAS.map(([a, l]) => {
                    const on = fullAccess || d.areas.includes(a);
                    return <button key={a} role="checkbox" aria-checked={Boolean(on)} disabled={Boolean(fullAccess)} onClick={() => setD({ ...d, areas: on ? d.areas.filter((x) => x !== a) : [...d.areas, a] })} className={`rounded-full px-2.5 py-1 text-[12px] font-medium border disabled:opacity-60 ${on ? "bg-ink text-onbrand border-transparent" : "border-linestrong hover:border-ink"}`}>{l}</button>;
                  })}
                </div>
                {!fullAccess && (
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <label className="flex items-center justify-between gap-3 rounded-[10px] border border-line px-3 py-2"><span><span className="font-medium text-[13px] block">Only their own leads</span><span className="text-[12px] text-mute">Sees conversations assigned to them and nothing else</span></span><Toggle label="Only their own leads" on={d.scope === "assigned"} onChange={(v) => setD({ ...d, scope: v ? "assigned" : "all" })} /></label>
                    <label className="flex items-center justify-between gap-3 rounded-[10px] border border-line px-3 py-2"><span><span className="font-medium text-[13px] block">See the whole team&apos;s numbers</span><span className="text-[12px] text-mute">Off: Insights shows only their own results</span></span><Toggle label="See team numbers" on={d.teamMetrics} onChange={(v) => setD({ ...d, teamMetrics: v })} /></label>
                  </div>
                )}
                {d.id && <label className="flex items-center gap-2 mt-3 text-[13px]"><Toggle label="Account active" on={d.active} onChange={(v) => setD({ ...d, active: v })} />Account active. Switch off to block sign in without deleting their history.</label>}
              </>
            )}
            <div className="flex gap-2 mt-4">
              <Button variant="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : d.id ? "Save changes" : first ? "Create account and switch sign in on" : "Add team member"}</Button>
              <Button variant="ghost" onClick={() => { setD(null); setErr(""); }}>Cancel</Button>
            </div>
          </div>
        )}
      </Section>
      {members.some((m) => m.demo) && <p className="text-[12.5px] text-mute -mt-3 mb-6">The demo conversations come with three sample setters (Sam, Jess and Ravi) so the team numbers have something to show. They cannot sign in and disappear when the demo data is cleared.</p>}
    </>
  );
}
