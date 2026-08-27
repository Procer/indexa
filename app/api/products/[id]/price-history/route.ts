import { NextRequest, NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/db/queries";

// GET /api/products/[id]/price-history — puntos de precio de los últimos 90 días
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const points = await getPriceHistory(params.id);
    return NextResponse.json({ points });
  } catch (error) {
    console.error("[GET /api/products/[id]/price-history]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
