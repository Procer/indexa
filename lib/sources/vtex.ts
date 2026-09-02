/**
 * Utilidades compartidas para fuentes basadas en VTEX (Cetrogar, Musimundo).
 * El endpoint público de VTEX es REST y no requiere auth.
 */

import {
  normalizeNotebookSpecs,
  normalizeDesktopSpecs,
  normalizePhoneSpecs,
  normalizeTabletSpecs,
  normalizeTVSpecs,
} from "@/lib/normalizer/specsExtractor";
import type { ProductCategory, ProductSpecs, Upgradeable } from "@/types";

// ─── VTEX API types ───────────────────────────────────────────────────────────

interface VtexImage {
  imageUrl: string;
  imageLabel: string | null;
}

interface VtexInstallment {
  Value: number;
  InterestRate: number;
  NumberOfInstallments: number;
  PaymentSystemName: string;
  Name: string;
}

interface VtexCommertialOffer {
  Price: number;
  ListPrice: number;
  Installments: VtexInstallment[];
  AvailableQuantity: number;
}

interface VtexSeller {
  commertialOffer: VtexCommertialOffer;
}

interface VtexItem {
  itemId: string;
  images: VtexImage[];
  sellers: VtexSeller[];
}

export interface VtexProduct {
  productId: string;
  productName: string;
  brand: string;
  linkText: string;
  link: string;
  items: VtexItem[];
  // Spec fields are string arrays at the product level
  [key: string]: unknown;
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

export function vtexSpec(product: VtexProduct, ...names: string[]): string | null {
  for (const name of names) {
    const val = product[name];
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string" && val[0]) {
      return val[0] as string;
    }
  }
  return null;
}

export function vtexSpecNum(product: VtexProduct, ...names: string[]): number | null {
  const val = vtexSpec(product, ...names);
  if (!val) return null;
  const m = val.replace(",", ".").match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

function vtexBestPrice(item: VtexItem): { price: number | null; listPrice: number | null } {
  const offer = item.sellers[0]?.commertialOffer;
  if (!offer || offer.AvailableQuantity === 0) return { price: null, listPrice: null };
  return { price: offer.Price, listPrice: offer.ListPrice };
}

function vtexBestInstallment(item: VtexItem): VtexInstallment | null {
  const offer = item.sellers[0]?.commertialOffer;
  if (!offer) return null;
  const sinterest = offer.Installments.filter((i) => i.InterestRate === 0);
  const pool = sinterest.length > 0 ? sinterest : offer.Installments;
  if (!pool.length) return null;
  return pool.reduce((best, cur) =>
    cur.NumberOfInstallments > best.NumberOfInstallments ? cur : best
  );
}

function formatInstallmentInfo(inst: VtexInstallment | null): string | null {
  if (!inst) return null;
  const amount = Math.round(inst.Value).toLocaleString("es-AR");
  const si = inst.InterestRate === 0 ? " sin interés" : "";
  return `${inst.NumberOfInstallments}x $${amount}${si} ${inst.PaymentSystemName}`;
}

export function vtexImages(item: VtexItem): string[] {
  return (item.images ?? []).map((img) => img.imageUrl).filter(Boolean);
}

// ─── Attribute adapter for specsExtractor ─────────────────────────────────────

export function vtexToMLAttributes(product: VtexProduct, fieldMap: Record<string, string>) {
  return Object.entries(fieldMap).map(([vtexName, mlName]) => ({
    id: mlName,
    name: mlName,
    value_name: vtexSpec(product, vtexName),
  }));
}

// ─── Upgradeability by category ───────────────────────────────────────────────

export function upgradeableFor(category: ProductCategory): Upgradeable {
  switch (category) {
    case "notebook": return { ram: true, storage: true, processor: false, screen: false, gpu: false };
    case "desktop":  return { ram: true, storage: true, processor: true, screen: false, gpu: true };
    default:         return { ram: false, storage: false, processor: false, screen: false };
  }
}

// ─── Product builder ──────────────────────────────────────────────────────────

export interface VtexSourceConfig {
  source: string;
  buildProductUrl: (product: VtexProduct) => string;
  fieldMap: (category: ProductCategory) => Record<string, string>;
}

export async function buildVtexProduct(
  product: VtexProduct,
  category: ProductCategory,
  config: VtexSourceConfig,
  llmStats: { calls: number }
): Promise<{
  external_id: string;
  source: string;
  url: string;
  category: ProductCategory;
  brand: string | null;
  model: string | null;
  title: string;
  specs: ProductSpecs;
  upgradeable: Upgradeable;
  price_cash: number | null;
  price_installment: number | null;
  installment_count: number | null;
  installment_info: string | null;
  currency: string;
  image_url: string | null;
  images: string[];
  available: boolean;
  stock: number | null;
}> {
  const item = product.items[0];
  const { price } = item ? vtexBestPrice(item) : { price: null };
  const inst = item ? vtexBestInstallment(item) : null;
  const imgs = item ? vtexImages(item) : [];

  const attrs = vtexToMLAttributes(product, config.fieldMap(category));

  let specResult: { specs: ProductSpecs; usedLLM: boolean };
  switch (category) {
    case "notebook": specResult = await normalizeNotebookSpecs(product.productName, attrs); break;
    case "desktop":  specResult = await normalizeDesktopSpecs(product.productName, attrs); break;
    case "phone":    specResult = await normalizePhoneSpecs(product.productName, attrs); break;
    case "tablet":   specResult = await normalizeTabletSpecs(product.productName, attrs); break;
    case "tv":       specResult = await normalizeTVSpecs(product.productName, attrs); break;
    default:         specResult = await normalizeNotebookSpecs(product.productName, attrs);
  }

  if (specResult.usedLLM) llmStats.calls++;

  const available = (item?.sellers[0]?.commertialOffer?.AvailableQuantity ?? 0) > 0;

  return {
    external_id: `${config.source}-${product.productId}`,
    source: config.source as "fravega",
    url: config.buildProductUrl(product),
    category,
    brand: product.brand || null,
    model: null,
    title: product.productName,
    specs: specResult.specs,
    upgradeable: upgradeableFor(category),
    price_cash: price,
    price_installment: inst ? inst.Value : null,
    installment_count: inst ? inst.NumberOfInstallments : null,
    installment_info: formatInstallmentInfo(inst),
    currency: "ARS",
    image_url: imgs[0] ?? null,
    images: imgs,
    available,
    stock: null,
  };
}

// ─── Generic VTEX fetcher ─────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Las búsquedas VTEX por keyword ("notebook", "celular") también traen
// accesorios cuyo título los menciona (ej: "Mochila ... Porta Notebook").
// El normalizador nunca falla — les inventa specs genéricas en vez de
// descartarlos — así que hay que filtrarlos por título antes de normalizar.
const ACCESSORY_TITLE_RE = /\b(mochila|funda|bolso|bolsa para|maletin|estuche|soporte para|porta ?notebook|porta ?celular|tripode|protector de pantalla|vidrio templado|cargador|fuente|cable|auricular|parlante|mouse|teclado|hub usb|power ?bank|correa|radio reloj|radio despertador|tablet(a)? de dibujo|tableta grafica|tableta gráfica|tableta digital|tablet[ae] m[aá]gica|pizarra|morral|cuaderno|\breloj\b|smartwatch|smartband|bafle|barra de sonido|torre de sonido|home the[a]?tre|joystick|gamepad|control(es)? inal[aá]mbrico|reparaci[oó]n|repuesto(s)?|herramientas|destornillador(es)?|kit de? (limpieza|herramientas))\b/i;

// La búsqueda VTEX por "tablet"/"tableta" en supermercados (Carrefour) trae toda
// la góndola de "tableta [de chocolate]", tabletas insecticidas/limpiadoras,
// galletitas "Les Tablettes", etc. — el normalizador les inventa specs
// (os="Android 14", ram_gb=0). Se descartan por título antes de normalizar.
const GROCERY_OR_HOUSEHOLD_TITLE_RE = /\b(chocolate|chocolat[ií]n|golosina|caramelo|alfajor|oblea|turr[oó]n|bomb[oó]n|dulce de leche|galletitas?|mermelada|yerba|insecticida|mosquito|repelente|detergente|lavavajillas?|lavarropas|limpiador(as|es)?|desodorante|shampoo|jab[oó]n|corega)\b/i;

// Título que termina en un gramaje / volumen / conteo de unidades ("... 8 g.",
// "... 90 grs", "... 80 uni", "... x 6 u") — patrón de producto de almacén o
// farmacia, jamás de un equipo real (esos terminan en color, "Pulgadas", "GB",
// código de modelo o "Pen"). "128GB" NO matchea: no hay borde de palabra tras la
// "g".
const CONSUMABLE_QUANTITY_SUFFIX_RE = /\b\d+(?:[.,]\d+)?\s?(?:g|gr|grs|kg|ml|cc|uni|unidades|u)\.?\s*$/i;

// Anclado al inicio: un mueble ("Escritorio ...", "Mesa ...") a veces menciona
// "Pc"/"Computación" de pasada y cuela en la búsqueda de notebook/desktop.
// Un producto real de cómputo nunca arranca el título con estas palabras
// (sería "PC de Escritorio ...", no "Escritorio ...").
const OFF_TOPIC_TITLE_START_RE = /^(escritorio|mesa|cartera|billetera|monedero|zapatilla|remera|campera|pantal[oó]n|buzo|silla)\b/i;

// La búsqueda fulltext de VTEX (`ft=notebook`, `ft=laptop`, etc.) a veces trae
// productos de OTRA categoría por relevancia de texto (ej: un Smart TV Philco
// apareciendo en la búsqueda "notebook" en Coppel, visto en producción — sin
// este filtro queda insertado con category="notebook" y sus specs normalizadas
// con el prompt de notebook, generando un registro con datos sin sentido).
// VTEX no expone la categoría real de forma consistente entre tiendas para
// poder cruzarla, así que el título es la señal más confiable disponible.
// Nota: un 2-en-1 notebook/tablet real podría mencionar ambas palabras y
// quedar descartado por error — tradeoff aceptado, mismo criterio que ya usan
// ACCESSORY_TITLE_RE/OFF_TOPIC_TITLE_START_RE de arriba.
const CATEGORY_SIGNAL_RE: Partial<Record<ProductCategory, RegExp>> = {
  tv: /\bsmart\s?tv\b|\btelevisor(es)?\b|\bqled\b|\bnanocell\b/i,
  phone: /\bcelular(es)?\b|\bsmartphone\b/i,
  tablet: /\btablet\b/i,
  notebook: /\bnotebook\b|\blaptop\b/i,
};

function belongsToOtherCategory(title: string, category: ProductCategory): boolean {
  for (const [cat, re] of Object.entries(CATEGORY_SIGNAL_RE)) {
    if (cat !== category && re.test(title)) return true;
  }
  return false;
}

// Combina los 3 filtros de título de arriba — reusado tanto por la búsqueda
// fulltext genérica (fetchVtexCategory) como por fuentes que consultan por
// categoría/path directo en vez de `ft=` (ej. Pardo Hogar).
export function isVtexNoiseTitle(title: string, category: ProductCategory): boolean {
  return (
    ACCESSORY_TITLE_RE.test(title) ||
    OFF_TOPIC_TITLE_START_RE.test(title.trim()) ||
    GROCERY_OR_HOUSEHOLD_TITLE_RE.test(title) ||
    CONSUMABLE_QUANTITY_SUFFIX_RE.test(title.trim()) ||
    belongsToOtherCategory(title, category)
  );
}

export async function fetchVtexCategory<T>(
  apiBase: string,
  query: string,
  max: number,
  config: VtexSourceConfig,
  category: ProductCategory,
  llmStats: { calls: number },
  extraHeaders: Record<string, string> = {}
): Promise<T[]> {
  const PAGE_SIZE = 49;
  const products: T[] = [];
  let from = 0;

  while (products.length < max) {
    const to = Math.min(from + PAGE_SIZE - 1, from + max - products.length - 1);
    const url = `${apiBase}?ft=${encodeURIComponent(query)}&_from=${from}&_to=${to}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
        ...extraHeaders,
      },
    });

    if (!res.ok) {
      console.warn(`  VTEX ${res.status} para "${query}" en ${apiBase}`);
      break;
    }

    // VTEX returns total count in header
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
        const built = await buildVtexProduct(product, category, config, llmStats);
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
