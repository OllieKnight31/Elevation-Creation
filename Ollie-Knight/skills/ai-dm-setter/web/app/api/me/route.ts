import { freshDb, saveDb } from "@/lib/store";
import { fail, json } from "@/lib/api";
import { currentMember, loginRequired, publicMember } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Who is signed in. Answers without an error when nobody is, so the sign in screen can ask. */
export async function GET() {
  const db = await freshDb();
  const me = await currentMember(db);
  // The welcome walkthrough plays once per person, the first time they are in the app.
  const welcome = Boolean(me && !(me.id ? me.welcomeSeenAt : db.workspace.welcomeSeenAt));
  return json({ loginRequired: loginRequired(db), member: me ? publicMember(me) : null, business: db.workspace.intake.businessName, openQuestions: me ? db.workspace.knowledge.gaps.filter((g) => g.status === "open").length : 0, welcome });
}

/** { action: "welcome-seen" } records that this person has watched or closed the welcome walkthrough. */
export async function POST(req: Request) {
  const db = await freshDb();
  const me = await currentMember(db);
  if (!me) return fail("Sign in first", 401);
  const b = await req.json().catch(() => ({}));
  if (b.action !== "welcome-seen") return fail("Unknown action");
  const at = new Date().toISOString();
  const m = me.id ? db.workspace.members.find((x) => x.id === me.id) : null;
  if (m) m.welcomeSeenAt = at;
  else db.workspace.welcomeSeenAt = at;
  saveDb();
  return json({ ok: true });
}
