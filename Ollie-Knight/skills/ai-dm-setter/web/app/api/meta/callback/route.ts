import { background } from "@/lib/hosted";
import { backfillInstagram, setAvatar } from "@/lib/engine";
import { fillFaces } from "@/lib/avatars";
import { NextResponse } from "next/server";
import { flushNow, freshDb, saveDb } from "@/lib/store";
import { exchangeInstagramCode } from "@/lib/meta";

// Long enough for the first import of past chats, which runs after the answer is sent.
export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const db = await freshDb();
  const back = /(?:^|;\s*)setter_back=connect(?:;|$)/.test(req.headers.get("cookie") ?? "") ? "connect" : "settings";
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.get("state") !== db.workspace.apiToken.slice(-16)) {
    return NextResponse.redirect(`${url.origin}/${back}?meta=denied`);
  }
  try {
    const ig = await exchangeInstagramCode(url.origin, code.replace(/#_$/, ""));
    db.workspace.meta.instagram = { userId: ig.userId, username: ig.username, accessToken: ig.accessToken, connectedAt: new Date().toISOString(), backfillAfter: "", backfillDone: false, webhookFields: 2 };
    saveDb();
    // Past chats come in straight away, without anyone pressing a button.
    background(async () => { await backfillInstagram(db, 200_000); saveDb(); await flushNow(); await fillFaces(db.conversations, 45_000, setAvatar).catch(() => null); saveDb(); await flushNow(); });
    return NextResponse.redirect(`${url.origin}/${back}?meta=connected`);
  } catch (e) {
    return NextResponse.redirect(`${url.origin}/${back}?meta=error&detail=${encodeURIComponent((e as Error).message)}`);
  }
}
