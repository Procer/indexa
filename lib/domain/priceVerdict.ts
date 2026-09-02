import type { Product } from "@/types";

// Veredicto de precio de una línea (jugada #15 de PLAN_MEJORAS). Determinístico,
// sin LLM: compara el precio de contado de cada producto contra la MEDIANA de
// su misma configuración (categoría + marca + RAM + almacenamiento).
//
// La mediana sale, en orden de preferencia:
//   1. del catálogo completo (getConfigPriceMedians, cacheada) si se pasa,
//   2. si no, del propio set (el pool rankeado de la búsqueda).
// Sin muestra suficiente (< 3 productos de esa config) no devuelve nada — mejor
// callar que comparar contra n=1.

export function priceConfigKey(
  category: string,
  brand: string | null,
  ramGb: unknown,
  storageGb: unknown
): string | null {
  if (!brand || typeof ramGb !== "number" || typeof storageGb !== "number") return null;
  return `${category}|${brand.toLowerCase().trim()}|${ramGb}|${storageGb}`;
}

function keyForProduct(p: Product): string | null {
  const s = p.specs as { ram_gb?: number; storage_gb?: number };
  return priceConfigKey(p.category, p.brand, s.ram_gb, s.storage_gb);
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const MIN_SAMPLE = 3;

function verdictText(priceCash: number, med: number): string | null {
  if (med <= 0) return null;
  const diffPct = Math.round(((priceCash - med) / med) * 100);
  if (diffPct <= -8) return `Buen precio: ~${Math.abs(diffPct)}% bajo el promedio de esta configuración`;
  if (diffPct >= 12) return `Precio alto: ~${diffPct}% sobre el promedio de esta configuración`;
  return "Precio en línea con esta configuración";
}

export function buildPriceVerdicts(
  products: Product[],
  catalogMedians?: Record<string, number>
): Map<string, string> {
  // Mediana del propio set como fallback cuando no hay dato de catálogo.
  const poolGroups = new Map<string, number[]>();
  for (const p of products) {
    const key = keyForProduct(p);
    if (!key || p.price_cash == null || p.price_cash <= 0) continue;
    const arr = poolGroups.get(key) ?? [];
    arr.push(p.price_cash);
    poolGroups.set(key, arr);
  }

  const out = new Map<string, string>();
  for (const p of products) {
    const key = keyForProduct(p);
    if (!key || p.price_cash == null || p.price_cash <= 0) continue;

    const catalogMed = catalogMedians?.[key];
    let med: number | undefined = catalogMed;
    if (med == null) {
      const prices = poolGroups.get(key);
      if (!prices || prices.length < MIN_SAMPLE) continue;
      med = median(prices);
    }

    const text = verdictText(p.price_cash, med);
    if (text) out.set(p.id, text);
  }
  return out;
}
