/**
 * Sync diario de productos desde MercadoLibre Argentina.
 * Requiere haber autorizado la app en /admin/connect-ml primero.
 *
 * - Nuevos productos: se insertan con embedding pendiente
 * - Productos existentes: se actualiza precio e imágenes
 * - Productos que desaparecen de ML: se marcan como unavailable
 * - Al final corre generateEmbeddings para los productos nuevos
 */

import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import { getMLToken } from "@/lib/sources/mlTokens";
import {
  normalizeNotebookSpecs,
  normalizeDesktopSpecs,
  normalizePhoneSpecs,
  normalizeTabletSpecs,
  attr,
} from "@/lib/normalizer/specsExtractor";
import { generateAffiliateUrl, getAffiliateConfigFromEnv } from "@/lib/domain/affiliateLink";
import { isLikelyAccessory } from "@/lib/domain/accessoryFilter";
import { notifyTelegram } from "@/lib/notify/telegram";
import type { Upgradeable } from "@/types";

// Node 20 no trae WebSocket nativo (recién en Node 22); supabase-js igual
// instancia un RealtimeClient al crear el cliente aunque este script nunca
// use realtime, así que sin esto tira "Node.js 20 detected without native
// WebSocket support" apenas se llama a createClient.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws as unknown as WebSocketLikeConstructor } }
);

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

interface MLItem {
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
  pictures?: Array<{ secure_url: string; url: string }>;
}

interface MLBatchResponse {
  code: number;
  body: MLItem;
}

// ─── ML API calls ──────────────────────────────────────────────────────────────

async function mlGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${ML_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ML API ${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function searchML(
  query: string,
  offset: number,
  limit: number,
  token: string
): Promise<{ results: MLItem[]; total: number }> {
  const params = new URLSearchParams({
    q: query,
    condition: "new",
    offset: String(offset),
    limit: String(limit),
  });
  const data = await mlGet<{ results: MLItem[]; paging: { total: number } }>(
    `/sites/MLA/search?${params}`,
    token
  );
  return { results: data.results ?? [], total: data.paging?.total ?? 0 };
}

async function fetchCategory(
  query: string,
  max: number,
  token: string
): Promise<MLItem[]> {
  const collected: MLItem[] = [];
  const pageSize = 50;

  while (collected.length < max) {
    const { results, total } = await searchML(
      query,
      collected.length,
      pageSize,
      token
    );
    if (!results.length) break;
    collected.push(...results);
    if (collected.length >= total) break;
    await sleep(400);
  }

  return collected.slice(0, max);
}

async function getItemDetails(ids: string[], token: string): Promise<MLItem[]> {
  if (!ids.length) return [];
  const BATCH = 20;
  const all: MLItem[] = [];

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const data = await mlGet<MLBatchResponse[]>(
      `/items?ids=${batch.join(",")}`,
      token
    );
    all.push(...data.filter((r) => r.code === 200).map((r) => r.body));
    await sleep(300);
  }

  return all;
}

// ─── Product building ─────────────────────────────────────────────────────────

function bestImage(item: MLItem): string {
  if (item.pictures?.length) {
    return item.pictures[0].secure_url || item.pictures[0].url;
  }
  return item.thumbnail.replace(/\bI\b/, "O");
}

function installmentInfo(item: MLItem): string | null {
  if (!item.installments?.quantity || !item.installments?.amount) return null;
  return `${item.installments.quantity}x $${Math.round(item.installments.amount).toLocaleString("es-AR")} s/i`;
}

async function buildNotebook(item: MLItem, llmStats: { calls: number }) {
  const { specs, usedLLM } = await normalizeNotebookSpecs(
    item.title,
    item.attributes
  );
  if (usedLLM) llmStats.calls++;

  const upgradeable: Upgradeable = {
    ram: true,
    storage: true,
    processor: false,
    screen: false,
    gpu: false,
  };

  return {
    external_id: item.id,
    source: "mercadolibre",
    url: item.permalink,
    category: "notebook",
    brand: attr(item.attributes, "BRAND"),
    model: attr(item.attributes, "MODEL"),
    title: item.title,
    specs,
    upgradeable,
    price_cash: item.price,
    price_installment: item.installments?.amount ?? null,
    installment_count: item.installments?.quantity ?? null,
    installment_info: installmentInfo(item),
    currency: item.currency_id,
    image_url: bestImage(item),
    images: item.pictures?.map((p) => p.secure_url || p.url) ?? [],
    available: item.available_quantity > 0,
    stock: item.available_quantity,
  };
}

// Sin componentes mejorables — celulares y tablets vienen sellados de fábrica
// (mismo criterio que lib/sources/fravega.ts).
const PHONE_UPGRADEABLE: Upgradeable = { ram: false, storage: false, processor: false, screen: false };
const TABLET_UPGRADEABLE: Upgradeable = { ram: false, storage: false, processor: false, screen: false };

async function buildPhone(item: MLItem, llmStats: { calls: number }) {
  const { specs, usedLLM } = await normalizePhoneSpecs(item.title, item.attributes);
  if (usedLLM) llmStats.calls++;

  return {
    external_id: item.id,
    source: "mercadolibre",
    url: item.permalink,
    category: "phone",
    brand: attr(item.attributes, "BRAND"),
    model: attr(item.attributes, "MODEL"),
    title: item.title,
    specs,
    upgradeable: PHONE_UPGRADEABLE,
    price_cash: item.price,
    price_installment: item.installments?.amount ?? null,
    installment_count: item.installments?.quantity ?? null,
    installment_info: installmentInfo(item),
    currency: item.currency_id,
    image_url: bestImage(item),
    images: item.pictures?.map((p) => p.secure_url || p.url) ?? [],
    available: item.available_quantity > 0,
    stock: item.available_quantity,
  };
}

async function buildTablet(item: MLItem, llmStats: { calls: number }) {
  const { specs, usedLLM } = await normalizeTabletSpecs(item.title, item.attributes);
  if (usedLLM) llmStats.calls++;

  return {
    external_id: item.id,
    source: "mercadolibre",
    url: item.permalink,
    category: "tablet",
    brand: attr(item.attributes, "BRAND"),
    model: attr(item.attributes, "MODEL"),
    title: item.title,
    specs,
    upgradeable: TABLET_UPGRADEABLE,
    price_cash: item.price,
    price_installment: item.installments?.amount ?? null,
    installment_count: item.installments?.quantity ?? null,
    installment_info: installmentInfo(item),
    currency: item.currency_id,
    image_url: bestImage(item),
    images: item.pictures?.map((p) => p.secure_url || p.url) ?? [],
    available: item.available_quantity > 0,
    stock: item.available_quantity,
  };
}

async function buildDesktop(item: MLItem, llmStats: { calls: number }) {
  const { specs, usedLLM } = await normalizeDesktopSpecs(
    item.title,
    item.attributes
  );
  if (usedLLM) llmStats.calls++;

  const upgradeable: Upgradeable = {
    ram: true,
    storage: true,
    processor: true,
    screen: false,
    gpu: true,
  };

  return {
    external_id: item.id,
    source: "mercadolibre",
    url: item.permalink,
    category: "desktop",
    brand: attr(item.attributes, "BRAND"),
    model: attr(item.attributes, "MODEL"),
    title: item.title,
    specs,
    upgradeable,
    price_cash: item.price,
    price_installment: item.installments?.amount ?? null,
    installment_count: item.installments?.quantity ?? null,
    installment_info: installmentInfo(item),
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
  console.log("=== TechSearch — Sync desde MercadoLibre Argentina ===\n");

  console.log("Obteniendo token OAuth...");
  const token = await getMLToken();
  console.log("Token OK ✓\n");

  // 1. Fetch from ML
  console.log("[1/6] Buscando notebooks en ML...");
  const nbSearch = await fetchCategory("notebook laptop", 80, token);
  console.log(`  ${nbSearch.length} encontradas`);

  console.log("[2/6] Buscando PCs de escritorio en ML...");
  const dtSearch = await fetchCategory("pc escritorio torre", 40, token);
  console.log(`  ${dtSearch.length} encontradas`);

  console.log("[3/6] Buscando celulares en ML...");
  const phoneSearch = await fetchCategory("celular smartphone", 80, token);
  console.log(`  ${phoneSearch.length} encontrados`);

  console.log("[4/6] Buscando tablets en ML...");
  const tabletSearch = await fetchCategory("tablet", 60, token);
  console.log(`  ${tabletSearch.length} encontradas`);

  const allSearch = [...nbSearch, ...dtSearch, ...phoneSearch, ...tabletSearch];

  // Cada búsqueda es de una sola categoría — mapear id -> categoría para
  // saber qué builder/normalizador usar más abajo (un producto puede
  // aparecer en más de una búsqueda por keyword ambiguo; se queda con la
  // primera categoría con la que se lo encontró).
  type MLCategory = "notebook" | "desktop" | "phone" | "tablet";
  const categoryById = new Map<string, MLCategory>();
  for (const i of nbSearch) if (!categoryById.has(i.id)) categoryById.set(i.id, "notebook");
  for (const i of dtSearch) if (!categoryById.has(i.id)) categoryById.set(i.id, "desktop");
  for (const i of phoneSearch) if (!categoryById.has(i.id)) categoryById.set(i.id, "phone");
  for (const i of tabletSearch) if (!categoryById.has(i.id)) categoryById.set(i.id, "tablet");

  // 2. Get full details
  console.log(`\n[5/6] Obteniendo detalles de ${allSearch.length} productos...`);
  const details = await getItemDetails(
    allSearch.map((i) => i.id),
    token
  );
  const validDetails = details.filter(
    (i) => i.available_quantity > 0 && i.condition === "new" && !isLikelyAccessory(i.title)
  );
  console.log(`  ${validDetails.length} productos válidos`);

  // 3. Get existing products from DB to diff
  const { data: existing } = await supabase
    .from("products")
    .select("id, external_id, price_cash, available")
    .eq("source", "mercadolibre");

  const existingMap = new Map(
    (existing ?? []).map((p) => [
      p.external_id as string,
      p as { id: string; external_id: string; price_cash: number; available: boolean },
    ])
  );

  const incomingExternalIds = new Set(validDetails.map((i) => i.id));

  // 4. Normalize specs (TASK-202)
  console.log("\n[6/6] Normalizando specs y actualizando DB...");
  const llmStats = { calls: 0 };

  let inserted = 0;
  let updated = 0;
  let deactivated = 0;

  // Todos los productos de este script son "mercadolibre" — config única para el batch.
  const affiliateConfig = getAffiliateConfigFromEnv();

  // Insert or update products
  for (const item of validDetails) {
    const existing = existingMap.get(item.id);
    const affiliateUrl = affiliateConfig
      ? generateAffiliateUrl(item.permalink, affiliateConfig)
      : null;

    try {
      if (existing) {
        // Update price and availability only (avoid expensive re-normalization)
        const { error } = await supabase
          .from("products")
          .update({
            price_cash: item.price,
            price_installment: item.installments?.amount ?? null,
            installment_count: item.installments?.quantity ?? null,
            installment_info: installmentInfo(item),
            image_url: bestImage(item),
            affiliate_url: affiliateUrl,
            available: item.available_quantity > 0,
            stock: item.available_quantity,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (!error) updated++;
      } else {
        // New product — full normalization
        const category = categoryById.get(item.id) ?? "notebook";
        const product =
          category === "notebook" ? await buildNotebook(item, llmStats)
          : category === "desktop" ? await buildDesktop(item, llmStats)
          : category === "phone" ? await buildPhone(item, llmStats)
          : await buildTablet(item, llmStats);

        const { error } = await supabase
          .from("products")
          .insert({ ...product, affiliate_url: affiliateUrl });
        if (!error) inserted++;
      }
    } catch (err) {
      console.error(`  Error en ${item.id}:`, err);
    }
  }

  // Mark products no longer on ML as unavailable
  for (const [extId, prod] of Array.from(existingMap.entries())) {
    if (!incomingExternalIds.has(extId) && prod.available) {
      await supabase
        .from("products")
        .update({ available: false })
        .eq("id", prod.id);
      deactivated++;
    }
  }

  console.log(`\n✓ Sync completado:`);
  console.log(`  ${inserted} productos nuevos insertados`);
  console.log(`  ${updated} precios actualizados`);
  console.log(`  ${deactivated} marcados como no disponibles`);
  console.log(`  ${llmStats.calls} llamadas LLM para normalización`);

  if (inserted > 0) {
    console.log("\nGenerando embeddings para productos nuevos...");
    const { execSync } = await import("child_process");
    execSync("npm run embed", { stdio: "inherit" });
  }
}

main().catch(async (err) => {
  console.error("\nError en sync:", err.message);
  await notifyTelegram(`🔴 Sync MercadoLibre (API oficial) falló: ${err.message ?? err}`);
  process.exit(1);
});
