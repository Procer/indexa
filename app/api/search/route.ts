import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  extractSlotsAndExpand,
  getGuidingQuestions,
  getInlineQuestions,
  isInputSufficient,
} from "@/lib/llm/slotFilling";
import { expandQuery, generateQueryEmbedding } from "@/lib/llm/queryExpansion";
import { enrichWithAnalysis } from "@/lib/llm/productAnalysis";
import { hybridSearch } from "@/lib/search/hybridSearch";
import { buildRankedPool } from "@/lib/search/pipeline";
import {
  deleteBackgroundCache,
  deletePrelimCache,
  getAlsoAtCache,
  getBackgroundCache,
  getPrelimCache,
  getStructuredCache,
  getStructuredPoolCache,
  setAlsoAtCache,
  setBackgroundCache,
  setPoolCache,
  setPrelimCache,
  setStructuredCache,
  setStructuredPoolCache,
} from "@/lib/search/cache";
import {
  getActiveSponsoredPlacements,
  getProductIdsByCategory,
  getProductsByIds,
  saveSearch,
  updateProductAnalysis,
} from "@/lib/db/queries";
import { buildQuickSelectionReason, explainProductSpecs, explainProductSpecsSimple } from "@/lib/domain/specExplainer";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { detectBrandMention } from "@/lib/domain/detectBrand";
import { detectProcessorMention } from "@/lib/domain/detectProcessor";
import { detectTagUseCase } from "@/lib/domain/detectUseCase";
import type {
  EnrichedProduct,
  PhoneTechnicalFilters,
  SearchResponse,
  SlotPreferences,
  Slots,
  TechnicalFilters,
} from "@/types";

// El chat guiado manda el input acumulado como texto (categoría + uso +
// presupuesto concatenados) y pide re-extraer TODO de nuevo en cada turno —
// gpt-4o-mini a veces "olvida" un dato ya confirmado en una vuelta anterior
// (visto en vivo: pierde el use_case "gaming" al agregar el presupuesto,
// incluso con temperature: 0 — no es 100% determinístico). Como este flujo es
// aditivo (el usuario solo agrega información, nunca contradice lo anterior),
// se completan acá los huecos con lo último ya confirmado en vez de confiar
// en que el LLM lo vuelva a extraer bien cada vez — nunca pisa un valor que
// la extracción actual sí trajo, solo rellena lo que vino vacío.
//
// preferences/technical_filters/phone_filters ANTES no pasaban por este
// relleno de huecos (solo category/use_cases/presupuesto) — un `...fresh` a
// secas los reemplazaba enteros, así que una preferencia ya confirmada
// (marca, procesador puntual, RAM mínima, etc.) que la extracción de este
// turno no volviera a mencionar desaparecía en silencio (bug reportado en
// vivo: "busco por otra cosa y pierde lo que ya había dicho"). Mismo criterio
// de relleno de huecos, campo por campo.
function mergeKnownSlots(fresh: Slots, known: Partial<Slots> | undefined): Slots {
  if (!known) return fresh;
  // El presupuesto son 2 campos mutuamente excluyentes (cuota vs. contado) —
  // si la extracción de este turno trajo CUALQUIERA de los dos, es una
  // lectura nueva y coherente, se respeta entera. Solo se completa con lo
  // viejo si esta vuelta no trajo presupuesto en absoluto (mismo criterio que
  // hasBudget en isInputSufficient/getGuidingQuestions).
  const freshHasBudget = !!(fresh.budget_monthly_ars || fresh.budget_cash_ars);

  const knownPrefs = known.preferences;
  const preferences: SlotPreferences = {
    os: fresh.preferences.os !== "any" ? fresh.preferences.os : knownPrefs?.os ?? "any",
    brands_preferred:
      fresh.preferences.brands_preferred.length > 0 ? fresh.preferences.brands_preferred : knownPrefs?.brands_preferred ?? [],
    brands_excluded:
      fresh.preferences.brands_excluded.length > 0 ? fresh.preferences.brands_excluded : knownPrefs?.brands_excluded ?? [],
    portability: fresh.preferences.portability !== "any" ? fresh.preferences.portability : knownPrefs?.portability ?? "any",
    screen_size: fresh.preferences.screen_size !== "any" ? fresh.preferences.screen_size : knownPrefs?.screen_size ?? "any",
    processor_model_preferred: fresh.preferences.processor_model_preferred ?? knownPrefs?.processor_model_preferred ?? null,
  };

  const knownTech = known.technical_filters;
  const technical_filters: TechnicalFilters = {
    min_ram_gb: fresh.technical_filters.min_ram_gb ?? knownTech?.min_ram_gb ?? null,
    storage_type: fresh.technical_filters.storage_type ?? knownTech?.storage_type ?? null,
    gpu_required: fresh.technical_filters.gpu_required || (knownTech?.gpu_required ?? false),
  };

  const knownPhone = known.phone_filters;
  const phone_filters: PhoneTechnicalFilters = {
    min_ram_gb: fresh.phone_filters.min_ram_gb ?? knownPhone?.min_ram_gb ?? null,
    min_storage_gb: fresh.phone_filters.min_storage_gb ?? knownPhone?.min_storage_gb ?? null,
    min_camera_mp: fresh.phone_filters.min_camera_mp ?? knownPhone?.min_camera_mp ?? null,
    require_5g: fresh.phone_filters.require_5g || (knownPhone?.require_5g ?? false),
    require_nfc: fresh.phone_filters.require_nfc || (knownPhone?.require_nfc ?? false),
    os: fresh.phone_filters.os ?? knownPhone?.os ?? null,
  };

  return {
    ...fresh,
    category: fresh.category ?? known.category ?? null,
    use_cases: fresh.use_cases.length > 0 ? fresh.use_cases : known.use_cases ?? [],
    budget_monthly_ars: freshHasBudget ? fresh.budget_monthly_ars : known.budget_monthly_ars ?? null,
    budget_cash_ars: freshHasBudget ? fresh.budget_cash_ars : known.budget_cash_ars ?? null,
    budget_cash_min_ars: freshHasBudget ? fresh.budget_cash_min_ars : known.budget_cash_min_ars ?? null,
    budget_installment_count: freshHasBudget ? fresh.budget_installment_count : known.budget_installment_count ?? null,
    preferences,
    technical_filters,
    phone_filters,
  };
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const { success } = await checkRateLimit("search", getClientIp(request), 10, 60);
    if (!success) {
      return NextResponse.json({ error: "Demasiadas consultas, esperá un momento" }, { status: 429 });
    }

    const body = (await request.json()) as {
      input: string;
      sessionId?: string;
      refinements?: string[];
      knownSlots?: Partial<Slots>;
    };

    const { input, sessionId, refinements, knownSlots } = body;

    if (!input?.trim()) {
      return NextResponse.json({ error: "Input requerido" }, { status: 400 });
    }

    // 1. Slot-filling + query expansion en una sola llamada LLM.
    //    Sponsoreds se prefetchea en paralelo ya que es independiente.
    const [{ slots: freshSlots, expandedQuery: rawExpandedQuery }, sponsoredPlacements] =
      await Promise.all([
        extractSlotsAndExpand(input, refinements),
        getActiveSponsoredPlacements(),
      ]);

    // Respaldo determinístico: el LLM de slot-filling a veces no extrae una
    // marca mencionada explícitamente a preferences.brands_preferred, incluso
    // con la regla explícita en el prompt (mismo tipo de inconsistencia ya
    // documentada para use_cases/budget — no es 100% determinístico ni con
    // temperature: 0). Bug reproducido en vivo: el chat detectó "Apple" y
    // armó "celular Apple hasta $110.000" correctamente, pero esta llamada
    // no la extrajo, así que la búsqueda salió sin brand preference y el
    // chat terminó diciendo que no había ninguna Apple. Se revisa acá con
    // detección por palabras clave, sin depender de una segunda llamada LLM.
    const brandSearchText = [input, ...(refinements ?? [])].join(" ");
    const mentionedBrand = detectBrandMention(brandSearchText);
    if (
      mentionedBrand &&
      !freshSlots.preferences.brands_preferred.some((b) => b.toLowerCase() === mentionedBrand.toLowerCase())
    ) {
      freshSlots.preferences.brands_preferred = [...freshSlots.preferences.brands_preferred, mentionedBrand];
    }

    // Mismo respaldo determinístico que la marca, pero para la respuesta de un
    // botón curado de uso (ej. "🎮 Juegos" en celular) — bug reproducido en
    // vivo: clickear "Juegos" a veces no se traducía a gaming_mobile, y como
    // era el PRIMER intento (sin knownSlots.use_cases previo para rellenar el
    // hueco), el chat volvía a preguntar lo mismo en loop hasta que el LLM
    // acertaba por pura suerte en un click posterior. Solo se aplica si la
    // extracción fresca vino vacía, para no pisar algo que el LLM sí infirió.
    if (freshSlots.use_cases.length === 0) {
      const detectedUseCase = detectTagUseCase(brandSearchText, freshSlots.category);
      if (detectedUseCase) {
        freshSlots.use_cases = [detectedUseCase];
      }
    }

    // Mismo respaldo determinístico que la marca, pero para el procesador
    // puntual — el slot-filling no extrae "i7"/"Ryzen 7" a
    // preferences.processor_model_preferred de forma confiable (ni con
    // temperature: 0), así que un pedido de procesador que llega vía refinement
    // desde el chat ("notebook con procesador i7 hasta ...") podía salir sin
    // preferencia y no disparar el camino needsWidePool + transparencia
    // out_of_budget del pipeline. Solo rellena el hueco, no pisa lo que el LLM
    // sí extrajo.
    if (!freshSlots.preferences.processor_model_preferred) {
      const mentionedProcessor = detectProcessorMention(brandSearchText);
      if (mentionedProcessor) {
        freshSlots.preferences.processor_model_preferred = mentionedProcessor;
      }
    }

    const slots = mergeKnownSlots(freshSlots, knownSlots);

    // Campos que antes no salían en la línea [SEARCH] y hacían falta para
    // depurar "pedí i7 / un refinement y no sé si lo tomó" (mismo hueco que ya
    // se había tapado para marca con brandDebug, más abajo).
    const reqDebug =
      ` refinements=${JSON.stringify(refinements ?? [])}` +
      (slots.preferences.processor_model_preferred
        ? ` procPreferred=${JSON.stringify(slots.preferences.processor_model_preferred)}`
        : "");

    // 2. Check input sufficiency
    if (!isInputSufficient(slots)) {
      // Siempre prefetch de candidatos por categoría (cobertura máxima).
      if (sessionId && slots.category) {
        getProductIdsByCategory(slots.category)
          .then((ids) => setPrelimCache(sessionId, ids))
          .catch(() => {});
      }

      // Si ya tenemos use_cases Y expanded_query, disparar búsqueda interna en background.
      // El resultado se guarda en Redis y se usa cuando llegue el presupuesto del usuario.
      // Esto hace que la búsqueda final sea casi instantánea (solo aplica el filtro de budget).
      if (sessionId && slots.use_cases.length > 0 && rawExpandedQuery) {
        const bgSlots = slots; // sin budget — queremos el pool sin restricción de precio
        const bgQuery = rawExpandedQuery;
        const bgSessionId = sessionId;
        (async () => {
          try {
            const bgEmbedding = await generateQueryEmbedding(bgQuery);
            const bgResults = await hybridSearch({
              queryEmbedding: bgEmbedding,
              slots: { ...bgSlots, budget_monthly_ars: null, budget_cash_ars: null },
              limit: 100,
              offset: 0,
              queryText: input,
            });
            const bgIds = bgResults.slice(0, 40).map((r) => r.id);
            await setBackgroundCache(bgSessionId, bgIds);
          } catch {}
        })();
      }

      console.log(
        `[SEARCH] needs_info input=${JSON.stringify(input.slice(0, 200))} category=${slots.category ?? "-"} ` +
          `use_cases=${JSON.stringify(slots.use_cases)} hasBudget=${!!(slots.budget_monthly_ars || slots.budget_cash_ars)} ` +
          `durationMs=${Date.now() - startedAt}${reqDebug}`
      );
      const response: SearchResponse = {
        type: "needs_info",
        questions: getGuidingQuestions(slots),
        slots,
      };
      return NextResponse.json(response);
    }

    // 3. Expanded query: usar la del LLM combinado, o generar si vino null
    const expandedQuery = rawExpandedQuery ?? (await expandQuery(slots));

    // 4. Embedding
    const queryEmbedding = await generateQueryEmbedding(expandedQuery);

    // 5. Caché estructurado por (category, use_cases, budget_tier)
    const cachedIds = await getStructuredCache(slots);
    if (cachedIds && cachedIds.length > 0) {
      const cachedProducts = await getProductsByIds(cachedIds);
      const shareToken = randomBytes(8).toString("hex");
      // El caché estructurado solo guarda IDs, no also_at (se calculó en la búsqueda
      // en vivo que lo generó) — se recupera acá desde el caché por producto.
      const alsoAtByProduct = await Promise.all(cachedProducts.map((p) => getAlsoAtCache(p.id)));
      const enrichedCached: EnrichedProduct[] = cachedProducts.map((p, i) => ({
        ...p,
        similarity: 0,
        final_score: Math.max(0, 1 - i * 0.05),
        selection_reason: buildQuickSelectionReason(p.category, p.specs, slots.use_cases, p.title),
        spec_highlights: explainProductSpecs(p.category, p.specs, slots.use_cases, p.title),
        spec_highlights_simple: explainProductSpecsSimple(p.category, p.specs, slots.use_cases, p.title),
        upgrade_note: null,
        analysis_from_cache: true,
        also_at: alsoAtByProduct[i] ?? undefined,
      }));
      saveSearch({
        rawInput: input,
        slots,
        expandedQuery,
        queryEmbedding,
        resultIds: cachedIds,
        sessionId: sessionId ?? null,
        shareToken,
      }).catch(() => {});

      // Pool completo: reusa el guardado bajo la misma clave estructurada
      // (lo dejó la búsqueda original que llenó este caché) para conocer el
      // total real sin recalcular nada. Si ya expiró (edge case, mismo TTL
      // que el caché de arriba), se re-deriva una sola vez con el
      // queryEmbedding ya calculado — no es una llamada a LLM de más.
      let poolIds = await getStructuredPoolCache(slots);
      if (!poolIds || poolIds.length === 0) {
        const merged = await buildRankedPool({ queryEmbedding, slots, sponsoredPlacements, queryText: input });
        poolIds = merged.map((p) => p.id);
        setStructuredPoolCache(slots, poolIds).catch(() => {});
      }
      setPoolCache(shareToken, poolIds).catch(() => {});

      const response: SearchResponse = {
        type: "results",
        products: enrichedCached,
        inline_questions: getInlineQuestions(slots),
        total_count: poolIds.length,
        share_token: shareToken,
        search_id: shareToken,
        from_cache: true,
        slots,
      };
      console.log(
        `[SEARCH] results input=${JSON.stringify(input.slice(0, 200))} category=${slots.category ?? "-"} ` +
          `count=${enrichedCached.length} totalPool=${poolIds.length} fromCache=true durationMs=${Date.now() - startedAt}${reqDebug}`
      );
      return NextResponse.json(response);
    }

    // 6. Stage 1: Hybrid search — SQL filters + vector sort, pool de 200 candidatos.
    //    Prioridad de candidatos (de más a menos targetteado):
    //    1. Background cache: candidatos pre-buscados con use_cases del usuario (sin budget)
    //    2. Prelim cache: todos los productos de esa categoría
    //    3. Sin cache: scan completo de la tabla
    let candidateIds: string[] | undefined;
    if (sessionId) {
      const bgIds = await getBackgroundCache(sessionId);
      if (bgIds && bgIds.length > 0) {
        candidateIds = bgIds;
        deleteBackgroundCache(sessionId).catch(() => {});
      } else {
        const prelim = await getPrelimCache(sessionId);
        if (prelim && prelim.length > 0) {
          candidateIds = prelim;
          deletePrelimCache(sessionId).catch(() => {});
        }
      }
    }

    // 7. Pool rankeado: SQL+vectorial → scoring → dedupe (also_at) → filtro de
    //    accesorios → re-rank por specs (ver lib/search/pipeline.ts).
    const merged = await buildRankedPool({ queryEmbedding, slots, candidateIds, sponsoredPlacements, queryText: input });

    // Keep top 20 after re-ranking for LLM enrichment
    const mergedProducts = merged.slice(0, 20);

    // 9. Enrich with LLM analysis
    const enrichedResults = await enrichWithAnalysis(mergedProducts, slots);

    // Persistir also_at por producto (non-blocking) — así sobrevive a un reload
    // de /search/[token] o a un futuro hit del caché estructurado, que traen los
    // productos directo de la DB sin volver a correr el agrupado por dedupe key.
    for (const p of enrichedResults) {
      if (p.also_at && p.also_at.length > 0) {
        setAlsoAtCache(p.id, p.also_at).catch(() => {});
      }
    }

    // Persist new analyses (non-blocking)
    for (const p of enrichedResults) {
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

    // 11. Guardar en caché estructurado + pool completo (para paginación) +
    //     persistir búsqueda (todo non-blocking).
    const shareToken = randomBytes(8).toString("hex");
    setStructuredCache(slots, enrichedResults.map((p) => p.id)).catch(() => {});
    setStructuredPoolCache(slots, merged.map((p) => p.id)).catch(() => {});
    setPoolCache(shareToken, merged.map((p) => p.id)).catch(() => {});
    saveSearch({
      rawInput: input,
      slots,
      expandedQuery,
      queryEmbedding,
      resultIds: enrichedResults.map((p) => p.id),
      sessionId: sessionId ?? null,
      shareToken,
    }).catch(() => {});

    const response: SearchResponse = {
      type: "results",
      products: enrichedResults,
      inline_questions: getInlineQuestions(slots),
      total_count: merged.length,
      share_token: shareToken,
      search_id: shareToken,
      from_cache: false,
      slots,
    };

    const brandDebug =
      slots.preferences.brands_preferred.length > 0
        ? ` brandsPreferred=${JSON.stringify(slots.preferences.brands_preferred)} brandMatchesLoaded=${JSON.stringify(
            enrichedResults
              .filter((p) => p.brand && slots.preferences.brands_preferred.some((b) => p.brand!.toLowerCase().includes(b.toLowerCase())))
              .map((p) => `${p.title}${p.out_of_budget ? `[${p.out_of_budget}]` : ""}`)
          )}`
        : "";
    console.log(
      `[SEARCH] results input=${JSON.stringify(input.slice(0, 200))} category=${slots.category ?? "-"} ` +
        `count=${enrichedResults.length} totalPool=${merged.length} fromCache=false durationMs=${Date.now() - startedAt}${reqDebug}${brandDebug}`
    );
    return NextResponse.json(response);
  } catch (error) {
    console.error("[POST /api/search]", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
