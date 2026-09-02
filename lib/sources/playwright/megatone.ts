/**
 * Megatone — Playwright scraper.
 * Megatone usa su propio CMS, sin API pública VTEX.
 *
 * Estrategia:
 * 1. Navegar a páginas de categoría paginadas
 * 2. Extraer URLs de productos del listado
 * 3. Visitar cada página de producto y extraer datos via JSON-LD → meta → CSS
 * 4. Normalizar specs via LLM (mismo normalizer que VTEX sources)
 *
 * IMPORTANTE: Si los selectores dejan de funcionar, verificar con DevTools en:
 *   https://www.megatone.net/listado/tecnologia/informatica/notebooks/
 * Las constantes SELECTORS y CATEGORY_URLS son los únicos valores que tocar.
 *
 * Actualizado 2026-07-29: el sitio migró de /Tecnologia/Computacion/Notebooks
 * (404) al esquema /listado/{departamento}/{sub}/{categoria}/. No se encontró
 * una categoría "tablets" dedicada navegando el sitio — queda con la URL
 * vieja (seguirá trayendo 0 resultados) hasta verificarla a mano.
 */

import {
  newPage,
  closeBrowser,
  retry,
  randomDelay,
  extractJsonLd,
  extractMeta,
  parseArsPrice,
} from "@/lib/sources/playwright/base";
import {
  normalizeNotebookSpecs,
  normalizeDesktopSpecs,
  normalizePhoneSpecs,
  normalizeTabletSpecs,
  normalizeTVSpecs,
} from "@/lib/normalizer/specsExtractor";
import { upgradeableFor } from "@/lib/sources/vtex";
import { normalizeMonthlyInstallment } from "@/lib/domain/installment";
import type { ProductCategory, ProductSource } from "@/types";
import { Page } from "playwright";

// ─── Configuración ─────────────────────────────────────────────────────────────
// VERIFICAR estas URLs con el sitio real antes de correr en producción.

const CATEGORY_URLS: Record<ProductCategory, string[]> = {
  notebook: [
    "https://www.megatone.net/listado/tecnologia/informatica/notebooks/",
  ],
  desktop: [
    "https://www.megatone.net/listado/tecnologia/informatica/all-in-one-pc-computadoras/",
  ],
  phone: [
    "https://www.megatone.net/listado/tecnologia/celulares/smartphones-celulares/",
  ],
  // TODO: no se encontró una categoría "tablets" dedicada al navegar el sitio
  // (2026-07-29) — verificar a mano en https://www.megatone.net/. Con esta
  // URL vieja seguirá trayendo 0 resultados.
  tablet: [
    "https://www.megatone.net/Tecnologia/Computacion/Tablets",
  ],
  tv: [
    "https://www.megatone.net/listado/tv-audio-video/tv-led-smart-tv/",
  ],
};

// Selector para links de productos en la página de listado.
// VERIFICAR: abrir DevTools en una categoría y buscar los <a href="/producto/...">
const SELECTORS = {
  // Links a productos dentro del grid de listado
  productLink: [
    'a[href*="/producto/"]',
    'a[href*="/p/"]',
    '.product-item a',
    '.grid-item a',
    '[data-testid="product-card"] a',
  ],
  // Paginación: botón "siguiente página"
  nextPage: [
    'a[aria-label="Siguiente"]',
    'a[rel="next"]',
    '.pagination__next',
    'button[class*="next"]',
  ],
  // En página de producto: precio cash
  priceCash: [
    '[class*="price-cash"]',
    '[class*="precio-cash"]',
    '[data-testid="price"]',
    '.price',
    '[class*="Price"]',
  ],
  // En página de producto: precio cuotas
  priceInstallment: [
    '[class*="installment"]',
    '[class*="cuota"]',
    '[class*="Cuota"]',
  ],
};

const _SOURCE: ProductSource = "megatone";

// ─── Extracción de datos de una página de producto ─────────────────────────────

interface ScrapedProduct {
  externalId: string;
  url: string;
  title: string;
  brand: string | null;
  priceCash: number | null;
  priceInstallment: number | null;
  installmentCount: number | null;
  installmentInfo: string | null;
  imageUrl: string | null;
  images: string[];
  available: boolean;
}

async function scrapeProductPage(page: Page, url: string): Promise<ScrapedProduct | null> {
  try {
    await retry(() => page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }), 2);
    await randomDelay(800, 1800);
  } catch {
    return null;
  }

  // 1. Intentar JSON-LD (más confiable)
  const jsonLd = await extractJsonLd(page);
  if (jsonLd?.name) {
    const offerArr = Array.isArray(jsonLd.offers) ? jsonLd.offers : jsonLd.offers ? [jsonLd.offers] : [];
    const offer = offerArr[0] ?? {};
    const price = typeof offer.price === "number" ? offer.price
      : typeof offer.price === "string" ? parseArsPrice(offer.price)
      : null;

    const brandName = typeof jsonLd.brand === "string" ? jsonLd.brand
      : jsonLd.brand?.name ?? null;

    const imgRaw = Array.isArray(jsonLd.image) ? jsonLd.image[0] : jsonLd.image;
    const imageUrl = typeof imgRaw === "string" ? imgRaw : null;

    return {
      externalId: `megatone-${jsonLd.sku ?? url.split("/").pop() ?? url}`,
      url,
      title: jsonLd.name,
      brand: brandName,
      priceCash: price,
      priceInstallment: null,
      installmentCount: null,
      installmentInfo: null,
      imageUrl,
      images: imageUrl ? [imageUrl] : [],
      available: !offer.availability || offer.availability.includes("InStock"),
    };
  }

  // 2. Fallback: OpenGraph meta tags
  const meta = await extractMeta(page);
  if (meta.title) {
    // Intentar extraer precio cash desde CSS si meta no lo tiene
    let priceCash = meta.price;
    if (!priceCash) {
      for (const sel of SELECTORS.priceCash) {
        const text = await page.$eval(sel, (el) => el.textContent ?? "").catch(() => "");
        priceCash = parseArsPrice(text);
        if (priceCash) break;
      }
    }

    const slug = url.split("/").filter(Boolean).pop() ?? url;
    return {
      externalId: `megatone-${slug}`,
      url,
      title: meta.title,
      brand: null,
      priceCash,
      priceInstallment: null,
      installmentCount: null,
      installmentInfo: null,
      imageUrl: meta.image,
      images: meta.image ? [meta.image] : [],
      available: true,
    };
  }

  return null;
}

// ─── Extracción de links de productos desde la página de listado ───────────────

async function extractProductLinks(page: Page, maxLinks: number): Promise<string[]> {
  const links = new Set<string>();

  for (const sel of SELECTORS.productLink) {
    try {
      const hrefs = await page.$$eval(sel, (els) =>
        els
          .map((el) => (el as HTMLAnchorElement).href)
          .filter((h) => h && h.startsWith("http"))
      );
      hrefs.forEach((h) => links.add(h));
      if (links.size >= maxLinks) break;
    } catch {
      continue;
    }
  }

  return Array.from(links).slice(0, maxLinks);
}

// ─── Scraper principal por categoría ──────────────────────────────────────────

async function fetchMegatoneCategory(
  category: ProductCategory,
  max: number,
  llmStats: { calls: number }
) {
  const categoryUrls = CATEGORY_URLS[category];
  const allLinks = new Set<string>();

  // Recolectar links del listado (con paginación simple)
  const listPage = await newPage();
  try {
    for (const categoryUrl of categoryUrls) {
      if (allLinks.size >= max) break;

      for (let pageNum = 1; pageNum <= 5; pageNum++) {
        if (allLinks.size >= max) break;

        const pagedUrl = pageNum === 1 ? categoryUrl : `${categoryUrl}?pagina=${pageNum}`;

        try {
          await retry(() => listPage.goto(pagedUrl, { waitUntil: "domcontentloaded", timeout: 30000 }), 2);
          await randomDelay(1000, 2000);
        } catch {
          break;
        }

        const links = await extractProductLinks(listPage, max - allLinks.size);
        if (links.length === 0) break;
        links.forEach((l) => allLinks.add(l));

        // Verificar si hay siguiente página
        let hasNext = false;
        for (const sel of SELECTORS.nextPage) {
          const btn = await listPage.$(sel);
          if (btn) { hasNext = true; break; }
        }
        if (!hasNext && pageNum > 1) break;
      }
    }
  } finally {
    await listPage.close().catch(() => {});
  }

  const links = Array.from(allLinks).slice(0, max);
  console.log(`  Megatone ${category}: ${links.length} URLs encontradas`);

  if (links.length === 0) return [];

  // Visitar cada página de producto
  const productPage = await newPage();
  const results = [];

  try {
    for (const url of links) {
      const scraped = await scrapeProductPage(productPage, url);
      if (!scraped || !scraped.title) continue;

      // Normalizar specs via LLM (mismo normalizer que VTEX)
      let specResult: { specs: import("@/types").ProductSpecs; usedLLM: boolean };
      switch (category) {
        case "notebook": specResult = await normalizeNotebookSpecs(scraped.title, []); break;
        case "desktop":  specResult = await normalizeDesktopSpecs(scraped.title, []); break;
        case "phone":    specResult = await normalizePhoneSpecs(scraped.title, []); break;
        case "tablet":   specResult = await normalizeTabletSpecs(scraped.title, []); break;
        case "tv":       specResult = await normalizeTVSpecs(scraped.title, []); break;
        default:         specResult = await normalizeNotebookSpecs(scraped.title, []);
      }
      if (specResult.usedLLM) llmStats.calls++;

      results.push({
        external_id: scraped.externalId,
        source: "megatone" as ProductSource,
        url: scraped.url,
        category,
        brand: scraped.brand,
        model: null,
        title: scraped.title,
        specs: specResult.specs,
        upgradeable: upgradeableFor(category),
        price_cash: scraped.priceCash,
        // Normalizado a cuota mensual al ingerir (jugada #13) — el parser de
        // texto de la página a veces toma el total financiado.
        price_installment: normalizeMonthlyInstallment(
          scraped.priceCash,
          scraped.priceInstallment,
          scraped.installmentCount
        ),
        installment_count: scraped.installmentCount,
        installment_info: scraped.installmentInfo,
        currency: "ARS",
        image_url: scraped.imageUrl,
        images: scraped.images,
        available: scraped.available,
        stock: null,
      });

      await randomDelay(1500, 3000);
    }
  } finally {
    await productPage.close().catch(() => {});
  }

  return results;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export async function fetchMegatoneNotebooks(max: number, llmStats: { calls: number }) {
  console.log("  Buscando notebooks en Megatone...");
  return fetchMegatoneCategory("notebook", max, llmStats);
}

export async function fetchMegatoneDesktops(max: number, llmStats: { calls: number }) {
  console.log("  Buscando PCs en Megatone...");
  return fetchMegatoneCategory("desktop", max, llmStats);
}

export async function fetchMegatonePhones(max: number, llmStats: { calls: number }) {
  console.log("  Buscando celulares en Megatone...");
  return fetchMegatoneCategory("phone", max, llmStats);
}

export async function fetchMegatoneTablets(max: number, llmStats: { calls: number }) {
  console.log("  Buscando tablets en Megatone...");
  return fetchMegatoneCategory("tablet", max, llmStats);
}

export async function fetchMegatoneTVs(max: number, llmStats: { calls: number }) {
  console.log("  Buscando Smart TVs en Megatone...");
  return fetchMegatoneCategory("tv", max, llmStats);
}

export { closeBrowser as closeMegatoneBrowser };
