"use client";

import { useState, useEffect, useCallback } from "react";
import { adminFetch } from "@/lib/auth/adminClient";
import type { SponsoredPlacement, SponsorStats, ProductCategory } from "@/types";

const BOOST_MIN = 0.01;
const BOOST_MAX = 0.2;
const RELEVANCE_MIN = 0.5;
const RELEVANCE_MAX = 0.95;

const CATEGORIES: ProductCategory[] = ["notebook", "desktop", "tablet", "tv", "phone"];
const CATEGORY_LABEL: Record<string, string> = {
  notebook: "Notebook",
  desktop: "PC de escritorio",
  tablet: "Tablet",
  tv: "Smart TV",
  phone: "Celular",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR");
}
function fmtInt(n: number): string {
  return n.toLocaleString("es-AR");
}
function fmtPct(n: number): string {
  return `${(n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}
function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}
function boostLabel(b: number): string {
  if (b < 0.05) return "suave";
  if (b < 0.1) return "medio";
  if (b < 0.15) return "fuerte";
  return "muy fuerte";
}

type CampaignStatus = "Activa" | "Pausada" | "Programada" | "Vencida";
function campaignStatus(p: SponsoredPlacement): CampaignStatus {
  const now = Date.now();
  if (p.ends_at && new Date(p.ends_at).getTime() <= now) return "Vencida";
  if (!p.active) return "Pausada";
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return "Programada";
  return "Activa";
}
const STATUS_STYLE: Record<CampaignStatus, string> = {
  Activa: "bg-green-100 text-green-700",
  Pausada: "bg-gray-100 text-gray-500",
  Programada: "bg-blue-100 text-blue-700",
  Vencida: "bg-red-50 text-red-600",
};

// Fecha de un <input type="date"> en una columna timestamptz → "YYYY-MM-DD"
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

interface FormState {
  advertiser: string;
  source: string;
  categories: ProductCategory[];
  boost: number;
  minRelevance: number;
  showOnHome: boolean;
  startsAt: string;
  endsAt: string;
  amountPaid: string;
  slotPosition: string; // "" = sin posición garantizada
  maxPerSearch: number;
}
const EMPTY_FORM: FormState = {
  advertiser: "",
  source: "",
  categories: [],
  boost: 0.08,
  minRelevance: 0.65,
  showOnHome: false,
  startsAt: "",
  endsAt: "",
  amountPaid: "",
  slotPosition: "",
  maxPerSearch: 2,
};

// ─── componente ──────────────────────────────────────────────────────────────

export default function SponsorsAdminPage() {
  const [placements, setPlacements] = useState<SponsoredPlacement[]>([]);
  const [stats, setStats] = useState<Record<string, SponsorStats>>({});
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // formulario (alta y edición comparten estado)
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const loadPlacements = useCallback(async () => {
    setLoading(true);
    setError("");
    const [res, statsRes] = await Promise.all([
      adminFetch("/api/admin/sponsors"),
      adminFetch("/api/admin/sponsors/stats"),
    ]);
    if (res.ok) {
      const data = (await res.json()) as { placements: SponsoredPlacement[]; sources?: string[] };
      setPlacements(data.placements);
      setSources(data.sources ?? []);
    } else {
      setError("No autorizado o error al cargar campañas.");
    }
    if (statsRes.ok) {
      const data = (await statsRes.json()) as { stats: SponsorStats[] };
      setStats(Object.fromEntries(data.stats.map((s) => [s.placement_id, s])));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPlacements();
  }, [loadPlacements]);

  async function toggleActive(p: SponsoredPlacement) {
    await adminFetch(`/api/admin/sponsors/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !p.active }),
    });
    setPlacements((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)));
  }

  async function deletePlacement(p: SponsoredPlacement) {
    if (!confirm(`¿Eliminar campaña de ${p.advertiser}? Se pierden también sus estadísticas.`)) return;
    await adminFetch(`/api/admin/sponsors/${p.id}`, { method: "DELETE" });
    setPlacements((prev) => prev.filter((x) => x.id !== p.id));
  }

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }
  function openEdit(p: SponsoredPlacement) {
    setEditingId(p.id);
    setForm({
      advertiser: p.advertiser,
      source: p.target_source ?? "",
      categories: p.categories,
      boost: p.score_boost,
      minRelevance: p.min_relevance,
      showOnHome: p.show_on_home,
      startsAt: toDateInput(p.starts_at),
      endsAt: toDateInput(p.ends_at),
      amountPaid: p.amount_paid_ars != null ? String(p.amount_paid_ars) : "",
      slotPosition: p.slot_position != null ? String(p.slot_position) : "",
      maxPerSearch: p.max_per_search ?? 2,
    });
    setShowForm(true);
  }

  function toggleCategory(cat: ProductCategory) {
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(cat) ? f.categories.filter((c) => c !== cat) : [...f.categories, cat],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.advertiser.trim() || !form.source || form.categories.length === 0) return;
    setFormSubmitting(true);

    const payload = {
      advertiser: form.advertiser.trim(),
      target_source: form.source,
      categories: form.categories,
      score_boost: form.boost,
      min_relevance: form.minRelevance,
      show_on_home: form.showOnHome,
      starts_at: form.startsAt || null,
      ends_at: form.endsAt || null,
      amount_paid_ars: form.amountPaid.trim() === "" ? null : Number(form.amountPaid),
      slot_position: form.slotPosition === "" ? null : Number(form.slotPosition),
      max_per_search: form.maxPerSearch,
    };

    const res = editingId
      ? await adminFetch(`/api/admin/sponsors/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await adminFetch("/api/admin/sponsors", { method: "POST", body: JSON.stringify(payload) });

    if (res.ok) {
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await loadPlacements();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      alert(data.error ?? "Error al guardar la campaña");
    }
    setFormSubmitting(false);
  }

  // ── panel principal ────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Campañas patrocinadas</h1>
            <p className="mt-1 text-sm text-gray-500">
              Hacen que los productos de una tienda aparezcan más arriba, y miden qué resultado le dieron a quien paga.
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + Nueva campaña
          </button>
        </div>

        <HowItWorks />

        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Cargando...</div>
        ) : placements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center">
            <p className="text-sm text-gray-400">No hay campañas todavía.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {placements.map((p) => (
              <PlacementCard
                key={p.id}
                placement={p}
                stats={stats[p.id]}
                onToggle={() => toggleActive(p)}
                onDelete={() => deletePlacement(p)}
                onEdit={() => openEdit(p)}
              />
            ))}
          </div>
        )}

        {showForm && (
          <CampaignForm
            form={form}
            setForm={setForm}
            sources={sources}
            editing={!!editingId}
            submitting={formSubmitting}
            onToggleCategory={toggleCategory}
            onSubmit={handleSubmit}
            onClose={() => setShowForm(false)}
          />
        )}
      </div>
    </main>
  );
}

// ─── explicación en lenguaje llano ───────────────────────────────────────────

function HowItWorks() {
  return (
    <details className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100" open>
      <summary className="cursor-pointer text-sm font-semibold text-gray-900">¿Cómo funciona una campaña?</summary>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-600">
        <p>
          Una tienda (por ejemplo Frávega) paga para que, cuando alguien busque algo de un rubro (por ejemplo
          notebooks), <strong>sus productos aparezcan más arriba</strong> en los resultados y lleven la etiqueta{" "}
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Patrocinado</span>.
        </p>
        <p>
          <strong>Nunca se muestra algo que no tenga que ver.</strong> Si el producto no se parece lo suficiente a lo
          que la persona pidió (la <em>relevancia mínima</em>), la campaña no lo ayuda. Tampoco se meten productos
          fuera de presupuesto ni de una marca distinta a la pedida. Así la gente sigue confiando en los resultados.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Lever
            title="Empuje (boost)"
            text="Suma puntos al producto en el ranking. Es un empujón: ayuda a un buen producto a subir, no lo pone primero a la fuerza."
          />
          <Lever
            title="Posición garantizada"
            text="Es la palanca fuerte. El mejor producto de la tienda que sea relevante queda como máximo en esa posición (por ejemplo, entre los 3 primeros). Si no hay ninguno relevante, no se fuerza nada."
          />
          <Lever
            title="Tope por búsqueda"
            text="Cuántos productos de la tienda se favorecen en una misma búsqueda. Con 2, nunca se llena la pantalla con una sola marca."
          />
          <Lever
            title="Pantalla de inicio"
            text="Muestra una tarjeta “Patrocinado: Ofertas en Notebooks de Frávega” antes de buscar, con un botón que lanza esa búsqueda."
          />
        </div>
        <p>
          <strong>Cómo se mide:</strong> una <em>aparición</em> es una tarjeta que la persona realmente vio en pantalla
          (no solo la que cargó). Un <em>click</em> es entrar a la tienda desde esa tarjeta. El <em>CTR</em> es clicks
          ÷ apariciones. Cada campaña se compara contra la misma tienda cuando <em>no</em> estaba patrocinada, para
          ver cuánto aportó realmente lo pagado.
        </p>
      </div>
    </details>
  );
}

function Lever({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-1 text-sm text-gray-600">{text}</p>
    </div>
  );
}

// ─── tarjeta de campaña con su rendimiento ───────────────────────────────────

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-gray-900">{value}</p>
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

function DayBars({ data }: { data: SponsorStats["byDay"] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.impressions), 1);
  return (
    <div>
      <div className="flex h-16 items-end gap-0.5 border-b border-gray-200">
        {data.map((d) => (
          <div key={d.date} className="group flex h-full flex-1 flex-col justify-end">
            <div
              title={`${new Date(`${d.date}T00:00:00`).toLocaleDateString("es-AR")}: ${d.impressions} apariciones · ${d.clicks} clicks`}
              className="w-full rounded-t bg-blue-500/80 group-hover:bg-blue-600"
              style={{ height: `${Math.max((d.impressions / max) * 100, 4)}%` }}
            />
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-gray-400">Apariciones por día (pasá el mouse para ver clicks)</p>
    </div>
  );
}

function buildSummaryText(p: SponsoredPlacement, s: SponsorStats): string {
  const lines = [
    `Campaña ${p.advertiser} — ${(p.categories as string[]).map((c) => CATEGORY_LABEL[c] ?? c).join(", ")}`,
    `Período: ${formatDate(s.from)} al ${formatDate(s.to)} (${s.daysActive} días)`,
    `Apariciones: ${fmtInt(s.impressions)} (${fmtInt(s.uniqueVisitors)} personas)`,
    `Clicks a la tienda: ${fmtInt(s.clicks)} · CTR ${fmtPct(s.ctr)}`,
  ];
  if (s.organicCtr != null && s.organicCtr > 0) {
    lines.push(`Sin patrocinio la tienda tenía ${fmtPct(s.organicCtr)} de CTR (×${(s.ctr / s.organicCtr).toFixed(1)})`);
  }
  if (s.avgPosition != null) lines.push(`Posición media en los resultados: ${s.avgPosition}`);
  if (p.show_on_home) lines.push(`Pantalla de inicio: ${fmtInt(s.homeViews)} vistas, ${fmtInt(s.homeClicks)} clicks`);
  if (s.amountPaid != null) {
    lines.push(
      `Inversión ${fmtMoney(s.amountPaid)} → ${fmtMoney(s.costPerClick)} por click · ${fmtMoney(s.costPerThousandImpressions)} cada mil apariciones`
    );
  }
  return lines.join("\n");
}

function downloadCsv(p: SponsoredPlacement, s: SponsorStats) {
  const rows = [
    ["fecha", "apariciones", "clicks", "ctr"],
    ...s.byDay.map((d) => [d.date, d.impressions, d.clicks, d.impressions ? (d.clicks / d.impressions).toFixed(4) : "0"]),
    [],
    ["resumen"],
    ["anunciante", p.advertiser],
    ["periodo", `${s.from.slice(0, 10)} a ${s.to.slice(0, 10)}`],
    ["apariciones", s.impressions],
    ["personas", s.uniqueVisitors],
    ["clicks", s.clicks],
    ["ctr", s.ctr.toFixed(4)],
    ["ctr_tienda_sin_patrocinio", s.organicCtr != null ? s.organicCtr.toFixed(4) : ""],
    ["monto_pagado_ars", s.amountPaid ?? ""],
    ["costo_por_click_ars", s.costPerClick ?? ""],
    ["costo_por_mil_apariciones_ars", s.costPerThousandImpressions ?? ""],
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `campana-${p.advertiser.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function PlacementCard({
  placement,
  stats,
  onToggle,
  onDelete,
  onEdit,
}: {
  placement: SponsoredPlacement;
  stats: SponsorStats | undefined;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const status = campaignStatus(placement);
  const inactive = status === "Pausada" || status === "Vencida";
  const lift = stats && stats.organicCtr && stats.organicCtr > 0 ? stats.ctr / stats.organicCtr : null;
  const daysLeft =
    placement.ends_at && status === "Activa"
      ? Math.max(0, Math.ceil((new Date(placement.ends_at).getTime() - Date.now()) / 86_400_000))
      : null;

  async function copySummary() {
    if (!stats) return;
    try {
      await navigator.clipboard.writeText(buildSummaryText(placement, stats));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert(buildSummaryText(placement, stats));
    }
  }

  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${inactive ? "border-gray-100 opacity-75" : "border-gray-100"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold text-gray-900">{placement.advertiser}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-700">
              {placement.target_source ?? "sin tienda"}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{status}</span>
            {placement.show_on_home && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">En el inicio</span>
            )}
            {placement.slot_position != null && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                Posición garantizada: top {placement.slot_position}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>Rubros: {placement.categories.map((c) => CATEGORY_LABEL[c] ?? c).join(", ") || "—"}</span>
            <span>
              Empuje: +{placement.score_boost} ({boostLabel(placement.score_boost)})
            </span>
            <span>Relevancia mín: {placement.min_relevance}</span>
            <span>Máx {placement.max_per_search ?? 2} por búsqueda</span>
            {(placement.starts_at || placement.ends_at) && (
              <span>
                {formatDate(placement.starts_at)} → {formatDate(placement.ends_at)}
                {daysLeft != null && ` (${daysLeft} días restantes)`}
              </span>
            )}
            <span>Pagó: {fmtMoney(placement.amount_paid_ars)}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={onToggle}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              placement.active
                ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                : "border-green-200 text-green-700 hover:bg-green-50"
            }`}
          >
            {placement.active ? "Pausar" : "Activar"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-100 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50"
          >
            Eliminar
          </button>
        </div>
      </div>

      {/* Rendimiento */}
      <div className="mt-4 border-t border-gray-100 pt-4">
        {!stats || (stats.impressions === 0 && stats.searchesWithCampaign === 0 && stats.homeViews === 0) ? (
          <p className="text-sm text-gray-400">
            Todavía sin datos: las apariciones y clicks se empiezan a medir cuando la campaña está vigente y alguien
            busca en estos rubros.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric
                label="Apariciones"
                value={fmtInt(stats.impressions)}
                hint={`${fmtInt(stats.uniqueVisitors)} personas distintas`}
              />
              <Metric label="Clicks a la tienda" value={fmtInt(stats.clicks)} hint={`CTR ${fmtPct(stats.ctr)}`} />
              <Metric
                label="Vs. sin patrocinio"
                value={lift != null ? `×${lift.toFixed(1)}` : "—"}
                hint={
                  stats.organicCtr != null
                    ? `La tienda sin patrocinio tenía ${fmtPct(stats.organicCtr)} de CTR`
                    : "Aún sin base de comparación"
                }
              />
              <Metric
                label="Posición media"
                value={stats.avgPosition != null ? `#${stats.avgPosition}` : "—"}
                hint={`${fmtInt(stats.searchesWithCampaign)} búsquedas con la campaña`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Costo por click" value={fmtMoney(stats.costPerClick)} hint={stats.amountPaid == null ? "Cargá el monto pagado" : undefined} />
              <Metric label="Costo cada mil apariciones" value={fmtMoney(stats.costPerThousandImpressions)} />
              <Metric
                label="Interés en la ficha"
                value={fmtInt(stats.detailViews + stats.chatAsks + stats.compareAdds)}
                hint={`${stats.detailViews} detalles · ${stats.chatAsks} consultas · ${stats.compareAdds} comparaciones`}
              />
              {placement.show_on_home ? (
                <Metric
                  label="Pantalla de inicio"
                  value={`${fmtInt(stats.homeViews)} vistas`}
                  hint={`${fmtInt(stats.homeClicks)} clicks · CTR ${stats.homeViews ? fmtPct(stats.homeClicks / stats.homeViews) : "—"}`}
                />
              ) : (
                <Metric
                  label="Posición garantizada usada"
                  value={fmtInt(stats.slotUses)}
                  hint={placement.slot_position != null ? "búsquedas donde se movió un producto" : "No tiene posición garantizada"}
                />
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <DayBars data={stats.byDay} />
              <div>
                <p className="text-xs font-medium text-gray-500">Productos que más rindieron</p>
                {stats.topProducts.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-400">Sin datos.</p>
                ) : (
                  <table className="mt-1 w-full text-sm">
                    <tbody>
                      {stats.topProducts.map((t) => (
                        <tr key={t.product_id} className="border-t border-gray-100 first:border-0">
                          <td className="max-w-0 truncate py-1.5 pr-2 text-gray-700">{t.title}</td>
                          <td className="whitespace-nowrap py-1.5 text-right text-xs text-gray-500">
                            {t.impressions} ap. · <span className="font-semibold text-gray-900">{t.clicks} clicks</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => downloadCsv(placement, stats)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Descargar reporte (CSV)
              </button>
              <button
                type="button"
                onClick={copySummary}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                {copied ? "¡Copiado!" : "Copiar resumen para el anunciante"}
              </button>
              <span className="text-[11px] text-gray-400">
                Período medido: {formatDate(stats.from)} → {formatDate(stats.to)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── formulario (alta / edición) ─────────────────────────────────────────────

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] leading-snug text-gray-400">{children}</p>;
}

function CampaignForm({
  form,
  setForm,
  sources,
  editing,
  submitting,
  onToggleCategory,
  onSubmit,
  onClose,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  sources: string[];
  editing: boolean;
  submitting: boolean;
  onToggleCategory: (c: ProductCategory) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{editing ? "Editar campaña" : "Nueva campaña"}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Anunciante</label>
            <input
              type="text"
              value={form.advertiser}
              onChange={(e) => set("advertiser", e.target.value)}
              placeholder="Frávega, Garbarino..."
              required
              className={input}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Tienda a favorecer</label>
            <select
              value={form.source}
              onChange={(e) => set("source", e.target.value)}
              required
              className={`${input} capitalize`}
            >
              <option value="">Elegí una tienda…</option>
              {sources.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Rubros (al menos uno)</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onToggleCategory(cat)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    form.categories.includes(cat)
                      ? "bg-blue-600 text-white"
                      : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {CATEGORY_LABEL[cat]}
                </button>
              ))}
            </div>
          </div>

          {/* Visibilidad */}
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cuánta visibilidad compra</p>

            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Posición garantizada
              </label>
              <select value={form.slotPosition} onChange={(e) => set("slotPosition", e.target.value)} className={input}>
                <option value="">Ninguna (solo empuje por puntos)</option>
                <option value="1">Primero en los resultados</option>
                <option value="2">Entre los 2 primeros</option>
                <option value="3">Entre los 3 primeros</option>
                <option value="4">Entre los 4 primeros</option>
                <option value="6">Entre los 6 primeros (primera pantalla)</option>
              </select>
              <Hint>
                El mejor producto relevante de la tienda queda como máximo en esa posición. Es lo que más visibilidad da.
                Si ninguno es relevante para la búsqueda, no se fuerza.
              </Hint>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Empuje ({form.boost.toFixed(2)} · {boostLabel(form.boost)})
                </label>
                <input
                  type="range"
                  min={BOOST_MIN}
                  max={BOOST_MAX}
                  step={0.01}
                  value={form.boost}
                  onChange={(e) => set("boost", Number(e.target.value))}
                  className="w-full"
                />
                <Hint>Puntos que suma al producto. Más alto = sube más posiciones.</Hint>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Relevancia mínima ({form.minRelevance.toFixed(2)})
                </label>
                <input
                  type="range"
                  min={RELEVANCE_MIN}
                  max={RELEVANCE_MAX}
                  step={0.01}
                  value={form.minRelevance}
                  onChange={(e) => set("minRelevance", Number(e.target.value))}
                  className="w-full"
                />
                <Hint>Cuánto debe parecerse a lo pedido. Más bajo = aparece en más búsquedas.</Hint>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Máximo de productos por búsqueda ({form.maxPerSearch})
              </label>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={form.maxPerSearch}
                onChange={(e) => set("maxPerSearch", Number(e.target.value))}
                className="w-full"
              />
              <Hint>Evita que una sola tienda llene toda la pantalla.</Hint>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.showOnHome}
                onChange={(e) => set("showOnHome", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Mostrar también en la pantalla de inicio
            </label>
          </div>

          {/* Contrato */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600">Monto pagado (ARS, opcional)</label>
              <input
                type="number"
                min={0}
                step={1000}
                value={form.amountPaid}
                onChange={(e) => set("amountPaid", e.target.value)}
                placeholder="Ej: 150000"
                className={input}
              />
              <Hint>Sirve para calcular cuánto salió cada click y cada mil apariciones.</Hint>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Desde (opcional)</label>
              <input type="date" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={input} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Hasta (opcional)</label>
              <input type="date" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={input} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !form.source || form.categories.length === 0}
              className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? "Guardando..." : editing ? "Guardar cambios" : "Crear campaña"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
