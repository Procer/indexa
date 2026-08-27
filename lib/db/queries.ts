import { randomBytes } from "crypto";
import { supabase } from "./supabase";
import type {
  PriceHistoryPoint,
  Product,
  ProductAnalysis,
  Search,
  Slots,
  SponsoredPlacement,
} from "@/types";

export async function getProductIdsByCategory(
  category: string,
  limit = 150
): Promise<string[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .eq("category", category)
    .eq("available", true)
    .not("embedding", "is", null)
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((p) => p.id as string);
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
  const sanitized = brands.map((b) => b.replace(/[^a-zA-Z0-9À-ÿ\s]/g, "").trim()).filter(Boolean);
  if (sanitized.length === 0) return [];

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("category", category)
    .eq("available", true)
    // PostgREST usa "*" como comodín dentro de un string de filtro .or(), no
    // "%" (eso es solo para .ilike() como método directo) — con "%" nunca
    // matcheaba nada, esta query de respaldo devolvía siempre vacío (bug
    // real: "pedí Dell y no apareció ni marcada como fuera de presupuesto").
    .or(sanitized.map((b) => `brand.ilike.*${b}*`).join(","))
    .order("price_cash", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Product[];
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
  const sanitized = values.map((v) => v.replace(/[^a-zA-Z0-9À-ÿ\s]/g, "").trim()).filter(Boolean);
  if (sanitized.length === 0) return [];

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("category", category)
    .eq("available", true)
    .or(sanitized.map((v) => `specs->>${specField}.ilike.*${v}*`).join(","))
    .order("price_cash", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Product[];
}

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .in("id", ids);

  if (error) throw error;

  const map = new Map(
    (data ?? []).map((p) => [p.id as string, p as Product])
  );
  return ids
    .map((id) => map.get(id))
    .filter((p): p is Product => p !== undefined);
}

export async function getPriceHistory(
  productId: string,
  days = 90
): Promise<PriceHistoryPoint[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("price_history")
    .select("price_cash, price_installment, recorded_at")
    .eq("product_id", productId)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PriceHistoryPoint[];
}

export async function getActiveSponsoredPlacements(): Promise<
  SponsoredPlacement[]
> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("sponsored_placements")
    .select("*")
    .eq("active", true)
    .or(`ends_at.is.null,ends_at.gt.${now}`);

  if (error) throw error;
  return (data ?? []) as SponsoredPlacement[];
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

  const { data, error } = await supabase
    .from("searches")
    .insert({
      share_token: shareToken,
      raw_input: params.rawInput,
      slots: params.slots,
      expanded_query: params.expandedQuery,
      query_embedding: params.queryEmbedding,
      result_ids: params.resultIds,
      session_id: params.sessionId,
      result_count: params.resultIds.length,
    })
    .select("id, raw_input, slots, expanded_query, result_ids, share_token, user_id, session_id, result_count, created_at")
    .single();

  if (error) throw error;
  return data as Search;
}

export async function getSearchByShareToken(
  token: string
): Promise<Search | null> {
  const FIELDS = "id, raw_input, slots, expanded_query, result_ids, share_token, user_id, session_id, result_count, created_at";

  const { data: byToken } = await supabase
    .from("searches")
    .select(FIELDS)
    .eq("share_token", token)
    .maybeSingle();
  if (byToken) return byToken as Search;

  const { data: byId } = await supabase
    .from("searches")
    .select(FIELDS)
    .eq("id", token)
    .maybeSingle();
  return (byId as Search) ?? null;
}

// Solo para re-derivar el pool rankeado en /api/search/[token]/more cuando la
// caché del pool (lib/search/cache.ts, setPoolCache) ya expiró — no se agrega
// query_embedding al tipo Search ni a su FIELDS de siempre porque nadie más lo
// necesita y es un vector de 1536 posiciones (innecesario en el resto de la app).
export async function getSearchPipelineInputs(
  shareToken: string
): Promise<{ slots: Slots; queryEmbedding: number[]; queryText?: string } | null> {
  const { data, error } = await supabase
    .from("searches")
    .select("slots, query_embedding, raw_input")
    .eq("share_token", shareToken)
    .maybeSingle();

  if (error || !data || !data.query_embedding) return null;

  const raw = data.query_embedding as unknown;
  const queryEmbedding = typeof raw === "string" ? (JSON.parse(raw) as number[]) : (raw as number[]);
  return { slots: data.slots as Slots, queryEmbedding, queryText: data.raw_input ?? undefined };
}

export async function getSearchById(id: string): Promise<Search | null> {
  const { data, error } = await supabase
    .from("searches")
    .select(
      "id, raw_input, slots, expanded_query, result_ids, share_token, user_id, session_id, result_count, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as Search) ?? null;
}

export async function updateProductAnalysis(
  productId: string,
  analysis: ProductAnalysis
): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({
      quality_price_score: analysis.quality_price_score,
      quality_price_analysis: analysis.quality_price_analysis,
      analysis_generated_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (error) throw error;
}
