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
      <main id="contenido" className="mx-auto max-w-6xl px-4 py-8">
        <header className="max-w-2xl">
          <p className="font-brand text-sm font-bold uppercase tracking-wide text-gathering-primary">Tiendas</p>
          <h1 className="mt-1 font-brand text-3xl font-bold leading-tight text-gathering-on-surface sm:text-4xl">
            Comparamos {stores.length} tiendas por vos
          </h1>
          <p className="mt-3 font-brand text-lg text-gathering-on-surface-variant">
            {total.toLocaleString("es-AR")} productos disponibles, actualizados todos los días. No vendemos nada: te
            llevamos a la tienda oficial para comprar.
          </p>
        </header>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((s) => {
            const logo = storeLogoUrl(s.source);
            return (
              <li key={s.source}>
                <Link
                  href={`/tiendas/${s.source}`}
                  className="group flex h-full flex-col gap-3 rounded-2xl bg-gathering-surface-container p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    {logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo} alt="" className="h-10 w-10 rounded-lg bg-white p-1 shadow-sm" />
                    )}
                    <h2 className="font-brand text-lg font-bold text-gathering-on-surface">{storeName(s.source)}</h2>
                  </div>
                  <p className="font-brand text-sm text-gathering-on-surface-variant">
                    {s.total.toLocaleString("es-AR")} productos
                    {s.minPrice != null && <> · desde {formatPrice(s.minPrice)}</>}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(s.byCategory).map(([c, n]) => (
                      <span
                        key={c}
                        className="rounded-full bg-gathering-primary/10 px-2.5 py-0.5 font-brand text-xs font-semibold text-gathering-primary"
                      >
                        {CATEGORY_LABELS[c] ?? c} · {n}
                      </span>
                    ))}
                  </div>
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
