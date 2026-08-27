/**
 * Utilidades compartidas para scrapers Playwright.
 *
 * Diseño:
 * - Un único Browser por run de scraper (no abrir/cerrar por producto)
 * - Stealth básico: user agent real, viewport estándar, block de recursos innecesarios
 * - Rate limiting: delay aleatorio entre páginas
 * - Retry automático para páginas que fallan
 *
 * Para agregar un scraper nuevo:
 * 1. Crear `lib/sources/playwright/{tienda}.ts`
 * 2. Implementar la interfaz ScraperConfig o usar extractFromPage() directamente
 * 3. Exportar fetchTiendaCategory() equivalente a las VTEX sources
 */

import { chromium, Browser, Page } from "playwright";

// ─── Browser singleton ─────────────────────────────────────────────────────────

let _browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!_browser || !_browser.isConnected()) {
    _browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });
  }
  return _browser;
}

export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}

// ─── Page factory ──────────────────────────────────────────────────────────────

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
];

export async function newPage(): Promise<Page> {
  const browser = await getBrowser();
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  const page = await browser.newPage({
    userAgent: ua,
    viewport: { width: 1440, height: 900 },
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
  });

  // Bloquear recursos innecesarios para acelerar el scraping
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (["font", "media", "websocket"].includes(type)) {
      route.abort().catch(() => {});
    } else {
      route.continue().catch(() => {});
    }
  });

  // Ocultar webdriver flag
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  return page;
}

// ─── Timing ────────────────────────────────────────────────────────────────────

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function randomDelay(minMs = 1500, maxMs = 3500): Promise<void> {
  return delay(minMs + Math.random() * (maxMs - minMs));
}

// ─── Retry ─────────────────────────────────────────────────────────────────────

export async function retry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 2000
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await delay(delayMs * (i + 1));
    }
  }
  throw lastErr;
}

// ─── Schema.org JSON-LD extraction ────────────────────────────────────────────

export interface JsonLdProduct {
  name?: string;
  description?: string;
  sku?: string;
  brand?: { name?: string } | string;
  image?: string | string[];
  url?: string;
  offers?: {
    price?: number | string;
    priceCurrency?: string;
    availability?: string;
  } | Array<{
    price?: number | string;
    priceCurrency?: string;
    availability?: string;
  }>;
}

export async function extractJsonLd(page: Page): Promise<JsonLdProduct | null> {
  try {
    const scripts = await page.$$eval(
      'script[type="application/ld+json"]',
      (els) => els.map((el) => el.textContent ?? "")
    );

    for (const text of scripts) {
      try {
        const parsed = JSON.parse(text) as unknown;
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          const obj = item as Record<string, unknown>;
          if (obj["@type"] === "Product" || obj["@type"] === "IndividualProduct") {
            return obj as unknown as JsonLdProduct;
          }
          // Graph: buscar dentro de @graph
          if (Array.isArray(obj["@graph"])) {
            const graphItem = (obj["@graph"] as Record<string, unknown>[]).find(
              (g) => g["@type"] === "Product"
            );
            if (graphItem) return graphItem as unknown as JsonLdProduct;
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // page may have been closed
  }
  return null;
}

// ─── OpenGraph / meta extraction ───────────────────────────────────────────────

export async function extractMeta(page: Page): Promise<{
  title: string | null;
  image: string | null;
  price: number | null;
}> {
  try {
    const [title, image, priceStr] = await Promise.all([
      page.$eval('meta[property="og:title"]', (el) => el.getAttribute("content")).catch(() => null),
      page.$eval('meta[property="og:image"]', (el) => el.getAttribute("content")).catch(() => null),
      page.$eval(
        'meta[property="product:price:amount"], meta[property="og:price:amount"]',
        (el) => el.getAttribute("content")
      ).catch(() => null),
    ]);

    const price = priceStr ? parseFloat(priceStr.replace(/[.,]/g, (m) => (m === "." ? "" : "."))) : null;

    return { title, image, price: isNaN(price ?? NaN) ? null : price };
  } catch {
    return { title: null, image: null, price: null };
  }
}

// ─── Price parsing ─────────────────────────────────────────────────────────────

export function parseArsPrice(text: string | null | undefined): number | null {
  if (!text) return null;
  // "$1.234.567" o "1234567" o "1.234,56"
  const cleaned = text
    .replace(/[^\d.,]/g, "")
    .replace(/\.(?=\d{3})/g, "")  // separador de miles con punto
    .replace(",", ".");             // coma decimal → punto
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// ─── Pagination helper ─────────────────────────────────────────────────────────

/**
 * Navega a todas las páginas de una URL paginada y acumula resultados.
 * La función `scraper` se llama en cada página y devuelve un array de items.
 * Se detiene cuando `scraper` devuelve [] o cuando se llega a `maxPages`.
 */
export async function paginateScraper<T>(
  startUrl: string,
  scraper: (page: Page, currentUrl: string) => Promise<T[]>,
  options: {
    maxPages?: number;
    nextPageSelector?: string;
    pageUrlTemplate?: (page: number) => string;
    delayMs?: [number, number];
  } = {}
): Promise<T[]> {
  const {
    maxPages = 10,
    nextPageSelector,
    pageUrlTemplate,
    delayMs = [1500, 3500],
  } = options;

  const page = await newPage();
  const all: T[] = [];

  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const url = pageUrlTemplate ? pageUrlTemplate(pageNum) : startUrl;

      if (pageNum === 1) {
        await retry(() => page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 }));
      } else if (pageUrlTemplate) {
        await retry(() => page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }));
      } else if (nextPageSelector) {
        const nextBtn = await page.$(nextPageSelector);
        if (!nextBtn) break;
        await nextBtn.click();
        await page.waitForLoadState("domcontentloaded");
      } else {
        break;
      }

      await delay(delayMs[0] + Math.random() * (delayMs[1] - delayMs[0]));

      const items = await scraper(page, page.url());
      if (items.length === 0) break;
      all.push(...items);
    }
  } finally {
    await page.close().catch(() => {});
  }

  return all;
}
