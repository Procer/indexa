import { sql } from "@/lib/db/sql";
import { getMLToken, isMLAuthorized } from "@/lib/sources/mlTokens";
import { isLikelyAccessory } from "@/lib/domain/accessoryFilter";
import type {
  NotebookSpecs,
  DesktopSpecs,
  ProcessorTier,
  GpuType,
  StorageType,
  ScreenType,
  Upgradeable,
} from "@/types";

const ML_BASE = "https://api.mercadolibre.com";

// ─── ML API types ──────────────────────────────────────────────────────────────

interface MLAttribute {
  id: string;
  name: string;
  value_name: string | null;
}

interface MLInstallments {
  quantity: number;
  amount: number;
  rate: number;
  currency_id: string;
}

interface MLSearchItem {
  id: string;
  title: string;
  price: number;
  currency_id: string;
  thumbnail: string;
  permalink: string;
  available_quantity: number;
  condition: string;
  attributes: MLAttribute[];
  installments?: MLInstallments;
}

interface MLPicture {
  id: string;
  url: string;
  secure_url: string;
}

interface MLItemDetail extends MLSearchItem {
  pictures: MLPicture[];
  tags: string[];
}

interface MLBatchResponse {
  code: number;
  body: MLItemDetail;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

// ML_HEADERS se construye dinámicamente según si hay token OAuth disponible.
let ML_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "Accept-Language": "es-AR,es;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
};

async function mlGet<T>(path: string): Promise<T> {
  const headers = ML_HEADERS;

  const res = await fetch(`${ML_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`ML ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ─── Search ───────────────────────────────────────────────────────────────────

async function searchML(
  query: string,
  offset: number,
  limit: number
): Promise<{ results: MLSearchItem[]; total: number }> {
  const params = new URLSearchParams({
    q: query,
    condition: "new",
    offset: String(offset),
    limit: String(limit),
  });
  const data = await mlGet<{
    results: MLSearchItem[];
    paging: { total: number };
  }>(`/sites/MLA/search?${params}`);
  return { results: data.results ?? [], total: data.paging?.total ?? 0 };
}

async function fetchByQuery(
  query: string,
  maxItems: number
): Promise<MLSearchItem[]> {
  const collected: MLSearchItem[] = [];
  const pageSize = 50;

  while (collected.length < maxItems) {
    const { results, total } = await searchML(
      query,
      collected.length,
      pageSize
    );
    if (results.length === 0) break;
    collected.push(...results);
    if (collected.length >= total) break;
    await sleep(400);
  }

  return collected.slice(0, maxItems);
}

async function getItemDetails(ids: string[]): Promise<MLItemDetail[]> {
  if (ids.length === 0) return [];
  const data = await mlGet<MLBatchResponse[]>(`/items?ids=${ids.join(",")}`);
  return data.filter((r) => r.code === 200).map((r) => r.body);
}

// ─── Attribute helpers ────────────────────────────────────────────────────────

function attr(attributes: MLAttribute[], id: string): string | null {
  return attributes.find((a) => a.id === id)?.value_name ?? null;
}

function parseNum(value: string | null): number | null {
  if (!value) return null;
  const m = value.replace(",", ".").match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

function parseRAM(attributes: MLAttribute[]): number {
  const val = attr(attributes, "RAM_MEMORY");
  return parseNum(val) ?? 8;
}

function parseStorageGB(attributes: MLAttribute[]): number {
  const val = attr(attributes, "TOTAL_DISK_SPACE");
  if (!val) return 256;
  const num = parseNum(val) ?? 256;
  return val.toUpperCase().includes("TB") ? num * 1000 : num;
}

function parseScreenInches(attributes: MLAttribute[]): number {
  const val = attr(attributes, "SCREEN_SIZE");
  return parseNum(val) ?? 15.6;
}

function parseWeightKg(attributes: MLAttribute[]): number {
  const val = attr(attributes, "WEIGHT");
  return parseNum(val) ?? 1.9;
}

function parseBatteryWh(attributes: MLAttribute[]): number {
  const val =
    attr(attributes, "BATTERY_CAPACITY") ??
    attr(attributes, "BATTERY_LIFE_HOURS");
  const num = parseNum(val);
  if (!num) return 42;
  // If in mWh, convert
  return num > 200 ? Math.round(num / 1000) : num;
}

function inferProcessorTier(
  procBrand: string | null,
  procModel: string | null
): ProcessorTier {
  const b = (procBrand ?? "").toLowerCase();
  const m = (procModel ?? "").toLowerCase();

  if (b.includes("apple") || m.includes("m3 pro") || m.includes("m3 max") || m.includes("m4 pro") || m.includes("m2 pro") || m.includes("m1 pro"))
    return "enthusiast";
  if (m.includes("core i9") || m.includes("core ultra 9") || m.includes("ryzen 9"))
    return "enthusiast";
  if (m.includes("core i7") || m.includes("core ultra 7") || m.includes("ryzen 7") || m.includes("m3") || m.includes("m2") || m.includes("m1"))
    return "high";
  if (m.includes("core i5") || m.includes("core ultra 5") || m.includes("ryzen 5"))
    return "mid";
  if (m.includes("core i3") || m.includes("ryzen 3"))
    return "low";
  if (m.includes("celeron") || m.includes("pentium") || m.includes("athlon") || m.includes("n4") || m.includes("n5") || m.includes("n100") || m.includes("n200"))
    return "low";

  return "mid";
}

function inferGPU(attributes: MLAttribute[]): { type: GpuType; model: string | null } {
  const gpuModel =
    attr(attributes, "GPU_MODEL") ?? attr(attributes, "GPU_BRAND");
  if (!gpuModel) return { type: "integrated", model: null };

  const g = gpuModel.toLowerCase();
  if (g.match(/rtx|gtx|radeon rx|rx \d{3,4}|arc a\d/)) {
    return { type: "dedicated", model: gpuModel };
  }
  return { type: "integrated", model: null };
}

function inferStorageType(
  attributes: MLAttribute[],
  title: string
): StorageType {
  const diskType = attr(attributes, "DISK_TYPE") ?? "";
  const diskTech = attr(attributes, "DISK_TECHNOLOGY") ?? "";
  const combined = (diskType + " " + diskTech + " " + title).toLowerCase();

  if (combined.includes("nvme") || combined.includes("pcie")) return "SSD_NVME";
  if (combined.includes("ssd")) return "SSD_SATA";
  return "HDD";
}

function inferScreenType(attributes: MLAttribute[], title: string): ScreenType {
  const panel = attr(attributes, "DISPLAY_TYPE") ?? "";
  const combined = (panel + " " + title).toLowerCase();
  if (combined.includes("oled")) return "OLED";
  if (combined.includes("va")) return "VA";
  if (combined.includes("ips")) return "IPS";
  return "TN";
}

function inferOS(attributes: MLAttribute[]): string {
  const os = attr(attributes, "OPERATING_SYSTEM") ?? "";
  const o = os.toLowerCase();
  if (o.includes("mac") || o.includes("macos")) return "macOS";
  if (o.includes("linux") || o.includes("ubuntu")) return "Linux";
  if (o.includes("chrome")) return "ChromeOS";
  if (o.includes("sin sistema") || o.includes("free dos") || o.includes("freedos")) return "Sin OS";
  if (o.includes("11")) return "Windows 11 Home";
  if (o.includes("10")) return "Windows 10 Home";
  return "Windows 11 Home";
}

function bestImage(item: MLItemDetail): string {
  if (item.pictures?.length > 0) {
    return item.pictures[0].secure_url || item.pictures[0].url;
  }
  return item.thumbnail.replace(/\bI\b/, "O");
}

// ─── Product mapping ──────────────────────────────────────────────────────────

function mapNotebook(item: MLItemDetail) {
  const attrs = item.attributes;
  const procBrand = attr(attrs, "PROCESSOR_BRAND") ?? "Intel";
  const procModel = attr(attrs, "PROCESSOR_MODEL") ?? attr(attrs, "PROCESSOR_LINE") ?? "Desconocido";
  const { type: gpuType, model: gpuModel } = inferGPU(attrs);
  const screenInches = parseScreenInches(attrs);
  const screenRes = attr(attrs, "DISPLAY_RESOLUTION") ?? "1920x1080";

  const specs: NotebookSpecs = {
    processor_brand: procBrand as NotebookSpecs["processor_brand"],
    processor_model: procModel,
    processor_tier: inferProcessorTier(procBrand, procModel),
    ram_gb: parseRAM(attrs),
    ram_upgradeable: true,
    storage_gb: parseStorageGB(attrs),
    storage_type: inferStorageType(attrs, item.title),
    storage_upgradeable: true,
    gpu: gpuType,
    gpu_model: gpuModel,
    screen_inches: screenInches,
    screen_resolution: screenRes.match(/\d+[x×]\d+/) ? screenRes : "1920x1080",
    screen_type: inferScreenType(attrs, item.title),
    has_numeric_keyboard: screenInches >= 15.4,
    weight_kg: parseWeightKg(attrs),
    battery_wh: parseBatteryWh(attrs),
    os: inferOS(attrs),
    ports: [],
    connectivity: ["Wi-Fi"],
  };

  const upgradeable: Upgradeable = {
    ram: true,
    storage: true,
    processor: false,
    screen: false,
    gpu: false,
  };

  return buildProduct(item, "notebook", specs, upgradeable);
}

function mapDesktop(item: MLItemDetail) {
  const attrs = item.attributes;
  const procBrand = attr(attrs, "PROCESSOR_BRAND") ?? "Intel";
  const procModel = attr(attrs, "PROCESSOR_MODEL") ?? attr(attrs, "PROCESSOR_LINE") ?? "Desconocido";
  const { type: gpuType, model: gpuModel } = inferGPU(attrs);

  const specs: DesktopSpecs = {
    processor_brand: procBrand as DesktopSpecs["processor_brand"],
    processor_model: procModel,
    processor_tier: inferProcessorTier(procBrand, procModel),
    ram_gb: parseRAM(attrs),
    ram_upgradeable: true,
    storage_gb: parseStorageGB(attrs),
    storage_type: inferStorageType(attrs, item.title),
    storage_upgradeable: true,
    gpu: gpuType,
    gpu_model: gpuModel,
    screen_inches: 0,
    screen_resolution: "N/A",
    screen_type: "TN",
    os: inferOS(attrs),
    ports: [],
    connectivity: ["Wi-Fi"],
  };

  const upgradeable: Upgradeable = {
    ram: true,
    storage: true,
    processor: true,
    screen: false,
    gpu: true,
  };

  return buildProduct(item, "desktop", specs, upgradeable);
}

function buildProduct(
  item: MLItemDetail,
  category: "notebook" | "desktop",
  specs: NotebookSpecs | DesktopSpecs,
  upgradeable: Upgradeable
) {
  const installmentInfo =
    item.installments?.quantity && item.installments?.amount
      ? `${item.installments.quantity}x $${Math.round(item.installments.amount).toLocaleString("es-AR")} s/i`
      : null;

  return {
    external_id: item.id,
    source: "mercadolibre",
    url: item.permalink,
    category,
    brand: attr(item.attributes, "BRAND"),
    model: attr(item.attributes, "MODEL"),
    title: item.title,
    specs,
    upgradeable,
    price_cash: item.price,
    price_installment: item.installments?.amount ?? null,
    installment_count: item.installments?.quantity ?? null,
    installment_info: installmentInfo,
    currency: item.currency_id,
    image_url: bestImage(item),
    images: item.pictures?.map((p) => p.secure_url || p.url) ?? [],
    available: item.available_quantity > 0,
    stock: item.available_quantity,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Conectando a MercadoLibre Argentina...");
  if (isMLAuthorized()) {
    try {
      const token = await getMLToken();
      ML_HEADERS = { ...ML_HEADERS, Authorization: `Bearer ${token}` };
      console.log("  Token OAuth disponible ✓ (mejor tasa de rate limit)\n");
    } catch {
      console.log("  Token OAuth inválido, usando API pública\n");
    }
  } else {
    console.log("  Sin token OAuth. Para mejores resultados corré: npm run connect-ml\n");
  }

  console.log("[1/4] Buscando notebooks...");
  const notebookItems = await fetchByQuery("notebook laptop", 50);
  console.log(`  ${notebookItems.length} resultados`);

  console.log("[2/4] Buscando PCs de escritorio...");
  const desktopItems = await fetchByQuery("pc escritorio torre", 30);
  console.log(`  ${desktopItems.length} resultados`);

  const allItems = [...notebookItems, ...desktopItems];
  const notebookIds = new Set(notebookItems.map((i) => i.id));
  const allIds = allItems.map((i) => i.id);

  console.log(`\n[3/4] Obteniendo detalles de ${allIds.length} productos...`);
  const allDetails: MLItemDetail[] = [];
  const BATCH = 20;

  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH);
    const details = await getItemDetails(batch);
    allDetails.push(...details);
    process.stdout.write(`  ${allDetails.length}/${allIds.length}\r`);
    await sleep(300);
  }
  console.log(`  ${allDetails.length} detalles obtenidos ✓`);

  const products = allDetails
    .filter(
      (item) =>
        item.available_quantity > 0 &&
        item.condition === "new" &&
        !isLikelyAccessory(item.title)
    )
    .map((item) => {
      try {
        return notebookIds.has(item.id)
          ? mapNotebook(item)
          : mapDesktop(item);
      } catch {
        return null;
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  console.log(`\n[4/4] Insertando ${products.length} productos en la DB...`);

  // ⚠️ Script de bootstrap obsoleto: BORRA TODO el catálogo y lo reemplaza
  // solo con productos de MercadoLibre. Precede al catálogo multi-tienda.
  // No usar salvo que sepas exactamente lo que hacés.
  try {
    await sql`DELETE FROM products`;
  } catch (err) {
    console.error("Error al borrar:", (err as Error).message);
    process.exitCode = 1;
    return;
  }

  let inserted = 0;
  for (const p of products) {
    try {
      await sql`
        INSERT INTO products (
          external_id, source, url, category, brand, model, title,
          specs, upgradeable, price_cash, price_installment,
          installment_count, installment_info, currency,
          image_url, images, available, stock
        ) VALUES (
          ${p.external_id}, ${p.source}, ${p.url}, ${p.category},
          ${p.brand}, ${p.model}, ${p.title},
          ${sql.json(p.specs as never)}, ${sql.json(p.upgradeable as never)},
          ${p.price_cash}, ${p.price_installment},
          ${p.installment_count}, ${p.installment_info}, ${p.currency},
          ${p.image_url}, ${p.images}::text[], ${p.available}, ${p.stock}
        )
      `;
      inserted++;
    } catch (err) {
      console.error(`  Error insertando ${p.external_id}: ${(err as Error).message}`);
    }
  }
  await sleep(100);

  console.log(`\n✓ ${inserted} productos reales de MercadoLibre Argentina cargados`);
  const nb = products.filter((p) => p?.category === "notebook").length;
  const dt = products.filter((p) => p?.category === "desktop").length;
  console.log(`  ${nb} notebooks, ${dt} PCs de escritorio`);
  console.log("\nPróximo paso: npm run embed");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
