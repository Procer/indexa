// Frase corta y determinística sobre si un producto entra en el presupuesto
// del usuario, para agregar al `quality_price_analysis` cacheado (generado en
// batch sin contexto de usuario, ver lib/llm/batchAnalysis.ts) sin tener que
// volver a llamar al LLM en cada request. Mismas reglas que usaba
// PRODUCT_ANALYSIS_PROMPT (lib/llm/prompts.ts) para la comparación de
// presupuesto cuando el análisis se generaba en vivo.

import type { Product, QualityPriceScore, Slots } from "@/types";

type BudgetProduct = Pick<Product, "price_cash" | "price_installment" | "installment_count">;

// Cuota mensual estimada. `price_installment` en la DB YA es el monto de la
// cuota mensual, no el total financiado — verificado contra el catálogo real:
// price_installment × installment_count ≈ price_cash en todas las tiendas
// (Pardo/Cetrogar/Coppel/Jumbo/etc.). El bug reportado en vivo con los Samsung
// Fold era que classifyBudgetFit/isOverMonthly hacían price_installment /
// installment_count — dividían DE NUEVO una cuota que ya era mensual, y un
// teléfono de $4M pasaba como "$20.000/mes, entra en presupuesto". Se usa
// price_installment tal cual; guarda para la tienda que lo cargue como total.
export function estimatedMonthly(p: BudgetProduct): number | null {
  const pi = p.price_installment;
  const n = p.installment_count;
  const pc = p.price_cash;
  const candidates: number[] = [];
  if (pi != null && pi > 0) {
    // price_installment normalmente ya es la cuota mensual; si es ≥ al precio
    // de contado y hay más de 1 cuota, esa tienda lo cargó como total → dividir.
    candidates.push(pc != null && n != null && n > 1 && pi >= pc * 0.95 ? pi / n : pi);
  }
  // Piso de accesibilidad: cuota a 12 meses. Se toma el MÍNIMO con el plan real
  // para no marcar "fuera de presupuesto" algo accesible solo porque una tienda
  // ofrece pocas cuotas (ej. i3 de $950k en 3 cuotas = $317k/mes, pero es
  // perfectamente comprable con un presupuesto de $210k/mes — bug en vivo).
  if (pc != null) candidates.push(pc / 12);
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

// Tolerancia antes de marcar "fuera de presupuesto": mismo 20% de slack que ya
// usa el filtro SQL (BUDGET_SLACK en usageToSpecs.ts) y el análisis de calidad/
// precio (PRODUCT_ANALYSIS_PROMPT: ≤20% = "supera levemente", se sigue
// mostrando). Sin esto, un celular a $111.000/mes contra un presupuesto de
// $110.000/mes se llevaba el badge naranja grande "FUERA DE PRESUPUESTO" por
// $1.000 de diferencia (bug reportado en vivo con un Galaxy A36).
const BUDGET_TOLERANCE = 1.2;

// Clasificación (arriba / abajo / dentro) del presupuesto declarado — misma
// intención que la etiqueta `out_of_budget` que arma lib/search/pipeline.ts
// para los productos que inserta "por transparencia" cuando se pidió una
// marca/procesador puntual. El pipeline solo puede taguear los productos que
// él mismo insertó; refine-chat reconstruye el pool desde la DB (que no
// persiste ese campo), así que necesita re-derivarlo acá para que el saludo y
// las tarjetas del chat sigan mostrando el aviso. Para cuotas, si no hay plan
// real cargado se estima price_cash / 12 (ver estimatedMonthly).
export function classifyBudgetFit(
  product: BudgetProduct,
  slots: Pick<Slots, "budget_cash_ars" | "budget_cash_min_ars" | "budget_monthly_ars">
): "above" | "below" | null {
  if (slots.budget_cash_ars && product.price_cash) {
    if (product.price_cash > slots.budget_cash_ars * BUDGET_TOLERANCE) return "above";
    if (slots.budget_cash_min_ars && product.price_cash < slots.budget_cash_min_ars) return "below";
    return null;
  }
  if (slots.budget_monthly_ars) {
    const monthly = estimatedMonthly(product);
    if (monthly != null && monthly > slots.budget_monthly_ars * BUDGET_TOLERANCE) return "above";
    return null;
  }
  return null;
}

export function buildBudgetFitNote(product: BudgetProduct, slots: Slots): string | null {
  if (slots.budget_cash_ars && product.price_cash) {
    const budget = slots.budget_cash_ars;
    const price = product.price_cash;
    if (price <= budget) return "Entra en tu presupuesto.";
    if (price <= budget * 1.2) return "Supera levemente tu presupuesto.";
    return "Supera tu presupuesto disponible.";
  }

  if (slots.budget_monthly_ars) {
    const budget = slots.budget_monthly_ars;
    const installment = estimatedMonthly(product);
    if (installment == null) return null;
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
