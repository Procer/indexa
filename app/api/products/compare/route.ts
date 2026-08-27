import { NextRequest, NextResponse } from "next/server";
import { getProductsByIds } from "@/lib/db/queries";
import { getAlsoAtCache } from "@/lib/search/cache";
import { buildQuickSelectionReason, explainProductSpecs, explainProductSpecsSimple } from "@/lib/domain/specExplainer";
import type { CompareItem, ProductAnalysis } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const { productIds } = (await request.json()) as {
      productIds: string[];
    };

    if (
      !Array.isArray(productIds) ||
      productIds.length < 2 ||
      productIds.length > 5
    ) {
      return NextResponse.json(
        { error: "Se requieren entre 2 y 5 productos para comparar" },
        { status: 400 }
      );
    }

    const products = await getProductsByIds(productIds);
    // Los productos de esta ruta se traen directo por ID (no pasan por
    // buildRankedPool), así que also_at nunca se calculó para ellos — se
    // recupera del mismo caché que ya llena esa info en /api/search/[token]
    // (ver lib/search/cache.ts).
    const alsoAtByProduct = await Promise.all(products.map((p) => getAlsoAtCache(p.id)));

    const items: CompareItem[] = products.map((product, i) => {
      let analysis: ProductAnalysis | null = null;

      if (product.quality_price_score && product.quality_price_analysis) {
        analysis = {
          quality_price_score: product.quality_price_score,
          quality_price_analysis: product.quality_price_analysis,
          selection_reason: buildQuickSelectionReason(product.category, product.specs, []),
          spec_highlights: explainProductSpecs(product.category, product.specs, []),
          spec_highlights_simple: explainProductSpecsSimple(product.category, product.specs, []),
          upgrade_note: null,
        };
      }

      return { product: { ...product, also_at: alsoAtByProduct[i] ?? undefined }, analysis };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[POST /api/products/compare]", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
