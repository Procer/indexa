"use client";

import { useEffect, useState } from "react";
import { SponsoredBadge } from "./SponsoredBadge";
import { PriceHistorySparkline } from "./PriceHistorySparkline";
import { SpecHighlights, type SpecDisplayMode, type PracticeFact } from "./SpecHighlights";
import { OtherStoresButton } from "./OtherStoresButton";
import { getUpgradeNote } from "@/lib/domain/upgradeability";
import { getAlertContact, saveAlertContact } from "@/lib/storage/localStorage";
import { withBasePath } from "@/lib/basePath";
import { getOrCreateVisitId } from "@/lib/analytics/visit";
import { SOURCE_NAMES, formatPrice } from "@/lib/domain/productDisplay";
import type { EnrichedProduct, NotebookSpecs, QualityPriceScore } from "@/types";

interface ProductCardProps {
  product: EnrichedProduct;
  onCompareToggle: (product: EnrichedProduct) => void;
  isCompared: boolean;
  compareDisabled: boolean;
  searchShareToken?: string;
  sessionId?: string;
  specMode?: SpecDisplayMode;
  // "En la práctica": datos físicos llanos, renderizados dentro de la sección
  // "Por qué te conviene" (usado por ProductDetailPanel).
  practiceFacts?: PracticeFact[];
}

const SCORE_STYLES: Record<QualityPriceScore, { dot: string; label: string }> = {
  EXCELENTE: { dot: "bg-emerald-400", label: "Excelente calidad/precio" },
  "MUY BUENO": { dot: "bg-gathering-primary-fixed-dim", label: "Muy bueno calidad/precio" },
  BUENO: { dot: "bg-amber-400", label: "Bueno calidad/precio" },
  REGULAR: { dot: "bg-gathering-outline", label: "Regular calidad/precio" },
};

function getSpecParts(product: EnrichedProduct): string[] {
  const s = product.specs as Record<string, unknown>;

  if (product.category === "tv") {
    const parts: string[] = [];
    if (s.screen_inches) parts.push(`${s.screen_inches}"`);
    if (s.resolution)    parts.push(String(s.resolution));
    if (s.panel_type)    parts.push(String(s.panel_type));
    if (s.refresh_rate_hz && Number(s.refresh_rate_hz) > 60) parts.push(`${s.refresh_rate_hz}Hz`);
    return parts;
  }
  if (product.category === "tablet") {
    const parts: string[] = [];
    if (s.ram_gb)        parts.push(`${s.ram_gb}GB RAM`);
    if (s.storage_gb)    parts.push(`${s.storage_gb}GB`);
    if (s.screen_inches) parts.push(`${s.screen_inches}"`);
    return parts;
  }
  if (product.category === "phone") {
    const parts: string[] = [];
    if (s.processor_model) parts.push(String(s.processor_model).toUpperCase());
    if (s.ram_gb)           parts.push(`${s.ram_gb}GB RAM`);
    if (s.storage_gb)       parts.push(`${s.storage_gb}GB`);
    return parts;
  }
  const nb = s as Partial<NotebookSpecs>;
  const parts: string[] = [];
  if (nb.processor_model) parts.push(nb.processor_model.toUpperCase());
  if (nb.ram_gb)          parts.push(`${nb.ram_gb}GB RAM`);
  if (nb.storage_gb) {
    const t = nb.storage_type === "SSD_NVME" ? "SSD NVMe" : nb.storage_type === "HDD" ? "HDD" : "SSD";
    parts.push(`${t} ${nb.storage_gb}GB`);
  }
  return parts;
}

type AlertStatus = "idle" | "open" | "loading" | "saved" | "error";

export function ProductCard({ product, onCompareToggle, isCompared, compareDisabled, searchShareToken, sessionId, specMode, practiceFacts }: ProductCardProps) {
  const scoreStyle = product.quality_price_score ? SCORE_STYLES[product.quality_price_score] : null;
  const defaultTarget = product.price_cash ? Math.round(product.price_cash * 0.9) : 0;
  const upgradeNote = getUpgradeNote(product.category, product.specs, product.upgradeable);
  const [alertStatus, setAlertStatus] = useState<AlertStatus>("idle");
  const [targetPrice, setTargetPrice] = useState(String(defaultTarget));
  const [alertEmail, setAlertEmail] = useState("");
  const [alertError, setAlertError]   = useState("");
  const [manageToken, setManageToken] = useState<string | null>(null);

  useEffect(() => {
    const contact = getAlertContact();
    if (contact) {
      setAlertEmail(contact.email);
      setManageToken(contact.manage_token);
    }
  }, []);

  async function handleAlertSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(targetPrice);
    const email = alertEmail.trim();
    if (!price || price <= 0 || !email) return;
    setAlertStatus("loading");
    setAlertError("");
    const res = await fetch(withBasePath("/api/alerts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: product.id, target_price: price, email }),
    });
    if (res.ok) {
      const data = (await res.json()) as { manage_token: string };
      setManageToken(data.manage_token);
      saveAlertContact({ email, manage_token: data.manage_token });
      setAlertStatus("saved");
    } else {
      const body = (await res.json()) as { error?: string };
      setAlertError(body.error ?? "Error al guardar la alerta");
      setAlertStatus("error");
    }
  }

  const storeName = SOURCE_NAMES[product.source] ?? product.source;
  const specParts = getSpecParts(product);

  const priceLine = product.price_cash
    ? `${formatPrice(product.price_cash)} contado`
    : product.price_installment && product.installment_count
    ? `${formatPrice(product.price_installment)}/mes en ${product.installment_count} ${product.installment_count === 1 ? "cuota" : "cuotas"}`
    : "";
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(
    `Mirá esto que encontré en indexa.com.ar: ${product.title}${priceLine ? ` — ${priceLine}` : ""}\n${product.affiliate_url ?? product.url}`
  )}`;

  return (
    <article className="flex flex-col gap-4">
      {/* ── Imagen ── */}
      {/* Las fotos de producto vienen con fondo blanco de fábrica — en vez de
          que ese blanco choque directo contra el panel oscuro, se enmarca en
          su propia "tarjeta" clara con esquinas redondeadas, así se lee como
          una foto de producto sobre el panel, no como una caja sin tematizar. */}
      {product.image_url && (
        <div className="relative flex h-56 w-full items-center justify-center overflow-hidden rounded-xl border border-gathering-outline-variant/30 bg-gathering-surface-container-highest/30 p-5 lg:h-72">
          <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-gathering-primary/10 blur-[60px]" aria-hidden="true" />
          <div className="relative z-10 flex h-full w-full items-center justify-center rounded-lg bg-white p-4 shadow-xl">
            <img
              src={withBasePath(`/api/img?url=${encodeURIComponent(product.image_url)}`)}
              alt={product.title}
              className="h-full w-full object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        </div>
      )}

      {/* ── Todo el contenido abajo ── */}
      <div className="flex flex-1 flex-col gap-4">
        {product.is_sponsored && <SponsoredBadge />}

        {/* Título + etiquetas */}
        <div>
          <h3 className="font-brand text-2xl font-bold leading-snug text-gathering-on-surface">{product.title}</h3>
          {specParts.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {specParts.map((spec) => (
                <span
                  key={spec}
                  className="rounded-full border border-gathering-outline-variant bg-gathering-surface-variant px-3 py-1.5 font-brand text-xs font-medium text-gathering-on-surface-variant"
                >
                  {spec}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Precio */}
        <div className="space-y-1.5 rounded-xl border border-gathering-outline-variant/50 bg-gathering-surface-container-low p-5">
          {product.price_installment && product.installment_count ? (
            <>
              <p className="font-brand text-3xl font-bold text-gathering-primary">
                {formatPrice(product.price_installment)}
                <span className="ml-1.5 font-brand text-base font-normal text-gathering-on-surface-variant">/ mes</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-brand text-sm text-gathering-on-surface">
                  {product.installment_count} {product.installment_count === 1 ? "cuota" : "cuotas"}
                </span>
                {product.installment_info?.toLowerCase().includes("sin inter") && (
                  <span className="rounded border border-emerald-600/30 bg-emerald-600/10 px-2 py-0.5 font-brand text-xs font-semibold text-emerald-700">
                    sin interés
                  </span>
                )}
                {(() => {
                  const info = product.installment_info ?? "";
                  const cards = ["Visa", "Mastercard", "Naranja X", "CMR", "American Express"];
                  const card = cards.find(c => info.includes(c));
                  return card ? (
                    <span className="font-brand text-xs text-gathering-on-surface-variant">{card}</span>
                  ) : null;
                })()}
              </div>
              {product.price_cash && (
                <p className="font-brand text-base text-gathering-on-surface-variant">
                  <span className="font-bold text-gathering-on-surface">{formatPrice(product.price_cash)}</span> contado
                </p>
              )}
            </>
          ) : product.price_cash ? (
            <p className="font-brand text-3xl font-bold text-gathering-primary">
              {formatPrice(product.price_cash)}
              <span className="ml-2 text-base font-normal text-gathering-on-surface-variant">contado</span>
            </p>
          ) : null}
          <PriceHistorySparkline productId={product.id} />
          <OtherStoresButton
            productId={product.id}
            productTitle={product.title}
            current={{
              source: product.source,
              price_cash: product.price_cash,
              price_installment: product.price_installment,
              installment_count: product.installment_count,
              url: product.url,
              affiliate_url: product.affiliate_url,
            }}
          />
        </div>

        {/* Badge calidad/precio */}
        {scoreStyle && (
          <div className="flex w-fit items-center gap-2 rounded-full border border-gathering-outline-variant/50 bg-gathering-surface-variant/30 px-3 py-1.5">
            <div className={`h-2 w-2 rounded-full ${scoreStyle.dot}`} />
            <span className="font-brand text-sm text-gathering-on-surface-variant">{scoreStyle.label}</span>
          </div>
        )}

        {/* Especificaciones explicadas en lenguaje simple: scorecard visual con detalle técnico opcional */}
        <SpecHighlights
          highlights={product.spec_highlights_simple ?? []}
          technicalHighlights={product.spec_highlights}
          mode={specMode}
          practiceFacts={practiceFacts}
          practiceCategory={product.category}
        />

        {/* A futuro: qué se puede mejorar más adelante y qué no (determinístico, ver lib/domain/upgradeability.ts) */}
        {upgradeNote && (
          <div className="flex gap-1.5 rounded-lg border-l-2 border-gathering-primary-fixed-dim bg-gathering-surface-variant/30 px-2.5 py-2 font-brand text-xs text-gathering-on-surface-variant">
            <span className="shrink-0">🔄</span>
            <p className="leading-relaxed">{upgradeNote}</p>
          </div>
        )}

        {/* Alert panel */}
        {(alertStatus === "open" || alertStatus === "loading" || alertStatus === "error") ? (
          <form onSubmit={handleAlertSubmit} className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-50 p-3">
            <p className="font-brand text-xs font-medium text-amber-800">Avisame por email cuando baje de:</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-brand text-sm text-gathering-on-surface-variant">$</span>
                <input
                  type="number" value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  min={1} required
                  className="w-full rounded-xl border border-amber-400/30 bg-gathering-surface pl-6 pr-3 py-2 font-brand text-sm text-gathering-on-surface outline-none focus:border-amber-400"
                />
              </div>
              <button type="button" onClick={() => setAlertStatus("idle")}
                className="shrink-0 rounded-xl border border-gathering-outline-variant px-2 font-brand text-sm text-gathering-on-surface-variant hover:bg-black/5">✕</button>
            </div>
            <div className="flex gap-2">
              <input
                type="email" value={alertEmail}
                onChange={(e) => setAlertEmail(e.target.value)}
                placeholder="tu@email.com" required
                className="w-full flex-1 rounded-xl border border-amber-400/30 bg-gathering-surface px-3 py-2 font-brand text-sm text-gathering-on-surface outline-none focus:border-amber-400"
              />
              <button type="submit" disabled={alertStatus === "loading"}
                className="shrink-0 rounded-xl bg-amber-700 px-3 py-2 font-brand text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60">
                {alertStatus === "loading" ? "..." : "Activar"}
              </button>
            </div>
            {alertStatus === "error" && <p className="font-brand text-xs text-gathering-error">{alertError}</p>}
          </form>
        ) : alertStatus === "saved" ? (
          <div className="flex flex-col gap-1.5 rounded-2xl bg-emerald-600/10 px-3 py-2.5 font-brand text-sm text-emerald-700">
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>Te avisamos por email cuando baje de ${Number(targetPrice).toLocaleString("es-AR")}</span>
              <button type="button" onClick={() => setAlertStatus("idle")} className="ml-auto shrink-0 text-emerald-700">✕</button>
            </div>
            {manageToken && (
              <a href={withBasePath(`/alertas/${manageToken}`)} className="font-semibold underline hover:text-emerald-800">
                Ver mis alertas
              </a>
            )}
          </div>
        ) : null}

        {/* Acciones */}
        <div className="mt-auto flex items-center gap-2 pt-1">
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
            className="gathering-btn-primary-gradient flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 font-brand text-sm font-semibold text-white active:scale-[0.97]"
          >
            Ver en {storeName}
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
          <button
            type="button"
            onClick={() => setAlertStatus("open")}
            disabled={alertStatus === "saved"}
            title="Alerta de precio"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm transition-all duration-150 active:scale-[0.94] disabled:cursor-not-allowed disabled:active:scale-100 ${
              alertStatus === "saved"
                ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700"
                : "border-amber-600/30 bg-amber-600/10 text-amber-700 hover:bg-amber-600/20"
            }`}
          >
            <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </button>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            title="Compartir por WhatsApp"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-600/30 bg-emerald-600/10 text-emerald-700 transition-all duration-150 hover:bg-emerald-600/20 active:scale-[0.94]"
          >
            <svg className="h-4.5 w-4.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path fillRule="evenodd" clipRule="evenodd" d="M12.004 2.003c-5.514 0-9.997 4.483-9.997 9.997 0 1.763.462 3.483 1.34 4.997L2 22l5.116-1.342a9.958 9.958 0 004.888 1.245h.004c5.514 0 9.997-4.483 9.997-9.997 0-2.67-1.04-5.18-2.928-7.069a9.937 9.937 0 00-7.073-2.834zm5.85 15.847c-.685.685-2.267 1.373-3.147 1.51-.804.125-1.756.18-2.833-.178a11.13 11.13 0 01-1.032-.383c-1.816-.78-4.056-2.5-5.72-5.163a10.25 10.25 0 01-1.16-2.24c-.303-.833-.462-1.706-.462-2.55 0-1.98.795-3.303 1.48-3.988a1.68 1.68 0 011.199-.503c.148 0 .297.001.428.008.372.017.558.04.803.628.297.716.968 2.478 1.052 2.658.083.18.14.396.014.635-.124.24-.187.388-.372.596-.186.208-.39.464-.556.622-.186.178-.38.372-.163.729.216.357.96 1.583 2.06 2.564 1.416 1.263 2.61 1.654 2.968 1.842.357.187.567.156.777-.093.21-.248.9-1.05 1.14-1.41.24-.36.48-.297.81-.178.33.119 2.1.99 2.46 1.17.36.18.6.267.687.418.087.15.087.87-.208 1.71z" />
            </svg>
          </a>
          <button
            type="button"
            onClick={() => onCompareToggle(product)}
            disabled={compareDisabled && !isCompared}
            className={`rounded-full border px-4 py-2.5 font-brand text-sm font-medium transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${
              isCompared
                ? "border-gathering-primary-fixed-dim bg-gathering-primary/10 text-gathering-primary-fixed-dim"
                : "gathering-interactive-card text-gathering-on-surface"
            }`}
          >
            {isCompared ? "✓ Comparar" : "+ Comparar"}
          </button>
        </div>
      </div>
    </article>
  );
}
