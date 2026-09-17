"use client";

import { useEffect, useRef, useState } from "react";
import { OtherStoresButton } from "./OtherStoresButton";
import { SpecTermPopover } from "./SpecTermPopover";
import {
  extraCardFacts,
  shortSpecValues,
  translationStrip,
  type CardFact,
  type TranslationChip,
} from "@/lib/domain/specExplainer";
import type { ProductCategory } from "@/types";
import { buildSelectionShareText } from "@/lib/domain/shareSelection";
import { LEVEL_DOT } from "./SpecHighlights";
import { withBasePath } from "@/lib/basePath";
import { getOrCreateVisitId } from "@/lib/analytics/visit";
import { trackEvent } from "@/lib/analytics/track";
import { formatPrice, storeLogoUrl, storeName } from "@/lib/domain/productDisplay";
import type { AlternativeProduct } from "@/types";

// Tarjeta de producto — foto cuadrada arriba, marca+título, precio siempre
// alineado en la misma altura entre tarjetas (para que una fila de 3-4 quede
// prolija aunque un título sea más corto que otro), specs en lista vertical,
// y las acciones ancladas abajo del todo con "mt-auto". Estructura pedida
// explícitamente por el usuario (mockup HTML de referencia).

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
  // El chat identificó esta tarjeta como la respuesta a una pregunta puntual
  // ("¿cuál tiene más RAM?") — hace scroll hasta ella y la resalta hasta que
  // el usuario busca/pregunta otra cosa (ver page.tsx/handleSpotlightProduct).
  spotlight?: boolean;
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
  // Jugada #11: "Consultar sobre este equipo" — abre el chat con una pregunta
  // ya redactada sobre este producto, sin que el usuario tenga que describirlo.
  onAskAbout?: (product: AlternativeProduct) => void;
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

// Opción B (mockup aprobado por el usuario): UNA fila compacta por spec —
// punto semáforo + etiqueta funcional (con popover de glosario, jugada #7) +
// valor crudo + veredicto de 1-2 palabras. Antes la tarjeta apilaba la tira de
// traducción + las frases completas + los datos físicos + el recuadro "a
// futuro": el mismo texto se repetía en cada resultado y se leía como un muro.
// Las frases largas (el "por qué" completo) viven ahora en "Ver detalles".
function shortFact(text: string): string {
  // De "como una botella de agua de 1½ litro, peso normal para una notebook"
  // queda solo la comparación corta para la fila.
  return text.split(",")[0].trim();
}

function SpecRows({
  chips,
  values,
  facts,
  category,
}: {
  chips: TranslationChip[];
  values: Record<string, string>;
  facts: CardFact[];
  category: ProductCategory;
}) {
  const screen = facts.find((f) => f.label === "Pantalla");
  const weight = facts.find((f) => f.label === "Peso");

  const rows: {
    label: string;
    value?: string;
    say: string;
    level: TranslationChip["level"] | "neutral";
  }[] = chips.map((c) => ({
    label: c.label,
    value: values[c.label.toLowerCase()],
    say: c.word,
    level: c.level,
  }));
  if (screen) rows.push({ label: "Pantalla", value: screen.value, say: shortFact(screen.text), level: "neutral" });
  if (weight) rows.push({ label: "Peso", value: weight.value, say: shortFact(weight.text), level: "neutral" });

  if (rows.length === 0) return null;

  return (
    <ul className="mb-3 flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="flex gap-2 font-brand text-xs leading-snug">
          <span
            className={`mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full ${
              r.level === "neutral" ? "bg-gathering-outline-variant" : LEVEL_DOT[r.level]
            }`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            {/* Etiqueta en columna de ancho fijo para que los chips de valor
                gris queden alineados verticalmente entre filas. El veredicto
                va en la 2ª línea pegado a la izquierda (bajo la etiqueta, no
                bajo el chip) — pedido del usuario en test en vivo. */}
            <div className="flex items-center gap-1.5">
              <span className="flex w-[5.5rem] shrink-0 items-center">
                <SpecTermPopover
                  category={category}
                  label={r.label}
                  variant="chip"
                  className="text-[11px] font-bold uppercase tracking-wide text-gathering-on-surface"
                />
              </span>
              {r.value && (
                <span className="rounded bg-gathering-surface-container-highest px-1.5 py-px text-[10px] font-bold text-gathering-on-surface">
                  {r.value}
                </span>
              )}
            </div>
            <span className="mt-px block leading-tight text-gathering-on-surface-variant">{r.say}</span>
          </div>
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
  spotlight,
  onViewDetails,
  searchShareToken,
  sessionId,
  onCompareToggle,
  onCompareAdd,
  comparedIds,
  onAskAbout,
  paymentMode = "cash",
  isCompared,
  compareDisabled,
  showBudgetFit,
}: ProductChatCardProps) {
  const specValues = product.specs
    ? shortSpecValues(product.category, product.specs, product.title)
    : {};
  const facts = product.specs ? extraCardFacts(product.category, product.specs, product.title) : [];
  const stripChips = product.specs
    ? translationStrip(product.category, product.specs, [], product.title)
    : [];
  const [shared, setShared] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  // Mini galería de la publicación — VTEX/Fravega suelen traer varias fotos
  // reales por producto (hasta 20+), ML solo una. `images` es opcional
  // (algunos conversores todavía no lo llenan) y puede venir vacío o repetir
  // la de `image_url` — se arma un set único con esa como primera.
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

  useEffect(() => {
    if (spotlight) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [spotlight]);

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

  // "Más barato en X" inline (jugada #10): cuando el mismo equipo aparece en
  // otra tienda por menos, se muestra acá — no solo detrás del botón "En otras
  // tiendas". `also_at` viene ordenado por precio ascendente desde el pipeline.
  const cheaperElsewhere = (() => {
    const base = eff.price_cash;
    if (!base || !product.also_at?.length) return null;
    const hit = product.also_at.find(
      (v) => v.price_cash != null && v.price_cash < base && v.source !== eff.source
    );
    if (!hit || hit.price_cash == null) return null;
    return { store: storeName(hit.source), price: hit.price_cash, delta: base - hit.price_cash };
  })();

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
  const hasBadge =
    isTopPick || !!product.quality_price_score || !!product.out_of_budget || inBudgetChip || !!product.sponsored;

  return (
    <article
      ref={cardRef}
      className={`group relative flex h-full flex-col gathering-glass-card rounded-lg p-4 transition-colors ${justSent ? "animate-card-glow" : ""} ${
        isTopPick
          ? "border-2 border-amber-400/70 bg-amber-50/60 shadow-[0_4px_14px_rgba(180,83,9,0.15)]"
          : ""
      } ${isSelected ? "border-gathering-primary-fixed-dim ring-2 ring-gathering-primary/20" : ""} ${
        // Índigo (el mismo acento que el botón del chat/gathering-primary),
        // grueso (ring-4) y sólido para distinguirse del ring-2 fino al 20%
        // de opacidad que usa isSelected — y distinto del ámbar de "Mejor
        // opción"/badges (en una top-pick, un resaltado ámbar quedaba
        // indistinguible, bug reportado en vivo). spotlight-pulse (ver
        // tailwind.config) pulsa indefinidamente hasta la próxima consulta.
        spotlight ? "z-10 animate-spotlight-pulse ring-4 ring-[#3452E1] ring-offset-2 ring-offset-gathering-background" : ""
      }`}
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
          {product.sponsored && (
            <span
              title="Esta tienda patrocina este rubro. Solo aparece más arriba si el producto es relevante para tu búsqueda."
              className="flex cursor-help items-center rounded-full bg-amber-100 px-2.5 py-1 font-brand text-[10px] font-semibold uppercase tracking-wider text-amber-700 shadow-sm"
            >
              Patrocinado
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
        {currentImage ? (
          <img
            key={currentImage}
            src={withBasePath(`/api/img?url=${encodeURIComponent(currentImage)}`)}
            alt={product.title}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="material-symbols-outlined text-4xl text-gathering-outline-variant">image</span>
        )}
        {/* Mini galería — flechas + contador, solo si la publicación trae más
            de una foto real. Siempre visibles (no solo al hover) para que
            funcionen igual de bien en mobile, que no tiene hover. */}
        {gallery.length > 1 && (
          <>
            <button
              type="button"
              onClick={showPrevImage}
              aria-label="Foto anterior"
              className="absolute left-1.5 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-gathering-on-surface shadow-sm hover:bg-white"
            >
              <span className="material-symbols-outlined text-sm">chevron_left</span>
            </button>
            <button
              type="button"
              onClick={showNextImage}
              aria-label="Foto siguiente"
              className="absolute right-1.5 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-gathering-on-surface shadow-sm hover:bg-white"
            >
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
            <span className="absolute bottom-1.5 right-1.5 z-10 rounded-full bg-black/55 px-1.5 py-0.5 font-brand text-[10px] font-semibold text-white">
              {imgIndex + 1}/{gallery.length}
            </span>
          </>
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

      {cheaperElsewhere && (
        <p className="mb-3 flex items-center gap-1 font-brand text-[11px] font-semibold text-emerald-700">
          <span className="material-symbols-outlined text-[13px]" aria-hidden>
            sell
          </span>
          También en {cheaperElsewhere.store}: {formatPrice(cheaperElsewhere.price)}
          <span className="font-medium opacity-80">(−{formatPrice(cheaperElsewhere.delta)})</span>
        </p>
      )}

      {product.price_verdict && (
        <p
          className={`mb-3 flex items-center gap-1 font-brand text-[11px] font-medium ${
            product.price_verdict.startsWith("Buen precio")
              ? "text-emerald-700"
              : product.price_verdict.startsWith("Precio alto")
                ? "text-amber-700"
                : "text-gathering-on-surface-variant"
          }`}
        >
          <span className="material-symbols-outlined text-[13px]" aria-hidden>
            monitoring
          </span>
          {product.price_verdict}
        </p>
      )}

      <hr className="mb-3 border-t border-gathering-outline-variant" />

      <SpecRows
        chips={stripChips}
        values={specValues}
        facts={facts}
        category={product.category}
      />

      {/* "A futuro": qué se puede cambiar después y qué viene fijo — una línea,
          sin recuadro (Opción B). Se recorta a la primera oración: el detalle
          largo (caveats de nube, etc.) queda para "Ver detalles". */}
      {product.upgrade_note && (
        <p className="mb-3 flex gap-1.5 font-brand text-[11px] leading-snug text-gathering-on-surface-variant">
          <span
            className="material-symbols-outlined shrink-0 text-[13px] text-gathering-primary-fixed-dim"
            aria-hidden
          >
            upgrade
          </span>
          <span className="min-w-0">{product.upgrade_note.split(/[.:]\s|\s[—–]\s/)[0]}</span>
        </p>
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
            // Jugada #17: registrar el click de compra contra si el equipo fue
            // recomendado (topPick) y en qué puesto — para medir de verdad la
            // conversión "recomendado → comprado", no solo el conteo de clicks.
            trackEvent("product_buy_click", getOrCreateVisitId().id, {
              productId: eff.id,
              metadata: {
                recommended: !!isTopPick,
                rank: pickRank ?? null,
                shareToken: searchShareToken ?? null,
                variantOfId: activeVariant ? product.id : null,
              },
            });
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
        {onAskAbout && (
          // Distinta del resto (fondo lleno en vez de outline gris) — pedido
          // en vivo 2026-09-11: pasaba desapercibido entre "En otras
          // tiendas"/"Compartir opción", que son acciones secundarias; esta
          // es la puerta de entrada al chat sobre ESTE equipo puntual, va
          // primero.
          <button
            type="button"
            onClick={() => onAskAbout(product)}
            className="flex w-full items-center justify-center gap-1 rounded-full bg-gathering-primary-fixed-dim py-1.5 font-brand text-xs font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.97]"
          >
            <span className="material-symbols-outlined text-[16px]">chat</span>
            Preguntar sobre este equipo
          </button>
        )}
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
