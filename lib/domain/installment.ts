// Regla única de normalización de `price_installment` (jugada #13 de
// PLAN_MEJORAS). El campo en la DB debe ser SIEMPRE la cuota MENSUAL, nunca el
// total financiado. Algunas tiendas —o el parser de texto de una página— lo
// cargan como total; hasta ahora se parcheaba en runtime en cada request
// (estimatedMonthly). Acá vive la regla, para aplicarla al INGERIR:
//
//   si price_installment ≈ price_cash (≥ 95%) y hay más de 1 cuota
//   → el valor es el total financiado, se divide por la cantidad de cuotas.
//
// Devuelve la cuota mensual redondeada, o null si no hay plan de cuotas.
export function normalizeMonthlyInstallment(
  priceCash: number | null,
  priceInstallment: number | null,
  installmentCount: number | null
): number | null {
  if (priceInstallment == null || priceInstallment <= 0) return null;
  const n = installmentCount ?? 0;
  if (priceCash != null && priceCash > 0 && n > 1 && priceInstallment >= priceCash * 0.95) {
    return Math.round(priceInstallment / n);
  }
  return Math.round(priceInstallment);
}
