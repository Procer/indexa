import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import { requireSuperAdmin, type AdminRole } from "@/lib/auth/adminSession";

// Cuántos super_admin activos quedarían si aplicáramos este cambio al user dado.
async function activeSuperAdminsExcluding(userId: string): Promise<number> {
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM admin_users
    WHERE role = 'super_admin' AND active = TRUE AND id <> ${userId}
  `;
  return count;
}

// PATCH /api/admin/users/[id] — { role?, active? } (solo super_admin).
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const actor = await requireSuperAdmin(request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as
    | { role?: string; active?: boolean }
    | null;

  const rows = await sql<{ id: string; role: AdminRole; active: boolean }[]>`
    SELECT id, role, active FROM admin_users WHERE id = ${params.id} LIMIT 1
  `;
  const target = rows[0];
  if (!target) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const nextRole: AdminRole | undefined =
    body?.role === "admin" || body?.role === "super_admin" ? body.role : undefined;
  const nextActive = typeof body?.active === "boolean" ? body.active : undefined;

  // Guardas: no dejar el sistema sin ningún super_admin activo, ni que el actor
  // se quite a sí mismo el acceso.
  const wouldLoseSuper =
    (nextRole === "admin" || nextActive === false) &&
    target.role === "super_admin" &&
    target.active &&
    (await activeSuperAdminsExcluding(target.id)) === 0;
  if (wouldLoseSuper) {
    return NextResponse.json(
      { error: "Tiene que quedar al menos un super admin activo" },
      { status: 400 }
    );
  }
  if (target.id === actor.id && nextActive === false) {
    return NextResponse.json({ error: "No podés desactivarte a vos mismo" }, { status: 400 });
  }

  const [updated] = await sql<{ id: string; email: string; role: AdminRole; active: boolean }[]>`
    UPDATE admin_users
    SET role = ${nextRole ?? target.role},
        active = ${nextActive ?? target.active}
    WHERE id = ${target.id}
    RETURNING id, email, role, active
  `;
  // Si se desactivó, cortar sus sesiones abiertas.
  if (nextActive === false) {
    await sql`DELETE FROM admin_sessions WHERE admin_user_id = ${target.id}`;
  }
  return NextResponse.json({ user: updated });
}

// DELETE /api/admin/users/[id] (solo super_admin).
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const actor = await requireSuperAdmin(request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (params.id === actor.id) {
    return NextResponse.json({ error: "No podés borrarte a vos mismo" }, { status: 400 });
  }

  const rows = await sql<{ id: string; role: AdminRole; active: boolean }[]>`
    SELECT id, role, active FROM admin_users WHERE id = ${params.id} LIMIT 1
  `;
  const target = rows[0];
  if (!target) return NextResponse.json({ error: "No existe" }, { status: 404 });

  if (
    target.role === "super_admin" &&
    target.active &&
    (await activeSuperAdminsExcluding(target.id)) === 0
  ) {
    return NextResponse.json(
      { error: "Tiene que quedar al menos un super admin activo" },
      { status: 400 }
    );
  }

  await sql`DELETE FROM admin_users WHERE id = ${target.id}`;
  return NextResponse.json({ ok: true });
}
