// "Para vos, la mejor es X": una conclusión única para la comparación.
// Determinística (sin LLM) — mismos criterios que el resto del sitio:
// ¿le sirve para lo que pidió? (plainFit/translationStrip), ¿entra en el
// presupuesto? (buildBudgetFit), ¿cuánto le dura? (longevity) y la relación
// calidad/precio ya calculada por producto. Siempre dice qué se pierde frente
// a la alternativa más barata, para que la conclusión sea honesta.

import { buildFitVerdict, buildBudgetFit, type FitProduct } from "./plainFit";
import { buildOutlook } from "./longevity";
import { formatPrice } from "./productDisplay";
import type { ProductCategory, ProductSpecs, UseCase } from "@/types";

export interface WinnerCandidate {
  id: string;
  name: string;
  category: ProductCategory;
  title: string;
  specs?: ProductSpecs;
  price_cash: number | null;
  price_installment: number | null;
  quality_price_score?: string | null;
}

export interface WinnerInput {
  candidates: WinnerCandidate[];
  useCases: UseCase[];
  budgetCash: number | null;
  budgetMonthly: number | null;
}

export interface CompareWinner {
  winnerId: string;
  headline: string;
  reasons: string[];
  tradeoff: string | null;
  // Parejas: ninguna se despega — el texto lo aclara.
  close: boolean;
}

const QUALITY_POINTS: Record<string, number> = { EXCELENTE: 1, "MUY BUENO": 0.6, BUENO: 0.3, REGULAR: 0 };

interface Scored {
  c: WinnerCandidate;
  score: number;
  fitHeadline: string | null;
  fitWarn: string | null;
  budgetText: string | null;
  budgetOver: boolean;
  years: string | null;
  yearsMid: number | null;
  price: number | null;
}

function priceOf(c: WinnerCandidate, monthlyMode: boolean): number | null {
  return monthlyMode ? c.price_installment ?? c.price_cash : c.price_cash ?? c.price_installment;
}

export function buildCompareWinner(input: WinnerInput): CompareWinner | null {
  const { candidates, useCases, budgetCash, budgetMonthly } = input;
  if (candidates.length < 2) return null;

  const monthlyMode = budgetMonthly != null && budgetCash == null;
  const scored: Scored[] = candidates.map((c) => {
    const fitProduct: FitProduct = {
      category: c.category,
      title: c.title,
      specs: c.specs,
      price_cash: c.price_cash,
      price_installment: c.price_installment,
    };
    const fit = buildFitVerdict(fitProduct, useCases);
    const budget = buildBudgetFit(fitProduct, { cash: budgetCash, monthly: budgetMonthly });
    const outlook = buildOutlook({ category: c.category, title: c.title, specs: c.specs }, useCases);

    const chips = fit?.chips ?? [];
    const warns = chips.filter((x) => x.level === "warn").length;
    const greats = chips.filter((x) => x.level === "great").length;
    const yearsMid = outlook ? (outlook.yearsMin + outlook.yearsMax) / 2 : null;
    const budgetOver = budget?.tone === "warn";

    let score = greats * 1 - warns * 1.5;
    if (budgetOver) score -= 3;
    if (yearsMid != null) score += yearsMid * 0.5;
    score += QUALITY_POINTS[c.quality_price_score ?? ""] ?? 0;

    return {
      c,
      score,
      fitHeadline: fit?.headline ?? null,
      fitWarn: chips.find((x) => x.level === "warn")
        ? `${chips.find((x) => x.level === "warn")!.label.toLowerCase()} ${chips.find((x) => x.level === "warn")!.word}`
        : null,
      budgetText: budget?.text ?? null,
      budgetOver,
      years: outlook?.years ?? null,
      yearsMid,
      price: priceOf(c, monthlyMode),
    };
  });

  // Desempate por precio: a igual puntaje, la más barata.
  const prices = scored.map((s) => s.price).filter((p): p is number => p != null);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  for (const s of scored) {
    if (s.price != null && minPrice != null && minPrice > 0) s.score -= (s.price / minPrice - 1) * 0.4;
  }

  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const [best, second] = ranked;
  const close = !!second && best.score - second.score < 0.5;

  const reasons: string[] = [];
  if (best.fitHeadline) reasons.push(best.fitHeadline + ".");
  if (best.budgetText) reasons.push(best.budgetText);
  if (best.years) reasons.push(`Te debería durar ${best.years}.`);

  // Honestidad: qué se pierde frente a la opción más barata (si no es esta).
  let tradeoff: string | null = null;
  const cheaper = scored
    .filter((s) => s.c.id !== best.c.id && s.price != null && best.price != null && s.price < best.price)
    .sort((a, b) => (a.price as number) - (b.price as number))[0];
  if (cheaper && best.price != null && cheaper.price != null) {
    const diff = best.price - cheaper.price;
    const unit = monthlyMode ? " por mes" : "";
    const why = cheaper.budgetOver
      ? "se pasa de tu presupuesto"
      : cheaper.fitWarn
        ? `se queda corta en ${cheaper.fitWarn}`
        : cheaper.yearsMid != null && best.yearsMid != null && cheaper.yearsMid < best.yearsMid
          ? `te dura menos (${cheaper.years})`
          : null;
    tradeoff = why
      ? `La ${cheaper.c.name} sale ${formatPrice(diff)}${unit} menos, pero ${why}.`
      : `La ${cheaper.c.name} sale ${formatPrice(diff)}${unit} menos y rinde parecido: si querés ahorrar, es una buena alternativa.`;
  } else if (scored.length > 1 && best.price != null && minPrice != null && best.price === minPrice) {
    tradeoff = "Además es la más barata de las que elegiste.";
  }

  return {
    winnerId: best.c.id,
    headline: close
      ? `Están parejas — la que más te conviene es la ${best.c.name}`
      : `Para vos, la mejor es la ${best.c.name}`,
    reasons,
    tradeoff,
    close,
  };
}
