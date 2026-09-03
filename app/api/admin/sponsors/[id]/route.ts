import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import { getAdminSession } from "@/lib/auth/adminSession";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Columnas que el panel puede editar — evita que un body arbitrario toque
// id / created_at u otras columnas.
const EDITABLE = [
  "advertiser",
  "product_ids",
  "categories",
  "score_boost",
  "min_relevance",
  "active",
  "starts_at",
  "ends_at",
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
