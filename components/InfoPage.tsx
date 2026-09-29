import type { ReactNode } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

// Contenedor común de las páginas informativas (privacidad, términos, ayuda…).
export function InfoPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-brand text-3xl font-bold text-gathering-on-surface">{title}</h1>
        {updated && (
          <p className="mt-1 font-brand text-sm text-gathering-on-surface-variant">Última actualización: {updated}</p>
        )}
        <div className="mt-6 space-y-8 font-brand text-gathering-on-surface">{children}</div>
      </main>
      <Footer />
    </>
  );
}

export function InfoSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-brand text-xl font-bold text-gathering-on-surface">{heading}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export function InfoList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-6">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}
