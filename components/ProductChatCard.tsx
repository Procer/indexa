"use client";

import { useState } from "react";
import { OtherStoresButton } from "./OtherStoresButton";
import { classifyHighlightLevel } from "@/lib/domain/specExplainer";
import { LEVEL_DOT, LEVEL_POSITION } from "./SpecHighlights";
import { withBasePath } from "@/lib/basePath";
import { getOrCreateVisitId } from "@/lib/analytics/visit";
import { formatPrice, storeLogoUrl, storeName } from "@/lib/domain/productDisplay";
import type { AlternativeProduct } from "@/types";

// Tarjeta de producto — foto cuadrada arriba, marca+título, precio siempre
// alineado en la misma altura entre tarjetas (para que una fila de 3-4 quede
// prolija aunque un título sea más corto que otro), specs en lista vertical,
// y las acciones ancladas abajo del todo con "mt-auto". Estructura pedida
// explícitamente por el usuario (mockup HTML de referencia).

function specLabel(highlight: string): string {
  const idx = highlight.indexOf(":");
  return idx === -1 ? highlight : highlight.slice(0, idx).trim();
}

// Dos líneas separadas en vez de una sola unida con " · " — juntas en una
// tira nowrap se pasaban del ancho de la tarjeta y la última palabra
// quedaba cortada por el overflow-hidden de la tarjeta (ej. "18 cuotas" se
// veía como "18 cuota").
function priceLines(product: AlternativeProduct): string[] {
  const lines: string[] = [];
  if (product.price_cash) lines.push(`${formatPrice(product.price_cash)} contado`);
  if (product.price_installment && product.installment_count) {
    const cuota = product.installment_count === 1 ? "cuota" : "cuotas";
    lines.push(`${formatPrice(product.price_installment)}/mes en ${product.installment_count} ${cuota}`);
  }
  return lines;
}

const QUALITY_SCORE_STYLE: Record<string, string> = {
  EXCELENTE: "bg-emerald-600/90 text-white",
  "MUY BUENO": "bg-gathering-primary-fixed-dim text-gathering-on-primary-fixed",
  BUENO: "bg-amber-600/90 text-white",
  REGULAR: "bg-gathering-surface-container-highest text-gathering-on-surface-variant border border-gathering-outline-variant",
};

interface ProductChatCardProps {
  product: AlternativeProduct;
  isTopPick?: boolean;
  // Posición dentro de los picks del chat (1 = el mejor) — solo cambia el
  // texto del badge, ahora que recommend_products puede marcar hasta 5.
  pickRank?: number;
  isSelected?: boolean;
  justSent?: boolean;
  onViewDetails: (product: AlternativeProduct) => void;
  searchShareToken?: string;
  sessionId?: string;
  // Opcional: solo el modal de "todos los resultados" lo usa hoy — el chat
  // de resultados maneja la comparación desde su propio botón de header
  // (ver GuidedSearchChat), no por tarjeta.
  onCompareToggle?: (product: AlternativeProduct) => void;
  isCompared?: boolean;
  compareDisabled?: boolean;
}

// Logo de la tienda (favicon por dominio, ver lib/domain/productDisplay.ts)
// dentro del botón de compra. Si no carga (dominio sin favicon, o servicio
// caído) se oculta solo y queda el botón con texto, nunca un ícono roto.
function StoreLogo({ source }: { source: string }) {
  const [failed, setFailed] = useState(false);
  const url = storeLogoUrl(source);
  if (!url || failed) return null;
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      className="h-6 w-10 shrink-0 rounded-md bg-white object-contain p-0.5"
      onError={() => setFailed(true)}
    />
  );
}

// Specs escondidas detrás de un acordeón (cerrado por defecto) — a pedido
// explícito del usuario, para no ocupar espacio de la tarjeta con la barra
// semáforo de entrada. Cada spec como barra semáforo (mismo criterio que el
// modo "Barra" de SpecHighlights: posición del punto en rojo/ámbar/verde).
function SpecsAccordion({ specs }: { specs: string[] }) {
  const [open, setOpen] = useState(false);
  if (specs.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between font-brand text-xs font-semibold text-gathering-on-surface-variant hover:text-gathering-on-surface"
      >
        Ver specs
        <span
          className={`material-symbols-outlined text-[18px] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          expand_more
        </span>
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-2">
          {specs.map((h) => {
            const level = classifyHighlightLevel(h);
            return (
              <li key={h} className="flex items-center gap-2 font-brand text-xs text-gathering-on-surface-variant">
                <span className="min-w-0 flex-1 truncate">{specLabel(h)}</span>
                <span className="relative h-1.5 w-14 shrink-0 rounded-full bg-gradient-to-r from-red-400/30 via-amber-400/30 to-emerald-400/30">
                  <span
                    className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-gathering-surface-container-low shadow ${LEVEL_DOT[level]}`}
                    style={{ left: `${LEVEL_POSITION[level]}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ProductChatCard({
  product,
  isTopPick,
  pickRank,
  isSelected,
  justSent,
  onViewDetails,
  searchShareToken,
  sessionId,
  onCompareToggle,
  isCompared,
  compareDisabled,
}: ProductChatCardProps) {
  const store = storeName(product.source);
  const specs = product.spec_highlights_simple ?? [];
  const price = priceLines(product);
  const hasBadge = isTopPick || !!product.quality_price_score || !!product.out_of_budget;

  return (
    <article
      className={`group relative flex h-full flex-col gathering-glass-card rounded-lg p-4 transition-colors ${justSent ? "animate-card-glow" : ""} ${
        isTopPick
          ? "border-2 border-amber-400/70 bg-amber-50/60 shadow-[0_4px_14px_rgba(180,83,9,0.15)]"
          : ""
      } ${isSelected ? "border-gathering-primary-fixed-dim ring-2 ring-gathering-primary/20" : ""}`}
    >
      {/* Badges flotando sobre la imagen, no apretados junto al título */}
      {hasBadge && (
        <div className="absolute left-3 right-3 top-3 z-10 flex flex-wrap gap-1.5">
          {isTopPick && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 font-brand text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
              <span aria-hidden>★</span> {!pickRank || pickRank === 1 ? "Mejor opción" : "Recomendado"}
            </span>
          )}
          {product.quality_price_score && (
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 font-brand text-[10px] font-semibold shadow-sm ${
                QUALITY_SCORE_STYLE[product.quality_price_score] ?? QUALITY_SCORE_STYLE.REGULAR
              }`}
            >
              {product.quality_price_score.charAt(0) + product.quality_price_score.slice(1).toLowerCase()} calidad/precio
            </span>
          )}
          {product.out_of_budget && (
            <span className="flex items-center gap-1 rounded-full bg-orange-600 px-2.5 py-1 font-brand text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
              <span aria-hidden>⚠</span> Fuera de presupuesto
            </span>
          )}
        </div>
      )}

      {/* Imagen cuadrada */}
      <div
        className={`relative mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-md bg-gathering-surface-container-highest/40 p-4 ${
          hasBadge ? "mt-7" : ""
        }`}
      >
        {product.image_url ? (
          <img
            src={withBasePath(`/api/img?url=${encodeURIComponent(product.image_url)}`)}
            alt={product.title}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="material-symbols-outlined text-4xl text-gathering-outline-variant">image</span>
        )}
      </div>

      {/* Marca (etiqueta chica) + título */}
      <div className="mb-2 min-h-[3.25rem]">
        {product.brand && (
          <p className="mb-0.5 font-brand text-[11px] font-semibold uppercase tracking-widest text-gathering-on-surface-variant">
            {product.brand}
          </p>
        )}
        <h4 className="line-clamp-2 font-brand text-sm font-bold leading-snug text-gathering-on-surface">{product.title}</h4>
      </div>

      {/* Precio — altura fija y alineado abajo, así todas las tarjetas de una
          fila arrancan el precio a la misma altura sin importar si el título
          de al lado ocupó una o dos líneas. */}
      <div className="mb-3 flex min-h-[3rem] flex-col justify-end">
        {price[0] && (
          <p className="font-brand text-base font-bold text-gathering-primary-fixed-dim">
            {price[0].replace(" contado", "")}
            <span className="ml-1 font-brand text-xs font-normal text-gathering-on-surface-variant">contado</span>
          </p>
        )}
        {price[1] && <p className="font-brand text-xs font-medium text-gathering-primary">{price[1]}</p>}
      </div>

      <hr className="mb-3 border-t border-gathering-outline-variant" />

      <SpecsAccordion specs={specs} />

      {/* Acciones — siempre pegadas abajo del todo (mt-auto), aunque la
          tarjeta de al lado tenga más contenido arriba. */}
      <div className="mt-auto flex flex-col gap-2">
        <a
          href={product.affiliate_url ?? product.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            fetch(withBasePath(`/api/products/${product.id}/click`), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ searchShareToken, sessionId, visitId: getOrCreateVisitId().id }),
            }).catch(() => {});
          }}
          className="gathering-btn-primary-gradient flex items-center justify-center gap-2 rounded-full py-2.5 text-center font-brand text-xs font-semibold text-white active:scale-[0.97]"
        >
          <StoreLogo source={product.source} />
          Comprar en {store}
        </a>
        <div className={`grid gap-2 ${onCompareToggle ? "grid-cols-2" : "grid-cols-1"}`}>
          <button
            type="button"
            onClick={() => onViewDetails(product)}
            className="flex items-center justify-center gap-1 rounded-full border border-gathering-primary-fixed-dim py-1.5 font-brand text-xs font-semibold text-gathering-primary-fixed-dim transition-colors hover:bg-gathering-primary/10 active:scale-[0.97]"
          >
            <span className="material-symbols-outlined text-[16px]">visibility</span>
            Detalles
          </button>
          {onCompareToggle && (
            <button
              type="button"
              onClick={() => onCompareToggle(product)}
              disabled={compareDisabled && !isCompared}
              className={`flex items-center justify-center gap-1 rounded-full border py-1.5 font-brand text-xs font-semibold transition-colors active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${
                isCompared
                  ? "border-gathering-primary-fixed-dim bg-gathering-primary/10 text-gathering-primary-fixed-dim"
                  : "border-gathering-outline-variant text-gathering-on-surface-variant hover:bg-black/5"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{isCompared ? "check" : "add"}</span>
              Comparar
            </button>
          )}
        </div>
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
          triggerClassName="flex w-full items-center justify-center gap-1 rounded-full border border-gathering-outline-variant py-1.5 font-brand text-xs font-semibold text-gathering-on-surface-variant transition-colors hover:bg-black/5 active:scale-[0.97]"
        />
      </div>
    </article>
  );
}
