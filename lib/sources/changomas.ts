/**
 * Changomas / Hiper Changomas — VTEX REST API pública.
 * El dominio público (www.changomas.com.ar) redirige a www.masonline.com.ar,
 * que es donde vive el catálogo real (mismo grupo — DIA/Ma's Online). Los
 * links de producto y las imágenes (masonlineprod.vteximg.com.br) también
 * apuntan ahí, así que se usa masonline.com.ar como API_BASE real aunque la
 * fuente se llame "changomas" (nombre que el usuario reconoce).
 * Endpoint: https://www.masonline.com.ar/api/catalog_system/pub/products/search
 *
 * OJO — a diferencia de Disco/Jumbo, esta tienda tiene poca profundidad de
 * specs estructuradas: un producto real de prueba ("Notebook Hp I7 1255u")
 * no tenía casi ningún campo poblado más allá de datos de impuestos, con el
 * modelo de procesador solo mencionado en el título. Los field maps de abajo
 * son la mejor suposición por analogía con Disco/Jumbo (mismo tipo de
 * catálogo Cencosud/DIA), NO verificados con curl real — el normalizador cae
 * a extracción por LLM desde el título cuando los campos estructurados faltan
 * (ya soportado, no requiere cambios), así que igual funciona, solo con más
 * costo de LLM por producto. Ajustar los nombres si se confirma lo contrario.
 */

import { fetchVtexCategory } from "@/lib/sources/vtex";
import type { VtexProduct, VtexSourceConfig } from "@/lib/sources/vtex";
import type { ProductCategory } from "@/types";

const API_BASE = "https://www.masonline.com.ar/api/catalog_system/pub/products/search";

// ─── Field maps (sin verificar con curl real, ver nota arriba) ─────────────────

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
  source: "changomas",
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

export async function fetchChangomasNotebooks(max: number, llmStats: { calls: number }) {
  console.log("  Buscando notebooks en Changomas...");
  return fetchCategory("notebook", max, llmStats);
}

export async function fetchChangomasDesktops(max: number, llmStats: { calls: number }) {
  console.log("  Buscando PCs en Changomas...");
  return fetchCategory("desktop", max, llmStats);
}

export async function fetchChangomasPhones(max: number, llmStats: { calls: number }) {
  console.log("  Buscando celulares en Changomas...");
  return fetchCategory("phone", max, llmStats);
}

export async function fetchChangomasTablets(max: number, llmStats: { calls: number }) {
  console.log("  Buscando tablets en Changomas...");
  return fetchCategory("tablet", max, llmStats);
}

export async function fetchChangomasTVs(max: number, llmStats: { calls: number }) {
  console.log("  Buscando Smart TVs en Changomas...");
  return fetchCategory("tv", max, llmStats);
}
