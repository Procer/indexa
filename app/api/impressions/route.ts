import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 40;

// POST /api/impressions — el navegador avisa qué tarjetas de producto se vieron
// de verdad en pantalla (≥50% visible ~1s, ver lib/analytics/impressions.ts).
// Anónimo, sin auth: es telemetría. Una fila por (búsqueda, visita, producto);
// repetir el aviso no suma (ON CONFLICT DO NOTHING). La campaña a la que se
// atribuye sale del servidor (search_sponsorships), nunca del cliente — así no
// se pueden inflar las cifras de un anunciante mandando un placement_id.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    shareToken?: string;
    visitId?: string;
    productIds?: string[];
  } | null;

  if (
    !body ||
    typeof body.shareToken !== "string" ||
    body.shareToken.length < 4 ||
    body.shareToken.length > 64 ||
    typeof body.visitId !== "string" ||
    body.visitId.length < 8 ||
    body.visitId.length > 100 ||
    !Array.isArray(body.productIds)
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const ids = Array.from(new Set(body.productIds.filter((id) => typeof id === "string" && UUID_RE.test(id)))).slice(
    0,
    MAX_IDS
  );
  if (ids.length === 0) return NextResponse.json({ ok: true, count: 0 });

  try {
    await sql`
      INSERT INTO product_impressions (share_token, visit_id, product_id, source, category, placement_id)
      SELECT ${body.shareToken}, ${body.visitId}, p.id, p.source, p.category, ss.placement_id
      FROM products p
      LEFT JOIN search_sponsorships ss
        ON ss.share_token = ${body.shareToken} AND ss.product_id = p.id
      WHERE p.id = ANY(${ids}::uuid[])
      ON CONFLICT (share_token, visit_id, product_id) DO NOTHING
    `;
  } catch (error) {
    console.error("[POST /api/impressions]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: ids.length });
}
