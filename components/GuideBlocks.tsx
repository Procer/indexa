import type { GuideBlock } from "@/lib/content/guides";

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

// Renderiza los bloques de una sección de guía. Server component sin estado.
export function GuideBlocks({ blocks }: { blocks: GuideBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}

function Block({ block }: { block: GuideBlock }) {
  switch (block.type) {
    case "p":
      return <p className="font-brand text-base leading-relaxed text-gathering-on-surface">{block.text}</p>;

    case "list":
      return (
        <ul className="space-y-2">
          {block.items.map((t) => (
            <li key={t} className="flex gap-3 font-brand text-base leading-relaxed text-gathering-on-surface">
              <Icon name="check_circle" className="mt-0.5 shrink-0 text-[20px] text-gathering-primary" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      );

    case "steps":
      return (
        <ol className="space-y-3">
          {block.items.map((t, idx) => (
            <li key={t} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gathering-primary font-brand text-sm font-bold text-gathering-on-primary">
                {idx + 1}
              </span>
              <span className="font-brand text-base leading-relaxed text-gathering-on-surface">{t}</span>
            </li>
          ))}
        </ol>
      );

    case "analogy":
      return (
        <aside className="flex gap-3 rounded-2xl bg-gathering-tertiary-container p-4">
          <Icon name="emoji_objects" className="shrink-0 text-[28px] text-gathering-on-tertiary-container" />
          <div>
            <p className="font-brand text-sm font-bold uppercase tracking-wide text-gathering-on-tertiary-container">
              {block.title}
            </p>
            <p className="mt-1 font-brand text-base leading-relaxed text-gathering-on-tertiary-container">
              {block.text}
            </p>
          </div>
        </aside>
      );

    case "tip":
      return (
        <aside className="flex gap-3 rounded-2xl border border-green-200 bg-green-50 p-4">
          <Icon name="tips_and_updates" className="shrink-0 text-[24px] text-green-700" />
          <p className="font-brand text-base leading-relaxed text-green-900">
            <strong>Consejo: </strong>
            {block.text}
          </p>
        </aside>
      );

    case "warn":
      return (
        <aside className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <Icon name="warning" className="shrink-0 text-[24px] text-amber-700" />
          <p className="font-brand text-base leading-relaxed text-amber-900">
            <strong>Ojo: </strong>
            {block.text}
          </p>
        </aside>
      );

    case "example":
      return (
        <figure className="rounded-2xl border border-gathering-outline-variant bg-gathering-surface-container p-4">
          <figcaption className="flex items-center gap-2 font-brand text-sm font-bold text-gathering-primary">
            <Icon name="person" className="text-[20px]" />
            Ejemplo: {block.who}
          </figcaption>
          <p className="mt-2 font-brand text-base leading-relaxed text-gathering-on-surface-variant">
            <strong className="text-gathering-on-surface">Qué necesita: </strong>
            {block.need}
          </p>
          <p className="mt-2 font-brand text-base leading-relaxed text-gathering-on-surface">
            <strong>Le conviene: </strong>
            {block.answer}
          </p>
        </figure>
      );

    case "table":
      return (
        <div className="overflow-hidden rounded-2xl border border-gathering-outline-variant bg-gathering-surface-container">
          <div className="grid grid-cols-1 bg-gathering-surface-container-highest px-4 py-2 font-brand text-xs font-bold uppercase tracking-wide text-gathering-on-surface-variant sm:grid-cols-2 sm:gap-4">
            <span>{block.head[0] || " "}</span>
            <span className="hidden sm:block">{block.head[1]}</span>
          </div>
          {block.rows.map(([a, b]) => (
            <div
              key={a}
              className="grid grid-cols-1 gap-1 border-t border-gathering-outline-variant px-4 py-3 sm:grid-cols-2 sm:gap-4"
            >
              <span className="font-brand text-base font-semibold text-gathering-on-surface">{a}</span>
              <span className="font-brand text-base leading-relaxed text-gathering-on-surface-variant">
                <span className="mr-1 text-gathering-primary sm:hidden">→</span>
                {b}
              </span>
            </div>
          ))}
        </div>
      );

    case "glossary":
      return (
        <dl className="space-y-3">
          {block.items.map((g) => (
            <div key={g.term} className="rounded-2xl bg-gathering-surface-container p-4 shadow-sm">
              <dt className="font-brand text-base font-bold text-gathering-primary">{g.term}</dt>
              <dd className="mt-1 font-brand text-base leading-relaxed text-gathering-on-surface">{g.meaning}</dd>
            </div>
          ))}
        </dl>
      );
  }
}
