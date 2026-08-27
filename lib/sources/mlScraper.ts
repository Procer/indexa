/**
 * MercadoLibre scraper usando Playwright.
 * La API oficial está bloqueada por PolicyAgent; este módulo navega el sitio
 * público como un usuario real e intercepta los datos de los cards de producto.
 *
 * Datos obtenidos: título, precio, imagen thumbnail, URL real del producto.
 * Specs: se normalizan desde el título vía extractFromTitle + LLM fallback.
 */

import { chromium } from "playwright";
import {
  normalizeNotebookSpecs,
  normalizeDesktopSpecs,
} from "@/lib/normalizer/specsExtractor";
import type { Upgradeable } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MLCard {
  id: string;
  title: string;
  price: number | null;
  currency: string;
  image: string | null;
  url: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ML_BASE = "https://listado.mercadolibre.com.ar";

// Búsquedas por keyword — más precisas que navegar categorías con accesorios
const SEARCH_URLS: Record<string, string> = {
  notebook: `${ML_BASE}/notebook`,
  desktop: `${ML_BASE}/pc-de-escritorio`,
};

// Palabras clave en el título que indican que NO es una computadora
const ACCESSORY_KEYWORDS = [
  "soporte", "base para", "adaptador", "hub usb", "extensor", "mochila",
  "funda", "teclado", "mouse", "pantalla para", "cooler", "ventilador",
  "cable", "cargador", "fuente", "bateria externa", "memoria sd",
  "audifonos", "auricular", "webcam", "microfono", "parlante",
  "reparacion", "reparación", "repuesto", "repuestos", "herramientas",
  "destornillador",
];

// ─── Card extraction ──────────────────────────────────────────────────────────

function extractCards(html: string): MLCard[] {
  const cards: MLCard[] = [];

  // Match product item blocks — ML uses li.ui-search-layout__item
  const itemPattern =
    /<li[^>]*class="[^"]*ui-search-layout__item[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  let match;

  while ((match = itemPattern.exec(html)) !== null) {
    const block = match[1];

    // Extract ML item ID
    const idMatch = block.match(/MLA(\d+)/);
    if (!idMatch) continue;
    const id = `MLA${idMatch[1]}`;

    // Build product URL from ID — all hrefs are now tracking URLs
    const url = `https://articulo.mercadolibre.com.ar/MLA-${idMatch[1]}`;

    // Extract title from poly-component__title (new ML structure)
    const titlePolyMatch = block.match(/class="[^"]*poly-component__title[^"]*"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/);
    const titleAltMatch = block.match(/alt="([^"]+)"[^>]*aria-hidden="true"/);
    const title = titlePolyMatch
      ? decodeHTMLEntities(titlePolyMatch[1].trim())
      : titleAltMatch
      ? decodeHTMLEntities(titleAltMatch[1])
      : "";
    if (!title) continue;

    // Skip obvious accessories
    const titleLower = title.toLowerCase();
    if (ACCESSORY_KEYWORDS.some((kw) => titleLower.includes(kw))) continue;

    // Extract price
    let price: number | null = null;
    const priceMatch = block.match(/class="[^"]*andes-money-amount__fraction[^"]*"[^>]*>([0-9.,]+)</);
    if (priceMatch) {
      price = parseInt(priceMatch[1].replace(/[.,]/g, ""), 10) || null;
    }

    // Extract currency
    const currency = "ARS";

    // Extract image
    const imgMatch = block.match(/<img[^>]*src="([^"]*mlstatic\.com[^"]*)"[^>]*>/);
    let image = imgMatch ? imgMatch[1] : null;
    if (!image) {
      const dataMatch = block.match(/<img[^>]*data-src="([^"]*mlstatic\.com[^"]*)"[^>]*>/);
      image = dataMatch ? dataMatch[1] : null;
    }
    // Upgrade thumbnail to higher resolution
    if (image) image = image.replace(/-[A-Z]\.jpg/, "-O.jpg");

    cards.push({ id, title, price, currency, image, url });
  }

  return cards;
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// ─── Product builder ──────────────────────────────────────────────────────────

async function buildProduct(
  card: MLCard,
  category: "notebook" | "desktop",
  llmStats: { calls: number }
) {
  // No attributes from ML scraper — rely on title regex + LLM fallback
  const { specs, usedLLM } =
    category === "notebook"
      ? await normalizeNotebookSpecs(card.title, [])
      : await normalizeDesktopSpecs(card.title, []);

  if (usedLLM) llmStats.calls++;

  const upgradeable: Upgradeable =
    category === "notebook"
      ? { ram: true, storage: true, processor: false, screen: false, gpu: false }
      : { ram: true, storage: true, processor: true, screen: false, gpu: true };

  return {
    external_id: card.id,
    source: "mercadolibre" as const,
    url: card.url,
    category,
    brand: null,
    model: null,
    title: card.title,
    specs,
    upgradeable,
    price_cash: card.price,
    price_installment: null,
    installment_count: null,
    installment_info: null,
    currency: card.currency,
    image_url: card.image,
    images: card.image ? [card.image] : [],
    available: true,
    stock: null,
  };
}

// ─── Page scraper ─────────────────────────────────────────────────────────────

async function scrapePage(
  page: import("playwright").Page,
  url: string,
  attempt = 0
): Promise<MLCard[]> {
  try {
    await page.goto(url, { waitUntil: "load", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => null);

    // Detect CAPTCHA or security block
    const currentUrl = page.url();
    if (
      currentUrl.includes("captcha") ||
      currentUrl.includes("security") ||
      currentUrl.includes("blocked")
    ) {
      console.warn("  ⚠ Posible CAPTCHA/bloqueo en ML — esperando 15s...");
      await page.waitForTimeout(15000);
    }

    // Retry page.content() hasta que la página no esté navegando
    let html = "";
    for (let i = 0; i < 5; i++) {
      try { html = await page.content(); break; } catch { await page.waitForTimeout(1000); }
    }
    if (!html) return [];

    const cards = extractCards(html);

    // Si 0 cards y no agotamos reintentos, esperar y reintentar la página completa
    if (cards.length === 0 && attempt < 2) {
      console.warn(`  ⚠ 0 cards en ${url} — reintentando (${attempt + 1}/2)...`);
      await page.waitForTimeout(5000);
      return scrapePage(page, url, attempt + 1);
    }

    return cards;
  } catch {
    return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchMLItems(
  category: "notebook" | "desktop",
  max: number,
  llmStats: { calls: number }
) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--window-size=1280,800",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "es-AR",
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  // Suppress console noise
  page.on("console", () => null);

  const baseUrl = SEARCH_URLS[category];
  const products = [];
  const seenIds = new Set<string>();
  let offset = 1;
  const ML_PAGE_SIZE = 48;

  try {
    while (products.length < max) {
      // Primera página: URL base; siguientes: _Desde_{offset}_
      const url =
        offset === 1
          ? baseUrl
          : `${baseUrl}_Desde_${offset}_`;

      console.log(
        `  ML ${category} — offset ${offset} (${products.length}/${max})...`
      );

      const cards = await scrapePage(page, url);
      if (!cards.length) break;

      let newInPage = 0;
      for (const card of cards) {
        if (products.length >= max) break;
        if (seenIds.has(card.id)) continue;
        seenIds.add(card.id);
        newInPage++;

        try {
          const product = await buildProduct(card, category, llmStats);
          products.push(product);
        } catch (err) {
          console.error(`  Error procesando ${card.id}:`, err);
        }
      }

      // All cards on this page were already seen — no more unique results
      if (newInPage === 0) break;

      offset += ML_PAGE_SIZE;
      await page.waitForTimeout(1500 + Math.random() * 1000);
    }
  } finally {
    await browser.close();
  }

  return products;
}

export async function fetchMLNotebooks(
  max: number,
  llmStats: { calls: number }
) {
  console.log("  Scrapeando notebooks de ML...");
  return fetchMLItems("notebook", max, llmStats);
}

export async function fetchMLDesktops(
  max: number,
  llmStats: { calls: number }
) {
  console.log("  Scrapeando PCs de escritorio de ML...");
  return fetchMLItems("desktop", max, llmStats);
}
