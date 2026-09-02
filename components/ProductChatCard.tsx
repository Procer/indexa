"use client";

import { useState } from "react";
import { OtherStoresButton } from "./OtherStoresButton";
import { classifyHighlightLevel, extraCardFacts, shortSpecValues, type CardFact } from "@/lib/domain/specExplainer";
import { buildSelectionShareText } from "@/lib/domain/shareSelection";
import { LEVEL_DOT } from "./SpecHighlights";
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

function specDesc(highlight: string): string {
  const idx = highlight.indexOf(":");
  const desc = idx === -1 ? highlight : highlight.slice(idx + 1).trim();
  // Sin el punto final: en una lista de líneas cortas se lee más limpio.
  return desc.replace(/\.$/, "");
}

// Bloque de precio: número grande + unidad, y una línea chica debajo. El orden
// depende de cómo eligió pagar el usuario — si buscó "por mes / en cuotas", el
// número grande es la cuota mensual, no "$X contado" (bug reportado: la tarjeta
// decía "contado" cuando la búsqueda era en cuotas).
interface PriceBlock {
  leadAmount: string;
  leadUnit: string;
  sub: string | null;
}

function priceBlock(
  p: { price_cash: number | null; price_installment: number | null; installment_count?: number | null },
  mode: "cash" | "installments"
): PriceBlock | null {
  const cash = p.price_cash ? formatPrice(p.price_cash) : null;
  const inst =
    p.price_installment && p.installment_count
      ? { amount: formatPrice(p.price_installment), count: p.installment_count }
      : null;
  const instUnit = inst ? `/mes · ${inst.count} ${inst.count === 1 ? "cuota" : "cuotas"}` : "";
  const instLong = inst
    ? `${inst.amount}/mes en ${inst.count} ${inst.count === 1 ? "cuota" : "cuotas"}`
    : null;

  if (mode === "installments" && inst) {
    return { leadAmount: inst.amount, leadUnit: instUnit, sub: cash ? `${cash} contado` : null };
  }
  if (cash) {
    return { leadAmount: cash, leadUnit: "contado", sub: instLong };
  }
  if (inst) {
    return { leadAmount: inst.amount, leadUnit: instUnit, sub: null };
  }
  return null;
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
  // Jugada #5: agregar modelos parecidos (del modal "En otras tiendas") al
  // comparador. `ids` ya incluye el id de este producto.
  onCompareAdd?: (ids: string[], open?: boolean) => void;
  comparedIds?: string[];
  // Cómo eligió pagar el usuario en la búsqueda — decide si el número grande
  // del precio es el contado o la cuota mensual. Default "cash".
  paymentMode?: "cash" | "installments";
  isCompared?: boolean;
  compareDisabled?: boolean;
  // Cuando el set de resultados mezcla opciones dentro y fuera del presupuesto
  // pedido (pasa cuando el usuario pidió una marca/procesador puntual y algunas
  // se van de precio): las que SÍ entran llevan un chip verde de contraste. Las
  // que no entran ya llevan el badge "Fuera de presupuesto". Si entra todo, no
  // se ensucia ninguna tarjeta con chips.
  showBudgetFit?: boolean;
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

// Lectura en lenguaje llano — SIEMPRE visible (antes vivía detrás del acordeón
// "Ver specs", cerrado por defecto, así que el usuario no técnico nunca la
// veía). Cada línea: punto de color semáforo (great/ok/warn) + etiqueta
// funcional (Rapidez / Memoria / Almacenamiento…) + veredicto de una frase.
// La ficha técnica cruda (nombre de procesador, tipo de SSD, GB) queda abajo
// en el acordeón para quien la pida.
function SpecHighlightsSimple({
  highlights,
  values,
}: {
  highlights: string[];
  values: Record<string, string>;
}) {
  if (highlights.length === 0) return null;

  return (
    <ul className="mb-3 flex flex-col gap-1.5">
      {highlights.map((h) => {
        const level = classifyHighlightLevel(h);
        const label = specLabel(h);
        const value = values[label.toLowerCase()];
        // Se saca SIEMPRE el número que a veces abre el veredicto ("512GB, abre
        // todo casi al instante"): si hay chip, para no repetirlo; si no hay
        // chip (dato inverosímil que no se pudo recuperar), para no mostrar un
        // número posiblemente falso. El chip es la única fuente del valor.
        const desc = specDesc(h).replace(/^\d[\d.,]*\s*(gb|tb)\b[,:]?\s*/i, "");
        return (
          <li
            key={h}
            className="flex gap-2 font-brand text-xs leading-snug text-gathering-on-surface-variant"
          >
            <span
              className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_DOT[level]}`}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="font-bold uppercase tracking-wide text-gathering-on-surface">
                {label}
              </span>
              {value && (
                <span className="mx-1 rounded bg-gathering-surface-container-highest px-1.5 py-px text-[10px] font-bold text-gathering-on-surface">
                  {value}
                </span>
              )}{" "}
              {desc}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// Datos físicos en lenguaje llano (pantalla, peso, tamaño) con comparaciones
// concretas — "como una hoja A4", "como una botella de agua de 1½ litro". Punto
// neutro (no semáforo): son descriptivos, no un juicio de "alcanza / no alcanza".
function ExtraFacts({ facts }: { facts: CardFact[] }) {
  if (facts.length === 0) return null;

  return (
    <ul className="mb-3 flex flex-col gap-1.5">
      {facts.map((f) => (
        <li
          key={f.label}
          className="flex gap-2 font-brand text-xs leading-snug text-gathering-on-surface-variant"
        >
          <span
            className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-gathering-outline-variant"
            aria-hidden
          />
          <span className="min-w-0">
            <span className="font-bold uppercase tracking-wide text-gathering-on-surface">
              {f.label}
            </span>
            {f.value && (
              <span className="mx-1 rounded bg-gathering-surface-container-highest px-1.5 py-px text-[10px] font-bold text-gathering-on-surface">
                {f.value}
              </span>
            )}{" "}
            {f.text}
          </span>
        </li>
      ))}
    </ul>
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
  onCompareAdd,
  comparedIds,
  paymentMode = "cash",
  isCompared,
  compareDisabled,
  showBudgetFit,
}: ProductChatCardProps) {
  const specs = product.spec_highlights_simple ?? [];
  const specValues = product.specs
    ? shortSpecValues(product.category, product.specs, product.title)
    : {};
  const facts = product.specs ? extraCardFacts(product.category, product.specs, product.title) : [];
  const [shared, setShared] = useState(false);

  // Selector de variante (casi-duplicados colapsados: color / SO / 256↔512GB).
  // Al elegir una cambian PRECIO y LINK DE COMPRA; las specs siguen siendo las
  // del primario (ver AlternativeProduct.variants / groupVariants).
  const variants = product.variants ?? [];
  const [activeVariantId, setActiveVariantId] = useState(product.id);
  const activeVariant = variants.find((v) => v.id === activeVariantId) ?? null;
  const eff = {
    id: activeVariant?.id ?? product.id,
    source: activeVariant?.source ?? product.source,
    price_cash: activeVariant ? activeVariant.price_cash : product.price_cash,
    price_installment: activeVariant ? activeVariant.price_installment : product.price_installment,
    installment_count: activeVariant ? activeVariant.installment_count : product.installment_count ?? null,
    url: activeVariant?.url ?? product.url,
    affiliate_url: activeVariant ? activeVariant.affiliate_url : product.affiliate_url,
  };
  const store = storeName(eff.source);
  const pb = priceBlock(eff, paymentMode);

  // Compartir ESTA opción (con la variante elegida) desde los resultados: specs
  // en lenguaje corto + precio + link de compra. Menú nativo en mobile,
  // portapapeles como fallback en desktop.
  async function handleShare() {
    const text = buildSelectionShareText([{ ...product, ...eff }]);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: product.title, text });
        return;
      } catch {
        // usuario canceló o el navegador rechazó → cae al portapapeles
      }
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // sin portapapeles (contexto inseguro) → no hay más fallback silencioso
    }
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  }
  const inBudgetChip = showBudgetFit && !product.out_of_budget;
  const hasBadge = isTopPick || !!product.quality_price_score || !!product.out_of_budget || inBudgetChip;

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
          {inBudgetChip && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 font-brand text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
              <span aria-hidden>✓</span> En tu presupuesto
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

      {/* Selector de variante — casi-duplicados (color / SO / disco) colapsados.
          Cambia precio y link de compra; las specs quedan las del primario. */}
      {variants.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {variants.map((v) => {
            const activeThis = v.id === activeVariantId;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setActiveVariantId(v.id)}
                aria-pressed={activeThis}
                className={`rounded-full border px-2 py-0.5 font-brand text-[11px] font-semibold transition-colors ${
                  activeThis
                    ? "border-gathering-primary-fixed-dim bg-gathering-primary/10 text-gathering-primary-fixed-dim"
                    : "border-gathering-outline-variant text-gathering-on-surface-variant hover:bg-black/5"
                }`}
              >
                {v.label}
                {v.price_cash ? (
                  <span className="ml-1 font-normal opacity-70">{formatPrice(v.price_cash)}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {/* Precio — altura fija y alineado abajo, así todas las tarjetas de una
          fila arrancan el precio a la misma altura sin importar si el título
          de al lado ocupó una o dos líneas. El número grande es la cuota
          mensual si el usuario buscó "en cuotas", si no el contado. */}
      <div className="mb-3 flex min-h-[3rem] flex-col justify-end">
        {pb && (
          <p className="font-brand text-base font-bold text-gathering-primary-fixed-dim">
            {pb.leadAmount}
            <span className="ml-1 font-brand text-xs font-normal text-gathering-on-surface-variant">
              {pb.leadUnit}
            </span>
          </p>
        )}
        {pb?.sub && <p className="font-brand text-xs font-medium text-gathering-primary">{pb.sub}</p>}
      </div>

      <hr className="mb-3 border-t border-gathering-outline-variant" />

      <SpecHighlightsSimple highlights={specs} values={specValues} />

      <ExtraFacts facts={facts} />

      {/* "A futuro": qué se puede cambiar después y qué viene fijo — convierte
          las specs en estrategia de compra. Determinístico (getUpgradeNote),
          calculado en el conversor a AlternativeProduct. */}
      {product.upgrade_note && (
        <div className="mb-3 flex gap-1.5 rounded-md bg-gathering-surface-container-highest/40 px-2.5 py-2 font-brand text-[11px] leading-snug text-gathering-on-surface-variant">
          <span
            className="material-symbols-outlined mt-px shrink-0 text-[14px] text-gathering-primary-fixed-dim"
            aria-hidden
          >
            upgrade
          </span>
          <span className="min-w-0">{product.upgrade_note}</span>
        </div>
      )}

      {/* Acciones — siempre pegadas abajo del todo (mt-auto), aunque la
          tarjeta de al lado tenga más contenido arriba. */}
      <div className="mt-auto flex flex-col gap-2">
        <a
          href={eff.affiliate_url ?? eff.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            fetch(withBasePath(`/api/products/${eff.id}/click`), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ searchShareToken, sessionId, visitId: getOrCreateVisitId().id }),
            }).catch(() => {});
          }}
          className="gathering-btn-primary-gradient flex items-center justify-center gap-2 rounded-full py-2.5 text-center font-brand text-xs font-semibold text-white active:scale-[0.97]"
        >
          <StoreLogo source={eff.source} />
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
          productId={eff.id}
          productTitle={product.title}
          current={{
            source: eff.source,
            price_cash: eff.price_cash,
            price_installment: eff.price_installment,
            installment_count: eff.installment_count,
            url: eff.url,
            affiliate_url: eff.affiliate_url,
          }}
          onCompareAdd={onCompareAdd}
          comparedIds={comparedIds}
          triggerClassName="flex w-full items-center justify-center gap-1 rounded-full border border-gathering-outline-variant py-1.5 font-brand text-xs font-semibold text-gathering-on-surface-variant transition-colors hover:bg-black/5 active:scale-[0.97]"
        />
        <button
          type="button"
          onClick={handleShare}
          className="flex w-full items-center justify-center gap-1 rounded-full border border-gathering-outline-variant py-1.5 font-brand text-xs font-semibold text-gathering-on-surface-variant transition-colors hover:bg-black/5 active:scale-[0.97]"
        >
          <span className="material-symbols-outlined text-[16px]">{shared ? "check" : "share"}</span>
          {shared ? "¡Copiado!" : "Compartir opción"}
        </button>
      </div>
    </article>
  );
}
