"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Kit visual compartido del panel /admin: mismas tarjetas, métricas, rangos,
// menú de exportación y estados vacíos en todas las pantallas.

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 print:break-inside-avoid print:shadow-none ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-sm font-semibold text-gray-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
          </div>
          {actions && <div className="print:hidden">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const style = {
    info: "bg-blue-50 text-blue-900",
    warn: "bg-amber-50 text-amber-900",
    error: "bg-red-50 text-red-700",
    ok: "bg-emerald-50 text-emerald-800",
  }[tone];
  return <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${style}`}>{children}</div>;
}

export function Badge({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: "gray" | "green" | "blue" | "amber" | "red" | "purple";
}) {
  const style = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-700",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{children}</span>;
}

// Variación contra el período anterior: ▲ verde / ▼ rojo. `inverse` para
// métricas donde bajar es bueno (rebote, errores, sin resultado).
export function Delta({
  current,
  previous,
  inverse = false,
  suffix = "vs. período anterior",
}: {
  current: number;
  previous: number | null | undefined;
  inverse?: boolean;
  suffix?: string;
}) {
  if (previous === null || previous === undefined) return null;
  if (previous === 0 && current === 0) return <span className="text-[11px] text-gray-400">sin cambios</span>;
  if (previous === 0) return <span className="text-[11px] font-medium text-emerald-600">nuevo</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="text-[11px] text-gray-400">igual {suffix}</span>;
  const good = inverse ? pct < 0 : pct > 0;
  return (
    <span className={`text-[11px] font-medium ${good ? "text-emerald-600" : "text-red-600"}`}>
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}% <span className="font-normal text-gray-400">{suffix}</span>
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  delta,
  accent,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  delta?: ReactNode;
  accent?: "blue" | "green" | "amber" | "red" | "purple";
}) {
  const bar = accent
    ? { blue: "bg-blue-500", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500", purple: "bg-purple-500" }[accent]
    : null;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 print:shadow-none">
      {bar && <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} aria-hidden />}
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{value}</p>
      {delta && <div className="mt-0.5">{delta}</div>}
      {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

export function RangeTabs<T extends number>({
  options,
  value,
  onChange,
  format = (n) => `${n}d`,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  return (
    <div className="inline-flex rounded-full bg-gray-100 p-1 print:hidden">
      {options.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
            value === r ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {format(r)}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const style = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
    ghost: "text-gray-600 hover:bg-gray-100",
    danger: "border border-red-100 text-red-500 hover:bg-red-50",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${style} ${className}`}
    >
      {children}
    </button>
  );
}

export interface ExportOption {
  label: string;
  hint?: string;
  onSelect: () => void;
}

// Menú desplegable "Exportar ▾" — cada opción dispara una descarga/impresión.
export function ExportMenu({ options, label = "Exportar" }: { options: ExportOption[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative print:hidden">
      <Button onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M10 3v9m0 0-3-3m3 3 3-3M4 14v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
        <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor" aria-hidden>
          <path d="M5 7l5 6 5-6H5z" />
        </svg>
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-gray-200">
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => {
                setOpen(false);
                o.onSelect();
              }}
              className="block w-full px-4 py-2 text-left hover:bg-gray-50"
            >
              <span className="block text-sm font-medium text-gray-800">{o.label}</span>
              {o.hint && <span className="block text-[11px] text-gray-400">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmptyState({ icon = "📭", title, text }: { icon?: string; title: string; text?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white/60 px-6 py-12 text-center">
      <p className="text-3xl" aria-hidden>
        {icon}
      </p>
      <p className="mt-2 text-sm font-semibold text-gray-700">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-gray-400">{text}</p>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200/70 ${className}`} />;
}

// Esqueleto de pantalla mientras carga: filas de tarjetas grises.
export function PageSkeleton({ stats = 4, blocks = 2 }: { stats?: number; blocks?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: stats }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      {Array.from({ length: blocks }).map((_, i) => (
        <Skeleton key={i} className="h-48" />
      ))}
    </div>
  );
}

// Barras horizontales de ranking (label + barra + valor).
export function RankBars({
  data,
  color = "bg-blue-600",
  empty = "Sin datos en este rango.",
}: {
  data: { key: string; label: string; count: number; hint?: string }[];
  color?: string;
  empty?: string;
}) {
  if (data.length === 0) return <p className="text-sm text-gray-400">{empty}</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.key} className="flex items-center gap-3 text-sm" title={d.hint}>
          <span className="w-32 shrink-0 truncate text-gray-600">{d.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${(d.count / max) * 100}%` }} />
          </div>
          <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-gray-900">{d.count}</span>
        </div>
      ))}
    </div>
  );
}
