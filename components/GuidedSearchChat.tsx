"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { withBasePath } from "@/lib/basePath";
import { detectCategoryLocally } from "@/lib/domain/detectCategory";
import { BudgetPicker } from "@/components/BudgetPicker";
import { LogoBrand } from "@/components/LogoBrand";
import { CompareModal } from "@/components/CompareModal";
import { ChatMessageText } from "@/components/ChatMessageText";
import type {
  AlternativeProduct,
  EnrichedProduct,
  GuidingQuestion,
  ProductCategory,
  UseCase,
} from "@/types";

// Chatbot único de principio a fin: arranca guiando con preguntas (categoría,
// uso, presupuesto — mismo backend de slot-filling que ya existía, solo
// presentado como conversación en vez de una grilla de botones simultánea) y,
// apenas hay resultados, sigue siendo el MISMO hilo razonando sobre los
// productos reales en pantalla (reemplaza a GuidingQuestions + SearchRefineChat).

interface GuidedSearchChatProps {
  // Gathering
  questions: GuidingQuestion[];
  category: ProductCategory | null;
  onSubmitAnswer: (phrase: string) => void;
  searching: boolean;
  // Results
  rawInput: string;
  useCases: UseCase[];
  budgetMax: number | null;
  products: EnrichedProduct[];
  shareToken: string;
  // Pedidos puntuales que ya se aplicaron sobre la búsqueda original (ej. el
  // usuario tocó "buscar con procesador i7" y no hubo resultados exactos) —
  // se le pasa al backend para que el saludo de ESTA tanda de resultados
  // pueda reconocer que nació de un pedido puntual y, si nada lo cumple, lo
  // aclare en vez de recomendar la alternativa más cercana sin avisar.
  appliedRefinements?: string[];
  onRefine: (phrase: string) => void;
  // Modo burbuja flotante (fase de resultados) en vez de panel embebido a
  // pantalla completa (fase de preguntas) — ver page.tsx. En este modo las
  // tarjetas de producto NO se renderizan acá (viven en la grilla principal
  // de la página); el chat sigue calculándolas igual, solo para avisar por
  // onRecommendations y para el botón "Comparar" del header.
  compact?: boolean;
  onMinimize?: () => void;
  onRecommendations?: (payload: { products: AlternativeProduct[]; topPickIds?: string[] }) => void;
  // Jugada #11: mensaje inyectado desde afuera (botón "Consultar sobre este
  // equipo" de una tarjeta). Cada cambio de `key` lo envía como turno del chat.
  externalMessage?: { text: string; key: number } | null;
}

type ChatMessage = {
  id: string;
  role: "bot" | "user";
  text: string;
  hint?: string;
  choices?: string[]; // tags crudos (con emoji), curados por pregunta
  budgetPicker?: boolean;
  answered?: boolean;
  recommendedProducts?: AlternativeProduct[];
  topPickIds?: string[];
  suggestedRefinement?: string;
};

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `m${idCounter}`;
}

function cleanEmoji(answer: string): string {
  const spaceIdx = answer.indexOf(" ");
  const prefix = spaceIdx > 0 ? answer.slice(0, spaceIdx) : "";
  const isEmoji = prefix.length > 0 && prefix.length <= 2 && prefix.charCodeAt(0) > 255;
  return isEmoji ? answer.slice(spaceIdx + 1) : answer;
}

function isBudgetQuestion(q: GuidingQuestion): boolean {
  return /cuánto querés gastar/i.test(q.text);
}

// Copy curada — refuerza el tono de "asesor experto que traduce lo técnico",
// sin llamar al LLM en cada turno (las preguntas y opciones son un guion fijo).
function getQuestionHint(q: GuidingQuestion): string | null {
  if (/qué tipo de equipo/i.test(q.text)) {
    return "Así te muestro solo lo relevante para ese tipo de equipo.";
  }
  if (/para qué vas a usar/i.test(q.text)) {
    return "Con esto defino qué tan potente lo necesitás — no tiene sentido pagar de más por algo que no vas a aprovechar.";
  }
  if (isBudgetQuestion(q)) {
    return "Con esto filtro directamente lo que podés comprar, nada de opciones inalcanzables.";
  }
  if (/cuota mensual o el precio total/i.test(q.text)) {
    return "Necesito saber esto para no confundir cuota con precio final.";
  }
  return null;
}

function pickNextQuestion(questions: GuidingQuestion[]): GuidingQuestion | null {
  if (questions.length === 0) return null;
  return questions.find((q) => /qué tipo de equipo/i.test(q.text)) ?? questions[0];
}

interface ChatDonePayload {
  reply: string;
  recommendedProducts?: AlternativeProduct[];
  topPickIds?: string[];
  suggestedRefinement?: string;
}

// El endpoint responde de dos formas: JSON normal cuando el saludo ya está
// cacheado (instantáneo, no vale la pena streamear), o Server-Sent Events
// cuando el LLM tiene que generar la respuesta — el mensaje del bot se va
// llenando token a token a medida que llegan los eventos "text", y las
// tarjetas/refinamiento se agregan al llegar el evento final "done".
async function consumeChatResponse(
  res: Response,
  botId: string,
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  onFirstAppend?: (insertedAtIndex: number) => void
): Promise<ChatDonePayload | null> {
  const contentType = res.headers.get("content-type") ?? "";
  let finalPayload: ChatDonePayload | null = null;

  function upsert(patch: Partial<ChatMessage> | ((prev: ChatMessage) => Partial<ChatMessage>)) {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === botId);
      if (idx === -1) {
        onFirstAppend?.(prev.length);
        const base: ChatMessage = { id: botId, role: "bot", text: "" };
        const applied = typeof patch === "function" ? patch(base) : patch;
        return [...prev, { ...base, ...applied }];
      }
      const copy = [...prev];
      const applied = typeof patch === "function" ? patch(copy[idx]) : patch;
      copy[idx] = { ...copy[idx], ...applied };
      return copy;
    });
  }

  if (contentType.includes("application/json")) {
    const data = (await res.json()) as ChatDonePayload & { error?: string };
    upsert({
      text: data.reply ?? data.error ?? "No pude responder. Intentá de nuevo.",
      recommendedProducts: data.recommendedProducts,
      topPickIds: data.topPickIds,
      suggestedRefinement: data.suggestedRefinement,
    });
    return data;
  }

  const reader = res.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;
      let event: { type: string } & Partial<ChatDonePayload> & { value?: string };
      try {
        event = JSON.parse(jsonStr);
      } catch {
        continue;
      }
      if (event.type === "text" && event.value) {
        upsert((prev) => ({ text: prev.text + event.value }));
      } else if (event.type === "done") {
        upsert({
          // El texto final del servidor es la versión autoritativa (limpia de
          // markdown y de cualquier pseudo-tool-call que se haya colado) —
          // corrige lo que ya se mostró en vivo si hacía falta.
          ...(event.reply ? { text: event.reply } : {}),
          recommendedProducts: event.recommendedProducts,
          topPickIds: event.topPickIds,
          suggestedRefinement: event.suggestedRefinement,
        });
        finalPayload = {
          reply: event.reply ?? "",
          recommendedProducts: event.recommendedProducts,
          topPickIds: event.topPickIds,
          suggestedRefinement: event.suggestedRefinement,
        };
      }
    }
  }
  return finalPayload;
}

export function GuidedSearchChat({
  questions,
  category,
  onSubmitAnswer,
  searching,
  rawInput,
  useCases,
  budgetMax,
  products,
  shareToken,
  appliedRefinements,
  onRefine,
  compact,
  onMinimize,
  onRecommendations,
  externalMessage,
}: GuidedSearchChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [waitingReply, setWaitingReply] = useState(false);
  // Deja de mostrar los puntitos de "escribiendo" apenas llega el primer
  // token del stream — a partir de ahí el propio mensaje creciendo ya
  // comunica que sigue en curso.
  const [streamingReply, setStreamingReply] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef(new Map<string, HTMLDivElement>());
  const prevMessageCountRef = useRef(0);
  // Trackea el share_token ya saludado (no un booleano simple) — así, cuando
  // el chat dispara una búsqueda nueva (ver page.tsx/handleChatRefine, ej. un
  // cambio de categoría notebook→celular), shareToken cambia y el saludo
  // vuelve a dispararse para el pool nuevo, en vez de quedar mudo porque ya
  // se había saludado una vez para la conversación.
  const greetedForTokenRef = useRef<string | null>(null);
  const phaseRef = useRef<"gathering" | "results">("gathering");
  // Índice en `messages` donde arranca la conversación de resultados — el
  // historial que se manda a /api/search/refine-chat excluye las preguntas
  // de la fase de guía (categoría/uso/presupuesto), que no le sirven de
  // contexto a ese prompt.
  const resultsStartIndexRef = useRef(0);

  // A diferencia de saltar siempre al fondo (lo que fuerza al usuario a
  // scrollear de nuevo con cada respuesta del bot), cuando se agrega un
  // mensaje NUEVO se ancla el scroll arriba de ESE mensaje — así el usuario
  // lee bajando de forma natural, sin que la vista salte con cada token del
  // streaming (que solo actualiza un mensaje ya existente, no agrega uno).
  useEffect(() => {
    const grew = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if (!grew) return;
    const last = messages[messages.length - 1];
    if (!last) return;
    const container = messagesContainerRef.current;
    const el = messageRefs.current.get(last.id);
    if (!container || !el) return;
    container.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
  }, [messages]);

  // Avisa hacia arriba (page.tsx) cada vez que un mensaje nuevo trae
  // recomendaciones — la grilla de resultados de la pantalla principal vive
  // ahí ahora, en vez de renderizarse acá adentro del hilo del chat. Solo se
  // notifica el ÚLTIMO mensaje con recommendedProducts (la recomendación más
  // reciente reemplaza a la anterior), y solo si onRecommendations existe
  // (el chat en modo no-compacto, fase de preguntas, nunca tiene productos).
  const lastNotifiedMessageIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onRecommendations) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.recommendedProducts && m.recommendedProducts.length > 0) {
        if (lastNotifiedMessageIdRef.current !== m.id) {
          lastNotifiedMessageIdRef.current = m.id;
          onRecommendations({ products: m.recommendedProducts, topPickIds: m.topPickIds });
        }
        break;
      }
    }
  }, [messages, onRecommendations]);

  // ── Fase 1: preguntas guiadas ────────────────────────────────────────────
  // Corre solo cuando el round-trip de la pregunta anterior ya terminó
  // (`!searching`) para no juzgar un estado a medio actualizar.
  useEffect(() => {
    if (products.length > 0) return; // ya pasamos a resultados
    if (searching) return;
    const next = pickNextQuestion(questions);

    setMessages((prev) => {
      const last = prev[prev.length - 1];

      if (next) {
        // Evita duplicar la misma pregunta sin responder en un re-render —
        // pero SÍ la vuelve a mostrar si ya fue respondida (freezeLastBotMessage
        // la marcó `answered`), por ejemplo cuando el backend no pudo
        // interpretar la respuesta anterior y vuelve a pedir lo mismo.
        if (last && last.role === "bot" && last.text === next.text && !last.answered) {
          return prev;
        }
        return [
          ...prev,
          {
            id: nextId(),
            role: "bot",
            text: next.text,
            hint: getQuestionHint(next) ?? undefined,
            choices: isBudgetQuestion(next) ? undefined : next.tags,
            budgetPicker: isBudgetQuestion(next),
          },
        ];
      }

      // No hay siguiente pregunta ni resultados: si el último mensaje es una
      // respuesta del usuario esperando respuesta, el round-trip falló
      // silenciosamente (error de red, etc.) — avisar en vez de dejar el
      // chat congelado sin ninguna señal.
      if (last && last.role === "user") {
        return [
          ...prev,
          {
            id: nextId(),
            role: "bot",
            text: "Uy, no pude procesar eso último 😅 ¿Podés intentar de nuevo?",
          },
        ];
      }

      return prev;
    });
  }, [questions, products.length, searching]);

  // ── Transición a fase 2: resultados ──────────────────────────────────────
  // Solo la instancia `compact` (la que persiste como burbuja flotante, ver
  // page.tsx) dispara el saludo. La instancia de fase 1 (panel completo de
  // preguntas) queda montada un instante más durante la animación de salida
  // con products.length ya > 0 — sin este guard, ambas instancias disparaban
  // su propio POST a /api/search/refine-chat para el mismo shareToken
  // (llamada a OpenAI duplicada en cada búsqueda, visto en logs de producción).
  useEffect(() => {
    if (!compact || products.length === 0 || greetedForTokenRef.current === shareToken) return;
    greetedForTokenRef.current = shareToken;
    phaseRef.current = "results";
    setWaitingReply(true);

    (async () => {
      const botId = nextId();
      try {
        const res = await fetch(withBasePath("/api/search/refine-chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rawInput,
            useCases,
            budgetMax,
            category,
            products,
            shareToken,
            refinements: appliedRefinements ?? [],
            messages: [],
            message: "",
            greeting: true,
          }),
        });
        await consumeChatResponse(res, botId, setMessages, (insertedAtIndex) => {
          resultsStartIndexRef.current = insertedAtIndex;
          setStreamingReply(true);
        });
      } catch {
        setMessages((prev) => {
          resultsStartIndexRef.current = prev.length;
          return [...prev, { id: botId, role: "bot", text: "¡Listo! Encontré algunas opciones para vos 👇" }];
        });
      } finally {
        setWaitingReply(false);
        setStreamingReply(false);
        // Red de seguridad: si el saludo terminó sin recomendar nada puntual
        // (el modelo a veces solo comenta en general sin llamar a
        // recommend_products — ver resolveToolCalls), el banner "Analizando tu
        // mejor opción..." de page.tsx no tiene ninguna otra señal para
        // apagarse y quedaba trabado para siempre aunque la grilla ya
        // mostrara productos reales. Avisar con lista vacía hace que
        // page.tsx caiga al pool sin rankear (mismo fallback que ya usa
        // mientras el saludo está en curso) en vez de tildarse.
        if (onRecommendations && lastNotifiedMessageIdRef.current === null) {
          onRecommendations({ products: [] });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length > 0, shareToken]);

  function freezeLastBotMessage() {
    setMessages((prev) => {
      const idx = prev.length - 1;
      if (idx < 0 || prev[idx].role !== "bot") return prev;
      const copy = [...prev];
      copy[idx] = { ...copy[idx], answered: true };
      return copy;
    });
  }

  function handleChoice(tag: string) {
    freezeLastBotMessage();
    const clean = cleanEmoji(tag);
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text: clean }]);
    onSubmitAnswer(clean);
  }

  function handleBudgetPicked(phrase: string) {
    freezeLastBotMessage();
    const label = phrase.charAt(0).toUpperCase() + phrase.slice(1);
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text: label }]);
    onSubmitAnswer(phrase);
  }

  // `askAbout`: el turno viene del botón "Consultar sobre este equipo" de una
  // tarjeta (jugada #11). El texto siempre nombra la marca/modelo del equipo,
  // así que hay que evitar que se lea como cambio de categoría o como pedido
  // de marca nueva — ni acá (redirección local) ni en el backend (atajo
  // determinístico) ni después (auto-disparo de suggestedRefinement).
  async function sendMessage(text: string, opts?: { askAbout?: boolean }) {
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text }]);

    if (phaseRef.current === "gathering") {
      freezeLastBotMessage();
      onSubmitAnswer(text);
      return;
    }

    // Cambio de categoría escrito directo en el chat (ej. viendo notebooks,
    // "quiero un celular Motorola") — antes esto se mandaba igual al LLM de
    // refine-chat, que solo conoce el pool de la categoría vieja y contestaba
    // algo confuso tipo "no tengo opciones de esa marca" (no podía, está
    // buscando celulares en un pool de notebooks), y RECIÉN 900ms después
    // (ver más abajo, suggestedRefinement) se disparaba el cambio real de
    // categoría — bug reportado en vivo: "hace dos búsquedas, primero me
    // mostró algo raro y después cambió solo". Se detecta acá, antes de
    // llamar al chat viejo, y se salta directo al cambio de categoría.
    const impliedCategory = opts?.askAbout ? null : detectCategoryLocally(text);
    if (impliedCategory && category && impliedCategory !== category) {
      freezeLastBotMessage();
      onRefine(text);
      return;
    }

    setWaitingReply(true);
    try {
      const res = await fetch(withBasePath("/api/search/refine-chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput,
          useCases,
          budgetMax,
          category,
          products,
          shareToken,
          refinements: appliedRefinements ?? [],
          messages: messages
            .slice(resultsStartIndexRef.current)
            .map((m) => ({ role: m.role === "bot" ? "ai" : ("user" as const), text: m.text })),
          message: text,
          askAbout: opts?.askAbout ?? false,
        }),
      });
      const result = await consumeChatResponse(res, nextId(), setMessages, () => setStreamingReply(true));
      // El usuario pidió que un mensaje de texto con intención clara de
      // búsqueda ("qué tenés de i5", "buscá con más batería") dispare la
      // búsqueda de una — sin el paso extra de tener que tocar el botón
      // sugerido después de leer la respuesta. Se dispara SOLO acá (mensaje
      // tipeado por el usuario), nunca desde el saludo automático de una
      // búsqueda nueva: si se disparara también ahí, una búsqueda que sigue
      // sin poder cumplir el mismo pedido podría reintentar en bucle sin que
      // el usuario haga nada. Acá, en cambio, cada disparo depende de un
      // mensaje nuevo del usuario — no hay forma de que se dispare sola.
      if (!opts?.askAbout && result?.suggestedRefinement) {
        setTimeout(() => onRefine(result.suggestedRefinement!), 900);
      }
    } catch {
      setMessages((prev) => [...prev, { id: nextId(), role: "bot", text: "Error de conexión. Intentá de nuevo." }]);
    } finally {
      setWaitingReply(false);
      setStreamingReply(false);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || waitingReply || searching) return;
    setInput("");
    sendMessage(text);
  }

  // Jugada #11: consulta inyectada desde una tarjeta ("Consultar sobre este
  // equipo"). Se manda como turno normal del chat cuando ya estamos en fase de
  // resultados; si todavía se está en preguntas, se ignora (no aplica).
  const externalKeyRef = useRef<number | null>(null);
  useEffect(() => {
    if (!externalMessage || externalMessage.key === externalKeyRef.current) return;
    externalKeyRef.current = externalMessage.key;
    if (phaseRef.current !== "results" || waitingReply || searching) return;
    sendMessage(externalMessage.text, { askAbout: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMessage?.key]);

  const isGathering = phaseRef.current === "gathering" && products.length === 0;
  const busy = waitingReply || (isGathering && searching);
  // Ya no quedan preguntas por hacer y estamos esperando el resultado final
  // (el round-trip más largo de todo el flujo) — en vez de los puntitos
  // genéricos, que se leen como "todavía no encontró nada", mostramos un
  // texto que deja claro que ya tiene con qué trabajar y solo está afinando.
  const finalizingSearch = isGathering && searching && questions.length === 0;

  // Productos que el bot efectivamente mostró como tarjeta en algún momento
  // de esta charla (no el pool completo) — deduplicados por id y resueltos
  // contra `products` (ya tiene el detalle completo) para el popup de comparar.
  const compareCandidates = useMemo(() => {
    const shownIds = new Set(messages.flatMap((m) => m.recommendedProducts?.map((p) => p.id) ?? []));
    return products.filter((p) => shownIds.has(p.id));
  }, [messages, products]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  return (
    <div
      className={
        compact
          ? "gathering-glass-panel animate-fade-up fixed top-20 bottom-4 right-4 z-30 flex w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl bg-gathering-surface-container"
          : "gathering-glass-panel relative flex h-full flex-col overflow-hidden rounded-xl"
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gathering-outline-variant/50 bg-gathering-surface-container/80 p-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <a href={withBasePath("/")} className="shrink-0" aria-label="Volver al inicio">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gathering-primary/30 bg-gathering-primary-container/20">
              <LogoBrand logoClass="h-5" />
            </div>
          </a>
          <div>
            <p className="font-brand text-sm font-bold text-gathering-on-surface">Tu asesor técnico</p>
            <p className="font-brand text-xs text-gathering-primary-fixed">
              {isGathering
                ? "Te hago un par de preguntas para encontrar justo lo que necesitás"
                : "Te digo qué conviene elegir, o busco de nuevo si nada te cierra"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {compareCandidates.length >= 2 && (
            <button
              type="button"
              onClick={() => setShowCompareModal(true)}
              className="gathering-interactive-card shrink-0 rounded-full px-3 py-1.5 font-brand text-xs font-semibold text-gathering-on-surface"
            >
              ⚖️ Comparar ({compareCandidates.length})
            </button>
          )}
          {compact && onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              aria-label="Minimizar chat"
              className="text-gathering-on-surface-variant hover:text-gathering-on-surface"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div ref={messagesContainerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => (
          <div
            key={m.id}
            ref={(el) => {
              if (el) messageRefs.current.set(m.id, el);
              else messageRefs.current.delete(m.id);
            }}
            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[95%] whitespace-pre-line px-4 py-3 text-sm leading-relaxed font-brand shadow-sm ${
                m.role === "user"
                  ? "gathering-btn-primary-gradient rounded-l-lg rounded-br-lg text-white"
                  : "rounded-r-lg rounded-bl-lg border-l-2 border-gathering-primary-fixed-dim bg-gathering-surface-container text-gathering-on-surface/90"
              }`}
            >
              <ChatMessageText text={m.text} />
            </div>
            {m.hint && (
              <p className="mt-1 max-w-[85%] font-brand text-xs text-gathering-on-surface-variant">{m.hint}</p>
            )}

            {m.choices && !m.answered && (
              <div className="mt-2 flex max-w-[95%] flex-wrap gap-2">
                {m.choices.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleChoice(tag)}
                    className="gathering-interactive-card rounded-full px-3.5 py-1.5 font-brand text-sm font-medium text-gathering-on-surface active:scale-95"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {m.budgetPicker && !m.answered && (
              <div className="mt-2 w-full max-w-[95%]">
                <BudgetPicker category={category} startOpen onSelect={handleBudgetPicked} />
              </div>
            )}

            {m.recommendedProducts && m.recommendedProducts.length > 0 && (
              <p className="mt-2 max-w-[85%] font-brand text-xs text-gathering-on-surface-variant">
                👆 Mostrando {m.recommendedProducts.length} opciones en la pantalla de resultados
              </p>
            )}

            {m.suggestedRefinement && (
              <button
                type="button"
                onClick={() => onRefine(m.suggestedRefinement!)}
                className="gathering-glass-panel mt-2 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-brand text-xs font-semibold text-gathering-primary-fixed-dim"
              >
                🔍 Buscar {m.suggestedRefinement}
              </button>
            )}
          </div>
        ))}
        {busy && !streamingReply && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-r-lg rounded-bl-lg border-l-2 border-gathering-primary-fixed-dim bg-gathering-surface-container px-4 py-3">
              {finalizingSearch && (
                <span className="font-brand text-sm text-gathering-on-surface-variant">
                  Ya tengo tu perfil, armando tu recomendación
                </span>
              )}
              <span className="h-2 w-2 animate-bounce rounded-full bg-gathering-on-surface-variant [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gathering-on-surface-variant [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gathering-on-surface-variant" />
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="shrink-0 border-t border-gathering-outline-variant/50 bg-gathering-surface-container/90 p-4 backdrop-blur-md"
      >
        <div className="gathering-chat-input-focus flex items-center gap-1 rounded-lg border border-gathering-outline-variant bg-gathering-surface p-1 pr-2 transition-all duration-300">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder={
              busy
                ? "Esperá un momento..."
                : isGathering
                  ? "O escribí tu respuesta acá..."
                  : "Ej: ¿cuál me conviene si uso más para trabajar que para jugar?"
            }
            className="flex-1 border-none bg-transparent px-3 py-2 font-brand text-sm text-gathering-on-surface placeholder:font-brand placeholder:text-gathering-on-surface-variant/50 focus:outline-none focus:ring-0 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="flex items-center justify-center rounded-md bg-gathering-primary/20 p-2 text-gathering-primary-fixed-dim transition-colors hover:bg-gathering-primary/40 disabled:opacity-40"
          >
            {busy ? (
              <span className="px-1 text-xs">...</span>
            ) : (
              <span className="material-symbols-outlined text-lg">send</span>
            )}
          </button>
        </div>
      </form>

      {showCompareModal && (
        <CompareModal products={compareCandidates} onClose={() => setShowCompareModal(false)} />
      )}
    </div>
  );
}
