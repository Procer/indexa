"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { applyFacetFilters, buildFacetOptions, getFilterFacets } from "@/lib/domain/resultFilters";
import type { EnrichedProduct, ProductCategory } from "@/types";

interface ResultsFilterBarProps {
  products: EnrichedProduct[];
  category: ProductCategory | null;
  onFilteredChange: (filtered: EnrichedProduct[]) => void;
  // Cuando el chat pide resaltar un facet (ej. "store"): el botón pulsa y se
  // scrollea a la vista. El resaltado queda HASTA que el usuario toca ese
  // filtro — ahí se llama onHighlightConsumed para que el padre lo limpie.
  highlightKey?: string | null;
  onHighlightConsumed?: () => void;
}

export function ResultsFilterBar({
  products,
  category,
  onFilteredChange,
  highlightKey,
  onHighlightConsumed,
}: ResultsFilterBarProps) {
  const facets = useMemo(() => getFilterFacets(category), [category]);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  // Recalcula las opciones de cada facet contra el resto de los filtros ya
  // elegidos (facetado cruzado) — depende de `selected`, no solo de
  // products/facets, para que tocar un filtro reordene/recorte al resto.
  const optionsByFacet = useMemo(
    () => buildFacetOptions(products, facets, selected),
    [products, facets, selected]
  );
  const [openFacet, setOpenFacet] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightBtnRef = useRef<HTMLButtonElement>(null);

  // Al pedir resaltar un facet, scrollearlo a la vista (el pulso lo hace la
  // clase CSS mientras highlightKey coincida).
  useEffect(() => {
    if (highlightKey && highlightBtnRef.current) {
      highlightBtnRef.current.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }, [highlightKey]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpenFacet(null);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    onFilteredChange(applyFacetFilters(products, facets, selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, facets, selected]);

  // Si cambia la categoría de resultados (búsqueda nueva), los filtros viejos
  // ya no aplican — evita quedar con un facet seleccionado que no existe más.
  useEffect(() => {
    setSelected({});
  }, [category]);

  function toggleValue(facetKey: string, value: string) {
    setSelected((prev) => {
      const next = new Set(prev[facetKey] ?? []);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [facetKey]: next };
    });
  }

  const activeCount = Object.values(selected).reduce((sum, set) => sum + set.size, 0);

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-2">
      {facets.map((facet) => {
        const options = optionsByFacet[facet.key] ?? [];
        if (options.length === 0) return null;
        const selectedValues = selected[facet.key] ?? new Set<string>();
        const isOpen = openFacet === facet.key;
        const isHighlighted = highlightKey === facet.key;

        return (
          <div key={facet.key} className="relative">
            <button
              ref={isHighlighted ? highlightBtnRef : undefined}
              type="button"
              onClick={() => {
                setOpenFacet(isOpen ? null : facet.key);
                if (isHighlighted) onHighlightConsumed?.();
              }}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-brand text-xs font-semibold transition-colors ${
                selectedValues.size > 0
                  ? "border-gathering-primary-fixed-dim/50 bg-gathering-primary-fixed-dim/10 text-gathering-primary-fixed-dim"
                  : "border-gathering-outline-variant text-gathering-on-surface-variant hover:bg-black/5"
              } ${
                isHighlighted
                  ? "animate-[pulse_1.4s_ease-in-out_infinite] ring-2 ring-gathering-primary-fixed-dim ring-offset-2 ring-offset-gathering-background"
                  : ""
              }`}
            >
              {facet.label}
              {selectedValues.size > 0 ? ` (${selectedValues.size})` : ""}
              <svg
                className={`h-3 w-3 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {isOpen && (
              <div className="absolute left-0 top-full z-40 mt-1.5 max-h-64 w-56 overflow-y-auto rounded-xl border border-gathering-outline-variant/50 bg-gathering-surface-container-high p-1.5 shadow-2xl">
                {options.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 font-brand text-xs text-gathering-on-surface hover:bg-black/5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedValues.has(opt.value)}
                        onChange={() => toggleValue(facet.key, opt.value)}
                        className="h-3.5 w-3.5 shrink-0 rounded border-gathering-outline-variant accent-gathering-primary-fixed-dim"
                      />
                      <span className="truncate">{opt.value}</span>
                    </span>
                    <span className="shrink-0 text-gathering-on-surface-variant">{opt.count}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => setSelected({})}
          className="flex items-center gap-1 rounded-full border border-red-600/30 bg-red-600/10 px-3.5 py-1.5 font-brand text-xs font-semibold text-red-700 transition-colors hover:bg-red-600/20"
        >
          <span aria-hidden>✕</span> Limpiar filtros ({activeCount})
        </button>
      )}
    </div>
  );
}
