/**
 * Pardo Hogar — VTEX REST API pública.
 * Endpoint: https://www.pardo.com.ar/api/catalog_system/pub/products/search/{path}
 *
 * IMPORTANTE: el dominio público "pardohogar.com.ar" redirige a
 * "www.pardo.com.ar" (mismo grupo, es la marca real en VTEX) — usar SIEMPRE
 * este último para la API, el primero solo sirve como alias de marketing.
 *
 * A diferencia del resto de las fuentes VTEX de este proyecto, acá se
 * consulta por PATH de categoría (`/search/informatica/notebooks`) en vez de
 * por `ft=palabra clave`. Verificado con curl real: `ft=notebook` en este
 * catálogo devuelve casi nada relevante (el ranking de relevancia de Pardo
 * para ese término prioriza mochilas/accesorios de otras categorías), pero
 * el path de categoría trae los productos reales sin ese ruido. `informatica/
 * computadoras` y `informatica/all-in-one` (candidatos a "desktop") están
 * vacíos al momento de escribir esto — se dejan igual en el código por si
 * la tienda carga stock ahí en el futuro, no es necesario tocar nada.
 */

import {
  buildVtexProduct,
  isVtexNoiseTitle,
} from "@/lib/sources/vtex";
import type { VtexProduct, VtexSourceConfig } from "@/lib/sources/vtex";
import type { ProductCategory } from "@/types";

const API_BASE = "https://www.pardo.com.ar/api/catalog_system/pub/products/search";

// ─── Field maps (verificados con curl real contra notebook/tablet/celular/tv) ──

const NOTEBOOK_FIELDS: Record<string, string> = {
  "Procesador":         "PROCESSOR_MODEL",
  "RAM":                "RAM",
  "Capacidad SSD":      "STORAGE_SSD",
  "Tamaño Pantalla":    "DISPLAY_SIZE",
  "Sistema Operativo":  "OS",
};

// COMPUTADORAS/ALL IN ONE están vacías en Pardo al momento de escribir esto
// (no se pudo verificar field names con un producto real) — se reusan los
// nombres de notebook por analogía, ajustar si aparece stock con nombres
// distintos.
const DESKTOP_FIELDS: Record<string, string> = {
  "Procesador": "PROCESSOR_MODEL",
  "RAM":        "RAM",
};

const PHONE_FIELDS: Record<string, string> = {
  "TAMAÑO PANTALLA":  "DISPLAY_SIZE",
  "MEMORIA RAM":      "RAM",
  "ALMACENAMIENTO":   "INTERNAL_MEMORY",
  "CÁMARA PRINCIPAL": "MAIN_CAMERA",
  "Bateria":          "BATTERY_CAPACITY",
};

const TABLET_FIELDS: Record<string, string> = {
  "PANTALLA":        "DISPLAY_SIZE",
  "PROCESADOR":      "PROCESSOR_MODEL",
  "MEMORIA RAM":     "RAM",
  "ALMACENAMIENTO":  "INTERNAL_MEMORY",
};

const TV_FIELDS: Record<string, string> = {
  "TAMAÑO PANTALLA":     "DISPLAY_SIZE",
  "TECNOLOGÍA":          "DISPLAY_TYPE",
  "TIPO DE RESOLUCIÓN":  "DISPLAY_RESOLUTION",
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

const CONFIG: VtexSourceConfig = {
  source: "pardo",
  buildProductUrl: (product: VtexProduct) => `https://www.pardo.com.ar/${product.linkText}/p`,
  fieldMap: fieldMapFor,
};

// ─── Categoría → path real (verificado con el árbol de categorías VTEX) ────────

const CATEGORY_PATHS: Record<ProductCategory, string> = {
  notebook: "informatica/notebooks",
  desktop:  "informatica/computadoras",
  phone:    "telefonia/celulares",
  tablet:   "informatica/tablets",
  tv:       "tv-y-video/televisores/televisores-smart",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchCategory<T>(
  category: ProductCategory,
  max: number,
  llmStats: { calls: number }
): Promise<T[]> {
  const path = CATEGORY_PATHS[category];
  const PAGE_SIZE = 49;
  const products: T[] = [];
  let from = 0;

  while (products.length < max) {
    const to = Math.min(from + PAGE_SIZE - 1, from + max - products.length - 1);
    const url = `${API_BASE}/${path}?_from=${from}&_to=${to}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.warn(`  Pardo ${res.status} para "${path}"`);
      break;
    }

    const totalHeader = res.headers.get("resources");
    const totalMatch = totalHeader?.match(/\/(\d+)/);
    const total = totalMatch ? parseInt(totalMatch[1]) : Infinity;

    const data = (await res.json()) as VtexProduct[];
    if (!data.length) break;

    for (const product of data) {
      if (products.length >= max) break;
      if (!product.items?.length) continue;
      if (isVtexNoiseTitle(product.productName, category)) continue;
      try {
        const built = await buildVtexProduct(product, category, CONFIG, llmStats);
        products.push(built as T);
      } catch (err) {
        console.error(`  Error procesando ${product.productId}:`, err);
      }
    }

    from += PAGE_SIZE;
    if (from > total) break;
    await sleep(300);
  }

  return products;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchPardoNotebooks(max: number, llmStats: { calls: number }) {
  console.log("  Buscando notebooks en Pardo Hogar...");
  return fetchCategory("notebook", max, llmStats);
}

export async function fetchPardoDesktops(max: number, llmStats: { calls: number }) {
  console.log("  Buscando PCs en Pardo Hogar...");
  return fetchCategory("desktop", max, llmStats);
}

export async function fetchPardoPhones(max: number, llmStats: { calls: number }) {
  console.log("  Buscando celulares en Pardo Hogar...");
  return fetchCategory("phone", max, llmStats);
}

export async function fetchPardoTablets(max: number, llmStats: { calls: number }) {
  console.log("  Buscando tablets en Pardo Hogar...");
  return fetchCategory("tablet", max, llmStats);
}

export async function fetchPardoTVs(max: number, llmStats: { calls: number }) {
  console.log("  Buscando Smart TVs en Pardo Hogar...");
  return fetchCategory("tv", max, llmStats);
}
