import { saveDb } from "@/lib/store";
import { access, can } from "@/lib/auth";
import { fail, json, publicWorkspace } from "@/lib/api";
import { cleanPipeline, DEFAULT_TAGS, STAGES } from "@/lib/pipeline";
import { cleanShortcuts } from "@/lib/shortcuts";
import { cleanTriggers } from "@/lib/engine";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function PUT(req: Request) {
  const a = await access("any");
  if (a instanceof Response) return a;
  const { db, me } = a;
  const body = await req.json();
  const ws = db.workspace;
  // Each part of the workspace belongs to one screen, and needs access to that screen to change.
  const needs: [unknown, Parameters<typeof can>[1]][] = [
    [body.intake, "brief"], [body.onboardingComplete, "brief"], [body.pipeline, "pipeline"],
    [body.settings, "settings"], [body.meta, "settings"], [body.shortcuts, "settings"], [body.triggers, "settings"], [body.crm, "settings"], [body.targets, "insights"],
  ];
  // Conversion links are edited from Settings as well as the brief.
  const onlyGoals = body.intake && Object.keys(body.intake).every((k) => k === "goals");
  for (const [part, area] of needs) {
    if (part === undefined) continue;
    if (part === body.intake && onlyGoals && can(me, "settings")) continue;
    if (!can(me, area)) return fail("Your account cannot change this.", 403);
  }

  if (body.intake) {
    ws.intake = { ...ws.intake, ...body.intake };
    ws.intake.goals = (ws.intake.goals ?? []).slice(0, 20).map((g) => ({ ...g, label: str(g.label, 60), url: str(g.url, 500), when: str(g.when, 240), ...(str(g.message, 400) ? { message: str(g.message, 400) } : { message: undefined }) }));
  }
  if (body.settings) ws.settings = { ...ws.settings, ...body.settings };
  if (body.meta) {
    const { datasetId, capiToken, capiEnabled, mirrorMessengerLabels } = body.meta;
    if (typeof datasetId === "string") ws.meta.datasetId = datasetId.trim();
    if (typeof capiToken === "string" && capiToken.trim()) ws.meta.capiToken = capiToken.trim();
    if (typeof capiEnabled === "boolean") ws.meta.capiEnabled = capiEnabled;
    if (typeof mirrorMessengerLabels === "boolean") ws.meta.mirrorMessengerLabels = mirrorMessengerLabels;
  }
  if (body.pipeline !== undefined) {
    // null puts the built in set back, through the same checks as any other edit.
    let next;
    try { next = cleanPipeline(body.pipeline ?? { stages: STAGES, tags: DEFAULT_TAGS }); } catch (e) { return fail((e as Error).message); }
    // A stage can only go once no lead is sitting in it.
    for (const c of db.conversations) {
      if (!next.stages.some((s) => s.id === c.stage)) return fail(`Move the leads out of "${(ws.pipeline?.stages ?? STAGES).find((s) => s.id === c.stage)?.name ?? c.stage}" before removing it.`);
    }
    // Renamed tags follow their leads; removed tags come off them.
    const renames: Record<string, string> = body.tagRenames && typeof body.tagRenames === "object" ? body.tagRenames : {};
    const allowed = new Set(next.tags.map((t) => t.name));
    for (const c of db.conversations) {
      c.labels = [...new Set(c.labels.map((l) => (typeof renames[l] === "string" && allowed.has(renames[l]) ? renames[l] : l)).filter((l) => allowed.has(l)))];
    }
    if (body.pipeline === null) delete ws.pipeline;
    else ws.pipeline = next;
  }
  try {
    if (body.shortcuts !== undefined) ws.shortcuts = cleanShortcuts(body.shortcuts);
    if (body.triggers !== undefined) ws.triggers = cleanTriggers(body.triggers, ws.triggers);
  } catch (e) {
    return fail((e as Error).message);
  }
  if (body.crm && typeof body.crm === "object") {
    const c = body.crm;
    if (typeof c.enabled === "boolean") ws.crm.enabled = c.enabled;
    if (typeof c.includeDemo === "boolean") ws.crm.includeDemo = c.includeDemo;
    if (typeof c.webhookUrl === "string") {
      const url = c.webhookUrl.trim();
      if (url && !/^https?:\/\/\S+$/.test(url)) return fail("The webhook URL must start with https://");
      ws.crm.webhookUrl = url;
    }
    if (c.ghl && typeof c.ghl === "object") {
      const g = ws.crm.ghl;
      if (typeof c.ghl.enabled === "boolean") g.enabled = c.ghl.enabled;
      if (typeof c.ghl.token === "string" && c.ghl.token.trim()) { g.token = c.ghl.token.trim(); g.fieldIds = undefined; }
      if (typeof c.ghl.locationId === "string" && c.ghl.locationId.trim() !== g.locationId) { g.locationId = c.ghl.locationId.trim(); g.fieldIds = undefined; }
      if (typeof c.ghl.pipelineId === "string") g.pipelineId = c.ghl.pipelineId.trim();
      if (c.ghl.stageMap && typeof c.ghl.stageMap === "object") g.stageMap = Object.fromEntries(Object.entries(c.ghl.stageMap as Record<string, unknown>).filter(([, v]) => typeof v === "string" && v).map(([k, v]) => [k, String(v)]));
    }
  }
  if (body.targets && Number(body.targets.bookedPerMonth) > 0) ws.targets = { bookedPerMonth: Math.min(10000, Math.round(Number(body.targets.bookedPerMonth))) };
  if (typeof body.onboardingComplete === "boolean") ws.onboardingComplete = body.onboardingComplete;
  saveDb();
  return json({ workspace: publicWorkspace(ws, me) });
}
