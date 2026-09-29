import type { PriceHistoryPoint } from "@/types";

export interface PriceTrend {
  direction: "down" | "up" | "flat";
  pct: number;
  days: number;
  firstPrice: number;
  lastPrice: number;
  text: string;
}

function daysBetween(a: string, b: string): number {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));
}

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}

function daysLabel(days: number): string {
  return days === 1 ? "el último día" : `los últimos ${days} días`;
}

/** Compara el primer y el último precio contado registrado. null si no hay suficiente historial. */
export function describePriceTrend(points: PriceHistoryPoint[]): PriceTrend | null {
  const withPrice = points.filter((p) => p.price_cash != null);
  if (withPrice.length < 2) return null;

  const first = withPrice[0];
  const last = withPrice[withPrice.length - 1];
  const firstPrice = first.price_cash as number;
  const lastPrice = last.price_cash as number;
  if (firstPrice <= 0) return null;

  const pct = Math.round(((lastPrice - firstPrice) / firstPrice) * 100);
  const days = daysBetween(first.recorded_at, last.recorded_at);

  if (pct === 0) {
    return {
      direction: "flat",
      pct: 0,
      days,
      firstPrice,
      lastPrice,
      text: `Sin cambios en ${daysLabel(days)}.`,
    };
  }

  const direction = pct < 0 ? "down" : "up";
  const verb = direction === "down" ? "Bajó" : "Subió";
  return {
    direction,
    pct: Math.abs(pct),
    days,
    firstPrice,
    lastPrice,
    text: `${verb} ${Math.abs(pct)}% en ${daysLabel(days)}: de ${formatMoney(firstPrice)} a ${formatMoney(lastPrice)}.`,
  };
}

// ─── Veredicto de precio ──────────────────────────────────────────────────────
// Responde "¿este precio es bueno HOY?" comparando el precio actual contra lo
// que costó en el período rastreado. El historial solo guarda cambios de precio
// (un punto por cambio), así que el promedio se pondera por tiempo: cada precio
// "vale" hasta el siguiente cambio, no una vez por punto.

export type PriceVerdictKind = "lowest" | "below_avg" | "typical" | "above_avg" | "highest";

export interface PriceVerdict {
  kind: PriceVerdictKind;
  /** Diferencia % del precio actual contra el promedio ponderado (negativo = más barato). */
  pctVsAvg: number;
  minPrice: number;
  maxPrice: number;
  days: number;
  text: string;
}

const MIN_DAYS_FOR_VERDICT = 3;
const TYPICAL_BAND_PCT = 3;

export function describePriceVerdict(
  points: PriceHistoryPoint[],
  now: Date = new Date()
): PriceVerdict | null {
  const priced = points
    .filter((p): p is PriceHistoryPoint & { price_cash: number } => p.price_cash != null && p.price_cash > 0)
    .map((p) => ({ price: Number(p.price_cash), t: new Date(p.recorded_at).getTime() }))
    .sort((a, b) => a.t - b.t);
  if (priced.length < 2) return null;

  const spanMs = now.getTime() - priced[0].t;
  const days = Math.max(1, Math.round(spanMs / 86_400_000));
  if (days < MIN_DAYS_FOR_VERDICT) return null;

  let weighted = 0;
  let total = 0;
  for (let i = 0; i < priced.length; i++) {
    const end = i + 1 < priced.length ? priced[i + 1].t : now.getTime();
    const dur = Math.max(0, end - priced[i].t);
    weighted += priced[i].price * dur;
    total += dur;
  }
  if (total <= 0) return null;

  const avg = weighted / total;
  const current = priced[priced.length - 1].price;
  const prices = priced.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const pctVsAvg = Math.round(((current - avg) / avg) * 100);
  const period = `en ${days === 1 ? "el último día" : `los últimos ${days} días`}`;

  // Variaciones de centavos o <3% no son una tendencia: no hablar de "más bajo/más alto".
  const meaningfulRange = (maxPrice - minPrice) / minPrice >= TYPICAL_BAND_PCT / 100;

  let kind: PriceVerdictKind;
  let text: string;
  if (meaningfulRange && current <= minPrice) {
    kind = "lowest";
    text = `Está en su precio más bajo ${period}.`;
  } else if (meaningfulRange && current >= maxPrice) {
    kind = "highest";
    text = `Está en su precio más alto ${period}. Conviene esperar.`;
  } else if (pctVsAvg <= -TYPICAL_BAND_PCT) {
    kind = "below_avg";
    text = `${Math.abs(pctVsAvg)}% por debajo de su precio habitual ${period}.`;
  } else if (pctVsAvg >= TYPICAL_BAND_PCT) {
    kind = "above_avg";
    text = `${pctVsAvg}% por encima de su precio habitual ${period}.`;
  } else {
    kind = "typical";
    text = `Precio habitual ${period}.`;
  }

  return { kind, pctVsAvg, minPrice, maxPrice, days, text };
}
