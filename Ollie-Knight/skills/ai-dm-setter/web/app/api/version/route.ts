import { access } from "@/lib/auth";
import { json } from "@/lib/api";
import { dataVersion } from "@/lib/store";

export const dynamic = "force-dynamic";

/** A few bytes that change whenever anything is saved. Open screens ask every two seconds and reload only on a change. */
export async function GET() {
  const a = await access("any");
  if (a instanceof Response) return a;
  return json({ v: dataVersion() });
}
