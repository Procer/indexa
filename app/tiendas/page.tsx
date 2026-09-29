import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { getStoreSummaries } from "@/lib/db/queries";
import { CATEGORY_LABELS } from "@/lib/site";
import { formatPrice, storeLogoUrl, storeName } from "@/lib/domain/productDisplay";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tiendas comparadas — indexa",
  description:
    "Las tiendas de tecnología argentinas que comparamos en indexa: cuántos productos tiene cada una, desde qué precio y cuándo se actualizó por última vez.",
};

export default async function TiendasPage() {
  const stores = await getStoreSummaries();
  const total = stores.reduce((acc, s) => acc + s.total, 0);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="font-brand text-3xl font-bold text-gathering-on-surface">Tiendas que comparamos</h1>
        <p className="mt-2 max-w-2xl font-brand text-gathering-on-surface-variant">
          Revisamos {stores.length} tiendas argentinas y {total.toLocaleString("es-AR")} productos disponibles.
          No vendemos nada: te llevamos a la tienda oficial para comprar.
        </p>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((s) => {
            const logo = storeLogoUrl(s.source);
            return (
              <li key={s.source}>
                <Link
                  href={`/tiendas/${s.source}`}
                  className="flex h-full flex-col gap-3 rounded-2xl bg-gathering-surface-container p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    {logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo} alt="" className="h-8 w-8 rounded" />
                    )}
                    <h2 className="font-brand text-lg font-bold text-gathering-on-surface">{storeName(s.source)}</h2>
                  </div>
                  <p className="font-brand text-sm text-gathering-on-surface-variant">
                    {s.total.toLocaleString("es-AR")} productos
                    {s.minPrice != null && <> · desde {formatPrice(s.minPrice)}</>}
                  </p>
                  <p className="font-brand text-xs text-gathering-on-surface-variant">
                    {Object.entries(s.byCategory)
                      .map(([c, n]) => `${CATEGORY_LABELS[c] ?? c}: ${n}`)
                      .join(" · ")}
                  </p>
                  {s.lastUpdate && (
                    <p className="mt-auto font-brand text-[11px] text-gathering-on-surface-variant">
                      Actualizado el {new Date(s.lastUpdate).toLocaleDateString("es-AR")}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
      <Footer />
    </>
  );
}
