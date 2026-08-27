/**
 * Musimundo — VTEX backend pública (no requiere auth).
 * API base: https://musimundo.vtexcommercestable.com.br/api/catalog_system/pub/products/search
 * Las URLs de producto se sirven desde www.musimundo.com (no el backend VTEX).
 */

import { fetchVtexCategory } from "@/lib/sources/vtex";
import type { VtexProduct, VtexSourceConfig } from "@/lib/sources/vtex";
import type { ProductCategory } from "@/types";

const API_BASE =
  "https://musimundo.vtexcommercestable.com.br/api/catalog_system/pub/products/search";

// ─── Field maps ───────────────────────────────────────────────────────────────
// Musimundo usa nombres en MAYÚSCULAS con tildes

const NOTEBOOK_FIELDS: Record<string, string> = {
  "PROCESADOR": "PROCESSOR_MODEL",
  "MEMORIA RAM": "RAM",
  "CAPACIDAD DE DISCO": "STORAGE_SSD",
  "TAMAñO DE PANTALLA": "DISPLAY_SIZE",
  "TIPO DE PANTALLA": "DISPLAY_TYPE",
  "PLACA DE VIDEO": "GPU_MODEL",
  "BATERIA": "BATTERY_CAPACITY",
  "PESO": "WEIGHT",
  "BLUETOOTH": "BLUETOOTH",
  "TECLADO NUMERICO": "NUMERIC_KEYBOARD",
};

const DESKTOP_FIELDS: Record<string, string> = {
  "PROCESADOR": "PROCESSOR_MODEL",
  "MEMORIA RAM": "RAM",
  "CAPACIDAD DE DISCO": "STORAGE_SSD",
  "PLACA DE VIDEO": "GPU_MODEL",
  "BLUETOOTH": "BLUETOOTH",
};

const PHONE_FIELDS: Record<string, string> = {
  "PROCESADOR": "PROCESSOR_MODEL",
  "MEMORIA RAM": "RAM",
  "CAPACIDAD DE DISCO": "INTERNAL_MEMORY",
  "TAMAñO DE PANTALLA": "DISPLAY_SIZE",
  "BATERIA": "BATTERY_CAPACITY",
  "CAMARA PRINCIPAL": "MAIN_CAMERA",
  "BLUETOOTH": "BLUETOOTH",
};

const TABLET_FIELDS: Record<string, string> = {
  "PROCESADOR": "PROCESSOR_MODEL",
  "MEMORIA RAM": "RAM",
  "CAPACIDAD DE DISCO": "INTERNAL_MEMORY",
  "TAMAñO DE PANTALLA": "DISPLAY_SIZE",
  "BATERIA": "BATTERY_CAPACITY",
  "BLUETOOTH": "BLUETOOTH",
};

const TV_FIELDS: Record<string, string> = {
  "TAMAñO DE PANTALLA": "DISPLAY_SIZE",
  "TIPO DE PANTALLA": "DISPLAY_TYPE",
  "RESOLUCION": "DISPLAY_RESOLUTION",
  "BLUETOOTH": "BLUETOOTH",
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
  source: "musimundo",
  // Backend link is musimundo.vtexcommercestable.com.br — replace with real domain
  buildProductUrl: (product: VtexProduct) => {
    const slug = product.linkText;
    return `https://www.musimundo.com/${slug}/p`;
  },
  fieldMap: fieldMapFor,
};

// ─── Category search queries ──────────────────────────────────────────────────

const QUERIES: Record<ProductCategory, string[]> = {
  notebook: ["notebook"],
  desktop:  ["pc escritorio", "computadora"],
  phone:    ["celular", "smartphone"],
  tablet:   ["tablet"],
  tv:       ["smart tv", "television"],
};

const EXTRA_HEADERS = {
  Referer: "https://www.musimundo.com/",
};

// ─── Public API ───────────────────────────────────────────────────────────────

async function fetchCategory<T>(
  category: ProductCategory,
  max: number,
  llmStats: { calls: number }
): Promise<T[]> {
  const queries = QUERIES[category];
  const seen = new Set<string>();
  const all: T[] = [];

  for (const query of queries) {
    if (all.length >= max) break;
    const batch = await fetchVtexCategory<T>(
      API_BASE, query, max - all.length, CONFIG, category, llmStats, EXTRA_HEADERS
    );
    for (const item of batch) {
      const id = (item as { external_id: string }).external_id;
      if (!seen.has(id)) { seen.add(id); all.push(item); }
    }
    if (all.length >= max) break;
  }

  return all;
}

export async function fetchMusimundoNotebooks(max: number, llmStats: { calls: number }) {
  console.log("  Buscando notebooks en Musimundo...");
  return fetchCategory("notebook", max, llmStats);
}

export async function fetchMusimundoDesktops(max: number, llmStats: { calls: number }) {
  console.log("  Buscando PCs en Musimundo...");
  return fetchCategory("desktop", max, llmStats);
}

export async function fetchMusimundoPhones(max: number, llmStats: { calls: number }) {
  console.log("  Buscando celulares en Musimundo...");
  return fetchCategory("phone", max, llmStats);
}

export async function fetchMusimundoTablets(max: number, llmStats: { calls: number }) {
  console.log("  Buscando tablets en Musimundo...");
  return fetchCategory("tablet", max, llmStats);
}

export async function fetchMusimundoTVs(max: number, llmStats: { calls: number }) {
  console.log("  Buscando Smart TVs en Musimundo...");
  return fetchCategory("tv", max, llmStats);
}
