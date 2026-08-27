"use client";

import { useEffect, useState } from "react";
import { describePriceTrend } from "@/lib/domain/priceHistory";
import { withBasePath } from "@/lib/basePath";
import type { PriceHistoryPoint } from "@/types";

interface PriceHistorySparklineProps {
  productId: string;
}

const WIDTH = 110;
const HEIGHT = 28;
const PAD = 4;

export function PriceHistorySparkline({ productId }: PriceHistorySparklineProps) {
  const [points, setPoints] = useState<PriceHistoryPoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(withBasePath(`/api/products/${productId}/price-history`))
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { points: PriceHistoryPoint[] }) => {
        if (!cancelled) setPoints(data.points);
      })
      .catch(() => {
        if (!cancelled) setPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Sin datos todavía (recién arranca a acumularse) o menos de 2 puntos: no hay tendencia que mostrar.
  if (!points) return null;
  const withPrice = points.filter(
    (p): p is PriceHistoryPoint & { price_cash: number } => p.price_cash != null
  );
  if (withPrice.length < 2) return null;

  const trend = describePriceTrend(points);
  if (!trend) return null;

  const prices = withPrice.map((p) => p.price_cash);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const coords = withPrice.map((p, i) => ({
    x: PAD + (i / (withPrice.length - 1)) * (WIDTH - PAD * 2),
    y: PAD + (1 - (p.price_cash - min) / range) * (HEIGHT - PAD * 2),
    price: p.price_cash,
    date: p.recorded_at,
  }));

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");
  const last = coords[coords.length - 1];

  const dotColor =
    trend.direction === "down" ? "#0ca30c" : trend.direction === "up" ? "#d03b3b" : "#898781";
  const textClass =
    trend.direction === "down"
      ? "text-green-700"
      : trend.direction === "up"
      ? "text-red-600"
      : "text-gray-400";
  const arrow = trend.direction === "down" ? "▼" : trend.direction === "up" ? "▲" : "–";

  return (
    <div className="flex items-center gap-2">
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="shrink-0">
        <path
          d={linePath}
          fill="none"
          stroke="#c3c2b7"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c) => (
          <circle key={c.date} cx={c.x} cy={c.y} r={4} fill="transparent">
            <title>{`${new Date(c.date).toLocaleDateString("es-AR")}: $${Math.round(c.price).toLocaleString("es-AR")}`}</title>
          </circle>
        ))}
        <circle cx={last.x} cy={last.y} r={4} fill={dotColor} stroke="#fcfcfb" strokeWidth={2} />
      </svg>
      <div className="flex flex-col leading-tight">
        <span className={`text-xs font-semibold ${textClass}`}>
          {arrow} {trend.direction === "flat" ? "Sin cambios" : `${trend.pct}% en ${trend.days === 1 ? "el último día" : `los últimos ${trend.days} días`}`}
        </span>
        {trend.direction !== "flat" && (
          <span className="text-[11px] text-gray-400">
            <span className="line-through">${Math.round(trend.firstPrice).toLocaleString("es-AR")}</span>
            {" → "}
            <span className={trend.direction === "down" ? "text-green-700" : "text-red-600"}>
              ${Math.round(trend.lastPrice).toLocaleString("es-AR")}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
