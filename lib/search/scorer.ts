import type {
  ProductSearchResult,
  ScoredProduct,
  SponsoredPlacement,
} from "@/types";

// Boost logarítmico: crece rápido al inicio y se satura.
// 0 clicks → 0 | 10 clicks → ~0.013 | 100 clicks → ~0.025 | 10k clicks → 0.05 (máx)
const MAX_POPULARITY_BOOST = 0.05;
function popularityBoost(clickCount: number): number {
  return (Math.log10(1 + clickCount) / 4) * MAX_POPULARITY_BOOST;
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
      if (placement && product.similarity >= placement.min_relevance) {
        score += placement.score_boost;
      }

      return { ...product, final_score: score };
    })
    .sort((a, b) => b.final_score - a.final_score);
}
