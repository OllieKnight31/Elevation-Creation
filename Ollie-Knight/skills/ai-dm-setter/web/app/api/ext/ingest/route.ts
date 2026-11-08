import { extAuth, fail, json } from "@/lib/api";
import { addMessage, setAvatar, upsertConversation } from "@/lib/engine";
import { saveDb } from "@/lib/store";
import { textKey } from "@/lib/sheets";

/** Full thread history read by the Chrome extension from the owner's own open inbox. */
export async function POST(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  const b = await req.json().catch(() => null);
  if (!b) return fail("Body must be JSON");
  const platform = b.platform === "messenger" ? "messenger" : "instagram";
  const t = b.thread ?? {};
  if (!t.externalId || !Array.isArray(b.messages)) return fail("thread.externalId and messages are required");
  const msgs = [...b.messages].sort((x: { order: number }, y: { order: number }) => x.order - y.order);
  // Messages without a timestamp are spaced a minute apart, ending now, so their order survives.
  const base = Date.now() - msgs.length * 60_000;
  const conv = upsertConversation(db, { platform, externalId: String(t.externalId), handle: t.handle ?? null, name: t.name || t.handle || "Unknown", at: msgs[0]?.sentAt ?? new Date(base).toISOString() });
  setAvatar(conv, t.avatar);
  let added = 0;
  // The extension reports approximate or missing timestamps, so re-captures are matched on how many
  // times each (direction, text) pair has already been stored.
  const stored = new Map<string, number>();
  for (const m of db.messages) if (m.conversationId === conv.id) stored.set(m.direction + "|" + m.text, (stored.get(m.direction + "|" + m.text) ?? 0) + 1);
  // Messages already moved to the Google Sheets archive count as stored.
  const moved = conv.pruned ?? {};
  const seen = new Map<string, number>();
  msgs.forEach((m: { direction: string; text: string; sentAt: string | null }, i: number) => {
    const direction = m.direction === "out" ? "out" : "in";
    const text = String(m.text ?? "").trim();
    const hasTime = Boolean(m.sentAt && !Number.isNaN(Date.parse(m.sentAt)));
    const key = direction + "|" + text;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (seen.get(key)! <= (stored.get(key) ?? 0) + (moved[textKey(direction, text)] ?? 0)) return;
    const sentAt = hasTime ? new Date(m.sentAt!).toISOString() : new Date(base + i * 60_000).toISOString();
    if (addMessage(db, conv, { direction, text, sentAt, source: "extension" }, false)) added++;
  });
  saveDb();
  return json({ conversationId: conv.id, added, total: db.messages.filter((m) => m.conversationId === conv.id).length });
}
