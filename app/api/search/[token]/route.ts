import { NextRequest, NextResponse } from "next/server";
import { getProductsByIds, getSearchByShareToken } from "@/lib/db/queries";
import { getAlsoAtCache } from "@/lib/search/cache";
import { getOrBuildPoolIds } from "@/lib/search/pipeline";

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const search = await getSearchByShareToken(params.token);

    if (!search) {
      return NextResponse.json(
        { error: "Búsqueda no encontrada" },
        { status: 404 }
      );
    }

    const rawProducts = await getProductsByIds(search.result_ids);
    // also_at no vive en la tabla products — se recupera del caché (ver
    // lib/search/cache.ts) para que un reload/link compartido siga mostrando
    // "también en otras tiendas" en vez de perderlo silenciosamente.
    const alsoAtByProduct = await Promise.all(rawProducts.map((p) => getAlsoAtCache(p.id)));
    const products = rawProducts.map((p, i) => ({
      ...p,
      also_at: alsoAtByProduct[i] ?? undefined,
    }));

    // Total real del pool (hasta RANKED_POOL_SIZE), no solo los ids guardados
    // en la búsqueda (que quedaron capados al primer lote enriquecido) — así
    // el header de "N resultados encontrados" no queda pegado en ese número.
    const poolIds = await getOrBuildPoolIds(params.token);
    const total_count = poolIds.length > 0 ? poolIds.length : products.length;

    return NextResponse.json({ search, products, total_count });
  } catch (error) {
    console.error("[GET /api/search/[token]]", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
