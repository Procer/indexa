"use client";

import { ProductChatCard } from "@/components/ProductChatCard";
import type { AlternativeProduct, EnrichedProduct, ProductCategory } from "@/types";

// Vidriera del home antes de que el usuario conteste nada — productos al
// azar de /api/products/discover, agrupados por categoría (una sección por
// categoría con stock), con la misma interacción que la grilla de resultados
// reales (ver RecommendedProductsGrid): tarjetas ProductChatCard, "Ver más
// detalles" abre el panel completo, se puede agregar a comparar.

interface DiscoverySection {
  category: ProductCategory;
  label: string;
  products: EnrichedProduct[];
}

interface DiscoverySectionsProps {
  sections: DiscoverySection[];
  onViewDetails: (product: AlternativeProduct) => void;
  onCompareToggle: (product: AlternativeProduct) => void;
  isCompared: (productId: string) => boolean;
  compareDisabled: boolean;
  sessionId?: string;
}

function toAlternativeProduct(p: EnrichedProduct): AlternativeProduct {
  return {
    id: p.id,
    title: p.title,
    brand: p.brand,
    model: p.model,
    category: p.category,
    price_cash: p.price_cash,
    price_installment: p.price_installment,
    image_url: p.image_url,
    source: p.source,
    url: p.url,
    affiliate_url: p.affiliate_url,
    installment_count: p.installment_count,
    quality_price_score: p.quality_price_score,
    spec_highlights: p.spec_highlights,
    spec_highlights_simple: p.spec_highlights_simple,
    out_of_budget: p.out_of_budget,
    also_at: p.also_at,
  };
}

export function DiscoverySections({
  sections,
  onViewDetails,
  onCompareToggle,
  isCompared,
  compareDisabled,
  sessionId,
}: DiscoverySectionsProps) {
  if (sections.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <div key={section.category} className="flex flex-col gap-3">
          <h2 className="font-brand text-sm font-bold uppercase tracking-wide text-gathering-on-surface-variant">
            {section.label}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {section.products.map((p) => {
              const alt = toAlternativeProduct(p);
              return (
                <ProductChatCard
                  key={p.id}
                  product={alt}
                  onViewDetails={onViewDetails}
                  onCompareToggle={onCompareToggle}
                  isCompared={isCompared(p.id)}
                  compareDisabled={compareDisabled}
                  sessionId={sessionId}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
