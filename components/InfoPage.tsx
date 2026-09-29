import type { ReactNode } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

// Contenedor común de las páginas informativas (privacidad, términos, ayuda…).
export function InfoPage({
  title,
  updated,
  icon = "info",
  subtitle,
  children,
}: {
  title: string;
  updated?: string;
  icon?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main id="contenido" className="mx-auto max-w-3xl px-4 pb-10 pt-8">
        <header className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gathering-primary text-gathering-on-primary">
            <span className="material-symbols-outlined text-[26px]" aria-hidden="true">{icon}</span>
          </span>
          <div>
            <h1 className="font-brand text-3xl font-bold leading-tight text-gathering-on-surface">{title}</h1>
            {subtitle && <p className="mt-1 font-brand text-base text-gathering-on-surface-variant">{subtitle}</p>}
            {updated && (
              <p className="mt-1 font-brand text-sm text-gathering-on-surface-variant">Última actualización: {updated}</p>
            )}
          </div>
        </header>
        <div className="mt-6 space-y-4 font-brand text-base leading-relaxed text-gathering-on-surface">{children}</div>
      </main>
      <Footer />
    </>
  );
}

export function InfoSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-gathering-surface-container p-5 shadow-sm">
      <h2 className="font-brand text-lg font-bold text-gathering-on-surface">{heading}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export function InfoList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i} className="flex gap-3">
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px] text-gathering-primary" aria-hidden="true">
            check_circle
          </span>
          <span>{i}</span>
        </li>
      ))}
    </ul>
  );
}
