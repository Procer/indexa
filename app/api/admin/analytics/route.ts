import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import { getAdminSession } from "@/lib/auth/adminSession";
import type { Slots, SearchAnalytics, ProductCategory } from "@/types";

interface AnalyticsSearchRow {
  share_token: string;
  slots: Slots | null;
  result_count: number;
  created_at: string;
}
interface AnalyticsClickRow {
  product_id: string;
  search_share_token: string | null;
  created_at: string;
}

const ALLOWED_DAYS = [7, 30, 90];

// GET /api/admin/analytics?days=30 — indicadores de búsquedas para el panel admin.
export async function GET(request: NextRequest) {
  if (!(await getAdminSession(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let searchRows: AnalyticsSearchRow[];
  let clickRows: AnalyticsClickRow[];
  let buyEventRows: { recommended: boolean }[];
  try {
    [searchRows, clickRows, buyEventRows] = await Promise.all([
      sql<AnalyticsSearchRow[]>`
        SELECT share_token, slots, result_count, created_at
        FROM searches WHERE created_at >= ${cutoff}
      `,
      sql<AnalyticsClickRow[]>`
        SELECT product_id, search_share_token, created_at
        FROM product_clicks WHERE created_at >= ${cutoff}
      `,
      // Jugada #17: clicks de compra con la marca de si el equipo era un
      // recomendado del chat (metadata.recommended, ver ProductChatCard).
      sql<{ recommended: boolean }[]>`
        SELECT COALESCE((metadata->>'recommended')::boolean, false) AS recommended
        FROM site_events
        WHERE event_type = 'product_buy_click' AND created_at >= ${cutoff}
      `,
    ]);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  const totalSearches = searchRows.length;
  const noResultCount = searchRows.filter((s) => s.result_count === 0).length;
  const fewResultCount = searchRows.filter((s) => s.result_count > 0 && s.result_count <= 2).length;

  const byDayMap = new Map<string, number>();
  for (const s of searchRows) {
    const date = (s.created_at as string).slice(0, 10);
    byDayMap.set(date, (byDayMap.get(date) ?? 0) + 1);
  }
  const byDay = Array.from(byDayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byCategoryMap = new Map<string, number>();
  for (const s of searchRows) {
    const slots = s.slots as Slots | null;
    const category = slots?.category ?? "sin categoría";
    byCategoryMap.set(category, (byCategoryMap.get(category) ?? 0) + 1);
  }
  const byCategory = Array.from(byCategoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const clicksByProduct = new Map<string, number>();
  for (const c of clickRows) {
    clicksByProduct.set(c.product_id, (clicksByProduct.get(c.product_id) ?? 0) + 1);
  }
  const topProductIds = Array.from(clicksByProduct.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id);

  let topProducts: SearchAnalytics["topProducts"] = [];
  if (topProductIds.length > 0) {
    const products = await sql<
      { id: string; title: string; category: ProductCategory | null; click_count: number }[]
    >`
      SELECT id, title, category, click_count
      FROM products WHERE id = ANY(${topProductIds}::uuid[])
    `;
    const productsById = new Map((products ?? []).map((p) => [p.id as string, p]));
    topProducts = topProductIds.map((id) => {
      const p = productsById.get(id);
      return {
        product_id: id,
        title: p?.title ?? "Producto eliminado",
        category: p?.category ?? null,
        clicks: clicksByProduct.get(id) ?? 0,
        click_count: p?.click_count ?? 0,
      };
    });
  }

  const searchTokensWithClick = new Set(
    clickRows.map((c) => c.search_share_token).filter((t): t is string => Boolean(t))
  );
  const searchesWithClick = searchRows.filter((s) => searchTokensWithClick.has(s.share_token)).length;

  const buyClicks = buyEventRows.length;
  const recommendedBuyClicks = buyEventRows.filter((e) => e.recommended).length;

  const analytics: SearchAnalytics = {
    days,
    totalSearches,
    noResultRate: totalSearches > 0 ? noResultCount / totalSearches : 0,
    fewResultRate: totalSearches > 0 ? fewResultCount / totalSearches : 0,
    conversionRate: totalSearches > 0 ? searchesWithClick / totalSearches : 0,
    totalClicks: clickRows.length,
    buyClicks,
    recommendedBuyClicks,
    recommendedBuyShare: buyClicks > 0 ? recommendedBuyClicks / buyClicks : 0,
    byDay,
    byCategory,
    topProducts,
  };

  return NextResponse.json(analytics);
}
