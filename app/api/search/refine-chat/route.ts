import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildSearchRefineChatPrompt, SEARCH_REFINE_CHAT_TOOLS } from "@/lib/llm/prompts";
import { summarizePool } from "@/lib/domain/poolSummary";
import { getProductsByIds, getSearchByShareToken } from "@/lib/db/queries";
import { enrichWithAnalysis } from "@/lib/llm/productAnalysis";
import { getChatGreetingCache, setChatGreetingCache, type ChatGreetingPayload } from "@/lib/search/cache";
import { getOrBuildPoolIds } from "@/lib/search/pipeline";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { detectCategoryLocally } from "@/lib/domain/detectCategory";
import { detectBrandMention } from "@/lib/domain/detectBrand";
import { describeBudgetForChat } from "@/lib/domain/budgetTiers";
import type { AlternativeProduct, EnrichedProduct, ProductCategory, UseCase } from "@/types";

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

// El prompt le pide al modelo texto plano, pero por las dudas se limpia
// cualquier markdown de negrita que se cuele antes de cachear la respuesta
// (la burbuja del chat no renderiza markdown, así que "**texto**" se vería
// literal).
function stripMarkdownBold(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}

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
function buildGreetingPrompt(refinements: string[]): string {
  const honestyCheck =
    refinements.length > 0
      ? `Antes que nada: el usuario llegó a esta búsqueda pidiendo puntualmente "${refinements[refinements.length - 1]}". Si es un requisito técnico concreto (modelo de procesador, marca, cantidad de RAM, etc.) y NINGÚN resultado de abajo lo cumple, tu PRIMERA oración tiene que decirlo explícitamente — nunca arranques directo con el pick como si cumpliera ese pedido. `
      : "";
  return (
    honestyCheck +
    "Arrancá vos la conversación: mirá los resultados actuales contra el presupuesto y uso " +
    "declarados y dame de entrada tus hasta 4 mejores picks ordenados de mejor a peor (menos " +
    "si hay menos de 4 opciones cargadas), no te quedes con uno solo si hay más opciones " +
    "decentes; o si ninguno satisface bien lo que buscás, decilo y proponé buscar de otra " +
    "forma. Máximo 4 oraciones, directo al punto, sin esperar a que te pregunte algo primero. " +
    "Esta primera respuesta también tiene que cumplir las reglas imperativas de arriba: dale " +
    "un ejemplo cotidiano concreto de para qué le va a servir tu mejor pick (no solo la spec " +
    "traducida), y si el precio es relevante, mencioná de una las dos formas de pago con los " +
    "montos reales. Acordate de llamar a recommend_products con esos números en esta misma " +
    "respuesta."
  );
}

const FALLBACK_REPLY_GREETING = "Hola! Soy tu asesor técnico — puedo recomendarte qué elegir de estos resultados o buscar de nuevo si nada te convence. ¿Qué necesitás?";
const FALLBACK_REPLY_ERROR = "No pude procesar tu pregunta. Intentá de nuevo.";

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
    source: p.source,
    url: p.url,
    affiliate_url: p.affiliate_url,
    installment_count: p.installment_count,
    quality_price_score: p.quality_price_score,
    spec_highlights: p.spec_highlights ?? [],
    spec_highlights_simple: p.spec_highlights_simple ?? [],
    out_of_budget: p.out_of_budget,
    also_at: p.also_at,
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
    const { rawInput, useCases, budgetMax, category, products, shareToken, messages, message, greeting, refinements } = body;

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

    // Resumen del pool completo (incluye productos que el usuario todavía no
    // cargó scrolleando) — si no hay shareToken o el pool no se puede
    // recuperar, se cae de vuelta a resumir solo lo que mandó el cliente.
    const poolIds = shareToken ? await getOrBuildPoolIds(shareToken) : [];
    const poolProducts = poolIds.length > 0 ? await getProductsByIds(poolIds) : products;
    const poolSummary = summarizePool(poolProducts);

    // El detalle completo (con el que el modelo puede realmente recomendar,
    // vía RESULTADO N) tiene que salir del pool rankeado completo, no solo de
    // `products` (la tanda inicial de 6 que ya tiene el cliente) — si no,
    // pedidos como "el de mejor procesador" o un modelo puntual fallan en
    // silencio apenas ese producto está más abajo en el pool que la tanda
    // inicial. quality_price_score/analysis ya viene cacheado en DB para la
    // mayoría (24hs) — solo los nunca analizados antes disparan una llamada
    // al LLM acá, mismo patrón que ya usa /api/search/[token]/more.
    const search = shareToken ? await getSearchByShareToken(shareToken) : null;
    const loadedProducts: EnrichedProduct[] = search
      ? await enrichWithAnalysis(
          poolProducts.slice(0, MAX_DETAILED_PRODUCTS).map((p) => ({ ...p, similarity: 0, final_score: 0 })),
          search.slots
        )
      : products.slice(0, MAX_DETAILED_PRODUCTS);

    // Preferí siempre el presupuesto de search.slots (fuente autoritativa,
    // distingue contado de cuotas) por sobre el budgetMax plano que manda el
    // cliente — ver describeBudgetForChat.
    const budgetLabel =
      describeBudgetForChat(search?.slots) ?? (budgetMax ? `hasta $${budgetMax.toLocaleString("es-AR")} ARS` : null);

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
      { role: "user", content: greeting ? buildGreetingPrompt(refinements ?? []) : message },
    ];

    const encoder = new TextEncoder();
    const toolCallAccumulators = new Map<number, ToolCallAccumulator>();
    let replyText = "";

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        function send(event: Record<string, unknown>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }

        async function streamCompletion(
          streamMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          withTools: boolean
        ) {
          const openaiStream = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: streamMessages,
            max_tokens: 300,
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
          await streamCompletion(baseMessages, true);

          // Ver extractLeakedToolCall: a veces el modelo, además de (o en vez
          // de) la tool call real, "narra" la llamada como texto al final.
          // Se limpia el texto SIEMPRE que aparezca el patrón (haya o no un
          // tool call real ya capturado) — el evento "done" manda el texto ya
          // limpio y el cliente lo usa para corregir lo que ya streameó. Solo
          // se usa como fuente de datos si no hay un tool call real todavía,
          // para no pisar uno válido con una narración duplicada.
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

          // A veces gpt-4o-mini llama a la función pero deja "content" vacío
          // (prioriza la tool call en vez de combinarla con texto). En ese
          // caso se pide una segunda pasada corta, ya sabiendo qué se
          // recomendó, solo para no dejar la tarjeta sin explicación.
          if (!replyText.trim() && toolCallAccumulators.size > 0) {
            console.log(`[CHAT] empty_reply_retry shareToken=${shareToken}`);
            const { topPickTitles } = resolveToolCalls(toolCallAccumulators, loadedProducts);
            const summary = topPickTitles?.join(", ");
            await streamCompletion(
              [
                ...baseMessages,
                {
                  role: "user",
                  content: summary
                    ? `(Ya marcaste como recomendados: ${summary}. Ahora escribí en 2-3 oraciones, tono ameno, por qué convienen para lo que necesito — sin llamar funciones ni repetir la lista.)`
                    : "(Escribí tu respuesta en texto para el usuario, sin llamar funciones.)",
                },
              ],
              false
            );
          }
        } catch (error) {
          console.error("[POST /api/search/refine-chat] stream error", error);
          if (!replyText.trim()) {
            replyText = greeting ? FALLBACK_REPLY_GREETING : FALLBACK_REPLY_ERROR;
            send({ type: "text", value: replyText });
          }
        }

        let reply = stripMarkdownBold(replyText.trim() || (greeting ? FALLBACK_REPLY_GREETING : FALLBACK_REPLY_ERROR));
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
        const impliedCategory = !greeting ? detectCategoryLocally(message) : null;
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
        const mentionedBrand = !greeting && !categoryChanged ? detectBrandMention(message) : null;
        const brandMentionIsNew = !!(mentionedBrand && !currentPreferredBrands.includes(mentionedBrand.toLowerCase()));
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
          suggestedRefinement = [categoryWord, mentionedBrand, budgetLabel].filter(Boolean).join(" ");
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
        const responsePayload: ChatGreetingPayload = {
          reply,
          recommendedProducts,
          topPickIds,
          suggestedRefinement: finalSuggestedRefinement,
        };

        if (greeting && shareToken && replyText.trim()) {
          setChatGreetingCache(shareToken, responsePayload).catch(() => {});
        }

        console.log(
          `[CHAT] turn shareToken=${shareToken} greeting=${!!greeting} durationMs=${Date.now() - startedAt} ` +
            `userMessage=${JSON.stringify((message ?? "").slice(0, 200))} ` +
            `recommended=${recommendedProducts?.length ?? 0} topPicks=${JSON.stringify(topPickTitles ?? [])} ` +
            `suggestedRefinement=${JSON.stringify(finalSuggestedRefinement ?? null)} replyChars=${reply.length}`
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
