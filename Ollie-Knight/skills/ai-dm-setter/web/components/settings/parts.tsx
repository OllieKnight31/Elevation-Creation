"use client";
import type { AppState } from "@/components/ui";

export interface TabProps { state: AppState; reload: () => Promise<void> | void; note: (text: string, tone?: "info" | "ok" | "error") => void }

export function Section({ title, sub, children, action }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="flex items-end justify-between gap-3 mb-2">
        <div>
          <h2 className="font-semibold text-[16px]">{title}</h2>
          {sub && <p className="text-mute text-[13px]">{sub}</p>}
        </div>
        {action}
      </div>
      <div className="card">{children}</div>
    </section>
  );
}

export function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 p-4 border-b border-line last:border-b-0">
      <div className="min-w-0"><div className="font-semibold">{title}</div>{sub && <div className="text-[12.5px] text-mute">{sub}</div>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="font-medium text-[13px]">{label}</span>
      {hint && <span className="block text-[12px] text-mute">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}
