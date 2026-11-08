import { extAuth, fail, json } from "@/lib/api";

export async function GET(req: Request) {
  const db = await extAuth(req);
  if (!db) return fail("Bad token", 401);
  return json({
    items: db.labelQueue
      .filter((q) => q.status === "pending" && !q.externalId.startsWith("demo_"))
      .map(({ id, platform, name, handle, externalId, labels }) => ({ id, platform, name, handle, externalId, labels })),
  });
}
