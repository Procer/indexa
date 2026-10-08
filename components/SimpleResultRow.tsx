"use client";

import { useRef } from "react";
import { storeName } from "@/lib/domain/productDisplay";
import { withBasePath } from "@/lib/basePath";
import { useImpression } from "@/lib/analytics/useImpression";
import { SpecDetailPanel } from "@/components/SpecDetailPanel";
import { OutlookPanel } from "@/components/OutlookPanel";
import { OtherStoresButton } from "@/components/OtherStoresButton";
import { priceBlock, StoreLogo } from "@/components/ProductChatCard";
import { buildBudgetFit, buildFitVerdict, PLAIN_QUALITY_LABEL } from "@/lib/domain/plainFit";
import type { AlternativeProduct, UseCase } from "@/types";

// Vista "Simple" (default): una tarjeta por equipo, pensada para quien no sabe
// de tecnología. Foto, nombre, precio, UNA frase de "¿me sirve?", "¿entra en mi
// presupuesto?", hasta 3 puntos en palabras y pocos botones. Las
// características quedan a un toque ("Ver las características") y la vista
// "Detallada" sigue disponible para quien las quiere de entrada.

interface SimpleResultRowProps {
  product: AlternativeProduct;
  idx: number;
  paymentMode: "cash" | "installments";
  useCases: UseCase[];
  budgetCash: number | null;
  budgetMonthly: number | null;
  spotlighted: boolean;
  compared: boolean;
  compareDisabled: boolean;
  onCompareToggle: (product: AlternativeProduct) => void;
  onBuyClick: (product: AlternativeProduct, rank: number) => void;
  onCompareAdd?: (ids: string[], open?: boolean) => void;
  comparedIds?: string[];
  searchShareToken?: string;
}

const GOOD_BUY_LABEL = new Set(["EXCELENTE", "MUY BUENO", "BUENO"]);

export function SimpleResultRow({
  product,
  idx,
  paymentMode,
  useCases,
  budgetCash,
  budgetMonthly,
  spotlighted,
  compared,
  compareDisabled,
  onCompareToggle,
  onBuyClick,
  onCompareAdd,
  comparedIds,
  searchShareToken,
}: SimpleResultRowProps) {
  const rowRef = useRef<HTMLElement>(null);
  useImpression(rowRef, searchShareToken, product.id);
  const pb = priceBlock(product, paymentMode);
  const fit = buildFitVerdict(product, useCases);
  const budgetFit = buildBudgetFit(product, { cash: budgetCash, monthly: budgetMonthly });
  const image = product.image_url ?? product.images?.[0] ?? null;
  const goodBuy = product.quality_price_score && GOOD_BUY_LABEL.has(product.quality_price_score);

  // Hasta 3 puntos, lo mejor primero y lo flojo después (para no ocultarlo).
  const points = fit
    ? [...fit.chips.filter((c) => c.level === "great"), ...fit.chips.filter((c) => c.level === "ok"), ...fit.chips.filter((c) => c.level === "warn")]
        .slice(0, 3)
    : [];

  return (
    <article
      ref={rowRef}
      className={`flex flex-col gap-4 rounded-2xl border p-4 transition-colors sm:p-5 gathering-glass-card ${
        spotlighted
          ? "z-10 animate-spotlight-pulse ring-4 ring-[#3452E1] ring-offset-2 ring-offset-gathering-background border-gathering-outline-variant"
          : product.sponsored
            ? "border-amber-300/80"
            : "border-gathering-outline-variant"
      }`}
    >
      <div className="flex gap-4">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gathering-surface-container-highest/40 p-2 sm:h-36 sm:w-36">
          {image ? (
            <img
              src={withBasePath(`/api/img?url=${encodeURIComponent(image)}`)}
              alt={product.title}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="material-symbols-outlined text-4xl text-gathering-outline-variant">image</span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {goodBuy && (
              <span className="rounded-full bg-emerald-600/15 px-2.5 py-0.5 font-brand text-xs font-bold text-emerald-700">
                {PLAIN_QUALITY_LABEL[product.quality_price_score as string]}
              </span>
            )}
            {product.sponsored && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-brand text-xs font-semibold uppercase text-amber-700">
                Patrocinado
              </span>
            )}
          </div>
          <h3 className="line-clamp-2 font-brand text-base font-bold leading-snug text-gathering-on-surface sm:text-lg">
            {product.title}
          </h3>
          {pb && (
            <div>
              <p className="font-brand text-2xl font-extrabold text-gathering-on-surface sm:text-3xl">
                {pb.leadAmount}
                <span className="ml-1.5 text-sm font-medium text-gathering-on-surface-variant">{pb.leadUnit}</span>
              </p>
              {pb.sub && <p className="font-brand text-xs text-gathering-on-surface-variant">{pb.sub}</p>}
              {pb.tag && (
                <p
                  className={`font-brand text-xs font-bold ${pb.tag.tone === "ok" ? "text-emerald-700" : "text-amber-700"}`}
                >
                  {pb.tag.text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {(fit || budgetFit) && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-gathering-surface-container-low px-4 py-3">
          {fit && (
            <p className="font-brand text-[15px] font-semibold leading-snug text-gathering-on-surface">
              <span
                className={`mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle ${
                  fit.level === "warn" ? "bg-amber-400" : "bg-emerald-400"
                }`}
                aria-hidden="true"
              />
              {fit.headline}
            </p>
          )}
          {budgetFit && (
            <p
              className={`flex items-start gap-1.5 font-brand text-sm font-medium ${
                budgetFit.tone === "warn" ? "text-orange-700" : "text-emerald-700"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                {budgetFit.tone === "warn" ? "info" : "check_circle"}
              </span>
              {budgetFit.text}
            </p>
          )}
          {points.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1">
              {points.map((c) => (
                <li key={c.label} className="font-brand text-sm text-gathering-on-surface-variant">
                  <span aria-hidden="true">{c.icon}</span> <span className="font-semibold text-gathering-on-surface">{c.label}:</span>{" "}
                  {c.word}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-nowrap items-stretch gap-1.5 sm:gap-2">
        <a
          href={product.affiliate_url ?? product.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onBuyClick(product, idx + 1)}
          className="flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gathering-primary-fixed-dim px-3 py-2.5 font-brand text-xs font-bold sm:px-5 sm:py-3 sm:text-sm text-white transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.97]"
        >
          {/* Celular: logo + "Comprar"; si el logo no carga, el nombre de la tienda. */}
          <span className="sm:hidden">
            <StoreLogo
              source={product.source}
              fallback={<span className="max-w-[5rem] truncate text-[11px] font-semibold opacity-90">{storeName(product.source)}</span>}
            />
          </span>
          <span className="hidden sm:inline-flex">
            <StoreLogo source={product.source} />
          </span>
          Comprar<span className="hidden sm:inline">&nbsp;en {storeName(product.source)}</span>
        </a>
        <button
          type="button"
          onClick={() => onCompareToggle(product)}
          disabled={!compared && compareDisabled}
          className={`whitespace-nowrap rounded-xl border px-2.5 py-2.5 font-brand text-xs font-semibold transition-all sm:px-4 sm:py-3 sm:text-sm hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none ${
            compared
              ? "border-gathering-primary-fixed-dim bg-gathering-primary-fixed-dim/10 text-gathering-primary-fixed-dim"
              : "border-gathering-outline-variant text-gathering-on-surface-variant hover:border-gathering-primary-fixed-dim hover:bg-gathering-surface-container"
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
          showIcon={false}
          triggerClassName="whitespace-nowrap rounded-xl border border-gathering-outline-variant px-2.5 py-2.5 font-brand text-xs font-semibold sm:px-4 sm:py-3 sm:text-sm text-gathering-on-surface-variant transition-all hover:-translate-y-0.5 hover:border-gathering-primary-fixed-dim hover:bg-gathering-surface-container hover:shadow-md"
        />
      </div>

      <OutlookPanel product={product} useCases={useCases} />

      <SpecDetailPanel
        product={product}
        useCases={useCases}
        closedLabel="Ver las características"
        openLabel="Ocultar características"
      />
    </article>
  );
}
