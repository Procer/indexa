import OpenAI from "openai";
import { COMBINED_SLOT_EXPANSION_PROMPT, SLOT_FILLING_PROMPT } from "./prompts";
import { VALID_USE_CASES } from "@/lib/domain/usageToSpecs";
import type { GuidingQuestion, PhoneTechnicalFilters, Slots, SlotPreferences } from "@/types";

// El LLM a veces devuelve un use_case fuera del enum (ej. "gaming" en vez de
// "gaming_casual") pese a que el prompt lista los valores válidos — se descarta
// acá, en el borde donde entra el JSON del LLM, para que ningún valor inválido
// llegue a Slots (ver VALID_USE_CASES / getRequiredSpecs, que antes reventaba
// con un 500 real en este caso).
function parseUseCases(raw: unknown): Slots["use_cases"] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((uc): uc is Slots["use_cases"][number] =>
    VALID_USE_CASES.has(uc as Slots["use_cases"][number])
  );
}

const openai = new OpenAI();

// Versión combinada: extrae slots Y genera expanded_query en una sola llamada LLM.
// Usar en lugar de extractSlots + expandQuery por separado.
export async function extractSlotsAndExpand(
  input: string,
  refinements?: string[]
): Promise<{ slots: Slots; expandedQuery: string | null }> {
  const userMessage =
    refinements && refinements.length > 0
      ? `Búsqueda: "${input}"\nFiltros aplicados: ${refinements.join(", ")}`
      : `Búsqueda: "${input}"`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: COMBINED_SLOT_EXPANSION_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0,
    max_tokens: 600,
  });

  const content = response.choices[0].message.content ?? "{}";
  const raw = JSON.parse(content) as Record<string, unknown>;

  const slots: Slots = {
    category: (raw.category as Slots["category"]) ?? null,
    use_cases: parseUseCases(raw.use_cases),
    budget_monthly_ars: typeof raw.budget_monthly_ars === "number" ? raw.budget_monthly_ars : null,
    budget_cash_ars: typeof raw.budget_cash_ars === "number" ? raw.budget_cash_ars : null,
    budget_cash_min_ars: typeof raw.budget_cash_min_ars === "number" ? raw.budget_cash_min_ars : null,
    budget_installment_count: typeof raw.budget_installment_count === "number" ? raw.budget_installment_count : null,
    preferences: parsePreferences(raw.preferences),
    excluded_product_ids: [],
    technical_filters: parseTechnicalFilters(raw.technical_filters),
    phone_filters: parsePhoneFilters(raw.phone_filters),
    is_ambiguous: typeof raw.is_ambiguous === "boolean" ? raw.is_ambiguous : true,
    missing_info: Array.isArray(raw.missing_info) ? (raw.missing_info as Slots["missing_info"]) : [],
  };

  const expandedQuery = typeof raw.expanded_query === "string" && raw.expanded_query
    ? raw.expanded_query
    : null;

  return { slots, expandedQuery };
}

export async function extractSlots(
  input: string,
  refinements?: string[]
): Promise<Slots> {
  const userMessage =
    refinements && refinements.length > 0
      ? `Búsqueda: "${input}"\nFiltros aplicados: ${refinements.join(", ")}`
      : `Búsqueda: "${input}"`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SLOT_FILLING_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0,
  });

  const content = response.choices[0].message.content ?? "{}";
  const raw = JSON.parse(content) as Record<string, unknown>;

  return {
    category:
      (raw.category as Slots["category"]) ?? null,
    use_cases: parseUseCases(raw.use_cases),
    budget_monthly_ars:
      typeof raw.budget_monthly_ars === "number"
        ? raw.budget_monthly_ars
        : null,
    budget_cash_ars:
      typeof raw.budget_cash_ars === "number" ? raw.budget_cash_ars : null,
    budget_cash_min_ars:
      typeof raw.budget_cash_min_ars === "number" ? raw.budget_cash_min_ars : null,
    budget_installment_count:
      typeof raw.budget_installment_count === "number" ? raw.budget_installment_count : null,
    preferences: parsePreferences(raw.preferences),
    excluded_product_ids: [],
    technical_filters: parseTechnicalFilters(raw.technical_filters),
    phone_filters: parsePhoneFilters(raw.phone_filters),
    is_ambiguous: typeof raw.is_ambiguous === "boolean" ? raw.is_ambiguous : true,
    missing_info: Array.isArray(raw.missing_info)
      ? (raw.missing_info as Slots["missing_info"])
      : [],
  };
}

function parseTechnicalFilters(raw: unknown): import("@/types").TechnicalFilters {
  if (!raw || typeof raw !== "object") {
    return { min_ram_gb: null, storage_type: null, gpu_required: false };
  }
  const t = raw as Record<string, unknown>;
  return {
    min_ram_gb: typeof t.min_ram_gb === "number" ? t.min_ram_gb : null,
    storage_type: (t.storage_type as import("@/types").StorageType | null) ?? null,
    gpu_required: typeof t.gpu_required === "boolean" ? t.gpu_required : false,
  };
}

function parsePhoneFilters(raw: unknown): PhoneTechnicalFilters {
  if (!raw || typeof raw !== "object") {
    return { min_ram_gb: null, min_storage_gb: null, min_camera_mp: null, require_5g: false, require_nfc: false, os: null };
  }
  const t = raw as Record<string, unknown>;
  return {
    min_ram_gb: typeof t.min_ram_gb === "number" ? t.min_ram_gb : null,
    min_storage_gb: typeof t.min_storage_gb === "number" ? t.min_storage_gb : null,
    min_camera_mp: typeof t.min_camera_mp === "number" ? t.min_camera_mp : null,
    require_5g: typeof t.require_5g === "boolean" ? t.require_5g : false,
    require_nfc: typeof t.require_nfc === "boolean" ? t.require_nfc : false,
    os: (t.os as PhoneTechnicalFilters["os"]) ?? null,
  };
}

function parsePreferences(raw: unknown): SlotPreferences {
  if (!raw || typeof raw !== "object") {
    return {
      os: "any",
      brands_preferred: [],
      brands_excluded: [],
      portability: "any",
      screen_size: "any",
      processor_model_preferred: null,
    };
  }
  const p = raw as Record<string, unknown>;
  return {
    os: (p.os as SlotPreferences["os"]) ?? "any",
    brands_preferred: Array.isArray(p.brands_preferred)
      ? (p.brands_preferred as string[])
      : [],
    brands_excluded: Array.isArray(p.brands_excluded)
      ? (p.brands_excluded as string[])
      : [],
    portability: (p.portability as SlotPreferences["portability"]) ?? "any",
    screen_size: (p.screen_size as SlotPreferences["screen_size"]) ?? "any",
    processor_model_preferred:
      typeof p.processor_model_preferred === "string" && p.processor_model_preferred.trim()
        ? p.processor_model_preferred.trim()
        : null,
  };
}

export function isInputSufficient(slots: Slots): boolean {
  // Se requieren AMBOS: uso (para saber qué buscar) y presupuesto (para filtrar resultados).
  // Sin presupuesto los resultados son irrelevantes — el sistema pregunta budget upfront
  // mientras corre la búsqueda interna en paralelo.
  const hasBudget = !!(slots.budget_monthly_ars || slots.budget_cash_ars);
  return slots.use_cases.length > 0 && hasBudget;
}

export function getGuidingQuestions(slots: Slots): GuidingQuestion[] {
  const questions: GuidingQuestion[] = [];

  // ── Uso principal (siempre primero, es el dato más importante) ────────────────
  if (slots.use_cases.length === 0) {
    if (slots.category === "phone") {
      questions.push({
        text: "¿Para qué vas a usar el celular principalmente?",
        tags: [
          "📸 Fotos y videos",
          "📱 Redes sociales",
          "🎮 Juegos",
          "💼 Trabajo y email",
          "📞 Uso básico",
        ],
      });
    } else if (slots.category === "tv") {
      questions.push({
        text: "¿Para qué vas a usar el televisor?",
        tags: [
          "🎬 Series y películas",
          "🎮 Gaming",
          "📺 TV en vivo",
          "🖥️ Pantalla de PC",
        ],
      });
    } else if (slots.category === "tablet") {
      questions.push({
        text: "¿Para qué vas a usar la tablet?",
        tags: [
          "📚 Estudio",
          "🎨 Dibujo y diseño",
          "🎬 Entretenimiento",
          "💼 Trabajo",
          "👶 Para mis hijos",
        ],
      });
    } else {
      // notebook / desktop / sin categoría
      const deviceLabel = slots.category === "desktop" ? "la computadora" : "la notebook";
      questions.push({
        text: `¿Para qué vas a usar ${slots.category ? deviceLabel : "el equipo"} principalmente?`,
        tags: [
          "💼 Trabajo y oficina",
          "📚 Estudio",
          "🎨 Diseño y edición",
          "🎮 Gaming",
          "🎬 Películas y uso diario",
        ],
      });
    }
  }

  // ── Tipo de dispositivo (solo si no está definido Y tampoco hay uso) ──────────
  if (!slots.category && slots.use_cases.length === 0) {
    questions.push({
      text: "¿Qué tipo de equipo estás buscando?",
      tags: ["💻 Notebook", "🖥️ PC de escritorio", "📱 Tablet", "📺 Smart TV", "📲 Celular"],
    });
  }

  // ── Presupuesto ───────────────────────────────────────────────────────────────
  if (!slots.budget_monthly_ars && !slots.budget_cash_ars) {
    // budget_type: el LLM detectó un monto en zona gris (podría ser cuota o contado).
    // Solo preguntar si el LLM lo marcó explícitamente — y hay una "budget" mención implícita.
    // Si missing_info incluye "budget" (sin monto) → preguntar cuánto, no el tipo.
    const hasBudgetTypeAmbiguity =
      slots.missing_info.includes("budget_type") &&
      !slots.missing_info.includes("budget");

    if (hasBudgetTypeAmbiguity) {
      questions.push({
        text: "¿Ese presupuesto es la cuota mensual o el precio total?",
        tags: ["💳 Es la cuota por mes", "💵 Es el precio total contado"],
      });
    } else {
      questions.push({
        text: "¿Cuánto querés gastar?",
        tags: [
          "💳 Hasta $100.000 por mes",
          "💳 Hasta $200.000 por mes",
          "💳 Hasta $400.000 por mes",
          "💵 Pago en efectivo",
        ],
      });
    }
  }

  return questions;
}

// Preguntas que se muestran INLINE en la página de resultados cuando falta info no bloqueante.
// A diferencia de getGuidingQuestions (bloquea la búsqueda), estas aparecen sobre los resultados.
export function getInlineQuestions(slots: Slots): GuidingQuestion[] {
  const questions: GuidingQuestion[] = [];

  // Falta presupuesto → mostrar opciones inline sobre los resultados
  if (!slots.budget_monthly_ars && !slots.budget_cash_ars) {
    if (slots.missing_info.includes("budget_type") && !slots.missing_info.includes("budget")) {
      questions.push({
        text: "¿Ese presupuesto es cuota mensual o precio total?",
        tags: ["💳 Es la cuota por mes", "💵 Es el precio total contado"],
      });
    } else {
      questions.push({
        text: "¿Tenés un presupuesto en mente?",
        tags: [
          "💳 Hasta $100.000 por mes",
          "💳 Hasta $200.000 por mes",
          "💳 Hasta $400.000 por mes",
          "💵 Pago en efectivo",
        ],
      });
    }
  }

  return questions;
}
