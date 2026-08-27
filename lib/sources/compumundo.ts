/**
 * Compumundo — VTEX REST API pública.
 * Endpoint: https://www.compumundo.com.ar/api/catalog_system/pub/products/search
 *
 * Compumundo es una tienda especializada en tecnología. Usa VTEX con nombres
 * de campo similares a Cetrogar y Garbarino.
 */

import { fetchVtexCategory } from "@/lib/sources/vtex";
import type { VtexProduct, VtexSourceConfig } from "@/lib/sources/vtex";
import type { ProductCategory } from "@/types";

const API_BASE =
  "https://www.compumundo.com.ar/api/catalog_system/pub/products/search";

// ─── Field maps ───────────────────────────────────────────────────────────────

const NOTEBOOK_FIELDS: Record<string, string> = {
  "Procesador":               "PROCESSOR_MODEL",
  "Marca Procesador":         "PROCESSOR_BRAND",
  "Memoria RAM":              "RAM",
  "Disco SSD":                "STORAGE_SSD",
  "Disco HDD":                "STORAGE_HDD",
  "Tamaño Pantalla":          "DISPLAY_SIZE",
  "Tipo Pantalla":            "DISPLAY_TYPE",
  "Placa de Video":           "GPU_MODEL",
  "Peso":                     "WEIGHT",
  "Batería":                  "BATTERY_CAPACITY",
  "Teclado Numérico":         "NUMERIC_KEYBOARD",
};

const DESKTOP_FIELDS: Record<string, string> = {
  "Procesador":               "PROCESSOR_MODEL",
  "Marca Procesador":         "PROCESSOR_BRAND",
  "Memoria RAM":              "RAM",
  "Disco SSD":                "STORAGE_SSD",
  "Disco HDD":                "STORAGE_HDD",
  "Placa de Video":           "GPU_MODEL",
};

const PHONE_FIELDS: Record<string, string> = {
  "Procesador":               "PROCESSOR_MODEL",
  "Memoria RAM":              "RAM",
  "Almacenamiento":           "INTERNAL_MEMORY",
  "Tamaño Pantalla":          "DISPLAY_SIZE",
  "Tipo Pantalla":            "DISPLAY_TYPE",
  "Batería":                  "BATTERY_CAPACITY",
  "Cámara Trasera":           "MAIN_CAMERA",
};

const TABLET_FIELDS: Record<string, string> = {
  "Procesador":               "PROCESSOR_MODEL",
  "Memoria RAM":              "RAM",
  "Almacenamiento":           "INTERNAL_MEMORY",
  "Tamaño Pantalla":          "DISPLAY_SIZE",
  "Batería":                  "BATTERY_CAPACITY",
};

const TV_FIELDS: Record<string, string> = {
  "Tamaño Pantalla":          "DISPLAY_SIZE",
  "Tipo Pantalla":            "DISPLAY_TYPE",
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
  source: "compumundo",
  buildProductUrl: (product: VtexProduct) => {
    const slug = product.linkText;
    return `https://www.compumundo.com.ar/${slug}/p`;
  },
  fieldMap: fieldMapFor,
};

// ─── Search queries ───────────────────────────────────────────────────────────

const QUERIES: Record<ProductCategory, string[]> = {
  notebook: ["notebook", "laptop"],
  desktop:  ["pc escritorio", "computadora escritorio"],
  phone:    ["celular", "smartphone"],
  tablet:   ["tablet"],
  tv:       ["smart tv", "television"],
};

const EXTRA_HEADERS = {
  Referer: "https://www.compumundo.com.ar/",
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

export async function fetchCompumundoNotebooks(max: number, llmStats: { calls: number }) {
  console.log("  Buscando notebooks en Compumundo...");
  return fetchCategory("notebook", max, llmStats);
}

export async function fetchCompumundoDesktops(max: number, llmStats: { calls: number }) {
  console.log("  Buscando PCs en Compumundo...");
  return fetchCategory("desktop", max, llmStats);
}

export async function fetchCompumundoPhones(max: number, llmStats: { calls: number }) {
  console.log("  Buscando celulares en Compumundo...");
  return fetchCategory("phone", max, llmStats);
}

export async function fetchCompumundoTablets(max: number, llmStats: { calls: number }) {
  console.log("  Buscando tablets en Compumundo...");
  return fetchCategory("tablet", max, llmStats);
}

export async function fetchCompumundoTVs(max: number, llmStats: { calls: number }) {
  console.log("  Buscando Smart TVs en Compumundo...");
  return fetchCategory("tv", max, llmStats);
}
