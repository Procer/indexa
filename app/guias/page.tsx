import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { GUIDES } from "@/lib/content/guides";

export const metadata: Metadata = {
  title: "Guías de compra de tecnología — indexa",
  description:
    "Guías simples para elegir notebook, celular, RAM y almacenamiento, y para detectar ofertas reales en Argentina.",
};

export default function GuiasPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-brand text-3xl font-bold text-gathering-on-surface">Guías de compra</h1>
        <p className="mt-2 font-brand text-gathering-on-surface-variant">
          Explicado sin tecnicismos, para elegir bien y no pagar de más.
        </p>
        <ul className="mt-6 flex flex-col gap-4">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guias/${g.slug}`}
                className="block rounded-2xl bg-gathering-surface-container p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <h2 className="font-brand text-lg font-bold text-gathering-on-surface">{g.title}</h2>
                <p className="mt-1 font-brand text-sm text-gathering-on-surface-variant">{g.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </>
  );
}
