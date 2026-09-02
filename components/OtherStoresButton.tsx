"use client";

import { useState } from "react";
import { Portal } from "./Portal";
import { withBasePath } from "@/lib/basePath";
import { formatPrice, storeLogoUrl, storeName } from "@/lib/domain/productDisplay";
import type { ProductStoreVariant, SimilarStoreVariant } from "@/types";

// Botón + modal reusado en las 3 vistas donde puede aparecer el mismo
// producto listado en más de una tienda (ProductChatCard, ProductCard,
// ProductCompareCard). Siempre visible — a diferencia de la versión
// anterior (que solo aparecía si `also_at` ya venía calculado desde el pool
// de esa búsqueda puntual), esto busca en vivo contra todo el catálogo al
// tocar el botón, así el usuario siempre puede intentar comparar precios de
// la misma máquina, no solo cuando la búsqueda tuvo la suerte de agrupar el
// duplicado sola.

interface CurrentStore {
  source: string;
  price_cash: number | null;
  price_installment: number | null;
  installment_count: number | null;
  url: string;
  affiliate_url: string | null;
}

interface StoreOption extends CurrentStore {
  isCurrent: boolean;
}

interface OtherStoresButtonProps {
  productId: string;
  productTitle: string;
  current: CurrentStore;
  triggerClassName?: string;
  onLinkClick?: (source: string) => void;
  // Jugada #5: "modelos parecidos" seleccionables. Si se pasa, cada parecido
  // muestra "+ Comparar" y hay checkboxes + "Comparar seleccionados". `ids`
  // ya incluye el productId actual (para que el comparador lo tenga al lado).
  onCompareAdd?: (ids: string[], open?: boolean) => void;
  comparedIds?: string[];
}

function StoreLogo({ source }: { source: string }) {
  const [failed, setFailed] = useState(false);
  const url = storeLogoUrl(source);
  if (!url || failed) return null;
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      className="h-6 w-8 shrink-0 rounded bg-white object-contain p-0.5"
      onError={() => setFailed(true)}
    />
  );
}

type FetchState = "idle" | "loading" | "done" | "error";

export function OtherStoresButton({ productId, productTitle, current, triggerClassName, onLinkClick, onCompareAdd, comparedIds }: OtherStoresButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FetchState>("idle");
  const [variants, setVariants] = useState<ProductStoreVariant[]>([]);
  const [similar, setSimilar] = useState<SimilarStoreVariant[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const comparedSet = new Set(comparedIds ?? []);
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function handleOpen() {
    setOpen(true);
    if (state === "loading" || state === "done") return;
    setState("loading");
    try {
      const res = await fetch(withBasePath(`/api/products/${productId}/other-stores`));
      if (!res.ok) throw new Error("request failed");
      const data = (await res.json()) as {
        variants: ProductStoreVariant[];
        similar?: SimilarStoreVariant[];
      };
      setVariants(data.variants);
      setSimilar(data.similar ?? []);
      setState("done");
    } catch {
      setState("error");
    }
  }

  const options: StoreOption[] = [
    { ...current, isCurrent: true },
    ...variants.map((v) => ({ ...v, isCurrent: false })),
  ].sort((a, b) => (a.price_cash ?? Infinity) - (b.price_cash ?? Infinity));

  const cheapest = options[0];
  const savings =
    cheapest.price_cash != null && current.price_cash != null && cheapest.price_cash < current.price_cash
      ? current.price_cash - cheapest.price_cash
      : 0;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={
          triggerClassName ??
          "flex items-center gap-1.5 rounded-full border border-gathering-outline-variant px-3 py-1.5 font-brand text-xs font-semibold text-gathering-primary-fixed-dim transition-colors hover:bg-gathering-primary/10"
        }
      >
        <span className="material-symbols-outlined text-[15px]">storefront</span>
        En otras tiendas
      </button>

      {open && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />
            <div className="relative z-10 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-gathering-surface-container p-4 shadow-2xl sm:rounded-2xl">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-brand text-[11px] font-semibold uppercase tracking-wide text-gathering-on-surface-variant">
                    Comparar precios
                  </p>
                  <h3 className="line-clamp-2 font-brand text-sm font-bold text-gathering-on-surface">{productTitle}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar"
                  className="shrink-0 text-gathering-on-surface-variant hover:text-gathering-on-surface"
                >
                  ✕
                </button>
              </div>

              {state === "loading" && (
                <div className="flex items-center justify-center gap-2 py-8 font-brand text-xs text-gathering-on-surface-variant">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-gathering-outline-variant border-t-gathering-primary-fixed-dim" />
                  Buscando en otras tiendas...
                </div>
              )}

              {state === "error" && (
                <p className="py-6 text-center font-brand text-xs text-gathering-on-surface-variant">
                  No pudimos buscar en otras tiendas ahora. Probá de nuevo en un momento.
                </p>
              )}

              {state === "done" && variants.length === 0 && similar.length === 0 && (
                <p className="py-6 text-center font-brand text-xs text-gathering-on-surface-variant">
                  No encontramos este producto en otra tienda por ahora.
                </p>
              )}

              {state === "done" && variants.length === 0 && similar.length > 0 && (
                <p className="mb-3 font-brand text-xs text-gathering-on-surface-variant">
                  No está el mismo modelo en otra tienda, pero hay variantes parecidas.
                </p>
              )}

              {(state === "done" && variants.length > 0) && (
                <>
                  {savings > 0 && (
                    <p className="mb-3 font-brand text-xs font-semibold text-emerald-600">
                      Ahorrás {formatPrice(savings)} eligiendo la opción más barata
                    </p>
                  )}
                  <ul className="space-y-2">
                    {options.map((opt) => {
                      const isCheapest =
                        !opt.isCurrent &&
                        opt.price_cash != null &&
                        current.price_cash != null &&
                        opt.price_cash < current.price_cash;
                      return (
                        <li
                          key={opt.source}
                          className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                            opt.isCurrent ? "border-gathering-primary-fixed-dim bg-gathering-primary/5" : "border-gathering-outline-variant/50"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <StoreLogo source={opt.source} />
                            <div className="min-w-0">
                              <p className="truncate font-brand text-xs font-semibold text-gathering-on-surface">{storeName(opt.source)}</p>
                              {opt.isCurrent && (
                                <p className="font-brand text-[10px] text-gathering-primary-fixed-dim">Estás viendo esta</p>
                              )}
                              {isCheapest && <p className="font-brand text-[10px] font-semibold text-emerald-600">Más barato</p>}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <div className="text-right">
                              {opt.price_cash ? (
                                <p className="font-brand text-sm font-bold text-gathering-on-surface">{formatPrice(opt.price_cash)}</p>
                              ) : opt.price_installment ? (
                                <p className="font-brand text-sm font-bold text-gathering-on-surface">{formatPrice(opt.price_installment)}/mes</p>
                              ) : (
                                <p className="font-brand text-sm text-gathering-on-surface-variant">—</p>
                              )}
                              {opt.price_cash != null && opt.price_installment && opt.installment_count ? (
                                <p className="font-brand text-[10px] text-gathering-on-surface-variant">
                                  {formatPrice(opt.price_installment)}/mes x{opt.installment_count}
                                </p>
                              ) : null}
                            </div>
                            <a
                              href={opt.affiliate_url ?? opt.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => onLinkClick?.(opt.source)}
                              className="gathering-btn-primary-gradient shrink-0 rounded-full px-3 py-1.5 font-brand text-xs font-semibold text-white"
                            >
                              Ver
                            </a>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {state === "done" && similar.length > 0 && (
                <div className={variants.length > 0 ? "mt-5 border-t border-gathering-outline-variant/50 pt-4" : ""}>
                  <p className="mb-1 font-brand text-[11px] font-semibold uppercase tracking-wide text-gathering-on-surface-variant">
                    Modelos parecidos
                  </p>
                  <p className="mb-3 font-brand text-[11px] text-gathering-on-surface-variant">
                    Misma línea, con diferencias en las características. No es exactamente el mismo equipo.
                  </p>
                  <ul className="space-y-2">
                    {similar.map((opt) => {
                      const inCompare = comparedSet.has(opt.id);
                      const isChecked = selected.has(opt.id);
                      return (
                        <li
                          key={opt.id}
                          className="rounded-xl border border-gathering-outline-variant/50 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              {onCompareAdd && (
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleSelected(opt.id)}
                                  aria-label={`Seleccionar ${opt.title} para comparar`}
                                  className="h-4 w-4 shrink-0 accent-gathering-primary-fixed-dim"
                                />
                              )}
                              <StoreLogo source={opt.source} />
                              <p className="truncate font-brand text-xs font-semibold text-gathering-on-surface">{storeName(opt.source)}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <div className="text-right">
                                {opt.price_cash ? (
                                  <p className="font-brand text-sm font-bold text-gathering-on-surface">{formatPrice(opt.price_cash)}</p>
                                ) : opt.price_installment ? (
                                  <p className="font-brand text-sm font-bold text-gathering-on-surface">{formatPrice(opt.price_installment)}/mes</p>
                                ) : (
                                  <p className="font-brand text-sm text-gathering-on-surface-variant">—</p>
                                )}
                                {opt.price_cash != null && opt.price_installment && opt.installment_count ? (
                                  <p className="font-brand text-[10px] text-gathering-on-surface-variant">
                                    {formatPrice(opt.price_installment)}/mes x{opt.installment_count}
                                  </p>
                                ) : null}
                              </div>
                              <a
                                href={opt.affiliate_url ?? opt.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => onLinkClick?.(opt.source)}
                                className="shrink-0 rounded-full border border-gathering-outline-variant px-3 py-1.5 font-brand text-xs font-semibold text-gathering-primary-fixed-dim"
                              >
                                Ver
                              </a>
                            </div>
                          </div>
                          <p className="mt-2 line-clamp-1 font-brand text-[11px] text-gathering-on-surface-variant">{opt.title}</p>
                          {opt.differences.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {opt.differences.map((d) => (
                                <span
                                  key={d}
                                  className="rounded-full bg-gathering-surface-container-high px-2 py-0.5 font-brand text-[10px] text-gathering-on-surface-variant"
                                >
                                  {d}
                                </span>
                              ))}
                            </div>
                          )}
                          {onCompareAdd && (
                            <button
                              type="button"
                              disabled={inCompare}
                              onClick={() => onCompareAdd([productId, opt.id])}
                              className="mt-2 flex items-center gap-1 rounded-full border border-gathering-outline-variant px-2.5 py-1 font-brand text-[11px] font-semibold text-gathering-primary-fixed-dim transition-colors hover:bg-gathering-primary/10 disabled:opacity-40"
                            >
                              <span className="material-symbols-outlined text-[14px]">{inCompare ? "check" : "add"}</span>
                              {inCompare ? "En comparación" : "Comparar"}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {onCompareAdd && selected.size > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onCompareAdd([productId, ...Array.from(selected)], true);
                        setSelected(new Set());
                        setOpen(false);
                      }}
                      className="gathering-btn-primary-gradient mt-3 w-full rounded-full py-2 font-brand text-xs font-semibold text-white"
                    >
                      Comparar seleccionados ({selected.size})
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
