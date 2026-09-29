import { withBasePath } from "@/lib/basePath";
import { formatPrice } from "@/lib/domain/productDisplay";
import type { Product } from "@/types";

// Fila compacta de producto para páginas públicas (server component, sin estado).
export function StoreProductRow({ product, note }: { product: Product; note?: string }) {
  return (
    <a
      href={product.affiliate_url ?? product.url}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className="flex items-center gap-3 rounded-2xl bg-gathering-surface-container p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      {product.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={withBasePath(`/api/img?url=${encodeURIComponent(product.image_url)}`)}
          alt=""
          loading="lazy"
          className="h-16 w-16 shrink-0 rounded-xl bg-white object-contain"
        />
      ) : (
        <div className="h-16 w-16 shrink-0 rounded-xl bg-gathering-surface-container-highest" />
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-brand text-sm font-semibold text-gathering-on-surface">
          {product.title}
        </p>
        {note && <p className="text-xs font-semibold text-green-700">{note}</p>}
      </div>
      {product.price_cash != null && (
        <p className="shrink-0 font-brand text-base font-bold text-gathering-primary">
          {formatPrice(product.price_cash)}
        </p>
      )}
    </a>
  );
}
