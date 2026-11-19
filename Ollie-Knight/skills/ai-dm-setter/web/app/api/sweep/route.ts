import { access } from "@/lib/auth";
import { json } from "@/lib/api";
import { sweepStatus } from "@/lib/sweep";

/** How many chats the inbox sweep would answer or follow up now. */
export async function GET() {
  const a = await access("settings");
  if (!("db" in a)) return a;
  return json(sweepStatus(a.db));
}
