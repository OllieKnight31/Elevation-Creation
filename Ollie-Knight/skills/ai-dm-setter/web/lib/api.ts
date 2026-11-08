import { NextResponse } from "next/server";
import type { Conversation, Db, Member, Workspace } from "./types";
import { can, publicMember } from "./auth";
import { profileUrl } from "./supabase";
import { freshDb } from "./store";
import { windowState } from "./pipeline";
import { openGap } from "./knowledge";
import { calendarView } from "./calendar";
import { sheetsView } from "./sheets";
import { sendVia } from "./engine";

/** The helper has checked in within the last few minutes and has sending switched on, so a queued reply will go. */
export const helperReady = (db: Db) => {
  const h = db.workspace.helper;
  return Boolean(h && h.outreachOn && Date.now() - new Date(h.seenAt).getTime() < 20 * 60_000);
};

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Workspace without secrets, safe to send to the browser. */
export function publicWorkspace(ws: Workspace, me?: Member) {
  // Outreach lists and the knowledge base can be large, so they travel through their own routes.
  const { secret: _secret, outreach: _outreach, knowledge: _knowledge, calendar: _calendar, sheets: _sheets, ...rest } = ws;
  const settings = !me || can(me, "settings");
  return {
    ...rest,
    // The workspace token opens the extension and booking hooks, so only people who manage settings see it.
    apiToken: settings ? ws.apiToken : "",
    members: ws.members.map(publicMember),
    calendar: calendarView(ws),
    sheets: settings ? sheetsView(ws) : null,
    crm: { ...ws.crm, log: settings ? ws.crm.log : [], webhookUrl: settings ? ws.crm.webhookUrl : "", ghl: { ...ws.crm.ghl, token: undefined, tokenSet: Boolean(ws.crm.ghl.token) } },
    meta: {
      instagram: ws.meta.instagram ? { username: ws.meta.instagram.username, connectedAt: ws.meta.instagram.connectedAt } : null,
      page: ws.meta.page ? { name: ws.meta.page.name, connectedAt: ws.meta.page.connectedAt } : null,
      datasetId: ws.meta.datasetId ?? "",
      capiTokenSet: Boolean(ws.meta.capiToken),
      capiEnabled: ws.meta.capiEnabled,
      mirrorMessengerLabels: ws.meta.mirrorMessengerLabels,
    },
  };
}

type MsgStats = Map<string, { count: number; last: Db["messages"][number] | null }>;

/** Message count and latest message for every conversation, in one pass. For lists of many conversations. */
export function messageStats(db: Db): MsgStats {
  const out: MsgStats = new Map();
  for (const m of db.messages) {
    const s = out.get(m.conversationId);
    if (!s) out.set(m.conversationId, { count: 1, last: m });
    else { s.count++; if (!s.last || m.sentAt > s.last.sentAt) s.last = m; }
  }
  return out;
}

export function convView(db: Db, c: Conversation, stats?: MsgStats) {
  const st = stats ? stats.get(c.id) ?? { count: 0, last: null } : null;
  const msgs = st ? [] : db.messages.filter((m) => m.conversationId === c.id);
  const last = st ? st.last : msgs.reduce<(typeof msgs)[number] | null>((a, m) => (!a || m.sentAt > a.sentAt ? m : a), null);
  const count = st ? st.count : msgs.length;
  return { ...c, profileUrl: profileUrl(c), sendVia: sendVia(db, c), helperReady: helperReady(db), window: windowState(c.lastInboundAt), preview: last ? (last.direction === "out" ? "You: " : "") + last.text : "", seen: Boolean(last && last.direction === "out" && last.seenAt), messageCount: count, gap: openGap(db, c) ?? null };
}

export async function extAuth(req: Request): Promise<Db | null> {
  const db = await freshDb();
  const h = req.headers.get("authorization") || "";
  return h === `Bearer ${db.workspace.apiToken}` ? db : null;
}
