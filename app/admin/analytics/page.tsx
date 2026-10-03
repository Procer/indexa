"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/auth/adminClient";
import {
  downloadCsv,
  downloadJson,
  escapeHtml,
  openPrintReport,
  stampedName,
  type CsvCell,
} from "@/lib/admin/export";
import {
  Card,
  Delta,
  ExportMenu,
  Notice,
  PageHeader,
  PageSkeleton,
  RangeTabs,
  RankBars,
  StatCard,
} from "@/components/admin/ui";
import type { SearchAnalytics, SearchAnalyticsDow, SearchAnalyticsHour, SearchAnalyticsMonth } from "@/types";

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
// duplicado a propósito: esta página hardcodea sus propias etiquetas de UI.
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

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function formatPct(n: number): string {
  return `${(n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}
function fmtInt(n: number): string {
  return n.toLocaleString("es-AR");
}
function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s`;
}

// Gráfico de barras verticales genérico. Cada columna es un flex-col de altura
// completa (justify-end) para que el `height: %` de la barra resuelva contra la
// altura fija del track — sin eso la barra colapsa a 0 (solo se ven los ejes).
type VBarItem = { key: string; count: number; title?: string; label?: string; highlight?: boolean };
function VBarChart({
  items,
  emptyText = "Sin datos.",
  heightClass = "h-32",
  gapClass = "gap-1",
  barClass = "bg-blue-600",
  highlightClass = "bg-emerald-600",
}: {
  items: VBarItem[];
  emptyText?: string;
  heightClass?: string;
  gapClass?: string;
  barClass?: string;
  highlightClass?: string;
}) {
  const total = items.reduce((s, d) => s + d.count, 0);
  if (items.length === 0 || total === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">{emptyText}</p>;
  }
  const max = Math.max(...items.map((d) => d.count), 1);
  const hasLabels = items.some((d) => d.label);
  return (
    <div>
      <div className={`flex ${heightClass} items-stretch border-b border-gray-200 ${gapClass}`}>
        {items.map((d) => (
          <div key={d.key} className="group flex flex-1 flex-col justify-end">
            <div
              title={d.title ?? `${d.label ?? d.key}: ${d.count}`}
              className={`w-full rounded-t transition-opacity group-hover:opacity-80 ${d.highlight ? highlightClass : barClass}`}
              style={{ height: `${d.count > 0 ? Math.max((d.count / max) * 100, 3) : 0}%` }}
            />
          </div>
        ))}
      </div>
      {hasLabels && (
        <div className={`mt-1 flex ${gapClass}`}>
          {items.map((d) => (
            <p key={d.key} className="flex-1 truncate text-center text-[10px] text-gray-400">
              {d.label}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function DailyVolumeChart({ data }: { data: { date: string; count: number }[] }) {
  return (
    <VBarChart
      emptyText="Sin datos en este rango."
      items={data.map((d) => ({
        key: d.date,
        count: d.count,
        title: `${new Date(`${d.date}T00:00:00`).toLocaleDateString("es-AR")}: ${d.count}`,
      }))}
    />
  );
}

function MonthlyChart({ data }: { data: SearchAnalyticsMonth[] }) {
  return (
    <VBarChart
      emptyText="Sin datos este año."
      gapClass="gap-2"
      items={data.map((d) => {
        const monthIdx = Number(d.month.slice(5, 7)) - 1;
        const label = MONTH_LABELS[monthIdx] ?? d.month;
        return { key: d.month, count: d.count, label, title: `${label}: ${d.count}` };
      })}
    />
  );
}

function HourChart({ data }: { data: SearchAnalyticsHour[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">Sin datos.</p>;
  }
  const peak = data.reduce((a, b) => (b.count > a.count ? b : a));
  return (
    <div>
      <VBarChart
        gapClass="gap-[3px]"
        heightClass="h-28"
        items={data.map((d) => ({
          key: String(d.hour),
          count: d.count,
          highlight: d.hour === peak.hour,
          title: `${String(d.hour).padStart(2, "0")}:00 — ${d.count} visita${d.count === 1 ? "" : "s"}`,
        }))}
      />
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>00h</span>
        <span>06h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Pico: <span className="font-semibold text-gray-800">{String(peak.hour).padStart(2, "0")}:00 h</span> ({peak.count} visitas)
      </p>
    </div>
  );
}

function WeekChart({ data }: { data: { week: string; count: number }[] }) {
  return (
    <VBarChart
      heightClass="h-28"
      gapClass="gap-1.5"
      items={data.map((d) => {
        const [, m, day] = d.week.split("-");
        return { key: d.week, count: d.count, label: `${day}/${m}`, title: `Semana del ${day}/${m}: ${d.count}` };
      })}
    />
  );
}

function DayOfWeekChart({ data }: { data: SearchAnalyticsDow[] }) {
  return (
    <VBarChart
      emptyText="Sin datos este año."
      gapClass="gap-2"
      barClass="bg-indigo-600"
      items={data.map((d) => ({
        key: d.dow,
        count: d.count,
        label: d.label.slice(0, 3),
        title: `${d.label}: ${d.count}`,
      }))}
    />
  );
}

// Embudo de visitas: cuánta gente entra, cuánta interactúa y cuánta llega a comprar.
function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = Math.max(steps[0]?.value ?? 0, 1);
  return (
    <div className="space-y-3">
      {steps.map((s, i) => {
        const pctOfTop = (s.value / top) * 100;
        const prev = i > 0 ? steps[i - 1].value : null;
        return (
          <div key={s.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-gray-700">{s.label}</span>
              <span className="tabular-nums text-gray-900">
                <span className="font-bold">{fmtInt(s.value)}</span>
                {prev !== null && prev > 0 && (
                  <span className="ml-2 text-xs text-gray-400">{formatPct(s.value / prev)} del paso anterior</span>
                )}
              </span>
            </div>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                style={{ width: `${Math.max(pctOfTop, s.value > 0 ? 2 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── exportaciones ───────────────────────────────────────────────────────────

function summaryRows(d: SearchAnalytics): CsvCell[][] {
  const p = d.previous;
  const row = (label: string, cur: number | string, prev?: number | string): CsvCell[] => [label, cur, prev ?? ""];
  return [
    ["Métrica", `Últimos ${d.days} días`, "Período anterior"],
    row("Visitas", d.visits.inRange, p.visits),
    row("Búsquedas", d.totalSearches, p.totalSearches),
    row("Búsquedas sin resultado (%)", (d.noResultRate * 100).toFixed(1)),
    row("Búsquedas con pocos resultados (%)", (d.fewResultRate * 100).toFixed(1)),
    row("Clicks a tienda", d.totalClicks, p.totalClicks),
    row("Conversión búsqueda→click (%)", (d.conversionRate * 100).toFixed(1)),
    row("Clicks de compra", d.buyClicks, p.buyClicks),
    row("Compras de un recomendado (%)", (d.recommendedBuyShare * 100).toFixed(1)),
    row("Visitas que interactuaron", d.engagement.engagedVisits),
    row("Rebote (%)", (d.engagement.bouncedShare * 100).toFixed(1)),
    row("Tiempo promedio (s)", d.engagement.avgDurationSec),
    row("Tiempo mediano (s)", d.engagement.medianDurationSec),
    row("Errores en el navegador", d.engagement.clientErrors),
  ];
}

function exportSummaryCsv(d: SearchAnalytics) {
  downloadCsv(stampedName(`analitica-resumen-${d.days}d`, "csv"), summaryRows(d));
}

function exportFullCsv(d: SearchAnalytics) {
  const rows: CsvCell[][] = [
    ...summaryRows(d),
    [],
    ["BÚSQUEDAS POR DÍA"],
    ["fecha", "búsquedas"],
    ...d.byDay.map((x) => [x.date, x.count]),
    [],
    ["VISITAS POR DÍA"],
    ["fecha", "visitas"],
    ...d.visits.byDay.map((x) => [x.date, x.count]),
    [],
    ["CATEGORÍAS"],
    ["categoría", "búsquedas"],
    ...d.byCategory.map((x) => [CATEGORY_LABELS[x.category] ?? x.category, x.count]),
    [],
    ["USOS"],
    ["uso", "búsquedas"],
    ...d.byUseCase.map((x) => [USE_CASE_LABELS[x.use_case] ?? x.use_case, x.count]),
    [],
    ["MARCAS"],
    ["marca", "búsquedas"],
    ...d.byBrand.map((x) => [x.brand, x.count]),
    [],
    ["TIENDAS (CLICKS)"],
    ["tienda", "clicks"],
    ...d.byStore.map((x) => [x.store, x.count]),
    [],
    ["PRODUCTOS MÁS CLICKEADOS"],
    ["producto", "rubro", "clicks"],
    ...d.topProducts.map((x) => [x.title, CATEGORY_LABELS[x.category ?? ""] ?? x.category ?? "", x.clicks]),
    [],
    ["BÚSQUEDAS MÁS FRECUENTES"],
    ["texto", "veces", "con 0-2 resultados"],
    ...d.topQueries.map((x) => [x.query, x.count, x.noResult]),
  ];
  downloadCsv(stampedName(`analitica-completa-${d.days}d`, "csv"), rows);
}

function printReport(d: SearchAnalytics) {
  const tile = (label: string, value: string) =>
    `<div class="tile"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;
  const maxDay = Math.max(...d.byDay.map((x) => x.count), 1);
  const table = (head: string[], rows: (string | number)[][]) =>
    `<table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(String(c))}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  openPrintReport(
    `Informe de analítica — ${d.days} días`,
    `<h1>Informe de analítica</h1><p class="sub">Últimos ${d.days} días · indexa</p>
    <div class="grid">
      ${tile("Visitas", fmtInt(d.visits.inRange))}
      ${tile("Búsquedas", fmtInt(d.totalSearches))}
      ${tile("Sin resultado", formatPct(d.noResultRate))}
      ${tile("Clicks a tienda", fmtInt(d.totalClicks))}
      ${tile("Conversión", formatPct(d.conversionRate))}
      ${tile("Clicks de compra", fmtInt(d.buyClicks))}
    </div>
    <h2>Búsquedas por día</h2>
    <div class="bars">${d.byDay.map((x) => `<i title="${escapeHtml(x.date)}: ${x.count}" style="height:${Math.max((x.count / maxDay) * 100, 3)}%"></i>`).join("")}</div>
    <h2>Rubros más buscados</h2>
    ${table(["Rubro", "Búsquedas"], d.byCategory.map((x) => [CATEGORY_LABELS[x.category] ?? x.category, x.count]))}
    <h2>Búsquedas más frecuentes</h2>
    ${table(["Texto", "Veces", "Con 0-2 resultados"], d.topQueries.map((x) => [x.query, x.count, x.noResult]))}
    <h2>Tiendas con más clicks</h2>
    ${table(["Tienda", "Clicks"], d.byStore.map((x) => [x.store, x.count]))}
    <h2>Productos más clickeados</h2>
    ${table(["Producto", "Clicks"], d.topProducts.map((x) => [x.title, x.clicks]))}`
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

  const e = data?.engagement;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analítica"
        subtitle="Qué busca la gente, cuánto se usa el sitio y cuántos terminan yendo a una tienda."
        actions={
          <>
            <RangeTabs options={RANGES} value={days} onChange={setDays} />
            <ExportMenu
              options={[
                { label: "Resumen (CSV)", hint: "Métricas clave vs. período anterior", onSelect: () => data && exportSummaryCsv(data) },
                { label: "Detalle completo (CSV)", hint: "Todas las tablas en un solo archivo", onSelect: () => data && exportFullCsv(data) },
                { label: "Datos crudos (JSON)", hint: "Para análisis propios", onSelect: () => data && downloadJson(stampedName(`analitica-${days}d`, "json"), data) },
                { label: "Informe para imprimir / PDF", hint: "Se abre listo para guardar como PDF", onSelect: () => data && printReport(data) },
              ]}
            />
          </>
        }
      />

      {error && <Notice tone="error">{error}</Notice>}

      {loading || !data || !e ? (
        <PageSkeleton stats={8} blocks={3} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Visitas"
              value={fmtInt(data.visits.inRange)}
              accent="blue"
              delta={<Delta current={data.visits.inRange} previous={data.previous.visits} />}
            />
            <StatCard
              label="Búsquedas"
              value={fmtInt(data.totalSearches)}
              accent="blue"
              delta={<Delta current={data.totalSearches} previous={data.previous.totalSearches} />}
            />
            <StatCard
              label="Clicks a tienda"
              value={fmtInt(data.totalClicks)}
              accent="green"
              delta={<Delta current={data.totalClicks} previous={data.previous.totalClicks} />}
              hint={`Conversión ${formatPct(data.conversionRate)} de las búsquedas`}
            />
            <StatCard
              label="Clicks de compra"
              value={fmtInt(data.buyClicks)}
              accent="green"
              delta={<Delta current={data.buyClicks} previous={data.previous.buyClicks} />}
              hint={`${formatPct(data.recommendedBuyShare)} de un recomendado (${data.recommendedBuyClicks}/${data.buyClicks})`}
            />
            <StatCard
              label="Sin resultado"
              value={formatPct(data.noResultRate)}
              accent={data.noResultRate > 0.1 ? "red" : "amber"}
              delta={
                <Delta
                  current={data.noResultCount}
                  previous={data.previous.noResultCount}
                  inverse
                  suffix="vs. período anterior (cantidad)"
                />
              }
              hint={`Pocos resultados: ${formatPct(data.fewResultRate)}`}
            />
            <StatCard label="Tiempo promedio" value={fmtDuration(e.avgDurationSec)} hint={`Mediano ${fmtDuration(e.medianDurationSec)}`} accent="purple" />
            <StatCard label="Rebote" value={formatPct(e.bouncedShare)} hint="Visitas que no tocaron ningún producto" accent="purple" />
            <StatCard
              label="Errores en el navegador"
              value={fmtInt(e.clientErrors)}
              accent={e.clientErrors > 0 ? "red" : "green"}
              hint={e.clientErrors > 0 ? "Revisá Actividad en vivo" : "Sin errores 🎉"}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Embudo de visitas" subtitle={`Últimos ${days} días, por visita`}>
              <Funnel
                steps={[
                  { label: "Visitaron el sitio", value: e.visits },
                  { label: "Interactuaron con productos", value: e.engagedVisits },
                  { label: "Llegaron a comprar", value: e.buyVisits },
                ]}
              />
            </Card>

            <Card title="Búsquedas más frecuentes" subtitle="Lo que más se escribe. En naranja, las que terminaron con 0-2 resultados.">
              {data.topQueries.length === 0 ? (
                <p className="text-sm text-gray-400">Sin búsquedas en este rango.</p>
              ) : (
                <ol className="space-y-1.5">
                  {data.topQueries.map((q, i) => (
                    <li key={q.query} className="flex items-baseline gap-2 text-sm">
                      <span className="w-5 shrink-0 text-right text-xs text-gray-400">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-gray-700" title={q.query}>
                        {q.query}
                      </span>
                      {q.noResult > 0 && (
                        <span className="shrink-0 rounded-full bg-amber-50 px-1.5 text-[11px] font-medium text-amber-700">
                          {q.noResult} sin resultado
                        </span>
                      )}
                      <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-gray-900">{q.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          <Card
            title="Visitas al sitio"
            subtitle={`${fmtInt(data.visits.total)} en total · ${fmtInt(data.visits.inRange)} en los últimos ${days} días`}
          >
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-medium text-gray-500">Por día (últimos {days} días)</h3>
                <div className="mt-3">
                  <DailyVolumeChart data={data.visits.byDay} />
                </div>
              </div>
              <div>
                <h3 className="text-xs font-medium text-gray-500">Por semana (últimas 12)</h3>
                <div className="mt-3">
                  <WeekChart data={data.visits.byWeek} />
                </div>
              </div>
              <div>
                <h3 className="text-xs font-medium text-gray-500">Por mes (año {new Date().getFullYear()})</h3>
                <div className="mt-3">
                  <MonthlyChart data={data.visits.byMonth} />
                </div>
              </div>
              <div>
                <h3 className="text-xs font-medium text-gray-500">Por hora del día (AR)</h3>
                <div className="mt-3">
                  <HourChart data={data.visits.byHour} />
                </div>
              </div>
            </div>
          </Card>

          <Card title="Volumen diario de búsquedas">
            <DailyVolumeChart data={data.byDay} />
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Categorías más buscadas">
              <RankBars
                data={data.byCategory.map((d) => ({
                  key: d.category,
                  label: CATEGORY_LABELS[d.category] ?? d.category,
                  count: d.count,
                }))}
              />
            </Card>

            <Card title="Productos más clickeados">
              {data.topProducts.length === 0 ? (
                <p className="text-sm text-gray-400">Sin clicks en este rango.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.topProducts.map((p) => (
                      <tr key={p.product_id} className="border-t border-gray-100 first:border-0">
                        <td className="max-w-0 py-2 pr-3">
                          <p className="truncate font-medium text-gray-800">{p.title}</p>
                          <p className="text-xs text-gray-400">{CATEGORY_LABELS[p.category ?? ""] ?? p.category ?? "—"}</p>
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums text-gray-900">{p.clicks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card title="Uso más buscado">
              <RankBars
                data={data.byUseCase.map((d) => ({
                  key: d.use_case,
                  label: USE_CASE_LABELS[d.use_case] ?? d.use_case,
                  count: d.count,
                }))}
              />
            </Card>
            <Card title="Marca más pedida">
              <RankBars data={data.byBrand.map((d) => ({ key: d.brand, label: d.brand, count: d.count }))} />
            </Card>
            <Card title="Tienda con más clicks" subtitle="Detalle por tienda en la sección Tiendas">
              <RankBars data={data.byStore.map((d) => ({ key: d.store, label: d.store, count: d.count }))} />
            </Card>
          </div>

          <Card
            title={`Patrones (año ${new Date().getFullYear()})`}
            subtitle="Independiente del rango de arriba — necesita todo el año para verse un patrón real."
          >
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
          </Card>
        </>
      )}
    </div>
  );
}
