"use client";

import { ProductChatCard } from "@/components/ProductChatCard";
import type { AlternativeProduct } from "@/types";

// Grilla de resultados de la pantalla principal — antes esto vivía adentro
// del hilo del chat (una tarjeta por mensaje); ahora el chat es una burbuja
// flotante y esto ocupa la pantalla: los picks del chat destacados arriba
// (hasta 5, el primero como "Mejor opción" y el resto como "Recomendado"),
// el resto ("también podrías considerar") en grilla debajo.

interface RecommendedProductsGridProps {
  products: AlternativeProduct[];
  topPickIds?: string[] | null;
  onViewDetails: (product: AlternativeProduct) => void;
  onCompareToggle: (product: AlternativeProduct) => void;
  isCompared: (productId: string) => boolean;
  compareDisabled: boolean;
  searchShareToken?: string;
  sessionId?: string;
}

export function RecommendedProductsGrid({
  products,
  topPickIds,
  onViewDetails,
  onCompareToggle,
  isCompared,
  compareDisabled,
  searchShareToken,
  sessionId,
}: RecommendedProductsGridProps) {
  if (products.length === 0) return null;

  const byId = new Map(products.map((p) => [p.id, p]));
  const topPicks = (topPickIds ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is AlternativeProduct => !!p);
  const topPickIdSet = new Set(topPicks.map((p) => p.id));
  const rest = topPicks.length > 0 ? products.filter((p) => !topPickIdSet.has(p.id)) : products;

  return (
    <div className="flex flex-col gap-4">
      {topPicks.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {topPicks.map((p, i) => (
            <ProductChatCard
              key={p.id}
              product={p}
              isTopPick
              pickRank={i + 1}
              onViewDetails={onViewDetails}
              onCompareToggle={onCompareToggle}
              isCompared={isCompared(p.id)}
              compareDisabled={compareDisabled}
              searchShareToken={searchShareToken}
              sessionId={sessionId}
            />
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <>
          {topPicks.length > 0 && (
            <div className="flex items-center gap-3">
              <hr className="flex-1 border-gathering-outline-variant" />
              <span className="font-brand text-[11px] font-bold uppercase tracking-wide text-gathering-on-surface-variant">
                También podrías considerar
              </span>
              <hr className="flex-1 border-gathering-outline-variant" />
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rest.map((p) => (
              <ProductChatCard
                key={p.id}
                product={p}
                onViewDetails={onViewDetails}
                onCompareToggle={onCompareToggle}
                isCompared={isCompared(p.id)}
                compareDisabled={compareDisabled}
                searchShareToken={searchShareToken}
                sessionId={sessionId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
