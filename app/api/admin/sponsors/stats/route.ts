import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import { getAdminSession } from "@/lib/auth/adminSession";
import type { SponsorStats, SponsoredPlacement } from "@/types";

const AR_TZ = "America/Argentina/Buenos_Aires";

function round(n: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

async function statsFor(p: SponsoredPlacement): Promise<SponsorStats> {
  const now = Date.now();
  // Ventana medida: desde que la campaña empezó a valer hasta hoy (o su fin).
  const fromMs = Math.max(
    new Date(p.created_at).getTime(),
    p.starts_at ? new Date(p.starts_at).getTime() : 0
  );
  const toMs = Math.min(now, p.ends_at ? new Date(p.ends_at).getTime() : now);
  const from = new Date(fromMs).toISOString();
  const to = new Date(Math.max(toMs, fromMs)).toISOString();
  const source = (p.target_source ?? "").toLowerCase();
  const categories = p.categories as string[];

  const [
    impRow,
    searchRow,
    clickRow,
    engagementRows,
    homeRows,
    organicImpRow,
    organicClickRow,
    impByDay,
    clickByDay,
    topRows,
  ] = await Promise.all([
    sql<{ n: number; visitors: number }[]>`
      SELECT count(*)::int AS n, count(DISTINCT visit_id)::int AS visitors
      FROM product_impressions WHERE placement_id = ${p.id}::uuid
    `,
    sql<{ searches: number; avg_position: number | null; slots: number }[]>`
      SELECT count(DISTINCT share_token)::int AS searches,
             avg(position)::float AS avg_position,
             count(*) FILTER (WHERE via = 'slot')::int AS slots
      FROM search_sponsorships WHERE placement_id = ${p.id}::uuid
    `,
    sql<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM product_clicks c
      JOIN search_sponsorships s ON s.share_token = c.search_share_token AND s.product_id = c.product_id
      WHERE s.placement_id = ${p.id}::uuid
    `,
    // Interacciones con la ficha de un producto que la persona vio patrocinado.
    sql<{ event_type: string; n: number }[]>`
      SELECT e.event_type, count(*)::int AS n
      FROM site_events e
      WHERE e.event_type IN ('product_view_details', 'product_ask_about', 'product_compare_add')
        AND EXISTS (
          SELECT 1 FROM product_impressions i
          WHERE i.placement_id = ${p.id}::uuid
            AND i.visit_id = e.visit_id
            AND i.product_id = e.product_id
            AND i.created_at <= e.created_at
        )
      GROUP BY e.event_type
    `,
    sql<{ event_type: string; n: number }[]>`
      SELECT event_type, count(*)::int AS n
      FROM site_events
      WHERE event_type IN ('sponsor_home_view', 'sponsor_home_click')
        AND metadata->>'placementId' = ${p.id}
      GROUP BY event_type
    `,
    // Referencia: la misma tienda y rubros cuando NO estuvo patrocinada.
    sql<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM product_impressions
      WHERE placement_id IS NULL
        AND lower(source) = ${source}
        AND category = ANY(${categories}::text[])
        AND created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz
    `,
    sql<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM product_clicks c
      JOIN products pr ON pr.id = c.product_id
      WHERE lower(pr.source) = ${source}
        AND pr.category = ANY(${categories}::text[])
        AND c.created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM search_sponsorships s
          WHERE s.share_token = c.search_share_token AND s.product_id = c.product_id
        )
        AND EXISTS (
          SELECT 1 FROM product_impressions i
          WHERE i.share_token = c.search_share_token AND i.product_id = c.product_id AND i.visit_id = c.visit_id
        )
    `,
    sql<{ day: string; n: number }[]>`
      SELECT to_char((created_at AT TIME ZONE ${AR_TZ})::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
      FROM product_impressions
      WHERE placement_id = ${p.id}::uuid
      GROUP BY 1
    `,
    sql<{ day: string; n: number }[]>`
      SELECT to_char((c.created_at AT TIME ZONE ${AR_TZ})::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
      FROM product_clicks c
      JOIN search_sponsorships s ON s.share_token = c.search_share_token AND s.product_id = c.product_id
      WHERE s.placement_id = ${p.id}::uuid
      GROUP BY 1
    `,
    sql<{ product_id: string; title: string; impressions: number; clicks: number }[]>`
      SELECT pr.id AS product_id, pr.title,
             COALESCE(i.n, 0)::int AS impressions, COALESCE(c.n, 0)::int AS clicks
      FROM products pr
      LEFT JOIN (
        SELECT product_id, count(*)::int AS n FROM product_impressions
        WHERE placement_id = ${p.id}::uuid GROUP BY product_id
      ) i ON i.product_id = pr.id
      LEFT JOIN (
        SELECT c.product_id, count(*)::int AS n
        FROM product_clicks c
        JOIN search_sponsorships s ON s.share_token = c.search_share_token AND s.product_id = c.product_id
        WHERE s.placement_id = ${p.id}::uuid GROUP BY c.product_id
      ) c ON c.product_id = pr.id
      WHERE i.n IS NOT NULL OR c.n IS NOT NULL
      ORDER BY clicks DESC, impressions DESC
      LIMIT 5
    `,
  ]);

  const impressions = impRow[0]?.n ?? 0;
  const clicks = clickRow[0]?.n ?? 0;
  const eng = new Map(engagementRows.map((r) => [r.event_type, r.n]));
  const home = new Map(homeRows.map((r) => [r.event_type, r.n]));
  const organicImpressions = organicImpRow[0]?.n ?? 0;
  const organicClicks = organicClickRow[0]?.n ?? 0;
  const amountPaid = p.amount_paid_ars;

  const dayMap = new Map<string, { impressions: number; clicks: number }>();
  for (const r of impByDay) dayMap.set(r.day, { impressions: r.n, clicks: dayMap.get(r.day)?.clicks ?? 0 });
  for (const r of clickByDay) dayMap.set(r.day, { impressions: dayMap.get(r.day)?.impressions ?? 0, clicks: r.n });
  const byDay = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    placement_id: p.id,
    from,
    to,
    daysActive: Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000)),
    searchesWithCampaign: searchRow[0]?.searches ?? 0,
    impressions,
    uniqueVisitors: impRow[0]?.visitors ?? 0,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    detailViews: eng.get("product_view_details") ?? 0,
    chatAsks: eng.get("product_ask_about") ?? 0,
    compareAdds: eng.get("product_compare_add") ?? 0,
    avgPosition: searchRow[0]?.avg_position != null ? round(searchRow[0].avg_position) : null,
    slotUses: searchRow[0]?.slots ?? 0,
    homeViews: home.get("sponsor_home_view") ?? 0,
    homeClicks: home.get("sponsor_home_click") ?? 0,
    organicImpressions,
    organicClicks,
    organicCtr: organicImpressions > 0 ? organicClicks / organicImpressions : null,
    amountPaid: amountPaid ?? null,
    costPerThousandImpressions: amountPaid != null && impressions > 0 ? round((amountPaid / impressions) * 1000, 0) : null,
    costPerClick: amountPaid != null && clicks > 0 ? round(amountPaid / clicks, 0) : null,
    byDay,
    topProducts: topRows,
  };
}

// GET /api/admin/sponsors/stats — rendimiento de TODAS las campañas (impresiones,
// clicks, CTR, costo por click / por mil impresiones, vs. la misma tienda sin
// patrocinio). Pocas campañas → una tanda de consultas por campaña alcanza.
export async function GET(request: NextRequest) {
  if (!(await getAdminSession(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const placements = await sql<SponsoredPlacement[]>`
      SELECT * FROM sponsored_placements ORDER BY created_at DESC
    `;
    const stats = await Promise.all(placements.map((p) => statsFor(p as unknown as SponsoredPlacement)));
    return NextResponse.json({ stats });
  } catch (error) {
    console.error("[GET /api/admin/sponsors/stats]", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
