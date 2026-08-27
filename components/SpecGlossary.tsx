"use client";

import { useEffect, useState } from "react";
import { getGlossaryForCategories } from "@/lib/domain/specGlossary";
import { getSpecGlossaryDismissed, setSpecGlossaryDismissed } from "@/lib/storage/localStorage";
import type { ProductCategory } from "@/types";

// Guía de referencia "qué significa cada característica" — colapsable, para
// que el usuario la abra cuando quiere entender un término sin que ocupe
// espacio permanente sobre los resultados. Compartida entre resultados de
// búsqueda y comparador. Arranca abierta la primera vez que el usuario la ve
// en cualquier página, y recuerda si la cerró (localStorage) para las
// próximas veces, en cualquier parte de la app.

interface SpecGlossaryProps {
  categories: ProductCategory[];
}

export function SpecGlossary({ categories }: SpecGlossaryProps) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOpen(!getSpecGlossaryDismissed());
    setReady(true);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setSpecGlossaryDismissed(!next);
  };

  const entries = getGlossaryForCategories(categories);
  if (entries.length === 0 || !ready) return null;

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/40">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-blue-900">
          <span aria-hidden>💡</span>
          ¿Qué significa cada característica?
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-blue-700 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <div key={entry.key} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-blue-100/70">
              <div className="flex items-center gap-1.5">
                <span aria-hidden>{entry.icon}</span>
                <span className="text-xs font-bold text-gray-900">{entry.label}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-gray-600">{entry.metaphor}</p>
              <p className="mt-2 rounded-lg bg-blue-50 px-2 py-1.5 text-xs leading-relaxed text-blue-900">{entry.howToTell}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
