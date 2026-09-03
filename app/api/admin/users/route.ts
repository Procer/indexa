import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import { createInvite, requireSuperAdmin, type AdminRole } from "@/lib/auth/adminSession";

interface AdminUserRow {
  id: string;
  email: string;
  role: AdminRole;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
  has_password: boolean;
}

// GET /api/admin/users — lista de usuarios del panel (solo super_admin).
export async function GET(request: NextRequest) {
  if (!(await requireSuperAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const users = await sql<AdminUserRow[]>`
    SELECT id, email, role, active, created_at, last_login_at,
           (password_hash IS NOT NULL) AS has_password
    FROM admin_users
    ORDER BY created_at
  `;
  return NextResponse.json({ users });
}

// POST /api/admin/users — { email, role } → crea el usuario (sin clave) y
// devuelve un link de invitación para que defina su contraseña.
export async function POST(request: NextRequest) {
  const actor = await requireSuperAdmin(request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: string; role?: string }
    | null;
  const email = body?.email?.trim().toLowerCase();
  const role: AdminRole = body?.role === "super_admin" ? "super_admin" : "admin";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  const existing = await sql<{ id: string }[]>`
    SELECT id FROM admin_users WHERE lower(email) = ${email} LIMIT 1
  `;
  if (existing.length > 0) {
    return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 });
  }

  const [user] = await sql<{ id: string; email: string; role: AdminRole }[]>`
    INSERT INTO admin_users (email, role, created_by)
    VALUES (${email}, ${role}, ${actor.id})
    RETURNING id, email, role
  `;

  const invite = await createInvite(user.id, "set_password");
  return NextResponse.json({ user, invitePath: invite.path }, { status: 201 });
}
