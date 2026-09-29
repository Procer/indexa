import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { GuideBlocks } from "@/components/GuideBlocks";
import { GUIDES, getGuide } from "@/lib/content/guides";
import { absoluteUrl } from "@/lib/site";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const guide = getGuide(params.slug);
  if (!guide) return {};
  return { title: `${guide.title} — indexa`, description: guide.description };
}

export default function GuidePage({ params }: { params: { slug: string } }) {
  const guide = getGuide(params.slug);
  if (!guide) notFound();

  const related = guide.related.map((s) => getGuide(s)).filter((g): g is NonNullable<typeof g> => !!g);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    inLanguage: "es-AR",
    mainEntityOfPage: absoluteUrl(`/guias/${guide.slug}`),
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 pb-10 pt-6">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

        <Link
          href="/guias"
          className="inline-flex items-center gap-1 font-brand text-sm font-semibold text-gathering-primary hover:underline"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span>
          Todas las guías
        </Link>

        {/* Hero */}
        <header className="mt-4 rounded-3xl bg-gathering-primary p-6 text-gathering-on-primary shadow-md sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <span className="material-symbols-outlined text-[28px]" aria-hidden="true">{guide.icon}</span>
            </span>
            <div className="flex flex-wrap gap-2 font-brand text-xs font-semibold">
              <span className="rounded-full bg-white/15 px-3 py-1">Para principiantes</span>
              <span className="rounded-full bg-white/15 px-3 py-1">{guide.minutes} min de lectura</span>
            </div>
          </div>
          <h1 className="mt-4 font-brand text-2xl font-bold leading-tight sm:text-3xl">{guide.title}</h1>
          <p className="mt-3 font-brand text-base leading-relaxed text-white/90">{guide.intro}</p>
        </header>

        {/* En resumen */}
        <section
          aria-labelledby="resumen"
          className="mt-6 rounded-2xl border-2 border-gathering-primary/30 bg-gathering-surface-container p-5"
        >
          <h2 id="resumen" className="flex items-center gap-2 font-brand text-lg font-bold text-gathering-primary">
            <span className="material-symbols-outlined" aria-hidden="true">bolt</span>
            En resumen
          </h2>
          <p className="mt-1 font-brand text-sm text-gathering-on-surface-variant">
            Si tenés poco tiempo, con esto alcanza.
          </p>
          <ul className="mt-3 space-y-2">
            {guide.summary.map((t) => (
              <li key={t} className="flex gap-3 font-brand text-base leading-relaxed text-gathering-on-surface">
                <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px] text-gathering-primary" aria-hidden="true">
                  arrow_right_alt
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Índice */}
        {guide.sections.length > 1 && (
          <nav aria-label="En esta guía" className="mt-6">
            <p className="font-brand text-xs font-bold uppercase tracking-wide text-gathering-on-surface-variant">
              En esta guía
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {guide.sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gathering-surface-container px-3 py-1.5 font-brand text-sm font-semibold text-gathering-on-surface shadow-sm transition-colors hover:bg-gathering-primary hover:text-gathering-on-primary"
                  >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{s.icon}</span>
                    {s.heading}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Secciones */}
        <div className="mt-8 space-y-10">
          {guide.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-20">
              <h2 className="flex items-center gap-3 font-brand text-xl font-bold text-gathering-on-surface sm:text-2xl">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gathering-primary/10 text-gathering-primary">
                  <span className="material-symbols-outlined text-[22px]" aria-hidden="true">{s.icon}</span>
                </span>
                {s.heading}
              </h2>
              <div className="mt-4">
                <GuideBlocks blocks={s.blocks} />
              </div>
            </section>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 rounded-3xl bg-gathering-inverse-surface p-6 text-gathering-inverse-on-surface">
          <p className="font-brand text-lg font-bold">¿Querés que lo resolvamos por vos?</p>
          <p className="mt-1 font-brand text-base text-gathering-inverse-on-surface/80">
            Contale al asesor para qué lo vas a usar y cuánto querés gastar. Te recomendamos las mejores opciones, en
            palabras simples.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-gathering-primary px-6 py-3 font-brand text-base font-semibold text-gathering-on-primary transition-transform hover:scale-[1.02]"
          >
            {guide.cta}
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_forward</span>
          </Link>
        </div>

        {/* Relacionadas */}
        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="font-brand text-lg font-bold text-gathering-on-surface">Seguí leyendo</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {related.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/guias/${g.slug}`}
                    className="flex h-full items-start gap-3 rounded-2xl bg-gathering-surface-container p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <span className="material-symbols-outlined shrink-0 text-gathering-primary" aria-hidden="true">{g.icon}</span>
                    <span className="font-brand text-sm font-semibold text-gathering-on-surface">{g.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
