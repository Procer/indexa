import { randomBytes } from "crypto";
import { sql, toVector, parseVector } from "./sql";
import type {
  PriceHistoryPoint,
  Product,
  ProductAnalysis,
  Search,
  Slots,
  SponsoredPlacement,
} from "@/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lista de columnas de `searches` SIN query_embedding (vector de 1536 — caro
// e innecesario en el 99% de las lecturas; solo getSearchPipelineInputs lo pide).
// Función (no constante) para no invocar `sql` en la carga del módulo — el
// pool se crea perezosamente y no debe existir en tiempo de build.
const searchCols = () => sql`
  id, raw_input, slots, expanded_query, result_ids, share_token,
  user_id, session_id, result_count, created_at
`;

export async function getProductIdsByCategory(
  category: string,
  limit = 150
): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM products
    WHERE category = ${category}
      AND available = true
      AND embedding IS NOT NULL
    LIMIT ${limit}
  `;
  return rows.map((r) => r.id);
}

// Trae productos de una marca/categoría sin importar precio — usado para
// mostrar transparentemente una opción de la marca pedida que quedó afuera
// del pool normal por estar fuera del rango de presupuesto declarado (ver
// buildRankedPool), en vez de que el chat diga "no encontré ninguna" cuando
// en realidad sí existe, solo que más cara o más barata de lo pedido.
export async function getProductsByBrand(
  category: string,
  brands: string[],
  limit = 8,
  // Opcional: además de la marca, exigir que el título contenga esta palabra
  // (ej. "fold" / "flip"). Se usa para la transparencia de presupuesto cuando
  // el usuario pidió una línea/formato puntual ("samsung fold") que no entra
  // en su presupuesto — sin esto getProductsByBrand traía los 8 Samsung más
  // baratos (ninguno plegable) y no se insertaba nada marcado fuera de rango.
  titleContains?: string
): Promise<Product[]> {
  const sanitized = brands
    .map((b) => b.replace(/[^a-zA-Z0-9À-ÿ\s]/g, "").trim())
    .filter(Boolean);
  if (sanitized.length === 0) return [];

  const patterns = sanitized.map((b) => `%${b}%`);
  const titlePattern = titleContains
    ? `%${titleContains.replace(/[^a-zA-Z0-9À-ÿ\s]/g, "").trim()}%`
    : null;
  const rows = await sql<Product[]>`
    SELECT * FROM products
    WHERE category = ${category}
      AND available = true
      AND brand ILIKE ANY(${patterns}::text[])
      AND (${titlePattern}::text IS NULL OR title ILIKE ${titlePattern})
    ORDER BY price_cash ASC NULLS LAST
    LIMIT ${limit}
  `;
  return rows as unknown as Product[];
}

// Misma idea que getProductsByBrand pero contra un campo de specs (JSON) en
// vez de la columna brand — usado hoy para "procesador puntual pedido"
// (specs->>processor_model), mismo patrón de transparencia de presupuesto.
export async function getProductsBySpec(
  category: string,
  specField: string,
  values: string[],
  limit = 8
): Promise<Product[]> {
  const sanitized = values
    .map((v) => v.replace(/[^a-zA-Z0-9À-ÿ\s]/g, "").trim())
    .filter(Boolean);
  if (sanitized.length === 0) return [];

  const patterns = sanitized.map((v) => `%${v}%`);
  const rows = await sql<Product[]>`
    SELECT * FROM products
    WHERE category = ${category}
      AND available = true
      AND (specs ->> ${specField}) ILIKE ANY(${patterns}::text[])
    ORDER BY price_cash ASC NULLS LAST
    LIMIT ${limit}
  `;
  return rows as unknown as Product[];
}

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];

  const rows = await sql<Product[]>`
    SELECT * FROM products WHERE id = ANY(${ids}::uuid[])
  `;
  const map = new Map(rows.map((p) => [p.id as string, p as Product]));
  return ids
    .map((id) => map.get(id))
    .filter((p): p is Product => p !== undefined);
}

export async function getPriceHistory(
  productId: string,
  days = 90
): Promise<PriceHistoryPoint[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const rows = await sql<PriceHistoryPoint[]>`
    SELECT price_cash, price_installment, recorded_at
    FROM price_history
    WHERE product_id = ${productId}
      AND recorded_at >= ${since}
    ORDER BY recorded_at ASC
  `;
  return rows as unknown as PriceHistoryPoint[];
}

export async function getActiveSponsoredPlacements(): Promise<
  SponsoredPlacement[]
> {
  const now = new Date().toISOString();

  const rows = await sql<SponsoredPlacement[]>`
    SELECT * FROM sponsored_placements
    WHERE active = true
      AND target_source IS NOT NULL
      AND (ends_at IS NULL OR ends_at > ${now})
      AND (starts_at IS NULL OR starts_at <= ${now})
  `;
  return rows as unknown as SponsoredPlacement[];
}

export interface SponsorshipRow {
  product_id: string;
  placement_id: string;
  position: number | null;
  via: "boost" | "slot";
}

// Guarda qué productos de una búsqueda quedaron patrocinados (y por qué
// campaña / en qué posición del pool). Se usa para: etiquetar "Patrocinado" al
// recargar o paginar, y atribuir impresiones y clicks a la campaña.
export async function saveSearchSponsorships(
  shareToken: string,
  rows: SponsorshipRow[]
): Promise<void> {
  if (rows.length === 0) return;
  await sql`
    INSERT INTO search_sponsorships ${sql(
      rows.map((r) => ({ share_token: shareToken, ...r })),
      "share_token",
      "product_id",
      "placement_id",
      "position",
      "via"
    )}
    ON CONFLICT (share_token, product_id) DO NOTHING
  `;
}

export async function getSponsorshipsByToken(
  shareToken: string
): Promise<Map<string, string>> {
  const rows = await sql<{ product_id: string; placement_id: string }[]>`
    SELECT product_id, placement_id FROM search_sponsorships WHERE share_token = ${shareToken}
  `;
  return new Map(rows.map((r) => [r.product_id, r.placement_id]));
}

// Marca `sponsored` en productos que se sirven por un camino que no pasa por
// buildRankedPool (recarga de /search/[token], paginación "más resultados").
export async function markSponsored<T extends { id: string; sponsored?: boolean }>(
  shareToken: string,
  products: T[]
): Promise<T[]> {
  if (products.length === 0) return products;
  const map = await getSponsorshipsByToken(shareToken).catch(() => new Map<string, string>());
  if (map.size === 0) return products;
  return products.map((p) => (map.has(p.id) ? { ...p, sponsored: true } : p));
}

// Colocación patrocinada para la pantalla de entrada (chat guiado). Una sola:
// si hay varias con show_on_home, gana la de mayor boost.
export async function getHomeSponsor(): Promise<
  { id: string; advertiser: string; target_source: string; categories: string[] } | null
> {
  const now = new Date().toISOString();
  const [row] = await sql<
    { id: string; advertiser: string; target_source: string; categories: string[] }[]
  >`
    SELECT id, advertiser, target_source, categories
    FROM sponsored_placements
    WHERE active = true
      AND show_on_home = true
      AND target_source IS NOT NULL
      AND (ends_at IS NULL OR ends_at > ${now})
      AND (starts_at IS NULL OR starts_at <= ${now})
    ORDER BY score_boost DESC, created_at DESC
    LIMIT 1
  `;
  return row ?? null;
}

export async function saveSearch(params: {
  rawInput: string;
  slots: Slots;
  expandedQuery: string;
  queryEmbedding: number[];
  resultIds: string[];
  sessionId: string | null;
  visitId?: string | null;
  shareToken?: string;
}): Promise<Search> {
  const shareToken = params.shareToken ?? randomBytes(8).toString("hex");

  const [row] = await sql<Search[]>`
    INSERT INTO searches (
      share_token, raw_input, slots, expanded_query,
      query_embedding, result_ids, session_id, visit_id, result_count
    )
    VALUES (
      ${shareToken},
      ${params.rawInput},
      ${sql.json(params.slots as never)},
      ${params.expandedQuery},
      ${toVector(params.queryEmbedding)}::vector(1536),
      ${params.resultIds}::uuid[],
      ${params.sessionId},
      ${params.visitId ?? null},
      ${params.resultIds.length}
    )
    RETURNING ${searchCols()}
  `;
  return row as unknown as Search;
}

export async function getSearchByShareToken(
  token: string
): Promise<Search | null> {
  const [byToken] = await sql<Search[]>`
    SELECT ${searchCols()} FROM searches WHERE share_token = ${token}
  `;
  if (byToken) return byToken as unknown as Search;

  if (!UUID_RE.test(token)) return null;
  const [byId] = await sql<Search[]>`
    SELECT ${searchCols()} FROM searches WHERE id = ${token}
  `;
  return (byId as unknown as Search) ?? null;
}

// Solo para re-derivar el pool rankeado en /api/search/[token]/more cuando la
// caché del pool (lib/search/cache.ts, setPoolCache) ya expiró — no se agrega
// query_embedding al tipo Search ni a su lista de columnas de siempre porque
// nadie más lo necesita y es un vector de 1536 posiciones.
export async function getSearchPipelineInputs(
  shareToken: string
): Promise<{ slots: Slots; queryEmbedding: number[]; queryText?: string } | null> {
  const [row] = await sql<
    { slots: Slots; query_embedding: string | null; raw_input: string | null }[]
  >`
    SELECT slots, query_embedding, raw_input
    FROM searches
    WHERE share_token = ${shareToken}
  `;

  if (!row || !row.query_embedding) return null;

  return {
    slots: row.slots as Slots,
    queryEmbedding: parseVector(row.query_embedding),
    queryText: row.raw_input ?? undefined,
  };
}

export async function getSearchById(id: string): Promise<Search | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await sql<Search[]>`
    SELECT ${searchCols()} FROM searches WHERE id = ${id}
  `;
  return (row as unknown as Search) ?? null;
}

export async function updateProductAnalysis(
  productId: string,
  analysis: ProductAnalysis
): Promise<void> {
  await sql`
    UPDATE products SET
      quality_price_score    = ${analysis.quality_price_score},
      quality_price_analysis = ${analysis.quality_price_analysis},
      analysis_generated_at  = ${new Date().toISOString()}
    WHERE id = ${productId}
  `;
}

// Jugada #15: mediana de precio de contado por configuración
// (categoría + marca + RAM + almacenamiento) sobre TODO el catálogo disponible,
// solo para configs con al menos 3 unidades. Una consulta agregada barata,
// pensada para cachearse (ver getConfigPriceMedians en lib/search/cache.ts).
// La key coincide con priceConfigKey() de lib/domain/priceVerdict.ts.
export async function getConfigPriceMedians(): Promise<Record<string, number>> {
  const rows = await sql<
    { category: string; brand: string; ram_gb: number; storage_gb: number; median_price: number }[]
  >`
    SELECT
      category,
      lower(btrim(brand))                                        AS brand,
      (specs->>'ram_gb')::int                                    AS ram_gb,
      (specs->>'storage_gb')::int                                AS storage_gb,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cash)    AS median_price
    FROM products
    WHERE available = true
      AND price_cash IS NOT NULL AND price_cash > 0
      AND brand IS NOT NULL AND btrim(brand) <> ''
      AND (specs->>'ram_gb') ~ '^[0-9]+$'
      AND (specs->>'storage_gb') ~ '^[0-9]+$'
    GROUP BY 1, 2, 3, 4
    HAVING count(*) >= 3
  `;
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[`${r.category}|${r.brand}|${r.ram_gb}|${r.storage_gb}`] = Number(r.median_price);
  }
  return out;
}

// ─── Páginas públicas de tienda (/tiendas) ────────────────────────────────────

export interface StoreSummary {
  source: string;
  total: number;
  byCategory: Record<string, number>;
  minPrice: number | null;
  lastUpdate: string | null;
}

export async function getStoreSummaries(): Promise<StoreSummary[]> {
  const rows = await sql<
    { source: string; category: string; n: number; min_price: string | null; last_update: Date | string | null }[]
  >`
    SELECT source, category, COUNT(*)::int AS n,
           MIN(price_cash) FILTER (WHERE price_cash > 0) AS min_price,
           MAX(updated_at) AS last_update
    FROM products
    WHERE available = true
    GROUP BY source, category
  `;
  const map = new Map<string, StoreSummary>();
  for (const r of rows) {
    const s = map.get(r.source) ?? {
      source: r.source, total: 0, byCategory: {}, minPrice: null, lastUpdate: null,
    };
    s.total += r.n;
    s.byCategory[r.category] = r.n;
    const min = r.min_price != null ? Number(r.min_price) : null;
    if (min != null && (s.minPrice == null || min < s.minPrice)) s.minPrice = min;
    // Según el driver/parsers de sql.ts el timestamp llega como Date o como string.
    const upd = r.last_update ? new Date(r.last_update).toISOString() : null;
    if (upd && (!s.lastUpdate || upd > s.lastUpdate)) s.lastUpdate = upd;
    map.set(r.source, s);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export async function getStoreProducts(
  source: string,
  perCategory = 8
): Promise<Product[]> {
  const rows = await sql<Product[]>`
    SELECT * FROM (
      SELECT p.*, ROW_NUMBER() OVER (PARTITION BY category ORDER BY price_cash ASC) AS rn
      FROM products p
      WHERE source = ${source} AND available = true AND price_cash > 0
    ) t
    WHERE rn <= ${perCategory}
    ORDER BY category, price_cash ASC
  `;
  return rows as unknown as Product[];
}

// Productos cuyo precio contado bajó en los últimos `days` días (para /tiendas/[source]).
export async function getRecentPriceDrops(
  source: string,
  days = 14,
  limit = 6
): Promise<{ product: Product; previous: number; pct: number }[]> {
  const rows = await sql<(Product & { prev_price: string })[]>`
    SELECT p.*, prev.price_cash AS prev_price
    FROM products p
    JOIN LATERAL (
      SELECT price_cash FROM price_history h
      WHERE h.product_id = p.id AND h.recorded_at < NOW() - make_interval(days => ${days})
      ORDER BY h.recorded_at DESC LIMIT 1
    ) prev ON true
    WHERE p.source = ${source} AND p.available = true
      AND p.price_cash > 0 AND prev.price_cash > p.price_cash * 1.03
    ORDER BY (prev.price_cash - p.price_cash) / prev.price_cash DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => {
    const previous = Number(r.prev_price);
    const cur = Number(r.price_cash);
    return { product: r as unknown as Product, previous, pct: Math.round(((previous - cur) / previous) * 100) };
  });
}
