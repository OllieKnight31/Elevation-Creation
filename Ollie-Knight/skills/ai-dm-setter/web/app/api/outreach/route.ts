import { access } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { saveDb } from "@/lib/store";
import { OUTREACH_DEFAULTS, capToday, cleanCommentTriggers, cleanLinks, cleanSettings, fill, importProspects, outreachStats, outreachStatus, resume, saveCampaign } from "@/lib/outreach";
import type { Db } from "@/lib/types";

function view(db: Db) {
  const o = db.workspace.outreach;
  const counts = new Map<string, Record<string, number>>();
  for (const p of o.prospects) {
    const c = counts.get(p.listId) ?? {};
    c[p.status] = (c[p.status] ?? 0) + 1;
    c.total = (c.total ?? 0) + 1;
    counts.set(p.listId, c);
  }
  return {
    settings: o.settings,
    status: outreachStatus(db),
    cap: capToday(o.settings),
    lists: o.lists.map((l) => ({ ...l, counts: counts.get(l.id) ?? { total: 0 } })),
    campaigns: o.campaigns,
    stats: outreachStats(db),
    log: o.log.slice(-60).reverse(),
    links: o.links,
    commentTriggers: o.commentTriggers,
    igUsername: db.workspace.meta.instagram?.username ?? "",
    limits: { ...OUTREACH_DEFAULTS.pacing, ...OUTREACH_DEFAULTS.variants, privateReplyPerHour: OUTREACH_DEFAULTS.privateReply.perHour },
  };
}

export async function GET(req: Request) {
  const a = await access("outreach");
  if (!("db" in a)) return a;
  const q = new URL(req.url).searchParams;
  const listId = q.get("list");
  if (listId) {
    const page = Math.max(0, Number(q.get("page")) || 0);
    const rows = a.db.workspace.outreach.prospects.filter((p) => p.listId === listId);
    return json({ total: rows.length, rows: rows.slice(page * 100, page * 100 + 100) });
  }
  const v = view(a.db);
  saveDb();
  return json(v);
}

export async function POST(req: Request) {
  const a = await access("outreach");
  if (!("db" in a)) return a;
  const { db } = a;
  const o = db.workspace.outreach;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let extra: Record<string, unknown> = {};
  try {
    switch (body.action) {
      case "settings": o.settings = cleanSettings(body.settings, o.settings); break;
      case "resume": resume(db); break;
      case "import": extra = importProspects(db, String(body.name ?? ""), String(body.text ?? ""), typeof body.listId === "string" ? body.listId : undefined); break;
      case "list.delete": {
        // What was already sent stays on record under its campaign; only the waiting rows go.
        o.prospects = o.prospects.filter((p) => p.listId !== body.id || p.status === "sent" || p.status === "typed");
        o.lists = o.lists.filter((l) => l.id !== body.id || o.prospects.some((p) => p.listId === l.id));
        for (const c of o.campaigns) c.listIds = c.listIds.filter((x) => o.lists.some((l) => l.id === x));
        break;
      }
      case "list.requeue": for (const p of o.prospects) if (p.listId === body.id && p.status === "failed") { p.status = "queued"; p.attempts = 0; p.detail = ""; } break;
      case "campaign.save": extra = { campaign: saveCampaign(db, body.campaign) }; break;
      case "campaign.delete": o.campaigns = o.campaigns.filter((c) => c.id !== body.id); break;
      case "preview": {
        const sample = o.prospects.find((p) => (Array.isArray(body.listIds) ? body.listIds : []).includes(p.listId)) ?? { handle: "jordan.smith", name: "Jordan Smith", fields: {} };
        extra = { preview: fill(String(body.text ?? ""), sample, { ownerName: db.workspace.intake.ownerName, businessName: db.workspace.intake.businessName }), sample: sample.handle };
        break;
      }
      case "links": o.links = cleanLinks(body.links, o.links); break;
      case "comments": o.commentTriggers = cleanCommentTriggers(body.commentTriggers, o.commentTriggers); break;
      default: return fail("Unknown action");
    }
  } catch (e) {
    return fail((e as Error).message);
  }
  saveDb();
  return json({ ...view(db), ...extra });
}
