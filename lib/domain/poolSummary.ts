import { TIER_RANK } from "@/lib/domain/usageToSpecs";
import type { NotebookSpecs, Product, ProcessorTier } from "@/types";

const TIER_ORDER = (Object.keys(TIER_RANK) as ProcessorTier[]).sort(
  (a, b) => TIER_RANK[a] - TIER_RANK[b]
);

// Resumen agregado (sin LLM) de TODO el pool de resultados de una búsqueda —
// a diferencia del detalle producto por producto, esto cubre productos que el
// usuario todavía no cargó en pantalla (scroll infinito), para que el chat
// pueda razonar sobre el universo completo de resultados sin tener que
// mandarle al LLM las specs de cada uno.
export function summarizePool(products: Product[]): string {
  if (products.length === 0) return "No hay resultados para esta búsqueda.";

  const lines: string[] = [`Total de resultados que coinciden con la búsqueda: ${products.length}`];

  const prices = products
    .map((p) => p.price_cash)
    .filter((p): p is number => p != null);
  if (prices.length > 0) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    lines.push(`Rango de precio contado: $${min.toLocaleString("es-AR")} - $${max.toLocaleString("es-AR")} ARS`);
  }

  const tierCounts = new Map<ProcessorTier, number>();
  const ramCounts = new Map<number, number>();
  for (const p of products) {
    if (p.category !== "notebook" && p.category !== "desktop") continue;
    const s = p.specs as Partial<NotebookSpecs>;
    if (s.processor_tier) tierCounts.set(s.processor_tier, (tierCounts.get(s.processor_tier) ?? 0) + 1);
    if (s.ram_gb) ramCounts.set(s.ram_gb, (ramCounts.get(s.ram_gb) ?? 0) + 1);
  }

  if (tierCounts.size > 0) {
    const parts = TIER_ORDER.filter((t) => tierCounts.has(t)).map((t) => `${t} (${tierCounts.get(t)})`);
    lines.push(`Distribución de procesador: ${parts.join(", ")}`);
  }
  if (ramCounts.size > 0) {
    const parts = Array.from(ramCounts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ram, count]) => `${ram}GB (${count})`);
    lines.push(`Distribución de RAM: ${parts.join(", ")}`);
  }

  return lines.join("\n");
}
