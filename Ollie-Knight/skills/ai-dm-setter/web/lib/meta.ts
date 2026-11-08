import crypto from "crypto";
import type { Conversation, Workspace } from "./types";
import type { StageDef } from "./pipeline";
import { cfg } from "./config";

// Official Meta APIs only. Endpoints follow the "Instagram API with Instagram Login" and
// Messenger Platform docs. None of this has been exercised against a live Meta app yet.
export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const appId = () => cfg("META_APP_ID");
const appSecret = () => cfg("META_APP_SECRET");
// META_IG_BASE exists so the integration can be exercised against a local stand-in for Meta.
const IG = process.env.META_IG_BASE || `https://graph.instagram.com/${GRAPH_VERSION}`;
// Token calls live at the root of graph.instagram.com, without a version.
const IG_ROOT = IG.replace(/\/v[\d.]+$/, "");
const FB = `https://graph.facebook.com/${GRAPH_VERSION}`;

// manage_comments is what lets a comment on a post be answered with a private reply in the DMs.
export const IG_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages", "instagram_business_manage_comments"];

export function metaConfigured() {
  return Boolean(appId() && appSecret());
}

export function redirectUri(origin: string) {
  return `${cfg("APP_BASE_URL") || origin}/api/meta/callback`;
}

export function instagramAuthUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: IG_SCOPES.join(","),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${p}`;
}

async function j(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || body?.error_message || `Meta API ${res.status}`);
  return body;
}

export async function exchangeInstagramCode(origin: string, code: string) {
  const form = new URLSearchParams({
    client_id: appId(),
    client_secret: appSecret(),
    grant_type: "authorization_code",
    redirect_uri: redirectUri(origin),
    code,
  });
  const first = await j(await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form }));
  // Meta has returned both { access_token } and { data: [{ access_token }] } for this call.
  const short = first.access_token ? first : (first.data?.[0] ?? {});
  const long = await j(
    await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret()}&access_token=${short.access_token}`,
    ),
  );
  return connectWithToken(long.access_token as string);
}

/** Validates a token, reads the account it belongs to and subscribes the account to message webhooks. */
export async function connectWithToken(accessToken: string) {
  const me = await j(await fetch(`${IG}/me?fields=user_id,username&access_token=${encodeURIComponent(accessToken)}`));
  // Webhook subscription is best effort: polling keeps the inbox in sync without it.
  // Referrals carry which chat link or ad someone came through; comments feed comment to DM replies.
  // An app without those permissions refuses the longer list, so fall back to messages alone.
  const webhooks = await subscribeWebhooks(accessToken);
  return { userId: String(me.user_id ?? me.id), username: me.username as string, accessToken, webhooks };
}

/** Bumped when the list of webhook fields grows, so accounts connected earlier are subscribed again. */
export const WEBHOOK_FIELDS_VERSION = 2;

/**
 * Subscribes the account to the webhook fields the app uses. Seen receipts (messaging_seen) show Seen in the inbox.
 * An app without some permission refuses the longer list, so it falls back to shorter ones.
 */
export async function subscribeWebhooks(accessToken: string) {
  for (const fields of ["messages,message_echoes,messaging_seen,messaging_referral,comments", "messages,message_echoes,messaging_seen", "messages,message_echoes", "messages"]) {
    try {
      await j(await fetch(`${IG}/me/subscribed_apps?subscribed_fields=${fields}&access_token=${encodeURIComponent(accessToken)}`, { method: "POST" }));
      return true;
    } catch { /* try the shorter list */ }
  }
  return false;
}

export function verifySignature(rawBody: string, header: string | null) {
  const secret = appSecret();
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!header) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Send one text message through the official Send API. Throws if the account is not connected. */
export async function sendMessage(ws: Workspace, conv: Conversation, text: string, humanAgent = false) {
  if (!conv.scopedUserId) throw new Error("This thread has no API recipient id yet. It was imported, not received through the API.");
  // Outside the 24 hour window Meta only accepts a person's reply, flagged with the human agent tag (up to 7 days).
  const body = JSON.stringify({
    recipient: { id: conv.scopedUserId },
    message: { text },
    ...(humanAgent ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" } : {}),
  });
  const headers = { "Content-Type": "application/json" };
  if (conv.platform === "instagram") {
    const ig = ws.meta.instagram;
    if (!ig) throw new Error("Instagram is not connected.");
    return j(await fetch(`${IG}/me/messages?access_token=${ig.accessToken}`, { method: "POST", headers, body }));
  }
  const page = ws.meta.page;
  if (!page) throw new Error("Facebook Page is not connected.");
  return j(await fetch(`${FB}/${page.pageId}/messages?access_token=${page.accessToken}`, { method: "POST", headers, body }));
}

/** Shows the "typing" bubble to the lead. Never throws: it is decoration, the message matters. */
export async function sendTyping(ws: Workspace, conv: Conversation) {
  if (!conv.scopedUserId) return;
  const body = JSON.stringify({ recipient: { id: conv.scopedUserId }, sender_action: "typing_on" });
  const headers = { "Content-Type": "application/json" };
  try {
    if (conv.platform === "instagram" && ws.meta.instagram) await fetch(`${IG}/me/messages?access_token=${ws.meta.instagram.accessToken}`, { method: "POST", headers, body, signal: AbortSignal.timeout(8000) });
    else if (conv.platform === "messenger" && ws.meta.page) await fetch(`${FB}/${ws.meta.page.pageId}/messages?access_token=${ws.meta.page.accessToken}`, { method: "POST", headers, body, signal: AbortSignal.timeout(8000) });
  } catch { /* the reply still goes out */ }
}

/**
 * Answers a comment on one of the account's posts with a direct message. Meta allows one private reply
 * for each comment, within 7 days of it, and the person can then reply to open a normal conversation.
 */
export async function sendPrivateReply(ws: Workspace, commentId: string, text: string) {
  const ig = ws.meta.instagram;
  if (!ig) throw new Error("Instagram is not connected.");
  return j(await fetch(`${IG}/me/messages?access_token=${ig.accessToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }) }));
}

export interface ApiThread {
  id: string;
  participantId: string;
  participantName: string;
  messages: { id: string; fromMe: boolean; text: string; at: string }[];
}

/** Backfill through the Conversations API. Meta returns detail for the 20 most recent messages per thread only. */
/**
 * Instagram threads, newest first, 25 to a page. `after` is Meta's paging cursor from the previous call, so a long
 * history can be read a page at a time across several requests, none of which runs into the server time limit.
 */
export async function fetchInstagramThreads(ws: Workspace, opts: { pages?: number; after?: string } = {}): Promise<{ threads: ApiThread[]; after: string | null }> {
  const ig = ws.meta.instagram;
  if (!ig) throw new Error("Instagram is not connected.");
  const out: ApiThread[] = [];
  let after: string | null = opts.after || null;
  for (let page = 0; page < (opts.pages ?? 1); page++) {
    const url = `${IG}/me/conversations?platform=instagram&fields=id,participants,messages.limit(20){id,created_time,from,to,message}&limit=25${after ? `&after=${encodeURIComponent(after)}` : ""}&access_token=${ig.accessToken}`;
    const res: { data?: Record<string, unknown>[]; paging?: { next?: string; cursors?: { after?: string } } } = await j(await fetch(url));
    for (const t of res.data ?? []) {
      const parts = ((t.participants as { data?: { id: string; username?: string }[] })?.data ?? []).filter((p) => String(p.id) !== ig.userId);
      const other = parts[0];
      if (!other) continue;
      const msgs = ((t.messages as { data?: Record<string, unknown>[] })?.data ?? []).map((m) => ({
        id: String(m.id),
        fromMe: String((m.from as { id?: string })?.id) === ig.userId,
        text: String(m.message ?? ""),
        at: String(m.created_time),
      }));
      out.push({ id: String(t.id), participantId: String(other.id), participantName: other.username || "Instagram user", messages: msgs.filter((m) => m.text) });
    }
    after = res.paging?.next && res.paging.cursors?.after ? res.paging.cursors.after : null;
    if (!after) break;
    await new Promise((r) => setTimeout(r, 600)); // stay under 2 calls per second
  }
  return { threads: out, after };
}

/** Who an Instagram scoped id belongs to: username, display name and picture. Empty fields when Meta does not share them. */
export async function fetchProfile(ws: Workspace, igsid: string): Promise<{ username: string; name: string; pic: string }> {
  const ig = ws.meta.instagram;
  const none = { username: "", name: "", pic: "" };
  if (!ig) return none;
  try {
    const r = await fetch(`${IG}/${encodeURIComponent(igsid)}?fields=name,username,profile_pic&access_token=${ig.accessToken}`, { signal: AbortSignal.timeout(8000) });
    const d = (await r.json().catch(() => ({}))) as { profile_pic?: string; username?: string; name?: string };
    if (!r.ok) return none;
    return { username: typeof d.username === "string" ? d.username : "", name: typeof d.name === "string" ? d.name : "", pic: typeof d.profile_pic === "string" ? d.profile_pic : "" };
  } catch {
    return none;
  }
}

/** A lead's profile picture address through the Instagram API. Empty when Meta does not share it. */
export async function fetchProfilePic(ws: Workspace, igsid: string): Promise<string> {
  return (await fetchProfile(ws, igsid)).pic;
}

/**
 * Keeps the Instagram login alive. Meta's long-lived token lasts 60 days and can be renewed once it is a day old;
 * this renews it weekly. Returns true when it was renewed.
 */
export async function refreshInstagramToken(ws: Workspace, now = Date.now()) {
  const ig = ws.meta.instagram;
  if (!ig) return false;
  const last = new Date(ig.refreshedAt ?? ig.connectedAt).getTime();
  if (now - last < 7 * 864e5) return false;
  const d = await j(await fetch(`${IG_ROOT}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(ig.accessToken)}`));
  if (typeof d.access_token !== "string") throw new Error("Meta did not return a renewed token.");
  ig.accessToken = d.access_token;
  ig.refreshedAt = new Date(now).toISOString();
  return true;
}

/** Mirror tags onto Messenger threads with the Page custom labels API. Instagram has no label API. */
export async function applyMessengerLabels(ws: Workspace, psid: string, labels: string[]) {
  const page = ws.meta.page;
  if (!page) throw new Error("Facebook Page is not connected.");
  const existing: { data?: { id: string; page_label_name?: string; name?: string }[] } = await j(
    await fetch(`${FB}/${page.pageId}/custom_labels?fields=id,page_label_name&limit=200&access_token=${page.accessToken}`),
  );
  for (const name of labels) {
    let id = existing.data?.find((l) => (l.page_label_name ?? l.name) === name)?.id;
    if (!id) {
      const created = await j(
        await fetch(`${FB}/${page.pageId}/custom_labels?access_token=${page.accessToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page_label_name: name }),
        }),
      );
      id = created.id;
    }
    await j(
      await fetch(`${FB}/${id}/label?access_token=${page.accessToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: psid }),
      }),
    );
  }
}

/**
 * Conversions API for business messaging: tells Meta a lead reached a stage.
 * One way only. It cannot read or send DMs.
 */
export async function sendStageEvent(ws: Workspace, conv: Conversation, stage: StageDef) {
  if (!ws.meta.capiEnabled) return { status: "skipped" as const, note: "Conversions API is switched off" };
  if (!stage.capiEvent) return { status: "skipped" as const, note: "No Meta event mapped to this stage" };
  if (!ws.meta.datasetId || !ws.meta.capiToken) return { status: "skipped" as const, note: "Dataset ID or token missing" };
  if (!conv.scopedUserId) return { status: "skipped" as const, note: "Thread has no Meta user id (imported thread)" };

  const user_data =
    conv.platform === "instagram"
      ? { instagram_business_account_id: ws.meta.instagram?.userId, ig_sid: conv.scopedUserId }
      : { page_id: ws.meta.page?.pageId, page_scoped_user_id: conv.scopedUserId };
  const payload = {
    data: [
      {
        event_name: stage.capiEvent,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "business_messaging",
        messaging_channel: conv.platform,
        user_data,
        custom_data: { lead_stage: stage.name },
      },
    ],
  };
  try {
    await j(
      await fetch(`${FB}/${ws.meta.datasetId}/events?access_token=${ws.meta.capiToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    return { status: "sent" as const, eventName: stage.capiEvent };
  } catch (e) {
    return { status: "failed" as const, eventName: stage.capiEvent, note: (e as Error).message };
  }
}
