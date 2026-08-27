import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";

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

  const [{ error }] = await Promise.all([
    supabase.rpc("increment_click_count", { product_id: params.id }),
    supabase.from("product_clicks").insert({
      product_id: params.id,
      search_share_token: body.searchShareToken ?? null,
      session_id: body.sessionId ?? null,
      visit_id: body.visitId ?? null,
    }),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
