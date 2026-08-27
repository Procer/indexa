import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";
import { getAdminUser } from "@/lib/auth/adminAuth";
import type { SponsoredPlacement } from "@/types";

// GET /api/admin/sponsors
export async function GET(request: NextRequest) {
  if (!(await getAdminUser(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("sponsored_placements")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ placements: data as SponsoredPlacement[] });
}

// POST /api/admin/sponsors
export async function POST(request: NextRequest) {
  if (!(await getAdminUser(request))) {
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

  const { data, error } = await supabase
    .from("sponsored_placements")
    .insert({
      advertiser: body.advertiser.trim(),
      product_ids: body.product_ids,
      categories: body.categories ?? [],
      score_boost: body.score_boost ?? 0.05,
      min_relevance: body.min_relevance ?? 0.65,
      active: true,
      starts_at: body.starts_at ?? null,
      ends_at: body.ends_at ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ placement: data }, { status: 201 });
}
