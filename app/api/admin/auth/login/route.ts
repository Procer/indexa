import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createSession,
  verifyPassword,
  type AdminRole,
} from "@/lib/auth/adminSession";

// POST /api/admin/auth/login — { email, password }
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Faltan email o contraseña" }, { status: 400 });
  }

  const rows = await sql<
    { id: string; password_hash: string | null; role: AdminRole; active: boolean }[]
  >`
    SELECT id, password_hash, role, active
    FROM admin_users
    WHERE lower(email) = ${email}
    LIMIT 1
  `;
  const user = rows[0];

  // Respuesta genérica: no distinguir "no existe" de "clave mal" de "inactivo".
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "Email o contraseña incorrectos" }, { status: 401 });
  }

  const { token, maxAgeSeconds } = await createSession(
    user.id,
    request.headers.get("user-agent")
  );
  await sql`UPDATE admin_users SET last_login_at = NOW() WHERE id = ${user.id}`;

  const res = NextResponse.json({ email, role: user.role });
  res.cookies.set(ADMIN_COOKIE, token, adminCookieOptions(maxAgeSeconds));
  return res;
}
