import { NextRequest, NextResponse } from "next/server";
import { getProductsByIds } from "@/lib/db/queries";
import { supabase } from "@/lib/db/supabase";
import { isLikelySameProduct } from "@/lib/domain/dedupe";
import type { ProductStoreVariant } from "@/types";

// A diferencia de `also_at` (calculado solo cuando dos variantes del mismo
// producto caen dentro del pool rankeado de una búsqueda puntual, ver
// lib/search/pipeline.ts), esto busca contra TODO el catálogo disponible de
// la misma categoría/marca cada vez que el usuario toca el botón — así el
// botón siempre puede buscar, no depende de que el duplicado haya tenido
// buena suerte de ranking en esa búsqueda particular.
//
// Match combinado specs+título (ver lib/domain/dedupe.ts para el porqué:
// ni el título exacto solo ni las specs solas funcionaban bien en la
// práctica contra el catálogo real).
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [product] = await getProductsByIds([params.id]);
    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const { data: candidates, error } = await supabase
      .from("products")
      .select("id, title, brand, category, specs, source, price_cash, price_installment, installment_count, url, affiliate_url")
      .eq("category", product.category)
      .ilike("brand", product.brand ?? "")
      .eq("available", true)
      .neq("id", product.id)
      .limit(300);

    if (error) throw error;

    const variants: ProductStoreVariant[] = (candidates ?? [])
      .filter((c) => isLikelySameProduct(product, c))
      .map((c) => ({
        source: c.source,
        price_cash: c.price_cash,
        price_installment: c.price_installment,
        installment_count: c.installment_count,
        url: c.url,
        affiliate_url: c.affiliate_url,
      }))
      .sort((a, b) => (a.price_cash ?? Infinity) - (b.price_cash ?? Infinity));

    return NextResponse.json({ variants });
  } catch (error) {
    console.error("[GET /api/products/[id]/other-stores]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
