import { getActiveSponsoredPlacements, getProductsByBrand, getProductsBySpec, getProductsByIds, getSearchPipelineInputs } from "@/lib/db/queries";
import { getPoolCache, setPoolCache } from "@/lib/search/cache";
import { hybridSearch } from "@/lib/search/hybridSearch";
import { scoreResults, qualityPriceBoost } from "@/lib/search/scorer";
import { getRequiredPhoneSpecs, getRequiredSpecs, TIER_RANK } from "@/lib/domain/usageToSpecs";
import { buildDedupeKey } from "@/lib/domain/dedupe";
import { estimatedMonthly } from "@/lib/domain/budgetFit";
import { specSanityPenalty } from "@/lib/domain/specSanity";
import type { NotebookSpecs, PhoneSpecs, Product, Slots, SponsoredPlacement } from "@/types";

// Nota: `(?:es|s)?` al final del grupo tolera plurales — sin eso "Parlantes"/
// "Auriculares" no matcheaban `\bparlante\b`/`\bauricular\b` (visto en vivo:
// "Parlantes 2.0 PC/Notebook" rankeaba como notebook).
// "tabla"/"esquinero"/"esquinera"/"ropero"/"placard" sumados tras encontrar en
// vivo (2026-09-11) "Tabla esquinera Orlandi" (mueble de Cetrogar) colada en
// resultados de desktop — la misma línea de muebles "Orlandi" (escritorios,
// bibliotecas, mesas rinconeras) que ya cubrían las palabras existentes, pero
// "tabla esquinera" no matcheaba ninguna.
//
// OJO con "pad" suelto: se sacó (bug real encontrado en vivo 2026-09-11) —
// como palabra completa (`\bpad\b`) matcheaba "Pad" en "Redmi Pad 2"/"Honor
// Pad 9" y excluía TODAS esas tablets del catálogo en cualquier búsqueda, no
// solo pidiendo la marca (encontrado investigando "no aparece ningún Xiaomi"
// con brandsPreferred=[Xiaomi] pero brandMatchesLoaded=[] pese a haber varios
// en presupuesto y bien rankeados). "mousepad"/"gamepad" ya están como
// palabras compuestas separadas más abajo — cubren el caso real sin el falso
// positivo (un "mousepad"/"gamepad" escrito junto nunca matcheaba `\bpad\b`
// de todos modos, por no tener espacio antes de "pad").
export const ACCESSORY_KEYWORDS = /\b(mochila|funda|bolso|bolsa|mouse|teclado|auricular|parlante|cable|adaptador|hub|soporte|mousepad|cargador|fuente|cuaderno|bater[ií]a externa|power\s*bank|cooler|ventilador|limpiador|kit de limpieza|escritorio|silla|mueble|biblioteca|estante|rack de|mesa|tabla|esquinero|esquinera|armario|ropero|placard|cajonera|archivero|repisa|librer[ií]a|organizador|base para|kit de|reloj|smart\s*watch|smart\s*band|pulsera inteligente|vidrio templado|templado|protector de pantalla|mica|carcasa|estuche|case|manos libres|micro\s?sd|tarjeta de memoria|tr[ií]pode|gimbal|estabilizador|palo selfie|selfie stick|a(?:ro|nillo) de luz|l[aá]mpara|difusor|juguete|joystick|gamepad|bandolera|ri[ñn]onera|calza|remera|pantal[oó]n|zapatilla)(?:es|s)?\b/i;

// A pedido explícito del usuario: Celeron/Pentium/Athlon (la gama de entrada
// más floja de Intel/AMD) nunca se recomiendan en notebook/desktop, sin
// importar presupuesto o uso — el piso mínimo aceptable es i3/Ryzen 3. No es
// una cuestión de "processor_tier bajo alcanza para uso básico" (eso sigue
// siendo válido para i3/Ryzen 3 de entrada): es una exclusión dura sobre
// estas familias puntuales de chip.
const WEAK_PROCESSOR_RE = /celeron|pentium|athlon/i;

// Tablets "infantiles" ("Tablet Infantil ...", "para niños", "kids") — solo son
// la recomendación correcta si el usuario está comprando puntualmente para un
// chico. No hay un use_case "kids" en el enum (ver detectUseCase.ts: "Para mis
// hijos" queda sin mapear a propósito), así que la intención se detecta en el
// texto crudo de la búsqueda. Sin esa señal, una tablet infantil rankeando #1
// para "tablet para trabajo" es un bug (reportado en vivo 2026-08-31). Solo
// aplica a category=tablet.
const KIDS_TABLET_RE = /\binfantil(?:es)?\b|\bkids?\b|para (?:ni[ñn][oa]s?|chic[oa]s|nen[ea]s)\b/i;

// Formato puntual pedido en el texto de la búsqueda ("samsung fold", "celular
// plegable", "un flip"). No hay un slot para esto — se usa solo para que la
// transparencia de presupuesto de abajo traiga la línea correcta (ej. los Z
// Fold/Flip de $2M+) en vez de los 8 celulares más baratos de la marca.
// "plegable"/"foldable" caen a "fold" (la variante más pedida).
function detectFormFactor(queryText: string | undefined): string | null {
  if (!queryText) return null;
  if (/\bflip\b/i.test(queryText)) return "flip";
  if (/\bfold(able)?\b|\bplegable\b/i.test(queryText)) return "fold";
  return null;
}
const KIDS_INTENT_RE = /\binfantil\b|\bkids?\b|\bhij[oa]s?\b|\bnen[ea]s?\b|\bni[ñn][oa]s?\b|para (?:mi|los|las|un[ao]?) (?:hij|chic|nen|ni[ñn])/i;

// Marcas reales de tablets en el mercado AR. Una tablet de marca fuera de esta
// lista que además declara RAM altísima (>10GB) casi siempre tiene la spec
// inventada por la tienda/importador (visto en vivo: "aiprotablet 24GB RAM",
// "ATOZEE YQ10SMAX 18GB RAM", "PEICHENG 10GB" — físicamente imposible a ese
// precio; el tope real del mercado es la Galaxy Tab S9/S10 con 12GB). Se
// penaliza fuerte en el re-rank, no se excluye (puede haber una genérica
// honesta con specs bajas más abajo en la lista).
const MAINSTREAM_TABLET_BRANDS = new Set([
  "samsung", "lenovo", "xiaomi", "apple", "motorola", "huawei", "tcl",
  "nokia", "alcatel", "positivo", "philco", "hyundai", "kanji",
]);

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
  sponsored?: boolean;
};

// Boost de patrocinado (modelo tienda + rubro). Un producto sube si hay una
// colocación activa para su tienda (target_source) y su rubro (categories) y
// además es relevante para esta búsqueda (similarity >= min_relevance). Se
// resuelve acá y no en scoreResults porque hybrid_search no devuelve
// source/category. Devuelve el boost a sumar (0 si no aplica) y si el producto
// quedó marcado como patrocinado (para la etiqueta de la tarjeta).
function sponsorBoost(
  product: Product,
  similarity: number,
  placements: SponsoredPlacement[]
): { boost: number; sponsored: boolean } {
  const now = Date.now();
  for (const p of placements) {
    if (!p.active || !p.target_source) continue;
    if (p.ends_at !== null && new Date(p.ends_at).getTime() <= now) continue;
    if (p.target_source.toLowerCase() !== (product.source ?? "").toLowerCase()) continue;
    if (p.categories.length > 0 && !p.categories.includes(product.category as never)) continue;
    const applied = similarity >= p.min_relevance;
    console.log(
      `[SPONSOR] placement="${p.advertiser}" source=${product.source} category=${product.category} ` +
        `product=${product.id} similarity=${similarity.toFixed(3)} minRelevance=${p.min_relevance} ` +
        `boost=${p.score_boost} applied=${applied}`
    );
    if (applied) return { boost: p.score_boost, sponsored: true };
  }
  return { boost: 0, sponsored: false };
}

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

  const scoredResults = scoreResults(rawResults);

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
    .map((product) => {
      const similarity = scoreMap.get(product.id)!.similarity;
      const { boost, sponsored } = sponsorBoost(product, similarity, sponsoredPlacements);
      return {
        ...product,
        similarity,
        sponsored,
        // El grado de calidad/precio recién está disponible acá (getProductsByIds
        // trae el Product completo; hybrid_search/scoreResults no lo ven). Ajuste
        // acotado ±0.06 — ver qualityPriceBoost en scorer.ts. + boost de
        // patrocinado (tienda + rubro) si aplica.
        final_score:
          scoreMap.get(product.id)!.final_score +
          qualityPriceBoost(product.quality_price_score) +
          boost,
      };
    });

  // Re-ordenar con el ajuste de calidad/precio ya incorporado: en el path
  // angosto no hay otro sort garantizado antes del dedupe (los re-ranks de
  // over-spec / tablet más abajo son condicionales). Idempotente para el path
  // wide, que vuelve a ordenar por final_score enseguida.
  scoredProducts.sort((a, b) => b.final_score - a.final_score);

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
      // 20% de tolerancia antes de marcar "fuera de presupuesto" — mismo slack
      // que el filtro SQL y classifyBudgetFit (ver BUDGET_TOLERANCE en
      // budgetFit.ts): que $1.000/mes de diferencia no dispare el badge naranja.
      const maxMonthly = slots.budget_monthly_ars;
      const isOverMonthly = (p: Product) => {
        if (maxMonthly == null) return false;
        const monthly = estimatedMonthly(p);
        return monthly != null && monthly > maxMonthly * 1.2;
      };
      const isOutOfBudget = (p: Product) =>
        (maxCash != null && (p.price_cash ?? 0) > maxCash * 1.2) ||
        (minCash != null && (p.price_cash ?? Infinity) < minCash) ||
        isOverMonthly(p);
      const tagOutOfBudget = (p: Product): "above" | "below" =>
        (maxCash != null && (p.price_cash ?? 0) > maxCash * 1.2) || isOverMonthly(p) ? "above" : "below";

      // Se juntan los extras de marca y de procesador en una sola tanda antes
      // de insertar — así un producto que matchea ambos no se cuenta/inserta
      // dos veces (seenIds se actualiza entre una búsqueda y la otra).
      const formFactor = detectFormFactor(queryText);
      let outOfBudgetExtras: RankedProduct[] = [];
      if (hasBrandPreference) {
        const candidates = await getProductsByBrand(
          slots.category,
          slots.preferences.brands_preferred,
          formFactor ? 12 : 8,
          formFactor ?? undefined
        );
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
        // Se insertan justo después de los matches reales dentro de
        // presupuesto — pero con un tope de 3: cuando TODO el pool es la marca
        // pedida (ej. "samsung fold", la marca es prácticamente un filtro
        // duro), brandMatchCount ≈ 60 y los extras quedaban al final del pool,
        // fuera del top-20 que ve la grilla y el saludo (bug: "quiero samsung
        // fold" no mostraba ningún Z Fold marcado ni lo mencionaba el chat).
        // Con el tope quedan visibles arriba, con su badge "fuera de presupuesto".
        const insertAt = Math.min(Math.max(brandMatchCount, processorMatchCount), 3);
        scoredProducts = [
          ...scoredProducts.slice(0, insertAt),
          ...outOfBudgetExtras,
          ...scoredProducts.slice(insertAt),
        ];
      }
    }
  }

  // ¿El usuario está comprando puntualmente para un chico? (texto crudo de la
  // búsqueda — el flujo guiado concatena todo: "...Tablet. Trabajo. hasta...").
  // Sin esta señal se filtran las tablets infantiles más abajo.
  const kidsIntent = KIDS_INTENT_RE.test(queryText ?? "");

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
      // Tablet infantil sin que el usuario haya pedido algo para un chico → afuera.
      if (product.category === "tablet" && !kidsIntent && KIDS_TABLET_RE.test(product.title)) {
        return false;
      }
      // Tablet no-viable para NINGÚN uso que el asistente recomiende: combos de
      // gama basura tipo "Gadnic 1GB RAM 8GB Android 7" (reportado en vivo para
      // "tablet para trabajo"). Solo excluye lo claramente muerto — valores
      // reales (no el centinela 0 de extracción fallida) y muy por debajo del
      // piso: ≤2GB RAM y ≤16GB de almacenamiento a la vez. Lo apenas flojo se
      // penaliza más abajo (tabletJunkPenalty), no se excluye.
      if (product.category === "tablet") {
        const s = product.specs as { ram_gb?: number; storage_gb?: number };
        if (
          typeof s.ram_gb === "number" && s.ram_gb > 0 && s.ram_gb <= 2 &&
          typeof s.storage_gb === "number" && s.storage_gb > 0 && s.storage_gb <= 16
        ) {
          return false;
        }
      }
      return true;
    });

  // Re-rank final: se unifica en UNA sola pasada la penalización de cada
  // categoría (antes eran 3-4 `merged.sort()` independientes y secuenciales —
  // bug real: cada sort solo mira SU propia penalización + final_score crudo,
  // así que un ajuste ya aplicado por un sort anterior (ej. over-spec de
  // notebook) se perdía en el siguiente sort si corría después, porque ese
  // comparador no lo conocía. Con category=null (pool mixto) esto sí llegaba a
  // pisar orden real). Se suman todas las penalizaciones aplicables por id y
  // se ordena una sola vez al final, con matchPriority como criterio primario
  // siempre (no solo cuando isSpecRankable).

  const requiredSpecs = getRequiredSpecs(slots.use_cases);
  const requiredTierRank = TIER_RANK[requiredSpecs.processor_tier];
  const isSpecRankable =
    slots.use_cases.length > 0 &&
    (slots.category === "notebook" || slots.category === "desktop" || slots.category === null);

  const hasTablet =
    slots.category === "tablet" || (slots.category === null && merged.some((p) => p.category === "tablet"));

  // Re-rank celular (calibración pendiente 2026-09-04): antes no existía
  // ningún ajuste de ranking por use_case para phone — PHONE_USE_CASE_SPECS
  // solo se usaba para el TEXTO de la tarjeta (specExplainer.ts), nunca para
  // ordenar. Bug reportado en vivo: "celular para fotos y videos" con
  // presupuesto holgado encabezaba con celulares de 4GB/64GB sin cámara
  // decente, porque el score era puramente semántico + calidad/precio (que
  // puede calificar EXCELENTE una gama baja *para su propio precio*, sin
  // relación con si alcanza para el uso pedido). Penaliza —no excluye— RAM/
  // almacenamiento/cámara por debajo de lo que pide el uso, proporcional al
  // déficit (mismo criterio que el over-spec de notebook: ajuste suave).
  const hasPhone =
    slots.category === "phone" || (slots.category === null && merged.some((p) => p.category === "phone"));
  const isPhoneRankable = slots.use_cases.length > 0 && hasPhone;
  const requiredPhone = isPhoneRankable ? getRequiredPhoneSpecs(slots.use_cases) : null;
  const phoneUnderSpecPenalty = (p: RankedProduct): number => {
    if (!requiredPhone || p.category !== "phone") return 0;
    const s = p.specs as Partial<PhoneSpecs>;
    let penalty = 0;
    if (typeof s.ram_gb === "number" && s.ram_gb > 0 && s.ram_gb < requiredPhone.min_ram_gb) {
      penalty += Math.min(1, (requiredPhone.min_ram_gb - s.ram_gb) / requiredPhone.min_ram_gb) * 0.25;
    }
    if (typeof s.storage_gb === "number" && s.storage_gb > 0 && s.storage_gb < requiredPhone.min_storage_gb) {
      penalty += Math.min(1, (requiredPhone.min_storage_gb - s.storage_gb) / requiredPhone.min_storage_gb) * 0.15;
    }
    if (
      requiredPhone.min_camera_mp != null &&
      typeof s.main_camera_mp === "number" &&
      s.main_camera_mp > 0 &&
      s.main_camera_mp < requiredPhone.min_camera_mp
    ) {
      penalty +=
        Math.min(1, (requiredPhone.min_camera_mp - s.main_camera_mp) / requiredPhone.min_camera_mp) * 0.15;
    }
    if (requiredPhone.prefer_large_battery && typeof s.battery_mah === "number" && s.battery_mah > 0 && s.battery_mah < 5000) {
      penalty += 0.08;
    }
    // NOTA (2026-09-10): se probó un bono por pantalla AMOLED / refresco ≥120Hz
    // para "celular juegos", pero la extracción de specs de celular llena
    // screen_type=IPS y refresh_rate_hz=60 en ~el 100% del catálogo (defaults
    // del normalizer cuando el título no los declara), y processor_model queda
    // en "Snapdragon 695" alucinado para casi todo. Cualquier re-rank de phone
    // por gama de pantalla/chip es letra muerta hasta arreglar esa extracción
    // (scripts/analyzeProducts.ts / normalizePhoneSpecs).
    return penalty;
  };

  const tabletJunkPenalty = (p: RankedProduct): number => {
    if (!hasTablet || p.category !== "tablet") return 0;
    let penalty = 0;
    const s = p.specs as { ram_gb?: number; storage_gb?: number; os?: string };
    const ram = s.ram_gb;
    const storage = s.storage_gb;
    const brand = (p.brand ?? "").toLowerCase();
    if (typeof ram === "number" && ram > 10 && !MAINSTREAM_TABLET_BRANDS.has(brand)) penalty += 0.3;
    if (!kidsIntent && KIDS_TABLET_RE.test(p.title)) penalty += 0.3;
    // Gama muy floja para uso real: poca RAM, poco almacenamiento, o Android
    // viejo (≤9, sin updates de seguridad y con apps que ya no instalan). No
    // se excluye —puede ser lo único en un presupuesto de piso— pero se
    // hunde para que no encabece un pedido de "tablet para trabajo".
    if (typeof ram === "number" && ram > 0 && ram <= 2) penalty += 0.35;
    if (typeof storage === "number" && storage > 0 && storage <= 16) penalty += 0.2;
    // Android viejo — el campo `os` normalizado no es confiable (una Gadnic
    // "Android 7" del título quedó con os="Android 14"), así que se mira
    // también el título.
    const osMajor = parseInt(
      (s.os ?? "").match(/android\s*(\d{1,2})/i)?.[1] ??
        p.title.match(/android\s*(\d{1,2})/i)?.[1] ??
        "",
      10
    );
    if (!Number.isNaN(osMajor) && osMajor <= 9) penalty += 0.2;
    return penalty;
  };

  const notebookOverSpecPenalty = (p: RankedProduct): number => {
    if (!isSpecRankable) return 0;
    const tier = (p.specs as Partial<NotebookSpecs>).processor_tier;
    if (!tier) return 0;
    const excess = TIER_RANK[tier] - requiredTierRank;
    return excess > 0 ? excess * 0.12 : 0;
  };

  // Falta de GPU dedicada cuando el uso la EXIGE (gaming, diseño gráfico,
  // edición de foto/video pro, CAD/3D — ver USE_CASE_SPECS.gpu en
  // usageToSpecs.ts). Antes el re-rank de notebook solo miraba el tier de
  // procesador: una notebook de integrados con "16gb" en el título le ganaba a
  // una gamer real con RTX para un pedido de "gaming" (reportado en vivo
  // 2026-09-10: Gfast Ryzen 5 / Lenovo TBook U5-225U rankeando #3-#4 sobre las
  // Lenovo LOQ RTX 3050). Hunde —no excluye— igual que el resto de los ajustes:
  // si TODO el pool en presupuesto es de integrados, la penalización es pareja
  // y el orden relativo se mantiene. Sin dato de GPU extraído → no penaliza
  // (fail open, no castigar por una extracción incompleta).
  const notebookGpuMismatchPenalty = (p: RankedProduct): number => {
    if (!isSpecRankable) return 0;
    if (requiredSpecs.gpu !== "dedicated") return 0;
    if (p.category !== "notebook" && p.category !== "desktop") return 0;
    const gpu = (p.specs as Partial<NotebookSpecs>).gpu;
    if (!gpu) return 0;
    return gpu === "dedicated" ? 0 : 0.3;
  };

  // Cordura de specs general (jugada #9): hunde —sin excluir— unidades con
  // specs físicamente inverosímiles en CUALQUIER categoría (RAM inflada por la
  // tienda, disco = RAM, pantalla fuera de rango).
  const sanityPenaltyById = new Map(
    merged.map((p) => [p.id, specSanityPenalty(p.category, p.specs, p.brand, p.price_cash).penalty])
  );

  const totalPenaltyById = new Map(
    merged.map((p) => [
      p.id,
      notebookOverSpecPenalty(p) +
        notebookGpuMismatchPenalty(p) +
        tabletJunkPenalty(p) +
        phoneUnderSpecPenalty(p) +
        (sanityPenaltyById.get(p.id) ?? 0),
    ])
  );

  // Bug real encontrado en vivo (2026-08-24): el sort de over-spec corría SIN
  // mirar matchPriority, así que pisaba por completo la prioridad dura de
  // marca/procesador ya aplicada más arriba (líneas ~91-184) — un producto que
  // matcheaba la única marca pedida podía terminar más allá del corte a 20 de
  // /api/search si su final_score semántico era bajo. matchPriority ahora es
  // SIEMPRE la clave primaria del sort final (antes solo el bloque de
  // notebook la aplicaba; tablet/sanity la ignoraban y podían volver a
  // desordenar una marca ya priorizada).
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
    const sA = a.final_score - (totalPenaltyById.get(a.id) ?? 0);
    const sB = b.final_score - (totalPenaltyById.get(b.id) ?? 0);
    return sB - sA;
  });

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
