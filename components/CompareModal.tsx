"use client";

import { useMemo, useState } from "react";
import { CompareTable } from "@/components/CompareTable";
import { Portal } from "@/components/Portal";
import type { CompareItem, EnrichedProduct } from "@/types";

interface CompareModalProps {
  products: EnrichedProduct[];
  onClose: () => void;
}

// EnrichedProduct ya trae todos los campos que pide ProductAnalysis (se
// generan una sola vez al enriquecer el producto, ver lib/llm/productAnalysis.ts)
// así que compararlos acá es un mapeo directo — no hace falta pegarle a
// ninguna API nueva ni recalcular nada.
function toCompareItem(product: EnrichedProduct): CompareItem {
  return {
    product,
    analysis: {
      quality_price_score: product.quality_price_score ?? "REGULAR",
      quality_price_analysis: product.quality_price_analysis ?? "",
      selection_reason: product.selection_reason,
      spec_highlights: product.spec_highlights,
      spec_highlights_simple: product.spec_highlights_simple,
      upgrade_note: product.upgrade_note,
    },
  };
}

export function CompareModal({ products, onClose }: CompareModalProps) {
  // "Quitar" en CompareTable solo saca la columna de esta vista puntual —
  // no toca la conversación ni la lista de productos que recomendó el bot.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  const items = useMemo(
    () => products.filter((p) => !excludedIds.has(p.id)).map(toCompareItem),
    [products, excludedIds]
  );

  const handleRemove = (productId: string) => {
    setExcludedIds((prev) => new Set(prev).add(productId));
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

        <div className="gathering-glass-panel relative flex max-h-[85vh] w-[97vw] max-w-[1600px] flex-col rounded-t-2xl bg-gathering-surface-container shadow-2xl ring-1 ring-black/5 sm:rounded-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-gathering-outline-variant/50 px-5 py-4">
            <h2 className="font-brand text-lg font-semibold text-gathering-on-surface">
              Comparar {products.length > 0 ? `(${items.length})` : ""}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gathering-on-surface-variant hover:text-gathering-on-surface"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {items.length > 0 ? (
              <CompareTable items={items} onRemove={handleRemove} />
            ) : (
              <p className="py-10 text-center font-brand text-sm text-gathering-on-surface-variant">
                Sacaste todas las opciones de la comparación.
              </p>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
