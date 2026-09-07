import type {
  ProductSearchResult,
  QualityPriceScore,
  ScoredProduct,
  SponsoredPlacement,
} from "@/types";

// Boost logarítmico: crece rápido al inicio y se satura.
// 0 clicks → 0 | 10 clicks → ~0.013 | 100 clicks → ~0.025 | 10k clicks → 0.05 (máx)
const MAX_POPULARITY_BOOST = 0.05;
function popularityBoost(clickCount: number): number {
  return (Math.log10(1 + clickCount) / 4) * MAX_POPULARITY_BOOST;
}

// Ajuste chico y acotado por grado de calidad/precio — la métrica del objetivo
// "encontrar la mejor opción económica". hybrid_search no devuelve este campo,
// así que se aplica en lib/search/pipeline.ts (donde ya están resueltos los
// Product completos), sumándolo a final_score antes del dedupe y los re-ranks.
// Rango total ±0.06: alcanza para desempatar a favor de una unidad equilibrada
// —o hundir una con CPU flojo + RAM inflada + mal grado— sin dar vuelta el
// orden semántico. BUENO es el neutro (la mayoría del catálogo).
const QUALITY_PRICE_BOOST: Record<QualityPriceScore, number> = {
  EXCELENTE: 0.06,
  "MUY BUENO": 0.03,
  BUENO: 0,
  REGULAR: -0.06,
};

export function qualityPriceBoost(score: QualityPriceScore | null | undefined): number {
  return score ? QUALITY_PRICE_BOOST[score] ?? 0 : 0;
}

export function scoreResults(
  results: ProductSearchResult[],
  sponsoredPlacements: SponsoredPlacement[]
): ScoredProduct[] {
  const now = new Date();

  return results
    .map((product): ScoredProduct => {
      let score = product.similarity;

      // Boost de popularidad (acumulativo, pequeño)
      score += popularityBoost(product.click_count ?? 0);

      // Boost de patrocinado (solo si supera umbral de relevancia)
      const placement = sponsoredPlacements.find(
        (p) =>
          p.active &&
          p.product_ids.includes(product.id) &&
          (p.ends_at === null || new Date(p.ends_at) > now)
      );
      if (placement) {
        const applied = product.similarity >= placement.min_relevance;
        if (applied) score += placement.score_boost;
        // Observabilidad: sin este log no había forma de comprobar si una
        // campaña patrocinada realmente se aplicó (no hay badge para las
        // colocaciones — SponsoredBadge solo mira products.is_sponsored).
        console.log(
          `[SPONSOR] placement="${placement.advertiser}" product=${product.id} ` +
            `similarity=${product.similarity.toFixed(3)} minRelevance=${placement.min_relevance} ` +
            `boost=${placement.score_boost} applied=${applied}`
        );
      }

      return { ...product, final_score: score };
    })
    .sort((a, b) => b.final_score - a.final_score);
}
