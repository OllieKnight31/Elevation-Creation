import { cookies } from "next/headers";
import { saveDb } from "@/lib/store";
import { fail, json } from "@/lib/api";
import { access, applyMember, loginRequired, publicMember, SESSION_COOKIE, sessionValue } from "@/lib/auth";

type Acct = { role: string; active: boolean; passwordHash?: string };
const owners = (ms: Acct[]) => ms.filter((m) => m.role === "owner" && m.active && m.passwordHash).length;
/** True when people could still sign in but none of them could manage the account. */
const stranded = (ms: Acct[]) => ms.some((m) => m.active && m.passwordHash) && owners(ms) === 0;

export async function POST(req: Request) {
  const a = await access("admin");
  if (a instanceof Response) return a;
  const { db } = a;
  const b = await req.json();
  const wasOpen = !loginRequired(db);
  try {
    // The first account switches sign in on, so it has to be one that can manage everything.
    const m = applyMember(db, wasOpen ? { ...b, role: "owner" } : b);
    db.workspace.members.push(m);
    saveDb();
    // Creating your own login should not lock you out of the screen you are on.
    if (wasOpen) (await cookies()).set(SESSION_COOKIE.name, sessionValue(db, m.id), { ...SESSION_COOKIE.options, secure: new URL(req.url).protocol === "https:" });
    return json({ member: publicMember(m), loginNowRequired: wasOpen });
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function PUT(req: Request) {
  const a = await access("admin");
  if (a instanceof Response) return a;
  const { db, me } = a;
  const b = await req.json();
  const i = db.workspace.members.findIndex((m) => m.id === b.id && !m.demo);
  if (i < 0) return fail("Team member not found", 404);
  const before = db.workspace.members[i];
  try {
    const next = applyMember(db, b, before);
    if (before.role === "owner" && me.role !== "owner") return fail("Only an owner can change an owner's account.", 403);
    if (next.role === "owner" && me.role !== "owner") return fail("Only an owner can make someone an owner.", 403);
    const after = db.workspace.members.map((m, k) => (k === i ? next : m));
    if (stranded(after)) return fail("Keep at least one active owner, or nobody could manage the account.");
    db.workspace.members = after;
    saveDb();
    return json({ member: publicMember(next) });
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function DELETE(req: Request) {
  const a = await access("admin");
  if (a instanceof Response) return a;
  const { db, me } = a;
  const id = new URL(req.url).searchParams.get("id");
  const m = db.workspace.members.find((x) => x.id === id && !x.demo);
  if (!m) return fail("Team member not found", 404);
  if (m.role === "owner" && me.role !== "owner") return fail("Only an owner can remove an owner.", 403);
  const after = db.workspace.members.filter((x) => x !== m);
  // Removing the very last account is allowed: it switches sign in off again.
  if (stranded(after)) return fail("Keep at least one active owner. To switch sign in off, remove the other accounts first, then this one.");
  db.workspace.members = after;
  for (const c of db.conversations) if (c.assignedTo === m.id) c.assignedTo = null;
  saveDb();
  return json({ ok: true });
}
