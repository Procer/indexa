import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildSearchRefineChatPrompt, SEARCH_REFINE_CHAT_TOOLS } from "@/lib/llm/prompts";
import { summarizePool } from "@/lib/domain/poolSummary";
import { getProductsByIds, getSearchByShareToken } from "@/lib/db/queries";
import { sql } from "@/lib/db/sql";
import { enrichWithAnalysis } from "@/lib/llm/productAnalysis";
import { getCachedConfigPriceMedians, getChatGreetingCache, setChatGreetingCache, type ChatGreetingPayload } from "@/lib/search/cache";
import { getOrBuildPoolIds } from "@/lib/search/pipeline";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { detectCategoryLocally } from "@/lib/domain/detectCategory";
import { detectBrandMentions } from "@/lib/domain/detectBrand";
import { detectProcessorMention } from "@/lib/domain/detectProcessor";
import { classifyBudgetFit } from "@/lib/domain/budgetFit";
import { getUpgradeNote } from "@/lib/domain/upgradeability";
import { buildPriceVerdicts } from "@/lib/domain/priceVerdict";
import { describeBudgetForChat, formatArs } from "@/lib/domain/budgetTiers";
import type { AlternativeProduct, EnrichedProduct, ProductCategory, UseCase } from "@/types";

// Nombres de tienda que se pueden nombrar en el chat sin ambigüedad con
// palabras comunes del español (por eso NO están "Vea", "Disco", "Jumbo",
// "Naldo", "Pardo", "Coppel"). Mapea variante escrita → nombre canónico.
const STORE_MENTION_MATCH: Record<string, string> = {
  fravega: "Frávega",
  "frávega": "Frávega",
  carrefour: "Carrefour",
  musimundo: "Musimundo",
  garbarino: "Garbarino",
  compumundo: "Compumundo",
  megatone: "Megatone",
  cetrogar: "Cetrogar",
  oncity: "On City",
  "on city": "On City",
  mercadolibre: "MercadoLibre",
  "mercado libre": "MercadoLibre",
  meli: "MercadoLibre",
  changomas: "Changomas",
  "chango mas": "Changomas",
  "chango más": "Changomas",
};

// Devuelve el nombre canónico de la tienda si el texto la nombra, o null.
function detectStoreMention(text: string): string | null {
  const t = ` ${text.toLowerCase()} `;
  for (const [needle, label] of Object.entries(STORE_MENTION_MATCH)) {
    if (new RegExp(`[^a-záéíóúñ]${needle}([^a-záéíóúñ]|$)`, "i").test(t)) return label;
  }
  return null;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Tope de productos con detalle completo de specs en el prompt (costo/latencia
// del chat) — el resumen agregado (summarizePool) sigue cubriendo el pool
// completo aunque el usuario haya scrolleado más allá de este número. Igualado
// a la grilla (20, ver /api/search) — antes era 30, más de lo que la UI llega
// a mostrar, inflando el prompt (y el tiempo de respuesta) sin beneficio real.
const MAX_DETAILED_PRODUCTS = 20;

interface Message {
  role: "user" | "ai";
  text: string;
}

interface ChatRequest {
  rawInput: string;
  useCases?: UseCase[];
  budgetMax?: number | null;
  category?: ProductCategory | null;
  products: EnrichedProduct[];
  shareToken: string;
  messages: Message[];
  message: string;
  greeting?: boolean;
  refinements?: string[];
  // Jugada #11: el mensaje viene del botón "Consultar sobre este equipo" de una
  // tarjeta, no lo tipeó el usuario. Siempre nombra la marca/modelo del equipo
  // ("Contame más sobre la HP Probook…"), así que sin esta señal los atajos
  // determinísticos de marca/categoría/procesador lo interceptan y devuelven
  // "te busco esa marca" en vez de responder sobre el equipo. Con askAbout=true
  // el turno pasa derecho al LLM (el producto ya viaja en `products`).
  askAbout?: boolean;
  // Id persistente de visita (localStorage) — para persistir el turno en
  // chat_messages y poder unirlo después con las búsquedas/clicks de la misma
  // persona (prueba con varias personas, 2026-09-11).
  visitId?: string;
}

// Persiste cada turno completo de chat en chat_messages (además del log a
// consola de siempre) — antes se perdía apenas rotaba el log, sin forma de
// reconstruir qué preguntó cada persona. Fire-and-forget (no bloquea la
// respuesta al usuario ni la tira abajo si la DB tiene un blip).
function persistChatTurn(row: {
  shareToken: string;
  visitId?: string;
  userMessage: string;
  assistantReply: string;
  greeting: boolean;
  factualAnswer?: boolean;
  recommendedCount?: number;
  spotlightProductId?: string;
  suggestedRefinement?: string | null;
  durationMs: number;
}): void {
  sql`
    INSERT INTO chat_messages (
      share_token, visit_id, context, user_message, assistant_reply,
      greeting, factual_answer, recommended_count, spotlight_product_id,
      suggested_refinement, duration_ms
    ) VALUES (
      ${row.shareToken}, ${row.visitId ?? null}, 'results', ${row.userMessage}, ${row.assistantReply},
      ${row.greeting}, ${row.factualAnswer ?? false}, ${row.recommendedCount ?? null},
      ${row.spotlightProductId ?? null}, ${row.suggestedRefinement ?? null}, ${row.durationMs}
    )
  `.catch((e) => console.error("[POST /api/search/refine-chat] persistChatTurn failed", e));
}

// Tope de tarjetas mostradas por respuesta — el chat ahora muestra SIEMPRE
// todas las opciones que el usuario tiene cargadas (no un subconjunto elegido
// por el modelo), este tope solo protege contra el caso extremo de haber
// cargado muchas más de lo típico (la búsqueda inicial devuelve 20).
const MAX_CHAT_CARDS = 20;

// Para armar una frase de búsqueda autónoma cuando se detecta una marca
// nueva en el mensaje del usuario (ver brandMentionIsNew más abajo).
const CATEGORY_WORD: Record<string, string> = {
  notebook: "notebook",
  desktop: "PC de escritorio",
  tablet: "tablet",
  tv: "Smart TV",
  phone: "celular",
};

// Acumulador de argumentos de tool calls mientras llegan fragmentados por el
// stream — recommend_products/suggest_refinement no le devuelven nada al
// modelo (son avisos a la UI), así que alcanza con juntar los fragments y
// resolverlos una vez que el stream termina, sin un segundo round-trip.
interface ToolCallAccumulator {
  name?: string;
  arguments: string;
}

// Tope de picks destacados por turno — el schema de la tool ya pide "hasta
// 5", esto es una red de seguridad por si el modelo manda más.
const MAX_TOP_PICKS = 5;

function resolveToolCalls(
  accumulators: Map<number, ToolCallAccumulator>,
  loadedProducts: EnrichedProduct[]
): {
  recommendedProducts?: AlternativeProduct[];
  topPickIds?: string[];
  topPickTitles?: string[];
  suggestedRefinement?: string;
} {
  let topPickNumbers: number[] = [];
  let suggestedRefinement: string | undefined;

  for (const { name, arguments: argsJson } of Array.from(accumulators.values())) {
    if (!name || !argsJson) continue;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsJson);
    } catch {
      continue;
    }

    if (name === "recommend_products" && Array.isArray(args.resultNumbers)) {
      topPickNumbers = Array.from(
        new Set(
          (args.resultNumbers as unknown[]).filter(
            (n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= loadedProducts.length
          )
        )
      ).slice(0, MAX_TOP_PICKS);
    } else if (name === "suggest_refinement" && typeof args.refinement === "string") {
      const trimmed = args.refinement.trim();
      if (trimmed) suggestedRefinement = trimmed;
    }
  }

  if (topPickNumbers.length === 0) {
    return { suggestedRefinement };
  }

  // El modelo indica sus mejores picks (hasta 5) — acá se arma la lista
  // completa de TODO lo que el usuario tiene cargado (picks primero, en su
  // orden, resto después en su orden original) para que ninguna opción
  // quede fuera de las tarjetas.
  const topSet = new Set(topPickNumbers);
  const orderedNumbers = [
    ...topPickNumbers,
    ...loadedProducts.map((_, i) => i + 1).filter((n) => !topSet.has(n)),
  ].slice(0, MAX_CHAT_CARDS);

  const recommendedProducts = orderedNumbers.map((n) => toRecommendedProduct(loadedProducts[n - 1]));
  const topPickIds = topPickNumbers.map((n) => loadedProducts[n - 1].id);
  const topPickTitles = topPickNumbers.map((n) => loadedProducts[n - 1].title);

  return { recommendedProducts, topPickIds, topPickTitles, suggestedRefinement };
}

// Red de seguridad: a veces gpt-4o-mini, en vez de emitir un tool_call real,
// "narra" la llamada como pseudo-código al final del texto — visto en vivo en
// formato funciones.recommend_products({ resultNumbers: [2] }), JSON suelto
// {"resultNumbers":[3]}, y una variante nueva con TODO envuelto en un
// paréntesis extra: (functions.recommend_products({"resultNumbers":[1]})) —
// esta última se coló sin limpiar en producción porque la regex vieja solo
// contemplaba un paréntesis de cierre, no dos. Si eso pasa, toolCallAccumulators
// queda vacío y el usuario vería el pseudo-código crudo en el chat sin ninguna
// tarjeta. Esto detecta el patrón, lo saca del texto mostrado, y lo recupera
// como si fuera un tool call real.
function extractLeakedToolCall(
  text: string,
  loadedProducts: EnrichedProduct[]
): { cleanText: string; toolName?: string; args?: Record<string, unknown> } {
  let cleanText = text;
  let toolName: "recommend_products" | "suggest_refinement" | undefined;
  let args: Record<string, unknown> | undefined;

  const jsonMatch = cleanText.match(
    /\n?\s*\(?\s*(?:functions?\.)?(recommend_products|suggest_refinement)?\s*\(?\s*\{\s*"?(resultNumbers|refinement)"?\s*:\s*(\[[^\]]*\]|"[^"]*")\s*\}\s*\)?\s*\)?;?\s*$/
  );
  if (jsonMatch) {
    const [, explicitName, key, rawValue] = jsonMatch;
    try {
      const value = JSON.parse(rawValue);
      cleanText = cleanText.slice(0, jsonMatch.index).trim();
      toolName = (explicitName ?? (key === "resultNumbers" ? "recommend_products" : "suggest_refinement")) as
        | "recommend_products"
        | "suggest_refinement";
      args = { [key]: value };
    } catch {
      // sigue abajo — puede ser narración en prosa en vez de JSON inválido
    }
  }

  // Otra forma en la que gpt-4o-mini "narra" en vez de llamar de verdad: sin
  // JSON ni pseudo-código, solo una frase como "Llamo a recommend_products
  // para que puedas ver los detalles". Se limpia la narración siempre, y si
  // el producto que motivó la mención ya se puede identificar por título en
  // el texto previo, se recupera el pick como si la función se hubiera
  // llamado de verdad.
  if (!toolName) {
    const narrationMatch = cleanText.match(
      /\s*(?:así que\s+)?(?:voy a llamar|llamo|llamando)\s+a\s+(?:la función\s+)?(?:functions?\.)?(recommend_products|suggest_refinement)\b[^.]*\.?\s*$/i
    );
    if (narrationMatch) {
      const name = narrationMatch[1] as "recommend_products" | "suggest_refinement";
      cleanText = cleanText.slice(0, narrationMatch.index).trim();
      if (name === "recommend_products") {
        const resultNumber = findMentionedResultNumber(cleanText, loadedProducts);
        if (resultNumber) {
          toolName = name;
          args = { resultNumbers: [resultNumber] };
        }
      } else {
        toolName = name;
      }
    }
  }

  // Última red de seguridad, y la más confiable: el prompt le pide al modelo
  // que internamente identifique los productos como "RESULTADO N", y a veces
  // esa referencia se cuela tal cual en el texto visible (ej. "la mejor
  // opción es el RESULTADO 1: Disco SSD...") sin haber llamado a la función.
  // A diferencia de las narraciones de arriba (que varían mucho en redacción),
  // "RESULTADO N" es un patrón fijo que el modelo repite de forma consistente
  // — se limpia SIEMPRE del texto visible (el usuario nunca debe ver esa
  // etiqueta interna) y, si todavía no hay un pick resuelto, se recupera de acá.
  const resultRefs = Array.from(cleanText.matchAll(/RESULTADO\s+(\d+)/gi))
    .map((m) => Number(m[1]))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= loadedProducts.length);
  if (resultRefs.length > 0) {
    cleanText = cleanText.replace(/RESULTADO\s+\d+\s*[:\-—]?\s*/gi, "").replace(/ {2,}/g, " ").trim();
    if (!toolName) {
      toolName = "recommend_products";
      args = { resultNumbers: Array.from(new Set(resultRefs)) };
    }
  }

  // Última red de seguridad, general: el modelo a veces ni llama a la
  // función ni narra con una frase reconocible ("voy a llamar...") ni usa
  // "RESULTADO N" — simplemente nombra el producto por su título completo
  // (ej. "te recomiendo la Notebook Lenovo Ip 3 ... Voy a mostrarte la
  // tarjeta de la Lenovo Ip 3") y no pasa nada más. Sin este fallback el
  // usuario se queda con una recomendación en texto sin ninguna tarjeta
  // (bug reportado: "no me muestra resultados"). Se busca el título mencionado
  // directamente en el texto ya limpio, mismo helper que ya usaba el caso de
  // narración de arriba.
  if (!toolName) {
    const resultNumber = findMentionedResultNumber(cleanText, loadedProducts);
    if (resultNumber) {
      toolName = "recommend_products";
      args = { resultNumbers: [resultNumber] };
    }
  }

  return toolName ? { cleanText, toolName, args } : { cleanText };
}

// Heurística de recuperación: busca cuál RESULTADO nombró el modelo por
// título completo en el texto ya limpio, para reconstruir el pick cuando la
// narración leaked no trae argumentos.
function findMentionedResultNumber(text: string, loadedProducts: EnrichedProduct[]): number | null {
  const normalized = text.toLowerCase();
  for (let i = 0; i < loadedProducts.length; i++) {
    const title = loadedProducts[i].title.toLowerCase();
    if (title.length > 6 && normalized.includes(title)) return i + 1;
  }
  return null;
}

// Cuando esta búsqueda nació de un pedido puntual (ver "refinements" en el
// request — ej. el usuario tocó "buscar con procesador i7" y no hubo
// resultados exactos), el chequeo de honestidad va PRIMERO y en su propia
// oración — enterrarlo entre las demás instrucciones del prompt de sistema
// no alcanzaba en la práctica: el modelo priorizaba la recomendación
// entusiasta y se olvidaba de aclarar que ningún resultado cumple el pedido.
// El saludo ya NO le pide al modelo que elija los picks vía recommend_products
// — los resultados llegan rankeados del pipeline, así que los top N se marcan de
// forma determinística (ver POST) y acá solo se le pide la lectura en texto.
// Motivo: gpt-4o-mini, cuando emite un tool call en el mismo turno, muy seguido
// deja `content` vacío, lo que forzaba una segunda llamada (empty_reply_retry) y
// sumaba 2-4s a la fase "Analizando tu mejor opción".
function buildGreetingPrompt(
  refinements: string[],
  picks: { title: string; outOfBudget: "above" | "below" | null }[],
  budgetLabel: string | null,
  rawInput: string,
  hasSpecificAsk: boolean
): string {
  // El pedido puntual puede venir de un refinement del chat O del texto de la
  // búsqueda directa (ej. "quiero samsung fold" tipeado en el home) — ahí
  // refinements viene vacío pero rawInput tiene el pedido igual. Solo se
  // incluye el chequeo si el pipeline detectó una señal concreta (marca /
  // procesador / formato), para no hacer que el modelo "invente" un pedido
  // incumplido en una búsqueda vaga (mismo riesgo de sobre-disparo que tuvo
  // el guard de alcance).
  const ask = refinements[refinements.length - 1] ?? (rawInput.trim() || null);
  const honestyCheck =
    ask && hasSpecificAsk
      ? `Fijate qué pidió puntualmente el usuario en su búsqueda: "${ask}". Si nombró un modelo, una línea o una característica concreta (ej. "plegable", "gama alta", un modelo puntual) y NINGÚN resultado de abajo la cumple, tu primera oración tiene que decirlo con el nombre concreto de lo que pidió — y si hay opciones así marcadas "fuera de presupuesto" abajo, aclarar que existen pero se pasan del presupuesto (con el monto). Si los resultados SÍ cumplen lo que pidió (ej. son todos de la marca pedida), NO digas que no encontraste nada — arrancá directo con el pick. `
      : "";

  const overCount = picks.filter((p) => p.outOfBudget === "above").length;
  const budgetHint = budgetLabel ? ` (${budgetLabel})` : "";
  const budgetLine =
    picks.length === 0
      ? ""
      : overCount === picks.length
        ? `IMPORTANTE: NINGUNA de estas opciones entra en el presupuesto del usuario${budgetHint}. Tu PRIMERA oración tiene que decirlo claro y sin vueltas, y aclarar que le mostrás las más cercanas. `
        : overCount > 0
          ? `OJO: hay ${overCount} opción(es) marcada(s) "fuera de presupuesto"${budgetHint} entre los resultados — son lo que el usuario pidió pero se pasan de precio. Decilo claro y visible en el texto (qué es y cuánto sale la más barata), y aclarar que igual le mostrás alternativas dentro del presupuesto. `
          : budgetLabel
            ? `TODAS las opciones de abajo entran en el presupuesto del usuario${budgetHint} — NO digas ni sugieras que no encontraste nada dentro del presupuesto. `
            : "";

  const picksLine =
    picks.length > 0
      ? `Los resultados de abajo YA están ordenados de mejor a peor. El mejor es: ${picks[0].title}. `
      : "";

  return (
    honestyCheck +
    budgetLine +
    picksLine +
    "Escribí el saludo inicial: MÁXIMO 2 oraciones EN TOTAL (3 solo si tenés que avisar de algo " +
    "fuera de presupuesto). Hablá SOLO del primer resultado dentro de presupuesto " +
    "(una frase corta de para qué le sirve en la vida real, sin jerga) y una mención al precio. " +
    "REGLA DE PRECIO: si el presupuesto declarado es 'por mes', compará SIEMPRE contra el precio EN " +
    "CUOTAS del producto (Nx $Y/mes), nunca contra el precio de contado — son montos muy distintos y " +
    "confundirlos hace parecer que algo no entra cuando sí entra. Si el producto no tiene plan de " +
    "cuotas publicado, decí el precio de contado aclarando que no tiene cuotas. NO enumeres ni " +
    "comentes los demás resultados uno por uno. Remarcá en **negrita** el nombre del producto. " +
    "Escribí SOLO el texto para el usuario — no llames funciones."
  );
}

// Detección de "redirect determinístico": un mensaje del usuario que ya define
// respuesta + refinement sin necesidad del LLM (cambio de categoría / marca
// nueva / procesador puntual). Es la misma lógica que los bloques homónimos
// dentro del stream — extraída para poder cortar ANTES de gastar en
// getOrBuildPoolIds + enrichWithAnalysis + las llamadas a gpt-4o-mini, cuyo
// texto en estos casos se descartaba entero (visto en vivo: "quiero samsung"
// tardó 25s por dos llamadas al LLM tiradas a la basura).
function detectDeterministicRedirect(
  message: string,
  currentCategory: ProductCategory | null,
  preferredBrands: string[],
  preferredProcessor: string | null,
  budgetLabel: string | null
): { reply: string; suggestedRefinement?: string; highlightFilter?: "store" } | null {
  const impliedCategory = detectCategoryLocally(message);
  if (impliedCategory && currentCategory && impliedCategory !== currentCategory) {
    return { reply: "Listo, te busco eso.", suggestedRefinement: message.trim() };
  }

  const prefBrands = preferredBrands.map((b) => b.toLowerCase());
  const mentionedBrands = detectBrandMentions(message);
  if (mentionedBrands.some((b) => !prefBrands.includes(b.toLowerCase()))) {
    const categoryWord = CATEGORY_WORD[currentCategory ?? "notebook"] ?? "";
    const brandsBold = mentionedBrands.map((b) => `**${b}**`);
    const brandsPhrase =
      brandsBold.length === 1
        ? brandsBold[0]
        : `${brandsBold.slice(0, -1).join(", ")} y ${brandsBold[brandsBold.length - 1]}`;
    return {
      reply: budgetLabel
        ? `Listo, te busco ${brandsPhrase} con ese presupuesto. En los resultados te marco cuáles entran y cuáles se pasan.`
        : `Listo, te busco ${brandsPhrase}.`,
      suggestedRefinement: [categoryWord, mentionedBrands.join(" "), budgetLabel].filter(Boolean).join(" "),
    };
  }

  const prefProcessor = (preferredProcessor ?? "").toLowerCase();
  const mentionedProcessor = detectProcessorMention(message);
  if (mentionedProcessor && !prefProcessor.includes(mentionedProcessor.toLowerCase())) {
    const categoryWord = CATEGORY_WORD[currentCategory ?? "notebook"] ?? "una notebook";
    return {
      reply: budgetLabel
        ? `Listo, busco ${categoryWord} con procesador **${mentionedProcessor}**. En los resultados te marco cuáles entran en tu presupuesto y cuáles se pasan.`
        : `Listo, busco ${categoryWord} con procesador **${mentionedProcessor}**.`,
      suggestedRefinement: [categoryWord, `con procesador ${mentionedProcessor}`, budgetLabel].filter(Boolean).join(" "),
    };
  }

  // Pregunta por una tienda puntual ("en Carrefour hay?", "solo Frávega",
  // "tenés en Musimundo?"). No se re-busca (no hay slot de tienda) — se le
  // indica el filtro de Tienda de la grilla y el cliente lo resalta.
  const store = detectStoreMention(message);
  if (store) {
    return {
      reply: `Para ver solo lo de **${store}**, usá el filtro **Tienda** que está arriba de los resultados — te lo resalté para que lo encuentres.`,
      highlightFilter: "store",
    };
  }

  return null;
}

// ── Preguntas objetivas sobre los resultados ────────────────────────────────
// "¿Cuál tiene más RAM?" / "¿cuál es el más barato?" — antes se contestaban
// dejando que gpt-4o-mini leyera las specs de `loadedProducts` en el prompt y
// redactara la respuesta; el modelo podía confundirse (visto en vivo: alguna
// vez comparó bien, pero es un cálculo objetivo, no algo que convenga
// delegarle a un LLM). Ahora se calcula en código sobre los specs reales —
// determinístico, siempre correcto — y el LLM queda afuera de la ecuación
// para este tipo de pregunta. `productId` del ganador se usa para que el
// cliente resalte esa tarjeta en la grilla (ver spotlightProductId).
interface FactualAttr {
  key: string;
  match: RegExp;
  getValue: (p: EnrichedProduct) => number | null;
  // Recibe el producto además del valor — el procesador necesita mostrar el
  // modelo real ("Core i7-1355U"), no el número de tier interno.
  formatValue: (v: number, p: EnrichedProduct) => string;
  phraseFor: (dir: "max" | "min") => string;
  directionFromMessage?: (message: string) => "max" | "min";
  // Si el mensaje nombra un valor puntual ("cuáles son las de 1TB", "quiero
  // las de 8GB de RAM"), la pregunta no es superlativa (más/menos) sino un
  // filtro por ese valor exacto — ver el branch de filtro en
  // detectFactualQuery. Solo se define para los atributos numéricos donde el
  // valor es inequívoco en el texto (RAM/almacenamiento/cámara/pantalla);
  // batería queda afuera por la ambigüedad mAh/Wh, y precio/procesador/peso
  // no tienen "el valor exacto que pediste" como forma natural de pregunta.
  parseExplicitValue?: (message: string) => number | null;
}

function numSpec(p: EnrichedProduct, field: string): number | null {
  const v = (p.specs as Record<string, unknown> | undefined)?.[field];
  return typeof v === "number" && v > 0 ? v : null;
}

function parseNum(raw: string): number {
  return parseFloat(raw.replace(",", "."));
}

const DEFAULT_MIN_RE = /\b(menos|menor|peor)\b/i;

// notebook/desktop/tablet — mismo orden que TIER_RANK en usageToSpecs.ts
// (no se importa esa constante para no acoplar refine-chat a esa lógica de
// ranking; acá solo hace falta el orden, no el resto del módulo).
const PROCESSOR_TIER_RANK: Record<string, number> = { low: 1, mid: 2, high: 3, enthusiast: 4 };
const PROCESSOR_TIER_LABEL: Record<string, string> = {
  low: "gama de entrada",
  mid: "gama media",
  high: "gama alta",
  enthusiast: "tope de gama",
};

const FACTUAL_ATTRS: FactualAttr[] = [
  {
    key: "ram",
    // "memoria" a secas (sin "interna", que es storage — ver el lookahead
    // negativo) suele referirse a RAM en el uso cotidiano argentino, faltaba
    // y esas preguntas ("¿cuál tiene más memoria?") se iban al LLM en vez de
    // calcularse (reportado en vivo 2026-09-17).
    match: /\bram\b|\bmemoria\b(?!\s+interna)/i,
    getValue: (p) => numSpec(p, "ram_gb"),
    formatValue: (v) => `${v}GB de RAM`,
    phraseFor: (dir) => (dir === "min" ? "el que tiene menos RAM" : "el que tiene más RAM"),
    parseExplicitValue: (m) => {
      const mm = m.match(/(\d+(?:[.,]\d+)?)\s*gb\b/i);
      return mm ? parseNum(mm[1]) : null;
    },
  },
  {
    key: "storage",
    // "disco" es la forma más común en Argentina de decir almacenamiento
    // ("la que tiene más disco") — faltaba y esas preguntas se iban al LLM
    // en vez de calcularse (reportado en vivo 2026-09-10).
    match: /\balmacenamiento\b|\bespacio\b|\bmemoria interna\b|\bdisco\b/i,
    getValue: (p) => numSpec(p, "storage_gb"),
    formatValue: (v) => (v >= 1000 ? `${(v / 1000).toLocaleString("es-AR")}TB` : `${v}GB`) + " de almacenamiento",
    phraseFor: (dir) => (dir === "min" ? "el que tiene menos almacenamiento" : "el que tiene más almacenamiento"),
    parseExplicitValue: (m) => {
      const mm = m.match(/(\d+(?:[.,]\d+)?)\s*(tb|gb)\b/i);
      if (!mm) return null;
      const n = parseNum(mm[1]);
      return mm[2].toLowerCase() === "tb" ? n * 1000 : n;
    },
  },
  {
    key: "battery",
    match: /\bbater[ií]a\b/i,
    getValue: (p) => numSpec(p, "battery_mah") ?? numSpec(p, "battery_wh"),
    formatValue: (v) => (v > 200 ? `${v}mAh` : `${v}Wh`) + " de batería",
    phraseFor: (dir) => (dir === "min" ? "el que tiene menos batería" : "el que tiene más batería"),
  },
  {
    key: "camera",
    match: /\bc[aá]mara\b/i,
    getValue: (p) => numSpec(p, "main_camera_mp"),
    formatValue: (v) => `${v}MP de cámara`,
    phraseFor: (dir) => (dir === "min" ? "el que tiene la cámara de menos megapíxeles" : "el que tiene mejor cámara"),
    parseExplicitValue: (m) => {
      const mm = m.match(/(\d+(?:[.,]\d+)?)\s*mp\b/i);
      return mm ? parseNum(mm[1]) : null;
    },
  },
  {
    key: "processor",
    // Sinónimos de velocidad ("la más rápida", "la más potente") no
    // matcheaban — caían al LLM en vez de calcularse (reportado en vivo
    // 2026-09-17). "veloz"/"potente"/"rendimiento" son formas comunes de
    // pedir esto sin nombrar "procesador".
    match: /\bprocesador\b|\bcpu\b|\br[aá]pid[oa]\b|\bveloz\b|\bpotente\b|\brendimiento\b/i,
    getValue: (p) => {
      const tier = (p.specs as Record<string, unknown> | undefined)?.processor_tier;
      return typeof tier === "string" ? PROCESSOR_TIER_RANK[tier] ?? null : null;
    },
    formatValue: (_v, p) => {
      const s = p.specs as Record<string, unknown>;
      const tier = typeof s.processor_tier === "string" ? s.processor_tier : null;
      const model = typeof s.processor_model === "string" ? s.processor_model : null;
      const label = tier ? PROCESSOR_TIER_LABEL[tier] : null;
      if (model && label) return `${model} (${label})`;
      return model ?? label ?? "sin dato de procesador";
    },
    phraseFor: (dir) => (dir === "min" ? "el de procesador más flojo" : "el de mejor procesador"),
    directionFromMessage: (m) => (/\bpeor\b|\bfloj[oa]\b|\bm[aá]s d[eé]bil\b/i.test(m) ? "min" : "max"),
  },
  {
    key: "price",
    match: /\bprecio\b|\bbarat[oa]\b|\becon[oó]mic[oa]\b|\bcar[oa]\b/i,
    getValue: (p) => (p.price_cash && p.price_cash > 0 ? p.price_cash : null),
    formatValue: (v) => `${formatArs(v)} de contado`,
    phraseFor: (dir) => (dir === "min" ? "el más económico" : "el más caro"),
    directionFromMessage: (m) => (/\bcar[oa]\b/i.test(m) ? "max" : "min"),
  },
  {
    key: "weight",
    match: /\blivian[oa]\b|\bpesad[oa]\b|\bpesa\b|\bpeso\b/i,
    getValue: (p) => numSpec(p, "weight_kg"),
    formatValue: (v) => `${v}kg`,
    phraseFor: (dir) => (dir === "min" ? "el más liviano" : "el más pesado"),
    directionFromMessage: (m) => (/\bpesad[oa]\b|\bpesa\b/i.test(m) ? "max" : "min"),
  },
  {
    key: "screen",
    match: /\bpantalla\b|\bpulgadas\b/i,
    getValue: (p) => numSpec(p, "screen_inches"),
    formatValue: (v) => `${v}"`,
    phraseFor: (dir) => (dir === "min" ? "el de pantalla más chica" : "el de pantalla más grande"),
    directionFromMessage: (m) => (/\bchic[ao]\b|\bpeque[ñn]/i.test(m) ? "min" : "max"),
    parseExplicitValue: (m) => {
      const mm = m.match(/(\d+(?:[.,]\d+)?)\s*(pulgadas|"|'')/i);
      return mm ? parseNum(mm[1]) : null;
    },
  },
];

function detectFactualQuery(
  message: string,
  products: EnrichedProduct[]
): { productId: string; reply: string; tiedProductIds?: string[] } | null {
  // "Cuál/cuáles/qué X" (superlativo o filtro) y también "quiero/dame/
  // mostrame/tenés/hay las de X" (solo tiene sentido como filtro por valor
  // puntual — ver más abajo, parseExplicitValue) — reportado en vivo
  // 2026-09-11: "quiero las de 1TB" no disparaba nada y se iba al LLM.
  if (!/\b(cu[aá]l|cu[aá]les|qu[eé]|quiero|quisiera|dame|mostrame|ten[eé]s|hay)\b/i.test(message)) return null;
  const attrs = FACTUAL_ATTRS.filter((a) => a.match.test(message));
  if (attrs.length === 0) return null;
  // Dos o más atributos a la vez ("pantalla más grande y más memoria", "8GB
  // de RAM con la mejor cámara") — pedido en vivo 2026-09-11: antes solo se
  // tomaba el primer atributo que matcheaba y el resto del pedido se perdía
  // silenciosamente. Lógica separada (combina filtros exactos + ranking por
  // percentil cuando hay más de un atributo pedido), ver detectCombinedFactualQuery.
  if (attrs.length > 1) return detectCombinedFactualQuery(message, products, attrs);
  const attr = attrs[0];

  // Filtro por valor exacto ("cuáles son las de 1TB", "quiero las de 8GB de
  // RAM"): no es una pregunta superlativa (más/menos), es un pedido de
  // recorte de los resultados actuales a los que matchean ese valor puntual.
  const explicitValue = attr.parseExplicitValue?.(message) ?? null;
  if (explicitValue != null) {
    const matches = products.filter((p) => {
      const v = attr.getValue(p);
      return v != null && Math.abs(v - explicitValue) < 0.05;
    });
    // Sin matches: no inventar "no hay ninguna" con lógica propia — se deja
    // caer al LLM, que tiene el resto del pool para ofrecer alternativas.
    if (matches.length === 0) return null;
    const valueLabel = attr.formatValue(explicitValue, matches[0]);
    const reply =
      matches.length === 1
        ? `Encontré 1 opción con ${valueLabel}: la **${matches[0].title}**.`
        : `Encontré ${matches.length} opciones con ${valueLabel}. Te marco la **${matches[0].title}**.`;
    return {
      productId: matches[0].id,
      reply,
      tiedProductIds: matches.length > 1 ? matches.map((p) => p.id) : undefined,
    };
  }

  const direction = attr.directionFromMessage?.(message) ?? (DEFAULT_MIN_RE.test(message) ? "min" : "max");

  const candidates = products
    .map((p) => ({ p, v: attr.getValue(p) }))
    .filter((x): x is { p: EnrichedProduct; v: number } => x.v != null);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => (direction === "max" ? b.v - a.v : a.v - b.v));
  const { chosen, caveat } = pickWithinBudget(candidates);
  const best = chosen;
  // Empate exacto con el segundo: no afirmar un único ganador sin aclararlo.
  const tied = candidates.filter((c) => c.v === best.v);

  const valueLabel = attr.formatValue(best.v, best.p);
  let reply =
    tied.length > 1
      ? `Hay ${tied.length} opciones empatadas en esto, pero te marco **${best.p.title}**: tiene ${valueLabel}.`
      : `${capitalize(attr.phraseFor(direction))} es **${best.p.title}**, con ${valueLabel}.`;
  if (caveat) reply += caveat;

  return {
    productId: best.p.id,
    reply,
    tiedProductIds: tied.length > 1 ? tied.map((c) => c.p.id) : undefined,
  };
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

// 2b (pedido 2026-09-17): ante una pregunta factual, no afirmar sin aclarar
// un ganador que en realidad se pasa del presupuesto elegido. El pool normal
// (sin marca/procesador puntual pedido) ya viene acotado a presupuesto —
// ningún candidato trae out_of_budget, así que esto NO agrega fricción en el
// caso general. Solo dispara en el caso de transparencia (wantsExactSpec,
// más arriba en el archivo) donde el pipeline sí deja pasar opciones fuera de
// presupuesto etiquetadas.
function pickWithinBudget<T extends { p: EnrichedProduct }>(sortedByAttr: T[]): { chosen: T; caveat: string | null } {
  const top = sortedByAttr[0];
  if (!top.p.out_of_budget) return { chosen: top, caveat: null };
  const inBudget = sortedByAttr.find((c) => !c.p.out_of_budget);
  if (!inBudget) return { chosen: top, caveat: null };
  return {
    chosen: inBudget,
    caveat: ` Ojo que **${top.p.title}** cumple mejor esto, pero se pasa de tu presupuesto — por eso te marco esta, que sí entra.`,
  };
}

// Pregunta factual con dos o más atributos a la vez. Cada atributo pedido
// resuelve a una de dos cosas:
// - Valor exacto nombrado ("8GB de RAM") → filtro duro (AND entre todos).
// - Sin valor, solo dirección ("más memoria", "pantalla más grande") →
//   entra al ranking combinado.
// Los valores crudos de RAM/pantalla/batería no son comparables entre sí (GB
// vs pulgadas vs mAh), así que el ranking combinado no suma valores: suma la
// POSICIÓN (rank) de cada producto dentro de cada atributo por separado —
// mismo principio que RRF en hybrid_search (ver db/vps/schema.sql) — y ordena
// por esa suma (menor = mejor en promedio en todo lo pedido).
function detectCombinedFactualQuery(
  message: string,
  products: EnrichedProduct[],
  attrs: FactualAttr[]
): { productId: string; reply: string; tiedProductIds?: string[] } | null {
  const requested = attrs.map((attr) => ({
    attr,
    explicitValue: attr.parseExplicitValue?.(message) ?? null,
    direction: attr.directionFromMessage?.(message) ?? (DEFAULT_MIN_RE.test(message) ? "min" : ("max" as const)),
  }));

  const exact = requested.filter((r) => r.explicitValue != null);
  const ranked = requested.filter((r) => r.explicitValue == null);

  let pool = products;
  for (const r of exact) {
    pool = pool.filter((p) => {
      const v = r.attr.getValue(p);
      return v != null && Math.abs(v - r.explicitValue!) < 0.05;
    });
  }
  if (exact.length > 0 && pool.length === 0) return null;

  // Solo filtros exactos (ej. "las de 8GB de RAM y 256GB de almacenamiento"),
  // sin ningún atributo superlativo — mismo formato de reply que el filtro de
  // un solo atributo.
  if (ranked.length === 0) {
    const valueLabel = exact.map((r) => r.attr.formatValue(r.explicitValue!, pool[0])).join(" y ");
    const reply =
      pool.length === 1
        ? `Encontré 1 opción con ${valueLabel}: la **${pool[0].title}**.`
        : `Encontré ${pool.length} opciones con ${valueLabel}. Te marco la **${pool[0].title}**.`;
    return { productId: pool[0].id, reply, tiedProductIds: pool.length > 1 ? pool.map((p) => p.id) : undefined };
  }

  const withValues = pool
    .map((p) => ({ p, values: ranked.map((r) => r.attr.getValue(p)) }))
    .filter((x): x is { p: EnrichedProduct; values: number[] } => x.values.every((v) => v != null));
  if (withValues.length === 0) return null;

  const rankSumById = new Map<string, number>();
  ranked.forEach((r, i) => {
    const sorted = [...withValues].sort((a, b) =>
      r.direction === "max" ? b.values[i] - a.values[i] : a.values[i] - b.values[i]
    );
    sorted.forEach((x, position) => rankSumById.set(x.p.id, (rankSumById.get(x.p.id) ?? 0) + position));
  });

  const scored = withValues
    .map((x) => ({ p: x.p, values: x.values, score: rankSumById.get(x.p.id)! }))
    .sort((a, b) => a.score - b.score);
  const { chosen, caveat } = pickWithinBudget(scored);
  const best = chosen;
  const tied = scored.filter((s) => s.score === best.score);

  const valueLabel = [
    ...exact.map((r) => r.attr.formatValue(r.explicitValue!, best.p)),
    ...ranked.map((r, i) => r.attr.formatValue(best.values[i], best.p)),
  ].join(" y ");
  const combinedPhrase = ranked.map((r) => r.attr.phraseFor(r.direction)).join(" y a la vez ");
  let reply =
    tied.length > 1
      ? `Hay ${tied.length} opciones empatadas en esto, pero te marco **${best.p.title}**: tiene ${valueLabel}.`
      : `${capitalize(combinedPhrase)} es **${best.p.title}**, con ${valueLabel}.`;
  if (caveat) reply += caveat;

  return {
    productId: best.p.id,
    reply,
    tiedProductIds: tied.length > 1 ? tied.map((s) => s.p.id) : undefined,
  };
}

const FALLBACK_REPLY_GREETING = "Hola! Soy tu asesor técnico — puedo recomendarte qué elegir de estos resultados o buscar de nuevo si nada te convence. ¿Qué necesitás?";
const FALLBACK_REPLY_ERROR = "No pude procesar tu pregunta. Intentá de nuevo.";

// Jugada #12: respuesta determinística para el turno de recomendación cuando
// gpt-4o-mini emite la tool call con `content` vacío. Antes eso disparaba una
// 2da llamada al LLM (empty_reply_retry, +2-4s y a veces encadenada); acá se
// arma el texto con los picks que el modelo YA eligió + su lectura de specs en
// lenguaje llano, sin round-trip extra.
function buildDeterministicPickReply(picks: EnrichedProduct[]): string {
  if (picks.length === 0) {
    // Sin picks y sin texto del modelo — NO tirar el "No pude procesar tu
    // pregunta" (visto en vivo con "quiero difusor" y "en carrefour hay
    // alguno?": preguntas legítimas que terminaban en un error sin salida).
    return "Puedo contarte de cualquiera de los equipos de la lista o buscar algo distinto — decime qué necesitás.";
  }
  if (picks.length === 1) {
    const p = picks[0];
    const whyRaw = (p.spec_highlights_simple ?? [])[0] ?? p.selection_reason ?? "";
    // spec_highlights_simple viene con formato "Etiqueta: texto" (ej. "Memoria:
    // justa pero cómoda para jugar...") — pegado tras dos puntos quedaba
    // "Te dejo la **Título**: Memoria: ..." (arranca con media frase). Se saca
    // la etiqueta corta del principio y se usa guión como conector.
    const why = whyRaw.replace(/^[^.:]{1,24}:\s*/, "").replace(/\s*\.$/, "").trim();
    return `Te dejo la **${p.title}**${why ? ` — ${why}.` : "."} La tenés abajo con el detalle.`;
  }
  const names = picks.slice(0, 3).map((p) => `**${p.title}**`);
  const list =
    names.length === 2 ? names.join(" y ") : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
  return `Para lo que buscás te marco ${list}. Están abajo con la lectura de specs en lenguaje simple para comparar.`;
}

// Saludo determinístico para el caso "pediste una marca/procesador puntual + hay
// presupuesto": gpt-4o-mini acá miente seguido — con "quiero iphone" hasta
// $110k/mes, 2 iPhone 13 ENTRABAN y el texto decía "no encontré ningún Apple en
// tu presupuesto" (visto en vivo). El dato por-pick (out_of_budget) es
// confiable; el texto del modelo no. Se arma la frase con los hechos.
function buildGreetingBudgetReply(
  inBudget: EnrichedProduct[],
  over: EnrichedProduct[],
  budgetLabel: string
): string {
  const overNote = (() => {
    if (over.length === 0) return "";
    const o = over[0];
    const plural = over.length > 1;
    const extra = plural ? ` y ${over.length - 1} más` : "";
    return ` La **${o.title}**${extra} también aparece${plural ? "n" : ""}, pero se pasa${
      plural ? "n" : ""
    } de precio — la ves marcada abajo.`;
  })();

  if (inBudget.length === 0) {
    return `Ninguna de estas opciones entra en tu presupuesto de ${budgetLabel} — te muestro las más cercanas.${overNote}`;
  }

  const p = inBudget[0];
  const whyRaw = (p.spec_highlights_simple ?? [])[0] ?? p.selection_reason ?? "";
  const why = whyRaw
    .replace(/^[^:]+:\s*/, "")
    .replace(/\s*\.\s*$/, "")
    .trim();
  return `La **${p.title}** entra en tu presupuesto de ${budgetLabel}${why ? ` — ${why}` : ""}.${overNote}`;
}

function toRecommendedProduct(p: EnrichedProduct): AlternativeProduct {
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
    spec_highlights: p.spec_highlights ?? [],
    spec_highlights_simple: p.spec_highlights_simple ?? [],
    specs: p.specs,
    upgrade_note: getUpgradeNote(p.category, p.specs, p.upgradeable),
    out_of_budget: p.out_of_budget,
    also_at: p.also_at,
    price_verdict: p.price_verdict ?? null,
    sponsored: p.sponsored ?? false,
  };
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const { success } = await checkRateLimit("refine-chat", getClientIp(request), 20, 60);
    if (!success) {
      return NextResponse.json({ error: "Demasiadas consultas, esperá un momento" }, { status: 429 });
    }

    const body = (await request.json()) as ChatRequest;
    const { rawInput, useCases, budgetMax, category, products, shareToken, messages, message, greeting, refinements, askAbout, visitId } = body;

    if ((!greeting && !message?.trim()) || !products || products.length === 0) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
    }

    // El saludo es determinístico para un share_token dado — se cachea para
    // no volver a llamar al LLM en un reload o al reabrir un link compartido.
    if (greeting && shareToken) {
      const cachedGreeting = await getChatGreetingCache(shareToken);
      if (cachedGreeting) {
        return NextResponse.json(cachedGreeting);
      }
    }

    const search = shareToken ? await getSearchByShareToken(shareToken) : null;

    // Preferí siempre el presupuesto de search.slots (fuente autoritativa,
    // distingue contado de cuotas) por sobre el budgetMax plano que manda el
    // cliente — ver describeBudgetForChat.
    const budgetLabel =
      describeBudgetForChat(search?.slots) ?? (budgetMax ? `hasta $${budgetMax.toLocaleString("es-AR")} ARS` : null);

    // ── Atajo determinístico ────────────────────────────────────────────────
    // Si el mensaje del usuario es un pedido de cambio de categoría / marca
    // nueva / procesador puntual, la respuesta y el refinement ya están
    // decididos SIN LLM (los bloques homónimos más abajo hacían exactamente
    // esto, pero DESPUÉS de correr getOrBuildPoolIds + enrichWithAnalysis + 1-2
    // llamadas a gpt-4o-mini cuyo texto se terminaba descartando — visto en
    // vivo: "quiero samsung" tardó 25s). Se resuelve acá y se saltea todo lo
    // caro: el usuario ve la respuesta al instante y la búsqueda nueva la
    // dispara suggestedRefinement igual.
    const shortCircuit =
      !greeting && !askAbout && message?.trim()
        ? detectDeterministicRedirect(
            message,
            category ?? search?.slots.category ?? null,
            search?.slots.preferences.brands_preferred ?? [],
            search?.slots.preferences.processor_model_preferred ?? null,
            budgetLabel
          )
        : null;
    if (shortCircuit) {
      const enc = new TextEncoder();
      const scStream = new ReadableStream<Uint8Array>({
        start(controller) {
          const payload: ChatGreetingPayload = {
            reply: shortCircuit.reply,
            recommendedProducts: undefined,
            topPickIds: undefined,
            suggestedRefinement: shortCircuit.suggestedRefinement,
            highlightFilter: shortCircuit.highlightFilter,
          };
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "text", value: shortCircuit.reply })}\n\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done", ...payload })}\n\n`));
          controller.close();
        },
      });
      persistChatTurn({
        shareToken,
        visitId,
        userMessage: message,
        assistantReply: shortCircuit.reply,
        greeting: false,
        suggestedRefinement: shortCircuit.suggestedRefinement,
        durationMs: Date.now() - startedAt,
      });
      console.log(
        `[CHAT] turn shareToken=${shareToken} greeting=false shortCircuit=true durationMs=${Date.now() - startedAt} ` +
          `userMessage=${JSON.stringify(message.slice(0, 200))} recommended=0 topPicks=[] ` +
          `suggestedRefinement=${JSON.stringify(shortCircuit.suggestedRefinement ?? null)} replyChars=${shortCircuit.reply.length}` +
          (shortCircuit.highlightFilter ? ` highlightFilter=${shortCircuit.highlightFilter}` : "")
      );
      return new Response(scStream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    // Resumen del pool completo (incluye productos que el usuario todavía no
    // cargó scrolleando) — si no hay shareToken o el pool no se puede
    // recuperar, se cae de vuelta a resumir solo lo que mandó el cliente.
    const poolIds = shareToken ? await getOrBuildPoolIds(shareToken) : [];
    const rawPoolProducts = poolIds.length > 0 ? await getProductsByIds(poolIds) : products;

    // Si el usuario refinó a una marca puntual, el chat solo habla de esa
    // marca. El pool rankeado prioriza la marca pedida pero igual arrastra
    // otras más abajo, y una pregunta agregada ("¿cuál tiene más RAM?")
    // terminaba respondiéndose con un equipo de otra marca (visto en vivo
    // 2026-09-10: refinó a Apple y el chat contestó "Motorola Edge 50 12GB").
    // Se acota el pool a la(s) marca(s) preferida(s) antes de resumirlo y de
    // cargar el detalle. Si el filtro lo deja vacío (marca ausente en las
    // filas de la DB), se usa el pool sin tocar.
    const chatPreferredBrands = (search?.slots.preferences.brands_preferred ?? []).map((b) => b.toLowerCase());
    const brandScopedPool =
      chatPreferredBrands.length > 0
        ? rawPoolProducts.filter((p) => !!p.brand && chatPreferredBrands.includes(p.brand.toLowerCase()))
        : rawPoolProducts;
    const poolProducts = brandScopedPool.length > 0 ? brandScopedPool : rawPoolProducts;
    const poolSummary = summarizePool(poolProducts);

    // El detalle completo (con el que el modelo puede realmente recomendar,
    // vía RESULTADO N) tiene que salir del pool rankeado completo, no solo de
    // `products` (la tanda inicial de 6 que ya tiene el cliente) — si no,
    // pedidos como "el de mejor procesador" o un modelo puntual fallan en
    // silencio apenas ese producto está más abajo en el pool que la tanda
    // inicial. quality_price_score/analysis ya viene cacheado en DB para la
    // mayoría (24hs) — solo los nunca analizados antes disparan una llamada
    // al LLM acá, mismo patrón que ya usa /api/search/[token]/more.
    const loadedProducts: EnrichedProduct[] = search
      ? await enrichWithAnalysis(
          poolProducts.slice(0, MAX_DETAILED_PRODUCTS).map((p) => ({ ...p, similarity: 0, final_score: 0 })),
          search.slots
        )
      : products.slice(0, MAX_DETAILED_PRODUCTS);

    // El pool que rearma refine-chat viene de la DB (getProductsByIds), que NO
    // persiste la etiqueta out_of_budget que puso lib/search/pipeline.ts. Esa
    // etiqueta solo la arma el pipeline para los productos que él mismo inserta
    // "por transparencia" cuando la búsqueda nació de un pedido puntual de
    // marca/procesador — así que en ese caso se re-deriva acá (mismo criterio,
    // ver classifyBudgetFit) para que el saludo lo diga y las tarjetas del chat
    // lo marquen. En una búsqueda normal (sin marca/procesador pedido) no se
    // toca nada: el pipeline nunca taguea ahí.
    const wantsExactSpec = !!(
      search?.slots.preferences.processor_model_preferred ||
      (search?.slots.preferences.brands_preferred.length ?? 0) > 0
    );
    if (wantsExactSpec && search) {
      for (const p of loadedProducts) {
        p.out_of_budget = classifyBudgetFit(p, search.slots);
      }
    }

    // Veredicto de precio vs. mediana de la config (jugada #15) — mediana del
    // catálogo (cacheada 6h), con el pool como fallback.
    const chatConfigMedians = await getCachedConfigPriceMedians().catch(() => ({}));
    const chatPriceVerdicts = buildPriceVerdicts(poolProducts, chatConfigMedians);
    for (const p of loadedProducts) p.price_verdict = chatPriceVerdicts.get(p.id) ?? null;

    // Pregunta objetiva sobre los resultados ya cargados ("¿cuál tiene más
    // RAM?", "¿cuál es el más barato?") — se resuelve en código, sin llamar al
    // LLM, y le indica al cliente qué tarjeta resaltar (spotlightProductId).
    // Corre DESPUÉS de loadedProducts (necesita los specs reales) pero antes
    // de armar el prompt — mismo criterio de "cortar antes de gastar" que el
    // shortCircuit de arriba.
    const factualAnswer = !greeting && !askAbout && message?.trim() ? detectFactualQuery(message, loadedProducts) : null;
    if (factualAnswer) {
      const enc = new TextEncoder();
      const faStream = new ReadableStream<Uint8Array>({
        start(controller) {
          const payload: ChatGreetingPayload = {
            reply: factualAnswer.reply,
            recommendedProducts: undefined,
            topPickIds: undefined,
            suggestedRefinement: undefined,
            spotlightProductId: factualAnswer.productId,
            tiedProductIds: factualAnswer.tiedProductIds,
          };
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "text", value: factualAnswer.reply })}\n\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done", ...payload })}\n\n`));
          controller.close();
        },
      });
      persistChatTurn({
        shareToken,
        visitId,
        userMessage: message,
        assistantReply: factualAnswer.reply,
        greeting: false,
        factualAnswer: true,
        spotlightProductId: factualAnswer.productId,
        durationMs: Date.now() - startedAt,
      });
      console.log(
        `[CHAT] turn shareToken=${shareToken} greeting=false factualAnswer=true durationMs=${Date.now() - startedAt} ` +
          `userMessage=${JSON.stringify(message.slice(0, 200))} spotlightProductId=${factualAnswer.productId} replyChars=${factualAnswer.reply.length}`
      );
      return new Response(faStream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    // Picks deterministas del saludo: el pool ya viene rankeado, así que los
    // primeros N son los picks. No se delega al modelo (ver buildGreetingPrompt).
    const GREETING_PICK_COUNT = 4;
    const greetingPickCount = greeting ? Math.min(GREETING_PICK_COUNT, loadedProducts.length) : 0;
    const greetingPicks = loadedProducts
      .slice(0, greetingPickCount)
      .map((p) => ({ title: p.title, outOfBudget: p.out_of_budget ?? null }));

    const systemPrompt = buildSearchRefineChatPrompt({
      rawInput: rawInput ?? "",
      useCases: useCases ?? [],
      budgetLabel,
      category: category ?? null,
      loadedProducts,
      poolSummary,
      refinements: refinements ?? [],
    });

    // Últimos 10 turnos, mismo criterio que el chat del comparador.
    const history = messages.slice(-10).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.text,
    }));

    const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history,
      {
        role: "user",
        content: greeting
          ? buildGreetingPrompt(
              refinements ?? [],
              greetingPicks,
              budgetLabel,
              rawInput ?? "",
              !!(
                (search?.slots.preferences.brands_preferred.length ?? 0) > 0 ||
                search?.slots.preferences.processor_model_preferred ||
                /\bfold(able)?\b|\bflip\b|\bplegable\b/i.test(rawInput ?? "")
              )
            )
          : message,
      },
    ];

    const encoder = new TextEncoder();
    const toolCallAccumulators = new Map<number, ToolCallAccumulator>();
    let replyText = "";

    // Siembra el pick determinista del saludo como si fuera un tool call real,
    // para que resolveToolCalls y las redes de seguridad de abajo funcionen
    // igual — sin haberle pasado `tools` al modelo en esa llamada.
    if (greeting && greetingPickCount > 0) {
      toolCallAccumulators.set(-1, {
        name: "recommend_products",
        arguments: JSON.stringify({
          resultNumbers: Array.from({ length: greetingPickCount }, (_, i) => i + 1),
        }),
      });
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        function send(event: Record<string, unknown>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }

        async function streamCompletion(
          streamMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          withTools: boolean,
          maxTokens = 500
        ) {
          const openaiStream = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: streamMessages,
            max_tokens: maxTokens,
            temperature: 0.7,
            stream: true,
            ...(withTools ? { tools: SEARCH_REFINE_CHAT_TOOLS } : {}),
          });
          for await (const chunk of openaiStream) {
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) {
              replyText += delta.content;
              send({ type: "text", value: delta.content });
            }
            if (!withTools) continue;
            for (const toolCall of delta?.tool_calls ?? []) {
              const acc = toolCallAccumulators.get(toolCall.index) ?? { arguments: "" };
              if (toolCall.function?.name) acc.name = toolCall.function.name;
              if (toolCall.function?.arguments) acc.arguments += toolCall.function.arguments;
              toolCallAccumulators.set(toolCall.index, acc);
            }
          }
        }

        try {
          // El saludo NO pasa `tools`: los picks ya están sembrados de forma
          // determinística, así se evita el content vacío que en el saludo
          // disparaba casi siempre el empty_reply_retry. Los turnos con mensaje
          // real del usuario sí usan tools (el modelo tiene que decidir qué
          // recomendar / si buscar de nuevo).
          await streamCompletion(baseMessages, !greeting, greeting ? 220 : 500);

          // Ver extractLeakedToolCall: a veces el modelo, además de (o en vez
          // de) la tool call real, "narra" la llamada como texto al final.
          // Se limpia el texto SIEMPRE que aparezca el patrón (haya o no un
          // tool call real ya capturado) — el evento "done" manda el texto ya
          // limpio y el cliente lo usa para corregir lo que ya streameó. Solo
          // se usa como fuente de datos si no hay un tool call real todavía,
          // para no pisar uno válido con una narración duplicada. No corre en
          // el saludo: ahí no se pasan tools y los picks ya vienen sembrados,
          // así que no hay nada que rescatar (y el texto menciona los títulos
          // a propósito, lo que daría falsos positivos de "leaked tool call").
          if (!greeting) {
            const salvage = extractLeakedToolCall(replyText, loadedProducts);
            if (salvage.toolName && salvage.args) {
              const hadRealToolCall = toolCallAccumulators.size > 0;
              replyText = salvage.cleanText;
              if (!hadRealToolCall) {
                toolCallAccumulators.set(-1, { name: salvage.toolName, arguments: JSON.stringify(salvage.args) });
              }
              console.log(
                `[CHAT] leaked_tool_call shareToken=${shareToken} toolName=${salvage.toolName} usedAsFallback=${!hadRealToolCall}`
              );
            }
          }

          // A veces gpt-4o-mini llama a la función pero deja "content" vacío
          // (prioriza la tool call en vez de combinarla con texto). En ese
          // caso se pide una segunda pasada corta, ya sabiendo qué se
          // recomendó, solo para no dejar la tarjeta sin explicación. No aplica
          // al saludo (ahí no se pasan tools, el texto vacío cae al fallback).
          if (!greeting && !replyText.trim() && toolCallAccumulators.size > 0) {
            const { topPickIds: emptyReplyPickIds, suggestedRefinement: emptyReplyRefinement } =
              resolveToolCalls(toolCallAccumulators, loadedProducts);
            const picks = (emptyReplyPickIds ?? [])
              .map((id) => loadedProducts.find((p) => p.id === id))
              .filter((p): p is EnrichedProduct => !!p);
            console.log(
              `[CHAT] empty_reply_deterministic shareToken=${shareToken} picks=${picks.length}` +
                (emptyReplyRefinement ? " withRefinement=1" : "")
            );
            // Si el modelo eligió re-buscar (suggest_refinement) pero no escribió
            // nada, el texto tiene que reflejar ESO, no un listado de picks ni un
            // error genérico.
            replyText =
              picks.length === 0 && emptyReplyRefinement
                ? "Dale, busco eso y te muestro lo que haya."
                : buildDeterministicPickReply(picks);
            send({ type: "text", value: replyText });
          }
        } catch (error) {
          console.error("[POST /api/search/refine-chat] stream error", error);
          if (!replyText.trim()) {
            replyText = greeting ? FALLBACK_REPLY_GREETING : FALLBACK_REPLY_ERROR;
            send({ type: "text", value: replyText });
          }
        }

        // El texto va tal cual: la burbuja del chat (ChatMessageText) renderiza
        // el markdown de **negrita** que el prompt le pide al modelo para
        // remarcar productos/modelos/marcas.
        let reply = replyText.trim() || (greeting ? FALLBACK_REPLY_GREETING : FALLBACK_REPLY_ERROR);

        // Saludo + pedido puntual de marca/procesador + presupuesto: no se
        // confía en el texto de gpt-4o-mini para el veredicto de presupuesto
        // (miente seguido, ver buildGreetingBudgetReply). Se rearma con los
        // hechos: out_of_budget por pick es la fuente de verdad.
        if (greeting && budgetLabel && wantsExactSpec && greetingPickCount > 0) {
          const picks = loadedProducts.slice(0, greetingPickCount);
          const reqBrands = (search?.slots.preferences.brands_preferred ?? []).map((b) => b.toLowerCase());
          // Pidió una marca y NINGÚN pick es de esa marca (ej. "iphone en
          // carrefour" y el pool no trajo ningún Apple) — decirlo, no recomendar
          // un Android como si fuera lo pedido.
          const brandUnmet =
            reqBrands.length > 0 &&
            !picks.some((p) => p.brand && reqBrands.some((b) => p.brand!.toLowerCase().includes(b)));
          if (brandUnmet) {
            const brandLabel = (search?.slots.preferences.brands_preferred ?? []).join(" / ");
            reply = `No encontré **${brandLabel}** para esta búsqueda — te muestro lo más parecido dentro de tu presupuesto de ${budgetLabel}.`;
          } else {
            reply = buildGreetingBudgetReply(
              picks.filter((p) => p.out_of_budget !== "above"),
              picks.filter((p) => p.out_of_budget === "above"),
              budgetLabel
            );
          }
        }

        const resolved = resolveToolCalls(toolCallAccumulators, loadedProducts);
        let recommendedProducts = resolved.recommendedProducts;
        let topPickIds = resolved.topPickIds;
        let topPickTitles = resolved.topPickTitles;
        let { suggestedRefinement } = resolved;

        // Cambio de categoría determinístico (ej. el usuario venía viendo
        // notebooks y escribe "y para celulares"): el prompt ya le pide al
        // modelo llamar suggest_refinement con un pedido autónomo de la
        // categoría nueva, pero puede fallar e intentar recomendar algo de
        // la categoría ACTUAL en su lugar — mismo tipo de fallo que con
        // marca (abajo). Si el mensaje crudo del usuario implica una
        // categoría distinta a la de esta búsqueda, se fuerza el cambio acá,
        // sin depender de que el modelo lo haya notado. Nunca aplica al
        // saludo (no tiene mensaje propio del usuario).
        const currentCategory = category ?? search?.slots.category ?? null;
        // askAbout: consulta sobre un equipo puntual — no es un cambio de
        // categoría/marca/procesador aunque el texto nombre todo eso.
        const impliedCategory = !greeting && !askAbout ? detectCategoryLocally(message) : null;
        const categoryChanged = !!(impliedCategory && currentCategory && impliedCategory !== currentCategory);
        if (categoryChanged) {
          recommendedProducts = undefined;
          topPickIds = undefined;
          topPickTitles = undefined;
          suggestedRefinement = message.trim();
        }

        const currentPreferredBrands = (search?.slots.preferences.brands_preferred ?? []).map((b) => b.toLowerCase());

        // Mención de marca nueva determinística (ej. "busca iphone", "tenés
        // Apple?"): mismo problema que el cambio de categoría de arriba — el
        // prompt le pide al modelo llamar suggest_refinement, pero puede no
        // hacerlo y seguir mostrando lo que ya tenía cargado sin buscar de
        // verdad (bug reportado en vivo: con la conversación en Samsung,
        // "busca iphone" siguió recomendando los mismos 2 Samsung de
        // siempre, sin disparar ninguna búsqueda nueva). Si el mensaje
        // menciona una marca que NO es la ya preferida en esta búsqueda, se
        // fuerza acá una búsqueda nueva para esa marca, sin depender del
        // modelo.
        // Todas las marcas nombradas, no solo la primera ("quiero iphone y
        // samsung" antes perdía Samsung o iPhone según el orden).
        const mentionedBrands = !greeting && !askAbout && !categoryChanged ? detectBrandMentions(message) : [];
        const newBrands = mentionedBrands.filter((b) => !currentPreferredBrands.includes(b.toLowerCase()));
        const brandMentionIsNew = newBrands.length > 0;
        if (brandMentionIsNew) {
          recommendedProducts = undefined;
          topPickIds = undefined;
          topPickTitles = undefined;
          const categoryWord = CATEGORY_WORD[currentCategory ?? "notebook"] ?? "";
          // Reusa budgetLabel (contado/cuotas ya desambiguado, ver arriba) en vez
          // de reconstruir el monto a mano — esta frase se vuelve el rawInput de
          // una búsqueda nueva vía slot-filling, así que si el presupuesto era
          // mensual tiene que decir "por mes" acá también, o el slot-filling
          // puede reinterpretarlo como precio de contado.
          suggestedRefinement = [categoryWord, mentionedBrands.join(" "), budgetLabel].filter(Boolean).join(" ");
          // Reemplaza la prosa del LLM (que respondió contra el pool viejo y
          // suele editorializar "no tengo X en tu rango"). El pedido se resuelve
          // en la búsqueda nueva que dispara suggestedRefinement; el aviso de
          // presupuesto lo dan las tarjetas (out_of_budget), no el texto.
          const brandsBold = mentionedBrands.map((b) => `**${b}**`);
          const brandsPhrase =
            brandsBold.length === 1
              ? brandsBold[0]
              : `${brandsBold.slice(0, -1).join(", ")} y ${brandsBold[brandsBold.length - 1]}`;
          reply = budgetLabel
            ? `Listo, te busco ${brandsPhrase} con ese presupuesto. En los resultados te marco cuáles entran y cuáles se pasan.`
            : `Listo, te busco ${brandsPhrase}.`;
        }

        // Mención de procesador puntual determinística (ej. "quiero con i7",
        // "que sea Ryzen 7", "una con core 7") — mismo problema y misma
        // solución que la marca de arriba, pero sin fallback previo: el prompt
        // le pide al modelo llamar suggest_refinement, y en su lugar muy seguido
        // pide permiso ("¿querés que busque i7?") y tira solo el chip, o
        // recomienda del pool viejo sin buscar. Si el mensaje nombra un
        // procesador que NO es el ya preferido en esta búsqueda, se fuerza acá
        // la re-búsqueda y una respuesta seca, sin pedir permiso. Gateado por
        // !brandMentionIsNew para no pisar el bloque de marca cuando se piden
        // las dos cosas a la vez (la marca ya arma su propia frase de búsqueda).
        const currentPreferredProcessor = (search?.slots.preferences.processor_model_preferred ?? "").toLowerCase();
        const mentionedProcessor =
          !greeting && !askAbout && !categoryChanged && !brandMentionIsNew ? detectProcessorMention(message) : null;
        const processorMentionIsNew =
          !!mentionedProcessor && !currentPreferredProcessor.includes(mentionedProcessor.toLowerCase());
        if (processorMentionIsNew) {
          recommendedProducts = undefined;
          topPickIds = undefined;
          topPickTitles = undefined;
          const categoryWord = CATEGORY_WORD[currentCategory ?? "notebook"] ?? "una notebook";
          // Misma lógica que la marca: la frase se vuelve el rawInput de una
          // búsqueda nueva vía slot-filling, así que el presupuesto tiene que ir
          // con "por mes"/"al contado" ya desambiguado (budgetLabel).
          suggestedRefinement = [categoryWord, `con procesador ${mentionedProcessor}`, budgetLabel]
            .filter(Boolean)
            .join(" ");
          reply = budgetLabel
            ? `Listo, busco ${categoryWord} con procesador **${mentionedProcessor}**. En los resultados te marco cuáles entran en tu presupuesto y cuáles se pasan.`
            : `Listo, busco ${categoryWord} con procesador **${mentionedProcessor}**.`;
        }

        // Red de seguridad determinística: el modelo a veces dice "no
        // encontré ninguna [marca]" (o directamente recomienda otra cosa sin
        // mencionarla) AUNQUE los productos cargados YA incluyan esa marca
        // (bug real reproducido en vivo dos veces: pidió Samsung con los 20
        // resultados cargados siendo Samsung y dijo que no había ninguna;
        // pidió Dell habiendo una Dell cargada y recomendó una HP sin
        // mencionarla). Solo aplica en el saludo (justo después de que la
        // búsqueda con esa marca ya se hizo) — aplicarlo en cualquier
        // mensaje posterior usaba la marca de la búsqueda VIEJA para
        // "corregir" respuestas sobre algo totalmente distinto que el
        // usuario acababa de preguntar (bug reportado en vivo: preguntó por
        // Apple en medio de una conversación de Samsung y el sistema agregó
        // "también tenemos esto de la marca que pediste" sobre Samsung).
        if (greeting && !categoryChanged && !brandMentionIsNew && currentPreferredBrands.length > 0) {
          const brandMatches = loadedProducts.filter(
            (p) => p.brand && currentPreferredBrands.some((b) => p.brand!.toLowerCase().includes(b))
          );
          const alreadyIncluded = brandMatches.some((bm) => (topPickIds ?? []).includes(bm.id));
          if (brandMatches.length > 0 && !alreadyIncluded) {
            const mergedPickIds = [...brandMatches.slice(0, 2).map((p) => p.id), ...(topPickIds ?? [])];
            const seen = new Set<string>();
            topPickIds = mergedPickIds.filter((id) => (seen.has(id) ? false : (seen.add(id), true))).slice(0, 5);
            recommendedProducts = loadedProducts.slice(0, MAX_CHAT_CARDS).map(toRecommendedProduct);
            const idToTitle = new Map(loadedProducts.map((p) => [p.id, p.title]));
            topPickTitles = topPickIds.map((id) => idToTitle.get(id)).filter((t): t is string => !!t);
            suggestedRefinement = undefined;
            reply = `${reply}\n\nTambién tenemos esto de la marca que pediste — la vas a ver destacada en los resultados.`;
          }
        }

        // Red de seguridad: a veces el modelo describe en el texto un producto
        // puntual que no está entre los numerados (lo saca del resumen del
        // pool o directamente lo inventa) sin llamar a recommend_products NI a
        // suggest_refinement — el usuario se queda con una promesa en texto y
        // ningún botón para actuar (bug reportado: "sigue sin devolverme
        // información cuando pido algo distinto"). Si eso pasa en un turno con
        // mensaje del usuario (no el saludo, que no tiene mensaje propio), se
        // ofrece buscar de nuevo con el pedido tal cual lo escribió, en vez de
        // dejarlo sin salida.
        // Excluye preguntas (terminan en "?"): GuidedSearchChat dispara este
        // refinamiento automáticamente ~900ms después de la respuesta, sin que
        // el usuario toque nada — sin este filtro, una pregunta informativa ya
        // respondida en el texto ("¿cuál tiene Android TV?", "¿en qué se
        // diferencian Android TV y Google TV?") disparaba una búsqueda nueva
        // sola con los mismos resultados de siempre, y un segundo saludo que
        // se leía como si el bot hubiera respondido dos veces lo mismo (bug
        // reportado en vivo).
        const looksLikeQuestion = message.trim().endsWith("?");
        const finalSuggestedRefinement =
          suggestedRefinement ??
          (!greeting && !looksLikeQuestion && (!recommendedProducts || recommendedProducts.length === 0) && message.trim()
            ? message.trim()
            : undefined);

        // El saludo cuando el texto de la búsqueda nombra una tienda ("...en
        // Carrefour...") — no hay slot de tienda, así que se le indica el filtro
        // de la grilla y el cliente lo resalta.
        let highlightFilter: "store" | undefined;
        if (greeting) {
          const store = detectStoreMention(rawInput ?? "");
          if (store) {
            highlightFilter = "store";
            reply = `${reply}\n\nPara ver solo lo de **${store}**, usá el filtro **Tienda** arriba de los resultados — te lo resalté.`;
          }
        }

        const responsePayload: ChatGreetingPayload = {
          reply,
          recommendedProducts,
          topPickIds,
          suggestedRefinement: finalSuggestedRefinement,
          highlightFilter,
        };

        if (greeting && shareToken && replyText.trim()) {
          setChatGreetingCache(shareToken, responsePayload).catch(() => {});
        }

        persistChatTurn({
          shareToken,
          visitId,
          userMessage: message ?? "",
          assistantReply: reply,
          greeting: !!greeting,
          recommendedCount: recommendedProducts?.length ?? 0,
          suggestedRefinement: finalSuggestedRefinement,
          durationMs: Date.now() - startedAt,
        });
        console.log(
          `[CHAT] turn shareToken=${shareToken} greeting=${!!greeting} durationMs=${Date.now() - startedAt} ` +
            `userMessage=${JSON.stringify((message ?? "").slice(0, 200))} ` +
            `recommended=${recommendedProducts?.length ?? 0} topPicks=${JSON.stringify(topPickTitles ?? [])} ` +
            `suggestedRefinement=${JSON.stringify(finalSuggestedRefinement ?? null)} replyChars=${reply.length} ` +
            `greetingOverBudget=${greeting ? greetingPicks.filter((p) => p.outOfBudget === "above").length : "-"} ` +
            (highlightFilter ? `highlightFilter=${highlightFilter} ` : "") +
            `replyPreview=${JSON.stringify(reply.slice(0, 140))}`
        );

        send({ type: "done", ...responsePayload });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[POST /api/search/refine-chat]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
