"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LogoBrand } from "@/components/LogoBrand";
import { Portal } from "@/components/Portal";
import { SyncSearchesModal } from "@/components/SyncSearchesModal";
import { BudgetPicker } from "@/components/BudgetPicker";
import { DiscoverySections } from "@/components/DiscoverySections";
import { GuidedSearchChat } from "@/components/GuidedSearchChat";
import { ProductDetailPanel } from "@/components/ProductDetailPanel";
import { RecommendedProductsGrid } from "@/components/RecommendedProductsGrid";
import { RankedResultsList } from "@/components/RankedResultsList";
import { ResultsFilterBar } from "@/components/ResultsFilterBar";
import { SortDropdown } from "@/components/SortDropdown";
import { AllResultsModal } from "@/components/AllResultsModal";
import { CompareExperience, ChatFAB } from "@/components/CompareExperience";
import { Footer } from "@/components/Footer";
import { saveSearch as saveSearchLocally, getResultsViewPref, saveResultsViewPref, type ResultsView } from "@/lib/storage/localStorage";
import { buildQuickSelectionReason, explainProductSpecs, explainProductSpecsSimple, formatUseCasesLabel } from "@/lib/domain/specExplainer";
import { getUpgradeNote } from "@/lib/domain/upgradeability";
import { buildSelectionShareText } from "@/lib/domain/shareSelection";
import { formatArs } from "@/lib/domain/budgetTiers";
import { HOME_SEED_PHRASE, HOME_SEED_QUESTION } from "@/lib/domain/homeSeed";
import { detectCategoryLocally } from "@/lib/domain/detectCategory";
import { withBasePath } from "@/lib/basePath";
import { getOrCreateVisitId } from "@/lib/analytics/visit";
import { trackEvent } from "@/lib/analytics/track";
import { reportError } from "@/lib/analytics/reportError";
import type {
  AlternativeProduct,
  EnrichedProduct,
  GuidingQuestion,
  Product,
  ProductCategory,
  SearchResponse,
  Slots,
  UseCase,
} from "@/types";

interface StoredSearch {
  products: EnrichedProduct[];
  inline_questions: GuidingQuestion[];
  total_count: number;
  rawInput: string;
  originalInput: string;
  share_token: string;
  search_id: string;
  slots?: Slots;
}

// Fallback de la grilla de resultados antes de que llegue la primera
// recomendación del chat (ver chatRecommendations/onRecommendations) — misma
// conversión que ya usa AllResultsModal para mostrar EnrichedProduct como
// AlternativeProduct.
function toAlternativeProduct(p: EnrichedProduct): AlternativeProduct {
  return {
    id: p.id,
    title: p.title,
    brand: p.brand,
    model: p.model,
    category: p.category,
    price_cash: p.price_cash,
    price_installment: p.price_installment,
    image_url: p.image_url,
    images: p.images,
    source: p.source,
    url: p.url,
    affiliate_url: p.affiliate_url,
    installment_count: p.installment_count,
    quality_price_score: p.quality_price_score,
    spec_highlights: p.spec_highlights,
    spec_highlights_simple: p.spec_highlights_simple,
    specs: p.specs,
    upgrade_note: getUpgradeNote(p.category, p.specs, p.upgradeable),
    out_of_budget: p.out_of_budget,
    also_at: p.also_at,
    price_verdict: p.price_verdict ?? null,
    sponsored: p.sponsored ?? false,
  };
}

const CATEGORY_LABEL: Record<string, string> = {
  notebook: "Notebook",
  desktop: "PC de escritorio",
  tablet: "Tablet",
  tv: "Smart TV",
  phone: "Celular",
};

// POST /api/search con reintento y backoff — las búsquedas tardan 6-9s cuando
// OpenAI va lento y un blip de red o un 5xx puntual del server ocupado
// disparaba el error directo ("No pudimos realizar la búsqueda") con el
// backend sano. Un 4xx real (que no sea 429) se devuelve sin reintentar.
async function postSearchWithRetry(payload: unknown, attempts = 3): Promise<Response> {
  let lastErr: unknown = new Error("search failed");
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(withBasePath("/api/search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 600 * 2 ** i)); // 600ms, 1200ms
  }
  throw lastErr;
}

// Resumen legible de qué está filtrando la búsqueda ahora mismo — pedido
// explícito del usuario tras varias pruebas en vivo donde no quedaba claro
// qué había interpretado el sistema (categoría/uso/presupuesto/marca) de su
// texto libre o de los refinamientos del chat.
function formatSearchCriteria(slots: Slots | null): string | null {
  if (!slots) return null;
  const parts: string[] = [];
  if (slots.category) parts.push(CATEGORY_LABEL[slots.category] ?? slots.category);
  if (slots.use_cases.length > 0) parts.push(formatUseCasesLabel(slots.use_cases));

  if (slots.budget_cash_ars) {
    parts.push(
      slots.budget_cash_min_ars
        ? `entre ${formatArs(slots.budget_cash_min_ars)} y ${formatArs(slots.budget_cash_ars)}`
        : `hasta ${formatArs(slots.budget_cash_ars)}`
    );
  } else if (slots.budget_monthly_ars) {
    parts.push(
      `hasta ${formatArs(slots.budget_monthly_ars)}/mes` +
        (slots.budget_installment_count ? ` en ${slots.budget_installment_count} cuotas` : "")
    );
  }

  if (slots.preferences.brands_preferred.length > 0) {
    parts.push(`marca: ${slots.preferences.brands_preferred.join(", ")}`);
  }
  if (slots.preferences.brands_excluded.length > 0) {
    parts.push(`sin: ${slots.preferences.brands_excluded.join(", ")}`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function productToEnriched(product: Product, index: number, useCases: UseCase[]): EnrichedProduct {
  return {
    ...product,
    similarity: 0,
    final_score: Math.max(0, 1 - index * 0.05),
    selection_reason: buildQuickSelectionReason(product.category, product.specs, useCases, product.title),
    spec_highlights: explainProductSpecs(product.category, product.specs, useCases, product.title),
    spec_highlights_simple: explainProductSpecsSimple(product.category, product.specs, useCases, product.title),
    upgrade_note: null,
    analysis_from_cache: true,
  };
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

// ── Optimistic question helpers ────────────────────────────────────────────────
// Detect category from input keywords so we can show questions instantly,
// without waiting for the LLM slot-filling round-trip.

// Detección liviana (sin LLM) de si el input YA describe un uso, para decidir
// si el path optimista debe volver a preguntarlo — bug real encontrado
// probando en vivo: le faltaban palabras de varios tags reales de la UI
// (tablet "Entretenimiento", TV "TV en vivo"/"Pantalla de PC", tablet "Para
// mis hijos"), así que el path optimista volvía a mostrar la pregunta de uso
// un instante después de contestarla, aunque el servidor sí la haya
// capturado bien — se leía como "no funciona" / "salta solo a presupuesto"
// cuando en realidad el servidor iba shortly after con la pregunta correcta
// (presupuesto), pisando la pregunta optimista repetida.
function detectHasUseCase(input: string): boolean {
  return /jugar|juegos|gaming|gamer|oficina|office|trabajo|trabaj|estudio|estudiar|edici[oó]n|editar|dise[nñ]o|dise[nñ]ar|pel[ií]culas|peliculas|video|programar|codi|fotograf[ií]a|b[aá]sico|redes|social|entretenimiento|en vivo|pantalla|hijos/.test(input.toLowerCase());
}

function detectHasBudget(input: string): boolean {
  return /\$[\d,.]+|[\d,.]+ *(mil|k)\b|por mes|efectivo|contado|\bcuotas?\b|pago en/.test(input.toLowerCase());
}


function getOptimisticQuestions(
  category: ReturnType<typeof detectCategoryLocally>,
  hasUseCase: boolean,
  hasBudget: boolean,
): GuidingQuestion[] | null {
  if (!category) return null;
  if (hasUseCase && hasBudget) return null; // likely going straight to results

  const questions: GuidingQuestion[] = [];

  if (!hasUseCase) {
    switch (category) {
      case "phone":
        questions.push({ text: "¿Para qué vas a usar el celular principalmente?", tags: ["📸 Fotos y videos", "📱 Redes sociales", "🎮 Juegos", "💼 Trabajo y email", "📞 Uso básico"] });
        break;
      case "tv":
        questions.push({ text: "¿Para qué vas a usar el televisor?", tags: ["🎬 Series y películas", "🎮 Gaming", "📺 TV en vivo", "🖥️ Pantalla de PC"] });
        break;
      case "tablet":
        questions.push({ text: "¿Para qué vas a usar la tablet?", tags: ["📚 Estudio", "🎨 Dibujo y diseño", "🎬 Entretenimiento", "💼 Trabajo", "👶 Para mis hijos"] });
        break;
      case "desktop":
        questions.push({ text: "¿Para qué vas a usar la computadora principalmente?", tags: ["💼 Trabajo y oficina", "📚 Estudio", "🎨 Diseño y edición", "🎮 Gaming", "🎬 Películas y uso diario"] });
        break;
      default:
        questions.push({ text: "¿Para qué vas a usar la notebook principalmente?", tags: ["💼 Trabajo y oficina", "📚 Estudio", "🎨 Diseño y edición", "🎮 Gaming", "🎬 Películas y uso diario"] });
    }
  }

  if (!hasBudget) {
    questions.push({ text: "¿Cuánto querés gastar?", tags: ["💳 Hasta $100.000 por mes", "💳 Hasta $200.000 por mes", "💳 Hasta $400.000 por mes", "💵 Pago en efectivo"] });
  }

  return questions.length > 0 ? questions : null;
}


const LOADING_HINTS = [
  "Analizando tu búsqueda...",
  "Identificando especificaciones técnicas...",
  "Comparando calidad y precio...",
  "Filtrando las mejores opciones...",
  "Buscando en tiendas locales...",
];

function SkeletonLoader({ hint, hintIndex }: { hint: string; hintIndex: number }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 py-16">
      <LogoBrand logoClass="h-20" />
      <p key={hintIndex} className="animate-fade-up text-center font-brand text-sm text-gathering-on-surface-variant">
        {hint}
      </p>
    </div>
  );
}

export default function SearchResultsPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [products, setProducts] = useState<EnrichedProduct[]>([]);
  // Filtros de marca/procesador/memoria/etc. (ResultsFilterBar, mismo
  // mecanismo que ya usaba solo el modal "Ver todos") — pedido explícito del
  // usuario para poder filtrar/ordenar los resultados de la pantalla
  // principal, no solo ese modal. Arranca en [] y se sincroniza con
  // `products` acá mismo (ResultsFilterBar también la recalcula sola en su
  // propio efecto ni bien monta/cambia `products`, esto solo evita un
  // parpadeo de "0 resultados" en el instante entre que cambian los
  // productos y ese efecto corre).
  const [filteredProducts, setFilteredProducts] = useState<EnrichedProduct[]>([]);
  useEffect(() => {
    setFilteredProducts(products);
  }, [products]);
  const [searchSlots, setSearchSlots] = useState<Slots | null>(null);
  // Ref con el último valor de searchSlots para leerlo dentro de runSearch sin
  // meterlo en las deps del useCallback — si estuviera en las deps, cada
  // respuesta needs_info recrearía runSearch, lo que dispara de nuevo el
  // useEffect de abajo que lee `token` (tiene runSearch en sus deps),
  // re-seteando searchSlots y formando un loop de renders.
  const searchSlotsRef = useRef<Slots | null>(null);
  useEffect(() => {
    searchSlotsRef.current = searchSlots;
  }, [searchSlots]);
  // Explícito en vez de inferido de otro estado — distingue "sin resultados
  // para este presupuesto" (terminal) de "todavía respondiendo preguntas"
  // (transitorio) sin depender de cuándo se limpian `questions`/`searchSlots`
  // durante el fetch, que puede solaparse de forma confusa entre ambos casos.
  const [resultsWereEmpty, setResultsWereEmpty] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [rawInput, setRawInput] = useState("");
  const [originalInput, setOriginalInput] = useState("");
  const [appliedRefinements, setAppliedRefinements] = useState<string[]>([]);
  const [compareList, setCompareList] = useState<EnrichedProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<EnrichedProduct | null>(null);
  // La grilla de resultados de la pantalla principal se arma con lo último
  // que recomendó el chat (ver GuidedSearchChat/onRecommendations) — arranca
  // en null (todavía no llegó el saludo del bot) y la página se cae de vuelta
  // a `products` sin rankear mientras tanto, ver `displayedProducts` más abajo.
  const [chatRecommendations, setChatRecommendations] = useState<{ products: AlternativeProduct[]; topPickIds?: string[] } | null>(null);
  // Filtro de la grilla que el chat pidió resaltar (ej. "store"). Se limpia solo.
  const [highlightFacet, setHighlightFacet] = useState<string | null>(null);
  // Tarjeta que el chat identificó como respuesta a una pregunta puntual
  // ("¿cuál tiene más RAM?") — se resalta con una animación que queda fija
  // hasta que el usuario busca/pregunta otra cosa (probado en vivo: un
  // apagado automático a los pocos segundos se sentía muy breve). Un mensaje
  // nuevo la apaga (ver handleSpotlightProduct/handleSpotlightConsumed).
  const [spotlightProductId, setSpotlightProductId] = useState<string | null>(null);
  // Empate en una pregunta factual ("¿cuál tiene más RAM?" con varias a la
  // par) — el link del chat pide ver esas N tarjetas solas en la grilla, con
  // la elegida ya destacada. Se limpia igual que el spotlight: con el botón
  // "Volver" del banner o solo con preguntar/buscar otra cosa.
  const [tiedFilter, setTiedFilter] = useState<{ ids: string[]; highlightId: string } | null>(null);
  const [sortOrder, setSortOrder] = useState<"relevance" | "price_asc" | "price_desc">("relevance");
  // Vista de resultados: "ranked" (lista por valor) es el default nuevo;
  // "classic" es la grilla de tarjetas de siempre (RecommendedProductsGrid,
  // sin tocar). Se lee la preferencia guardada recién en el cliente (evita
  // desajuste de hidratación) y se re-guarda cada vez que el usuario cambia.
  const [resultsView, setResultsViewState] = useState<ResultsView>("ranked");
  useEffect(() => {
    const saved = getResultsViewPref();
    if (saved) setResultsViewState(saved);
  }, []);
  const setResultsView = useCallback((view: ResultsView) => {
    setResultsViewState(view);
    saveResultsViewPref(view);
  }, []);
  const [chatOpen, setChatOpen] = useState(true);
  // Jugada #11: pregunta ya redactada sobre un producto puntual, inyectada al
  // chat desde el botón "Consultar sobre este equipo" de la tarjeta. `key`
  // fuerza el efecto en GuidedSearchChat aunque el texto se repita.
  const [askAboutMsg, setAskAboutMsg] = useState<{ text: string; key: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [questions, setQuestions] = useState<GuidingQuestion[]>([]);
  const [inlineQuestions, setInlineQuestions] = useState<GuidingQuestion[]>([]);
  const [copied, setCopied] = useState(false);
  const [selectionShared, setSelectionShared] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showAllResultsModal, setShowAllResultsModal] = useState(false);
  const [showCompareExperience, setShowCompareExperience] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  // Una vez que el chat guía arranca (primera pregunta o resultados directos),
  // se mantiene montado durante todo el resto del flujo — incluso durante los
  // "loading" intermedios de cada pregunta — para no perder el hilo de la
  // conversación ni tapar el chat con el skeleton de página completa.
  const [chatActive, setChatActive] = useState(false);
  // Vidriera de productos al azar que se ve detrás del chat mientras todavía
  // no hay resultados reales (ver DiscoverySections) — se pide una sola vez
  // al montar, independiente del estado de la búsqueda guiada, para que
  // aparezca ya mismo sin esperar al round-trip del LLM.
  const [discoverySections, setDiscoverySections] = useState<
    { category: ProductCategory; label: string; products: EnrichedProduct[] }[]
  >([]);
  const hasSaved = useRef(false);
  const pendingSearchHandled = useRef(false);
  // window.history.pushState (used to move from /search/loading to /search/{token}
  // without a full navigation) doesn't update useParams()/`token` below — Next.js
  // keeps returning the token the route originally matched. Track the real,
  // current share_token here so saving to "Recientes" doesn't persist "loading".
  const resolvedTokenRef = useRef(token);
  const bgAbortRef = useRef<AbortController | null>(null);
  // Pool completo para el modal "Ver todos" — se precarga en segundo plano ni
  // bien llegan los primeros resultados (mientras el usuario todavía está
  // mirando/chateando), no recién cuando abre el modal. Antes el modal
  // arrancaba su propio fetch al montarse, así que el usuario veía "cargando
  // el resto" recién al abrirlo — pedido explícito: "el usuario no oprimiría
  // en Ver todos la primera vez, debería ir cargándose todo mientras tanto".
  const [allResultsPool, setAllResultsPool] = useState<EnrichedProduct[]>([]);
  const preloadStartedForRef = useRef<EnrichedProduct[] | null>(null);
  // Persistent session ID for background cache coordination between needs_info and follow-up searches.
  const sessionIdRef = useRef<string>(
    typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  );
  const sessionId = sessionIdRef.current;

  // Precarga en segundo plano del resto del pool (para "Ver todos") ni bien
  // llegan resultados nuevos — `products` cambia de referencia en cada
  // búsqueda real, así que sirve como guard natural contra re-disparar el
  // mismo preload en cada render. Ignora los estados transitorios vacíos
  // (`setProducts([])` entre preguntas del chat guiado).
  useEffect(() => {
    if (products.length === 0) return;
    if (preloadStartedForRef.current === products) return;
    preloadStartedForRef.current = products;
    setAllResultsPool(products);
    if (totalCount <= products.length) return;

    let cancelled = false;
    const shareToken = resolvedTokenRef.current;
    (async () => {
      let offset = products.length;
      let more = true;
      while (more && !cancelled) {
        try {
          const res = await fetch(withBasePath(`/api/search/${shareToken}/more?offset=${offset}`));
          if (!res.ok) break;
          const data = (await res.json()) as { products: EnrichedProduct[]; hasMore: boolean };
          if (cancelled) return;
          if (data.products.length === 0) break;
          setAllResultsPool((prev) => [...prev, ...data.products]);
          offset += data.products.length;
          more = data.hasMore;
        } catch {
          break;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [products, totalCount]);

  // Cycle through loading hints while searching
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setHintIndex((i) => (i + 1) % LOADING_HINTS.length), 1800);
    return () => clearInterval(t);
  }, [loading]);

  useEffect(() => {
    if (questions.length > 0 || products.length > 0) setChatActive(true);
  }, [questions.length, products.length]);

  useEffect(() => {
    fetch(withBasePath("/api/products/discover"))
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { sections: { category: ProductCategory; products: Product[] }[] }) => {
        setDiscoverySections(
          data.sections.map((s) => ({
            category: s.category,
            label: CATEGORY_LABEL[s.category] ?? s.category,
            products: s.products.map((p, i) => productToEnriched(p, i, [])),
          }))
        );
      })
      .catch(() => {});
  }, []);

  const runSearch = useCallback(async (
    input: string,
    refinements: string[],
    opts?: { skipOptimistic?: boolean },
  ) => {
    setResultsWereEmpty(false);
    // ── Optimistic path ────────────────────────────────────────────────────────
    // If we can infer the category locally, show the questions immediately
    // (no loading state) while firing the API call in the background to warm
    // up the candidate cache before the user finishes selecting.
    if (!opts?.skipOptimistic) {
      const category = detectCategoryLocally(input);
      const hasUseCase = detectHasUseCase(input);
      const hasBudget = detectHasBudget(input);
      const optimisticQs =
        input === HOME_SEED_PHRASE ? [HOME_SEED_QUESTION] : getOptimisticQuestions(category, hasUseCase, hasBudget);

      if (optimisticQs) {
        bgAbortRef.current?.abort();
        bgAbortRef.current = new AbortController();
        const ctrl = bgAbortRef.current;

        setLoading(false);
        setError(false);
        setQuestions(optimisticQs);
        setProducts([]);
        setInlineQuestions([]);
        window.history.pushState(null, "", withBasePath(`/search/refine`));

        // Background fetch: warms candidate cache + may refine the questions
        // (e.g. if the server detects budget_type ambiguity).
        fetch(withBasePath("/api/search"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input,
            refinements: [],
            sessionId,
            visitId: getOrCreateVisitId().id,
            knownSlots: searchSlotsRef.current ?? undefined,
          }),
          signal: ctrl.signal,
        })
          .then(async (res) => {
            if (ctrl.signal.aborted || !res.ok) return;
            const data = (await res.json()) as SearchResponse;
            if (ctrl.signal.aborted) return;
            if (data.type === "needs_info") {
              setQuestions(data.questions);
              setSearchSlots(data.slots);
            } else if (data.type === "results") {
              // Rare: input was already sufficient for results
              const currentOriginal = originalInput || input;
              sessionStorage.setItem(`search_${data.share_token}`, JSON.stringify({ ...data, rawInput: input, originalInput: currentOriginal }));
              setError(false);
              setProducts(data.products);
              setInlineQuestions(data.inline_questions ?? []);
              setTotalCount(data.total_count);
              setSearchSlots(data.slots);
              setResultsWereEmpty(data.products.length === 0);
              setQuestions([]);
              resolvedTokenRef.current = data.share_token;
              window.history.pushState(null, "", withBasePath(`/search/${data.share_token}`));
            }
          })
          .catch(() => {});

        return;
      }
    }

    // ── Normal path ────────────────────────────────────────────────────────────
    bgAbortRef.current?.abort();
    setLoading(true);
    setError(false);
    setQuestions([]);
    setInlineQuestions([]);
    try {
      const res = await postSearchWithRetry({
        input,
        refinements,
        sessionId,
        visitId: getOrCreateVisitId().id,
        knownSlots: searchSlotsRef.current ?? undefined,
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as SearchResponse;

      if (data.type === "results") {
        const currentOriginal = originalInput || input;
        sessionStorage.setItem(
          `search_${data.share_token}`,
          JSON.stringify({ ...data, rawInput: input, originalInput: currentOriginal })
        );
        setProducts(data.products);
        setInlineQuestions(data.inline_questions ?? []);
        setTotalCount(data.total_count);
        setSearchSlots(data.slots);
        setResultsWereEmpty(data.products.length === 0);
        setRawInput(input);
        resolvedTokenRef.current = data.share_token;
        window.history.pushState(null, "", withBasePath(`/search/${data.share_token}`));
      } else if (data.type === "needs_info") {
        setQuestions(data.questions);
        setSearchSlots(data.slots);
        setProducts([]);
        setInlineQuestions([]);
        window.history.pushState(null, "", withBasePath(`/search/refine`));
      }
    } catch (e) {
      // No pisar con un error una grilla que otro camino (ej. el fetch
      // optimista en background) ya llenó: si resolvedTokenRef cambió a un
      // share_token real, una búsqueda SÍ resolvió — este catch es de una
      // llamada paralela/tardía que perdió la carrera (o un blip de red con
      // el server lento). Solo mostramos el error si nada resolvió todavía.
      if (resolvedTokenRef.current === token) {
        setError(true);
        setProducts([]);
        // Antes este error no dejaba ningún rastro consultable — reportado en
        // vivo 2026-09-11 ("No pudimos realizar la búsqueda") sin poder
        // confirmar la causa. No cubre una desconexión total del cliente (este
        // reporte también viaja por fetch), pero si el motivo fue un 5xx/429
        // agotando los 3 reintentos de postSearchWithRetry (servidor lento o
        // con error real), el reporte sí llega.
        reportError("search_failed", e instanceof Error ? e.message : String(e), { input });
      }
    } finally {
      setLoading(false);
    }
  }, [originalInput, sessionId, token]);

  useEffect(() => {
    // "loading" token = pending search stored in sessionStorage by home page.
    // Guard with a ref: React StrictMode runs effects twice; the second run
    // would find pending_search already removed and redirect to home.
    if (token === "loading") {
      if (pendingSearchHandled.current) return;
      pendingSearchHandled.current = true;
      const raw = sessionStorage.getItem("pending_search");
      if (!raw) { router.push("/"); return; }
      const { input, refinements } = JSON.parse(raw) as { input: string; refinements: string[] };
      sessionStorage.removeItem("pending_search");
      setRawInput(input);
      setOriginalInput(input);
      runSearch(input, refinements);
      return;
    }

    // "refine" token = needs_info state, already loaded
    if (token === "refine") {
      setLoading(false);
      return;
    }

    // Normal token: try sessionStorage first, then API
    const cached = sessionStorage.getItem(`search_${token}`);
    if (cached) {
      const data = JSON.parse(cached) as StoredSearch;
      setProducts(data.products);
      setInlineQuestions(data.inline_questions ?? []);
      setTotalCount(data.total_count);
      setSearchSlots(data.slots ?? null);
      setRawInput(data.rawInput ?? "");
      setOriginalInput(data.originalInput ?? data.rawInput ?? "");
      setLoading(false);
      return;
    }

    fetch(withBasePath(`/api/search/${token}`))
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(
        (data: {
          products: Product[];
          search: { id: string; raw_input: string; share_token: string; slots?: Slots };
          total_count: number;
        }) => {
          const useCases = data.search.slots?.use_cases ?? [];
          setProducts(data.products.map((p, i) => productToEnriched(p, i, useCases)));
          setRawInput(data.search.raw_input);
          setTotalCount(data.total_count ?? data.products.length);
          setSearchSlots(data.search.slots ?? null);
          setLoading(false);
        }
      )
      .catch(() => { router.push("/"); });
  }, [token, router, runSearch]);

  useEffect(() => {
    if (loading || !rawInput || hasSaved.current) return;
    if (resolvedTokenRef.current === "loading" || resolvedTokenRef.current === "refine") return;
    hasSaved.current = true;
    saveSearchLocally({
      search_id: resolvedTokenRef.current,
      share_token: resolvedTokenRef.current,
      raw_input: rawInput,
      saved_at: new Date().toISOString(),
    });
  }, [loading, rawInput, token]);


  const runNewSearch = useCallback((input: string, refinements: string[], opts?: { skipOptimistic?: boolean }) => {
    hasSaved.current = false;
    setAppliedRefinements(refinements);
    setRawInput(input);
    setSelectedProduct(null);
    setChatRecommendations(null);
    runSearch(input, refinements, opts);
  }, [runSearch]);

  const handleNewSearch = (input: string) => {
    setOriginalInput(input);
    // Arranca en blanco: uso/presupuesto/marca/procesador de la búsqueda
    // anterior no tienen por qué aplicar a esta (bug reportado en vivo: pedir
    // "celular" viniendo de notebook heredaba el presupuesto y el uso de
    // notebook por knownSlots, así que saltaba directo a resultados sin
    // preguntar nada del celular). Se limpia el ref de forma síncrona además
    // del estado — runNewSearch/runSearch corre en el mismo tick y lee el ref,
    // no el estado (que recién se actualiza en el próximo render).
    setSearchSlots(null);
    searchSlotsRef.current = null;
    runNewSearch(input, []);
  };

  // Frase libre que sugiere el chat guía (ver GuidedSearchChat, suggestedRefinement).
  //
  // Caso especial: si la frase implica otra categoría de dispositivo (el
  // usuario venía viendo notebooks y pidió "y para celulares"), el prompt le
  // pide al modelo que la arme como un pedido de búsqueda completo y
  // autónomo (ver buildSearchRefineChatPrompt) — acá se trata como búsqueda
  // nueva de cero (handleNewSearch), no como un ajuste apilado sobre
  // rawInput/appliedRefinements, para no arrastrar use_cases/presupuesto que
  // no tienen por qué aplicar a la categoría nueva. `chatCategory` (la
  // categoría vigente) se calcula más abajo, junto con chatUseCases/chatBudgetMax.
  const handleChatRefine = (phrase: string) => {
    const impliedCategory = detectCategoryLocally(phrase);
    if (impliedCategory && chatCategory && impliedCategory !== chatCategory) {
      handleNewSearch(phrase);
      return;
    }
    // Igual que handleBudgetSelect/handleGuidedAnswer: mostrar el splash
    // "Analizando" ya mismo — este camino usa skipOptimistic (ya tenemos
    // categoría/uso/presupuesto, no hay pregunta que mostrar de una), así que
    // sin esto quedaban los ~5-10s de /api/search con la vidriera nítida y se
    // sentía como que no había pasado nada (reportado en vivo 2026-09-11).
    setFinalizing(true);
    runNewSearch(rawInput, [...appliedRefinements, phrase], { skipOptimistic: true });
  };

  // Cada turno del GuidedSearchChat manda una sola frase ya lista (de un
  // botón curado o de texto libre) — se combina con lo ya sabido y se
  // vuelve a preguntar al backend de slot-filling, igual que antes hacía
  // handleAnswer con el array completo de la grilla de una sola vez.
  const handleGuidedAnswer = (phrase: string) => {
    const combined = rawInput ? `${rawInput}. ${phrase}` : phrase;
    // Si con esta respuesta ya están categoría + uso + presupuesto, el próximo
    // paso NO es otra pregunta sino la búsqueda real (~3-5s de /api/search).
    // Igual que handleBudgetSelect, mostramos YA el splash "Analizando" con el
    // logo — antes, al responder la última tarjeta (típicamente el presupuesto,
    // que en el chat guía pasa por acá y no por handleBudgetSelect), quedaba la
    // vidriera nítida 3-5s y se leía como que no había pasado nada. Mismo
    // criterio local que el path optimista de runSearch (líneas ~383-386).
    const category = detectCategoryLocally(combined);
    const hasUseCase = detectHasUseCase(combined);
    const hasBudget = detectHasBudget(combined);
    if (category && hasUseCase && hasBudget) {
      setFinalizing(true);
    }
    runNewSearch(combined, []);
  };

  const handleBudgetSelect = (budgetText: string) => {
    // El presupuesto es la última pregunta del flujo guiado — apenas se
    // responde, mostramos YA el splash de "Analizando" (ver `finalizing`), sin
    // esperar los ~4-5s que tarda /api/search. Antes quedaba la vidriera nítida
    // con solo el spinner chico del chat y se leía como que no pasó nada.
    setFinalizing(true);
    // Siempre combina con originalInput (sin presupuesto previo) para evitar acumulación.
    // Ej: si rawInput ya tiene "...hasta 200k...", se reemplaza por el nuevo presupuesto.
    const base = originalInput || rawInput;
    const combined = base ? `${base}. ${budgetText}` : budgetText;
    runNewSearch(combined, [], { skipOptimistic: true });
  };

  const handleCompareToggle = (product: EnrichedProduct) => {
    const alreadyCompared = compareList.some((p) => p.id === product.id);
    if (!alreadyCompared && compareList.length < 5) {
      trackEvent("product_compare_add", getOrCreateVisitId().id, { productId: product.id });
    }
    setCompareList((prev) => {
      if (prev.some((p) => p.id === product.id)) return prev.filter((p) => p.id !== product.id);
      if (prev.length >= 5) return prev;
      return [...prev, product];
    });
  };

  // Jugada #5: agregar al comparador "modelos parecidos" del modal "En otras
  // tiendas" — solo llegan por id (SimilarStoreVariant), así que se traen
  // completos por /api/products/[id] y se convierten a EnrichedProduct. `ids`
  // incluye el producto de origen para que quede al lado en el comparador.
  const addSimilarToCompare = async (ids: string[], open = false) => {
    const fresh = await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(withBasePath(`/api/products/${id}`));
          return res.ok ? ((await res.json()) as Product) : null;
        } catch {
          return null;
        }
      })
    );
    setCompareList((prev) => {
      const have = new Set(prev.map((p) => p.id));
      const room = Math.max(0, 5 - prev.length);
      const toAdd = fresh
        .filter((p): p is Product => !!p && !have.has(p.id))
        .slice(0, room)
        .map((p, i) => productToEnriched(p, prev.length + i, []));
      toAdd.forEach((p) =>
        trackEvent("product_compare_add", getOrCreateVisitId().id, { productId: p.id })
      );
      return [...prev, ...toAdd];
    });
    if (open) setShowCompareExperience(true);
  };

  // El chat trabaja con AlternativeProduct (versión resumida) — el panel de
  // detalle necesita el EnrichedProduct completo (specs, upgradeable, etc.).
  // Se busca en `products` (resultados reales) y también en la vidriera de
  // discovery (`discoverySections`), porque las tarjetas de "Ver más
  // detalles" pueden venir de cualquiera de los dos pools según la fase.
  function findFullProduct(id: string): EnrichedProduct | null {
    return (
      products.find((p) => p.id === id) ??
      discoverySections.flatMap((s) => s.products).find((p) => p.id === id) ??
      null
    );
  }

  const handleViewDetails = (product: AlternativeProduct) => {
    setSelectedProduct(findFullProduct(product.id));
    trackEvent("product_view_details", getOrCreateVisitId().id, { productId: product.id });
  };

  // Misma idea que handleViewDetails: la grilla de resultados trabaja con
  // AlternativeProduct, pero compareList/handleCompareToggle son EnrichedProduct.
  const handleCompareToggleAlt = (product: AlternativeProduct) => {
    const full = findFullProduct(product.id);
    if (full) handleCompareToggle(full);
  };

  const handleChatRecommendations = useCallback(
    (payload: { products: AlternativeProduct[]; topPickIds?: string[] }) => {
      setChatRecommendations(payload);
    },
    []
  );

  // El chat pidió resaltar un filtro de la grilla (ej. "store" cuando el
  // usuario preguntó por una tienda puntual). El resaltado + pulso quedan
  // hasta que el usuario toca ese filtro (pedido del usuario) — ver
  // ResultsFilterBar/onHighlightConsumed.
  const handleHighlightFilter = useCallback((facetKey: string) => {
    setHighlightFacet(facetKey);
  }, []);

  // El chat identificó qué tarjeta responde una pregunta puntual ("¿cuál
  // tiene más RAM?"). Queda resaltada hasta que el usuario busca/pregunta
  // otra cosa — ahí se apaga vía handleSpotlightConsumed (onNewQuery).
  const handleSpotlightProduct = useCallback((productId: string) => {
    setSpotlightProductId(productId);
  }, []);
  const handleSpotlightConsumed = useCallback(() => {
    setSpotlightProductId(null);
    setTiedFilter(null);
  }, []);

  // Link "Ver las N opciones empatadas" de un mensaje factual con empate —
  // filtra la grilla a esos ids nomás (bypasea los filtros de ResultsFilterBar
  // a propósito: son los productos exactos que respondieron la pregunta, no
  // deberían desaparecer por un filtro de marca/tienda ya aplicado) y destaca
  // el elegido con el mismo spotlight de siempre.
  const handleShowTiedResults = useCallback((ids: string[], highlightId: string) => {
    setTiedFilter({ ids, highlightId });
    setSpotlightProductId(highlightId);
  }, []);
  const handleClearTiedFilter = useCallback(() => {
    setTiedFilter(null);
  }, []);

  // Jugada #11: abre el chat con una consulta ya redactada sobre este equipo,
  // así el usuario no tiene que volver al chat y describirlo. El producto ya
  // viaja en `products` al backend del chat, que arma su bloque de specs.
  const handleAskAbout = (product: AlternativeProduct) => {
    // El título casi siempre ya arranca con la marca ("Notebook HP Probook…") —
    // no anteponerla nueva para no duplicarla ("la HP Notebook HP Probook…").
    const title = product.title ?? "";
    const brand = product.brand ?? "";
    const name =
      brand && !title.toLowerCase().includes(brand.toLowerCase())
        ? `${brand} ${title}`
        : title;
    setAskAboutMsg({
      text: `Contame más sobre la ${name}. ¿Me conviene para lo que busco?`,
      key: Date.now(),
    });
    setChatOpen(true);
    trackEvent("product_ask_about", getOrCreateVisitId().id, { productId: product.id });
  };

  const handleShare = () => {
    copyToClipboard(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Compartir las opciones seleccionadas (la misma selección que alimenta el
  // comparador): specs en lenguaje corto + precio + link de compra por opción.
  // navigator.share en mobile; copia al portapapeles como fallback.
  const handleShareSelection = async () => {
    if (compareList.length === 0) return;
    const text = buildSelectionShareText(compareList);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Opciones de indexa", text });
        return;
      } catch {
        // usuario canceló o el navegador rechazó — cae al portapapeles
      }
    }
    copyToClipboard(text);
    setSelectionShared(true);
    setTimeout(() => setSelectionShared(false), 2500);
  };

  // resultsWereEmpty distingue "todavía respondiendo preguntas" (products
  // vacío mientras se arma la próxima pregunta) de "ya se resolvió la
  // búsqueda y no hay nada para ese presupuesto" (products vacío pero
  // terminal) — ambos casos dejan products.length en 0, así que no alcanza
  // con mirar products/searchSlots solos para diferenciarlos.
  const hasResults = !loading && products.length > 0;
  const isEmptyResult = !loading && !error && products.length === 0 && resultsWereEmpty;
  // Una vez que se mostraron resultados, queda pegado en true para siempre
  // (dentro de esta sesión de la página) — evita que un refinamiento (tags,
  // filtros de prioridad, "buscar de nuevo" del chat) haga parpadear la
  // pantalla de vuelta a la vidriera mientras `loading` está en true: sin
  // esto, `hasResults` cae a false apenas arranca el fetch.
  const [resultsEverShown, setResultsEverShown] = useState(false);
  useEffect(() => {
    if (hasResults) setResultsEverShown(true);
  }, [hasResults]);
  // Splash de "Analizando tu mejor opción" que se pinta apenas el usuario
  // responde el presupuesto (handleBudgetSelect), antes de que /api/search
  // devuelva. Se apaga solo apenas hay algo real que mostrar (resultados,
  // otra pregunta, "sin resultados", o error) — a partir de ahí toma la posta
  // el overlay de la fase de resultados (!chatRecommendations).
  const [finalizing, setFinalizing] = useState(false);
  useEffect(() => {
    if (products.length > 0 || questions.length > 0 || inlineQuestions.length > 0 || resultsWereEmpty || error) {
      setFinalizing(false);
    }
  }, [products.length, questions.length, inlineQuestions.length, resultsWereEmpty, error]);
  // Vidriera al azar (DiscoverySections) mientras todavía no hay resultados
  // reales — una vez que resultsEverShown queda en true, no vuelve a mostrarse.
  const showGatheringLayout = chatActive && !resultsWereEmpty && !resultsEverShown;
  // Fase de bienvenida: preguntas del chat todavía en curso, nada finalizando
  // ni resuelto — el panel se muestra centrado (ver GuidedSearchChat/centered)
  // en vez de acoplado a la derecha. Se apaga apenas se responde la última
  // pregunta (finalizing pasa a true) o llega una respuesta directa con
  // resultados — ahí el chat anima su propia posición hacia la derecha.
  const chatCentered = showGatheringLayout && !finalizing;
  // A diferencia de hasResults (que exige !loading), esto mantiene montada la
  // fase de resultados con los productos ya cargados mientras un refinamiento
  // está en curso, en vez de desmontarla durante el fetch — así no queda una
  // pantalla en blanco entre "se fue la vidriera" y "todavía no llegó la
  // respuesta nueva". Se apaga solo en el caso terminal de "sin resultados",
  // que tiene su propio bloque dedicado más abajo.
  const showResultsLayout = (resultsEverShown || hasResults) && !isEmptyResult;

  // Computados fuera de los bloques condicionados por isGathering/hasResults
  // para no depender de si TS termina angostando el tipo de `searchSlots`
  // dentro de esos bloques.
  const chatCategory = searchSlots?.category ?? detectCategoryLocally(rawInput) ?? products[0]?.category ?? null;
  // Una búsqueda nueva (cambia la categoría) invalida el resaltado de filtro
  // pedido por el chat de la búsqueda anterior.
  useEffect(() => {
    setHighlightFacet(null);
  }, [chatCategory]);
  const chatUseCases = searchSlots?.use_cases ?? [];
  const chatBudgetMax = searchSlots?.budget_cash_ars ?? searchSlots?.budget_monthly_ars ?? null;
  // El usuario eligió pagar en cuotas si dio un presupuesto mensual y no uno al
  // contado — la tarjeta muestra entonces la cuota como número grande, no "$X
  // contado" (bug reportado en vivo).
  const paymentMode: "cash" | "installments" =
    searchSlots?.budget_monthly_ars != null && searchSlots?.budget_cash_ars == null
      ? "installments"
      : "cash";

  // Mientras no llegó todavía la primera recomendación del chat (saludo en
  // curso), la grilla muestra el pool inicial sin rankear ni "mejor opción"
  // destacada — se reemplaza en cuanto onRecommendations dispara.
  const chatRankedProducts = chatRecommendations?.products.length
    ? chatRecommendations.products
    : products.map(toAlternativeProduct);

  // Filtros de marca/procesador/memoria/etc. (ResultsFilterBar) se calculan
  // sobre `products` (EnrichedProduct[]) — acá se aplican por id sobre
  // chatRankedProducts (AlternativeProduct[], puede venir del chat en vez de
  // `products` directo) para no duplicar la lógica de facets en dos formatos.
  const filteredIds = new Set(filteredProducts.map((p) => p.id));
  const facetedProducts = chatRankedProducts.filter((p) => filteredIds.has(p.id));

  // Ordenar por precio es una operación determinística — se resuelve en el
  // cliente al toque, sin pasar por el chat/LLM (bug reportado: pedirlo por
  // chat tardaba ~24s y en los hechos no reordenaba nada, "recommend_products"
  // solo puede destacar picks, no reordenar la grilla). Al elegir un orden de
  // precio se pierde la distinción "mejor opción"/"también podrías
  // considerar" del chat — mezclarlas sería confuso (ej. el pick del chat
  // podría no ser ni el más barato ni el más caro).
  const sortedProducts =
    sortOrder === "relevance"
      ? facetedProducts
      : [...facetedProducts].sort((a, b) => {
          const priceA = a.price_cash ?? Infinity;
          const priceB = b.price_cash ?? Infinity;
          return sortOrder === "price_asc" ? priceA - priceB : priceB - priceA;
        });

  // "Ver las N opciones empatadas" del chat: reemplaza la grilla por esos ids
  // nomás, bypaseando ResultsFilterBar a propósito (ver handleShowTiedResults)
  // — vuelve un ida y vuelta corto, no cambia sortOrder ni los filtros reales.
  const displayedProducts = tiedFilter
    ? chatRankedProducts.filter((p) => tiedFilter.ids.includes(p.id))
    : sortedProducts;
  const displayedTopPickIds = sortOrder === "relevance" ? chatRecommendations?.topPickIds ?? null : null;

  return (
    <div className="min-h-screen">
      <main className="w-full px-4 py-6 sm:px-6 lg:px-10">
        {/* Identidad de marca — logo + slogan, siempre visible arriba de todo, sin caja.
            Sin padding propio: hereda el de <main>, así queda alineada con el
            contenido de abajo (antes tenía su propio padding chico mientras el
            grid de abajo sumaba el suyo, y quedaban desalineados). Mismo header
            en ambas fases (vidriera y resultados) — ya no hay columna lateral
            con la que alinearse. Oculto en la fase de bienvenida centrada
            (chatCentered): el logo grande de esa pantalla ya cumple ese rol,
            uno chico arriba a la vez quedaba redundante. */}
        {!chatCentered && (
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3 py-1.5">
          <a
            href={withBasePath("/")}
            className="flex flex-wrap items-center justify-center gap-3 sm:justify-start"
          >
            <LogoBrand logoClass="h-10 sm:h-12" />
            <span className="hidden h-6 w-px bg-gathering-outline-variant sm:block" aria-hidden="true" />
            <p className="font-brand text-xs font-medium uppercase text-gathering-on-surface-variant sm:text-sm">
              Toda la tecnología de Argentina, indexada para vos.
            </p>
          </a>
        </div>
        )}

        {/* Orden + filtros por marca/procesador/memoria/almacenamiento/pantalla
            (u otras facetas según la categoría, ver lib/domain/resultFilters.ts)
            juntos en el mismo renglón — pedido explícito del usuario (antes el
            orden vivía separado arriba, en la barra del logo). */}
        {hasResults && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SortDropdown value={sortOrder} onChange={setSortOrder} />
            <ResultsFilterBar
              products={products}
              category={chatCategory}
              onFilteredChange={setFilteredProducts}
              highlightKey={highlightFacet}
              onHighlightConsumed={() => setHighlightFacet(null)}
            />
            <div className="ml-auto flex items-center gap-1 rounded-full border border-gathering-outline-variant bg-gathering-surface-container p-1">
              <button
                type="button"
                onClick={() => setResultsView("ranked")}
                className={`rounded-full px-3 py-1.5 font-brand text-xs font-bold transition-colors ${
                  resultsView === "ranked"
                    ? "bg-gathering-primary-fixed-dim text-white"
                    : "text-gathering-on-surface-variant"
                }`}
              >
                Lista por valor
              </button>
              <button
                type="button"
                onClick={() => setResultsView("classic")}
                className={`rounded-full px-3 py-1.5 font-brand text-xs font-bold transition-colors ${
                  resultsView === "classic"
                    ? "bg-gathering-primary-fixed-dim text-white"
                    : "text-gathering-on-surface-variant"
                }`}
              >
                Vista clásica
              </button>
            </div>
          </div>
        )}

        {/* Contador + filtros + compartir, todo en un solo renglón (solo cuando ya hay resultados).
            El resumen de la búsqueda (categoría/uso/presupuesto) vivía antes al
            lado del slogan del logo — se movió acá (pedido 2026-09-17), separado
            de la identidad del sitio, junto con el resto de la info de "qué
            estás viendo". */}
        {hasResults && (
          <div className="mb-4 flex flex-col gap-2">
            {formatSearchCriteria(searchSlots) && (
              <p className="font-brand text-xs font-semibold normal-case text-gathering-primary-fixed-dim sm:text-sm">
                {formatSearchCriteria(searchSlots)}
              </p>
            )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-brand text-xs font-semibold uppercase tracking-wide text-gathering-on-surface-variant">
              <span>
                {totalCount} resultado{totalCount !== 1 ? "s" : ""} encontrado{totalCount !== 1 ? "s" : ""}
                {!tiedFilter && displayedProducts.length !== products.length && (
                  <span className="normal-case text-gathering-primary-fixed-dim">
                    {" "}
                    · mostrando {displayedProducts.length} con los filtros aplicados
                  </span>
                )}
                {appliedRefinements.length > 0 && (
                  <span className="normal-case text-gathering-outline">
                    {" "}
                    · {appliedRefinements.length} filtro{appliedRefinements.length !== 1 ? "s" : ""} aplicado{appliedRefinements.length !== 1 ? "s" : ""}
                  </span>
                )}
              </span>
              {totalCount > products.length && (
                <button
                  type="button"
                  onClick={() => setShowAllResultsModal(true)}
                  className="uppercase text-gathering-primary-fixed-dim hover:underline"
                >
                  · Ver todos
                </button>
              )}
            </div>
            {/* Compartir/WhatsApp pegados al renglón de "N resultados" — antes
                quedaban separados a la derecha del todo (justify-between),
                pedido explícito del usuario para tenerlos juntos. */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleShare}
                className="flex items-center gap-1.5 font-brand text-sm font-medium text-gathering-on-surface hover:text-gathering-primary-fixed-dim"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
                {copied ? "¡Link copiado!" : "Compartir búsqueda"}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Mirá lo que encontré para "${rawInput}": ${typeof window !== "undefined" ? window.location.href : ""}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 font-brand text-sm font-medium text-[#25D366] hover:text-[#128C7E]"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12.004 2.003c-5.514 0-9.997 4.483-9.997 9.997 0 1.763.462 3.483 1.34 4.997L2 22l5.116-1.342a9.958 9.958 0 004.888 1.245h.004c5.514 0 9.997-4.483 9.997-9.997 0-2.67-1.04-5.18-2.928-7.069a9.937 9.937 0 00-7.073-2.834zm5.85 15.847c-.685.685-2.267 1.373-3.147 1.51-.804.125-1.756.18-2.833-.178a11.13 11.13 0 01-1.032-.383c-1.816-.78-4.056-2.5-5.72-5.163a10.25 10.25 0 01-1.16-2.24c-.303-.833-.462-1.706-.462-2.55 0-1.98.795-3.303 1.48-3.988a1.68 1.68 0 011.199-.503c.148 0 .297.001.428.008.372.017.558.04.803.628.297.716.968 2.478 1.052 2.658.083.18.14.396.014.635-.124.24-.187.388-.372.596-.186.208-.39.464-.556.622-.186.178-.38.372-.163.729.216.357.96 1.583 2.06 2.564 1.416 1.263 2.61 1.654 2.968 1.842.357.187.567.156.777-.093.21-.248.9-1.05 1.14-1.41.24-.36.48-.297.81-.178.33.119 2.1.99 2.46 1.17.36.18.6.267.687.418.087.15.087.87-.208 1.71z" />
                </svg>
                WhatsApp
              </a>
              <button
                type="button"
                onClick={() => setShowSyncModal(true)}
                className="flex items-center gap-1.5 font-brand text-sm font-medium text-gathering-on-surface hover:text-gathering-primary-fixed-dim"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                </svg>
                Ver en otro dispositivo
              </button>
            </div>
          </div>
          </div>
        )}

        {/* ── ERROR ─── (nunca junto a una grilla ya cargada: se veía el
             cartel de "no pudimos" encima de 4 productos reales) */}
        {!loading && error && products.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <p className="font-brand text-lg font-medium text-gathering-on-surface">No pudimos realizar la búsqueda</p>
            <p className="font-brand text-sm text-gathering-on-surface-variant">Verificá tu conexión e intentá de nuevo</p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="gathering-btn-primary-gradient mt-2 rounded-xl px-4 py-2 font-brand text-sm font-semibold text-white"
            >
              Volver al inicio
            </button>
          </div>
        )}

        {/* ── LOADING (antes de que arranque el chat guía) ─── */}
        {loading && !chatActive && (
          <SkeletonLoader hint={LOADING_HINTS[hintIndex]} hintIndex={hintIndex} />
        )}

        {/* ── FINALIZANDO: splash inmediato al responder el presupuesto ── */}
        {finalizing && !showResultsLayout && (
          <Portal>
            <div
              className={`pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-center gap-3 ${
                chatOpen ? "lg:pr-[26rem]" : ""
              }`}
            >
              <LogoBrand logoClass="h-24 animate-dot-pulse" />
              <p className="font-brand text-sm font-bold uppercase tracking-wide text-gathering-on-surface">
                Analizando tu mejor opción...
              </p>
            </div>
          </Portal>
        )}

        {/* ── VIDRIERA: productos al azar mientras no hay resultados reales ──
            Ahora es puro fondo decorativo detrás del chat de bienvenida
            (centrado) — siempre difuminada y sin interacción mientras dura,
            no solo durante el splash de "Analizando" final. */}
        {showGatheringLayout && (
          <div className="pointer-events-none animate-fade-up select-none opacity-40 blur-md transition-all duration-300">
            <DiscoverySections
              sections={discoverySections}
              onViewDetails={handleViewDetails}
              onCompareToggle={handleCompareToggleAlt}
              isCompared={(id) => compareList.some((p) => p.id === id)}
              compareDisabled={compareList.length >= 5}
              sessionId={sessionId}
            />
          </div>
        )}

        {/* ── RESULTADOS REALES — grilla a pantalla completa ─── */}
        {showResultsLayout && (
          <div
            className={`animate-fade-up flex flex-col gap-3 transition-[padding] duration-300 ${
              chatOpen ? "lg:pr-[26rem]" : ""
            }`}
          >
            {inlineQuestions.length > 0 && (
              <BudgetPicker onSelect={handleBudgetSelect} startOpen category={chatCategory} />
            )}

            {/* Vista temporal del link "Ver las N empatadas" del chat (ver
                handleShowTiedResults) — bien visible arriba de la grilla para
                que quede claro que no son TODOS los resultados, y con la
                forma clara de volver. */}
            {tiedFilter && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gathering-primary-fixed-dim/30 bg-gathering-primary/5 px-4 py-2.5">
                <p className="font-brand text-xs font-semibold text-gathering-primary-fixed-dim">
                  Mostrando {displayedProducts.length} opciones de la pregunta del chat
                </p>
                <button
                  type="button"
                  onClick={handleClearTiedFilter}
                  className="font-brand text-xs font-semibold text-gathering-on-surface-variant underline underline-offset-2 hover:text-gathering-on-surface"
                >
                  ← Volver a la búsqueda
                </button>
              </div>
            )}

            {/* Mientras el chat todavía está armando su recomendación
                (!chatRecommendations), la grilla sin rankear queda esfumada
                en vez de mostrarse nítida — evita el salto visible de "estos
                6 sin orden" a "estos 6 reordenados con mejor opción" que
                pasaba antes (bug reportado: "muestra unos resultados y luego
                se actualiza mostrando las mejores opciones"). El logo+texto
                de "Analizando..." va centrado en el VIEWPORT vía Portal —
                un `fixed` normal quedaba "atrapado" dentro del ancestro
                `animate-fade-up` (transform crea un containing block nuevo,
                mismo bug documentado en components/Portal.tsx), y con
                grillas largas (varias filas) terminaba centrado fuera de la
                parte visible de la pantalla. Verificado en vivo contra
                producción antes y después del fix. */}
            <div className="relative">
              {!chatRecommendations && (
                <Portal>
                  <div
                    className={`pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-center gap-3 ${
                      chatOpen ? "lg:pr-[26rem]" : ""
                    }`}
                  >
                    <LogoBrand logoClass="h-24 animate-dot-pulse" />
                    <p className="font-brand text-sm font-bold uppercase tracking-wide text-gathering-on-surface">Analizando tu mejor opción...</p>
                  </div>
                </Portal>
              )}
              <div
                // key cambia UNA sola vez, justo cuando llega chatRecommendations
                // — fuerza a remontar las tarjetas en ese momento exacto para que
                // el stagger de RecommendedProductsGrid (animate-slide-up por
                // tarjeta) arranque recién ahí, no en el mount inicial silencioso
                // de más arriba (donde ya estaría dim/blureado sin que se note).
                key={chatRecommendations ? "revealed" : "pending"}
                className={`transition-all duration-500 ${
                  !chatRecommendations ? "pointer-events-none select-none opacity-40 blur-md" : "opacity-100 blur-0"
                }`}
              >
                {resultsView === "ranked" ? (
                  <RankedResultsList
                    products={displayedProducts}
                    topPickIds={displayedTopPickIds}
                    spotlightProductId={spotlightProductId}
                    onViewDetails={handleViewDetails}
                    onCompareToggle={handleCompareToggleAlt}
                    isCompared={(id) => compareList.some((p) => p.id === id)}
                    compareDisabled={compareList.length >= 5}
                    searchShareToken={resolvedTokenRef.current}
                    sessionId={sessionId}
                    paymentMode={paymentMode}
                    onCompareAdd={addSimilarToCompare}
                    comparedIds={compareList.map((p) => p.id)}
                  />
                ) : (
                  <RecommendedProductsGrid
                    products={displayedProducts}
                    topPickIds={displayedTopPickIds}
                    spotlightProductId={spotlightProductId}
                    onViewDetails={handleViewDetails}
                    onCompareToggle={handleCompareToggleAlt}
                    onCompareAdd={addSimilarToCompare}
                    onAskAbout={handleAskAbout}
                    isCompared={(id) => compareList.some((p) => p.id === id)}
                    comparedIds={compareList.map((p) => p.id)}
                    compareDisabled={compareList.length >= 5}
                    searchShareToken={resolvedTokenRef.current}
                    sessionId={sessionId}
                    paymentMode={paymentMode}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Burbuja de chat única y persistente — arranca apenas hay algo que
            preguntar (vidriera) y sigue siendo la MISMA instancia una vez que
            llegan resultados reales (evita perder el historial visible entre
            fases, que antes eran dos montajes de GuidedSearchChat distintos).
            Se mantiene SIEMPRE montada (solo se oculta con CSS) para no volver
            a disparar el saludo desde cero al minimizar/reabrir (ver
            GuidedSearchChat/greetedForTokenRef). */}
        {chatActive && (
          <div className={chatOpen ? "" : "hidden"}>
            <GuidedSearchChat
              compact
              centered={chatCentered}
              onMinimize={() => setChatOpen(false)}
              onRecommendations={handleChatRecommendations}
              questions={questions}
              category={chatCategory}
              onSubmitAnswer={handleGuidedAnswer}
              searching={loading}
              rawInput={rawInput}
              useCases={chatUseCases}
              budgetMax={chatBudgetMax}
              products={products}
              shareToken={resolvedTokenRef.current}
              appliedRefinements={appliedRefinements}
              onRefine={handleChatRefine}
              externalMessage={askAboutMsg}
              onHighlightFilter={handleHighlightFilter}
              onSpotlightProduct={handleSpotlightProduct}
              onShowTiedResults={handleShowTiedResults}
              onNewQuery={handleSpotlightConsumed}
            />
          </div>
        )}
        {chatActive && !chatOpen && <ChatFAB onClick={() => setChatOpen(true)} />}

        <ProductDetailPanel
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onCompareToggle={handleCompareToggle}
          isCompared={selectedProduct ? compareList.some((p) => p.id === selectedProduct.id) : false}
          compareDisabled={compareList.length >= 5}
          searchShareToken={resolvedTokenRef.current}
          sessionId={sessionId}
        />

        {/* ── SIN RESULTADOS ─── */}
        {isEmptyResult && (
          <div className="py-16 text-center">
            <p className="font-brand text-lg font-semibold text-gathering-on-surface">Sin resultados para este presupuesto</p>
            <p className="mx-auto mt-2 max-w-sm font-brand text-sm text-gathering-on-surface-variant">
              Las notebooks más económicas del mercado arrancan desde $270.000.
              Probá con más cuotas o un monto mayor por mes.
            </p>
            <BudgetPicker onSelect={handleBudgetSelect} startOpen category={chatCategory} />
          </div>
        )}
      </main>

      <Footer />

      {showSyncModal && <SyncSearchesModal onClose={() => setShowSyncModal(false)} />}

      {showAllResultsModal && (
        <AllResultsModal
          initialProducts={allResultsPool}
          totalCount={totalCount}
          shareToken={resolvedTokenRef.current}
          onViewDetails={(product) => setSelectedProduct(product)}
          onClose={() => setShowAllResultsModal(false)}
          compareList={compareList}
          onCompareToggle={handleCompareToggle}
        />
      )}

      {/* Sticky compare bar */}
      {compareList.length > 0 && (
        <div className="gathering-glass-panel fixed bottom-0 left-0 right-0 z-30 bg-gathering-surface-container px-4 py-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
              {compareList.map((p) => (
                <div key={p.id} className="flex shrink-0 items-center gap-1 rounded-full bg-gathering-surface-variant px-3 py-1">
                  <span className="max-w-[120px] truncate font-brand text-xs text-gathering-on-surface">
                    {p.brand ?? p.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCompareToggle(p)}
                    className="text-gathering-on-surface-variant hover:text-gathering-on-surface"
                    aria-label="Quitar"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <span className="hidden font-brand text-sm text-gathering-on-surface-variant sm:inline">
                {compareList.length}/5
              </span>
              <button
                type="button"
                onClick={handleShareSelection}
                className="flex items-center gap-1.5 rounded-xl border border-gathering-outline-variant px-3 py-2 font-brand text-sm font-semibold text-gathering-on-surface transition-colors hover:bg-black/5"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
                {selectionShared ? "¡Copiado!" : "Compartir"}
              </button>
              <button
                type="button"
                onClick={() => setShowCompareExperience(true)}
                className="gathering-btn-primary-gradient rounded-xl px-4 py-2 font-brand text-sm font-semibold text-white"
              >
                Comparar {compareList.length}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompareExperience && (
        <CompareExperience
          ids={compareList.map((p) => p.id)}
          searchToken={resolvedTokenRef.current}
          mode="modal"
          onClose={() => setShowCompareExperience(false)}
        />
      )}
    </div>
  );
}
