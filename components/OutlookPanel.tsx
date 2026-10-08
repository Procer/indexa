"use client";

import { useState } from "react";
import { buildOutlook, type OutlookInput } from "@/lib/domain/longevity";
import type { UseCase } from "@/types";

// "¿Cuánto me va a durar y qué puedo mejorar después?" — estimación en lenguaje
// llano (ver lib/domain/longevity.ts). Se despliega bajo la tarjeta.

export function OutlookPanel({ product, useCases }: { product: OutlookInput; useCases: UseCase[] }) {
  const [open, setOpen] = useState(false);
  const outlook = buildOutlook(product, useCases);
  if (!outlook) return null;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-gathering-outline-variant bg-gathering-surface-container-low px-4 py-3 text-left font-brand text-sm font-bold text-gathering-on-surface transition-colors hover:bg-gathering-surface-container"
      >
        <span>
          ⏳ Te debería durar {outlook.years}
          <span className="ml-1 font-normal text-gathering-on-surface-variant">
            · {open ? "ocultar" : "ver por qué y qué podés mejorar"}
          </span>
        </span>
        <span className="material-symbols-outlined text-xl" aria-hidden="true">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-gathering-outline-variant bg-gathering-surface-container-low p-4">
          <p className="font-brand text-sm leading-relaxed text-gathering-on-surface">{outlook.summary}</p>

          {outlook.reasons.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {outlook.reasons.map((r) => (
                <li key={r.text} className="flex gap-2 font-brand text-sm text-gathering-on-surface-variant">
                  <span aria-hidden="true">{r.good ? "✅" : "⚠️"}</span>
                  <span>{r.text}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {outlook.canUpgrade.length > 0 && (
              <div>
                <h4 className="mb-1 font-brand text-sm font-bold text-emerald-700">Lo que podés mejorar después</h4>
                <ul className="flex flex-col gap-1">
                  {outlook.canUpgrade.map((t) => (
                    <li key={t} className="font-brand text-sm text-gathering-on-surface-variant">
                      🔧 {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {outlook.cannotUpgrade.length > 0 && (
              <div>
                <h4 className="mb-1 font-brand text-sm font-bold text-amber-700">Lo que no se puede cambiar</h4>
                <ul className="flex flex-col gap-1">
                  {outlook.cannotUpgrade.map((t) => (
                    <li key={t} className="font-brand text-sm text-gathering-on-surface-variant">
                      🔒 {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <p className="font-brand text-[11px] text-gathering-on-surface-variant">
            Es una estimación según las características del equipo y lo que nos contaste; el uso real puede variar.
          </p>
        </div>
      )}
    </div>
  );
}
