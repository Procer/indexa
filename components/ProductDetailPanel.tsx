"use client";

import { Portal } from "./Portal";
import { ProductCard } from "./ProductCard";
import type { EnrichedProduct } from "@/types";

// Panel de detalle completo — se abre al tocar "Ver más detalles" en una
// ProductChatCard. Reusa ProductCard tal cual (ya tiene specs, precio,
// alertas, compartir y comparar) en vez de reconstruir esa ficha de cero.
//
// Slide-over desde la derecha en desktop, pantalla completa en mobile — no
// reserva espacio en pantalla cuando no hay nada elegido (a diferencia de la
// columna persistente de antes, la grilla de resultados ahora ocupa todo el
// ancho disponible).

interface ProductDetailPanelProps {
  product: EnrichedProduct | null;
  onClose: () => void;
  onCompareToggle: (product: EnrichedProduct) => void;
  isCompared: boolean;
  compareDisabled: boolean;
  searchShareToken?: string;
  sessionId?: string;
}

export function ProductDetailPanel({
  product,
  onClose,
  onCompareToggle,
  isCompared,
  compareDisabled,
  searchShareToken,
  sessionId,
}: ProductDetailPanelProps) {
  if (!product) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
        <div className="animate-slide-up absolute inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-gathering-background shadow-2xl">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gathering-outline-variant/50 bg-gathering-surface-container/95 px-4 py-3 backdrop-blur-sm">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 font-brand text-sm font-semibold text-gathering-on-surface"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Volver a los resultados
            </button>
          </div>
          <div className="p-4 sm:p-6">
            <ProductCard
              product={product}
              onCompareToggle={onCompareToggle}
              isCompared={isCompared}
              compareDisabled={compareDisabled}
              searchShareToken={searchShareToken}
              sessionId={sessionId}
              specMode="bar"
            />
          </div>
        </div>
      </div>
    </Portal>
  );
}
