import { supabase } from "@/lib/db/supabase";
import { buildSQLFilters } from "@/lib/domain/usageToSpecs";
import type { ProductSearchResult, Slots } from "@/types";

interface HybridSearchParams {
  queryEmbedding: number[];
  slots: Slots;
  limit: number;
  offset: number;
  candidateIds?: string[];
  // Texto crudo del usuario (no el expanded_query del LLM) — se usa para el
  // lado keyword de la búsqueda híbrida (RRF) en la función SQL, ver
  // supabase/migrations/019_hybrid_rrf_search.sql.
  queryText?: string;
}

export async function hybridSearch(
  params: HybridSearchParams
): Promise<ProductSearchResult[]> {
  const filters = buildSQLFilters(params.slots);

  const { data, error } = await supabase.rpc("hybrid_search", {
    query_embedding: params.queryEmbedding,
    category_filter: filters.category,
    max_price_cash: filters.max_price_cash,
    max_price_installment: filters.max_price_installment,
    require_gpu: filters.require_gpu,
    min_ram_gb: filters.min_ram_gb,
    require_ssd: filters.require_ssd,
    brands_excluded: filters.brands_excluded.length > 0 ? filters.brands_excluded : null,
    max_weight_kg: filters.max_weight_kg,
    limit_results: params.limit,
    offset_results: params.offset,
    candidate_ids: params.candidateIds && params.candidateIds.length > 0 ? params.candidateIds : null,
    query_text: params.queryText ?? null,
  });

  if (error) throw error;
  return (data ?? []) as ProductSearchResult[];
}
