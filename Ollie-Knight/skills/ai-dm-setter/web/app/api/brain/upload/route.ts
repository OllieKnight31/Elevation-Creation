import { saveDb } from "@/lib/store";
import { access } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { brainChars, brainView, emptySection, isBrainKey, MAX_BRAIN_CHARS, MAX_DOC_CHARS, MAX_DOCS, newDoc } from "@/lib/brain";
import { ExtractError, extractText } from "@/lib/extract";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The host refuses request bodies over about 4.5 MB, so the screen checks size before sending as well.
const MAX_FILE_BYTES = 4_000_000;

/**
 * Adds an intake form or document to one section of the brain.
 * Send either a file (multipart: section, file) or pasted text (JSON: section, name, text).
 */
export async function POST(req: Request) {
  const a = await access("brief");
  if (a instanceof Response) return a;
  const ws = a.db.workspace;

  let section: unknown, name = "", text = "";
  try {
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const b = await req.json();
      section = b.section;
      name = String(b.name ?? "").trim() || "Pasted text";
      text = String(b.text ?? "");
    } else {
      const form = await req.formData();
      section = form.get("section");
      const file = form.get("file");
      if (!(file instanceof File)) return fail("Choose a file to upload.");
      if (file.size > MAX_FILE_BYTES) return fail("That file is over 4 MB. Save it without images, or paste the text in instead.");
      name = file.name;
      text = await extractText(file.name, new Uint8Array(await file.arrayBuffer()));
    }
  } catch (e) {
    if (e instanceof ExtractError) return fail(e.message);
    console.error("[setter] reading an uploaded brief document failed:", (e as Error).message);
    return fail("That file could not be read. Try saving it as a Word file or PDF again, or paste the text in.");
  }

  if (!isBrainKey(section)) return fail("Choose which part of the brief this belongs to.");
  if (!text.trim()) return fail("There is no text to add.");
  const cut = text.length > MAX_DOC_CHARS;
  const doc = newDoc(name, text);

  const brain = (ws.brain ??= { sections: {} });
  const sec = (brain.sections[section] ??= emptySection());
  if (sec.docs.length >= MAX_DOCS) return fail(`This part already has ${MAX_DOCS} documents. Remove one first.`);
  if (brainChars(brain) + doc.text.length > MAX_BRAIN_CHARS) return fail("Adding this would be more than the brain can hold. Remove a document first.");
  sec.docs.push(doc);
  brain.updatedAt = new Date().toISOString();
  saveDb();
  return json({ brain: brainView(brain), added: { id: doc.id, name: doc.name, chars: doc.text.length }, cut });
}
