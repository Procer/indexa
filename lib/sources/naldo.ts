/**
 * Naldo (Naldo Lombardi) — VTEX REST API pública.
 * Endpoint: https://www.naldo.com.ar/api/catalog_system/pub/products/search
 *
 * Nombres de campo verificados con curl real contra notebook/tablet/TV. Para
 * celulares no se pudo confirmar un producto real al momento de escribir esto
 * (usa los mismos nombres que notebook por analogía) — ajustar si difieren.
 */

import { fetchVtexCategory } from "@/lib/sources/vtex";
import type { VtexProduct, VtexSourceConfig } from "@/lib/sources/vtex";
import type { ProductCategory } from "@/types";

const API_BASE = "https://www.naldo.com.ar/api/catalog_system/pub/products/search";

// ─── Field maps ───────────────────────────────────────────────────────────────

const NOTEBOOK_FIELDS: Record<string, string> = {
  "Modelo del Procesador":    "PROCESSOR_MODEL",
  "Marca del Procesador":     "PROCESSOR_BRAND",
  "Memoria RAM":              "RAM",
  "Tamaño de pantalla":       "DISPLAY_SIZE",
  "Procesador grafico":       "GPU_MODEL",
  "Peso":                     "WEIGHT",
  "Capacidad de batería":     "BATTERY_CAPACITY",
};

const DESKTOP_FIELDS: Record<string, string> = {
  "Modelo del Procesador":    "PROCESSOR_MODEL",
  "Marca del Procesador":     "PROCESSOR_BRAND",
  "Memoria RAM":              "RAM",
  "Procesador grafico":       "GPU_MODEL",
};

const PHONE_FIELDS: Record<string, string> = {
  "Modelo del procesador":              "PROCESSOR_MODEL",
  "Memoria RAM":                        "RAM",
  "Memoria Interna":                    "INTERNAL_MEMORY",
  "Tamaño de Pantalla":                 "DISPLAY_SIZE",
  "Tecnología de pantalla":             "DISPLAY_TYPE",
  "Capacidad de batería":               "BATTERY_CAPACITY",
  "Resolución cámara trasera":          "MAIN_CAMERA",
};

const TABLET_FIELDS: Record<string, string> = {
  "Modelo del Procesador":    "PROCESSOR_MODEL",
  "Memoria RAM":               "RAM",
  "Memoria":                    "INTERNAL_MEMORY",
  "Tamaño de pantalla":        "DISPLAY_SIZE",
  "Capacidad de batería":      "BATTERY_CAPACITY",
};

const TV_FIELDS: Record<string, string> = {
  "Pulgadas":       "DISPLAY_SIZE",
  "Resolución":     "DISPLAY_RESOLUTION",
  "Tecnología":     "DISPLAY_TYPE",
  "Smart Tv":       "SMART_TV",
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
  source: "naldo",
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

export async function fetchNaldoNotebooks(max: number, llmStats: { calls: number }) {
  console.log("  Buscando notebooks en Naldo...");
  return fetchCategory("notebook", max, llmStats);
}

export async function fetchNaldoDesktops(max: number, llmStats: { calls: number }) {
  console.log("  Buscando PCs en Naldo...");
  return fetchCategory("desktop", max, llmStats);
}

export async function fetchNaldoPhones(max: number, llmStats: { calls: number }) {
  console.log("  Buscando celulares en Naldo...");
  return fetchCategory("phone", max, llmStats);
}

export async function fetchNaldoTablets(max: number, llmStats: { calls: number }) {
  console.log("  Buscando tablets en Naldo...");
  return fetchCategory("tablet", max, llmStats);
}

export async function fetchNaldoTVs(max: number, llmStats: { calls: number }) {
  console.log("  Buscando Smart TVs en Naldo...");
  return fetchCategory("tv", max, llmStats);
}
