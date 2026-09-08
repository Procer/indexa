"use client";

import { useState, useEffect, useCallback } from "react";
import { adminFetch } from "@/lib/auth/adminClient";
import type { SponsoredPlacement, ProductCategory } from "@/types";

const BOOST_MIN = 0.01;
const BOOST_MAX = 0.10;
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

// ─── componente ──────────────────────────────────────────────────────────────

export default function SponsorsAdminPage() {
  const [placements, setPlacements] = useState<SponsoredPlacement[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // form nueva campaña
  const [showForm, setShowForm] = useState(false);
  const [formAdvertiser, setFormAdvertiser] = useState("");
  const [formSource, setFormSource] = useState("");
  const [formBoost, setFormBoost] = useState(0.05);
  const [formMinRelevance, setFormMinRelevance] = useState(0.65);
  const [formShowOnHome, setFormShowOnHome] = useState(false);
  const [formStartsAt, setFormStartsAt] = useState("");
  const [formEndsAt, setFormEndsAt] = useState("");
  const [formCategories, setFormCategories] = useState<ProductCategory[]>([]);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const loadPlacements = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await adminFetch("/api/admin/sponsors");
    if (res.ok) {
      const data = (await res.json()) as { placements: SponsoredPlacement[]; sources?: string[] };
      setPlacements(data.placements);
      setSources(data.sources ?? []);
    } else {
      setError("No autorizado o error al cargar campañas.");
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
    setPlacements((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x))
    );
  }

  async function deletePlacement(p: SponsoredPlacement) {
    if (!confirm(`¿Eliminar campaña de ${p.advertiser}?`)) return;
    await adminFetch(`/api/admin/sponsors/${p.id}`, { method: "DELETE" });
    setPlacements((prev) => prev.filter((x) => x.id !== p.id));
  }

  function toggleCategory(cat: ProductCategory) {
    setFormCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  async function handleCreateCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!formAdvertiser.trim() || !formSource || formCategories.length === 0) return;
    setFormSubmitting(true);

    const res = await adminFetch("/api/admin/sponsors", {
      method: "POST",
      body: JSON.stringify({
        advertiser: formAdvertiser,
        target_source: formSource,
        categories: formCategories,
        score_boost: formBoost,
        min_relevance: formMinRelevance,
        show_on_home: formShowOnHome,
        starts_at: formStartsAt || null,
        ends_at: formEndsAt || null,
      }),
    });

    if (res.ok) {
      setShowForm(false);
      setFormAdvertiser("");
      setFormSource("");
      setFormBoost(0.05);
      setFormMinRelevance(0.65);
      setFormShowOnHome(false);
      setFormStartsAt("");
      setFormEndsAt("");
      setFormCategories([]);
      await loadPlacements();
    } else {
      const data = (await res.json()) as { error?: string };
      alert(data.error ?? "Error al crear campaña");
    }
    setFormSubmitting(false);
  }

  // ── panel principal ────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Campañas patrocinadas</h1>
            <p className="mt-1 text-sm text-gray-500">
              Empujan en el ranking a los productos de una tienda en ciertos rubros, solo si son relevantes para la búsqueda.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + Nueva campaña
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Lista de campañas */}
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Cargando...</div>
        ) : placements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center">
            <p className="text-sm text-gray-400">No hay campañas todavía.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {placements.map((p) => (
              <PlacementRow
                key={p.id}
                placement={p}
                onToggle={() => toggleActive(p)}
                onDelete={() => deletePlacement(p)}
              />
            ))}
          </div>
        )}

        {/* Formulario nueva campaña */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Nueva campaña</h2>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >✕</button>
              </div>

              <form onSubmit={handleCreateCampaign} className="space-y-4">

                {/* Advertiser */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Anunciante</label>
                  <input
                    type="text"
                    value={formAdvertiser}
                    onChange={(e) => setFormAdvertiser(e.target.value)}
                    placeholder="Frávega, Garbarino..."
                    required
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                  />
                </div>

                {/* Tienda */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Tienda</label>
                  <select
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm capitalize outline-none focus:border-blue-400"
                  >
                    <option value="">Elegí una tienda…</option>
                    {sources.map((s) => (
                      <option key={s} value={s} className="capitalize">{s}</option>
                    ))}
                  </select>
                </div>

                {/* Rubros */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Rubros (al menos uno)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          formCategories.includes(cat)
                            ? "bg-blue-600 text-white"
                            : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {CATEGORY_LABEL[cat]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mostrar en el inicio */}
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={formShowOnHome}
                    onChange={(e) => setFormShowOnHome(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Mostrar en la pantalla de inicio
                </label>

                {/* Boost y relevancia mínima */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Score boost ({formBoost.toFixed(2)})
                    </label>
                    <input
                      type="range"
                      min={BOOST_MIN}
                      max={BOOST_MAX}
                      step={0.01}
                      value={formBoost}
                      onChange={(e) => setFormBoost(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>{BOOST_MIN}</span><span>{BOOST_MAX}</span>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Relevancia mínima ({formMinRelevance.toFixed(2)})
                    </label>
                    <input
                      type="range"
                      min={RELEVANCE_MIN}
                      max={RELEVANCE_MAX}
                      step={0.01}
                      value={formMinRelevance}
                      onChange={(e) => setFormMinRelevance(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>{RELEVANCE_MIN}</span><span>{RELEVANCE_MAX}</span>
                    </div>
                  </div>
                </div>

                {/* Fechas */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Desde (opcional)</label>
                    <input
                      type="date"
                      value={formStartsAt}
                      onChange={(e) => setFormStartsAt(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Hasta (opcional)</label>
                    <input
                      type="date"
                      value={formEndsAt}
                      onChange={(e) => setFormEndsAt(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting || !formSource || formCategories.length === 0}
                    className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {formSubmitting ? "Creando..." : "Crear campaña"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ─── fila de campaña ──────────────────────────────────────────────────────────

function PlacementRow({
  placement,
  onToggle,
  onDelete,
}: {
  placement: SponsoredPlacement;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${placement.active ? "border-gray-100" : "border-gray-100 opacity-60"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">{placement.advertiser}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-700">
              {placement.target_source ?? "sin tienda"}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${placement.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              {placement.active ? "Activa" : "Pausada"}
            </span>
            {placement.show_on_home && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                En el inicio
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>
              Rubros: {placement.categories.map((c) => CATEGORY_LABEL[c] ?? c).join(", ") || "—"}
            </span>
            <span>Boost: +{placement.score_boost}</span>
            <span>Relevancia mín: {placement.min_relevance}</span>
            {(placement.starts_at || placement.ends_at) && (
              <span>
                {formatDate(placement.starts_at)} → {formatDate(placement.ends_at)}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
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
    </div>
  );
}

