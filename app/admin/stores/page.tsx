"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/auth/adminClient";
import type { BudgetDistribution, DemandGap, StoreInsight, StoresInsights } from "@/types";

const RANGES = [7, 30, 90] as const;

const CATEGORY_LABELS: Record<string, string> = {
  notebook: "Notebooks",
  desktop: "PCs de escritorio",
  tablet: "Tablets",
  tv: "TVs",
  phone: "Celulares",
  "sin categoría": "Sin categoría",
};

function fmtInt(n: number): string {
  return n.toLocaleString("es-AR");
}
function fmtPct(n: number): string {
  return `${(n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}
function storeLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function hoursSince(iso: string | null): number | null {
  return iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : null;
}

function Trend({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <span className="text-gray-400">—</span>;
  if (previous === 0) return <span className="text-emerald-600">nuevo</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="text-gray-400">igual que antes</span>;
  return (
    <span className={pct > 0 ? "text-emerald-600" : "text-red-600"}>
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}% vs. período anterior
    </span>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-gray-900">{value}</p>
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

function ProductList({ title, items, empty }: { title: string; items: StoreInsight["topProducts"]; empty: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1.5 text-sm text-gray-400">{empty}</p>
      ) : (
        <table className="mt-1 w-full text-sm">
          <tbody>
            {items.map((p) => (
              <tr key={p.product_id} className="border-t border-gray-100 first:border-0">
                <td className="max-w-0 truncate py-1.5 pr-2 text-gray-700">{p.title}</td>
                <td className="whitespace-nowrap py-1.5 text-right text-xs text-gray-500">
                  {p.impressions} ap. · <span className="font-semibold text-gray-900">{p.clicks} clicks</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StoreCard({ s }: { s: StoreInsight }) {
  const syncH = hoursSince(s.lastSyncAt);
  const stale = syncH != null && syncH > 36;
  const priceHint =
    s.comparableProducts > 0
      ? s.avgGapPct != null && s.avgGapPct > 0
        ? `En promedio ${s.avgGapPct}% más cara que la más barata`
        : "Siempre igual o más barata cuando se compara"
      : "Sin productos en común con otras tiendas";

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">{storeLabel(s.store)}</h2>
        <span className="text-xs">
          <Trend current={s.clicks} previous={s.prevClicks} />
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Veces que se vio un producto" value={fmtInt(s.impressions)} />
        <Metric label="Clicks a la tienda" value={fmtInt(s.clicks)} hint={`CTR ${fmtPct(s.ctr)}`} />
        <Metric
          label="Interés en la ficha"
          value={fmtInt(s.detailViews + s.chatAsks + s.compareAdds)}
          hint={`${s.detailViews} detalles · ${s.chatAsks} consultas · ${s.compareAdds} comparar`}
        />
        <Metric
          label="Más barata en"
          value={s.comparableProducts > 0 ? `${s.cheapestCount} de ${s.comparableProducts}` : "—"}
          hint={priceHint}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
        <span>{fmtInt(s.availableProducts)} productos disponibles</span>
        <span className={s.withoutPrice > 0 ? "font-medium text-amber-700" : ""}>
          {s.withoutPrice} sin precio
        </span>
        <span className={stale ? "font-medium text-red-600" : ""}>
          Última actualización:{" "}
          {s.lastSyncAt
            ? `${new Date(s.lastSyncAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}${stale ? " (desactualizada)" : ""}`
            : "—"}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ProductList title="Productos que más clicks reciben" items={s.topProducts} empty="Sin clicks en este período." />
        <ProductList
          title="Se mostraron varias veces y nadie entró"
          items={s.ignoredProducts}
          empty="Ninguno por ahora."
        />
      </div>
    </div>
  );
}

function DemandList({ gaps }: { gaps: DemandGap[] }) {
  if (gaps.length === 0) {
    return <p className="text-sm text-gray-400">Todas las búsquedas tuvieron resultados suficientes. 🎉</p>;
  }
  const max = Math.max(...gaps.map((g) => g.unmet), 1);
  return (
    <div className="space-y-3">
      {gaps.map((g, i) => (
        <div key={i}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <p className="min-w-0 truncate font-medium text-gray-800">
              {CATEGORY_LABELS[g.category] ?? g.category}
              {g.brand ? ` · ${g.brand}` : ""} · {g.budgetBand}
            </p>
            <p className="shrink-0 text-xs text-gray-500">
              <span className="font-semibold text-gray-900">{g.unmet}</span> de {g.searches} sin resultados útiles
            </p>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${(g.unmet / max) * 100}%` }} />
          </div>
          {g.example && <p className="mt-0.5 truncate text-[11px] text-gray-400">Ej: “{g.example}”</p>}
        </div>
      ))}
    </div>
  );
}

const BAND_COLORS = ["bg-sky-300", "bg-sky-400", "bg-blue-500", "bg-indigo-600", "bg-violet-700"];

function BudgetBars({ data }: { data: BudgetDistribution[] }) {
  if (data.length === 0) return <p className="text-sm text-gray-400">Sin datos en este rango.</p>;
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.category}>
          <p className="text-sm font-medium text-gray-800">
            {CATEGORY_LABELS[d.category] ?? d.category}{" "}
            <span className="text-xs font-normal text-gray-400">({d.total} búsquedas con presupuesto)</span>
          </p>
          <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-gray-100">
            {d.bands.map((b, i) => (
              <div
                key={b.band}
                title={`${b.band}: ${b.count}`}
                className={BAND_COLORS[i]}
                style={{ width: `${d.total ? (b.count / d.total) * 100 : 0}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
            {d.bands
              .filter((b) => b.count > 0)
              .map((b) => (
                <span key={b.band}>
                  {b.band}: <span className="font-semibold text-gray-700">{Math.round((b.count / d.total) * 100)}%</span>
                </span>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminStoresPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<StoresInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setError("");
    const res = await adminFetch(`/api/admin/stores?days=${range}`);
    if (res.ok) setData((await res.json()) as StoresInsights);
    else setError("No se pudo cargar la información de tiendas.");
    setLoading(false);
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tiendas y mercado</h1>
            <p className="mt-1 text-sm text-gray-500">
              Qué le pasa a cada tienda en Indexa, qué tan competitiva está en precio y qué busca la gente que todavía
              no se puede cubrir.
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
            <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <strong>Cómo leerlo:</strong> “se vio” es una tarjeta que la persona realmente tuvo en pantalla (no solo
              cargada); “click” es entrar a la tienda desde esa tarjeta; CTR = clicks ÷ veces que se vio.
              {data.impressionsSince ? (
                <>
                  {" "}
                  Las apariciones se miden desde el{" "}
                  {new Date(data.impressionsSince).toLocaleDateString("es-AR")}; antes de esa fecha solo hay clicks.
                </>
              ) : (
                <> Todavía no hay apariciones registradas: empiezan a medirse con las próximas búsquedas.</>
              )}
            </div>

            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">
                Rendimiento por tienda · últimos {days} días ({fmtInt(data.totalClicks)} clicks en total)
              </h2>
              {data.stores.length === 0 ? (
                <p className="text-sm text-gray-400">Sin datos.</p>
              ) : (
                data.stores.map((s) => <StoreCard key={s.store} s={s} />)
              )}
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Lo que la gente pide y no se encuentra</h2>
                <p className="mt-0.5 text-xs text-gray-400">
                  Búsquedas que terminaron con 0-2 resultados, agrupadas por rubro, marca y presupuesto. Es una guía de
                  qué stock conviene sumar.
                </p>
                <div className="mt-4">
                  <DemandList gaps={data.demandGaps} />
                </div>
              </section>

              <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Cuánto quiere gastar la gente</h2>
                <p className="mt-0.5 text-xs text-gray-400">Presupuesto declarado en las búsquedas, por rubro.</p>
                <div className="mt-4">
                  <BudgetBars data={data.budgetByCategory} />
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
