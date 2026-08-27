/**
 * Jumbo Argentina (Cencosud) — VTEX REST API pública.
 * Endpoint: https://www.jumbo.com.ar/api/catalog_system/pub/products/search
 *
 * Es un supermercado con sección de electro, no una cadena de tecnología
 * dedicada — el catálogo de PC/celulares/TV es más chico que en Fravega o
 * Garbarino, pero real (confirmado con curl). Los nombres de campo son muy
 * verbosos y varían bastante entre categorías (no siguen un patrón fijo tipo
 * Cetrogar/Garbarino).
 *
 * "tablet" a secas trae ruido (insecticidas en tabletas) — se usa
 * "tablet android" como query en su lugar.
 */

import { fetchVtexCategory } from "@/lib/sources/vtex";
import type { VtexProduct, VtexSourceConfig } from "@/lib/sources/vtex";
import type { ProductCategory } from "@/types";

const API_BASE = "https://www.jumbo.com.ar/api/catalog_system/pub/products/search";

// ─── Field maps ───────────────────────────────────────────────────────────────

const NOTEBOOK_FIELDS: Record<string, string> = {
  "Procesador":               "PROCESSOR_MODEL",
  "Generación Procesador":    "PROCESSOR_LINE",
  "Memoria RAM":              "RAM",
  "Capacidad Disco Duro":     "STORAGE_SSD",
  "Modelo Tarjeta de Video":  "GPU_MODEL",
  "Pulgadas":                 "DISPLAY_SIZE",
  "Peso":                     "WEIGHT",
};

const DESKTOP_FIELDS: Record<string, string> = {
  "Procesador":               "PROCESSOR_MODEL",
  "Generación Procesador":    "PROCESSOR_LINE",
  "Memoria RAM":              "RAM",
  "Capacidad Disco Duro":     "STORAGE_SSD",
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
  source: "jumbo",
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

export async function fetchJumboNotebooks(max: number, llmStats: { calls: number }) {
  console.log("  Buscando notebooks en Jumbo...");
  return fetchCategory("notebook", max, llmStats);
}

export async function fetchJumboDesktops(max: number, llmStats: { calls: number }) {
  console.log("  Buscando PCs en Jumbo...");
  return fetchCategory("desktop", max, llmStats);
}

export async function fetchJumboPhones(max: number, llmStats: { calls: number }) {
  console.log("  Buscando celulares en Jumbo...");
  return fetchCategory("phone", max, llmStats);
}

export async function fetchJumboTablets(max: number, llmStats: { calls: number }) {
  console.log("  Buscando tablets en Jumbo...");
  return fetchCategory("tablet", max, llmStats);
}

export async function fetchJumboTVs(max: number, llmStats: { calls: number }) {
  console.log("  Buscando Smart TVs en Jumbo...");
  return fetchCategory("tv", max, llmStats);
}
