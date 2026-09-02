"use client";

import { ProductChatCard } from "@/components/ProductChatCard";
import { groupVariants } from "@/lib/domain/variantGroup";
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
  onCompareAdd?: (ids: string[], open?: boolean) => void;
  onAskAbout?: (product: AlternativeProduct) => void;
  isCompared: (productId: string) => boolean;
  comparedIds?: string[];
  compareDisabled: boolean;
  searchShareToken?: string;
  sessionId?: string;
  paymentMode?: "cash" | "installments";
}

export function RecommendedProductsGrid({
  products,
  topPickIds,
  onViewDetails,
  onCompareToggle,
  onCompareAdd,
  onAskAbout,
  isCompared,
  comparedIds,
  compareDisabled,
  searchShareToken,
  sessionId,
  paymentMode = "cash",
}: RecommendedProductsGridProps) {
  if (products.length === 0) return null;

  // Si el set mezcla opciones dentro y fuera del presupuesto pedido, las que
  // entran llevan un chip verde de contraste (ver ProductChatCard.showBudgetFit).
  const showBudgetFit = products.some((p) => p.out_of_budget);

  const byId = new Map(products.map((p) => [p.id, p]));
  const topPicks = (topPickIds ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is AlternativeProduct => !!p);
  const topPickIdSet = new Set(topPicks.map((p) => p.id));
  // Los topPicks (curados por el chat) se muestran tal cual. El "resto" se
  // colapsa: casi-duplicados (color / SO / 256↔512GB) van a una sola tarjeta
  // con selector, liberando lugares del top para variedad real.
  const restBase = topPicks.length > 0 ? products.filter((p) => !topPickIdSet.has(p.id)) : products;
  const rest = groupVariants(restBase);

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
              onCompareAdd={onCompareAdd}
              onAskAbout={onAskAbout}
              isCompared={isCompared(p.id)}
              comparedIds={comparedIds}
              compareDisabled={compareDisabled}
              searchShareToken={searchShareToken}
              sessionId={sessionId}
              paymentMode={paymentMode}
              showBudgetFit={showBudgetFit}
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
                onCompareAdd={onCompareAdd}
                onAskAbout={onAskAbout}
                isCompared={isCompared(p.id)}
                comparedIds={comparedIds}
                compareDisabled={compareDisabled}
                searchShareToken={searchShareToken}
                sessionId={sessionId}
                paymentMode={paymentMode}
                showBudgetFit={showBudgetFit}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
