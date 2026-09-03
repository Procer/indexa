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
    const data = await sql<SponsoredPlacement[]>`
      SELECT * FROM sponsored_placements ORDER BY created_at DESC
    `;
    return NextResponse.json({
      placements: data as unknown as SponsoredPlacement[],
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
    product_ids?: string[];
    categories?: string[];
    score_boost?: number;
    min_relevance?: number;
    starts_at?: string | null;
    ends_at?: string | null;
  };

  if (!body.advertiser?.trim() || !body.product_ids?.length) {
    return NextResponse.json(
      { error: "advertiser y al menos un product_id son requeridos" },
      { status: 400 }
    );
  }

  try {
    const [placement] = await sql`
      INSERT INTO sponsored_placements
        (advertiser, product_ids, categories, score_boost, min_relevance, active, starts_at, ends_at)
      VALUES (
        ${body.advertiser.trim()},
        ${body.product_ids}::uuid[],
        ${body.categories ?? []}::text[],
        ${body.score_boost ?? 0.05},
        ${body.min_relevance ?? 0.65},
        true,
        ${body.starts_at ?? null},
        ${body.ends_at ?? null}
      )
      RETURNING *
    `;
    return NextResponse.json({ placement }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
