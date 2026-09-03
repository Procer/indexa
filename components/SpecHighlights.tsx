"use client";

import { useState } from "react";
import { classifyHighlightLevel, type HighlightLevel } from "@/lib/domain/specExplainer";
import { SpecTermPopover } from "./SpecTermPopover";
import type { ProductCategory } from "@/types";

// Datos físicos en lenguaje llano (pantalla / tamaño / peso con la comparación
// completa). En la tarjeta de resultado van como fila compacta; acá, en "Ver
// detalle", el usuario los quiere como sub-bloque propio JUSTO debajo de la
// caja "Por qué te conviene".
export interface PracticeFact {
  label: string;
  value?: string;
  text: string;
}

// ─── "Por qué te conviene" ─────────────────────────────────────────────────
// Cada bullet simple viene como "Etiqueta: descripción" (ver specExplainer.ts).
// Tres formas de mostrar el mismo dato (`mode`), a pedido del usuario: las
// tarjetas de color originales confundían ("no entiendo qué significan los
// colores"). Las tres usan la misma escala semáforo roja-amarilla-verde,
// universal, en vez de colores arbitrarios. Compartido entre ProductCard y
// el comparador.

export type SpecDisplayMode = "bar" | "fuel" | "checklist";

interface SpecHighlightsProps {
  highlights: string[];
  technicalHighlights?: string[];
  mode?: SpecDisplayMode;
  // "En la práctica" — sub-bloque opcional bajo "Por qué te conviene".
  practiceFacts?: PracticeFact[];
  practiceCategory?: ProductCategory;
}

// Posición semáforo (0-100%) y color por nivel — mismo criterio en los 3 modos.
// Colores directos de Tailwind (no tokens "gathering-") a propósito: son los
// mismos rojo/ámbar/esmeralda que ya usa el resto de la app en modo oscuro
// para estados (ver alerta de precio y badges en ProductCard.tsx).
export const LEVEL_POSITION: Record<HighlightLevel, number> = { warn: 16, ok: 55, great: 90 };
export const LEVEL_DOT: Record<HighlightLevel, string> = { warn: "bg-red-400", ok: "bg-amber-400", great: "bg-emerald-400" };
const LEVEL_TEXT: Record<HighlightLevel, string> = { warn: "text-red-600", ok: "text-amber-700", great: "text-emerald-700" };
const LEVEL_FUEL_FILLED: Record<HighlightLevel, number> = { warn: 2, ok: 3, great: 5 };
const LEVEL_WORD: Record<HighlightLevel, string> = { warn: "Limitado", ok: "Adecuado", great: "Sobrado" };
const LEVEL_ICON: Record<HighlightLevel, string> = { warn: "⚠", ok: "✓", great: "✓" };
const LEVEL_PILL: Record<HighlightLevel, string> = {
  warn: "bg-red-600/10 text-red-700",
  ok: "bg-amber-600/10 text-amber-700",
  great: "bg-emerald-600/10 text-emerald-700",
};

function highlightIcon(label: string): React.ReactNode {
  const l = label.toLowerCase();
  if (l.includes("memoria")) {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" />
      </svg>
    );
  }
  if (l.includes("rapidez")) {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    );
  }
  if (l.includes("almacenamiento")) {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
      </svg>
    );
  }
  if (l.includes("gráfica") || l.includes("grafica")) {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
      </svg>
    );
  }
  if (l.includes("cámara") || l.includes("camara")) {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
      </svg>
    );
  }
  if (l.includes("batería") || l.includes("bateria")) {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function parseHighlight(highlight: string): { label: string; desc: string } {
  const idx = highlight.indexOf(":");
  if (idx === -1) return { label: "", desc: highlight };
  return { label: highlight.slice(0, idx).trim(), desc: highlight.slice(idx + 1).trim() };
}

function BarRow({ highlight }: { highlight: string }) {
  const { label, desc } = parseHighlight(highlight);
  const level = classifyHighlightLevel(highlight);
  return (
    <div className="rounded-xl border border-gathering-outline-variant/50 bg-gathering-surface-container-low p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="flex items-center gap-1.5 text-xs font-bold text-gathering-on-surface">
          <span className="shrink-0 text-gathering-on-surface-variant">{highlightIcon(label)}</span>
          {label}
        </span>
        <span className={`shrink-0 text-[11px] font-bold uppercase tracking-wide ${LEVEL_TEXT[level]}`}>
          {LEVEL_WORD[level]}
        </span>
      </div>
      <div className="relative mt-2.5 h-1.5 rounded-full bg-gradient-to-r from-red-400/30 via-amber-400/30 to-emerald-400/30">
        <span
          className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-gathering-surface-container-low shadow ${LEVEL_DOT[level]}`}
          style={{ left: `${LEVEL_POSITION[level]}%` }}
        />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gathering-on-surface-variant">{desc}</p>
    </div>
  );
}

function FuelRow({ highlight }: { highlight: string }) {
  const { label, desc } = parseHighlight(highlight);
  const level = classifyHighlightLevel(highlight);
  const filled = LEVEL_FUEL_FILLED[level];
  return (
    <div className="rounded-xl border border-gathering-outline-variant/50 bg-gathering-surface-container-low p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="flex items-center gap-1.5 text-xs font-bold text-gathering-on-surface">
          <span className="shrink-0 text-gathering-on-surface-variant">{highlightIcon(label)}</span>
          {label}
        </span>
        <span aria-hidden className="shrink-0 text-xs">⛽</span>
      </div>
      <div className="mt-2.5 flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={`h-2.5 flex-1 rounded-sm ${i < filled ? LEVEL_DOT[level] : "bg-gathering-surface-variant"}`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gathering-on-surface-variant">{desc}</p>
    </div>
  );
}

function ChecklistRow({ highlight }: { highlight: string }) {
  const { label, desc } = parseHighlight(highlight);
  const level = classifyHighlightLevel(highlight);
  return (
    <div className="flex items-start gap-2 border-b border-gathering-outline-variant/50 py-2.5 last:border-0">
      <span className={`mt-0.5 shrink-0 text-sm ${LEVEL_TEXT[level]}`} aria-hidden>
        {LEVEL_ICON[level]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-gathering-on-surface">{label}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${LEVEL_PILL[level]}`}>
            {LEVEL_WORD[level]}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-gathering-on-surface-variant">{desc}</p>
      </div>
    </div>
  );
}

export function SpecHighlights({
  highlights,
  technicalHighlights,
  mode = "bar",
  practiceFacts,
  practiceCategory,
}: SpecHighlightsProps) {
  if (highlights.length === 0 && !practiceFacts?.length) return null;

  return (
    <div>
      {highlights.length > 0 && (
        <>
          <div className="mb-2 flex items-center gap-1.5">
            <svg className="h-4 w-4 shrink-0 text-gathering-primary-fixed-dim" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-bold uppercase tracking-wide text-gathering-on-surface">Por qué te conviene</span>
          </div>

          {mode === "checklist" ? (
            <div className="rounded-xl border border-gathering-outline-variant/50 bg-gathering-surface-container-low p-3">
              {highlights.map((h) => <ChecklistRow key={h} highlight={h} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {highlights.map((h) =>
                mode === "fuel" ? <FuelRow key={h} highlight={h} /> : <BarRow key={h} highlight={h} />
              )}
            </div>
          )}

          {technicalHighlights && technicalHighlights.length > 0 && (
            <TechnicalDetail items={technicalHighlights} />
          )}
        </>
      )}

      {/* "En la práctica" — sub-bloque JUSTO debajo de la caja anterior
          (pedido del usuario en test en vivo). */}
      {practiceFacts && practiceFacts.length > 0 && (
        <div className={highlights.length > 0 ? "mt-4" : undefined}>
          <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-gathering-on-surface">
            En la práctica
          </span>
          <ul className="flex flex-col gap-2">
            {practiceFacts.map((f) => (
              <li
                key={f.label}
                className="flex gap-2 font-brand text-xs leading-snug text-gathering-on-surface-variant"
              >
                <span
                  className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-gathering-outline-variant"
                  aria-hidden
                />
                <span className="min-w-0">
                  {practiceCategory ? (
                    <SpecTermPopover
                      category={practiceCategory}
                      label={f.label}
                      className="font-bold uppercase tracking-wide text-gathering-on-surface"
                    />
                  ) : (
                    <span className="font-bold uppercase tracking-wide text-gathering-on-surface">{f.label}</span>
                  )}
                  {f.value && (
                    <span className="mx-1 rounded bg-gathering-surface-container-highest px-1.5 py-px text-[10px] font-bold text-gathering-on-surface">
                      {f.value}
                    </span>
                  )}{" "}
                  {f.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TechnicalDetail({ items }: { items: string[] }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="mt-2.5 flex items-center gap-1 text-xs font-semibold text-gathering-primary-fixed-dim hover:text-gathering-primary-fixed"
      >
        {show ? "Ocultar detalle técnico" : "Ver detalle técnico"}
        <svg
          className={`h-3 w-3 shrink-0 transition-transform duration-150 ${show ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {show && (
        <ul className="mt-2 space-y-1.5 rounded-xl border border-gathering-outline-variant/50 bg-gathering-surface-container-low p-3">
          {items.map((highlight) => (
            <li key={highlight} className="flex items-start gap-1.5 text-xs leading-relaxed text-gathering-on-surface-variant">
              <span className="mt-0.5 shrink-0 text-gathering-outline">•</span>
              <span>{highlight}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
