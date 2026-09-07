"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/auth/adminClient";
import type {
  SearchAnalytics,
  SearchAnalyticsCategory,
  SearchAnalyticsDay,
  SearchAnalyticsDow,
  SearchAnalyticsHour,
  SearchAnalyticsMonth,
} from "@/types";

const RANGES = [7, 30, 90] as const;

const CATEGORY_LABELS: Record<string, string> = {
  notebook: "Notebooks",
  desktop: "PCs de escritorio",
  tablet: "Tablets",
  tv: "TVs",
  phone: "Celulares",
  "sin categoría": "Sin categoría",
};

// Mismas etiquetas que USE_CASE_LABEL en lib/domain/specExplainer.ts —
// duplicado a propósito (igual que CATEGORY_LABELS arriba): esta página ya
// hardcodea sus propias etiquetas de UI en vez de importar del dominio.
const USE_CASE_LABELS: Record<string, string> = {
  casual_browsing: "Uso diario",
  office: "Trabajo de oficina",
  study: "Estudio",
  multimedia: "Ver películas y series",
  photo_editing_light: "Edición de fotos",
  photo_editing_pro: "Edición de fotos pro",
  video_editing_1080: "Edición de video",
  video_editing_4k: "Edición de video 4K",
  programming: "Programar",
  gaming_casual: "Jugar (casual)",
  gaming_competitive: "Gaming competitivo",
  graphic_design: "Diseño gráfico",
  cad_3d: "Diseño 3D",
  portability: "Llevarla a todos lados",
  stationary: "Uso fijo en casa",
  photography: "Sacar fotos",
  battery_life: "Batería que dure",
  gaming_mobile: "Jugar desde el celular",
  basic_use: "Uso básico",
  social_media: "Redes sociales",
  professional_mobile: "Trabajo y email",
};

const MONTH_LABELS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function formatPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function DailyVolumeChart({ data }: { data: SearchAnalyticsDay[] }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">Sin búsquedas en este rango.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex h-32 items-end gap-1 border-b border-gray-200">
      {data.map((d) => (
        <div key={d.date} className="group flex-1">
          <div
            title={`${new Date(`${d.date}T00:00:00`).toLocaleDateString("es-AR")}: ${d.count} búsqueda${d.count === 1 ? "" : "s"}`}
            className="w-full rounded-t bg-blue-600 transition-colors group-hover:bg-blue-700"
            style={{ height: `${d.count > 0 ? Math.max((d.count / max) * 100, 4) : 0}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function CategoryBars({ data }: { data: SearchAnalyticsCategory[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-400">Sin datos en este rango.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.category} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 truncate text-gray-600">
            {CATEGORY_LABELS[d.category] ?? d.category}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right font-semibold text-gray-900">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

// Barra de ranking genérica — misma pinta que CategoryBars, reusada para
// uso/marca/tienda (listas de {label, count} sin tipo compartido entre sí).
function RankBars({ data }: { data: { key: string; label: string; count: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-400">Sin datos en este rango.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.key} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 truncate text-gray-600">{d.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right font-semibold text-gray-900">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function MonthlyChart({ data }: { data: SearchAnalyticsMonth[] }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">Sin búsquedas este año.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex h-32 items-end gap-2 border-b border-gray-200">
      {data.map((d) => {
        const monthIdx = Number(d.month.slice(5, 7)) - 1;
        return (
          <div key={d.month} className="group flex-1">
            <div
              title={`${MONTH_LABELS[monthIdx] ?? d.month}: ${d.count} búsqueda${d.count === 1 ? "" : "s"}`}
              className="w-full rounded-t bg-blue-600 transition-colors group-hover:bg-blue-700"
              style={{ height: `${d.count > 0 ? Math.max((d.count / max) * 100, 4) : 0}%` }}
            />
            <p className="mt-1 text-center text-[10px] text-gray-400">{MONTH_LABELS[monthIdx] ?? d.month}</p>
          </div>
        );
      })}
    </div>
  );
}

function HourChart({ data }: { data: SearchAnalyticsHour[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">Sin datos.</p>;
  }
  const peak = data.reduce((a, b) => (b.count > a.count ? b : a));
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px] border-b border-gray-200">
        {data.map((d) => (
          <div key={d.hour} className="group flex-1">
            <div
              title={`${String(d.hour).padStart(2, "0")}:00 — ${d.count} visita${d.count === 1 ? "" : "s"}`}
              className={`w-full rounded-t ${d.hour === peak.hour ? "bg-emerald-600" : "bg-blue-600"} transition-colors group-hover:opacity-80`}
              style={{ height: `${d.count > 0 ? Math.max((d.count / max) * 100, 4) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Pico: <span className="font-semibold text-gray-800">{String(peak.hour).padStart(2, "0")}:00 h</span> ({peak.count} visitas)
      </p>
    </div>
  );
}

function WeekChart({ data }: { data: { week: string; count: number }[] }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">Sin datos.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex h-28 items-end gap-1.5 border-b border-gray-200">
      {data.map((d) => {
        const [, m, day] = d.week.split("-");
        return (
          <div key={d.week} className="group flex-1">
            <div
              title={`Semana del ${day}/${m}: ${d.count} visita${d.count === 1 ? "" : "s"}`}
              className="w-full rounded-t bg-blue-600 transition-colors group-hover:bg-blue-700"
              style={{ height: `${d.count > 0 ? Math.max((d.count / max) * 100, 4) : 0}%` }}
            />
            <p className="mt-1 text-center text-[10px] text-gray-400">{day}/{m}</p>
          </div>
        );
      })}
    </div>
  );
}

function DayOfWeekChart({ data }: { data: SearchAnalyticsDow[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">Sin búsquedas este año.</p>;
  }
  return (
    <div className="flex h-32 items-end gap-2 border-b border-gray-200">
      {data.map((d) => (
        <div key={d.dow} className="group flex-1">
          <div
            title={`${d.label}: ${d.count} búsqueda${d.count === 1 ? "" : "s"}`}
            className="w-full rounded-t bg-indigo-600 transition-colors group-hover:bg-indigo-700"
            style={{ height: `${d.count > 0 ? Math.max((d.count / max) * 100, 4) : 0}%` }}
          />
          <p className="mt-1 text-center text-[10px] text-gray-400">{d.label.slice(0, 3)}</p>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<SearchAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setError("");
    const res = await adminFetch(`/api/admin/analytics?days=${range}`);
    if (res.ok) {
      setData((await res.json()) as SearchAnalytics);
    } else {
      setError("No se pudo cargar la analítica.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analítica de búsquedas</h1>
            <p className="mt-1 text-sm text-gray-500">
              Volumen, categorías, tasa sin resultado y conversión a &quot;Ver en tienda&quot;.
            </p>
          </div>
          <div className="inline-flex rounded-full bg-gray-100 p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDays(r)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                  days === r ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>

        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {loading || !data ? (
          <div className="py-16 text-center text-sm text-gray-400">Cargando...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <StatTile label="Búsquedas" value={String(data.totalSearches)} />
              <StatTile label="Sin resultado" value={formatPct(data.noResultRate)} />
              <StatTile label="Pocos resultados" value={formatPct(data.fewResultRate)} />
              <StatTile label="Clicks a tienda" value={String(data.totalClicks)} />
              <StatTile label="Conversión" value={formatPct(data.conversionRate)} />
              <StatTile label="Clicks de compra" value={String(data.buyClicks)} />
              <StatTile
                label="Compras de un recomendado"
                value={`${formatPct(data.recommendedBuyShare)} · ${data.recommendedBuyClicks}/${data.buyClicks}`}
              />
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Visitas al sitio</h2>
                <span className="text-xs text-gray-400">
                  {data.visits.total} en total · {data.visits.inRange} en los últimos {days} días
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="text-xs font-medium text-gray-500">Por día (últimos {days} días)</h3>
                  <div className="mt-3"><DailyVolumeChart data={data.visits.byDay} /></div>
                </div>
                <div>
                  <h3 className="text-xs font-medium text-gray-500">Por semana (últimas 12)</h3>
                  <div className="mt-3"><WeekChart data={data.visits.byWeek} /></div>
                </div>
                <div>
                  <h3 className="text-xs font-medium text-gray-500">Por mes (año {new Date().getFullYear()})</h3>
                  <div className="mt-3"><MonthlyChart data={data.visits.byMonth} /></div>
                </div>
                <div>
                  <h3 className="text-xs font-medium text-gray-500">Por hora del día (AR)</h3>
                  <div className="mt-3"><HourChart data={data.visits.byHour} /></div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Volumen diario de búsquedas</h2>
              <div className="mt-4">
                <DailyVolumeChart data={data.byDay} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Categorías más buscadas</h2>
                <div className="mt-4">
                  <CategoryBars data={data.byCategory} />
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Productos más clickeados</h2>
                <div className="mt-4">
                  {data.topProducts.length === 0 ? (
                    <p className="text-sm text-gray-400">Sin clicks en este rango.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody>
                        {data.topProducts.map((p) => (
                          <tr key={p.product_id} className="border-t border-gray-100 first:border-0">
                            <td className="py-2 pr-3">
                              <p className="truncate font-medium text-gray-800">{p.title}</p>
                              <p className="text-xs text-gray-400">
                                {CATEGORY_LABELS[p.category ?? ""] ?? p.category ?? "—"}
                              </p>
                            </td>
                            <td className="py-2 text-right font-semibold text-gray-900">{p.clicks}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Patrones (año {new Date().getFullYear()})</h2>
              <p className="mt-0.5 text-xs text-gray-400">
                Independiente del rango de arriba — necesita todo el año para verse un patrón real.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="text-xs font-medium text-gray-500">Búsquedas por mes</h3>
                  <div className="mt-3">
                    <MonthlyChart data={data.byMonth} />
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-medium text-gray-500">Búsquedas por día de la semana</h3>
                  <div className="mt-3">
                    <DayOfWeekChart data={data.byDayOfWeek} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Uso más buscado</h2>
                <div className="mt-4">
                  <RankBars
                    data={data.byUseCase.map((d) => ({
                      key: d.use_case,
                      label: USE_CASE_LABELS[d.use_case] ?? d.use_case,
                      count: d.count,
                    }))}
                  />
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Marca más pedida</h2>
                <div className="mt-4">
                  <RankBars data={data.byBrand.map((d) => ({ key: d.brand, label: d.brand, count: d.count }))} />
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Tienda con más clicks</h2>
                <div className="mt-4">
                  <RankBars data={data.byStore.map((d) => ({ key: d.store, label: d.store, count: d.count }))} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
