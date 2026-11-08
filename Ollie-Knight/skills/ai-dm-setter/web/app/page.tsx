import { redirect } from "next/navigation";
import { freshDb } from "@/lib/store";
import { can, currentMember } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = await freshDb();
  const me = await currentMember(db);
  if (!me) redirect("/login");
  // Land on the first screen this person can open.
  if (!db.workspace.onboardingComplete && can(me, "brief")) redirect("/onboarding");
  const first = (["inbox", "leads", "insights", "playbook", "pipeline", "settings"] as const).find((a) => can(me, a));
  redirect(first ? `/${first}` : "/login");
}
