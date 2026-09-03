import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { sql } from "@/lib/db/sql";
import { BASE_PATH } from "@/lib/basePath";

// ─── Login propio del panel /admin ───────────────────────────────────────────
// Email + contraseña sobre admin_users (Postgres del VPS), sesión como token
// opaco en admin_sessions + cookie httpOnly. Sin Supabase, sin dependencias
// nuevas: hashing con scrypt (crypto built-in). Ver db/vps/admin_auth.sql.

export type AdminRole = "admin" | "super_admin";

export interface AdminSessionUser {
  id: string;
  email: string;
  role: AdminRole;
}

export const ADMIN_COOKIE = "indexa_admin_session";

const SESSION_DAYS = 30;
const SCRYPT_KEYLEN = 64;

export function adminCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: BASE_PATH || "/",
    maxAge: maxAgeSeconds,
  };
}

// ─── Contraseñas ─────────────────────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  let actual: Buffer;
  try {
    actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  } catch {
    return false;
  }
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ─── Sesiones ────────────────────────────────────────────────────────────────

export async function createSession(
  adminUserId: string,
  userAgent?: string | null
): Promise<{ token: string; maxAgeSeconds: number }> {
  const token = randomBytes(32).toString("hex");
  const maxAgeSeconds = SESSION_DAYS * 24 * 60 * 60;
  await sql`
    INSERT INTO admin_sessions (token, admin_user_id, expires_at, user_agent)
    VALUES (${token}, ${adminUserId}, NOW() + ${`${SESSION_DAYS} days`}::interval, ${userAgent ?? null})
  `;
  return { token, maxAgeSeconds };
}

export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await sql`DELETE FROM admin_sessions WHERE token = ${token}`;
}

export async function getAdminSession(request: NextRequest): Promise<AdminSessionUser | null> {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return null;

  const rows = await sql<{ id: string; email: string; role: AdminRole }[]>`
    SELECT u.id, u.email, u.role
    FROM admin_sessions s
    JOIN admin_users u ON u.id = s.admin_user_id
    WHERE s.token = ${token}
      AND s.expires_at > NOW()
      AND u.active = TRUE
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// ─── Invitaciones (link de un solo uso para definir/resetear contraseña) ─────

const INVITE_HOURS = 48;

export async function createInvite(
  adminUserId: string,
  purpose: "set_password" | "reset_password"
): Promise<{ token: string; path: string }> {
  const token = randomBytes(32).toString("hex");
  // Un invite pendiente por usuario: se pisa el anterior.
  await sql`DELETE FROM admin_invites WHERE admin_user_id = ${adminUserId} AND used_at IS NULL`;
  await sql`
    INSERT INTO admin_invites (token, admin_user_id, purpose, expires_at)
    VALUES (${token}, ${adminUserId}, ${purpose}, NOW() + ${`${INVITE_HOURS} hours`}::interval)
  `;
  return { token, path: `/admin/set-password?token=${token}` };
}

export interface InviteRow {
  token: string;
  admin_user_id: string;
  email: string;
  purpose: string;
}

export async function getValidInvite(token: string): Promise<InviteRow | null> {
  if (!token) return null;
  const rows = await sql<InviteRow[]>`
    SELECT i.token, i.admin_user_id, u.email, i.purpose
    FROM admin_invites i
    JOIN admin_users u ON u.id = i.admin_user_id
    WHERE i.token = ${token}
      AND i.used_at IS NULL
      AND i.expires_at > NOW()
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// Helpers de gate para las rutas. Devuelven el user o null; cada route arma la
// respuesta 401/403.
export async function requireAdmin(request: NextRequest): Promise<AdminSessionUser | null> {
  return getAdminSession(request);
}

export async function requireSuperAdmin(request: NextRequest): Promise<AdminSessionUser | null> {
  const user = await getAdminSession(request);
  return user?.role === "super_admin" ? user : null;
}
