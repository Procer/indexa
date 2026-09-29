import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
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
      <main className="mx-auto max-w-3xl px-4 py-8">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Link href="/guias" className="font-brand text-sm text-gathering-primary hover:underline">
          ← Todas las guías
        </Link>
        <h1 className="mt-3 font-brand text-3xl font-bold text-gathering-on-surface">{guide.title}</h1>
        <p className="mt-3 font-brand text-lg text-gathering-on-surface-variant">{guide.intro}</p>

        {guide.sections.map((s) => (
          <section key={s.heading} className="mt-8">
            <h2 className="font-brand text-xl font-bold text-gathering-on-surface">{s.heading}</h2>
            {s.paragraphs.map((p) => (
              <p key={p} className="mt-2 font-brand text-gathering-on-surface">
                {p}
              </p>
            ))}
            {s.bullets && (
              <ul className="mt-2 list-disc space-y-1 pl-6 font-brand text-gathering-on-surface">
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <div className="mt-10 rounded-2xl bg-gathering-surface-container p-5 shadow-sm">
          <p className="font-brand text-gathering-on-surface">
            ¿Querés que lo resolvamos por vos? Contanos para qué lo vas a usar y tu presupuesto.
          </p>
          <Link
            href="/"
            className="mt-3 inline-block rounded-full bg-gathering-primary px-5 py-2 font-brand text-sm font-semibold text-gathering-on-primary"
          >
            {guide.cta}
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
