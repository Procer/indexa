import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import { createInvite, requireSuperAdmin } from "@/lib/auth/adminSession";

// POST /api/admin/users/[id]/invite — (re)genera un link para definir/resetear
// la contraseña de ese usuario (solo super_admin). El super admin lo copia y
// se lo manda por donde quiera.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await requireSuperAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await sql<{ id: string; password_hash: string | null }[]>`
    SELECT id, password_hash FROM admin_users WHERE id = ${params.id} LIMIT 1
  `;
  const target = rows[0];
  if (!target) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const purpose = target.password_hash ? "reset_password" : "set_password";
  const invite = await createInvite(target.id, purpose);
  return NextResponse.json({ invitePath: invite.path, purpose });
}
