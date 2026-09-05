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

// Meses/días de la semana en hora de Argentina — created_at es UTC, sin
// convertir un "lunes a la noche" puede contarse como martes.
const AR_TZ = "America/Argentina/Buenos_Aires";
const monthKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: AR_TZ,
  year: "numeric",
  month: "2-digit",
});
const dowFormatter = new Intl.DateTimeFormat("en-US", { timeZone: AR_TZ, weekday: "short" });
// Intl siempre devuelve el nombre en inglés con weekday:"short" pese al locale
// "es-AR" (bug conocido de Node/ICU con esa combinación) — se mapea a mano.
const DOW_LABELS: Record<string, string> = {
  Mon: "Lunes", Tue: "Martes", Wed: "Miércoles", Thu: "Jueves",
  Fri: "Viernes", Sat: "Sábado", Sun: "Domingo",
};
const DOW_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Marcas de 2-3 letras que van todo en mayúscula (siglas), no "Hp"/"Lg"/"Tcl".
const ACRONYM_BRANDS = new Set(["hp", "lg", "tcl", "msi", "cx"]);
function normalizeBrandDisplay(raw: string): string {
  const lower = raw.toLowerCase();
  if (ACRONYM_BRANDS.has(lower)) return lower.toUpperCase();
  return lower.replace(/\b\w/g, (c) => c.toUpperCase());
}

// GET /api/admin/analytics?days=30 — indicadores de búsquedas para el panel admin.
export async function GET(request: NextRequest) {
  if (!(await getAdminSession(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Patrones (mes del año / día de la semana): ventana fija del año calendario
  // en curso, INDEPENDIENTE del picker 7/30/90 — con 7 días no hay forma de ver
  // un patrón semanal o estacional real, necesitan más repeticiones que las que
  // da el rango corto de las tarjetas/gráfico diario de arriba.
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();

  let searchRows: AnalyticsSearchRow[];
  let clickRows: AnalyticsClickRow[];
  let buyEventRows: { recommended: boolean }[];
  let patternRows: { created_at: string }[];
  let storeRows: { store: string; count: number }[];
  try {
    [searchRows, clickRows, buyEventRows, patternRows, storeRows] = await Promise.all([
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
      sql<{ created_at: string }[]>`
        SELECT created_at FROM searches WHERE created_at >= ${yearStart}
      `,
      sql<{ store: string; count: number }[]>`
        SELECT p.source AS store, COUNT(*)::int AS count
        FROM product_clicks c
        JOIN products p ON p.id = c.product_id
        WHERE c.created_at >= ${cutoff}
        GROUP BY p.source
        ORDER BY count DESC
        LIMIT 8
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
  const byUseCaseMap = new Map<string, number>();
  const byBrandMap = new Map<string, { display: string; count: number }>();
  for (const s of searchRows) {
    const slots = s.slots as Slots | null;
    const category = slots?.category ?? "sin categoría";
    byCategoryMap.set(category, (byCategoryMap.get(category) ?? 0) + 1);
    for (const useCase of slots?.use_cases ?? []) {
      byUseCaseMap.set(useCase, (byUseCaseMap.get(useCase) ?? 0) + 1);
    }
    for (const brand of slots?.preferences?.brands_preferred ?? []) {
      const trimmed = brand.trim();
      if (!trimmed) continue;
      // Agrupar case-insensitive ("Xiaomi" vs "xiaomi" es la misma marca,
      // visto en datos reales) — se guarda como {display, count} por key en
      // minúscula para no perder la marca 2 veces en el ranking.
      const key = trimmed.toLowerCase();
      const existing = byBrandMap.get(key);
      byBrandMap.set(key, { display: existing?.display ?? normalizeBrandDisplay(trimmed), count: (existing?.count ?? 0) + 1 });
    }
  }
  const byCategory = Array.from(byCategoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const byUseCase = Array.from(byUseCaseMap.entries())
    .map(([use_case, count]) => ({ use_case, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const byBrand = Array.from(byBrandMap.values())
    .map(({ display, count }) => ({ brand: display, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Patrones del año calendario en curso — mes y día de la semana, hora AR.
  const byMonthMap = new Map<string, number>();
  const byDowMap = new Map<string, number>();
  for (const row of patternRows) {
    const date = new Date(row.created_at);
    const monthKey = monthKeyFormatter.format(date); // "2026-09"
    byMonthMap.set(monthKey, (byMonthMap.get(monthKey) ?? 0) + 1);
    const dowKey = dowFormatter.format(date); // "Mon".."Sun"
    byDowMap.set(dowKey, (byDowMap.get(dowKey) ?? 0) + 1);
  }
  const byMonth = Array.from(byMonthMap.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const byDayOfWeek = DOW_ORDER.map((dow) => ({
    dow,
    label: DOW_LABELS[dow],
    count: byDowMap.get(dow) ?? 0,
  }));
  const byStore = storeRows.map((r) => ({ store: r.store, count: r.count }));

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
    byUseCase,
    byBrand,
    byStore,
    byMonth,
    byDayOfWeek,
    topProducts,
  };

  return NextResponse.json(analytics);
}
