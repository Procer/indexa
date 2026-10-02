import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import { getAdminSession } from "@/lib/auth/adminSession";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Columnas que el panel puede editar — evita que un body arbitrario toque
// id / created_at u otras columnas.
const EDITABLE = [
  "advertiser",
  "target_source",
  "categories",
  "score_boost",
  "min_relevance",
  "show_on_home",
  "active",
  "starts_at",
  "ends_at",
  "amount_paid_ars",
  "slot_position",
  "max_per_search",
] as const;

// PATCH /api/admin/sponsors/[id] — toggle active o actualizar campos
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await getAdminSession(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const updates = Object.fromEntries(
    Object.entries(body).filter(([k]) => (EDITABLE as readonly string[]).includes(k))
  );
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }
  const slot = updates.slot_position;
  if (slot != null && (!Number.isInteger(slot) || (slot as number) < 1 || (slot as number) > 6)) {
    return NextResponse.json({ error: "La posición garantizada va de 1 a 6" }, { status: 400 });
  }
  const max = updates.max_per_search;
  if (max !== undefined && (!Number.isInteger(max) || (max as number) < 1 || (max as number) > 10)) {
    return NextResponse.json({ error: "El tope por búsqueda va de 1 a 10" }, { status: 400 });
  }
  const paid = updates.amount_paid_ars;
  if (paid != null && (typeof paid !== "number" || !Number.isFinite(paid) || paid < 0)) {
    return NextResponse.json({ error: "Monto pagado inválido" }, { status: 400 });
  }

  try {
    const [placement] = await sql`
      UPDATE sponsored_placements SET ${sql(updates)}
      WHERE id = ${params.id}::uuid
      RETURNING *
    `;
    return NextResponse.json({ placement });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// DELETE /api/admin/sponsors/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await getAdminSession(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    await sql`DELETE FROM sponsored_placements WHERE id = ${params.id}::uuid`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
