import { getProductIdsByCategory, getProductsByIds } from "@/lib/db/queries";
import { meetsMinSpecs, TIER_RANK } from "@/lib/domain/usageToSpecs";
import type { AlternativeProduct, NotebookSpecs, Product, ProductCategory, UseCase } from "@/types";

// Mismo slack de 20% que usa buildSQLFilters en usageToSpecs.ts para el
// presupuesto contado.
const BUDGET_SLACK = 1.2;

// Copia del mismo filtro de accesorios que usa app/api/search/route.ts — ahí
// se aplica a nivel query, acá hace falta repetirlo porque getProductIdsByCategory
// no lo tiene en cuenta (solo filtra por categoría + available).
const ACCESSORY_KEYWORDS = /\b(mochila|funda|bolso|bolsa|mouse|teclado|auricular|parlante|cable|adaptador|hub|soporte|pad|mousepad|cargador|fuente|cuaderno|batería externa|cooler|ventilador|limpiador|kit de limpieza|escritorio|silla|mueble|biblioteca|estante|rack de|mesa|armario|cajonera|archivero|repisa|librería|organizador|base para|kit de|powerbank)\b/i;

function toAlternativeProduct(p: Product): AlternativeProduct {
  return {
    id: p.id,
    title: p.title,
    brand: p.brand,
    model: p.model,
    category: p.category,
    price_cash: p.price_cash,
    price_installment: p.price_installment,
    image_url: p.image_url,
    images: p.images,
    source: p.source,
    url: p.url,
    affiliate_url: p.affiliate_url,
  };
}

function withinBudget(p: Product, budgetMax: number | null): boolean {
  if (budgetMax === null) return true;
  return p.price_cash !== null && p.price_cash <= budgetMax * BUDGET_SLACK;
}

// Búsqueda liviana sin LLM ni embeddings, para el chat del comparador: cuando
// ninguno de los dos productos en pantalla satisface el uso/presupuesto
// declarado, encuentra un tercer candidato real de la misma categoría.
export async function findAlternativeProduct(params: {
  category: ProductCategory;
  useCases: UseCase[];
  budgetMax: number | null;
  excludeIds: string[];
  // Productos ya comparados en pantalla — nunca se sugiere algo peor que el
  // mejor de estos dos en RAM/procesador (evita recomendar un downgrade solo
  // porque "entra en presupuesto").
  currentProducts: Product[];
}): Promise<AlternativeProduct | null> {
  const { category, useCases, budgetMax, excludeIds, currentProducts } = params;
  const excluded = new Set(excludeIds);

  const ids = await getProductIdsByCategory(category);
  const candidateIds = ids.filter((id) => !excluded.has(id));
  if (candidateIds.length === 0) return null;

  const products = await getProductsByIds(candidateIds);
  let candidates = products.filter(
    (p) => p.available && withinBudget(p, budgetMax) && !ACCESSORY_KEYWORDS.test(p.title)
  );

  const isNotebookLike = category === "notebook" || category === "desktop";
  if (isNotebookLike) {
    const currentSpecs = currentProducts
      .filter((p) => p.category === "notebook" || p.category === "desktop")
      .map((p) => p.specs as NotebookSpecs);

    if (currentSpecs.length > 0) {
      const bestRam = Math.max(...currentSpecs.map((s) => s.ram_gb));
      const bestTier = Math.max(...currentSpecs.map((s) => TIER_RANK[s.processor_tier]));
      candidates = candidates.filter((p) => {
        const specs = p.specs as NotebookSpecs;
        return specs.ram_gb >= bestRam && TIER_RANK[specs.processor_tier] >= bestTier;
      });
    }

    if (useCases.length > 0) {
      const specMatches = candidates.filter((p) => meetsMinSpecs(p.specs as NotebookSpecs, useCases));
      if (specMatches.length > 0) candidates = specMatches;
    }
  }

  if (candidates.length === 0) return null;

  // Entre los que ya son al menos tan buenos como lo comparado, el más barato
  // es la mejor relación precio/calidad (no hace pagar de más de forma gratuita).
  candidates.sort((a, b) => (a.price_cash ?? Infinity) - (b.price_cash ?? Infinity));
  return toAlternativeProduct(candidates[0]);
}
