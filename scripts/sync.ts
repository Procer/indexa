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

import { sql } from "@/lib/db/sql";
import { fetchFraveNotebooks, fetchFraveDesktops, fetchFravePhones, fetchFraveTablets, fetchFraveTVs } from "@/lib/sources/fravega";
import { fetchMLNotebooks, fetchMLDesktops } from "@/lib/sources/mlScraper";
import { generateAffiliateUrl, getAffiliateConfigFromEnv } from "@/lib/domain/affiliateLink";
import { isLikelyAccessory } from "@/lib/domain/accessoryFilter";
import type { Upgradeable, ProductSpecs, ProductSource, ProductCategory } from "@/types";

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
  const existing = await sql<
    {
      id: string;
      external_id: string;
      price_cash: number | null;
      price_installment: number | null;
      available: boolean;
    }[]
  >`
    SELECT id, external_id, price_cash, price_installment, available
    FROM products
    WHERE source = ${source}
  `;

  const existingMap = new Map(existing.map((p) => [p.external_id, p]));

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
        await sql`
          UPDATE products SET
            price_cash        = ${product.price_cash},
            price_installment = ${product.price_installment},
            image_url         = ${product.image_url},
            images            = ${product.images}::text[],
            affiliate_url     = ${affiliateUrl},
            available         = true,
            updated_at        = ${new Date().toISOString()}
          WHERE id = ${ex.id}
        `;
        updated++;
        if (
          ex.price_cash !== product.price_cash ||
          ex.price_installment !== product.price_installment
        ) {
          await sql`
            INSERT INTO price_history (product_id, price_cash, price_installment)
            VALUES (${ex.id}, ${product.price_cash}, ${product.price_installment})
          `;
        }
      } else {
        const [newProduct] = await sql<{ id: string }[]>`
          INSERT INTO products (
            external_id, source, url, category, brand, model, title,
            specs, upgradeable, price_cash, price_installment,
            installment_count, installment_info, currency,
            image_url, images, available, stock, affiliate_url
          ) VALUES (
            ${product.external_id}, ${product.source}, ${product.url},
            ${product.category}, ${product.brand}, ${product.model}, ${product.title},
            ${sql.json(product.specs as never)}, ${sql.json(product.upgradeable as never)},
            ${product.price_cash}, ${product.price_installment},
            ${product.installment_count}, ${product.installment_info}, ${product.currency},
            ${product.image_url}, ${product.images}::text[], ${product.available},
            ${product.stock}, ${affiliateUrl}
          )
          RETURNING id
        `;
        inserted++;
        if (newProduct) {
          await sql`
            INSERT INTO price_history (product_id, price_cash, price_installment)
            VALUES (${newProduct.id}, ${product.price_cash}, ${product.price_installment})
          `;
        }
      }
    } catch (err) {
      console.error(`  Error en ${product.external_id}:`, err);
    }
  }

  // Mark products no longer found as unavailable
  for (const [extId, prod] of Array.from(existingMap.entries())) {
    if (!incomingIds.has(extId) && prod.available) {
      await sql`UPDATE products SET available = false WHERE id = ${prod.id}`;
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

main()
  .catch((err) => {
    console.error("\nError en sync:", err.message);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
