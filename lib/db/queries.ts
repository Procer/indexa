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
  `;
  return rows as unknown as SponsoredPlacement[];
}

// Colocación patrocinada para la pantalla de entrada (chat guiado). Una sola:
// si hay varias con show_on_home, gana la de mayor boost.
export async function getHomeSponsor(): Promise<
  { advertiser: string; target_source: string; categories: string[] } | null
> {
  const now = new Date().toISOString();
  const [row] = await sql<
    { advertiser: string; target_source: string; categories: string[] }[]
  >`
    SELECT advertiser, target_source, categories
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
  shareToken?: string;
}): Promise<Search> {
  const shareToken = params.shareToken ?? randomBytes(8).toString("hex");

  const [row] = await sql<Search[]>`
    INSERT INTO searches (
      share_token, raw_input, slots, expanded_query,
      query_embedding, result_ids, session_id, result_count
    )
    VALUES (
      ${shareToken},
      ${params.rawInput},
      ${sql.json(params.slots as never)},
      ${params.expandedQuery},
      ${toVector(params.queryEmbedding)}::vector(1536),
      ${params.resultIds}::uuid[],
      ${params.sessionId},
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
