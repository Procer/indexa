/**
 * On City — VTEX REST API pública.
 * Endpoint: https://www.oncity.com/api/catalog_system/pub/products/search
 *
 * Es un marketplace (multi-seller, como Carrefour) con secciones de tecnología
 * reales pero también de otros rubros (juguetes, autos). Las queries genéricas
 * "celular" y "tablet" traen casi puro ruido (soportes de auto, teléfono de
 * juguete Fisher Price) porque el catálogo de esos rubros es mucho más grande
 * que el de tecnología — se usan queries más específicas ("celular samsung",
 * "smartphone android", "tablet android") para esquivarlo.
 */

import { fetchVtexCategory } from "@/lib/sources/vtex";
import type { VtexProduct, VtexSourceConfig } from "@/lib/sources/vtex";
import type { ProductCategory } from "@/types";

const API_BASE = "https://www.oncity.com/api/catalog_system/pub/products/search";

// ─── Field maps ───────────────────────────────────────────────────────────────

const NOTEBOOK_FIELDS: Record<string, string> = {
  "Modelo del procesador":  "PROCESSOR_MODEL",
  "RAM":                    "RAM",
  "Capacidad del disco":    "STORAGE_SSD",
  "Pulgadas":                "DISPLAY_SIZE",
  "Peso":                    "WEIGHT",
};

const DESKTOP_FIELDS: Record<string, string> = {
  "Modelo del procesador":  "PROCESSOR_MODEL",
  "RAM":                    "RAM",
  "Capacidad del disco":    "STORAGE_SSD",
};

const PHONE_FIELDS: Record<string, string> = {
  "RAM":                             "RAM",
  "Memoria interna (ROM)":          "INTERNAL_MEMORY",
  "Tamaño de Pantalla":             "DISPLAY_SIZE",
  "Tipo de pantalla":               "DISPLAY_TYPE",
  "Capacidad de la batería":        "BATTERY_CAPACITY",
  "Cámara trasera principal (mpx)": "MAIN_CAMERA",
  "Cámara frontal principal (mpx)": "FRONT_CAMERA",
};

const TABLET_FIELDS: Record<string, string> = {
  "RAM":                     "RAM",
  "Memoria interna (ROM)":  "INTERNAL_MEMORY",
  "Pulgadas":                 "DISPLAY_SIZE",
};

const TV_FIELDS: Record<string, string> = {
  "Pulgadas": "DISPLAY_SIZE",
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
  source: "oncity",
  buildProductUrl: (product: VtexProduct) => product.link,
  fieldMap: fieldMapFor,
};

// ─── Search queries ───────────────────────────────────────────────────────────
// "celular" y "tablet" a secas traen ruido (ver comentario arriba).

const QUERIES: Record<ProductCategory, string[]> = {
  notebook: ["notebook", "laptop"],
  desktop:  ["pc escritorio", "computadora de escritorio"],
  phone:    ["smartphone android", "celular samsung", "celular xiaomi", "celular motorola"],
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

export async function fetchOnCityNotebooks(max: number, llmStats: { calls: number }) {
  console.log("  Buscando notebooks en On City...");
  return fetchCategory("notebook", max, llmStats);
}

export async function fetchOnCityDesktops(max: number, llmStats: { calls: number }) {
  console.log("  Buscando PCs en On City...");
  return fetchCategory("desktop", max, llmStats);
}

export async function fetchOnCityPhones(max: number, llmStats: { calls: number }) {
  console.log("  Buscando celulares en On City...");
  return fetchCategory("phone", max, llmStats);
}

export async function fetchOnCityTablets(max: number, llmStats: { calls: number }) {
  console.log("  Buscando tablets en On City...");
  return fetchCategory("tablet", max, llmStats);
}

export async function fetchOnCityTVs(max: number, llmStats: { calls: number }) {
  console.log("  Buscando Smart TVs en On City...");
  return fetchCategory("tv", max, llmStats);
}
