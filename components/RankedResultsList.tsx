"use client";

import { useMemo, useRef, useState } from "react";
import { groupVariants } from "@/lib/domain/variantGroup";
import { rankWithValue, valueColor, type BadgeIcon, type ValueResult } from "@/lib/domain/valueRanking";
import { shortSpecValues } from "@/lib/domain/specExplainer";
import { TIER_RANK } from "@/lib/domain/usageToSpecs";
import { storeName, formatPrice } from "@/lib/domain/productDisplay";
import { withBasePath } from "@/lib/basePath";
import { getOrCreateVisitId } from "@/lib/analytics/visit";
import { trackEvent } from "@/lib/analytics/track";
import { SpecTermPopover } from "@/components/SpecTermPopover";
import { OtherStoresButton } from "@/components/OtherStoresButton";
import { priceBlock, StoreLogo, QUALITY_SCORE_STYLE } from "@/components/ProductChatCard";
import type { AlternativeProduct, NotebookSpecs, PhoneSpecs, TabletSpecs, TvSpecs } from "@/types";

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
  onCompareAdd?: (ids: string[], open?: boolean) => void;
  comparedIds?: string[];
}

type SortMode = string;

const RANK_COLORS = ["#D4A017", "#9AA1AC", "#B45309"];
const DEFAULT_RANK_COLOR = "#6B7280";

interface SpecSortOption {
  key: string;
  label: string;
  getValue: (p: AlternativeProduct) => number | null;
}

// Chips de orden por spec puntual (pedido 2026-09-17: "más cámara", "mejor
// procesador", "más espacio") — dinámicos según qué categorías hay en el pool
// mostrado, conviven con los 3 botones fijos de arriba (no los reemplazan).
function specSortOptions(products: AlternativeProduct[]): SpecSortOption[] {
  const categories = new Set(products.map((p) => p.category));
  const options: SpecSortOption[] = [];
  if (categories.has("phone")) {
    options.push({
      key: "camera",
      label: "Mejor cámara",
      getValue: (p) => {
        const v = (p.specs as Partial<PhoneSpecs> | undefined)?.main_camera_mp;
        return typeof v === "number" && v > 0 ? v : null;
      },
    });
  }
  if (categories.has("notebook") || categories.has("desktop")) {
    options.push({
      key: "processor",
      label: "Mejor procesador",
      getValue: (p) => {
        const tier = (p.specs as Partial<NotebookSpecs> | undefined)?.processor_tier;
        return tier ? TIER_RANK[tier] ?? null : null;
      },
    });
  }
  const hasStorage = categories.has("notebook") || categories.has("desktop") || categories.has("phone") || categories.has("tablet");
  if (hasStorage) {
    options.push({
      key: "storage",
      label: "Más espacio",
      getValue: (p) => {
        const v = (p.specs as Partial<NotebookSpecs & PhoneSpecs & TabletSpecs> | undefined)?.storage_gb;
        return typeof v === "number" && v > 0 ? v : null;
      },
    });
    options.push({
      key: "ram",
      label: "Más memoria",
      getValue: (p) => {
        const v = (p.specs as Partial<NotebookSpecs & PhoneSpecs & TabletSpecs> | undefined)?.ram_gb;
        return typeof v === "number" && v > 0 ? v : null;
      },
    });
  }
  return options;
}

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
  onCompareAdd,
  comparedIds,
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
  const specOptions = useMemo(() => specSortOptions(products), [products]);

  const sorted = useMemo(() => {
    if (sortMode === "value") {
      return [...relevanceOrdered].sort((a, b) => (valueById.get(b.id)?.value ?? 0) - (valueById.get(a.id)?.value ?? 0));
    }
    if (sortMode === "price") {
      return [...relevanceOrdered].sort((a, b) => (a.price_cash ?? Infinity) - (b.price_cash ?? Infinity));
    }
    const specOpt = specOptions.find((o) => o.key === sortMode);
    if (specOpt) {
      return [...relevanceOrdered].sort((a, b) => (specOpt.getValue(b) ?? -Infinity) - (specOpt.getValue(a) ?? -Infinity));
    }
    return relevanceOrdered;
  }, [relevanceOrdered, sortMode, valueById, specOptions]);

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
            ...specOptions.map((o): [SortMode, string] => [o.key, o.label]),
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
        {sorted.map((product, idx) => (
          <RankedResultRow
            key={product.id}
            product={product}
            idx={idx}
            vr={valueById.get(product.id)}
            paymentMode={paymentMode}
            spotlighted={
              !!spotlightProductId &&
              (product.id === spotlightProductId || !!product.variants?.some((v) => v.id === spotlightProductId))
            }
            compared={isCompared(product.id)}
            compareDisabled={compareDisabled}
            onViewDetails={onViewDetails}
            onCompareToggle={onCompareToggle}
            onBuyClick={handleBuyClick}
            onCompareAdd={onCompareAdd}
            comparedIds={comparedIds}
          />
        ))}
      </div>
    </div>
  );
}

interface RankedResultRowProps {
  product: AlternativeProduct;
  idx: number;
  vr: ValueResult | undefined;
  paymentMode: "cash" | "installments";
  spotlighted: boolean;
  compared: boolean;
  compareDisabled: boolean;
  onViewDetails: (product: AlternativeProduct) => void;
  onCompareToggle: (product: AlternativeProduct) => void;
  onBuyClick: (product: AlternativeProduct, rank: number) => void;
  onCompareAdd?: (ids: string[], open?: boolean) => void;
  comparedIds?: string[];
}

function RankedResultRow({
  product,
  idx,
  vr,
  paymentMode,
  spotlighted,
  compared,
  compareDisabled,
  onViewDetails,
  onCompareToggle,
  onBuyClick,
  onCompareAdd,
  comparedIds,
}: RankedResultRowProps) {
  const value = vr?.value ?? 5.5;
  const pb = priceBlock(product, paymentMode);
  const fields = specFields(product);

  // Mini galería — mismo patrón que ProductChatCard (flechas + contador),
  // pedido de vuelta para la Vista B (2026-09-17).
  const gallery = Array.from(
    new Set([product.image_url, ...(product.images ?? [])].filter((u): u is string => !!u))
  );
  const [imgIndex, setImgIndex] = useState(0);
  const currentImage = gallery[imgIndex] ?? null;
  function showPrevImage(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setImgIndex((i) => (i - 1 + gallery.length) % gallery.length);
  }
  function showNextImage(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setImgIndex((i) => (i + 1) % gallery.length);
  }

  // "También en X" bajo la foto (jugada #10, mismo criterio que
  // ProductChatCard) — aprovecha el espacio libre que quedaba vacío debajo de
  // la imagen fija de 96×96 en filas más altas.
  const cheaperElsewhere = (() => {
    const base = product.price_cash;
    if (!base || !product.also_at?.length) return null;
    const hit = product.also_at.find(
      (v) => v.price_cash != null && v.price_cash < base && v.source !== product.source
    );
    if (!hit || hit.price_cash == null) return null;
    return { store: storeName(hit.source), price: hit.price_cash };
  })();

  return (
    <article
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

      {/* Foto + galería + "también en X" en el espacio libre debajo */}
      <div className="flex w-24 shrink-0 flex-col gap-1">
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gathering-surface-container-highest/40 p-2">
          {currentImage ? (
            <img
              key={currentImage}
              src={withBasePath(`/api/img?url=${encodeURIComponent(currentImage)}`)}
              alt={product.title}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="material-symbols-outlined text-3xl text-gathering-outline-variant">image</span>
          )}
          {gallery.length > 1 && (
            <>
              <button
                type="button"
                onClick={showPrevImage}
                aria-label="Foto anterior"
                className="absolute left-0.5 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-gathering-on-surface shadow-sm hover:bg-white"
              >
                <span className="material-symbols-outlined text-[13px]">chevron_left</span>
              </button>
              <button
                type="button"
                onClick={showNextImage}
                aria-label="Foto siguiente"
                className="absolute right-0.5 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-gathering-on-surface shadow-sm hover:bg-white"
              >
                <span className="material-symbols-outlined text-[13px]">chevron_right</span>
              </button>
              <span className="absolute bottom-0.5 right-0.5 z-10 rounded-full bg-black/55 px-1 py-0.5 font-brand text-[9px] font-semibold text-white">
                {imgIndex + 1}/{gallery.length}
              </span>
            </>
          )}
        </div>
        {cheaperElsewhere && (
          <p className="text-center font-brand text-[9.5px] leading-tight text-gathering-on-surface-variant">
            También en {cheaperElsewhere.store}
            <br />
            <span className="font-bold text-emerald-700">{formatPrice(cheaperElsewhere.price)}</span>
          </p>
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
                  onClick={() => onBuyClick(product, idx + 1)}
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
                <OtherStoresButton
                  productId={product.id}
                  productTitle={product.title}
                  current={{
                    source: product.source,
                    price_cash: product.price_cash,
                    price_installment: product.price_installment,
                    installment_count: product.installment_count ?? null,
                    url: product.url,
                    affiliate_url: product.affiliate_url,
                  }}
                  onCompareAdd={onCompareAdd}
                  comparedIds={comparedIds}
                  triggerClassName="rounded-lg border border-gathering-outline-variant px-3 py-1.5 font-brand text-[11.5px] font-semibold text-gathering-on-surface-variant hover:bg-gathering-surface-container"
                />
                <span className="text-center font-brand text-[10px] text-gathering-on-surface-variant">
                  {storeName(product.source)}
                </span>
              </div>
            </article>
  );
}
