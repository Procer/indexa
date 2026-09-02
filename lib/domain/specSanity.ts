import type { ProductCategory, ProductSpecs } from "@/types";

// Pasada de "cordura de specs" para el re-rank (jugada #9 de PLAN_MEJORAS).
// Generaliza a TODA categoría el filtro anti-RAM-inventada que hoy solo tiene
// tablet (ver tabletJunkPenalty en lib/search/pipeline.ts): una spec fuera del
// rango físico plausible para su categoría/precio pesa como sospechosa.
//
// Penaliza, NO excluye — puede ser lo único dentro del presupuesto, y el dato
// malo puede venir del normalizador y no del producto. La penalización se resta
// del final_score en el último sort del pool.

// Tope físico de RAM por categoría. Por encima de esto la spec casi siempre la
// infló la tienda/importador (visto: "aiprotablet 24GB", "ATOZEE 18GB", una
// notebook genérica con "40GB" en el título que era 4GB).
const RAM_CEILING: Partial<Record<ProductCategory, number>> = {
  notebook: 128,
  desktop: 256,
  phone: 24,
  tablet: 16,
};

// Piso de almacenamiento por categoría — debajo de esto es la RAM filtrada al
// disco o un error de extracción.
const STORAGE_FLOOR: Partial<Record<ProductCategory, number>> = {
  notebook: 32,
  desktop: 32,
  phone: 8,
  tablet: 8,
};

const INCH_RANGE: Partial<Record<ProductCategory, [number, number]>> = {
  notebook: [10, 18.5],
  desktop: [10, 34], // all-in-one
  phone: [4, 8],
  tablet: [6, 15],
  tv: [19, 120],
};

// Marcas con presencia real y catálogo verificable en AR. Una spec alta en una
// marca fuera de esta lista es más probablemente inventada. Cubre notebook /
// desktop / phone / tablet / tv — es una lista de "conocidas", no exhaustiva.
const KNOWN_BRANDS = new Set([
  "apple", "samsung", "lenovo", "hp", "dell", "asus", "acer", "msi", "gigabyte",
  "microsoft", "lg", "sony", "xiaomi", "motorola", "nokia", "huawei", "tcl",
  "alcatel", "realme", "honor", "zte", "philips", "noblex", "bgh", "philco",
  "hitachi", "rca", "sanyo", "hyundai", "kanji", "positivo", "bangho", "exo",
  "pcbox", "cx", "gfast", "enova",
]);

export interface SpecSanityResult {
  penalty: number; // 0 .. 0.45
  reasons: string[];
}

export function specSanityPenalty(
  category: ProductCategory,
  specs: ProductSpecs,
  brand: string | null,
  priceCash: number | null
): SpecSanityResult {
  const s = specs as Record<string, unknown>;
  const num = (k: string): number | null => (typeof s[k] === "number" && !Number.isNaN(s[k]) ? (s[k] as number) : null);
  const reasons: string[] = [];
  let penalty = 0;

  const ram = num("ram_gb");
  const storage = num("storage_gb");
  const inches = num("screen_inches");
  const weight = num("weight_kg");
  const known = KNOWN_BRANDS.has((brand ?? "").toLowerCase().trim());

  // RAM por encima del tope físico de la categoría → spec inventada.
  const ramCeiling = RAM_CEILING[category];
  if (ram != null && ramCeiling != null && ram > ramCeiling) {
    penalty += 0.35;
    reasons.push(`ram_gb=${ram} sobre el tope de ${ramCeiling} para ${category}`);
  }

  // RAM alta + marca desconocida + precio bajo = patrón "spec inflada por la
  // tienda" (la RAM real de ese precio/marca no llega ni cerca).
  if (ram != null && !known && ram >= 16 && priceCash != null && priceCash > 0 && priceCash < 250_000) {
    penalty += 0.3;
    reasons.push(`ram_gb=${ram} en marca desconocida a $${priceCash.toLocaleString("es-AR")}`);
  }

  // storage_gb == ram_gb: el normalizador copió el número de la RAM al disco.
  if (ram != null && storage != null && storage === ram && ram <= 64) {
    penalty += 0.15;
    reasons.push(`storage_gb == ram_gb (${ram})`);
  }

  // Almacenamiento por debajo del piso físico de la categoría.
  const storageFloor = STORAGE_FLOOR[category];
  if (storage != null && storageFloor != null && storage > 0 && storage < storageFloor) {
    penalty += 0.15;
    reasons.push(`storage_gb=${storage} bajo el piso de ${storageFloor} para ${category}`);
  }

  // Pantalla fuera del rango de la categoría. `0` es el centinela válido de
  // "sin pantalla" en desktop, no se penaliza.
  const range = INCH_RANGE[category];
  if (inches != null && inches !== 0 && range && (inches < range[0] || inches > range[1])) {
    penalty += 0.1;
    reasons.push(`screen_inches=${inches} fuera de ${range[0]}–${range[1]}`);
  }

  // Peso fuera del rango físico de una notebook (gramos sin convertir, o basura).
  if (category === "notebook" && weight != null && (weight < 0.5 || weight > 5)) {
    penalty += 0.1;
    reasons.push(`weight_kg=${weight}`);
  }

  return { penalty: Math.min(penalty, 0.45), reasons };
}
