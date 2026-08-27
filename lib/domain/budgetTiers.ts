import type { ProductCategory } from "@/types";

export interface BudgetTier {
  key: "accesible" | "buena_relacion" | "mejor_nivel" | "sin_limite";
  label: string;
  // Techo de la banda en pesos. La banda "sin_limite" usa un techo generoso
  // (no null) para que el presupuesto siempre tenga un monto parseable —
  // sin esto, is_ambiguous/missing_info nunca se resuelve y el chat pregunta
  // presupuesto en loop.
  maxCash: number;
}

// Montos fijos, calculados sobre percentiles reales del catálogo (2026-08-05,
// ver memoria de sesión). Quedan fijos a mano — no se recalculan solos, van a
// desactualizarse con la inflación. Revisar cada tantos meses.
const CASH_TIERS: Record<ProductCategory, BudgetTier[]> = {
  notebook: [
    { key: "accesible", label: "Lo más accesible", maxCash: 900_000 },
    { key: "buena_relacion", label: "Buena relación precio y calidad", maxCash: 1_600_000 },
    { key: "mejor_nivel", label: "Quiero algo de mejor nivel", maxCash: 2_500_000 },
    { key: "sin_limite", label: "Lo mejor, no importa el precio", maxCash: 6_000_000 },
  ],
  desktop: [
    { key: "accesible", label: "Lo más accesible", maxCash: 500_000 },
    { key: "buena_relacion", label: "Buena relación precio y calidad", maxCash: 1_000_000 },
    { key: "mejor_nivel", label: "Quiero algo de mejor nivel", maxCash: 1_800_000 },
    { key: "sin_limite", label: "Lo mejor, no importa el precio", maxCash: 5_000_000 },
  ],
  tablet: [
    { key: "accesible", label: "Lo más accesible", maxCash: 250_000 },
    { key: "buena_relacion", label: "Buena relación precio y calidad", maxCash: 400_000 },
    { key: "mejor_nivel", label: "Quiero algo de mejor nivel", maxCash: 800_000 },
    { key: "sin_limite", label: "Lo mejor, no importa el precio", maxCash: 2_500_000 },
  ],
  tv: [
    { key: "accesible", label: "Lo más accesible", maxCash: 500_000 },
    { key: "buena_relacion", label: "Buena relación precio y calidad", maxCash: 850_000 },
    { key: "mejor_nivel", label: "Quiero algo de mejor nivel", maxCash: 1_500_000 },
    { key: "sin_limite", label: "Lo mejor, no importa el precio", maxCash: 4_000_000 },
  ],
  phone: [
    { key: "accesible", label: "Lo más accesible", maxCash: 300_000 },
    { key: "buena_relacion", label: "Buena relación precio y calidad", maxCash: 550_000 },
    { key: "mejor_nivel", label: "Quiero algo de mejor nivel", maxCash: 1_300_000 },
    { key: "sin_limite", label: "Lo mejor, no importa el precio", maxCash: 3_500_000 },
  ],
};

const FALLBACK_TIERS: BudgetTier[] = [
  { key: "accesible", label: "Lo más accesible", maxCash: 400_000 },
  { key: "buena_relacion", label: "Buena relación precio y calidad", maxCash: 800_000 },
  { key: "mejor_nivel", label: "Quiero algo de mejor nivel", maxCash: 1_500_000 },
  { key: "sin_limite", label: "Lo mejor, no importa el precio", maxCash: 4_000_000 },
];

export function getCashTiers(category: ProductCategory | null): BudgetTier[] {
  if (!category) return FALLBACK_TIERS;
  return CASH_TIERS[category] ?? FALLBACK_TIERS;
}

function roundToNiceThousand(n: number): number {
  return Math.round(n / 5000) * 5000;
}

// Cuotas: no tenemos bandas propias relevadas — se derivan de las de contado
// dividiendo por 12 cuotas (referencia típica) y redondeando a un número
// cómodo. Mismo orden de magnitud que los montos genéricos que usaba el
// sistema antes de esto (100k/200k/400k), pero ahora por categoría real.
export function getMonthlyTiers(category: ProductCategory | null): BudgetTier[] {
  return getCashTiers(category).map((t) => ({
    ...t,
    maxCash: roundToNiceThousand(t.maxCash / 12),
  }));
}

export function formatArs(n: number): string {
  return `$${n.toLocaleString("es-AR")}`;
}

// Frase de presupuesto sin ambigüedad para prompts de LLM — distingue
// explícitamente contado de cuotas mensuales. Sin esto, un chat que recibe
// solo el número (ej. 210000, sin aclarar si es "por mes" o "de contado")
// termina comparándolo contra el precio equivocado de cada producto (bug
// real: dijo "no encontré ninguna dentro de tu presupuesto de $210.000"
// comparando contra el precio de CONTADO, cuando $210.000 era el tope
// MENSUAL y el producto sí entraba en cuotas). Mismo criterio que ya usaba
// formatSearchCriteria en app/search/[token]/page.tsx para el resumen de
// criterios visible en la UI.
export function describeBudgetForChat(
  slots: {
    budget_cash_ars?: number | null;
    budget_cash_min_ars?: number | null;
    budget_monthly_ars?: number | null;
    budget_installment_count?: number | null;
  } | null | undefined
): string | null {
  if (slots?.budget_cash_ars) {
    return slots.budget_cash_min_ars
      ? `entre ${formatArs(slots.budget_cash_min_ars)} y ${formatArs(slots.budget_cash_ars)} ARS al contado`
      : `hasta ${formatArs(slots.budget_cash_ars)} ARS al contado`;
  }
  if (slots?.budget_monthly_ars) {
    return (
      `hasta ${formatArs(slots.budget_monthly_ars)} ARS por mes` +
      (slots.budget_installment_count ? ` en ${slots.budget_installment_count} cuotas` : "")
    );
  }
  return null;
}

// Convierte un monto a una frase en palabras que el LLM de slot-filling
// interpreta de forma confiable (mismo patrón que ya usaba BudgetPicker:
// "300 mil pesos", "1.6 millones de pesos").
export function numberToSpanishPesos(n: number): string {
  if (n >= 1_000_000) {
    const millions = Math.round((n / 1_000_000) * 10) / 10;
    const str = Number.isInteger(millions) ? String(millions) : String(millions).replace(".", ",");
    return `${str} ${millions === 1 ? "millón" : "millones"} de pesos`;
  }
  const thousands = Math.round(n / 1000);
  return `${thousands} mil pesos`;
}
