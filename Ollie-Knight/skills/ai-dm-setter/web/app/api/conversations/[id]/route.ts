import { saveDb } from "@/lib/store";
import { access, canSee } from "@/lib/auth";
import { convView, fail, json } from "@/lib/api";
import { setLabels, setStage } from "@/lib/engine";
import { pipelineOf } from "@/lib/pipeline";
import { ensureSummary } from "@/lib/summary";
import { crmTouch } from "@/lib/crm";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const LEAD_FIELDS = ["situation", "goal", "pain", "budget", "email", "phone"] as const;

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const a = await access(["inbox", "leads"]);
  if (a instanceof Response) return a;
  const { db, me } = a;
  const c = db.conversations.find((x) => x.id === id);
  if (!c || !canSee(me, c)) return fail("Conversation not found", 404);
  if (ensureSummary(db, c)) saveDb();
  const count = db.messages.reduce((n, m) => n + (m.conversationId === id ? 1 : 0), 0);
  return json({
    conversation: { ...convView(db, c), summaryStale: Boolean(c.summary && c.summary.messageCount !== count) },
    messages: db.messages.filter((m) => m.conversationId === id).sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
    events: db.events.filter((e) => e.conversationId === id && e.type !== "message_sent" && e.type !== "message_received").sort((a, b) => b.at.localeCompare(a.at)),
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const a = await access(["inbox", "leads"]);
  if (a instanceof Response) return a;
  const { db, me } = a;
  const c = db.conversations.find((x) => x.id === id);
  if (!c || !canSee(me, c)) return fail("Conversation not found", 404);
  const b = await req.json();
  const by = me.id || undefined;
  let touched = false;
  if (b.stage) {
    if (!pipelineOf(db.workspace.pipeline).has(b.stage)) return fail("Unknown stage");
    setStage(db, c, b.stage, "human", b.reason, { memberId: by });
  }
  if (Array.isArray(b.labels)) setLabels(db, c, b.labels, "human", by);
  if (b.aiMode) c.aiMode = b.aiMode;
  if (b.status) c.status = b.status;
  if (typeof b.notes === "string" && b.notes !== c.notes) { c.notes = b.notes; touched = true; }
  if (typeof b.unread === "boolean") c.unread = b.unread;
  if (b.assignedTo !== undefined) {
    const next = b.assignedTo ? String(b.assignedTo) : null;
    if (next && !db.workspace.members.some((m) => m.id === next && m.active)) return fail("That team member does not exist.");
    c.assignedTo = next;
    touched = true;
  }
  if (b.lead && typeof b.lead === "object") {
    for (const k of LEAD_FIELDS) {
      if (typeof b.lead[k] !== "string") continue;
      const v = b.lead[k].trim().slice(0, 400);
      if (v) c.lead[k] = v;
      else delete c.lead[k];
      touched = true;
    }
    if (typeof b.lead.objections === "string") {
      c.lead.objections = b.lead.objections.split(",").map((x: string) => x.trim()).filter(Boolean).slice(0, 12);
      touched = true;
    }
    // Details changed by hand: the brief is rebuilt unless Claude wrote it.
    if (c.summary?.engine === "demo") c.summary = null;
    ensureSummary(db, c);
  }
  if (touched) crmTouch(db, c);
  saveDb();
  return json({ conversation: convView(db, c) });
}

/** Removes a conversation with its messages and history. For test threads and leads added by mistake. */
export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  const a = await access("settings");
  if (a instanceof Response) return a;
  const { db } = a;
  const c = db.conversations.find((x) => x.id === id);
  if (!c) return fail("Conversation not found", 404);
  db.conversations = db.conversations.filter((x) => x.id !== id);
  db.messages = db.messages.filter((m) => m.conversationId !== id);
  db.events = db.events.filter((e) => e.conversationId !== id);
  db.labelQueue = db.labelQueue.filter((q) => q.conversationId !== id);
  const o = db.workspace.outreach;
  o.prospects = o.prospects.filter((p) => p.reply?.conversationId !== id);
  saveDb();
  return json({ ok: true });
}
