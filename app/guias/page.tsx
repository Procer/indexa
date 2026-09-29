import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { GUIDES } from "@/lib/content/guides";

export const metadata: Metadata = {
  title: "Guías de compra de tecnología — indexa",
  description:
    "Guías simples, con ejemplos, para elegir notebook, celular, RAM y almacenamiento, entender las cuotas y detectar ofertas reales en Argentina.",
};

export default function GuiasPage() {
  const [start, ...rest] = GUIDES;

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 pb-10 pt-8">
        <header className="max-w-2xl">
          <p className="font-brand text-sm font-bold uppercase tracking-wide text-gathering-primary">
            Guías de compra
          </p>
          <h1 className="mt-1 font-brand text-3xl font-bold leading-tight text-gathering-on-surface sm:text-4xl">
            Elegí bien, aunque no sepas nada de tecnología
          </h1>
          <p className="mt-3 font-brand text-lg text-gathering-on-surface-variant">
            Explicado con ejemplos de todos los días, sin palabras raras. Empezá por la primera si recién arrancás.
          </p>
        </header>

        {/* Destacada: para quien no sabe nada */}
        <Link
          href={`/guias/${start.slug}`}
          className="mt-8 flex flex-col gap-4 rounded-3xl bg-gathering-primary p-6 text-gathering-on-primary shadow-md transition-transform hover:scale-[1.01] sm:flex-row sm:items-center sm:p-8"
        >
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <span className="material-symbols-outlined text-[36px]" aria-hidden="true">{start.icon}</span>
          </span>
          <div>
            <span className="rounded-full bg-white/15 px-3 py-1 font-brand text-xs font-semibold">
              Empezá por acá · {start.minutes} min
            </span>
            <h2 className="mt-2 font-brand text-xl font-bold sm:text-2xl">{start.title}</h2>
            <p className="mt-1 font-brand text-base text-white/90">{start.description}</p>
          </div>
        </Link>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {rest.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guias/${g.slug}`}
                className="flex h-full flex-col gap-3 rounded-2xl bg-gathering-surface-container p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gathering-primary/10 text-gathering-primary">
                    <span className="material-symbols-outlined text-[26px]" aria-hidden="true">{g.icon}</span>
                  </span>
                  <span className="font-brand text-xs font-semibold text-gathering-on-surface-variant">
                    {g.minutes} min
                  </span>
                </div>
                <h2 className="font-brand text-lg font-bold leading-snug text-gathering-on-surface">{g.title}</h2>
                <p className="font-brand text-sm leading-relaxed text-gathering-on-surface-variant">
                  {g.description}
                </p>
                <span className="mt-auto inline-flex items-center gap-1 font-brand text-sm font-semibold text-gathering-primary">
                  Leer guía
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </>
  );
}
