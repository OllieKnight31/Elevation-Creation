"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, Banner, Button } from "@/components/ui";
import { LogoMark, LogoWordmark } from "@/components/Shell";

export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}

function Login() {
  const q = useSearchParams();
  const next = q.get("next")?.startsWith("/") && !q.get("next")!.startsWith("//") ? q.get("next")! : "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [business, setBusiness] = useState("");

  useEffect(() => {
    api<{ loginRequired: boolean; member: unknown; business: string }>("/api/me").then((r) => {
      setBusiness(r.business);
      if (!r.loginRequired || r.member) window.location.replace(next);
    }).catch(() => {});
  }, [next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api("/api/auth/login", "POST", { email, password }); window.location.replace(next); } catch (x) { setErr((x as Error).message); setBusy(false); }
  };

  return (
    <div className="h-full flex items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-[380px] p-7">
        <div className="flex items-center gap-2.5 mb-6">
          <span className="w-9 h-9 rounded-[10px] bg-ink text-onbrand flex items-center justify-center"><LogoMark size={24} /></span>
          <div className="leading-tight"><LogoWordmark height={16} /><div className="label mt-1">DM Setter</div></div>
        </div>
        <h1 className="display text-[26px] leading-tight mb-1">Sign in</h1>
        <p className="text-mute text-[13px] mb-5">{business ? `${business}'s workspace.` : "Use the email and password you were given."}</p>
        {err && <div className="mb-3"><Banner tone="error">{err}</Banner></div>}
        <label className="block mb-3"><span className="font-medium text-[13px]">Email</span><input className="field mt-1" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="block mb-5">
          <span className="font-medium text-[13px]">Password</span>
          <span className="relative block mt-1">
            <input className="field pr-16" type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-mute hover:text-ink px-2 py-1" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>
          </span>
        </label>
        <Button variant="primary" type="submit" disabled={busy} className="w-full !h-10">{busy ? "Signing in…" : "Sign in"}</Button>
        <p className="text-[12px] text-mute mt-4">Forgotten it? Ask the account owner to set a new password under Settings, Team.</p>
      </form>
    </div>
  );
}
