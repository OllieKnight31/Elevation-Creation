import { freshDb, saveDb } from "@/lib/store";
import { addMessage, deliver, identifyInstagram, refreshProfile, setLabels, uid, upsertConversation } from "@/lib/engine";
import { sendPrivateReply, verifySignature } from "@/lib/meta";
import { matchComment, privateReplyAllowed } from "@/lib/outreach";
import { pipelineOf } from "@/lib/pipeline";
import type { Conversation, Db } from "@/lib/types";
import { onHumanReply, onInbound } from "@/lib/live";
import type { Platform } from "@/lib/types";
import { cfg } from "@/lib/config";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const expected = cfg("META_VERIFY_TOKEN");
  if (expected && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === expected) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

interface Messaging {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[]; reply_to?: { story?: unknown } };
  referral?: { source?: string; ref?: string; ad_id?: string };
  /** A seen receipt: Instagram names the last message read, Messenger gives a time up to which all are read. */
  read?: { mid?: string; watermark?: number };
}

/**
 * The lead opened the chat. Every message the business sent up to the one they read is marked seen, so the inbox can
 * show Seen like Instagram does. A receipt for a chat the app does not know yet is ignored.
 */
function onSeen(db: Db, platform: Platform, leadId: string, read: NonNullable<Messaging["read"]>, timestamp?: number) {
  const conv = db.conversations.find((c) => c.platform === platform && (c.scopedUserId === leadId || c.externalId === leadId));
  if (!conv) return;
  const at = new Date(timestamp ?? Date.now()).toISOString();
  const mine = db.messages.filter((m) => m.conversationId === conv.id && m.direction === "out");
  const named = read.mid ? mine.find((m) => m.externalId === read.mid) : undefined;
  // Up to the message named, or the watermark, or, failing both, everything sent before the receipt.
  const upTo = named ? named.sentAt : read.watermark ? new Date(read.watermark).toISOString() : at;
  for (const m of mine) if (!m.seenAt && m.sentAt <= upTo) m.seenAt = at;
  if (!conv.seenAt || conv.seenAt < at) conv.seenAt = at;
}

interface Change {
  field?: string;
  value?: { id?: string; text?: string; from?: { id?: string; username?: string }; media?: { id?: string } };
}

const tagsFor = (db: Db, conv: Conversation, tags: string[]) => {
  const allowed = pipelineOf(db.workspace.pipeline).allTags;
  const add = tags.filter((t) => allowed.includes(t) && !conv.labels.includes(t));
  if (add.length) setLabels(db, conv, [...conv.labels, ...add], "system");
};

/** Someone opened the chat through one of our ig.me links: tag them and send that link's greeting once. */
async function onLink(db: Db, conv: Conversation, ref: string) {
  const link = db.workspace.outreach.links.find((l) => l.ref === ref.toLowerCase());
  if (!link) return false;
  const key = `link:${link.id}`;
  if (conv.firedTriggers?.includes(key)) return false;
  (conv.firedTriggers ??= []).push(key);
  link.opened++;
  conv.origin = `Link: ${link.label}`;
  tagsFor(db, conv, link.tags);
  db.events.push({ id: uid("e"), conversationId: conv.id, type: "starter_fired", detail: `Link: ${link.label}`, by: "system", at: new Date().toISOString() });
  if (!link.opener.trim() || conv.labels.includes("Do not contact") || conv.labels.includes("Close friend")) return false;
  conv.lastInboundAt ??= new Date().toISOString();
  await deliver(db, conv, link.opener.split(/\n\s*---\s*\n/).map((x) => x.trim()).filter(Boolean), "auto").catch((e) => console.error("Link greeting failed", (e as Error).message));
  return true;
}

/** A comment on one of the account's posts. A matching keyword gets one private reply in the DMs. */
async function onComment(db: Db, v: NonNullable<Change["value"]>, ownId: string) {
  const o = db.workspace.outreach;
  if (!v.id || !v.text || !v.from?.id || v.from.id === ownId) return;
  if (o.repliedComments.includes(v.id)) return;
  const trig = matchComment(db, v.text);
  if (!trig) return;
  if (!privateReplyAllowed()) { console.error("Private reply skipped: hourly limit reached"); return; }
  o.repliedComments.push(v.id);
  if (o.repliedComments.length > 2000) o.repliedComments.splice(0, o.repliedComments.length - 2000);
  const name = v.from.username ? `@${v.from.username}` : `Instagram user ${v.from.id.slice(-4)}`;
  const first = v.from.username ? v.from.username.split(/[._]/)[0] : "";
  const text = trig.reply.replace(/\{\{?\s*(first_name|firstName|name)\s*(?:\|([^{}]*))?\}?\}/g, (_m, _k, fb?: string) => ((/^[a-z]{2,20}$/i.test(first) ? first[0].toUpperCase() + first.slice(1).toLowerCase() : "") || (fb ?? "").trim())).replace(/\{\{?\s*(username|handle)\s*\}?\}/g, v.from.username ?? "").replace(/[ \t]+([,.!?])/g, "$1");
  try {
    await sendPrivateReply(db.workspace, v.id, text);
  } catch (e) {
    console.error("Private reply failed", (e as Error).message);
    return;
  }
  trig.fired++;
  const at = new Date().toISOString();
  const conv = upsertConversation(db, { platform: "instagram", externalId: v.from.id, scopedUserId: v.from.id, handle: v.from.username ?? null, name, origin: `Comment: ${trig.name}`, at });
  addMessage(db, conv, { direction: "in", text: `[Commented] ${v.text}`, sentAt: at, source: "webhook", externalId: `comment_${v.id}` }, false);
  addMessage(db, conv, { direction: "out", sender: "auto", text, sentAt: at, source: "app" }, true);
  tagsFor(db, conv, trig.tags);
  db.events.push({ id: uid("e"), conversationId: conv.id, type: "starter_fired", detail: `Comment: ${trig.name}`, by: "system", at });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("Bad signature", { status: 401 });
  const body = JSON.parse(raw) as { object?: string; entry?: { id: string; messaging?: Messaging[]; changes?: Change[] }[] };
  const platform: Platform = body.object === "page" ? "messenger" : "instagram";
  const db = await freshDb();

  for (const entry of body.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      if ((ch.field === "comments" || ch.field === "live_comments") && ch.value) await onComment(db, ch.value, entry.id);
    }
    for (const ev of entry.messaging ?? []) {
      if (ev.read && ev.sender) { onSeen(db, platform, ev.sender.id, ev.read, ev.timestamp); continue; }
      const msg = ev.message;
      // An ig.me link opened on a thread that already exists arrives as a referral with no message.
      if (!msg && ev.referral?.ref && ev.sender) {
        const c = upsertConversation(db, { platform, externalId: ev.sender.id, scopedUserId: ev.sender.id, name: `${platform === "instagram" ? "Instagram" : "Messenger"} user ${ev.sender.id.slice(-4)}`, origin: "Inbound DM" });
        await onLink(db, c, ev.referral.ref);
        continue;
      }
      if (!msg || !ev.sender || !ev.recipient) continue;
      // An echo is a message the business sent, including ones typed by hand in the Instagram app.
      const echo = Boolean(msg.is_echo);
      const leadId = echo ? ev.recipient.id : ev.sender.id;
      const text = msg.text ?? (msg.attachments?.length ? "[attachment]" : "");
      if (!text) continue;
      const at = new Date(ev.timestamp ?? Date.now()).toISOString();
      const origin = ev.referral?.source === "ADS" ? "Ad click" : msg.reply_to?.story ? "Story reply" : "Inbound DM";
      const conv = platform === "instagram"
        ? await identifyInstagram(db, leadId, { origin, at })
        : upsertConversation(db, { platform, externalId: leadId, scopedUserId: leadId, name: `Messenger user ${leadId.slice(-4)}`, origin, at });
      const added = addMessage(db, conv, { direction: echo ? "out" : "in", text, sentAt: at, source: "webhook", externalId: msg.mid }, true);
      // They messaged, so Meta now shares their profile: pick up or renew the picture.
      if (added && !echo && platform === "instagram") await refreshProfile(db, conv).catch(() => false);
      const ref = ev.referral?.ref ?? (msg as { referral?: { ref?: string } }).referral?.ref;
      // A link's own greeting takes this turn, so the AI does not also answer the first message.
      const greeted = added && !echo && ref ? await onLink(db, conv, ref) : false;
      if (added && !echo && !greeted) onInbound(db, conv, text);
      // A reply typed by hand in the Instagram app answers a held question just as one sent from here does.
      if (added && echo) onHumanReply(db, conv, text, undefined, 45_000);
    }
  }
  if (platform === "instagram" && db.workspace.meta.instagram) db.workspace.meta.instagram.lastWebhookAt = new Date().toISOString();
  saveDb();
  return new Response("EVENT_RECEIVED", { status: 200 });
}
