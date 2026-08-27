/**
 * Fravega GraphQL connector.
 * Endpoint: https://www.fravega.com/api/v2/graphql
 * No auth required. Docs discovered via introspection.
 */

import {
  normalizeNotebookSpecs,
  normalizeDesktopSpecs,
  normalizePhoneSpecs,
  normalizeTabletSpecs,
  normalizeTVSpecs,
  inferGPU,
} from "@/lib/normalizer/specsExtractor";
import type { Upgradeable } from "@/types";

// ─── Fravega API types ────────────────────────────────────────────────────────

interface FraveSpec {
  name: string;
  stringValue: string | null;
}

interface FraveItem {
  id: string;
  title: string;
  slug: string;
  brand: { name: string } | null;
}

interface FravePricing {
  salePrice: number | null;
  listPrice: number | null;
}

interface FraveResult {
  code: string;
  images: string[];
  item: FraveItem;
  specifications: FraveSpec[];
  pricing: FravePricing;
}

interface FraveResponse {
  data: {
    items: {
      total: number;
      results: FraveResult[];
    };
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GRAPHQL = "https://www.fravega.com/api/v2/graphql";
const IMAGE_BASE = "https://images.fravega.com/f300/";
const PAGE_SIZE = 48;

const QUERY = `
  query FetchItems($keywords: String!, $from: Int!) {
    items(
      filters: { keywords: $keywords }
      pagination: { size: ${PAGE_SIZE}, from: $from }
      sorting: RELEVANCE
    ) {
      total
      results {
        code
        images
        item { id title slug brand { name } }
        specifications { name stringValue }
        pricing { salePrice listPrice }
      }
    }
  }
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function spec(specs: FraveSpec[], name: string): string | null {
  const found = specs.find(
    (s) => s.name.trim().toLowerCase() === name.toLowerCase()
  );
  return found?.stringValue ?? null;
}

function specNum(specs: FraveSpec[], name: string): number | null {
  const val = spec(specs, name);
  if (!val) return null;
  const m = val.replace(",", ".").match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

export function buildFraveURL(slug: string, code: string): string {
  const cleanSlug = slug
    .replace(/["""]/g, "")
    .replace(/[^\w-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "");
  return `https://www.fravega.com/p/${cleanSlug}-${code}/`;
}

export function buildFraveImage(hash: string): string {
  const clean = hash.endsWith(".jpg") ? hash : `${hash}.jpg`;
  return `${IMAGE_BASE}${clean}`;
}

// ─── Spec extraction from Fravega attributes ──────────────────────────────────

export function extractFromFraveSpecs(specs: FraveSpec[]) {
  const ramRaw = spec(specs, "RAM ") ?? spec(specs, "Memoria RAM");
  let ramGB: number | null = null;
  if (ramRaw) {
    const m = ramRaw.match(/(\d+)/);
    if (m) ramGB = parseInt(m[1]);
  }

  const storageRaw =
    spec(specs, "Disco SSD") ??
    spec(specs, "Disco HDD") ??
    spec(specs, "Almacenamiento");
  let storageGB: number | null = null;
  if (storageRaw) {
    const m = storageRaw.match(/(\d+)\s*(TB|GB)/i);
    if (m) {
      storageGB = m[2].toUpperCase() === "TB" ? parseInt(m[1]) * 1000 : parseInt(m[1]);
    }
  }

  const procBrandRaw = spec(specs, "Procesador") ?? spec(specs, "Tipo de procesador");
  let procBrand: string | null = null;
  if (procBrandRaw) {
    if (procBrandRaw.toLowerCase().includes("amd")) procBrand = "AMD";
    else if (procBrandRaw.toLowerCase().includes("intel")) procBrand = "Intel";
    else if (procBrandRaw.toLowerCase().includes("apple")) procBrand = "Apple";
  }

  const procModel = spec(specs, "Mod. procesador");

  const screenInches = specNum(specs, "Pantalla") ?? specNum(specs, "Tamaño de Pantalla");

  const screenRes = spec(specs, "Resolución de pantalla");

  const isSSD =
    spec(specs, "Disco Sólido")?.toLowerCase() === "si" ||
    storageRaw !== null;
  const isHDD = spec(specs, "Disco rígido")?.toLowerCase() === "si";

  const hasTouchscreen =
    spec(specs, "Pantalla táctil")?.toLowerCase() === "si";

  const hasNumericKeyboard =
    spec(specs, "Teclado numérico")?.toLowerCase() === "si";

  const os = spec(specs, "Sistema operativo");

  const weightKg = specNum(specs, "Peso");

  const hasWifi =
    spec(specs, "Wi-Fi")?.toLowerCase() === "si";

  const hasBluetooth =
    spec(specs, "Bluetooth")?.toLowerCase() === "si";

  const usbPorts = specNum(specs, "Puertos usb");
  const hdmiPorts = specNum(specs, "Puerto HDMI");

  const gpuModel = spec(specs, "Placa de video") ?? spec(specs, "GPU");

  return {
    ramGB,
    storageGB,
    procBrand,
    procModel,
    screenInches,
    screenRes,
    isSSD,
    isHDD,
    hasTouchscreen,
    hasNumericKeyboard,
    os,
    weightKg,
    hasWifi,
    hasBluetooth,
    usbPorts,
    hdmiPorts,
    gpuModel,
  };
}

// ─── Product builder ──────────────────────────────────────────────────────────

// Fravega attribute format compatible with specsExtractor's MLAttribute interface
function toMLAttributes(specs: FraveSpec[]) {
  return specs.map((s) => ({
    id: s.name,
    name: s.name,
    value_name: s.stringValue,
  }));
}

async function buildProduct(
  result: FraveResult,
  category: "notebook" | "desktop",
  llmStats: { calls: number }
) {
  const { code, images, item, specifications, pricing } = result;

  const { specs, usedLLM } =
    category === "notebook"
      ? await normalizeNotebookSpecs(item.title, toMLAttributes(specifications))
      : await normalizeDesktopSpecs(item.title, toMLAttributes(specifications));

  if (usedLLM) llmStats.calls++;

  const fraveSpecs = extractFromFraveSpecs(specifications);

  // Override with Fravega-specific values when available and more precise
  if (category === "notebook") {
    const nb = specs as import("@/types").NotebookSpecs;
    if (fraveSpecs.hasNumericKeyboard !== null)
      nb.has_numeric_keyboard = fraveSpecs.hasNumericKeyboard;
    if (fraveSpecs.weightKg) nb.weight_kg = fraveSpecs.weightKg;
    if (fraveSpecs.screenRes)
      nb.screen_resolution = fraveSpecs.screenRes.replace(" x ", "x");
    // Fravega "Placa de video" → override GPU (not captured by MLAttribute mapper)
    if (fraveSpecs.gpuModel) {
      const { type, model } = inferGPU(fraveSpecs.gpuModel);
      nb.gpu = type;
      nb.gpu_model = model;
    }
    // Fravega "Disco SSD" / "Disco HDD" → correct storage_type
    if (fraveSpecs.isSSD) nb.storage_type = "SSD_SATA";
    else if (fraveSpecs.isHDD) nb.storage_type = "HDD";
  } else {
    const dt = specs as import("@/types").DesktopSpecs;
    if (fraveSpecs.screenRes)
      dt.screen_resolution = fraveSpecs.screenRes.replace(" x ", "x");
    if (fraveSpecs.gpuModel) {
      const { type, model } = inferGPU(fraveSpecs.gpuModel);
      dt.gpu = type;
      dt.gpu_model = model;
    }
    if (fraveSpecs.isSSD) dt.storage_type = "SSD_SATA";
    else if (fraveSpecs.isHDD) dt.storage_type = "HDD";
  }

  const upgradeable: Upgradeable =
    category === "notebook"
      ? { ram: true, storage: true, processor: false, screen: false, gpu: false }
      : { ram: true, storage: true, processor: true, screen: false, gpu: true };

  const imageHashes = images ?? [];
  const imageUrls = imageHashes.map(buildFraveImage);
  const url = buildFraveURL(item.slug, code);

  return {
    external_id: `fravega-${code}`,
    source: "fravega" as const,
    url,
    category,
    brand: item.brand?.name ?? null,
    model: null,
    title: item.title,
    specs,
    upgradeable,
    price_cash: pricing.salePrice ?? null,
    price_installment: null,
    installment_count: null,
    installment_info: null,
    currency: "ARS",
    image_url: imageUrls[0] ?? null,
    images: imageUrls,
    available: true,
    stock: null,
  };
}

// ─── API fetch ────────────────────────────────────────────────────────────────

async function fraveQuery(keywords: string, from: number): Promise<FraveResponse> {
  const res = await fetch(GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://www.fravega.com/",
      Accept: "application/json",
    },
    body: JSON.stringify({ query: QUERY, variables: { keywords, from } }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fravega GraphQL ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<FraveResponse>;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchFraveItems(
  keywords: string,
  max: number,
  category: "notebook" | "desktop",
  llmStats: { calls: number }
) {
  const products = [];
  let from = 0;

  while (products.length < max) {
    const data = await fraveQuery(keywords, from);
    const results = data.data.items.results;
    const total = data.data.items.total;

    if (!results.length) break;

    for (const result of results) {
      if (products.length >= max) break;
      try {
        const product = await buildProduct(result, category, llmStats);
        products.push(product);
      } catch (err) {
        console.error(`  Error procesando ${result.code}:`, err);
      }
    }

    from += PAGE_SIZE;
    if (from >= total) break;
    await sleep(300);
  }

  return products;
}

export async function fetchFraveNotebooks(
  max: number,
  llmStats: { calls: number }
) {
  console.log("  Buscando notebooks en Fravega...");
  return fetchFraveItems("notebook", max, "notebook", llmStats);
}

export async function fetchFraveDesktops(
  max: number,
  llmStats: { calls: number }
) {
  console.log("  Buscando PCs de escritorio en Fravega...");
  return fetchFraveItems("pc escritorio", max, "desktop", llmStats);
}

// ─── Phone / Tablet / TV builders ────────────────────────────────────────────

const PHONE_UPGRADEABLE: Upgradeable = { ram: false, storage: false, processor: false, screen: false };
const TABLET_UPGRADEABLE: Upgradeable = { ram: false, storage: false, processor: false, screen: false };
const TV_UPGRADEABLE: Upgradeable = { ram: false, storage: false, processor: false, screen: false };

async function buildPhoneProduct(result: FraveResult, llmStats: { calls: number }) {
  const { code, images, item, specifications, pricing } = result;
  const attrs = toMLAttributes(specifications);
  const { specs, usedLLM } = await normalizePhoneSpecs(item.title, attrs);
  if (usedLLM) llmStats.calls++;

  const imageUrls = (images ?? []).map(buildFraveImage);
  return {
    external_id: `fravega-${code}`,
    source: "fravega" as const,
    url: buildFraveURL(item.slug, code),
    category: "phone" as const,
    brand: item.brand?.name ?? null,
    model: null,
    title: item.title,
    specs,
    upgradeable: PHONE_UPGRADEABLE,
    price_cash: pricing.salePrice ?? null,
    price_installment: null,
    installment_count: null,
    installment_info: null,
    currency: "ARS",
    image_url: imageUrls[0] ?? null,
    images: imageUrls,
    available: true,
    stock: null,
  };
}

async function buildTabletProduct(result: FraveResult, llmStats: { calls: number }) {
  const { code, images, item, specifications, pricing } = result;
  const attrs = toMLAttributes(specifications);
  const { specs, usedLLM } = await normalizeTabletSpecs(item.title, attrs);
  if (usedLLM) llmStats.calls++;

  const imageUrls = (images ?? []).map(buildFraveImage);
  return {
    external_id: `fravega-${code}`,
    source: "fravega" as const,
    url: buildFraveURL(item.slug, code),
    category: "tablet" as const,
    brand: item.brand?.name ?? null,
    model: null,
    title: item.title,
    specs,
    upgradeable: TABLET_UPGRADEABLE,
    price_cash: pricing.salePrice ?? null,
    price_installment: null,
    installment_count: null,
    installment_info: null,
    currency: "ARS",
    image_url: imageUrls[0] ?? null,
    images: imageUrls,
    available: true,
    stock: null,
  };
}

async function buildTVProduct(result: FraveResult, llmStats: { calls: number }) {
  const { code, images, item, specifications, pricing } = result;
  const attrs = toMLAttributes(specifications);
  const { specs, usedLLM } = await normalizeTVSpecs(item.title, attrs);
  if (usedLLM) llmStats.calls++;

  const imageUrls = (images ?? []).map(buildFraveImage);
  return {
    external_id: `fravega-${code}`,
    source: "fravega" as const,
    url: buildFraveURL(item.slug, code),
    category: "tv" as const,
    brand: item.brand?.name ?? null,
    model: null,
    title: item.title,
    specs,
    upgradeable: TV_UPGRADEABLE,
    price_cash: pricing.salePrice ?? null,
    price_installment: null,
    installment_count: null,
    installment_info: null,
    currency: "ARS",
    image_url: imageUrls[0] ?? null,
    images: imageUrls,
    available: true,
    stock: null,
  };
}

async function fetchFraveByCategory<T>(
  keywords: string,
  max: number,
  builder: (result: FraveResult, llmStats: { calls: number }) => Promise<T>,
  llmStats: { calls: number }
): Promise<T[]> {
  const products: T[] = [];
  let from = 0;

  while (products.length < max) {
    const data = await fraveQuery(keywords, from);
    const results = data.data.items.results;
    const total = data.data.items.total;

    if (!results.length) break;

    for (const result of results) {
      if (products.length >= max) break;
      try {
        products.push(await builder(result, llmStats));
      } catch (err) {
        console.error(`  Error procesando ${result.code}:`, err);
      }
    }

    from += PAGE_SIZE;
    if (from >= total) break;
    await sleep(300);
  }

  return products;
}

export async function fetchFravePhones(max: number, llmStats: { calls: number }) {
  console.log("  Buscando celulares en Fravega...");
  return fetchFraveByCategory("celular", max, buildPhoneProduct, llmStats);
}

export async function fetchFraveTablets(max: number, llmStats: { calls: number }) {
  console.log("  Buscando tablets en Fravega...");
  return fetchFraveByCategory("tablet", max, buildTabletProduct, llmStats);
}

export async function fetchFraveTVs(max: number, llmStats: { calls: number }) {
  console.log("  Buscando Smart TVs en Fravega...");
  return fetchFraveByCategory("smart tv", max, buildTVProduct, llmStats);
}
