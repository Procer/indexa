import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";

// POST /api/products/[id]/click — incrementa click_count y registra el evento
// (anónimo, fire-and-forget), vinculado a la búsqueda de origen si se manda.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = (await request.json().catch(() => ({}))) as {
    searchShareToken?: string;
    sessionId?: string;
    visitId?: string;
  };

  try {
    await Promise.all([
      sql`SELECT increment_click_count(${params.id}::uuid)`,
      sql`
        INSERT INTO product_clicks (product_id, search_share_token, session_id, visit_id)
        VALUES (
          ${params.id}::uuid,
          ${body.searchShareToken ?? null},
          ${body.sessionId ?? null},
          ${body.visitId ?? null}
        )
      `,
    ]);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
