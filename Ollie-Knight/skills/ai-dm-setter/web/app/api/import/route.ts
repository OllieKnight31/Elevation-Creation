import { saveDb } from "@/lib/store";
import { access } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { guessOwner, importExport, type ExportThread } from "@/lib/importer";

/** Receives threads parsed in the browser from the user's own Instagram or Facebook data export. */
export async function POST(req: Request) {
  const a = await access("settings");
  if (a instanceof Response) return a;
  const { db } = a;
  const b = await req.json();
  const threads: ExportThread[] = b.threads ?? [];
  if (!threads.length) return fail("No threads in the upload");
  const owner = b.ownerName || guessOwner(threads);
  if (!owner) return fail("Could not work out which participant is you");
  const result = importExport(db, threads, b.platform === "messenger" ? "messenger" : "instagram", owner);
  saveDb();
  return json({ ...result, ownerName: owner });
}

export async function PUT(req: Request) {
  const a = await access("settings");
  if (a instanceof Response) return a;
  const b = await req.json();
  return json({ ownerName: guessOwner(b.threads ?? []) });
}
