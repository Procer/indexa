import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import { getAdminSession } from "@/lib/auth/adminSession";
import { buildDedupeKey } from "@/lib/domain/dedupe";
import type {
  BudgetDistribution,
  DemandGap,
  Slots,
  StoreInsight,
  StoreProductStat,
  StoresInsights,
} from "@/types";

const ALLOWED_DAYS = [7, 30, 90];
const DAY_MS = 24 * 60 * 60 * 1000;

// Mismos cortes que el caché estructurado (lib/search/cache.ts, budgetTier) pero
// con etiquetas legibles. El presupuesto en cuotas se anualiza ×12 igual que allá.
function budgetBand(slots: Slots | null): string | null {
  const budget = slots?.budget_cash_ars ?? (slots?.budget_monthly_ars ? slots.budget_monthly_ars * 12 : null);
  if (!budget) return null;
  if (budget < 300_000) return "Hasta $300 mil";
  if (budget < 600_000) return "$300 – 600 mil";
  if (budget < 1_000_000) return "$600 mil – 1 millón";
  if (budget < 2_000_000) return "$1 – 2 millones";
  return "Más de $2 millones";
}
const BAND_ORDER = ["Hasta $300 mil", "$300 – 600 mil", "$600 mil – 1 millón", "$1 – 2 millones", "Más de $2 millones"];

function titleCaseBrand(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (["hp", "lg", "tcl", "msi"].includes(lower)) return lower.toUpperCase();
  return lower.replace(/\b\w/g, (c) => c.toUpperCase());
}

// GET /api/admin/stores?days=30 — vista para comercios: rendimiento de cada
// tienda (apariciones, clicks, tendencia), qué tan competitiva está en precio,
// qué productos nadie mira, y qué pide la gente que no se está pudiendo cubrir.
export async function GET(request: NextRequest) {
  if (!(await getAdminSession(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 30;
  const now = Date.now();
  const cutoff = new Date(now - days * DAY_MS).toISOString();
  const prevCutoff = new Date(now - 2 * days * DAY_MS).toISOString();

  try {
    const [
      impByStore,
      clickByStore,
      prevClickByStore,
      eventsByStore,
      catalogByStore,
      productStats,
      catalog,
      searches,
      firstImp,
    ] = await Promise.all([
      sql<{ store: string; n: number }[]>`
        SELECT lower(source) AS store, count(*)::int AS n
        FROM product_impressions WHERE created_at >= ${cutoff} GROUP BY 1
      `,
      sql<{ store: string; n: number }[]>`
        SELECT lower(p.source) AS store, count(*)::int AS n
        FROM product_clicks c JOIN products p ON p.id = c.product_id
        WHERE c.created_at >= ${cutoff} GROUP BY 1
      `,
      sql<{ store: string; n: number }[]>`
        SELECT lower(p.source) AS store, count(*)::int AS n
        FROM product_clicks c JOIN products p ON p.id = c.product_id
        WHERE c.created_at >= ${prevCutoff} AND c.created_at < ${cutoff} GROUP BY 1
      `,
      sql<{ store: string; event_type: string; n: number }[]>`
        SELECT lower(p.source) AS store, e.event_type, count(*)::int AS n
        FROM site_events e JOIN products p ON p.id = e.product_id
        WHERE e.created_at >= ${cutoff}
          AND e.event_type IN ('product_view_details', 'product_ask_about', 'product_compare_add')
        GROUP BY 1, 2
      `,
      sql<{ store: string; available: number; no_price: number; last_sync: string | null }[]>`
        SELECT lower(source) AS store,
               count(*) FILTER (WHERE available)::int AS available,
               count(*) FILTER (WHERE available AND (price_cash IS NULL OR price_cash = 0))::int AS no_price,
               max(scraped_at) AS last_sync
        FROM products GROUP BY 1
      `,
      // Por producto: cuánto se mostró y cuánto se clickeó en la ventana.
      sql<{ store: string; product_id: string; title: string; impressions: number; clicks: number }[]>`
        SELECT lower(p.source) AS store, p.id AS product_id, p.title,
               count(*)::int AS impressions,
               (SELECT count(*)::int FROM product_clicks c
                WHERE c.product_id = p.id AND c.created_at >= ${cutoff}) AS clicks
        FROM product_impressions i JOIN products p ON p.id = i.product_id
        WHERE i.created_at >= ${cutoff}
        GROUP BY p.id, p.source, p.title
      `,
      sql<{ id: string; source: string; category: string; brand: string | null; title: string; price_cash: number }[]>`
        SELECT id, source, category, brand, title, price_cash
        FROM products WHERE available = true AND price_cash > 0
      `,
      sql<{ slots: Slots | null; result_count: number; raw_input: string }[]>`
        SELECT slots, result_count, raw_input FROM searches WHERE created_at >= ${cutoff}
      `,
      sql<{ first: string | null }[]>`SELECT min(created_at) AS first FROM product_impressions`,
    ]);

    // ─── competitividad de precio (mismo criterio de "mismo producto" que el dedupe) ─
    const groups = new Map<string, { store: string; price: number }[]>();
    for (const p of catalog) {
      const key = buildDedupeKey(p);
      const list = groups.get(key) ?? [];
      list.push({ store: p.source.toLowerCase(), price: p.price_cash });
      groups.set(key, list);
    }
    const priceAgg = new Map<string, { comparable: number; cheapest: number; gapSum: number }>();
    for (const list of Array.from(groups.values())) {
      // precio mínimo por tienda dentro del grupo
      const byStore = new Map<string, number>();
      for (const { store, price } of list) {
        byStore.set(store, Math.min(byStore.get(store) ?? Infinity, price));
      }
      if (byStore.size < 2) continue;
      const min = Math.min(...Array.from(byStore.values()));
      for (const [store, price] of Array.from(byStore.entries())) {
        const agg = priceAgg.get(store) ?? { comparable: 0, cheapest: 0, gapSum: 0 };
        agg.comparable++;
        if (price <= min) agg.cheapest++;
        agg.gapSum += ((price - min) / min) * 100;
        priceAgg.set(store, agg);
      }
    }

    // ─── armar filas por tienda ──────────────────────────────────────────────
    const map = <T extends { store: string; n: number }>(rows: T[]) => new Map(rows.map((r) => [r.store, r.n]));
    const imp = map(impByStore);
    const clicks = map(clickByStore);
    const prev = map(prevClickByStore);
    const events = new Map<string, Record<string, number>>();
    for (const r of eventsByStore) {
      const cur = events.get(r.store) ?? {};
      cur[r.event_type] = r.n;
      events.set(r.store, cur);
    }
    const prodsByStore = new Map<string, StoreProductStat[]>();
    for (const r of productStats) {
      const list = prodsByStore.get(r.store) ?? [];
      list.push({ product_id: r.product_id, title: r.title, impressions: r.impressions, clicks: r.clicks });
      prodsByStore.set(r.store, list);
    }

    const stores: StoreInsight[] = catalogByStore
      .filter((c) => c.available > 0 || (imp.get(c.store) ?? 0) > 0 || (clicks.get(c.store) ?? 0) > 0)
      .map((c) => {
        const impressions = imp.get(c.store) ?? 0;
        const clk = clicks.get(c.store) ?? 0;
        const ev = events.get(c.store) ?? {};
        const price = priceAgg.get(c.store);
        const prods = prodsByStore.get(c.store) ?? [];
        return {
          store: c.store,
          impressions,
          clicks: clk,
          ctr: impressions > 0 ? clk / impressions : 0,
          prevClicks: prev.get(c.store) ?? 0,
          detailViews: ev.product_view_details ?? 0,
          chatAsks: ev.product_ask_about ?? 0,
          compareAdds: ev.product_compare_add ?? 0,
          availableProducts: c.available,
          withoutPrice: c.no_price,
          lastSyncAt: c.last_sync,
          comparableProducts: price?.comparable ?? 0,
          cheapestCount: price?.cheapest ?? 0,
          avgGapPct: price && price.comparable > 0 ? Math.round((price.gapSum / price.comparable) * 10) / 10 : null,
          topProducts: [...prods].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).filter((p) => p.clicks > 0).slice(0, 3),
          ignoredProducts: prods
            .filter((p) => p.clicks === 0 && p.impressions >= 5)
            .sort((a, b) => b.impressions - a.impressions)
            .slice(0, 3),
        };
      })
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || b.availableProducts - a.availableProducts);

    // ─── demanda sin cubrir y presupuestos ───────────────────────────────────
    const gapMap = new Map<string, DemandGap>();
    const budgetMap = new Map<string, Map<string, number>>();
    for (const s of searches) {
      const category = s.slots?.category ?? "sin categoría";
      const band = budgetBand(s.slots);
      const brandRaw = s.slots?.preferences?.brands_preferred?.[0]?.trim();
      const brand = brandRaw ? titleCaseBrand(brandRaw) : null;

      if (band) {
        const bands = budgetMap.get(category) ?? new Map<string, number>();
        bands.set(band, (bands.get(band) ?? 0) + 1);
        budgetMap.set(category, bands);
      }

      const key = `${category}|${brand ?? ""}|${band ?? "Sin presupuesto"}`;
      const gap =
        gapMap.get(key) ??
        ({ category, brand, budgetBand: band ?? "Sin presupuesto", searches: 0, unmet: 0, example: null } as DemandGap);
      gap.searches++;
      if (s.result_count <= 2) {
        gap.unmet++;
        if (!gap.example) gap.example = s.raw_input.slice(0, 140);
      }
      gapMap.set(key, gap);
    }
    const demandGaps = Array.from(gapMap.values())
      .filter((g) => g.unmet > 0)
      .sort((a, b) => b.unmet - a.unmet || b.searches - a.searches)
      .slice(0, 10);

    const budgetByCategory: BudgetDistribution[] = Array.from(budgetMap.entries())
      .map(([category, bands]) => ({
        category,
        total: Array.from(bands.values()).reduce((a, b) => a + b, 0),
        bands: BAND_ORDER.map((band) => ({ band, count: bands.get(band) ?? 0 })),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const body: StoresInsights = {
      days,
      totalImpressions: impByStore.reduce((s, r) => s + r.n, 0),
      totalClicks: clickByStore.reduce((s, r) => s + r.n, 0),
      stores,
      demandGaps,
      budgetByCategory,
      impressionsSince: firstImp[0]?.first ?? null,
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("[GET /api/admin/stores]", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
