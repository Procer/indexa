"use client";

import { useMemo, useRef, useState } from "react";
import { groupVariants } from "@/lib/domain/variantGroup";
import { rankWithValue, valueColor, type BadgeIcon } from "@/lib/domain/valueRanking";
import { shortSpecValues } from "@/lib/domain/specExplainer";
import { storeName } from "@/lib/domain/productDisplay";
import { withBasePath } from "@/lib/basePath";
import { getOrCreateVisitId } from "@/lib/analytics/visit";
import { trackEvent } from "@/lib/analytics/track";
import { SpecTermPopover } from "@/components/SpecTermPopover";
import { priceBlock, StoreLogo, QUALITY_SCORE_STYLE } from "@/components/ProductChatCard";
import type { AlternativeProduct, TvSpecs } from "@/types";

// "Vista B" — lista rankeada centrada en precio + características, pedida
// explícitamente por el usuario como alternativa a la grilla de tarjetas
// (RecommendedProductsGrid, sin tocar). Mismo pool de productos y las mismas
// props — page.tsx elige cuál renderizar (ver resultsView).

interface RankedResultsListProps {
  products: AlternativeProduct[];
  topPickIds?: string[] | null;
  spotlightProductId?: string | null;
  onViewDetails: (product: AlternativeProduct) => void;
  onCompareToggle: (product: AlternativeProduct) => void;
  isCompared: (productId: string) => boolean;
  compareDisabled: boolean;
  searchShareToken?: string;
  sessionId?: string;
  paymentMode?: "cash" | "installments";
}

type SortMode = "relevance" | "value" | "price";

const RANK_COLORS = ["#D4A017", "#9AA1AC", "#B45309"];
const DEFAULT_RANK_COLOR = "#6B7280";

function BadgeIconSvg({ icon }: { icon: BadgeIcon }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (icon) {
    case "camera":
      return (
        <svg {...common}>
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      );
    case "storage":
      return (
        <svg {...common}>
          <line x1="22" y1="12" x2="2" y2="12" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          <line x1="6" y1="16" x2="6.01" y2="16" />
          <line x1="10" y1="16" x2="10.01" y2="16" />
        </svg>
      );
    case "ram":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <line x1="9" y1="1" x2="9" y2="4" />
          <line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" />
          <line x1="15" y1="20" x2="15" y2="23" />
        </svg>
      );
    case "processor":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M9 9h6v6H9z" />
          <line x1="9" y1="1" x2="9" y2="4" />
          <line x1="15" y1="1" x2="15" y2="4" />
        </svg>
      );
    case "screen":
      return (
        <svg {...common}>
          <rect x="2" y="4" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="18" x2="12" y2="21" />
        </svg>
      );
    case "tag":
      return (
        <svg {...common}>
          <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      );
    case "star":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
  }
}

// Popover mínimo para "Valor" — no es un término del glosario de specs
// (SpecTermPopover), así que se resuelve acá mismo, mismo patrón de tap.
function ValueTooltip() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Qué significa Valor"
        className="ml-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-gathering-outline-variant text-[8px] font-bold leading-none text-gathering-on-surface-variant hover:border-gathering-primary-fixed-dim hover:text-gathering-primary-fixed-dim"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-20 mt-1 block w-60 max-w-[calc(100vw-3rem)] rounded-lg border border-gathering-outline-variant bg-gathering-surface p-3 text-left font-brand text-[11px] font-normal normal-case leading-snug text-gathering-on-surface-variant shadow-lg"
        >
          Combina el precio con las características (según categoría) en un número del 0 al 10 — para comparar de un
          vistazo qué tan conveniente es cada opción, más allá del orden de arriba.
        </span>
      )}
    </span>
  );
}

function specFields(product: AlternativeProduct): { label: string; value: string }[] {
  const category = product.category;
  if (category === "tv") {
    const s = (product.specs ?? {}) as Partial<TvSpecs>;
    const fields: { label: string; value: string }[] = [];
    if (s.screen_inches) fields.push({ label: "Pantalla", value: `${s.screen_inches}"` });
    if (s.resolution) fields.push({ label: "Resolución", value: s.resolution });
    return fields;
  }
  if (!product.specs) return [];
  const values = shortSpecValues(category, product.specs, product.title);
  const order: { label: string; key: string }[] =
    category === "notebook" || category === "desktop"
      ? [
          { label: "Rapidez", key: "rapidez" },
          { label: "Memoria", key: "memoria" },
          { label: "Almacenamiento", key: "almacenamiento" },
        ]
      : category === "phone"
        ? [
            { label: "Memoria", key: "memoria" },
            { label: "Almacenamiento", key: "almacenamiento" },
            { label: "Cámara", key: "cámara" },
            { label: "Batería", key: "batería" },
          ]
        : [
            { label: "Memoria", key: "memoria" },
            { label: "Almacenamiento", key: "almacenamiento" },
          ];
  return order.filter((o) => values[o.key]).map((o) => ({ label: o.label, value: values[o.key] }));
}

export function RankedResultsList({
  products,
  topPickIds,
  spotlightProductId,
  onViewDetails,
  onCompareToggle,
  isCompared,
  compareDisabled,
  searchShareToken,
  sessionId,
  paymentMode = "cash",
}: RankedResultsListProps) {
  const [sortMode, setSortMode] = useState<SortMode>("relevance");

  const relevanceOrdered = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const picks = (topPickIds ?? []).map((id) => byId.get(id)).filter((p): p is AlternativeProduct => !!p);
    const pickIdSet = new Set(picks.map((p) => p.id));
    const restBase = picks.length > 0 ? products.filter((p) => !pickIdSet.has(p.id)) : products;
    return [...picks, ...groupVariants(restBase)];
  }, [products, topPickIds]);

  const valueById = useMemo(() => rankWithValue(relevanceOrdered), [relevanceOrdered]);

  const sorted = useMemo(() => {
    if (sortMode === "value") {
      return [...relevanceOrdered].sort((a, b) => (valueById.get(b.id)?.value ?? 0) - (valueById.get(a.id)?.value ?? 0));
    }
    if (sortMode === "price") {
      return [...relevanceOrdered].sort((a, b) => (a.price_cash ?? Infinity) - (b.price_cash ?? Infinity));
    }
    return relevanceOrdered;
  }, [relevanceOrdered, sortMode, valueById]);

  if (products.length === 0) return null;

  function handleBuyClick(product: AlternativeProduct, rank: number) {
    fetch(withBasePath(`/api/products/${product.id}/click`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ searchShareToken, sessionId, visitId: getOrCreateVisitId().id }),
    }).catch(() => {});
    trackEvent("product_buy_click", getOrCreateVisitId().id, {
      productId: product.id,
      metadata: { recommended: true, rank, shareToken: searchShareToken ?? null },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-brand text-[11px] font-bold uppercase tracking-wide text-gathering-on-surface-variant">
          Ordenar por
        </span>
        {(
          [
            ["relevance", "Relevancia"],
            ["value", "Mejor valor"],
            ["price", "Precio: menor a mayor"],
          ] as [SortMode, string][]
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setSortMode(mode)}
            className={`rounded-full px-3 py-1.5 font-brand text-xs font-bold transition-colors ${
              sortMode === mode
                ? "bg-gathering-primary-fixed-dim text-white"
                : "border border-gathering-outline-variant bg-gathering-surface-container text-gathering-on-surface-variant hover:border-gathering-primary-fixed-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {sorted.map((product, idx) => {
          const vr = valueById.get(product.id);
          const value = vr?.value ?? 5.5;
          const pb = priceBlock(product, paymentMode);
          const fields = specFields(product);
          const spotlighted =
            !!spotlightProductId &&
            (product.id === spotlightProductId || !!product.variants?.some((v) => v.id === spotlightProductId));
          const compared = isCompared(product.id);

          return (
            <article
              key={product.id}
              className={`flex gap-4 rounded-2xl border p-4 transition-colors gathering-glass-card ${
                spotlighted
                  ? "z-10 animate-spotlight-pulse ring-4 ring-[#3452E1] ring-offset-2 ring-offset-gathering-background border-gathering-outline-variant"
                  : "border-gathering-outline-variant"
              }`}
            >
              {/* Ranking */}
              <div className="flex w-9 shrink-0 flex-col items-center pt-1">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full font-brand text-sm font-bold text-white"
                  style={{ backgroundColor: RANK_COLORS[idx] ?? DEFAULT_RANK_COLOR }}
                >
                  {idx + 1}
                </div>
              </div>

              {/* Foto */}
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gathering-surface-container-highest/40 p-2">
                {product.image_url ? (
                  <img
                    src={withBasePath(`/api/img?url=${encodeURIComponent(product.image_url)}`)}
                    alt={product.title}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="material-symbols-outlined text-3xl text-gathering-outline-variant">image</span>
                )}
              </div>

              {/* Contenido */}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                      {product.brand && (
                        <span className="font-brand text-[11px] font-bold uppercase tracking-widest text-gathering-on-surface-variant">
                          {product.brand}
                        </span>
                      )}
                      {product.quality_price_score && (
                        <span
                          className={`rounded-full px-2 py-0.5 font-brand text-[9px] font-semibold ${
                            QUALITY_SCORE_STYLE[product.quality_price_score] ?? QUALITY_SCORE_STYLE.REGULAR
                          }`}
                        >
                          {product.quality_price_score.charAt(0) + product.quality_price_score.slice(1).toLowerCase()}
                        </span>
                      )}
                      {product.out_of_budget && (
                        <span className="rounded-full bg-orange-600 px-2 py-0.5 font-brand text-[9px] font-bold uppercase text-white">
                          Fuera de presupuesto
                        </span>
                      )}
                      {product.sponsored && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-brand text-[9px] font-semibold uppercase text-amber-700">
                          Patrocinado
                        </span>
                      )}
                    </div>
                    <h3 className="line-clamp-2 font-brand text-[15px] font-bold leading-snug text-gathering-on-surface">
                      {product.title}
                    </h3>
                  </div>
                  {pb && (
                    <div className="shrink-0 text-right">
                      <p className="font-brand text-lg font-bold text-gathering-on-surface">
                        {pb.leadAmount}
                        <span className="ml-1 text-xs font-medium text-gathering-on-surface-variant">{pb.leadUnit}</span>
                      </p>
                      {pb.sub && <p className="font-brand text-[11px] text-gathering-on-surface-variant">{pb.sub}</p>}
                    </div>
                  )}
                </div>

                {/* Barra de valor */}
                <div className="flex items-center gap-2.5">
                  <span className="flex w-14 shrink-0 items-center font-brand text-[10px] font-bold uppercase tracking-wide text-gathering-on-surface-variant">
                    Valor
                    <ValueTooltip />
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gathering-surface-container-highest">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.round(value * 10)}%`, backgroundColor: valueColor(value) }}
                    />
                  </div>
                  <span className="w-11 shrink-0 text-right font-brand text-xs font-bold text-gathering-on-surface">
                    {value.toFixed(1)}/10
                  </span>
                </div>

                {/* Insignias comparativas */}
                {vr && vr.badges.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {vr.badges.map((b, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-gathering-primary-container/15 px-2.5 py-1 font-brand text-[11px] font-bold text-gathering-primary-fixed"
                      >
                        <BadgeIconSvg icon={b.icon} />
                        {b.text}
                      </span>
                    ))}
                  </div>
                )}

                {/* Nota comparativa */}
                {vr?.note && (
                  <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 font-brand text-[11.5px] text-amber-800">
                    <span className="material-symbols-outlined text-sm">info</span>
                    <span>{vr.note}</span>
                  </div>
                )}

                {/* Specs con tooltip */}
                {fields.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {fields.map((f) => (
                      <span key={f.label} className="inline-flex items-center font-brand text-[12px] text-gathering-on-surface-variant">
                        <SpecTermPopover category={product.category} label={f.label} variant="chip" />
                        <span className="ml-1.5 font-semibold text-gathering-on-surface">{f.value}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Acciones */}
              <div className="flex shrink-0 flex-col items-stretch gap-1.5 self-center">
                <a
                  href={product.affiliate_url ?? product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleBuyClick(product, idx + 1)}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-gathering-primary-fixed-dim px-4 py-2.5 font-brand text-[13px] font-bold text-white transition-transform active:scale-[0.97]"
                >
                  <StoreLogo source={product.source} />
                  Comprar
                </a>
                <button
                  type="button"
                  onClick={() => onViewDetails(product)}
                  className="rounded-lg border border-gathering-outline-variant px-3 py-1.5 font-brand text-[11.5px] font-semibold text-gathering-on-surface-variant hover:bg-gathering-surface-container"
                >
                  Detalles
                </button>
                <button
                  type="button"
                  onClick={() => onCompareToggle(product)}
                  disabled={!compared && compareDisabled}
                  className={`rounded-lg border px-3 py-1.5 font-brand text-[11.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                    compared
                      ? "border-gathering-primary-fixed-dim bg-gathering-primary-fixed-dim/10 text-gathering-primary-fixed-dim"
                      : "border-gathering-outline-variant text-gathering-on-surface-variant hover:bg-gathering-surface-container"
                  }`}
                >
                  {compared ? "✓ Comparando" : "Comparar"}
                </button>
                <span className="text-center font-brand text-[10px] text-gathering-on-surface-variant">
                  {storeName(product.source)}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
