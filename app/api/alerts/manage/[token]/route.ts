import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import type { PriceAlertWithProduct } from "@/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/alerts/manage/[token] — alertas activas asociadas a un manage_token (sin login)
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  if (!UUID_RE.test(params.token)) {
    return NextResponse.json({ alerts: [] });
  }

  try {
    const data = await sql<PriceAlertWithProduct[]>`
      SELECT
        pa.id, pa.product_id, pa.target_price, pa.is_active,
        pa.last_notified_at, pa.created_at, pa.manage_token,
        jsonb_build_object(
          'id', p.id, 'title', p.title, 'image_url', p.image_url,
          'price_cash', p.price_cash, 'url', p.url
        ) AS product
      FROM price_alerts pa
      JOIN products p ON p.id = pa.product_id
      WHERE pa.manage_token = ${params.token}::uuid
        AND pa.is_active = true
      ORDER BY pa.created_at DESC
    `;
    return NextResponse.json({
      alerts: data as unknown as PriceAlertWithProduct[],
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
