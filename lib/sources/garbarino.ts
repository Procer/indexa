/**
 * Garbarino — VTEX REST API pública.
 * Endpoint: https://www.garbarino.com/api/catalog_system/pub/products/search
 *
 * Los nombres de campo son similares a Cetrogar. Si cambian, ajustar los field maps.
 */

import { fetchVtexCategory } from "@/lib/sources/vtex";
import type { VtexProduct, VtexSourceConfig } from "@/lib/sources/vtex";
import type { ProductCategory } from "@/types";

const API_BASE = "https://www.garbarino.com/api/catalog_system/pub/products/search";

// ─── Field maps ───────────────────────────────────────────────────────────────

const NOTEBOOK_FIELDS: Record<string, string> = {
  "Procesador":               "PROCESSOR_MODEL",
  "Marca del procesador":     "PROCESSOR_BRAND",
  "Memoria RAM":              "RAM",
  "Almacenamiento SSD":       "STORAGE_SSD",
  "Almacenamiento HDD":       "STORAGE_HDD",
  "Tamaño de pantalla":       "DISPLAY_SIZE",
  "Tamaño de la pantalla":    "DISPLAY_SIZE",
  "Tecnología de la pantalla":"DISPLAY_TYPE",
  "Placa de video":           "GPU_MODEL",
  "Peso":                     "WEIGHT",
  "Batería":                  "BATTERY_CAPACITY",
  "Teclado numérico":         "NUMERIC_KEYBOARD",
};

const DESKTOP_FIELDS: Record<string, string> = {
  "Procesador":               "PROCESSOR_MODEL",
  "Marca del procesador":     "PROCESSOR_BRAND",
  "Memoria RAM":              "RAM",
  "Almacenamiento SSD":       "STORAGE_SSD",
  "Almacenamiento HDD":       "STORAGE_HDD",
  "Placa de video":           "GPU_MODEL",
};

const PHONE_FIELDS: Record<string, string> = {
  "Procesador":               "PROCESSOR_MODEL",
  "Memoria RAM":              "RAM",
  "Almacenamiento interno":   "INTERNAL_MEMORY",
  "Tamaño de pantalla":       "DISPLAY_SIZE",
  "Tamaño de la pantalla":    "DISPLAY_SIZE",
  "Tecnología de la pantalla":"DISPLAY_TYPE",
  "Batería":                  "BATTERY_CAPACITY",
  "Cámara principal":         "MAIN_CAMERA",
};

const TABLET_FIELDS: Record<string, string> = {
  "Procesador":               "PROCESSOR_MODEL",
  "Memoria RAM":              "RAM",
  "Almacenamiento interno":   "INTERNAL_MEMORY",
  "Tamaño de pantalla":       "DISPLAY_SIZE",
  "Tamaño de la pantalla":    "DISPLAY_SIZE",
  "Batería":                  "BATTERY_CAPACITY",
};

const TV_FIELDS: Record<string, string> = {
  "Tamaño de pantalla":       "DISPLAY_SIZE",
  "Tamaño de la pantalla":    "DISPLAY_SIZE",
  "Tecnología de la pantalla":"DISPLAY_TYPE",
  "Resolución":               "DISPLAY_RESOLUTION",
  "Smart TV":                 "SMART_TV",
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
  source: "garbarino",
  buildProductUrl: (product: VtexProduct) => {
    const slug = product.linkText;
    return `https://www.garbarino.com/${slug}/p`;
  },
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

const EXTRA_HEADERS = {
  Referer: "https://www.garbarino.com/",
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
      API_BASE, query, max - all.length, CONFIG, category, llmStats, EXTRA_HEADERS
    );
    for (const item of batch) {
      const id = (item as { external_id: string }).external_id;
      if (!seen.has(id)) { seen.add(id); all.push(item); }
    }
  }

  return all;
}

export async function fetchGarbarinoNotebooks(max: number, llmStats: { calls: number }) {
  console.log("  Buscando notebooks en Garbarino...");
  return fetchCategory("notebook", max, llmStats);
}

export async function fetchGarbarinoDesktops(max: number, llmStats: { calls: number }) {
  console.log("  Buscando PCs en Garbarino...");
  return fetchCategory("desktop", max, llmStats);
}

export async function fetchGarbarinoPhones(max: number, llmStats: { calls: number }) {
  console.log("  Buscando celulares en Garbarino...");
  return fetchCategory("phone", max, llmStats);
}

export async function fetchGarbarinoTablets(max: number, llmStats: { calls: number }) {
  console.log("  Buscando tablets en Garbarino...");
  return fetchCategory("tablet", max, llmStats);
}

export async function fetchGarbarinoTVs(max: number, llmStats: { calls: number }) {
  console.log("  Buscando Smart TVs en Garbarino...");
  return fetchCategory("tv", max, llmStats);
}
