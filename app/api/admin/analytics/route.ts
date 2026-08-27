import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";
import { getAdminUser } from "@/lib/auth/adminAuth";
import type { Slots, SearchAnalytics } from "@/types";

const ALLOWED_DAYS = [7, 30, 90];

// GET /api/admin/analytics?days=30 — indicadores de búsquedas para el panel admin.
export async function GET(request: NextRequest) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: searches, error: searchesError }, { data: clicks, error: clicksError }] = await Promise.all([
    supabase.from("searches").select("share_token, slots, result_count, created_at").gte("created_at", cutoff),
    supabase.from("product_clicks").select("product_id, search_share_token, created_at").gte("created_at", cutoff),
  ]);

  if (searchesError) return NextResponse.json({ error: searchesError.message }, { status: 500 });
  if (clicksError) return NextResponse.json({ error: clicksError.message }, { status: 500 });

  const searchRows = searches ?? [];
  const clickRows = clicks ?? [];

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
    const { data: products } = await supabase
      .from("products")
      .select("id, title, category, click_count")
      .in("id", topProductIds);
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

  const analytics: SearchAnalytics = {
    days,
    totalSearches,
    noResultRate: totalSearches > 0 ? noResultCount / totalSearches : 0,
    fewResultRate: totalSearches > 0 ? fewResultCount / totalSearches : 0,
    conversionRate: totalSearches > 0 ? searchesWithClick / totalSearches : 0,
    totalClicks: clickRows.length,
    byDay,
    byCategory,
    topProducts,
  };

  return NextResponse.json(analytics);
}
