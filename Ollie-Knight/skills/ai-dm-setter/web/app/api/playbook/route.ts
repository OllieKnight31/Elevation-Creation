import { saveDb } from "@/lib/store";
import { access } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { buildPlaybook } from "@/lib/ai";

export const maxDuration = 300;

export async function POST() {
  const a = await access("playbook");
  if (a instanceof Response) return a;
  const { db } = a;
  try {
    const { skipped, ...playbook } = await buildPlaybook(db);
    db.workspace.playbook = playbook;
    saveDb();
    return json({ playbook, skipped });
  } catch (e) {
    return fail("Analysis failed: " + (e as Error).message, 502);
  }
}
