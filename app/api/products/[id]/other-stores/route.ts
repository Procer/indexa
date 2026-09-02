import { NextRequest, NextResponse } from "next/server";
import { getProductsByIds } from "@/lib/db/queries";
import { sql } from "@/lib/db/sql";
import { findSimilarMatch, isLikelySameProduct } from "@/lib/domain/dedupe";
import type { ProductSource, ProductStoreVariant, SimilarStoreVariant } from "@/types";

interface OtherStoreCandidate {
  id: string;
  title: string;
  brand: string | null;
  category: string;
  specs: unknown;
  source: ProductSource;
  price_cash: number | null;
  price_installment: number | null;
  installment_count: number | null;
  url: string;
  affiliate_url: string | null;
}

// A diferencia de `also_at` (calculado solo cuando dos variantes del mismo
// producto caen dentro del pool rankeado de una búsqueda puntual, ver
// lib/search/pipeline.ts), esto busca contra TODO el catálogo disponible de
// la misma categoría/marca cada vez que el usuario toca el botón — así el
// botón siempre puede buscar, no depende de que el duplicado haya tenido
// buena suerte de ranking en esa búsqueda particular.
//
// Devuelve dos listas separadas:
//  - `variants`: el MISMO SKU en otra tienda (isLikelySameProduct — match
//    estricto, misma capacidad/chip/cámara). La UI compara precio de igual a
//    igual y marca "más barato".
//  - `similar`: la MISMA línea/modelo con una diferencia menor de specs
//    (findSimilarMatch — ej. 256GB vs 512GB, "Pro" vs "Pro+"). La UI la muestra
//    aparte, con las diferencias explícitas y sin juicio de "más barato".
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [product] = await getProductsByIds([params.id]);
    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const candidates = await sql<OtherStoreCandidate[]>`
      SELECT id, title, brand, category, specs, source,
             price_cash, price_installment, installment_count, url, affiliate_url
      FROM products
      WHERE category = ${product.category}
        AND brand ILIKE ${product.brand ?? ""}
        AND available = true
        AND id <> ${product.id}::uuid
      LIMIT 300
    `;

    const variants: ProductStoreVariant[] = [];
    const similar: SimilarStoreVariant[] = [];

    for (const c of candidates) {
      if (isLikelySameProduct(product, c)) {
        variants.push({
          source: c.source,
          price_cash: c.price_cash,
          price_installment: c.price_installment,
          installment_count: c.installment_count,
          url: c.url,
          affiliate_url: c.affiliate_url,
        });
        continue;
      }
      const match = findSimilarMatch(product, c);
      if (match) {
        similar.push({
          id: c.id,
          source: c.source,
          title: c.title,
          differences: match.differences,
          price_cash: c.price_cash,
          price_installment: c.price_installment,
          installment_count: c.installment_count,
          url: c.url,
          affiliate_url: c.affiliate_url,
        });
      }
    }

    variants.sort((a, b) => (a.price_cash ?? Infinity) - (b.price_cash ?? Infinity));
    similar.sort((a, b) => (a.price_cash ?? Infinity) - (b.price_cash ?? Infinity));

    return NextResponse.json({ variants, similar });
  } catch (error) {
    console.error("[GET /api/products/[id]/other-stores]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
