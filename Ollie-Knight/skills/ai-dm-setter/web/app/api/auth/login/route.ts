import { cookies } from "next/headers";
import { freshDb, saveDb } from "@/lib/store";
import { fail, json } from "@/lib/api";
import { loginRequired, publicMember, SESSION_COOKIE, sessionValue, verifyPassword } from "@/lib/auth";

const tries = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  const db = await freshDb();
  if (!loginRequired(db)) return json({ ok: true, open: true });
  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? "").trim().toLowerCase();
  const t = tries.get(email);
  if (t && t.n >= 8 && t.until > Date.now()) return fail("Too many attempts. Wait a few minutes and try again.", 429);
  const m = db.workspace.members.find((x) => x.email === email && x.active && x.passwordHash);
  if (!m || !verifyPassword(String(b.password ?? ""), m.passwordHash)) {
    tries.set(email, { n: (t && t.until > Date.now() ? t.n : 0) + 1, until: Date.now() + 10 * 60_000 });
    return fail("That email and password do not match an account.", 401);
  }
  tries.delete(email);
  m.lastLoginAt = new Date().toISOString();
  saveDb();
  (await cookies()).set(SESSION_COOKIE.name, sessionValue(db, m.id), { ...SESSION_COOKIE.options, secure: new URL(req.url).protocol === "https:" });
  return json({ ok: true, member: publicMember(m) });
}
