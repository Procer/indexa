import { getActiveSponsoredPlacements, getProductsByBrand, getProductsBySpec, getProductsByIds, getSearchPipelineInputs } from "@/lib/db/queries";
import { getPoolCache, setPoolCache } from "@/lib/search/cache";
import { hybridSearch } from "@/lib/search/hybridSearch";
import { scoreResults } from "@/lib/search/scorer";
import { getRequiredSpecs, TIER_RANK } from "@/lib/domain/usageToSpecs";
import { buildDedupeKey } from "@/lib/domain/dedupe";
import type { NotebookSpecs, Product, Slots, SponsoredPlacement } from "@/types";

export const ACCESSORY_KEYWORDS = /\b(mochila|funda|bolso|bolsa|mouse|teclado|auricular|parlante|cable|adaptador|hub|soporte|pad|mousepad|cargador|fuente|cuaderno|batería externa|cooler|ventilador|limpiador|kit de limpieza|escritorio|silla|mueble|biblioteca|estante|rack de|mesa|armario|cajonera|archivero|repisa|librería|organizador|base para|kit de|powerbank|reloj|smart\s*watch)\b/i;

// A pedido explícito del usuario: Celeron/Pentium/Athlon (la gama de entrada
// más floja de Intel/AMD) nunca se recomiendan en notebook/desktop, sin
// importar presupuesto o uso — el piso mínimo aceptable es i3/Ryzen 3. No es
// una cuestión de "processor_tier bajo alcanza para uso básico" (eso sigue
// siendo válido para i3/Ryzen 3 de entrada): es una exclusión dura sobre
// estas familias puntuales de chip.
const WEAK_PROCESSOR_RE = /celeron|pentium|athlon/i;

// La marca preferida (slots.preferences.brands_preferred) no forma parte de
// expanded_query (ver prompts.ts) ni de los filtros SQL de hybridSearch (solo
// brands_excluded llega ahí) — sin priorizarla acá, pedir una marca puntual
// por chat/búsqueda no tenía ningún efecto sobre el ranking (bug reportado:
// "pido Motorola/Dell y me sigue mostrando lo mismo", ver más abajo).

// Profundidad del pool rankeado. Antes se cortaba a 20 solo porque era lo que
// se necesitaba para la página 1 (6 resultados) — se sube a 60 para poder
// paginar ("cargar más" en /api/search/[token]/more) sin volver a llamar a
// hybridSearch: dedupe/filtro de accesorios/re-rank son puros JS/SQL, sin
// costo de LLM, así que profundizar el pool acá es barato.
export const RANKED_POOL_SIZE = 60;

export type RankedProduct = Product & {
  similarity: number;
  final_score: number;
  out_of_budget?: "above" | "below" | null;
};

// Arma el pool ordenado y filtrado de productos para una búsqueda: SQL +
// vectorial (200 candidatos) → scoring → recorte a RANKED_POOL_SIZE → datos
// completos → dedupe (agrupando variantes de otras tiendas en also_at) →
// filtro de accesorios → re-rank por specs. Devuelve el array final SIN
// cortar a 6 — eso lo decide quien llame (página 1 en /api/search, página
// N+1 en /api/search/[token]/more).
export async function buildRankedPool(params: {
  queryEmbedding: number[];
  slots: Slots;
  candidateIds?: string[];
  sponsoredPlacements: SponsoredPlacement[];
  queryText?: string;
}): Promise<RankedProduct[]> {
  const { queryEmbedding, slots, candidateIds, sponsoredPlacements, queryText } = params;

  const rawResults = await hybridSearch({
    queryEmbedding,
    slots,
    limit: 200,
    offset: 0,
    candidateIds,
    queryText,
  });

  const scoredResults = scoreResults(rawResults, sponsoredPlacements);

  // Con marca preferida o piso de presupuesto, el corte a RANKED_POOL_SIZE se
  // hace DESPUÉS de resolver full products (boost/filtro), no antes — si no,
  // un producto que calificaría rankeó fuera del top 60 por pura similitud
  // semántica (ni la marca ni el piso de precio influyen ahí) y nunca
  // llegaría a tener la chance de entrar.
  const preferredBrands = slots.preferences.brands_preferred.map((b) => b.toLowerCase());
  const hasBrandPreference = preferredBrands.length > 0;
  const preferredProcessor = slots.preferences.processor_model_preferred;
  const hasProcessorPreference = !!preferredProcessor;
  const minCash = slots.budget_cash_min_ars;
  const needsWidePool = hasBrandPreference || hasProcessorPreference || minCash != null;
  const pageResults = needsWidePool ? scoredResults : scoredResults.slice(0, RANKED_POOL_SIZE);

  const fullProducts = await getProductsByIds(pageResults.map((p) => p.id));
  const scoreMap = new Map(pageResults.map((p) => [p.id, p]));

  let scoredProducts: RankedProduct[] = fullProducts
    // Piso del rango de presupuesto (ej. "entre 900 mil y 1,6 millones") — a
    // diferencia del techo, que ya lo filtra hybrid_search en SQL, esto es un
    // filtro duro en JS (no hay migración de la RPC para esto todavía).
    .filter((product) => minCash == null || (product.price_cash ?? 0) >= minCash)
    .map((product) => ({
      ...product,
      similarity: scoreMap.get(product.id)!.similarity,
      final_score: scoreMap.get(product.id)!.final_score,
    }));

  if (needsWidePool) {
    // Prioridad dura para marca preferida, no un empujón de score: un boost
    // chico (+0.15) podía no alcanzar para meter la única marca pedida dentro
    // del top 20 entre ~50 candidatos, aunque SÍ existiera en el catálogo
    // dentro del presupuesto — bug reportado en vivo ("pedí Dell y dijo que
    // no había, pero sí había"). Ordenar primero por score y DESPUÉS por
    // match de marca (sort estable, y sin mutar el producto) deja todo lo que
    // matchea siempre antes que lo que no, manteniendo el orden por score
    // dentro de cada grupo.
    scoredProducts = scoredProducts.sort((a, b) => b.final_score - a.final_score);
    // Procesador puntual se ordena ANTES que marca (a propósito): si se piden
    // los dos a la vez, el sort de marca corre último y queda con prioridad
    // final (empate estable), mismo comportamiento que ya tenía antes cuando
    // solo existía marca.
    let processorMatchCount = 0;
    if (hasProcessorPreference) {
      const isProcessorMatch = (p: RankedProduct) => {
        const model = (p.specs as Partial<NotebookSpecs>).processor_model;
        return !!model && model.toLowerCase().includes(preferredProcessor!.toLowerCase());
      };
      scoredProducts = scoredProducts.sort((a, b) => Number(isProcessorMatch(b)) - Number(isProcessorMatch(a)));
      processorMatchCount = scoredProducts.filter(isProcessorMatch).length;
    }
    let brandMatchCount = 0;
    if (hasBrandPreference) {
      const isBrandMatch = (p: RankedProduct) => !!p.brand && preferredBrands.includes(p.brand.toLowerCase());
      scoredProducts = scoredProducts.sort((a, b) => Number(isBrandMatch(b)) - Number(isBrandMatch(a)));
      brandMatchCount = scoredProducts.filter(isBrandMatch).length;
    }
    scoredProducts = scoredProducts.slice(0, RANKED_POOL_SIZE);

    // Transparencia: si la marca o el procesador puntual pedido tienen
    // productos fuera del rango de presupuesto (por encima o por debajo), se
    // muestran igual con la etiqueta out_of_budget en vez de quedar
    // invisibles — hybrid_search ya los excluyó del pool de arriba porque el
    // filtro de precio en SQL es duro. Se insertan justo después de los
    // matches reales (dentro de presupuesto) para que sobrevivan el corte a
    // 20 de /api/search, no al final del pool de 60 (bug reportado en vivo:
    // el chat decía "no encontré ninguna Dell"/"ninguna con i7" cuando en
    // realidad había, apenas fuera del presupuesto).
    if ((hasBrandPreference || hasProcessorPreference) && slots.category) {
      const seenIds = new Set(scoredProducts.map((p) => p.id));
      const maxCash = slots.budget_cash_ars;
      // Presupuesto en cuotas: la comparación de arriba solo miraba maxCash/minCash
      // (presupuesto en efectivo) — si el usuario dio el presupuesto "por mes en
      // cuotas", maxCash quedaba null y esta transparencia nunca se activaba, por
      // más que la marca/procesador pedido sí existiera fuera de ese presupuesto
      // mensual (bug reportado en vivo: "quiero dell" con presupuesto en cuotas
      // decía que no había ninguna). Mismo criterio que la migración del filtro
      // SQL: si no hay price_installment cargado, se estima con price_cash / 12.
      const maxMonthly = slots.budget_monthly_ars;
      const isOverMonthly = (p: Product) => {
        if (maxMonthly == null) return false;
        const monthly = p.price_installment ?? (p.price_cash != null ? p.price_cash / 12 : null);
        return monthly != null && monthly > maxMonthly;
      };
      const isOutOfBudget = (p: Product) =>
        (maxCash != null && (p.price_cash ?? 0) > maxCash) ||
        (minCash != null && (p.price_cash ?? Infinity) < minCash) ||
        isOverMonthly(p);
      const tagOutOfBudget = (p: Product): "above" | "below" =>
        (maxCash != null && (p.price_cash ?? 0) > maxCash) || isOverMonthly(p) ? "above" : "below";

      // Se juntan los extras de marca y de procesador en una sola tanda antes
      // de insertar — así un producto que matchea ambos no se cuenta/inserta
      // dos veces (seenIds se actualiza entre una búsqueda y la otra).
      let outOfBudgetExtras: RankedProduct[] = [];
      if (hasBrandPreference) {
        const candidates = await getProductsByBrand(slots.category, slots.preferences.brands_preferred, 8);
        const extras = candidates
          .filter((p) => !seenIds.has(p.id) && isOutOfBudget(p))
          .slice(0, 2)
          .map((p) => ({ ...p, similarity: 0, final_score: 0, out_of_budget: tagOutOfBudget(p) }));
        extras.forEach((p) => seenIds.add(p.id));
        outOfBudgetExtras = outOfBudgetExtras.concat(extras);
      }
      if (hasProcessorPreference) {
        const candidates = await getProductsBySpec(slots.category, "processor_model", [preferredProcessor!], 8);
        const extras = candidates
          .filter((p) => !seenIds.has(p.id) && isOutOfBudget(p))
          .slice(0, 2)
          .map((p) => ({ ...p, similarity: 0, final_score: 0, out_of_budget: tagOutOfBudget(p) }));
        extras.forEach((p) => seenIds.add(p.id));
        outOfBudgetExtras = outOfBudgetExtras.concat(extras);
      }
      if (outOfBudgetExtras.length > 0) {
        const insertAt = Math.max(brandMatchCount, processorMatchCount);
        scoredProducts = [
          ...scoredProducts.slice(0, insertAt),
          ...outOfBudgetExtras,
          ...scoredProducts.slice(insertAt),
        ];
      }
    }
  }

  // Agrupar por buildDedupeKey en vez de descartar duplicados: el pool ya viene
  // ordenado por score, así que el primero de cada grupo es el de mejor score
  // y queda como "primario" — los demás se adjuntan como also_at en vez de
  // perderse, para poder mostrar "también en X desde $Y".
  const groups = new Map<string, RankedProduct[]>();
  for (const product of scoredProducts) {
    const key = buildDedupeKey(product);
    const group = groups.get(key);
    if (group) group.push(product);
    else groups.set(key, [product]);
  }

  const merged = Array.from(groups.values())
    .map((group) => {
      const [primary, ...variants] = group;
      const alsoAt = variants
        .filter((v) => v.source !== primary.source)
        .map((v) => ({
          source: v.source,
          price_cash: v.price_cash,
          price_installment: v.price_installment,
          installment_count: v.installment_count,
          url: v.url,
          affiliate_url: v.affiliate_url,
        }))
        .sort((a, b) => (a.price_cash ?? Infinity) - (b.price_cash ?? Infinity));
      return { ...primary, also_at: alsoAt.length > 0 ? alsoAt : undefined };
    })
    .filter((product) => {
      // ACCESSORY_KEYWORDS corre para TODAS las categorías — antes solo corría
      // para notebook/desktop, así que un "Reloj Smart Fit" mal categorizado
      // como category=phone en el origen pasaba sin filtro ninguno (bug
      // reportado en vivo: "apareció un reloj" buscando celulares). El resto
      // de los checks (processor_tier/WEAK_PROCESSOR_RE) siguen siendo
      // específicos de notebook/desktop, no aplican a otras categorías.
      if (ACCESSORY_KEYWORDS.test(product.title)) return false;
      if (slots.category === "notebook" || slots.category === "desktop") {
        const s = product.specs as Partial<NotebookSpecs>;
        if (s.processor_tier == null) return false;
        if (s.processor_model && WEAK_PROCESSOR_RE.test(s.processor_model)) return false;
      }
      return true;
    });

  // Re-rank: penalizar productos sobre-especificados para el uso declarado.
  // Esto evita que un i7 desplace a un i5 cuando el uso es office/multimedia.
  // La penalización es suave (no exclusión) para no eliminar la única opción dentro del presupuesto.
  const isSpecRankable =
    slots.use_cases.length > 0 &&
    (slots.category === "notebook" || slots.category === "desktop" || slots.category === null);
  if (isSpecRankable) {
    const requiredTierRank = TIER_RANK[getRequiredSpecs(slots.use_cases).processor_tier];
    // Bug real encontrado en vivo (2026-08-24): este sort corría SIN mirar
    // matchPriority, así que pisaba por completo la prioridad dura de marca/
    // procesador ya aplicada más arriba (líneas ~91-184) — un producto que
    // matcheaba la única marca pedida (ej. Samsung dentro de presupuesto)
    // podía terminar más allá del corte a 20 de /api/search si su final_score
    // semántico era bajo, y el chat/búsqueda decían "no hay" existiendo.
    // matchPriority se recalcula acá (no se reusa isBrandMatch/isProcessorMatch
    // de arriba porque son locals de ese bloque) y se usa como criterio
    // primario del sort — el score con penalización de over-spec queda como
    // desempate, igual que antes.
    const matchPriority = (p: RankedProduct): number => {
      if (!hasBrandPreference && !hasProcessorPreference) return 0;
      const brandMatch = hasBrandPreference && !!p.brand && preferredBrands.includes(p.brand.toLowerCase());
      const model = (p.specs as Partial<NotebookSpecs>).processor_model;
      const processorMatch =
        hasProcessorPreference && !!model && model.toLowerCase().includes(preferredProcessor!.toLowerCase());
      return brandMatch || processorMatch ? 1 : 0;
    };
    merged.sort((a, b) => {
      const priorityDiff = matchPriority(b) - matchPriority(a);
      if (priorityDiff !== 0) return priorityDiff;

      let sA = a.final_score;
      let sB = b.final_score;
      const tierA = (a.specs as Partial<NotebookSpecs>).processor_tier;
      const tierB = (b.specs as Partial<NotebookSpecs>).processor_tier;
      if (tierA) {
        const excess = TIER_RANK[tierA] - requiredTierRank;
        if (excess > 0) sA -= excess * 0.12;
      }
      if (tierB) {
        const excess = TIER_RANK[tierB] - requiredTierRank;
        if (excess > 0) sB -= excess * 0.12;
      }
      return sB - sA;
    });
  }

  return merged;
}

// Pool de IDs (rankeado, hasta RANKED_POOL_SIZE) para un share_token ya
// persistido — usado por /api/search/[token] y /api/search/[token]/more
// (paginación) y por /api/search/refine-chat (resumen del pool completo).
// Reusa el caché del pool si está vigente; si expiró, lo re-deriva de los
// slots/query_embedding guardados en la búsqueda (sin volver a llamar al LLM
// de expansión de query) y lo vuelve a cachear.
export async function getOrBuildPoolIds(shareToken: string): Promise<string[]> {
  const cached = await getPoolCache(shareToken);
  if (cached && cached.length > 0) return cached;

  const inputs = await getSearchPipelineInputs(shareToken);
  if (!inputs) return [];

  const sponsoredPlacements = await getActiveSponsoredPlacements();
  const merged = await buildRankedPool({ ...inputs, sponsoredPlacements });
  const ids = merged.map((p) => p.id);
  await setPoolCache(shareToken, ids);
  return ids;
}
