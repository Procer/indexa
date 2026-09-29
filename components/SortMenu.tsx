"use client";

import { useEffect, useRef, useState } from "react";

export interface SortMenuOption {
  value: string;
  label: string;
  /** Explicación corta en lenguaje simple; se muestra debajo de la opción. */
  description?: string;
}

interface SortMenuProps {
  options: SortMenuOption[];
  value: string;
  onChange: (value: string) => void;
}

// Único menú de orden de la pantalla de resultados. Reemplaza al dropdown de 3
// opciones + la fila de 6 chips "Ordenar por" que convivían y repetían
// "Relevancia". Dropdown propio (no <select>) para poder mostrar la explicación
// de cada criterio a quien no sabe de tecnología.
export function SortMenu({ options, value, onChange }: SortMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-gathering-outline-variant bg-gathering-surface-container px-3.5 py-2 font-brand text-sm font-semibold text-gathering-on-surface transition-colors hover:bg-black/5"
      >
        <span className="material-symbols-outlined text-[18px] text-gathering-primary" aria-hidden="true">
          swap_vert
        </span>
        <span className="hidden text-gathering-on-surface-variant sm:inline">Ordenar:</span>
        <span>{current.label}</span>
        <span
          className={`material-symbols-outlined text-[18px] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gathering-outline-variant bg-gathering-surface-container-high py-1.5 shadow-xl"
        >
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2 px-3.5 py-2.5 text-left transition-colors ${
                  selected ? "bg-gathering-primary/10" : "hover:bg-black/5"
                }`}
              >
                <span
                  className={`material-symbols-outlined mt-0.5 text-[18px] ${
                    selected ? "text-gathering-primary" : "text-transparent"
                  }`}
                  aria-hidden="true"
                >
                  check
                </span>
                <span className="min-w-0">
                  <span
                    className={`block font-brand text-sm font-semibold ${
                      selected ? "text-gathering-primary" : "text-gathering-on-surface"
                    }`}
                  >
                    {opt.label}
                  </span>
                  {opt.description && (
                    <span className="mt-0.5 line-clamp-2 block font-brand text-xs leading-snug text-gathering-on-surface-variant">
                      {opt.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
