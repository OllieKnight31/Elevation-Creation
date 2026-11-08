import { access } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { saveDb } from "@/lib/store";
import { pruneMessages, sheetsScript, sheetsView, syncSheets, testSheets } from "@/lib/sheets";

export const maxDuration = 300;

export async function GET() {
  const a = await access("settings");
  if (a instanceof Response) return a;
  return json({ script: sheetsScript(a.db.workspace), sheets: sheetsView(a.db.workspace) });
}

export async function POST(req: Request) {
  const a = await access("settings");
  if (a instanceof Response) return a;
  const { db } = a;
  const s = db.workspace.sheets;
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "connect") {
      const url = String(b.url ?? "").trim();
      const r = await testSheets(db, url);
      s.url = url;
      s.enabled = true;
      s.lastError = undefined;
      if (r.files.length) s.files = r.files;
      saveDb();
      return json({ sheets: sheetsView(db.workspace), ...(await syncSheets(db)) });
    }
    if (b.action === "settings") {
      if (typeof b.enabled === "boolean") s.enabled = b.enabled && Boolean(s.url);
      if (b.keepDays !== undefined) s.keepDays = Math.max(0, Math.min(3650, Math.round(Number(b.keepDays) || 0)));
      if (b.keepPerThread !== undefined) s.keepPerThread = Math.max(5, Math.min(500, Math.round(Number(b.keepPerThread) || 30)));
      saveDb();
      return json({ sheets: sheetsView(db.workspace) });
    }
    if (b.action === "disconnect") {
      Object.assign(s, { enabled: false, url: "", lastError: undefined });
      saveDb();
      return json({ sheets: sheetsView(db.workspace) });
    }
    if (b.action === "sync") return json({ ...(await syncSheets(db, 60)), sheets: sheetsView(db.workspace) });
    if (b.action === "prune") {
      if (!s.enabled) return fail("Connect the archive first, so nothing is removed before it is in the sheet.");
      await syncSheets(db, 60);
      return json({ ...pruneMessages(db), sheets: sheetsView(db.workspace) });
    }
    return fail("Unknown action");
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
