"use client";

import type { SpecDisplayMode } from "./SpecHighlights";

// Selector de las 3 formas de mostrar "Por qué te conviene", a pedido del
// usuario para comparar en vivo cuál se entiende mejor antes de quedarse con
// una sola. Vive en la página (resultados/comparador), que pasa `mode` a
// todas las tarjetas a la vez.

const OPTIONS: { value: SpecDisplayMode; label: string }[] = [
  { value: "bar", label: "Barra" },
  { value: "fuel", label: "Combustible" },
  { value: "checklist", label: "Checklist" },
];

interface SpecDisplayModeToggleProps {
  mode: SpecDisplayMode;
  onChange: (mode: SpecDisplayMode) => void;
}

export function SpecDisplayModeToggle({ mode, onChange }: SpecDisplayModeToggleProps) {
  return (
    <div className="mb-4 flex items-center gap-2 font-brand text-xs">
      <span className="font-semibold text-gathering-on-surface-variant">Ver &quot;por qué te conviene&quot; como:</span>
      <div className="inline-flex rounded-full bg-gathering-surface-container-low p-0.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3 py-1 font-semibold transition-colors ${
              mode === opt.value
                ? "bg-gathering-surface-container-high text-gathering-primary-fixed-dim shadow-sm"
                : "text-gathering-on-surface-variant hover:text-gathering-on-surface"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
