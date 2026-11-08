import fs from "fs";
import path from "path";
import { DATA_DIR } from "./config";
import { avatarHostOk } from "./engine";
import { hostedConfigured, hostedSql, hostedTable } from "./hosted";

/*
 * Saved profile pictures. Instagram's picture addresses stop working after a few days, so the picture itself is kept
 * the first time it is fetched. It lives outside the working copy (its own table when hosted, files otherwise), so
 * thousands of pictures never slow down loading the inbox.
 */

export interface SavedAvatar { url: string; type: string; data: Buffer }

const MAX_BYTES = 400_000;
let ready: Promise<void> | null = null;
const tbl = () => `${hostedTable()}_avatars`;

function schema() {
  return (ready ??= hostedSql().query(`create table if not exists ${tbl()} (id text primary key, url text not null, type text not null, data text not null, at timestamptz not null default now())`).then(() => {}));
}

const dir = () => path.join(DATA_DIR, "avatars");
const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "");

export async function savedAvatar(id: string): Promise<SavedAvatar | null> {
  if (hostedConfigured()) {
    await schema();
    const r = (await hostedSql().query(`select url, type, data from ${tbl()} where id = $1`, [id])) as { url: string; type: string; data: string }[];
    return r[0] ? { url: r[0].url, type: r[0].type, data: Buffer.from(r[0].data, "base64") } : null;
  }
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir(), `${safe(id)}.json`), "utf8"));
    return { url: meta.url, type: meta.type, data: fs.readFileSync(path.join(dir(), `${safe(id)}.bin`)) };
  } catch {
    return null;
  }
}

async function store(id: string, a: SavedAvatar) {
  if (hostedConfigured()) {
    await schema();
    await hostedSql().query(
      `insert into ${tbl()} (id, url, type, data, at) values ($1, $2, $3, $4, now()) on conflict (id) do update set url = excluded.url, type = excluded.type, data = excluded.data, at = now()`,
      [id, a.url, a.type, a.data.toString("base64")],
    );
    return;
  }
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(path.join(dir(), `${safe(id)}.bin`), a.data);
  fs.writeFileSync(path.join(dir(), `${safe(id)}.json`), JSON.stringify({ url: a.url, type: a.type }));
}

/** Fetches the picture at url and keeps it for this conversation. Returns it, or null when the address no longer works. */
export async function fetchAndSave(id: string, url: string): Promise<SavedAvatar | null> {
  if (!avatarHostOk(url)) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) return null;
    const data = Buffer.from(await r.arrayBuffer());
    if (!data.length || data.length > MAX_BYTES) return null;
    const a = { url, type, data };
    await store(id, a);
    return a;
  } catch {
    return null;
  }
}

/**
 * Saves the pictures not saved yet, newest chats first, a few per call so a request stays quick. Returns how many.
 * The conversation records which address is saved, so nothing is fetched twice.
 */
export async function saveMissing(convs: { id: string; avatar?: string; avatarSaved?: string; lastMessageAt?: string | null }[], limit = 20) {
  const todo = convs.filter((c) => c.avatar && c.avatarSaved !== c.avatar).sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "")).slice(0, limit);
  let saved = 0;
  for (const c of todo) {
    // Expired or refused: marked done anyway, so it is not retried every time. A new address clears it.
    if (await fetchAndSave(c.id, c.avatar!)) saved++;
    c.avatarSaved = c.avatar;
  }
  return saved;
}

const PREVIEW_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const handleOk = (h: string) => /^[a-z0-9._]{1,30}$/.test(h);
const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#064;/g, "@");

/**
 * A lead's picture without Meta's API and without the helper: Instagram gives the link preview of a public profile
 * (the picture shown when a profile link is pasted in a chat) to preview bots. Only the page head is read, and the
 * preview must name this exact profile. Returns the address, "" when there is no picture or no such profile, or null
 * when Instagram did not answer (worth trying again later).
 */
export async function publicPicture(handle: string): Promise<string | null> {
  if (!handleOk(handle)) return "";
  try {
    const r = await fetch(`https://www.instagram.com/${handle}/`, { headers: { "user-agent": PREVIEW_UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(10_000) });
    if (r.status === 404) return "";
    if (!r.ok || !r.body) return null;
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let html = "";
    while (html.length < 400_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (html.includes("</head>") || (html.includes("og:image") && html.includes("og:url"))) break;
    }
    reader.cancel().catch(() => {});
    const meta = (p: string) => unescape(html.match(new RegExp(`<meta[^>]+property="og:${p}"[^>]+content="([^"]+)"`))?.[1] ?? "");
    const page = meta("url").toLowerCase();
    // No preview at all is usually Instagram declining this caller (a login page), not a missing picture.
    if (!page) return null;
    if (!page.replace(/\/$/, "").endsWith(`/${handle}`)) return "";
    return meta("image");
  } catch {
    return null;
  }
}

export interface FaceConv { id: string; platform: string; handle?: string | null; avatar?: string; avatarSaved?: string; avatarAt?: string; faceTriedAt?: string; labels: string[]; lastMessageAt?: string | null }

/** Instagram chats still without a picture, newest first, not tried in the last two weeks. */
export function facesNeeded<T extends FaceConv>(convs: T[]) {
  const cutoff = Date.now() - 14 * 864e5;
  return convs
    .filter((c) => c.platform === "instagram" && c.handle && handleOk(c.handle) && !c.avatar && !c.labels.includes("Do not contact") && (!c.faceTriedAt || new Date(c.faceTriedAt).getTime() < cutoff))
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

/**
 * Fills in missing pictures from link previews, a few at a time, until the time budget runs out. The picture is
 * saved at once, before its address expires. Stops early if Instagram stops answering. Returns what it did.
 */
export async function fillFaces<T extends FaceConv>(convs: T[], budgetMs: number, setAvatar: (c: T, url: string) => boolean) {
  const end = Date.now() + budgetMs;
  const queue = facesNeeded(convs);
  let saved = 0, checked = 0, failures = 0;
  const worker = async () => {
    while (Date.now() < end && failures < 8) {
      const c = queue.shift();
      if (!c) return;
      const url = await publicPicture(c.handle!.toLowerCase());
      if (url === null) { failures++; continue; }
      failures = 0;
      checked++;
      c.faceTriedAt = new Date().toISOString();
      if (url && setAvatar(c, url)) {
        if (await fetchAndSave(c.id, url)) saved++;
        c.avatarSaved = url;
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { saved, checked, remaining: facesNeeded(convs).length, blocked: failures >= 8 };
}
