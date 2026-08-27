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
const searchCols = sql`
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
  limit = 8
): Promise<Product[]> {
  const sanitized = brands
    .map((b) => b.replace(/[^a-zA-Z0-9À-ÿ\s]/g, "").trim())
    .filter(Boolean);
  if (sanitized.length === 0) return [];

  const patterns = sanitized.map((b) => `%${b}%`);
  const rows = await sql<Product[]>`
    SELECT * FROM products
    WHERE category = ${category}
      AND available = true
      AND brand ILIKE ANY(${patterns}::text[])
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
      AND (ends_at IS NULL OR ends_at > ${now})
  `;
  return rows as unknown as SponsoredPlacement[];
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
    RETURNING ${searchCols}
  `;
  return row as unknown as Search;
}

export async function getSearchByShareToken(
  token: string
): Promise<Search | null> {
  const [byToken] = await sql<Search[]>`
    SELECT ${searchCols} FROM searches WHERE share_token = ${token}
  `;
  if (byToken) return byToken as unknown as Search;

  if (!UUID_RE.test(token)) return null;
  const [byId] = await sql<Search[]>`
    SELECT ${searchCols} FROM searches WHERE id = ${token}
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
    SELECT ${searchCols} FROM searches WHERE id = ${id}
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
