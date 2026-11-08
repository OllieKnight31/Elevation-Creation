import path from "path";
import { calendarConnected, calendarReady, eventType } from "@/lib/calendar";
import { execFile } from "child_process";
import { access, can } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { checkAi, writeOpener } from "@/lib/ai";
import { cleanHandle, queueTest, testSends } from "@/lib/outreach";
import { saveDb } from "@/lib/store";
import type { Db } from "@/lib/types";
import { metaConfigured, redirectUri } from "@/lib/meta";
import { cfg } from "@/lib/config";

export const dynamic = "force-dynamic";

const helperFolder = () => path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "extension");
/** True when the app runs on the same Mac as the browser, which is when it can open Chrome pages for the person. */
// SETTER_HOSTED_VIEW shows the hosted steps on a local copy, which is how the video guide films them.
const hostedView = () => Boolean(process.env.VERCEL || process.env.SETTER_HOSTED_VIEW);
const isLocal = (req: Request) => !process.env.SETTER_HOSTED_VIEW && process.platform === "darwin" && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(new URL(req.url).host);

async function view(db: Db, settings: boolean, req: Request, fresh = false) {
  const ws = db.workspace;
  const h = ws.helper;
  const o = ws.outreach.settings;
  return {
    helper: { connected: Boolean(h && Date.now() - new Date(h.seenAt).getTime() < 20 * 60_000), seenAt: h?.seenAt ?? "", version: h?.version ?? "",
      // Chrome is running older background code than the installed files: switching the helper off and on fixes it.
      staleCode: Boolean(h?.version && h.code !== h.version), account: h?.account ?? "", outreachOn: h?.outreachOn ?? false },
    // Where the helper's files are on this computer, for the one time it is added to Chrome.
    // Hosted copies have no folder on this computer: the helper is downloaded as a zip instead.
    helperFolder: settings && !hostedView() ? helperFolder() : "",
    helperZip: hostedView() ? "/ainable-setter-helper.zip" : "",
    // The helper's Chrome Web Store page, once it is listed. Adding it is then one click.
    helperStore: hostedView() ? (process.env.HELPER_STORE_URL || "").trim() : "",
    canOpenChrome: settings && isLocal(req),
    ai: await checkAi(fresh),
    // The Instagram sign in button needs the business's own Meta app, set up once by the owner.
    meta: {
      configured: metaConfigured(),
      appId: settings ? cfg("META_APP_ID") : "",
      // The Meta app's own ID (the dashboard one, not the Instagram app ID). It builds links to the app's pages.
      dashId: settings ? cfg("META_DASHBOARD_APP_ID") : "",
      redirect: redirectUri(new URL(req.url).origin),
      https: redirectUri(new URL(req.url).origin).startsWith("https://"),
      webhook: `${cfg("APP_BASE_URL") || new URL(req.url).origin}/api/meta/webhook`,
      site: cfg("APP_BASE_URL") || new URL(req.url).origin,
      verifyToken: settings ? cfg("META_VERIFY_TOKEN") : "",
    },
    inbox: ws.meta.instagram
      ? { connected: true, username: ws.meta.instagram.username, lastWebhookAt: ws.meta.instagram.lastWebhookAt ?? "", lastSyncAt: ws.meta.instagram.lastSyncAt ?? "", syncError: ws.meta.instagram.syncError ?? "" }
      : { connected: false, username: "", lastWebhookAt: "", lastSyncAt: "", syncError: "" },
    crm: ws.crm.enabled && (Boolean(ws.crm.webhookUrl) || ws.crm.ghl.enabled),
    calendar: { connected: calendarConnected(ws), ready: calendarReady(ws), name: ws.calendar.user?.name ?? "", meeting: eventType(ws)?.name ?? "" },
    outreach: { account: o.account, enabled: o.enabled, paused: o.paused, pauseReason: o.pauseReason },
    tests: testSends(db),
  };
}

/** Everything the Get connected screen needs to show what is linked and what is not. */
export async function GET(req: Request) {
  const a = await access("any");
  if (a instanceof Response) return a;
  return json(await view(a.db, can(a.me, "settings"), req, new URL(req.url).searchParams.has("fresh")));
}

export async function POST(req: Request) {
  const a = await access(["outreach", "settings"]);
  if (a instanceof Response) return a;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (b.action === "test") {
      // The AI writes the test itself and the helper sends it, so the test is the setter working on its own.
      const handle = cleanHandle(String(b.handle ?? ""));
      if (!handle) return fail("Type the Instagram username to send the test to, for example your second account.");
      const opener = await writeOpener(a.db, handle);
      queueTest(a.db, { handle, text: opener.text, mode: "auto" });
    }
    else if (b.action === "open-helper") {
      // Web pages are not allowed to link to Chrome's own add on page, but this Mac can open it directly.
      if (!isLocal(req) || !can(a.me, "settings")) return fail("This only works on the computer the app is running on.");
      execFile("open", ["-a", "Google Chrome", "chrome://extensions"], () => {});
      const copy = execFile("pbcopy", () => {});
      copy.stdin?.end(helperFolder());
    } else if (b.action === "account") a.db.workspace.outreach.settings.account = a.db.workspace.helper?.account ?? "";
    else return fail("Unknown action");
  } catch (e) {
    return fail((e as Error).message);
  }
  saveDb();
  return json(await view(a.db, can(a.me, "settings"), req));
}
