"use client";

import { useEffect, useRef, useState } from "react";
import { withBasePath } from "@/lib/basePath";
import { ProductChatCard } from "@/components/ProductChatCard";
import { Portal } from "@/components/Portal";
import { ResultsFilterBar } from "@/components/ResultsFilterBar";
import type { AlternativeProduct, EnrichedProduct } from "@/types";

interface AllResultsModalProps {
  initialProducts: EnrichedProduct[];
  totalCount: number;
  shareToken: string;
  onViewDetails: (product: EnrichedProduct) => void;
  onClose: () => void;
  compareList: EnrichedProduct[];
  onCompareToggle: (product: EnrichedProduct) => void;
}

function toAlternativeProduct(p: EnrichedProduct): AlternativeProduct {
  return {
    id: p.id,
    title: p.title,
    brand: p.brand,
    model: p.model,
    category: p.category,
    price_cash: p.price_cash,
    price_installment: p.price_installment,
    image_url: p.image_url,
    source: p.source,
    url: p.url,
    affiliate_url: p.affiliate_url,
    installment_count: p.installment_count,
    quality_price_score: p.quality_price_score,
    spec_highlights: p.spec_highlights,
    spec_highlights_simple: p.spec_highlights_simple,
    also_at: p.also_at,
  };
}

export function AllResultsModal({
  initialProducts,
  totalCount,
  shareToken,
  onViewDetails,
  onClose,
  compareList,
  onCompareToggle,
}: AllResultsModalProps) {
  const [items, setItems] = useState(initialProducts);
  const [loadingRest, setLoadingRest] = useState(initialProducts.length < totalCount);
  const [filteredItems, setFilteredItems] = useState(initialProducts);
  const category = initialProducts[0]?.category ?? null;

  // El modal muestra "todos los resultados" — en vez de paginar con "Cargar
  // más", trae automáticamente el resto del pool ni bien se abre (en tandas
  // de a 6, mismo endpoint de antes) y los va agregando a la grilla a medida
  // que llegan.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;

    async function loadRest() {
      let offset = initialProducts.length;
      let more = offset < totalCount;
      while (more && !cancelled) {
        try {
          const res = await fetch(withBasePath(`/api/search/${shareToken}/more?offset=${offset}`));
          if (!res.ok) break;
          const data = (await res.json()) as { products: EnrichedProduct[]; hasMore: boolean };
          if (cancelled) return;
          if (data.products.length === 0) break;
          setItems((prev) => [...prev, ...data.products]);
          offset += data.products.length;
          more = data.hasMore;
        } catch {
          break;
        }
      }
      if (!cancelled) setLoadingRest(false);
    }

    loadRest();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleView = (product: AlternativeProduct) => {
    const full = items.find((p) => p.id === product.id);
    if (full) onViewDetails(full);
    onClose();
  };

  const handleCompare = (product: AlternativeProduct) => {
    const full = items.find((p) => p.id === product.id);
    if (full) onCompareToggle(full);
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

        <div className="gathering-glass-panel relative flex max-h-[85vh] w-full max-w-4xl flex-col rounded-t-2xl bg-gathering-surface-container shadow-2xl ring-1 ring-black/5 sm:rounded-2xl">
          <div className="flex shrink-0 flex-col gap-3 border-b border-gathering-outline-variant/50 px-5 py-4">
            <div className="flex items-center justify-between">
              <h2 className="font-brand text-lg font-semibold text-gathering-on-surface">
                {totalCount} resultado{totalCount !== 1 ? "s" : ""} encontrado{totalCount !== 1 ? "s" : ""}
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
            <ResultsFilterBar products={items} category={category} onFilteredChange={setFilteredItems} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {filteredItems.length !== items.length && (
              <p className="mb-3 font-brand text-xs text-gathering-on-surface-variant">
                Mostrando {filteredItems.length} de {items.length} cargados
              </p>
            )}

            {filteredItems.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {filteredItems.map((p) => (
                  <ProductChatCard
                    key={p.id}
                    product={toAlternativeProduct(p)}
                    onViewDetails={handleView}
                    onCompareToggle={handleCompare}
                    isCompared={compareList.some((c) => c.id === p.id)}
                    compareDisabled={compareList.length >= 5}
                  />
                ))}
              </div>
            ) : (
              <p className="py-10 text-center font-brand text-sm text-gathering-on-surface-variant">
                Ningún resultado cargado coincide con esos filtros.
              </p>
            )}

            {loadingRest && (
              <div className="mt-4 flex items-center justify-center gap-2 font-brand text-xs text-gathering-on-surface-variant">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-gathering-outline-variant border-t-gathering-primary-fixed-dim" />
                Cargando el resto de los resultados ({items.length}/{totalCount})...
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
