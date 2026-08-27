import { SOURCE_NAMES } from "@/lib/domain/productDisplay";
import type { EnrichedProduct, ProductCategory } from "@/types";

// Filtros tradicionales (marca, procesador, memoria, etc.) para el modal de
// "todos los resultados" — a diferencia de los RefinementTags (acciones que
// re-disparan una búsqueda vía LLM), esto es un filtro puramente client-side
// sobre los productos ya cargados, así que no hay round-trip al servidor.

export interface FilterFacet {
  key: string;
  label: string;
  getValue: (product: EnrichedProduct) => string | null;
}

function specsOf(product: EnrichedProduct): Record<string, unknown> {
  return product.specs as Record<string, unknown>;
}

function brandFacet(product: EnrichedProduct): string | null {
  return product.brand;
}

function storeFacet(product: EnrichedProduct): string | null {
  return SOURCE_NAMES[product.source] ?? product.source;
}

function processorFacet(product: EnrichedProduct): string | null {
  const model = specsOf(product).processor_model;
  return typeof model === "string" && model.trim() ? model.trim() : null;
}

function ramFacet(product: EnrichedProduct): string | null {
  const gb = specsOf(product).ram_gb;
  return typeof gb === "number" ? `${gb} GB` : null;
}

function storageFacet(product: EnrichedProduct): string | null {
  const s = specsOf(product);
  const gb = s.storage_gb;
  if (typeof gb !== "number") return null;
  const type =
    s.storage_type === "SSD_NVME" ? "SSD NVMe" : s.storage_type === "HDD" ? "HDD" : s.storage_type === "SSD_SATA" ? "SSD" : "";
  return type ? `${gb} GB ${type}` : `${gb} GB`;
}

function screenFacet(product: EnrichedProduct): string | null {
  const inches = specsOf(product).screen_inches;
  return typeof inches === "number" ? `${inches}"` : null;
}

// Notebook, desktop, tablet y phone comparten los mismos nombres de campo
// (processor_model, ram_gb, storage_gb, screen_inches) — un solo set de
// facets alcanza para los cuatro.
const DEVICE_FACETS: FilterFacet[] = [
  { key: "brand", label: "Marca", getValue: brandFacet },
  { key: "store", label: "Tienda", getValue: storeFacet },
  { key: "processor", label: "Procesador", getValue: processorFacet },
  { key: "ram", label: "Memoria", getValue: ramFacet },
  { key: "storage", label: "Almacenamiento", getValue: storageFacet },
  { key: "screen", label: "Pantalla", getValue: screenFacet },
];

// TV no tiene procesador/memoria/disco — sus campos relevantes son otros.
const TV_FACETS: FilterFacet[] = [
  { key: "brand", label: "Marca", getValue: brandFacet },
  { key: "store", label: "Tienda", getValue: storeFacet },
  {
    key: "panel",
    label: "Tipo de panel",
    getValue: (p) => {
      const v = specsOf(p).panel_type;
      return typeof v === "string" ? v : null;
    },
  },
  {
    key: "resolution",
    label: "Resolución",
    getValue: (p) => {
      const v = specsOf(p).resolution;
      return typeof v === "string" ? v : null;
    },
  },
  { key: "screen", label: "Pantalla", getValue: screenFacet },
];

export function getFilterFacets(category: ProductCategory | null): FilterFacet[] {
  return category === "tv" ? TV_FACETS : DEVICE_FACETS;
}

export interface FacetOption {
  value: string;
  count: number;
}

// "SAMSUNG" vs "Samsung": la marca (y a veces el modelo de procesador) viene
// tal cual la escribió cada tienda, sin normalizar — todo mayúsculas es la
// inconsistencia más común. Se prefiere la variante que NO grita para mostrar.
function isShouty(s: string): boolean {
  return s === s.toUpperCase() && s !== s.toLowerCase();
}

// Opciones disponibles por facet, calculadas sobre los productos cargados.
// Facetado cruzado: las opciones (y sus conteos) de cada facet se calculan
// sobre los productos que ya pasan el resto de los filtros activos (todos
// menos el propio facet) — así, al elegir una Marca, el resto de los
// desplegables (Procesador, Memoria, etc.) se recalculan para mostrar solo
// lo que existe dentro de esa marca, en vez de seguir listando opciones que
// no van a devolver resultados combinadas. `selected` es opcional para no
// romper a quien llame a esto sin filtros activos (ej. conteo inicial).
// Agrupa sin distinguir mayúsculas/minúsculas (bug reportado: "Samsung" y
// "SAMSUNG" aparecían como dos opciones separadas del mismo filtro).
export function buildFacetOptions(
  products: EnrichedProduct[],
  facets: FilterFacet[],
  selected: Record<string, Set<string>> = {}
): Record<string, FacetOption[]> {
  const result: Record<string, FacetOption[]> = {};
  for (const facet of facets) {
    const otherFacets = facets.filter((f) => f.key !== facet.key);
    const relevantProducts = applyFacetFilters(products, otherFacets, selected);

    const groups = new Map<string, { display: string; count: number }>();
    for (const product of relevantProducts) {
      const raw = facet.getValue(product)?.trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        if (isShouty(existing.display) && !isShouty(raw)) existing.display = raw;
      } else {
        groups.set(key, { display: raw, count: 1 });
      }
    }
    result[facet.key] = Array.from(groups.values())
      .map(({ display, count }) => ({ value: display, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  return result;
}

export function applyFacetFilters(
  products: EnrichedProduct[],
  facets: FilterFacet[],
  selected: Record<string, Set<string>>
): EnrichedProduct[] {
  return products.filter((product) =>
    facets.every((facet) => {
      const values = selected[facet.key];
      if (!values || values.size === 0) return true;
      const value = facet.getValue(product)?.trim().toLowerCase();
      if (!value) return false;
      return Array.from(values).some((v) => v.trim().toLowerCase() === value);
    })
  );
}
