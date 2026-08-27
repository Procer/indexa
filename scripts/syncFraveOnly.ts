/**
 * Sincronización multi-tienda: Frávega + Cetrogar + Musimundo + Garbarino + Compumundo.
 * Sin MercadoLibre — solo fuentes con APIs públicas reales (VTEX + GraphQL).
 *
 * - Inserta productos nuevos / actualiza precio e imagen de existentes
 * - Marca como no disponibles los productos desaparecidos por tienda
 * - Corre generateEmbeddings al final para los productos nuevos
 */

import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import {
  fetchFraveNotebooks,
  fetchFraveDesktops,
  fetchFravePhones,
  fetchFraveTablets,
  fetchFraveTVs,
} from "@/lib/sources/fravega";
import {
  fetchCetrogarNotebooks,
  fetchCetrogarDesktops,
  fetchCetrogarPhones,
  fetchCetrogarTablets,
  fetchCetrogarTVs,
} from "@/lib/sources/cetrogar";
import {
  fetchMusimundoNotebooks,
  fetchMusimundoDesktops,
  fetchMusimundoPhones,
  fetchMusimundoTablets,
  fetchMusimundoTVs,
} from "@/lib/sources/musimundo";
import {
  fetchGarbarinoNotebooks,
  fetchGarbarinoDesktops,
  fetchGarbarinoPhones,
  fetchGarbarinoTablets,
  fetchGarbarinoTVs,
} from "@/lib/sources/garbarino";
import {
  fetchCompumundoNotebooks,
  fetchCompumundoDesktops,
  fetchCompumundoPhones,
  fetchCompumundoTablets,
  fetchCompumundoTVs,
} from "@/lib/sources/compumundo";
import {
  fetchMegatoneNotebooks,
  fetchMegatoneDesktops,
  fetchMegatonePhones,
  fetchMegatoneTablets,
  fetchMegatoneTVs,
  closeMegatoneBrowser,
} from "@/lib/sources/playwright/megatone";
import {
  fetchCoppelNotebooks,
  fetchCoppelDesktops,
  fetchCoppelPhones,
  fetchCoppelTablets,
  fetchCoppelTVs,
} from "@/lib/sources/coppel";
import {
  fetchNaldoNotebooks,
  fetchNaldoDesktops,
  fetchNaldoPhones,
  fetchNaldoTablets,
  fetchNaldoTVs,
} from "@/lib/sources/naldo";
import {
  fetchJumboNotebooks,
  fetchJumboDesktops,
  fetchJumboPhones,
  fetchJumboTablets,
  fetchJumboTVs,
} from "@/lib/sources/jumbo";
import {
  fetchCarrefourNotebooks,
  fetchCarrefourDesktops,
  fetchCarrefourPhones,
  fetchCarrefourTablets,
  fetchCarrefourTVs,
} from "@/lib/sources/carrefour";
import {
  fetchOnCityNotebooks,
  fetchOnCityDesktops,
  fetchOnCityPhones,
  fetchOnCityTablets,
  fetchOnCityTVs,
} from "@/lib/sources/oncity";
import {
  fetchDiscoNotebooks,
  fetchDiscoDesktops,
  fetchDiscoPhones,
  fetchDiscoTablets,
  fetchDiscoTVs,
} from "@/lib/sources/disco";
import {
  fetchVeaNotebooks,
  fetchVeaDesktops,
  fetchVeaPhones,
  fetchVeaTablets,
  fetchVeaTVs,
} from "@/lib/sources/vea";
import {
  fetchChangomasNotebooks,
  fetchChangomasDesktops,
  fetchChangomasPhones,
  fetchChangomasTablets,
  fetchChangomasTVs,
} from "@/lib/sources/changomas";
import {
  fetchPardoNotebooks,
  fetchPardoDesktops,
  fetchPardoPhones,
  fetchPardoTablets,
  fetchPardoTVs,
} from "@/lib/sources/pardo";
import { notifyTelegram } from "@/lib/notify/telegram";
import { isLikelyAccessory } from "@/lib/domain/accessoryFilter";
import type { ProductSpecs, ProductSource, ProductCategory, Upgradeable } from "@/types";

// Si una fuente trae 0 productos es casi siempre porque la tienda cambió su
// sitio/API y el scraper dejó de funcionar, no porque no tenga stock — avisa
// para no depender de que alguien note el sitio desactualizado a ojo.
async function warnIfEmpty(source: string, count: number): Promise<void> {
  if (count > 0) return;
  console.warn(`  ⚠ ${source} trajo 0 productos — posible scraper roto`);
  await notifyTelegram(`⚠️ Sync ${source}: 0 productos encontrados. Puede que el sitio haya cambiado y el scraper dejó de funcionar.`);
}

// Corre una tienda de forma aislada: si falla (ej. la tienda tiene una caída
// puntual de DNS/API), no debe tirar abajo el sync de las demás tiendas.
// Devuelve cuántos productos nuevos insertó (0 si falló).
async function runStore(
  name: string,
  source: string,
  fetchAll: (llmStats: { calls: number }) => Promise<SyncProduct[]>,
  llmStats: { calls: number }
): Promise<number> {
  console.log(`\n── ${name} ──────────────────────────────────────`);
  try {
    const fetched = await fetchAll(llmStats);
    const products = fetched.filter((p) => !isLikelyAccessory(p.title));
    console.log(`  Total: ${products.length} productos`);
    if (products.length < fetched.length) {
      console.log(`  descartados ${fetched.length - products.length} accesorios/no-dispositivos por título`);
    }
    await warnIfEmpty(name, products.length);
    const stats = await upsertProducts(products, source);
    console.log(`  +${stats.inserted} nuevos | ~${stats.updated} actualizados | -${stats.deactivated} desactivados`);
    return stats.inserted;
  } catch (err) {
    console.warn(`  ⚠ ${name} falló: ${(err as Error).message ?? err}`);
    await notifyTelegram(`⚠️ Sync ${name} falló: ${(err as Error).message ?? err}`);
    return 0;
  }
}

// Node 20 no trae WebSocket nativo (recién en Node 22); supabase-js igual
// instancia un RealtimeClient al crear el cliente aunque este script nunca
// use realtime, así que sin esto tira "Node.js 20 detected without native
// WebSocket support" apenas se llama a createClient.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws as unknown as WebSocketLikeConstructor } }
);

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

// ─── Config ────────────────────────────────────────────────────────────────────

const LIMITS = {
  fravega:    { notebooks: 80, desktops: 40, phones: 80, tablets: 60, tvs: 60 },
  cetrogar:   { notebooks: 60, desktops: 30, phones: 60, tablets: 40, tvs: 40 },
  musimundo:  { notebooks: 60, desktops: 30, phones: 60, tablets: 40, tvs: 40 },
  garbarino:  { notebooks: 60, desktops: 30, phones: 60, tablets: 40, tvs: 40 },
  compumundo: { notebooks: 60, desktops: 30, phones: 40, tablets: 30, tvs: 30 },
  megatone:   { notebooks: 40, desktops: 20, phones: 40, tablets: 20, tvs: 20 },
  coppel:     { notebooks: 60, desktops: 30, phones: 60, tablets: 40, tvs: 40 },
  naldo:      { notebooks: 60, desktops: 30, phones: 60, tablets: 40, tvs: 40 },
  jumbo:      { notebooks: 40, desktops: 20, phones: 40, tablets: 30, tvs: 40 },
  carrefour:  { notebooks: 60, desktops: 30, phones: 60, tablets: 40, tvs: 40 },
  oncity:     { notebooks: 60, desktops: 30, phones: 40, tablets: 30, tvs: 40 },
  disco:      { notebooks: 40, desktops: 20, phones: 30, tablets: 20, tvs: 30 },
  vea:        { notebooks: 40, desktops: 20, phones: 30, tablets: 20, tvs: 30 },
  changomas:  { notebooks: 40, desktops: 20, phones: 30, tablets: 20, tvs: 30 },
  pardo:      { notebooks: 40, desktops: 20, phones: 30, tablets: 20, tvs: 30 },
};

// ─── DB upsert ────────────────────────────────────────────────────────────────

async function upsertProducts(products: SyncProduct[], source: string) {
  // Defensa contra duplicados dentro del mismo batch: si el mismo producto
  // aparece más de una vez en `products` (ej. un mismo item matcheado tanto
  // por la búsqueda "notebook" como por "smart tv" en un origen VTEX), el
  // chequeo de existencia de abajo usa un snapshot tomado una sola vez al
  // principio, así que TODAS las apariciones se verían como "nuevas" e
  // insertarían filas separadas para el mismo external_id. Nos quedamos con
  // la primera aparición y avisamos — visto en producción con un Smart TV de
  // Coppel duplicado con specs de notebook.
  const seenIds = new Set<string>();
  const dedupedProducts: SyncProduct[] = [];
  let duplicatesInBatch = 0;
  for (const p of products) {
    if (seenIds.has(p.external_id)) { duplicatesInBatch++; continue; }
    seenIds.add(p.external_id);
    dedupedProducts.push(p);
  }
  if (duplicatesInBatch > 0) {
    console.warn(`  ⚠ ${duplicatesInBatch} producto(s) duplicado(s) dentro del mismo batch de ${source} (mismo external_id, distinta categoría de búsqueda) — se descartó la repetición`);
  }
  products = dedupedProducts;

  const { data: existing, error: fetchErr } = await supabase
    .from("products")
    .select("id, external_id, available, price_cash, price_installment")
    .eq("source", source);

  if (fetchErr) throw new Error(`DB fetch error (${source}): ${fetchErr.message}`);

  const existingMap = new Map(
    (existing ?? []).map((p) => [
      p.external_id as string,
      p as {
        id: string;
        external_id: string;
        available: boolean;
        price_cash: number | null;
        price_installment: number | null;
      },
    ])
  );

  const incomingIds = new Set(products.map((p) => p.external_id));
  let inserted = 0;
  let updated = 0;
  let deactivated = 0;
  const errors: string[] = [];

  for (const product of products) {
    const ex = existingMap.get(product.external_id);

    if (ex) {
      const { error } = await supabase
        .from("products")
        .update({
          price_cash: product.price_cash,
          price_installment: product.price_installment,
          installment_count: product.installment_count,
          installment_info: product.installment_info,
          image_url: product.image_url,
          images: product.images,
          url: product.url,
          available: product.available,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ex.id);

      if (error) {
        errors.push(`Update ${product.external_id}: ${error.message}`);
      } else {
        updated++;
        // Solo registrar en el historial si el precio realmente cambió.
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
        .insert(product)
        .select("id")
        .single();

      if (error) {
        errors.push(`Insert ${product.external_id}: ${error.message}`);
      } else {
        inserted++;
        if (newProduct) {
          await supabase.from("price_history").insert({
            product_id: newProduct.id,
            price_cash: product.price_cash,
            price_installment: product.price_installment,
          });
        }
      }
    }
  }

  for (const [extId, prod] of Array.from(existingMap.entries())) {
    if (!incomingIds.has(extId) && prod.available) {
      await supabase
        .from("products")
        .update({ available: false, updated_at: new Date().toISOString() })
        .eq("id", prod.id);
      deactivated++;
    }
  }

  if (errors.length) {
    console.warn(`  ⚠ ${errors.length} errores en ${source}:`);
    errors.slice(0, 5).forEach((e) => console.warn(`    ${e}`));
  }

  return { inserted, updated, deactivated };
}

async function deleteMercadoLibre() {
  const { error, count } = await supabase
    .from("products")
    .delete()
    .eq("source", "mercadolibre");

  if (error) console.warn(`  ⚠ No se pudo eliminar ML: ${error.message}`);
  return count ?? 0;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== TechSearch — Sync: Frávega + Cetrogar + Musimundo + Garbarino + Compumundo + Coppel + Naldo + Jumbo + Carrefour + On City + Megatone ===\n");

  const llmStats = { calls: 0 };
  let totalInserted = 0;

  totalInserted += await runStore("Frávega", "fravega", async (s) => [
    ...await fetchFraveNotebooks(LIMITS.fravega.notebooks, s),
    ...await fetchFraveDesktops(LIMITS.fravega.desktops, s),
    ...await fetchFravePhones(LIMITS.fravega.phones, s),
    ...await fetchFraveTablets(LIMITS.fravega.tablets, s),
    ...await fetchFraveTVs(LIMITS.fravega.tvs, s),
  ] as SyncProduct[], llmStats);

  totalInserted += await runStore("Cetrogar", "cetrogar", async (s) => [
    ...await fetchCetrogarNotebooks(LIMITS.cetrogar.notebooks, s),
    ...await fetchCetrogarDesktops(LIMITS.cetrogar.desktops, s),
    ...await fetchCetrogarPhones(LIMITS.cetrogar.phones, s),
    ...await fetchCetrogarTablets(LIMITS.cetrogar.tablets, s),
    ...await fetchCetrogarTVs(LIMITS.cetrogar.tvs, s),
  ] as SyncProduct[], llmStats);

  // Musimundo pausado (sesión 2026-07-27): www.musimundo.com está "en
  // mantenimiento" — el backend VTEX (musimundo.vtexcommercestable.com.br)
  // sigue respondiendo, así que si se deja este bloque el sync reactiva
  // productos cuyo link real no funciona. Los 177 productos ya se marcaron
  // available=false a mano. Reactivar cuando vuelva su sitio, descomentando esto:
  //
  // totalInserted += await runStore("Musimundo", "musimundo", async (s) => [
  //   ...await fetchMusimundoNotebooks(LIMITS.musimundo.notebooks, s),
  //   ...await fetchMusimundoDesktops(LIMITS.musimundo.desktops, s),
  //   ...await fetchMusimundoPhones(LIMITS.musimundo.phones, s),
  //   ...await fetchMusimundoTablets(LIMITS.musimundo.tablets, s),
  //   ...await fetchMusimundoTVs(LIMITS.musimundo.tvs, s),
  // ] as SyncProduct[], llmStats);

  // Garbarino pausado (sesión 2026-07-29): www.garbarino.com dejó de resolver
  // por DNS (NXDOMAIN, tanto .com como .com.ar) — el sitio parece dado de baja.
  // Reactivar cuando vuelva a resolver, descomentando esto:
  //
  // totalInserted += await runStore("Garbarino", "garbarino", async (s) => [
  //   ...await fetchGarbarinoNotebooks(LIMITS.garbarino.notebooks, s),
  //   ...await fetchGarbarinoDesktops(LIMITS.garbarino.desktops, s),
  //   ...await fetchGarbarinoPhones(LIMITS.garbarino.phones, s),
  //   ...await fetchGarbarinoTablets(LIMITS.garbarino.tablets, s),
  //   ...await fetchGarbarinoTVs(LIMITS.garbarino.tvs, s),
  // ] as SyncProduct[], llmStats);

  // Compumundo pausado (sesión 2026-07-29): www.compumundo.com.ar ya no es la
  // tienda VTEX — ahora sirve un blog de WordPress sin catálogo ni API de
  // productos. El endpoint viejo redirige (301) al home en HTML, por eso
  // fallaba con "Unexpected token '<'". Reactivar si vuelve a ser tienda:
  //
  // totalInserted += await runStore("Compumundo", "compumundo", async (s) => [
  //   ...await fetchCompumundoNotebooks(LIMITS.compumundo.notebooks, s),
  //   ...await fetchCompumundoDesktops(LIMITS.compumundo.desktops, s),
  //   ...await fetchCompumundoPhones(LIMITS.compumundo.phones, s),
  //   ...await fetchCompumundoTablets(LIMITS.compumundo.tablets, s),
  //   ...await fetchCompumundoTVs(LIMITS.compumundo.tvs, s),
  // ] as SyncProduct[], llmStats);

  totalInserted += await runStore("Coppel", "coppel", async (s) => [
    ...await fetchCoppelNotebooks(LIMITS.coppel.notebooks, s),
    ...await fetchCoppelDesktops(LIMITS.coppel.desktops, s),
    ...await fetchCoppelPhones(LIMITS.coppel.phones, s),
    ...await fetchCoppelTablets(LIMITS.coppel.tablets, s),
    ...await fetchCoppelTVs(LIMITS.coppel.tvs, s),
  ] as SyncProduct[], llmStats);

  totalInserted += await runStore("Naldo", "naldo", async (s) => [
    ...await fetchNaldoNotebooks(LIMITS.naldo.notebooks, s),
    ...await fetchNaldoDesktops(LIMITS.naldo.desktops, s),
    ...await fetchNaldoPhones(LIMITS.naldo.phones, s),
    ...await fetchNaldoTablets(LIMITS.naldo.tablets, s),
    ...await fetchNaldoTVs(LIMITS.naldo.tvs, s),
  ] as SyncProduct[], llmStats);

  totalInserted += await runStore("Jumbo", "jumbo", async (s) => [
    ...await fetchJumboNotebooks(LIMITS.jumbo.notebooks, s),
    ...await fetchJumboDesktops(LIMITS.jumbo.desktops, s),
    ...await fetchJumboPhones(LIMITS.jumbo.phones, s),
    ...await fetchJumboTablets(LIMITS.jumbo.tablets, s),
    ...await fetchJumboTVs(LIMITS.jumbo.tvs, s),
  ] as SyncProduct[], llmStats);

  totalInserted += await runStore("Carrefour", "carrefour", async (s) => [
    ...await fetchCarrefourNotebooks(LIMITS.carrefour.notebooks, s),
    ...await fetchCarrefourDesktops(LIMITS.carrefour.desktops, s),
    ...await fetchCarrefourPhones(LIMITS.carrefour.phones, s),
    ...await fetchCarrefourTablets(LIMITS.carrefour.tablets, s),
    ...await fetchCarrefourTVs(LIMITS.carrefour.tvs, s),
  ] as SyncProduct[], llmStats);

  totalInserted += await runStore("On City", "oncity", async (s) => [
    ...await fetchOnCityNotebooks(LIMITS.oncity.notebooks, s),
    ...await fetchOnCityDesktops(LIMITS.oncity.desktops, s),
    ...await fetchOnCityPhones(LIMITS.oncity.phones, s),
    ...await fetchOnCityTablets(LIMITS.oncity.tablets, s),
    ...await fetchOnCityTVs(LIMITS.oncity.tvs, s),
  ] as SyncProduct[], llmStats);

  totalInserted += await runStore("Disco", "disco", async (s) => [
    ...await fetchDiscoNotebooks(LIMITS.disco.notebooks, s),
    ...await fetchDiscoDesktops(LIMITS.disco.desktops, s),
    ...await fetchDiscoPhones(LIMITS.disco.phones, s),
    ...await fetchDiscoTablets(LIMITS.disco.tablets, s),
    ...await fetchDiscoTVs(LIMITS.disco.tvs, s),
  ] as SyncProduct[], llmStats);

  totalInserted += await runStore("Vea", "vea", async (s) => [
    ...await fetchVeaNotebooks(LIMITS.vea.notebooks, s),
    ...await fetchVeaDesktops(LIMITS.vea.desktops, s),
    ...await fetchVeaPhones(LIMITS.vea.phones, s),
    ...await fetchVeaTablets(LIMITS.vea.tablets, s),
    ...await fetchVeaTVs(LIMITS.vea.tvs, s),
  ] as SyncProduct[], llmStats);

  totalInserted += await runStore("Changomas", "changomas", async (s) => [
    ...await fetchChangomasNotebooks(LIMITS.changomas.notebooks, s),
    ...await fetchChangomasDesktops(LIMITS.changomas.desktops, s),
    ...await fetchChangomasPhones(LIMITS.changomas.phones, s),
    ...await fetchChangomasTablets(LIMITS.changomas.tablets, s),
    ...await fetchChangomasTVs(LIMITS.changomas.tvs, s),
  ] as SyncProduct[], llmStats);

  totalInserted += await runStore("Pardo Hogar", "pardo", async (s) => [
    ...await fetchPardoNotebooks(LIMITS.pardo.notebooks, s),
    ...await fetchPardoDesktops(LIMITS.pardo.desktops, s),
    ...await fetchPardoPhones(LIMITS.pardo.phones, s),
    ...await fetchPardoTablets(LIMITS.pardo.tablets, s),
    ...await fetchPardoTVs(LIMITS.pardo.tvs, s),
  ] as SyncProduct[], llmStats);

  // ── Megatone (Playwright) ─────────────────────────────────────────────────
  console.log("\n── Megatone ──────────────────────────────────────");
  try {
    const megatoneProducts = [
      ...await fetchMegatoneNotebooks(LIMITS.megatone.notebooks, llmStats),
      ...await fetchMegatoneDesktops(LIMITS.megatone.desktops, llmStats),
      ...await fetchMegatonePhones(LIMITS.megatone.phones, llmStats),
      ...await fetchMegatoneTablets(LIMITS.megatone.tablets, llmStats),
      ...await fetchMegatoneTVs(LIMITS.megatone.tvs, llmStats),
    ];
    console.log(`  Total: ${megatoneProducts.length} productos`);
    await warnIfEmpty("Megatone", megatoneProducts.length);
    if (megatoneProducts.length > 0) {
      const megatoneStats = await upsertProducts(megatoneProducts as SyncProduct[], "megatone");
      console.log(`  +${megatoneStats.inserted} nuevos | ~${megatoneStats.updated} actualizados | -${megatoneStats.deactivated} desactivados`);
      totalInserted += megatoneStats.inserted;
    }
  } catch (err) {
    console.warn(`  ⚠ Megatone falló: ${(err as Error).message ?? err}`);
    await notifyTelegram(`⚠️ Sync Megatone falló: ${(err as Error).message ?? err}`);
  } finally {
    await closeMegatoneBrowser();
  }

  // ── Eliminar MercadoLibre ─────────────────────────────────────────────────
  console.log("\nEliminando productos de MercadoLibre...");
  const mlDeleted = await deleteMercadoLibre();
  if (mlDeleted > 0) console.log(`  ${mlDeleted} productos ML eliminados`);

  // ── Resumen ────────────────────────────────────────────────────────────────
  console.log(`\n${llmStats.calls} llamadas LLM para normalización de specs`);

  if (totalInserted > 0) {
    console.log("\nGenerando embeddings para productos nuevos...");
    const { execSync } = await import("child_process");
    execSync("npm run embed", { stdio: "inherit" });
  }

  console.log("\n✓ Sync completado.");
}

main().catch(async (err) => {
  console.error("\nError en sync:", err.message ?? err);
  await notifyTelegram(`🔴 Sync (Frávega+Cetrogar+Musimundo+Garbarino+Compumundo+Coppel+Naldo+Jumbo+Carrefour+OnCity+Disco+Vea+Changomas+Megatone) falló completo: ${err.message ?? err}`);
  process.exit(1);
});
