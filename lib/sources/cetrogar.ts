/**
 * Cetrogar — VTEX REST API pública.
 * Endpoint: https://www.cetrogar.com.ar/api/catalog_system/pub/products/search
 */

import { fetchVtexCategory } from "@/lib/sources/vtex";
import type { VtexProduct, VtexSourceConfig } from "@/lib/sources/vtex";
import type { ProductCategory } from "@/types";

const API_BASE = "https://www.cetrogar.com.ar/api/catalog_system/pub/products/search";

// ─── Field maps ───────────────────────────────────────────────────────────────
// Keys = Cetrogar field name; Values = specsExtractor attribute name

const NOTEBOOK_FIELDS: Record<string, string> = {
  "Procesador": "PROCESSOR_MODEL",
  "Marca del procesador": "PROCESSOR_BRAND",
  "Línea del procesador": "PROCESSOR_LINE",
  "Memoria RAM": "RAM",
  "Almacenamiento SSD": "STORAGE_SSD",
  "Almacenamiento HDD": "STORAGE_HDD",
  "Tamaño de la pantalla": "DISPLAY_SIZE",
  "Tecnología de la pantalla": "DISPLAY_TYPE",
  "Bluetooth": "BLUETOOTH",
  "Peso": "WEIGHT",
};

const DESKTOP_FIELDS: Record<string, string> = {
  "Procesador": "PROCESSOR_MODEL",
  "Marca del procesador": "PROCESSOR_BRAND",
  "Línea del procesador": "PROCESSOR_LINE",
  "Memoria RAM": "RAM",
  "Almacenamiento SSD": "STORAGE_SSD",
  "Almacenamiento HDD": "STORAGE_HDD",
  "Placa de video": "GPU_MODEL",
  "Tecnología de la pantalla": "DISPLAY_TYPE",
  "Bluetooth": "BLUETOOTH",
};

const PHONE_FIELDS: Record<string, string> = {
  "Procesador": "PROCESSOR_MODEL",
  "Memoria RAM": "RAM",
  "Almacenamiento interno": "INTERNAL_MEMORY",
  "Tamaño de la pantalla": "DISPLAY_SIZE",
  "Tecnología de la pantalla": "DISPLAY_TYPE",
  "Batería": "BATTERY_CAPACITY",
  "Cámara principal": "MAIN_CAMERA",
  "Cámara frontal": "FRONT_CAMERA",
  "Bluetooth": "BLUETOOTH",
};

const TABLET_FIELDS: Record<string, string> = {
  "Procesador": "PROCESSOR_MODEL",
  "Memoria RAM": "RAM",
  "Almacenamiento interno": "INTERNAL_MEMORY",
  "Tamaño de la pantalla": "DISPLAY_SIZE",
  "Batería": "BATTERY_CAPACITY",
  "Bluetooth": "BLUETOOTH",
};

const TV_FIELDS: Record<string, string> = {
  "Tamaño de la pantalla": "DISPLAY_SIZE",
  "Tecnología de la pantalla": "DISPLAY_TYPE",
  "Resolución": "DISPLAY_RESOLUTION",
  "Smart TV": "SMART_TV",
  "Bluetooth": "BLUETOOTH",
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
  source: "cetrogar",
  buildProductUrl: (product: VtexProduct) => product.link,
  fieldMap: fieldMapFor,
};

// ─── Category search queries ──────────────────────────────────────────────────

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
  const queries = QUERIES[category];
  const seen = new Set<string>();
  const all: T[] = [];

  for (const query of queries) {
    if (all.length >= max) break;
    const batch = await fetchVtexCategory<T>(
      API_BASE, query, max - all.length, CONFIG, category, llmStats
    );
    for (const item of batch) {
      const id = (item as { external_id: string }).external_id;
      if (!seen.has(id)) { seen.add(id); all.push(item); }
    }
    if (all.length >= max) break;
  }

  return all;
}

export async function fetchCetrogarNotebooks(max: number, llmStats: { calls: number }) {
  console.log("  Buscando notebooks en Cetrogar...");
  return fetchCategory("notebook", max, llmStats);
}

export async function fetchCetrogarDesktops(max: number, llmStats: { calls: number }) {
  console.log("  Buscando PCs en Cetrogar...");
  return fetchCategory("desktop", max, llmStats);
}

export async function fetchCetrogarPhones(max: number, llmStats: { calls: number }) {
  console.log("  Buscando celulares en Cetrogar...");
  return fetchCategory("phone", max, llmStats);
}

export async function fetchCetrogarTablets(max: number, llmStats: { calls: number }) {
  console.log("  Buscando tablets en Cetrogar...");
  return fetchCategory("tablet", max, llmStats);
}

export async function fetchCetrogarTVs(max: number, llmStats: { calls: number }) {
  console.log("  Buscando Smart TVs en Cetrogar...");
  return fetchCategory("tv", max, llmStats);
}
