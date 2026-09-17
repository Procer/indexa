import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildCompareChatPrompt } from "@/lib/llm/prompts";
import { findAlternativeProduct } from "@/lib/search/quickAlternative";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { sql } from "@/lib/db/sql";
import type { AlternativeProduct, Product, UseCase } from "@/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Tope de productos en una comparación (mismo límite que /api/products/compare).
const MAX_PRODUCTS = 5;

interface Message {
  role: "user" | "ai";
  text: string;
}

interface ChatRequest {
  products: Product[];
  messages: Message[];
  message: string;
  useCases?: UseCase[];
  budgetMax?: number | null;
  budgetLabel?: string | null;
  greeting?: boolean;
  recentProducts?: { id: string; title: string }[];
  visitId?: string;
}

interface ChatCompletionJson {
  reply?: string;
  suggestAlternative?: boolean;
  alternativeReason?: string;
}

const GREETING_PROMPT =
  "Arrancá vos la conversación: saludá muy brevemente y dame de entrada tu análisis — " +
  "cuál de los productos comparados me conviene más y por qué, considerando mi uso y presupuesto " +
  "declarados si los tenés disponibles en el contexto. Máximo 4 oraciones, directo al punto, " +
  "sin esperar a que te pregunte algo primero.";

const FALLBACK_REPLY_GREETING = "Hola! Puedo ayudarte a decidir entre estos productos. ¿Qué querés saber?";
const FALLBACK_REPLY_ERROR = "No pude procesar tu pregunta. Intentá de nuevo.";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const { success } = await checkRateLimit("compare-chat", getClientIp(request), 20, 60);
    if (!success) {
      return NextResponse.json({ error: "Demasiadas consultas, esperá un momento" }, { status: 429 });
    }

    const body = (await request.json()) as ChatRequest;
    const { products, messages, message, useCases, budgetMax, budgetLabel, greeting, recentProducts, visitId } = body;

    if ((!greeting && !message?.trim()) || !products || products.length < 2) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
    }

    const systemPrompt = buildCompareChatPrompt(
      products,
      useCases?.length ? { useCases, budgetLabel: budgetLabel ?? null } : undefined,
      recentProducts
    );

    // Convertir historial al formato OpenAI (últimos 10 turnos para no gastar tokens)
    const history = messages.slice(-10).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.text,
    }));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: greeting ? GREETING_PROMPT : message },
      ],
      max_tokens: 300,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const rawContent = completion.choices[0]?.message?.content?.trim() ?? "";
    let parsed: ChatCompletionJson = {};
    try {
      parsed = JSON.parse(rawContent) as ChatCompletionJson;
    } catch {
      parsed = { reply: rawContent, suggestAlternative: false };
    }

    const reply = parsed.reply?.trim() || (greeting ? FALLBACK_REPLY_GREETING : FALLBACK_REPLY_ERROR);

    let suggestedProduct: AlternativeProduct | null = null;
    // Si ya hay 5 productos no se puede sumar un 6to (mismo tope que /api/products/compare).
    if (parsed.suggestAlternative && parsed.alternativeReason && products.length < MAX_PRODUCTS) {
      suggestedProduct = await findAlternativeProduct({
        category: products[0].category,
        useCases: useCases ?? [],
        budgetMax: budgetMax ?? null,
        excludeIds: [...products.map((p) => p.id), ...(recentProducts?.map((p) => p.id) ?? [])],
        currentProducts: products,
      }).catch(() => null);
    }

    sql`
      INSERT INTO chat_messages (
        visit_id, context, user_message, assistant_reply, greeting, duration_ms
      ) VALUES (
        ${visitId ?? null}, 'compare', ${greeting ? "(inicio automático)" : message}, ${reply},
        ${!!greeting}, ${Date.now() - startedAt}
      )
    `.catch((e) => console.error("[POST /api/compare/chat] persist chat_messages failed", e));

    return NextResponse.json({ reply, suggestedProduct: suggestedProduct ?? undefined });
  } catch (error) {
    console.error("[POST /api/compare/chat]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
