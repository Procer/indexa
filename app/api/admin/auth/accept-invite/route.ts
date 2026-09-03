import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createSession,
  getValidInvite,
  hashPassword,
} from "@/lib/auth/adminSession";

// POST /api/admin/auth/accept-invite — { token, password }
// Define la contraseña del usuario del invite, marca el invite usado y deja la
// sesión iniciada (auto-login).
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { token?: string; password?: string }
    | null;
  const token = body?.token ?? "";
  const password = body?.password ?? "";

  if (password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña tiene que tener al menos 8 caracteres" },
      { status: 400 }
    );
  }

  const invite = await getValidInvite(token);
  if (!invite) {
    return NextResponse.json({ error: "Link inválido o vencido" }, { status: 404 });
  }

  await sql`
    UPDATE admin_users
    SET password_hash = ${hashPassword(password)}, active = TRUE
    WHERE id = ${invite.admin_user_id}
  `;
  await sql`UPDATE admin_invites SET used_at = NOW() WHERE token = ${token}`;

  const { token: sessionToken, maxAgeSeconds } = await createSession(
    invite.admin_user_id,
    request.headers.get("user-agent")
  );
  await sql`UPDATE admin_users SET last_login_at = NOW() WHERE id = ${invite.admin_user_id}`;

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, sessionToken, adminCookieOptions(maxAgeSeconds));
  return res;
}
