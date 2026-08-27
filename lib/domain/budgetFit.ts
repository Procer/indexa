// Frase corta y determinística sobre si un producto entra en el presupuesto
// del usuario, para agregar al `quality_price_analysis` cacheado (generado en
// batch sin contexto de usuario, ver lib/llm/batchAnalysis.ts) sin tener que
// volver a llamar al LLM en cada request. Mismas reglas que usaba
// PRODUCT_ANALYSIS_PROMPT (lib/llm/prompts.ts) para la comparación de
// presupuesto cuando el análisis se generaba en vivo.

import type { Product, QualityPriceScore, Slots } from "@/types";

type BudgetProduct = Pick<Product, "price_cash" | "price_installment" | "installment_count">;

export function buildBudgetFitNote(product: BudgetProduct, slots: Slots): string | null {
  if (slots.budget_cash_ars && product.price_cash) {
    const budget = slots.budget_cash_ars;
    const price = product.price_cash;
    if (price <= budget) return "Entra en tu presupuesto.";
    if (price <= budget * 1.2) return "Supera levemente tu presupuesto.";
    return "Supera tu presupuesto disponible.";
  }

  if (
    slots.budget_monthly_ars &&
    product.price_installment &&
    product.installment_count
  ) {
    const budget = slots.budget_monthly_ars;
    const installment = product.price_installment / product.installment_count;
    if (installment <= budget) return "Entra en cuotas dentro de tu presupuesto mensual.";
    const overPct = Math.round(((installment - budget) / budget) * 100);
    return `Supera tu presupuesto mensual en cuotas por ~${overPct}%.`;
  }

  return null;
}

// Mismo tope que aplicaba el LLM en vivo (PRODUCT_ANALYSIS_PROMPT): si el
// producto supera el presupuesto, el score cacheado (generado sin contexto de
// presupuesto) no puede seguir mostrando EXCELENTE — evita que el badge quede
// inconsistente con la frase de arriba.
export function capScoreByBudgetFit(
  score: QualityPriceScore,
  product: BudgetProduct,
  slots: Slots
): QualityPriceScore {
  const RANK: Record<QualityPriceScore, number> = {
    EXCELENTE: 3,
    "MUY BUENO": 2,
    BUENO: 1,
    REGULAR: 0,
  };

  let cap: QualityPriceScore | null = null;
  if (slots.budget_cash_ars && product.price_cash) {
    const ratio = product.price_cash / slots.budget_cash_ars;
    if (ratio > 1.2) cap = "BUENO";
    else if (ratio > 1) cap = "MUY BUENO";
  }

  if (!cap) return score;
  return RANK[score] > RANK[cap] ? cap : score;
}
