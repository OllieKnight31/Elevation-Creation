import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Area, Conversation, Db, Member, Role } from "./types";
import { freshDb } from "./store";

export const AREAS: [Area, string][] = [
  ["inbox", "Inbox"], ["leads", "Leads centre"], ["outreach", "Outreach"], ["insights", "Insights"], ["playbook", "Playbook"],
  ["pipeline", "Stages and tags"], ["brief", "Business brief"], ["settings", "Settings"],
];
const ALL_AREAS = AREAS.map(([a]) => a);
export const ROLE_DEFAULTS: Record<Role, { areas: Area[]; scope: Member["scope"]; teamMetrics: boolean }> = {
  owner: { areas: ALL_AREAS, scope: "all", teamMetrics: true },
  admin: { areas: ALL_AREAS, scope: "all", teamMetrics: true },
  setter: { areas: ["inbox", "leads", "insights"], scope: "all", teamMetrics: false },
  closer: { areas: ["leads", "insights"], scope: "all", teamMetrics: false },
  viewer: { areas: ["insights"], scope: "all", teamMetrics: true },
};

const COOKIE = "setter_session";
const WEEK = 7 * 864e5;

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | undefined) {
  const [kind, salt, hash] = (stored ?? "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(password, Buffer.from(salt, "hex"), 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

const sign = (db: Db, body: string) => createHmac("sha256", db.workspace.secret).update(body).digest("hex");

export function sessionValue(db: Db, memberId: string) {
  const body = `${memberId}.${Date.now() + WEEK}`;
  return `${body}.${sign(db, body)}`;
}

export const SESSION_COOKIE = { name: COOKIE, options: { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: WEEK / 1000 } };

/** Sign in is switched on by the first account that has a password. Until then the app is open, as it was. */
export function loginRequired(db: Db) {
  return db.workspace.members.some((m) => m.active && m.passwordHash);
}

/** Stands in for the owner while sign in is off. */
const OPEN_OWNER: Member = { id: "", name: "Owner", email: "", role: "owner", team: "", areas: ALL_AREAS, scope: "all", teamMetrics: true, active: true, createdAt: "" };

export async function currentMember(db: Db): Promise<Member | null> {
  if (!loginRequired(db)) return OPEN_OWNER;
  const raw = (await cookies()).get(COOKIE)?.value ?? "";
  const i = raw.lastIndexOf(".");
  if (i < 0) return null;
  const body = raw.slice(0, i);
  const mac = Buffer.from(raw.slice(i + 1));
  const good = Buffer.from(sign(db, body));
  if (mac.length !== good.length || !timingSafeEqual(mac, good)) return null;
  const [id, exp] = body.split(".");
  if (Number(exp) < Date.now()) return null;
  const m = db.workspace.members.find((x) => x.id === id && x.active && x.passwordHash);
  return m ?? null;
}

export const isAdmin = (m: Member) => m.role === "owner" || m.role === "admin";
export const can = (m: Member, area: Area) => isAdmin(m) || m.areas.includes(area);
export const canSee = (m: Member, c: Conversation) => m.scope === "all" || isAdmin(m) || c.assignedTo === m.id;

type Need = Area | Area[] | "any" | "admin";

/**
 * Gate for every route the browser calls. Returns the data and the signed in person, or the response to send back.
 * A list of areas means any one of them is enough.
 */
export async function access(need: Need): Promise<{ db: Db; me: Member } | NextResponse> {
  const db = await freshDb();
  const me = await currentMember(db);
  if (!me) return NextResponse.json({ error: "Sign in to continue.", login: true }, { status: 401 });
  const ok = need === "any" ? true : need === "admin" ? isAdmin(me) : (Array.isArray(need) ? need : [need]).some((a) => can(me, a));
  if (!ok) return NextResponse.json({ error: "Your account does not have access to this." }, { status: 403 });
  return { db, me };
}

/** A member as the browser may see it: never the password hash. */
export function publicMember(m: Member) {
  const { passwordHash, ...rest } = m;
  return { ...rest, hasPassword: Boolean(passwordHash) };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Builds or updates a member from what the Team tab sent. Throws with a message the owner can act on. */
export function applyMember(db: Db, input: Record<string, unknown>, existing?: Member): Member {
  const role = (["owner", "admin", "setter", "closer", "viewer"] as Role[]).includes(input.role as Role) ? (input.role as Role) : existing?.role ?? "setter";
  const d = ROLE_DEFAULTS[role];
  const name = str(input.name, 60) || existing?.name || "";
  const email = (str(input.email, 120) || existing?.email || "").toLowerCase();
  if (!name) throw new Error("A name is needed.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("A valid email is needed. It is what they sign in with.");
  if (db.workspace.members.some((m) => m !== existing && m.email === email)) throw new Error("Someone already uses that email.");
  const password = typeof input.password === "string" ? input.password : "";
  if (!existing && password.length < 8) throw new Error("Give them a password of at least 8 characters.");
  if (password && password.length < 8) throw new Error("Passwords need at least 8 characters.");
  const areas = Array.isArray(input.areas) ? ALL_AREAS.filter((a) => (input.areas as unknown[]).includes(a)) : existing?.areas ?? d.areas;
  return {
    id: existing?.id ?? "m_" + randomBytes(6).toString("hex"),
    name, email, role,
    team: typeof input.team === "string" ? str(input.team, 40) : existing?.team ?? "",
    areas: role === "owner" || role === "admin" ? ALL_AREAS : areas,
    scope: input.scope === "assigned" || input.scope === "all" ? input.scope : existing?.scope ?? d.scope,
    teamMetrics: typeof input.teamMetrics === "boolean" ? input.teamMetrics : existing?.teamMetrics ?? d.teamMetrics,
    active: typeof input.active === "boolean" ? input.active : existing?.active ?? true,
    passwordHash: password ? hashPassword(password) : existing?.passwordHash,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    lastLoginAt: existing?.lastLoginAt,
  };
}
