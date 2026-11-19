import { saveDb } from "@/lib/store";
import { access } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { BRAIN_SECTIONS, brainChars, brainView, cleanSection, isBrainKey, MAX_BRAIN_CHARS, sectionOf } from "@/lib/brain";

export const dynamic = "force-dynamic";

/** The brain for the brief screen: every answer, and the list of documents without their text. ?doc=<id> returns one document's text. */
export async function GET(req: Request) {
  const a = await access("brief");
  if (a instanceof Response) return a;
  const id = new URL(req.url).searchParams.get("doc");
  if (id) {
    for (const s of BRAIN_SECTIONS) {
      const d = sectionOf(a.db.workspace.brain, s.key).docs.find((x) => x.id === id);
      if (d) return json({ doc: d });
    }
    return fail("That document is no longer there.", 404);
  }
  return json({ brain: brainView(a.db.workspace.brain) });
}

/**
 * Saves answers and the owner's own questions for one or more sections, and removes documents.
 * Body: { sections?: { [key]: { answers, custom } }, removeDocs?: string[] }
 */
export async function PUT(req: Request) {
  const a = await access("brief");
  if (a instanceof Response) return a;
  const ws = a.db.workspace;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return fail("Nothing to save.");
  const brain = (ws.brain ??= { sections: {} });
  const before = JSON.stringify(brain.sections);
  if (body.sections && typeof body.sections === "object") {
    for (const [key, value] of Object.entries(body.sections as Record<string, unknown>)) {
      if (!isBrainKey(key)) continue;
      brain.sections[key] = cleanSection(value, sectionOf(brain, key), key);
    }
  }
  if (Array.isArray(body.removeDocs)) {
    const gone = new Set(body.removeDocs.filter((x: unknown) => typeof x === "string"));
    for (const s of BRAIN_SECTIONS) {
      const sec = brain.sections[s.key];
      if (sec) sec.docs = sec.docs.filter((d) => !gone.has(d.id));
    }
  }
  if (brainChars(brain) > MAX_BRAIN_CHARS) {
    brain.sections = JSON.parse(before);
    return fail("That is more than the brain can hold. Shorten an answer or remove a document, then save again.");
  }
  if (JSON.stringify(brain.sections) !== before) {
    brain.updatedAt = new Date().toISOString();
    saveDb();
  }
  return json({ brain: brainView(brain) });
}
