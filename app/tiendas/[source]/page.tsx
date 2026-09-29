import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { StoreProductRow } from "@/components/StoreProductRow";
import { getRecentPriceDrops, getStoreProducts, getStoreSummaries } from "@/lib/db/queries";
import { CATEGORY_LABELS } from "@/lib/site";
import { formatPrice, storeLogoUrl, storeName } from "@/lib/domain/productDisplay";
import type { Product } from "@/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { source: string } }): Promise<Metadata> {
  const name = storeName(params.source);
  return {
    title: `${name}: notebooks, celulares y más al mejor precio — indexa`,
    description: `Productos de ${name} con precio contado y cuotas, y cuáles bajaron de precio últimamente. Comparados con el resto de las tiendas en indexa.`,
  };
}

export default async function StorePage({ params }: { params: { source: string } }) {
  const summaries = await getStoreSummaries();
  const summary = summaries.find((s) => s.source === params.source);
  if (!summary) notFound();

  const [products, drops] = await Promise.all([
    getStoreProducts(params.source),
    getRecentPriceDrops(params.source),
  ]);

  const byCategory = new Map<string, Product[]>();
  for (const p of products) {
    byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p]);
  }
  const logo = storeLogoUrl(params.source);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/tiendas" className="font-brand text-sm text-gathering-primary hover:underline">
          ← Todas las tiendas
        </Link>
        <div className="mt-3 flex items-center gap-3">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-10 w-10 rounded" />
          )}
          <h1 className="font-brand text-3xl font-bold text-gathering-on-surface">{storeName(params.source)}</h1>
        </div>
        <p className="mt-2 font-brand text-gathering-on-surface-variant">
          {summary.total.toLocaleString("es-AR")} productos disponibles
          {summary.minPrice != null && <> · desde {formatPrice(summary.minPrice)}</>}
          {summary.lastUpdate && <> · actualizado el {new Date(summary.lastUpdate).toLocaleDateString("es-AR")}</>}
        </p>

        {drops.length > 0 && (
          <section className="mt-8">
            <h2 className="font-brand text-xl font-bold text-gathering-on-surface">Bajaron de precio</h2>
            <p className="font-brand text-sm text-gathering-on-surface-variant">
              Contra su precio de hace dos semanas.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {drops.map((d) => (
                <StoreProductRow
                  key={d.product.id}
                  product={d.product}
                  note={`▼ ${d.pct}% (antes ${formatPrice(d.previous)})`}
                />
              ))}
            </div>
          </section>
        )}

        {Array.from(byCategory.entries()).map(([cat, list]) => (
          <section key={cat} className="mt-8">
            <h2 className="font-brand text-xl font-bold text-gathering-on-surface">
              {CATEGORY_LABELS[cat] ?? cat} más económicos
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {list.map((p) => (
                <StoreProductRow key={p.id} product={p} />
              ))}
            </div>
          </section>
        ))}

        <p className="mt-10 font-brand text-sm text-gathering-on-surface-variant">
          ¿No sabés cuál te conviene?{" "}
          <Link href="/" className="font-semibold text-gathering-primary hover:underline">
            Contale a indexa para qué lo vas a usar
          </Link>{" "}
          y te recomendamos según tu presupuesto.
        </p>
      </main>
      <Footer />
    </>
  );
}
