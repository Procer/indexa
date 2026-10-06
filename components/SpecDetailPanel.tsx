"use client";

import { useState } from "react";
import { buildSpecDetails, type SpecDetailInput } from "@/lib/domain/specDetail";
import type { HighlightLevel } from "@/lib/domain/specExplainer";
import type { UseCase } from "@/types";

// "¿Qué estás comprando?" — se despliega bajo el resultado con una tarjeta
// grande por característica: qué es, el dato real y qué significa para el uso
// del usuario. El dato técnico exacto va en letra chica, para quien lo entiende.

const LEVEL_PILL: Record<HighlightLevel, string> = {
  great: "bg-emerald-600/15 text-emerald-700",
  ok: "bg-sky-600/10 text-sky-700",
  warn: "bg-amber-600/15 text-amber-700",
};

interface SpecDetailPanelProps {
  product: SpecDetailInput;
  useCases: UseCase[];
}

export function SpecDetailPanel({ product, useCases }: SpecDetailPanelProps) {
  const [open, setOpen] = useState(false);
  const details = buildSpecDetails(product, useCases);
  if (details.length === 0) return null;

  return (
    <div className="w-full basis-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-gathering-primary-fixed-dim/40 bg-gathering-primary-fixed-dim/10 px-4 py-3 text-left font-brand text-sm font-bold text-gathering-primary-fixed-dim transition-colors hover:bg-gathering-primary-fixed-dim/15"
      >
        <span>{open ? "Ocultar explicación" : "¿Qué estás comprando? Verlo explicado"}</span>
        <span className="material-symbols-outlined text-xl" aria-hidden="true">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {details.map((d) => (
            <section
              key={d.label}
              className="flex flex-col gap-2 rounded-2xl border border-gathering-outline-variant bg-gathering-surface-container-low p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="flex items-center gap-2 font-brand text-base font-bold text-gathering-on-surface">
                  <span className="text-2xl" aria-hidden="true">{d.icon}</span>
                  {d.label}
                </h4>
                {d.verdict && (
                  <span className={`shrink-0 rounded-full px-2.5 py-1 font-brand text-xs font-bold ${LEVEL_PILL[d.level]}`}>
                    {d.verdict}
                  </span>
                )}
              </div>
              {d.value && <p className="font-brand text-2xl font-bold text-gathering-on-surface">{d.value}</p>}
              <p className="font-brand text-sm leading-relaxed text-gathering-on-surface-variant">{d.why}</p>
              {d.tech && d.tech !== d.value && (
                <p className="mt-auto border-t border-gathering-outline-variant/50 pt-2 font-brand text-[11px] text-gathering-on-surface-variant">
                  Dato técnico: <span className="font-semibold">{d.tech}</span>
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
