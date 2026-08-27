/**
 * Disco (Cencosud) — VTEX REST API pública.
 * Endpoint: https://www.disco.com.ar/api/catalog_system/pub/products/search
 *
 * Mismo grupo que Jumbo (Cencosud) — confirmado con curl real: el mismo
 * productId/imágenes (jumboargentina.vteximg.com.br) aparece en Disco, Vea y
 * Jumbo, así que comparten catálogo/backend VTEX aunque tengan storefronts
 * separados. Los nombres de campo SÍ están verificados con curl real contra
 * notebook/TV/celular (2026-08-18) — a diferencia de Jumbo, esta tienda usa
 * "Memoria ROM" para almacenamiento en vez de "Capacidad Disco Duro".
 * Desktop/tablet no se pudieron confirmar con un producto real al momento de
 * escribir esto (poco stock) — se adaptó por analogía con notebook/celular,
 * ajustar si difieren.
 */

import { fetchVtexCategory } from "@/lib/sources/vtex";
import type { VtexProduct, VtexSourceConfig } from "@/lib/sources/vtex";
import type { ProductCategory } from "@/types";

const API_BASE = "https://www.disco.com.ar/api/catalog_system/pub/products/search";

// ─── Field maps ───────────────────────────────────────────────────────────────

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
  source: "disco",
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

export async function fetchDiscoNotebooks(max: number, llmStats: { calls: number }) {
  console.log("  Buscando notebooks en Disco...");
  return fetchCategory("notebook", max, llmStats);
}

export async function fetchDiscoDesktops(max: number, llmStats: { calls: number }) {
  console.log("  Buscando PCs en Disco...");
  return fetchCategory("desktop", max, llmStats);
}

export async function fetchDiscoPhones(max: number, llmStats: { calls: number }) {
  console.log("  Buscando celulares en Disco...");
  return fetchCategory("phone", max, llmStats);
}

export async function fetchDiscoTablets(max: number, llmStats: { calls: number }) {
  console.log("  Buscando tablets en Disco...");
  return fetchCategory("tablet", max, llmStats);
}

export async function fetchDiscoTVs(max: number, llmStats: { calls: number }) {
  console.log("  Buscando Smart TVs en Disco...");
  return fetchCategory("tv", max, llmStats);
}
