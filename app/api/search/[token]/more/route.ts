import { NextRequest, NextResponse } from "next/server";
import { enrichWithAnalysis } from "@/lib/llm/productAnalysis";
import { getOrBuildPoolIds, type RankedProduct } from "@/lib/search/pipeline";
import { getAlsoAtCache, setAlsoAtCache } from "@/lib/search/cache";
import { getProductsByIds, getSearchByShareToken, updateProductAnalysis } from "@/lib/db/queries";

const BATCH_SIZE = 6;

// GET /api/search/[token]/more?offset=6 — siguiente tanda de resultados para
// el scroll infinito de /search/[token]. Reusa el pool cacheado por la
// búsqueda original (ver lib/search/pipeline.ts, getOrBuildPoolIds) cuando
// existe; si ya expiró, lo re-deriva a partir de los slots/query_embedding
// ya guardados en la búsqueda (sin volver a llamar al LLM de expansión de
// query).
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const offset = Number(request.nextUrl.searchParams.get("offset") ?? "0");
    if (!Number.isFinite(offset) || offset < 0) {
      return NextResponse.json({ error: "offset inválido" }, { status: 400 });
    }

    const search = await getSearchByShareToken(params.token);
    if (!search) {
      return NextResponse.json({ error: "Búsqueda no encontrada" }, { status: 404 });
    }

    const poolIds = await getOrBuildPoolIds(params.token);
    const batchIds = poolIds.slice(offset, offset + BATCH_SIZE);
    if (batchIds.length === 0) {
      return NextResponse.json({ products: [], hasMore: false });
    }

    const rawProducts = await getProductsByIds(batchIds);
    const alsoAtByProduct = await Promise.all(rawProducts.map((p) => getAlsoAtCache(p.id)));
    // similarity/final_score son sintéticos acá (el orden ya viene del pool
    // rankeado) — enrichWithAnalysis no los usa para nada, solo los necesita
    // presentes en el tipo.
    const batch: RankedProduct[] = rawProducts.map((p, i) => ({
      ...p,
      also_at: alsoAtByProduct[i] ?? p.also_at,
      similarity: 0,
      final_score: Math.max(0, 1 - (offset + i) * 0.01),
    }));

    const enrichedResults = await enrichWithAnalysis(batch, search.slots);

    // Mismo non-blocking persistence que /api/search (also_at + análisis nuevo).
    for (const p of enrichedResults) {
      if (p.also_at && p.also_at.length > 0) {
        setAlsoAtCache(p.id, p.also_at).catch(() => {});
      }
      if (!p.analysis_from_cache && p.quality_price_score && p.quality_price_analysis) {
        updateProductAnalysis(p.id, {
          quality_price_score: p.quality_price_score,
          quality_price_analysis: p.quality_price_analysis,
          selection_reason: p.selection_reason,
          spec_highlights: p.spec_highlights,
          spec_highlights_simple: p.spec_highlights_simple,
          upgrade_note: p.upgrade_note,
        }).catch(() => {});
      }
    }

    return NextResponse.json({
      products: enrichedResults,
      hasMore: offset + BATCH_SIZE < poolIds.length,
    });
  } catch (error) {
    console.error("[GET /api/search/[token]/more]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
