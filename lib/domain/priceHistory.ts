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
