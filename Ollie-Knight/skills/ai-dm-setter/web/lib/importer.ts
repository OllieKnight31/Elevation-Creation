import type { Db, Platform } from "./types";
import { addMessage, upsertConversation } from "./engine";

/** One thread from Meta's "Download your information" JSON export (messages/inbox/<thread>/message_N.json). */
export interface ExportThread {
  title?: string;
  thread_path?: string;
  participants?: { name: string }[];
  messages?: { sender_name?: string; timestamp_ms?: number; content?: string }[];
}

// Meta's export stores UTF-8 bytes as latin1 characters, which garbles emoji and accents.
export function fixEncoding(s: string) {
  if (!/[Â-ô]/.test(s)) return s;
  try {
    const fixed = Buffer.from(s, "latin1").toString("utf8");
    return fixed.includes("�") ? s : fixed;
  } catch {
    return s;
  }
}

const SYSTEM_LINES = /^(Liked a message|Reacted .* to your message|.* sent an attachment\.|You sent an attachment\.|.* wasn't notified about this message.*)$/i;

export function guessOwner(threads: ExportThread[]) {
  const counts = new Map<string, number>();
  for (const t of threads) for (const p of new Set((t.participants ?? []).map((x) => x.name))) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

export function importExport(db: Db, threads: ExportThread[], platform: Platform, ownerName: string) {
  let conversations = 0;
  let added = 0;
  let skippedGroups = 0;
  for (const t of threads) {
    const parts = (t.participants ?? []).map((p) => fixEncoding(p.name));
    if (parts.length > 2) {
      skippedGroups++;
      continue;
    }
    const owner = fixEncoding(ownerName);
    const other = parts.find((p) => p !== owner) ?? fixEncoding(t.title ?? "Unknown");
    const msgs = (t.messages ?? [])
      .filter((m) => m.content && m.timestamp_ms)
      .map((m) => ({ from: fixEncoding(m.sender_name ?? ""), text: fixEncoding(m.content!), at: new Date(m.timestamp_ms!).toISOString() }))
      .filter((m) => !SYSTEM_LINES.test(m.text))
      .sort((a, b) => a.at.localeCompare(b.at));
    if (!msgs.length) continue;
    const externalId = "export_" + (t.thread_path ?? other).split("/").pop();
    const conv = upsertConversation(db, { platform, externalId, name: other, at: msgs[0].at });
    conversations++;
    for (const m of msgs) {
      if (addMessage(db, conv, { direction: m.from === owner ? "out" : "in", text: m.text, sentAt: m.at, source: "export" }, false)) added++;
    }
  }
  return { conversations, added, skippedGroups };
}
