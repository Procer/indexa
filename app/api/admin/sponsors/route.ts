import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import { getAdminSession } from "@/lib/auth/adminSession";
import type { SponsoredPlacement } from "@/types";

// GET /api/admin/sponsors
export async function GET(request: NextRequest) {
  if (!(await getAdminSession(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [data, sources] = await Promise.all([
      sql<SponsoredPlacement[]>`
        SELECT * FROM sponsored_placements ORDER BY created_at DESC
      `,
      sql<{ source: string }[]>`
        SELECT DISTINCT source FROM products WHERE available = true ORDER BY source
      `,
    ]);
    return NextResponse.json({
      placements: data as unknown as SponsoredPlacement[],
      sources: sources.map((s) => s.source),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// POST /api/admin/sponsors
export async function POST(request: NextRequest) {
  if (!(await getAdminSession(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    advertiser?: string;
    target_source?: string;
    categories?: string[];
    score_boost?: number;
    min_relevance?: number;
    show_on_home?: boolean;
    starts_at?: string | null;
    ends_at?: string | null;
    amount_paid_ars?: number | null;
    slot_position?: number | null;
    max_per_search?: number;
  };

  if (!body.advertiser?.trim() || !body.target_source?.trim() || !body.categories?.length) {
    return NextResponse.json(
      { error: "advertiser, target_source y al menos un rubro son requeridos" },
      { status: 400 }
    );
  }
  const slot = body.slot_position ?? null;
  if (slot !== null && (!Number.isInteger(slot) || slot < 1 || slot > 6)) {
    return NextResponse.json({ error: "La posición garantizada va de 1 a 6" }, { status: 400 });
  }
  const maxPerSearch = body.max_per_search ?? 2;
  if (!Number.isInteger(maxPerSearch) || maxPerSearch < 1 || maxPerSearch > 10) {
    return NextResponse.json({ error: "El tope por búsqueda va de 1 a 10" }, { status: 400 });
  }
  const paid = body.amount_paid_ars ?? null;
  if (paid !== null && (typeof paid !== "number" || !Number.isFinite(paid) || paid < 0)) {
    return NextResponse.json({ error: "Monto pagado inválido" }, { status: 400 });
  }

  try {
    const [placement] = await sql`
      INSERT INTO sponsored_placements
        (advertiser, target_source, categories, score_boost, min_relevance, show_on_home, active,
         starts_at, ends_at, amount_paid_ars, slot_position, max_per_search)
      VALUES (
        ${body.advertiser.trim()},
        ${body.target_source.trim()},
        ${body.categories}::text[],
        ${body.score_boost ?? 0.05},
        ${body.min_relevance ?? 0.65},
        ${body.show_on_home ?? false},
        true,
        ${body.starts_at ?? null},
        ${body.ends_at ?? null},
        ${paid},
        ${slot},
        ${maxPerSearch}
      )
      RETURNING *
    `;
    return NextResponse.json({ placement }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
