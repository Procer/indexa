/**
 * Sync multi-fuente: Fravega (GraphQL) + MercadoLibre (Playwright scraper).
 *
 * - Fravega: specs completas vía API GraphQL oficial no autenticada
 * - ML: títulos + precios + imágenes reales vía scraping; specs se infieren con LLM
 * - Productos nuevos: se insertan con embedding pendiente
 * - Productos existentes: se actualiza precio e imágenes
 * - Productos que desaparecen: se marcan como unavailable
 * - Al final corre generateEmbeddings para los nuevos
 */

import { createClient } from "@supabase/supabase-js";
import { fetchFraveNotebooks, fetchFraveDesktops, fetchFravePhones, fetchFraveTablets, fetchFraveTVs } from "@/lib/sources/fravega";
import { fetchMLNotebooks, fetchMLDesktops } from "@/lib/sources/mlScraper";
import { generateAffiliateUrl, getAffiliateConfigFromEnv } from "@/lib/domain/affiliateLink";
import { isLikelyAccessory } from "@/lib/domain/accessoryFilter";
import type { Upgradeable, ProductSpecs, ProductSource, ProductCategory } from "@/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Config ───────────────────────────────────────────────────────────────────

const LIMITS = {
  fravega: { notebooks: 80, desktops: 40, phones: 80, tablets: 60, tvs: 60 },
  ml: { notebooks: 60, desktops: 30 },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncProduct {
  external_id: string;
  source: ProductSource;
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
}

// ─── DB upsert ────────────────────────────────────────────────────────────────

async function upsertProducts(products: SyncProduct[], source: string) {
  const { data: existing } = await supabase
    .from("products")
    .select("id, external_id, price_cash, price_installment, available")
    .eq("source", source);

  const existingMap = new Map(
    (existing ?? []).map((p) => [
      p.external_id as string,
      p as {
        id: string;
        external_id: string;
        price_cash: number | null;
        price_installment: number | null;
        available: boolean;
      },
    ])
  );

  const incomingIds = new Set(products.map((p) => p.external_id));

  // El tag de afiliado solo aplica a MercadoLibre; para el resto queda NULL
  // y el frontend usa la URL original (ver ProductCard.tsx).
  const affiliateConfig = source === "mercadolibre" ? getAffiliateConfigFromEnv() : null;

  let inserted = 0;
  let updated = 0;
  let deactivated = 0;

  for (const product of products) {
    const ex = existingMap.get(product.external_id);
    const affiliateUrl = affiliateConfig
      ? generateAffiliateUrl(product.url, affiliateConfig)
      : null;

    try {
      if (ex) {
        const { error } = await supabase
          .from("products")
          .update({
            price_cash: product.price_cash,
            price_installment: product.price_installment,
            image_url: product.image_url,
            images: product.images,
            affiliate_url: affiliateUrl,
            available: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", ex.id);

        if (!error) {
          updated++;
          if (
            ex.price_cash !== product.price_cash ||
            ex.price_installment !== product.price_installment
          ) {
            await supabase.from("price_history").insert({
              product_id: ex.id,
              price_cash: product.price_cash,
              price_installment: product.price_installment,
            });
          }
        }
      } else {
        const { data: newProduct, error } = await supabase
          .from("products")
          .insert({ ...product, affiliate_url: affiliateUrl })
          .select("id")
          .single();
        if (!error) {
          inserted++;
          if (newProduct) {
            await supabase.from("price_history").insert({
              product_id: newProduct.id,
              price_cash: product.price_cash,
              price_installment: product.price_installment,
            });
          }
        } else {
          console.error(`  Insert error (${product.external_id}):`, error.message);
        }
      }
    } catch (err) {
      console.error(`  Error en ${product.external_id}:`, err);
    }
  }

  // Mark products no longer found as unavailable
  for (const [extId, prod] of Array.from(existingMap.entries())) {
    if (!incomingIds.has(extId) && prod.available) {
      await supabase
        .from("products")
        .update({ available: false })
        .eq("id", prod.id);
      deactivated++;
    }
  }

  return { inserted, updated, deactivated };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== TechSearch — Sync multi-fuente ===\n");

  const llmStats = { calls: 0 };
  const totals = { inserted: 0, updated: 0, deactivated: 0 };

  // ── Fravega ────────────────────────────────────────────────────────────────
  console.log("[1/7] Fravega — notebooks...");
  const fraveNB = await fetchFraveNotebooks(LIMITS.fravega.notebooks, llmStats);
  console.log(`  ${fraveNB.length} obtenidos`);

  console.log("[2/7] Fravega — PCs escritorio...");
  const faveDT = await fetchFraveDesktops(LIMITS.fravega.desktops, llmStats);
  console.log(`  ${faveDT.length} obtenidos`);

  console.log("[3/7] Fravega — celulares...");
  const fravePhones = await fetchFravePhones(LIMITS.fravega.phones, llmStats);
  console.log(`  ${fravePhones.length} obtenidos`);

  console.log("[4/7] Fravega — tablets...");
  const fraveTablets = await fetchFraveTablets(LIMITS.fravega.tablets, llmStats);
  console.log(`  ${fraveTablets.length} obtenidos`);

  console.log("[5/7] Fravega — Smart TVs...");
  const fraveTVs = await fetchFraveTVs(LIMITS.fravega.tvs, llmStats);
  console.log(`  ${fraveTVs.length} obtenidos`);

  console.log("[6/7] Sincronizando Fravega en DB...");
  const fraveAll = [...fraveNB, ...faveDT, ...fravePhones, ...fraveTablets, ...fraveTVs];
  const fraveValid = fraveAll.filter((p) => !isLikelyAccessory(p.title));
  if (fraveValid.length < fraveAll.length) {
    console.log(`  descartados ${fraveAll.length - fraveValid.length} accesorios/no-dispositivos por título`);
  }
  const fraveStats = await upsertProducts(fraveValid, "fravega");
  totals.inserted += fraveStats.inserted;
  totals.updated += fraveStats.updated;
  totals.deactivated += fraveStats.deactivated;
  console.log(`  +${fraveStats.inserted} nuevos, ~${fraveStats.updated} actualizados`);

  // ── MercadoLibre ───────────────────────────────────────────────────────────
  console.log("\n[7a/7] MercadoLibre — notebooks (Playwright)...");
  const mlNB = await fetchMLNotebooks(LIMITS.ml.notebooks, llmStats);
  console.log(`  ${mlNB.length} obtenidos`);

  console.log("[7b/7] MercadoLibre — PCs escritorio (Playwright)...");
  const mlDT = await fetchMLDesktops(LIMITS.ml.desktops, llmStats);
  console.log(`  ${mlDT.length} obtenidos`);

  console.log("[7c/7] Sincronizando MercadoLibre en DB...");
  const mlAll = [...mlNB, ...mlDT];
  const mlValid = mlAll.filter((p) => !isLikelyAccessory(p.title));
  if (mlValid.length < mlAll.length) {
    console.log(`  descartados ${mlAll.length - mlValid.length} accesorios/no-dispositivos por título`);
  }
  const mlStats = await upsertProducts(mlValid, "mercadolibre");
  totals.inserted += mlStats.inserted;
  totals.updated += mlStats.updated;
  totals.deactivated += mlStats.deactivated;
  console.log(`  +${mlStats.inserted} nuevos, ~${mlStats.updated} actualizados`);

  // ── Resumen ────────────────────────────────────────────────────────────────
  console.log("\n✓ Sync completado:");
  console.log(`  ${totals.inserted} productos nuevos insertados`);
  console.log(`  ${totals.updated} precios/imágenes actualizados`);
  console.log(`  ${totals.deactivated} marcados como no disponibles`);
  console.log(`  ${llmStats.calls} llamadas LLM para normalización de specs`);

  if (totals.inserted > 0) {
    console.log("\nGenerando embeddings para productos nuevos...");
    const { execSync } = await import("child_process");
    execSync("npm run embed", { stdio: "inherit" });
  }
}

main().catch((err) => {
  console.error("\nError en sync:", err.message);
  process.exit(1);
});
