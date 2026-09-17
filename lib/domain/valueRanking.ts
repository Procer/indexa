// Motor de "Valor" e insignias comparativas para la Vista B (lista rankeada,
// ver components/RankedResultsList.tsx) — pedido explícito del usuario:
// "que sea sumamente fácil entender cuál conviene más y en qué es mejor una
// de la otra". Deliberadamente NO reinventa una fórmula de specs por
// categoría desde cero: se apoya en quality_price_score (ya calculado por el
// análisis LLM de cada producto, cacheado, usado hoy como badge) + la
// posición relativa de precio DENTRO del pool visible — así funciona igual
// de bien en las 5 categorías sin depender de campos de spec que en algunas
// (ej. phone.processor_model/screen_type) se sabe que vienen alucinados.
//
// Las insignias ("gana en...") sí miran specs crudas, pero SOLO para elegir
// UNA dimensión relevante por categoría (la más "vendible") + precio — no
// para puntuar, así un dato de spec ruidoso like a lo sumo hace perder una
// insignia, nunca tuerce el número de Valor.

import { TIER_RANK } from "@/lib/domain/usageToSpecs";
import type {
  NotebookSpecs,
  PhoneSpecs,
  ProductCategory,
  ProductSpecs,
  QualityPriceScore,
  TabletSpecs,
  TvResolution,
  TvSpecs,
} from "@/types";

export interface ValueRankable {
  id: string;
  category: ProductCategory;
  price_cash: number | null;
  quality_price_score?: QualityPriceScore | null;
  specs?: ProductSpecs;
}

export type BadgeIcon = "camera" | "storage" | "ram" | "processor" | "screen" | "tag" | "star";

export interface ValueBadge {
  icon: BadgeIcon;
  text: string;
}

export interface ValueResult {
  value: number; // 0-10
  badges: ValueBadge[];
  note: string | null;
}

const QUALITY_BASE: Record<QualityPriceScore, number> = {
  EXCELENTE: 8.5,
  "MUY BUENO": 7,
  BUENO: 5.5,
  REGULAR: 3.5,
};

const RESOLUTION_RANK: Record<TvResolution, number> = { HD: 0, FHD: 1, "4K": 2, "8K": 3 };

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// Ajuste por posición de precio DENTRO del pool visible (mismo tier de
// calidad/precio, más barato = más valor). Rango acotado (±0.9) para no
// pisar el criterio principal (quality_price_score).
function priceAdjust(price: number | null, pool: ValueRankable[]): number {
  const prices = pool.map((p) => p.price_cash).filter((p): p is number => p != null);
  if (price == null || prices.length < 2) return 0;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (max === min) return 0;
  const percentile = (price - min) / (max - min); // 0 = más barato, 1 = más caro
  return (0.5 - percentile) * 1.8;
}

export function computeValue(product: ValueRankable, pool: ValueRankable[]): number {
  const base = product.quality_price_score ? QUALITY_BASE[product.quality_price_score] : 5.5;
  const value = base + priceAdjust(product.price_cash, pool);
  return Math.round(clamp(value, 0.5, 10) * 10) / 10;
}

export function valueColor(v: number): string {
  if (v >= 7) return "#059669"; // emerald-600, mismo criterio que QUALITY_SCORE_STYLE
  if (v >= 5) return "#3452E1"; // gathering-primary-fixed-dim
  return "#D97706"; // amber-600
}

// Dimensión "vendible" por categoría para las insignias de spec — una sola,
// la más relevante para decidir, no todo el spec sheet.
function specHighlight(p: ValueRankable): { icon: BadgeIcon; value: number; label: (v: number) => string } | null {
  const s = p.specs as Partial<NotebookSpecs & PhoneSpecs & TabletSpecs & TvSpecs> | undefined;
  if (!s) return null;
  if (p.category === "phone" && typeof s.main_camera_mp === "number" && s.main_camera_mp > 0) {
    return { icon: "camera", value: s.main_camera_mp, label: (v) => `Mejor cámara — ${v}MP` };
  }
  if ((p.category === "notebook" || p.category === "desktop") && s.processor_tier) {
    return {
      icon: "processor",
      value: TIER_RANK[s.processor_tier],
      label: () => "El procesador más potente del grupo",
    };
  }
  if (p.category === "tablet" && typeof s.ram_gb === "number" && s.ram_gb > 0) {
    return { icon: "ram", value: s.ram_gb, label: (v) => `Más memoria — ${v}GB RAM` };
  }
  if (p.category === "tv" && s.resolution) {
    return { icon: "screen", value: RESOLUTION_RANK[s.resolution], label: () => `Mejor resolución — ${s.resolution}` };
  }
  return null;
}

function storageOf(p: ValueRankable): number | null {
  const s = p.specs as Partial<NotebookSpecs & PhoneSpecs & TabletSpecs> | undefined;
  return typeof s?.storage_gb === "number" && s.storage_gb > 0 ? s.storage_gb : null;
}

// Calcula valor + insignias para TODO el pool a la vez — las insignias son
// inherentemente comparativas (necesitan ver a los demás), por eso no se
// puede resolver producto por producto de forma aislada.
export function rankWithValue<T extends ValueRankable>(
  products: T[]
): Map<string, ValueResult> {
  const result = new Map<string, ValueResult>();
  if (products.length === 0) return result;

  // Insignias solo tienen sentido comparando dentro de la MISMA categoría
  // (una notebook no "gana en cámara" contra un celular).
  const byCategory = new Map<ProductCategory, T[]>();
  for (const p of products) {
    const arr = byCategory.get(p.category) ?? [];
    arr.push(p);
    byCategory.set(p.category, arr);
  }

  const values = new Map(products.map((p) => [p.id, computeValue(p, products)] as const));
  const bestValueOverall = Math.max(...Array.from(values.values()));

  for (const group of Array.from(byCategory.values())) {
    if (group.length < 2) {
      // Un solo producto de esa categoría: nada contra qué comparar.
      for (const p of group) {
        result.set(p.id, { value: values.get(p.id)!, badges: [], note: null });
      }
      continue;
    }

    const highlights = group.map((p) => ({ id: p.id, h: specHighlight(p) }));
    const maxHighlight = Math.max(...highlights.filter((x) => x.h).map((x) => x.h!.value));
    const highlightVaries = new Set(highlights.filter((x) => x.h).map((x) => x.h!.value)).size > 1;

    const prices = group.map((p) => p.price_cash).filter((p): p is number => p != null);
    const minPrice = prices.length > 1 ? Math.min(...prices) : null;
    const priceVaries = prices.length > 1 && new Set(prices).size > 1;

    const storages = group.map(storageOf).filter((s): s is number => s != null);
    const maxStorage = storages.length > 1 ? Math.max(...storages) : null;
    const storageVaries = storages.length > 1 && new Set(storages).size > 1;

    // Producto "líder" del grupo (mejor highlight) — para la nota comparativa.
    const leader = highlightVaries
      ? highlights.reduce((best, cur) => ((cur.h?.value ?? -1) > (best.h?.value ?? -1) ? cur : best))
      : null;
    const leaderProduct = leader ? group.find((p) => p.id === leader.id) ?? null : null;

    for (const p of group) {
      const badges: ValueBadge[] = [];
      const h = highlights.find((x) => x.id === p.id)?.h ?? null;

      if (h && highlightVaries && h.value === maxHighlight) {
        badges.push({ icon: h.icon, text: h.label(h.value) });
      }
      if (
        storageVaries &&
        maxStorage != null &&
        storageOf(p) === maxStorage &&
        !badges.some((b) => b.icon === "storage")
      ) {
        badges.push({ icon: "storage", text: `Más almacenamiento — ${maxStorage}GB` });
      }
      if (priceVaries && minPrice != null && p.price_cash === minPrice) {
        badges.push({ icon: "tag", text: "El más barato del grupo" });
      }
      if (values.get(p.id) === bestValueOverall) {
        badges.push({ icon: "star", text: "Mejor relación precio-calidad" });
      }

      // Nota: mismo precio (±3%) que el líder de la categoría en la
      // dimensión destacada, pero se queda notablemente corto en ella —
      // ayuda a entender POR QUÉ algo conocido rankea más abajo.
      let note: string | null = null;
      if (
        leaderProduct &&
        leaderProduct.id !== p.id &&
        h &&
        leaderProduct.price_cash != null &&
        p.price_cash != null &&
        Math.abs(p.price_cash - leaderProduct.price_cash) / leaderProduct.price_cash < 0.03 &&
        h.value < maxHighlight * 0.75
      ) {
        note = "Precio muy similar a la opción líder, pero se queda corto en lo que más importa para esta búsqueda.";
      }

      result.set(p.id, { value: values.get(p.id)!, badges: badges.slice(0, 2), note });
    }
  }

  return result;
}
