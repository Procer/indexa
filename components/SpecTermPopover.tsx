"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductCategory } from "@/types";
import { SPEC_GLOSSARY, type GlossaryEntry } from "@/lib/domain/specGlossary";

// Jugada #7 de PLAN_MEJORAS: cada etiqueta de spec de la tarjeta (Rapidez,
// Memoria, Almacenamiento…) es un tap que abre un popover chico con la metáfora
// del glosario + el "¿cómo sé si alcanza?". Reusa contenido ya curado en
// lib/domain/specGlossary.ts; cero LLM.

// Etiqueta funcional que usan specExplainer / extraCardFacts → key del glosario.
const LABEL_TO_KEY: Record<string, string> = {
  rapidez: "processor",
  memoria: "ram",
  almacenamiento: "storage",
  espacio: "storage",
  "gráfica": "gpu",
  grafica: "gpu",
  "batería": "battery",
  bateria: "battery",
  "cámara": "camera",
  camara: "camera",
  pantalla: "screen",
  "tamaño": "screen",
  tamano: "screen",
  peso: "screen",
  "resolución": "resolution",
  resolucion: "resolution",
};

function entryFor(category: ProductCategory, label: string): GlossaryEntry | null {
  const key = LABEL_TO_KEY[label.toLowerCase().trim()];
  if (!key) return null;
  return (SPEC_GLOSSARY[category] ?? []).find((e) => e.key === key) ?? null;
}

export function SpecTermPopover({
  category,
  label,
  className,
  variant = "inline",
}: {
  category: ProductCategory;
  label: string;
  className?: string;
  // "inline": la etiqueta es el botón (subrayado punteado + ícono de ayuda).
  // "chip": la etiqueta va plana y el disparador es un "?" redondo al lado —
  // para la fila compacta de la tarjeta de resultado (Opción B del mockup).
  variant?: "inline" | "chip";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const entry = entryFor(category, label);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Sin entrada de glosario para esta etiqueta → texto plano, sin tap.
  if (!entry) return <span className={className}>{label}</span>;

  return (
    <span ref={ref} className="relative inline-flex items-center">
      {variant === "chip" ? (
        <>
          <span className={className}>{label}</span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`Qué significa ${label}`}
            className="ml-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-gathering-outline-variant text-[8px] font-bold leading-none text-gathering-on-surface-variant hover:border-gathering-primary-fixed-dim hover:text-gathering-primary-fixed-dim"
          >
            ?
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`${className ?? ""} inline-flex items-center gap-0.5 underline decoration-dotted decoration-gathering-outline-variant underline-offset-2`}
        >
          {label}
          <span className="material-symbols-outlined text-[11px] opacity-60" aria-hidden>
            help
          </span>
        </button>
      )}
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-20 mt-1 block w-60 max-w-[calc(100vw-3rem)] rounded-lg border border-gathering-outline-variant bg-gathering-surface p-3 text-left font-brand text-[11px] font-normal normal-case leading-snug text-gathering-on-surface-variant shadow-lg"
        >
          <span className="mb-1 flex items-center gap-1.5 font-bold text-gathering-on-surface">
            <span aria-hidden>{entry.icon}</span> {entry.label}
          </span>
          <span className="block">{entry.metaphor}</span>
          <span className="mt-1.5 block text-gathering-on-surface">{entry.howToTell}</span>
        </span>
      )}
    </span>
  );
}
