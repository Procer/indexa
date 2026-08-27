/**
 * Carrefour Argentina — VTEX REST API pública.
 * Endpoint: https://www.carrefour.com.ar/api/catalog_system/pub/products/search
 *
 * Es un marketplace: la mayoría de los listados de tecnología los venden
 * sellers externos ("Tiendas Oficiales" — Bidcom, TecnoB, Newsan, etc.), no
 * Carrefour directo. Los campos estructurados de specs son escasos y
 * genéricos (EAN, impuestos, cantidad máxima) — casi no hay atributos de
 * specs reales, así que la normalización depende mucho más del título del
 * producto (que suele venir bien detallado) vía el fallback LLM.
 */

import { fetchVtexCategory } from "@/lib/sources/vtex";
import type { VtexProduct, VtexSourceConfig } from "@/lib/sources/vtex";
import type { ProductCategory } from "@/types";

const API_BASE = "https://www.carrefour.com.ar/api/catalog_system/pub/products/search";

// ─── Field maps ───────────────────────────────────────────────────────────────
// Casi sin atributos estructurados de specs reales — el título hace la
// mayor parte del trabajo vía el normalizador LLM.

const NOTEBOOK_FIELDS: Record<string, string> = {
  "Almacenamiento": "STORAGE_SSD",
};

const DESKTOP_FIELDS: Record<string, string> = {
  "Almacenamiento": "STORAGE_SSD",
};

const PHONE_FIELDS: Record<string, string> = {
  "Almacenamiento": "INTERNAL_MEMORY",
};

const TABLET_FIELDS: Record<string, string> = {
  "Almacenamiento": "INTERNAL_MEMORY",
};

const TV_FIELDS: Record<string, string> = {
  "Pulgadas":          "DISPLAY_SIZE",
  "Sistema operativo": "DISPLAY_TYPE",
};

function fieldMapFor(category: ProductCategory): Record<string, string> {
  switch (category) {
    case "notebook": return NOTEBOOK_FIELDS;
    case "desktop":  return DESKTOP_FIELDS;
    case "phone":    return PHONE_FIELDS;
    case "tablet":   return TABLET_FIELDS;
    case "tv":       return TV_FIELDS;
    default:         return NOTEBOOK_FIELDS;
  }
}

// ─── Source config ────────────────────────────────────────────────────────────

const CONFIG: VtexSourceConfig = {
  source: "carrefour",
  buildProductUrl: (product: VtexProduct) => product.link,
  fieldMap: fieldMapFor,
};

// ─── Search queries ───────────────────────────────────────────────────────────

const QUERIES: Record<ProductCategory, string[]> = {
  notebook: ["notebook", "laptop"],
  desktop:  ["pc escritorio", "computadora de escritorio"],
  phone:    ["celular", "smartphone"],
  tablet:   ["tablet"],
  tv:       ["smart tv", "television"],
};

// ─── Public API ───────────────────────────────────────────────────────────────

async function fetchCategory<T>(
  category: ProductCategory,
  max: number,
  llmStats: { calls: number }
): Promise<T[]> {
  const seen = new Set<string>();
  const all: T[] = [];

  for (const query of QUERIES[category]) {
    if (all.length >= max) break;
    const batch = await fetchVtexCategory<T>(
      API_BASE, query, max - all.length, CONFIG, category, llmStats
    );
    for (const item of batch) {
      const id = (item as { external_id: string }).external_id;
      if (!seen.has(id)) { seen.add(id); all.push(item); }
    }
  }

  return all;
}

export async function fetchCarrefourNotebooks(max: number, llmStats: { calls: number }) {
  console.log("  Buscando notebooks en Carrefour...");
  return fetchCategory("notebook", max, llmStats);
}

export async function fetchCarrefourDesktops(max: number, llmStats: { calls: number }) {
  console.log("  Buscando PCs en Carrefour...");
  return fetchCategory("desktop", max, llmStats);
}

export async function fetchCarrefourPhones(max: number, llmStats: { calls: number }) {
  console.log("  Buscando celulares en Carrefour...");
  return fetchCategory("phone", max, llmStats);
}

export async function fetchCarrefourTablets(max: number, llmStats: { calls: number }) {
  console.log("  Buscando tablets en Carrefour...");
  return fetchCategory("tablet", max, llmStats);
}

export async function fetchCarrefourTVs(max: number, llmStats: { calls: number }) {
  console.log("  Buscando Smart TVs en Carrefour...");
  return fetchCategory("tv", max, llmStats);
}
