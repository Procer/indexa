import type {
  ProductSearchResult,
  QualityPriceScore,
  ScoredProduct,
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

// El boost de patrocinado ya NO se aplica acá: el modelo nuevo matchea por
// tienda + rubro (products.source / products.category), datos que hybrid_search
// no devuelve. Se resuelve en lib/search/pipeline.ts, sobre los Product
// completos (ver sponsorBoost / applySponsor ahí).
export function scoreResults(results: ProductSearchResult[]): ScoredProduct[] {
  return results
    .map((product): ScoredProduct => ({
      ...product,
      final_score: product.similarity + popularityBoost(product.click_count ?? 0),
    }))
    .sort((a, b) => b.final_score - a.final_score);
}
