import { access } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { crmActive, ghlPipelines, ghlPrepareFields, leadPayload, pushLead, sendTest } from "@/lib/crm";

export const maxDuration = 300;

export async function GET(req: Request) {
  const a = await access("settings");
  if (a instanceof Response) return a;
  const { db } = a;
  const q = new URL(req.url).searchParams;
  try {
    if (q.get("what") === "pipelines") return json({ pipelines: await ghlPipelines(db) });
    const sample = db.conversations.find((c) => c.lead.goal) ?? db.conversations[0];
    return json({ sample: sample ? leadPayload(db, sample) : null, log: db.workspace.crm.log });
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}

export async function POST(req: Request) {
  const a = await access("settings");
  if (a instanceof Response) return a;
  const { db } = a;
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "test") return json({ sent: await sendTest(db) });
    if (b.action === "fields") return json(await ghlPrepareFields(db));
    if (b.action === "lead") {
      const c = db.conversations.find((x) => x.id === b.id);
      if (!c) return fail("Conversation not found", 404);
      if (!crmActive(db)) return fail("Switch the CRM sync on first.");
      return json(await pushLead(db, c, "lead.synced"));
    }
    if (b.action === "all") {
      if (!crmActive(db)) return fail("Switch the CRM sync on and add a destination first.");
      const leads = db.conversations.filter((c) => db.workspace.crm.includeDemo || !c.externalId.startsWith("demo_"));
      let ok = 0;
      let failed = 0;
      for (const c of leads) {
        (await pushLead(db, c, "lead.synced")).ok ? ok++ : failed++;
        await new Promise((r) => setTimeout(r, 150)); // stay well under GoHighLevel's 100 requests per 10 seconds
      }
      return json({ ok, failed, skippedDemo: db.conversations.length - leads.length });
    }
    return fail("Unknown action");
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
