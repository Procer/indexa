"use client";

import { useEffect, useRef, useState } from "react";

export type SortOrder = "relevance" | "price_asc" | "price_desc";

const OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "relevance", label: "Relevancia" },
  { value: "price_asc", label: "Precio: menor a mayor" },
  { value: "price_desc", label: "Precio: mayor a menor" },
];

// Dropdown propio en vez de <select> nativo — la lista de opciones de un
// <select> se renderiza con el estilo del sistema operativo/navegador (fondo
// blanco), no se puede tematizar con Tailwind, y quedaba fuera de lugar en
// el tema oscuro de la app (reportado con captura).
export function SortDropdown({ value, onChange }: { value: SortOrder; onChange: (value: SortOrder) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="gathering-glass-panel flex items-center gap-1.5 rounded-full px-3 py-1 font-brand text-xs font-medium normal-case text-gathering-on-surface"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current.label}
        <svg
          className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-40 mt-1 w-52 overflow-hidden rounded-xl border border-gathering-outline-variant bg-gathering-surface py-1 shadow-lg"
        >
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left font-brand text-sm normal-case ${
                opt.value === value
                  ? "bg-gathering-primary/10 text-gathering-primary-fixed-dim"
                  : "text-gathering-on-surface hover:bg-black/5"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
