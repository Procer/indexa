/**
 * Vea (Cencosud) — VTEX REST API pública.
 * Endpoint: https://www.vea.com.ar/api/catalog_system/pub/products/search
 *
 * Mismo catálogo/backend que Disco y Jumbo (Cencosud) — confirmado con curl
 * real: el mismo productId aparece en las tres. Se mantiene como fuente
 * separada (no se deduplica con Disco/Jumbo acá) porque cada storefront
 * puede tener precio/disponibilidad propios — el pipeline de búsqueda ya
 * agrupa variantes idénticas entre tiendas como "también en X" (ver
 * buildDedupeKey en lib/search/pipeline.ts), así que tener las tres fuentes
 * solo suma esa comparación de precio, no duplica ruido en los resultados.
 * Mismos nombres de campo que Disco (mismo backend) — ver ese archivo para
 * las notas de verificación.
 */

import { fetchVtexCategory } from "@/lib/sources/vtex";
import type { VtexProduct, VtexSourceConfig } from "@/lib/sources/vtex";
import type { ProductCategory } from "@/types";

const API_BASE = "https://www.vea.com.ar/api/catalog_system/pub/products/search";

// ─── Field maps (idénticos a Disco, mismo backend VTEX) ────────────────────────

const NOTEBOOK_FIELDS: Record<string, string> = {
  "Procesador":               "PROCESSOR_MODEL",
  "Generación Procesador":    "PROCESSOR_LINE",
  "Memoria RAM":              "RAM",
  "Memoria ROM":              "STORAGE_SSD",
  "Modelo Tarjeta de Video":  "GPU_MODEL",
  "Pulgadas":                 "DISPLAY_SIZE",
  "Peso":                     "WEIGHT",
};

const DESKTOP_FIELDS: Record<string, string> = {
  "Procesador":               "PROCESSOR_MODEL",
  "Generación Procesador":    "PROCESSOR_LINE",
  "Memoria RAM":              "RAM",
  "Memoria ROM":              "STORAGE_SSD",
  "Modelo Tarjeta de Video":  "GPU_MODEL",
};

const PHONE_FIELDS: Record<string, string> = {
  "Memoria RAM":       "RAM",
  "Memoria ROM":       "INTERNAL_MEMORY",
  "Batería":           "BATTERY_CAPACITY",
  "Cámara Trasera":    "MAIN_CAMERA",
  "Cámara Frontal":    "FRONT_CAMERA",
};

const TABLET_FIELDS: Record<string, string> = {
  "Memoria RAM":  "RAM",
  "Memoria ROM":  "INTERNAL_MEMORY",
  "Pulgadas":     "DISPLAY_SIZE",
  "Batería":      "BATTERY_CAPACITY",
};

const TV_FIELDS: Record<string, string> = {
  "Pulgadas":    "DISPLAY_SIZE",
  "Resolución":  "DISPLAY_RESOLUTION",
  "Definición":  "DISPLAY_TYPE",
  "Smart TV":    "SMART_TV",
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
  source: "vea",
  buildProductUrl: (product: VtexProduct) => product.link,
  fieldMap: fieldMapFor,
};

// ─── Search queries ───────────────────────────────────────────────────────────

const QUERIES: Record<ProductCategory, string[]> = {
  notebook: ["notebook", "laptop"],
  desktop:  ["pc escritorio", "computadora de escritorio"],
  phone:    ["celular", "smartphone"],
  tablet:   ["tablet android"],
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

export async function fetchVeaNotebooks(max: number, llmStats: { calls: number }) {
  console.log("  Buscando notebooks en Vea...");
  return fetchCategory("notebook", max, llmStats);
}

export async function fetchVeaDesktops(max: number, llmStats: { calls: number }) {
  console.log("  Buscando PCs en Vea...");
  return fetchCategory("desktop", max, llmStats);
}

export async function fetchVeaPhones(max: number, llmStats: { calls: number }) {
  console.log("  Buscando celulares en Vea...");
  return fetchCategory("phone", max, llmStats);
}

export async function fetchVeaTablets(max: number, llmStats: { calls: number }) {
  console.log("  Buscando tablets en Vea...");
  return fetchCategory("tablet", max, llmStats);
}

export async function fetchVeaTVs(max: number, llmStats: { calls: number }) {
  console.log("  Buscando Smart TVs en Vea...");
  return fetchCategory("tv", max, llmStats);
}
