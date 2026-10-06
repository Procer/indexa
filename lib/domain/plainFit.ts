// Veredicto en lenguaje llano para las tarjetas de resultado: "¿me sirve para lo
// que quiero hacer?" y "¿entra en lo que puedo pagar?". Determinístico (sin LLM),
// se apoya en translationStrip (mismos umbrales que el resto del sitio) para no
// duplicar criterios técnicos en la UI.

import { formatUseCasesLabel, translationStrip, type HighlightLevel, type TranslationChip } from "./specExplainer";
import { formatPrice } from "./productDisplay";
import type { ProductCategory, ProductSpecs, UseCase } from "@/types";

export interface FitVerdict {
  level: HighlightLevel;
  headline: string;
  // Lo mejor o lo más flojo del equipo, en una frase corta. null si no hay datos.
  detail: string | null;
  chips: TranslationChip[];
}

export interface BudgetFit {
  tone: "ok" | "warn";
  text: string;
}

export interface FitProduct {
  category: ProductCategory;
  title: string;
  specs?: ProductSpecs;
  price_cash: number | null;
  price_installment: number | null;
  out_of_budget?: "above" | "below" | null;
}

const LEVEL_PHRASE: Record<HighlightLevel, string> = {
  great: "te va a andar de sobra",
  ok: "te va a andar bien",
  warn: "te va a alcanzar justo",
};

export function buildFitVerdict(product: FitProduct, useCases: UseCase[]): FitVerdict | null {
  if (!product.specs) return null;
  const chips = translationStrip(product.category, product.specs, useCases, product.title);
  if (chips.length === 0) return null;

  const warn = chips.find((c) => c.level === "warn");
  const great = chips.find((c) => c.level === "great");
  const level: HighlightLevel = warn ? "warn" : great ? "great" : "ok";

  const useLabel = useCases.length > 0 ? formatUseCasesLabel(useCases) : "el uso de todos los días";
  const headline = `Para ${useLabel} ${LEVEL_PHRASE[level]}`;

  const detail = warn
    ? `Lo más flojo: ${warn.label.toLowerCase()} ${warn.word}.`
    : great
      ? `Lo mejor: ${great.label.toLowerCase()} ${great.word}.`
      : null;

  return { level, headline, detail, chips };
}

export interface BudgetInput {
  cash: number | null;
  monthly: number | null;
}

// Tolerancia: por debajo de este margen se dice "justo" en vez de "te sobran $X".
const TIGHT_MARGIN = 0.05;

export function buildBudgetFit(product: FitProduct, budget: BudgetInput): BudgetFit | null {
  if (product.out_of_budget === "above") {
    return { tone: "warn", text: "Se pasa de tu presupuesto — te la mostramos por si te sirve." };
  }
  if (product.out_of_budget === "below") {
    return { tone: "ok", text: "Cuesta menos de lo que pensabas gastar." };
  }
  if (budget.cash != null && product.price_cash != null) {
    const left = budget.cash - product.price_cash;
    if (left < 0) return { tone: "warn", text: `Te pasás ${formatPrice(-left)} de tu presupuesto.` };
    if (left / budget.cash < TIGHT_MARGIN) return { tone: "ok", text: "Entra justo en tu presupuesto." };
    return { tone: "ok", text: `Entra en tu presupuesto y te sobran ${formatPrice(left)}.` };
  }
  if (budget.monthly != null && product.price_installment != null) {
    // price_installment ya es la cuota mensual (no dividir).
    if (product.price_installment > budget.monthly) {
      return { tone: "warn", text: `La cuota se pasa ${formatPrice(product.price_installment - budget.monthly)} por mes de lo que querías pagar.` };
    }
    return { tone: "ok", text: "La cuota entra en lo que querés pagar por mes." };
  }
  return null;
}

export const PLAIN_QUALITY_LABEL: Record<string, string> = {
  EXCELENTE: "Excelente compra",
  "MUY BUENO": "Muy buena compra",
  BUENO: "Buena compra",
  REGULAR: "Compra regular",
};
