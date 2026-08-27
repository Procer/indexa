import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DELETE /api/alerts/[id]?token=... — desactiva una alerta (requiere el manage_token del dueño)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Falta el token" }, { status: 400 });
  }
  if (!UUID_RE.test(params.id) || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  try {
    await sql`
      UPDATE price_alerts SET is_active = false
      WHERE id = ${params.id}::uuid AND manage_token = ${token}::uuid
    `;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
