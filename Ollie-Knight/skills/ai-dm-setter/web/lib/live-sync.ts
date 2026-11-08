import type { Db, Message } from "./types";
import { addMessage, findConversation, setAvatar, upsertConversation } from "./engine";

/**
 * What the helper saw on the owner's Instagram page, the moment it changed.
 * thread: the open chat, its visible messages oldest first, read only while it is scrolled to the newest.
 * preview: one chat in the chat list and the latest message the list shows for it.
 */
export interface LiveThread {
  kind: "thread" | "preview";
  thread: { externalId?: string | null; name?: string; handle?: string | null; avatar?: string | null };
  /** ageSec: how long ago the chat list says the preview was sent, when it says. */
  messages: { direction: "in" | "out"; text: string; ageSec?: number | null }[];
}

const HANDLE = /^[a-z0-9._]{1,30}$/;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
// The chat list cuts long messages short with an ellipsis.
const cut = (s: string) => (/(…|\.\.\.)$/.test(s) ? s.replace(/(…|\.\.\.)$/, "").trimEnd() : null);

/** True when a stored message and a message on the page are the same one, allowing for a shortened list preview. */
function same(stored: Message, m: { direction: string; text: string }) {
  if (stored.direction !== m.direction) return false;
  const a = clean(stored.text), b = clean(m.text);
  if (a === b) return true;
  const sa = stored.partial ? cut(a) ?? a : null, sb = cut(b);
  return Boolean((sa && sa.length >= 8 && b.startsWith(sa)) || (sb && sb.length >= 8 && a.startsWith(sb)));
}

/** Upgrades a stored list preview to the whole message once the chat itself shows it. */
function fill(stored: Message, text: string) {
  if (stored.partial && !cut(clean(text))) { stored.text = clean(text); delete stored.partial; }
  if (stored.delivery === "queued") { delete stored.delivery; delete stored.deliveryNote; }
}

/**
 * Stores what the helper saw. Messages on the page carry no id, so the visible messages are lined up against the
 * newest stored ones from the end: whatever comes after the last one that lines up is new. Anything the page
 * shows that cannot be lined up, and that the app already holds, is left alone rather than stored twice.
 */
export function ingestLive(db: Db, threads: LiveThread[], now = new Date()) {
  let added = 0, matched = 0;
  const touched = new Set<string>();
  // Chats with a message from the lead that just arrived, for Autopilot to answer.
  const fresh = new Map<string, string>();
  for (const t of threads.slice(0, 40)) {
    const kind = t.kind === "preview" ? "preview" : "thread";
    const msgs = (Array.isArray(t.messages) ? t.messages : [])
      .filter((m) => m && (m.direction === "in" || m.direction === "out") && typeof m.text === "string" && clean(m.text))
      .map((m) => ({ direction: m.direction, text: clean(m.text).slice(0, 4000), ageSec: typeof m.ageSec === "number" && m.ageSec >= 0 ? m.ageSec : null }))
      .slice(kind === "preview" ? -1 : -60);
    const handle = String(t.thread?.handle ?? "").trim().replace(/^@/, "").toLowerCase();
    const name = clean(String(t.thread?.name ?? "")).slice(0, 120) || handle;
    if (!name) continue;
    const q = { platform: "instagram" as const, externalId: String(t.thread?.externalId ?? "").slice(0, 200) || undefined, handle: HANDLE.test(handle) ? handle : null, name };
    const existed = findConversation(db, q);
    if (!existed && !msgs.length) continue;
    const conv = existed ?? upsertConversation(db, { ...q, externalId: q.externalId ?? (q.handle ? "h_" + q.handle : "n_" + name.toLowerCase()), at: now.toISOString() });
    if (existed) {
      if (q.handle && !conv.handle) conv.handle = q.handle;
    } else if (msgs[0]?.direction === "out") conv.origin = "Outbound DM";
    if (setAvatar(conv, t.thread?.avatar)) touched.add(conv.id);

    const pool = db.messages.filter((m) => m.conversationId === conv.id).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    const pairs: (Message | null)[] = msgs.map(() => null);
    let j = pool.length - 1;
    for (let i = msgs.length - 1; i >= 0 && j >= 0; i--) {
      // A few stored messages may be missing from the page (a reply still being typed, a failed one, a photo).
      for (let k = j; k >= Math.max(0, j - 8); k--) {
        if (same(pool[k], msgs[i])) { pairs[i] = pool[k]; j = k - 1; break; }
      }
    }
    const lastPaired = pairs.reduce((x, p, i) => (p ? i : x), -1);
    const known = new Set(pool.map((m) => m.direction + "|" + clean(m.text)));

    msgs.forEach((m, i) => {
      const p = pairs[i];
      if (p) { fill(p, m.text); matched++; return; }
      const after = i > lastPaired;
      // Before the part that lines up, or nothing lines up at all: only what the app has never seen is added.
      if (!after || (lastPaired < 0 && pool.length)) { if (known.has(m.direction + "|" + m.text)) return; }
      // Times: new messages after the stored ones are now; earlier gaps sit between their neighbours.
      const prev = pairs.slice(0, i).reverse().find(Boolean);
      const next = pairs.slice(i + 1).find(Boolean);
      const lo = prev ? new Date(prev.sentAt).getTime() : (next ? new Date(next.sentAt).getTime() : now.getTime()) - (i + 1) * 60_000;
      const hi = next ? new Date(next.sentAt).getTime() : now.getTime();
      const age = m.ageSec !== null ? m.ageSec * 1000 : 0;
      const at = after && !next ? now.getTime() - age - (msgs.length - 1 - i) : lo + Math.max(1, (hi - lo) / 2);
      // A preview the list dates more than ten minutes back is history found late, not something that just arrived.
      const live = after && age <= 10 * 60_000 && (kind === "preview" || lastPaired >= 0 || !pool.length);
      const msg = addMessage(db, conv, { direction: m.direction, text: m.text, sentAt: new Date(Math.min(at, now.getTime())).toISOString(), source: "extension" }, live && Boolean(existed || kind === "preview"));
      if (!msg) return;
      if (kind === "preview" && cut(m.text)) msg.partial = true;
      if (live && m.direction === "in") fresh.set(conv.id, m.text);
      if (m.direction === "out") fresh.delete(conv.id); // already answered
      pool.push(msg);
      pairs[i] = msg;
      known.add(m.direction + "|" + m.text);
      added++;
      touched.add(conv.id);
    });
  }
  return { added, matched, conversations: [...touched], fresh: [...fresh].map(([id, text]) => ({ id, text })) };
}

