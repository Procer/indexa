import OpenAI from "openai";
import { PRODUCT_ANALYSIS_PROMPT } from "./prompts";
import { buildQuickSelectionReason, explainProductSpecs, explainProductSpecsSimple } from "@/lib/domain/specExplainer";
import { buildBudgetFitNote, capScoreByBudgetFit } from "@/lib/domain/budgetFit";
import type { EnrichedProduct, Product, ProductAnalysis, Slots } from "@/types";

const openai = new OpenAI();

// El análisis de calidad/precio de un producto no cambia de un día para el
// otro (specs y calidad son estables; el precio actual ya se refleja aparte,
// vía buildBudgetFitNote, sin depender de esto) — 24hs era una ventana
// injustificadamente corta que forzaba regeneración en vivo (varios segundos
// de LLM por producto) en la mayoría de las búsquedas reales, porque el cron
// nocturno solo alcanza a cubrir ~100 productos/noche contra un catálogo de
// mucho más que eso. 21 días le da margen de sobra al cron para mantenerse
// al día (ver scripts/analyzeProducts.ts, ahora también refresca vencidos,
// no solo nulos) sin perder la posibilidad de refrescar eventualmente.
const ANALYSIS_FRESHNESS_MS = 21 * 24 * 60 * 60 * 1000;

type ScoredFullProduct = Product & {
  similarity: number;
  final_score: number;
  selection_reason?: string | null;
  upgrade_note?: string | null;
  out_of_budget?: "above" | "below" | null;
};

export async function generateProductAnalysis(
  product: Product,
  slots: Slots
): Promise<ProductAnalysis> {
  const context = {
    product: {
      title: product.title,
      brand: product.brand,
      category: product.category,
      price_cash: product.price_cash,
      price_installment: product.price_installment,
      specs: product.specs,
    },
    user_use_cases: slots.use_cases,
    budget_monthly_ars: slots.budget_monthly_ars,
    budget_cash_ars: slots.budget_cash_ars,
  };

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PRODUCT_ANALYSIS_PROMPT },
      { role: "user", content: JSON.stringify(context) },
    ],
    temperature: 0.4,
    max_tokens: 300,
  });

  const content = response.choices[0].message.content ?? "{}";
  const raw = JSON.parse(content) as Record<string, unknown>;

  return {
    quality_price_score:
      (raw.quality_price_score as ProductAnalysis["quality_price_score"]) ??
      "BUENO",
    quality_price_analysis:
      typeof raw.quality_price_analysis === "string"
        ? raw.quality_price_analysis
        : "",
    // Determinístico, no via LLM: grounded en los specs reales del producto
    // y en los use_cases declarados, así nunca queda desactualizado ni
    // depende de que el LLM haya corrido (ver enrichWithAnalysis / caché).
    selection_reason: buildQuickSelectionReason(product.category, product.specs, slots.use_cases, product.title),
    spec_highlights: explainProductSpecs(product.category, product.specs, slots.use_cases, product.title),
    spec_highlights_simple: explainProductSpecsSimple(product.category, product.specs, slots.use_cases, product.title),
    upgrade_note:
      typeof raw.upgrade_note === "string" ? raw.upgrade_note : null,
  };
}

export async function enrichWithAnalysis(
  products: ScoredFullProduct[],
  slots: Slots
): Promise<EnrichedProduct[]> {
  return Promise.all(
    products.map(async (product): Promise<EnrichedProduct> => {
      if (product.quality_price_analysis && product.analysis_generated_at) {
        const ageMs =
          Date.now() - new Date(product.analysis_generated_at).getTime();
        if (ageMs < ANALYSIS_FRESHNESS_MS) {
          // quality_price_analysis viene cacheado (generado en batch sin
          // presupuesto, ver lib/llm/batchAnalysis.ts) — pero
          // selection_reason/spec_highlights dependen de los use_cases de
          // ESTA búsqueda puntual, así que siempre se recalculan (son
          // baratos, no requieren LLM). El presupuesto tampoco estaba en el
          // texto cacheado, así que se agrega acá una frase determinística
          // (sin LLM) y se topea el score si corresponde, para no perder la
          // comparación de presupuesto que antes generaba el LLM en vivo.
          const budgetNote = buildBudgetFitNote(product, slots);
          const analysisText = budgetNote
            ? `${product.quality_price_analysis} ${budgetNote}`
            : product.quality_price_analysis;
          const score = product.quality_price_score
            ? capScoreByBudgetFit(product.quality_price_score, product, slots)
            : product.quality_price_score;

          return {
            ...product,
            quality_price_score: score,
            quality_price_analysis: analysisText,
            selection_reason: buildQuickSelectionReason(product.category, product.specs, slots.use_cases, product.title),
            spec_highlights: explainProductSpecs(product.category, product.specs, slots.use_cases, product.title),
            spec_highlights_simple: explainProductSpecsSimple(product.category, product.specs, slots.use_cases, product.title),
            upgrade_note: product.upgrade_note ?? null,
            analysis_from_cache: true,
          };
        }
      }

      const analysis = await generateProductAnalysis(product, slots);

      return {
        ...product,
        quality_price_score: analysis.quality_price_score,
        quality_price_analysis: analysis.quality_price_analysis,
        selection_reason: analysis.selection_reason,
        spec_highlights: analysis.spec_highlights,
        spec_highlights_simple: analysis.spec_highlights_simple,
        upgrade_note: analysis.upgrade_note,
        analysis_from_cache: false,
      };
    })
  );
}
