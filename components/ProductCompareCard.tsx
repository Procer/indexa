"use client";

import { OtherStoresButton } from "@/components/OtherStoresButton";
import { SpecHighlights, type SpecDisplayMode } from "@/components/SpecHighlights";
import { getUpgradeNote } from "@/lib/domain/upgradeability";
import { withBasePath } from "@/lib/basePath";
import { getOrCreateVisitId } from "@/lib/analytics/visit";
import type { CompareItem, NotebookSpecs, PhoneSpecs } from "@/types";

const SOURCE_NAMES: Record<string, string> = {
  fravega:      "Frávega",
  cetrogar:     "Cetrogar",
  musimundo:    "Musimundo",
  garbarino:    "Garbarino",
  compumundo:   "Compumundo",
  megatone:     "Megatone",
  coppel:       "Coppel",
  naldo:        "Naldo",
  jumbo:        "Jumbo",
  carrefour:    "Carrefour",
  oncity:       "On City",
  mercadolibre: "MercadoLibre",
};

function trackClick(productId: string, searchShareToken: string | null) {
  fetch(withBasePath(`/api/products/${productId}/click`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ searchShareToken, visitId: getOrCreateVisitId().id }),
  }).catch(() => {});
}

export function getKeySpecs(item: CompareItem): string[] {
  const s = item.product.specs as Record<string, unknown>;
  const cat = item.product.category;

  if (cat === "phone") {
    const p = s as Partial<PhoneSpecs>;
    const parts: string[] = [];
    if (p.screen_inches && p.screen_type) parts.push(`Pantalla ${p.screen_inches}" ${p.screen_type}`);
    if (p.battery_mah) parts.push(`Batería de ${Number(p.battery_mah).toLocaleString("es-AR")} mAh`);
    if (p.ram_gb) parts.push(`${p.ram_gb}GB de RAM base`);
    return parts;
  }

  const nb = s as Partial<NotebookSpecs>;
  const parts: string[] = [];
  if (nb.screen_inches) parts.push(`Pantalla ${nb.screen_inches}" ${nb.screen_type ?? ""}`.trim());
  if (nb.battery_wh) parts.push(`Batería de ${nb.battery_wh} Wh`);
  if (nb.ram_gb) parts.push(`${nb.ram_gb}GB de RAM`);
  return parts;
}

function CheckCircle({ variant }: { variant: "blue" | "gray" }) {
  return (
    <svg
      className={`mt-0.5 h-4 w-4 shrink-0 ${variant === "blue" ? "text-blue-500" : "text-gray-400"}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

interface ProductCompareCardProps {
  item: CompareItem;
  align?: "left" | "right";
  searchToken?: string | null;
  specMode?: SpecDisplayMode;
}

// Tarjeta de producto reusada tanto en el duelo de 2 (align="right" para el
// segundo producto, mismo layout espejado de siempre) como en la grilla de
// comparaciones de 3-5 productos (siempre align="left").
export function ProductCompareCard({ item, align = "left", searchToken, specMode }: ProductCompareCardProps) {
  const specs = getKeySpecs(item);
  const isRight = align === "right";
  const { product } = item;
  const upgradeNote = getUpgradeNote(product.category, product.specs, product.upgradeable);

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-md">
      {product.image_url && (
        <div className="flex h-44 items-center justify-center bg-gray-50 p-4">
          <img
            src={withBasePath(`/api/img?url=${encodeURIComponent(product.image_url)}`)}
            alt={product.title}
            className="h-full w-full object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
      <div className="p-6">
        <p className={`text-xs font-bold uppercase tracking-widest ${isRight ? "text-right text-gray-400" : "text-blue-500"}`}>
          {product.brand ?? ""}
        </p>
        <h2 className={`mt-1 text-base font-bold leading-snug text-gray-900 ${isRight ? "text-right" : ""}`}>
          {product.title}
        </h2>
        <ul className="mt-4 space-y-2.5">
          {specs.map((spec) => (
            <li key={spec} className="flex items-start gap-2 text-sm text-gray-600">
              <CheckCircle variant={isRight ? "gray" : "blue"} />
              {spec}
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <SpecHighlights
            highlights={item.analysis?.spec_highlights_simple ?? []}
            technicalHighlights={item.analysis?.spec_highlights}
            mode={specMode}
          />
        </div>
        {upgradeNote && (
          <div className="mt-3 flex gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2 text-xs text-gray-500">
            <span className="shrink-0">🔄</span>
            <p className="leading-relaxed">{upgradeNote}</p>
          </div>
        )}
        <div className="mt-3">
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
            triggerClassName="flex w-full items-center justify-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
          />
        </div>
        <a
          href={product.affiliate_url ?? product.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackClick(product.id, searchToken ?? null)}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition-all duration-150 hover:bg-blue-700 hover:shadow-blue-300 active:scale-[0.97] active:shadow-none"
        >
          Ver en {SOURCE_NAMES[product.source] ?? product.source} <ExternalIcon />
        </a>
      </div>
    </div>
  );
}
