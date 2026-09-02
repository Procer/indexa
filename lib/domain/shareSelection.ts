// Resumen de texto plano para compartir una o varias opciones (WhatsApp /
// portapapeles / navigator.share). Por opción: nombre, specs clave en lenguaje
// corto, precio contado + cuotas, y el link de compra. Determinístico, sin LLM.

import { formatPrice, storeName } from "@/lib/domain/productDisplay";
import { shortSpecValues } from "@/lib/domain/specExplainer";
import type { ProductCategory, ProductSpecs } from "@/types";

// Subconjunto estructural que cubren tanto EnrichedProduct (barra de selección)
// como AlternativeProduct (tarjeta de resultado).
export interface ShareableProduct {
  brand: string | null;
  title: string;
  category: ProductCategory;
  specs?: ProductSpecs;
  price_cash: number | null;
  price_installment: number | null;
  installment_count?: number | null;
  source: string;
  url: string;
  affiliate_url: string | null;
}

const SPEC_ORDER = ["rapidez", "memoria", "almacenamiento", "cámara", "batería"];

function priceLine(p: ShareableProduct): string | null {
  const cuotas =
    p.price_installment && p.installment_count
      ? `${formatPrice(p.price_installment)}/mes en ${p.installment_count} ${p.installment_count === 1 ? "cuota" : "cuotas"}`
      : null;
  if (p.price_cash) return `${formatPrice(p.price_cash)} contado${cuotas ? ` — ${cuotas}` : ""}`;
  return cuotas;
}

function block(p: ShareableProduct, prefix: string): string {
  const lines: string[] = [`${prefix}${p.brand ? `${p.brand} ` : ""}${p.title}`];

  const values = p.specs ? shortSpecValues(p.category, p.specs, p.title) : {};
  const specStr = SPEC_ORDER.map((k) => values[k]).filter(Boolean).join(" · ");
  if (specStr) lines.push(specStr);

  const price = priceLine(p);
  if (price) lines.push(price);

  lines.push(`Comprar en ${storeName(p.source)}: ${p.affiliate_url ?? p.url}`);
  return lines.join("\n");
}

export function buildSelectionShareText(products: ShareableProduct[]): string {
  if (products.length === 1) {
    return `Mirá esta opción que encontré en indexa:\n\n${block(products[0], "")}`;
  }
  const blocks = products.map((p, i) => block(p, `${i + 1}. `));
  return `Mirá estas ${products.length} opciones que encontré en indexa:\n\n${blocks.join("\n\n")}`;
}
