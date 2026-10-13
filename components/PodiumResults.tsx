"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { groupVariants } from "@/lib/domain/variantGroup";
import { buildPodium, diffEntries, stepVerdict, yearsText, TASK_LEVEL_WORD } from "@/lib/domain/podium";
import type { LadderItem, PodiumEntry, PodiumPick, PodiumPlan, PodiumRole, TaskLevel } from "@/lib/domain/podium";
import { buildBudgetFit } from "@/lib/domain/plainFit";
import { formatPrice, storeName } from "@/lib/domain/productDisplay";
import { withBasePath } from "@/lib/basePath";
import { getOrCreateVisitId } from "@/lib/analytics/visit";
import { trackEvent } from "@/lib/analytics/track";
import { useImpression } from "@/lib/analytics/useImpression";
import { RankedResultsList, type RankedResultsListProps } from "@/components/RankedResultsList";
import { SpecDetailPanel } from "@/components/SpecDetailPanel";
import { OtherStoresButton } from "@/components/OtherStoresButton";
import { priceBlock, StoreLogo } from "@/components/ProductChatCard";
import type { AlternativeProduct, UseCase } from "@/types";

// Vista "Podio": 3 equipos elegidos por un criterio claro cada uno + una
// escalera por precio ("¿qué gano si pago más?"). La lógica vive en
// lib/domain/podium.ts. Si no hay datos para armarlo (no es notebook/PC, o hay
// muy pocas opciones que sirvan) cae a la lista Simple de siempre.

const ROLE_LABEL: Record<PodiumRole, string> = {
  recommended: "Te recomendamos",
  cheapest: "La más barata que te sirve",
  lasting: "La que más te dura",
};

const TICK_STYLE: Record<TaskLevel, string> = {
  ok: "bg-emerald-600/15 text-emerald-700",
  just: "bg-amber-500/20 text-amber-700",
  no: "bg-red-500/15 text-red-700",
};
const TICK_ICON: Record<TaskLevel, string> = { ok: "✓", just: "!", no: "✕" };

const YEARS_SCALE_MAX = 7;

export function PodiumResults(props: RankedResultsListProps) {
  const {
    products,
    useCases = [],
    budgetCash = null,
    paymentMode = "cash",
    spotlightProductId,
    searchShareToken,
    sessionId,
    onCompareToggle,
    isCompared,
    compareDisabled,
    onCompareAdd,
    comparedIds,
  } = props;

  const grouped = useMemo(() => groupVariants(products), [products]);
  const plan = useMemo(
    () => buildPodium({ products: grouped, useCases, budgetCash }),
    [grouped, useCases, budgetCash]
  );

  const spotInRest =
    !!spotlightProductId && !!plan && plan.rest.some((p) => p.id === spotlightProductId || !!p.variants?.some((v) => v.id === spotlightProductId));
  const [showRest, setShowRest] = useState(false);
  useEffect(() => {
    if (spotInRest) setShowRest(true);
  }, [spotInRest]);

  if (!plan) return <RankedResultsList {...props} simple />;

  function handleBuyClick(product: AlternativeProduct, rank: number, role: PodiumRole | null) {
    fetch(withBasePath(`/api/products/${product.id}/click`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ searchShareToken, sessionId, visitId: getOrCreateVisitId().id }),
    }).catch(() => {});
    trackEvent("product_buy_click", getOrCreateVisitId().id, {
      productId: product.id,
      metadata: { recommended: true, rank, view: "podium", role, shareToken: searchShareToken ?? null },
    });
  }

  const recommended = plan.picks.find((p) => p.role === "recommended");
  const others = plan.picks.filter((p) => p.role !== "recommended");

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4" aria-labelledby="podium-title">
        <div className="flex flex-col gap-1">
          <h2 id="podium-title" className="font-brand text-xl font-extrabold text-gathering-on-surface sm:text-2xl">
            {plan.picks.length === 1 ? "Elegimos esta para vos" : `Elegimos ${plan.picks.length} para vos`}
          </h2>
          <p className="font-brand text-sm text-gathering-on-surface-variant">
            Revisamos {plan.consideredCount} {plan.consideredCount === 1 ? "opción" : "opciones"}. Cada una gana por una razón distinta.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {recommended && (
            <div className="sm:col-span-2">
              <PodiumCard
                pick={recommended}
                reference={recommended.entry}
                hero
                {...cardShared()}
              />
            </div>
          )}
          {others.map((pick) => (
            <PodiumCard key={pick.entry.product.id} pick={pick} reference={recommended?.entry ?? pick.entry} {...cardShared()} />
          ))}
        </div>
      </section>

      {plan.ladder.length >= 3 && recommended && (
        <PriceLadder plan={plan} recommended={recommended.entry} />
      )}

      {plan.rest.length > 0 && (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowRest((v) => !v)}
            aria-expanded={showRest}
            className="self-start rounded-xl border border-gathering-outline-variant px-4 py-2.5 font-brand text-sm font-semibold text-gathering-on-surface-variant transition-all hover:border-gathering-primary-fixed-dim hover:bg-gathering-surface-container"
          >
            {showRest ? "Ocultar las otras opciones" : `Ver las otras ${plan.rest.length} opciones`}
          </button>
          {showRest && (
            <RankedResultsList {...props} products={plan.rest} simple hideSortBar />
          )}
        </section>
      )}
    </div>
  );

  function cardShared() {
    return {
      paymentMode,
      useCases,
      budgetCash: props.budgetCash ?? null,
      budgetMonthly: props.budgetMonthly ?? null,
      spotlightProductId: spotlightProductId ?? null,
      isCompared,
      compareDisabled,
      onCompareToggle,
      onCompareAdd,
      comparedIds,
      searchShareToken,
      onBuy: handleBuyClick,
    };
  }
}

interface PodiumCardProps {
  pick: PodiumPick;
  // Contra quién se cuenta "ahorrás / pagás más" (la recomendada).
  reference: PodiumEntry;
  hero?: boolean;
  paymentMode: "cash" | "installments";
  useCases: UseCase[];
  budgetCash: number | null;
  budgetMonthly: number | null;
  spotlightProductId: string | null;
  isCompared: (id: string) => boolean;
  compareDisabled: boolean;
  onCompareToggle: (p: AlternativeProduct) => void;
  onCompareAdd?: (ids: string[], open?: boolean) => void;
  comparedIds?: string[];
  searchShareToken?: string;
  onBuy: (p: AlternativeProduct, rank: number, role: PodiumRole | null) => void;
}

function whyText(role: PodiumRole, entry: PodiumEntry, reference: PodiumEntry): string {
  if (role === "recommended") {
    return "Es la que mejor equilibra lo que pagás con los años que te va a durar y lo que necesitás hacer.";
  }
  const d = diffEntries(reference, entry);
  if (role === "cheapest") {
    const tail = entry.justCount > 0 ? " Con varias cosas a la vez va a andar justa." : "";
    return `Ahorrás ${formatPrice(-d.priceDelta)} frente a la recomendada y igual te sirve para lo que pediste.${tail}`;
  }
  return `Pagás ${formatPrice(d.priceDelta)} más que la recomendada y te dura ${yearsText(d.yearsDelta)} más.`;
}

function PodiumCard({
  pick,
  reference,
  hero = false,
  paymentMode,
  useCases,
  budgetCash,
  budgetMonthly,
  spotlightProductId,
  isCompared,
  compareDisabled,
  onCompareToggle,
  onCompareAdd,
  comparedIds,
  searchShareToken,
  onBuy,
}: PodiumCardProps) {
  const { role, entry } = pick;
  const product = entry.product;
  const ref = useRef<HTMLElement>(null);
  useImpression(ref, searchShareToken, product.id);
  const pb = priceBlock(product, paymentMode);
  const budgetFit = buildBudgetFit(product, { cash: budgetCash, monthly: budgetMonthly });
  const image = product.image_url ?? product.images?.[0] ?? null;
  const compared = isCompared(product.id);
  const spotlighted =
    !!spotlightProductId && (product.id === spotlightProductId || !!product.variants?.some((v) => v.id === spotlightProductId));
  const rank = role === "recommended" ? 1 : role === "cheapest" ? 2 : 3;
  const lo = (entry.yearsMin / YEARS_SCALE_MAX) * 100;
  const width = ((entry.yearsMax - entry.yearsMin) / YEARS_SCALE_MAX) * 100;

  return (
    <article
      ref={ref}
      className={`gathering-glass-card flex h-full flex-col gap-4 rounded-2xl border p-4 sm:p-5 ${
        spotlighted
          ? "z-10 animate-spotlight-pulse ring-4 ring-[#3452E1] ring-offset-2 ring-offset-gathering-background border-gathering-outline-variant"
          : hero
            ? "border-2 border-gathering-primary-fixed-dim"
            : "border-gathering-outline-variant"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-3 py-1 font-brand text-xs font-bold uppercase tracking-wide ${
            hero ? "bg-gathering-primary-fixed-dim text-white" : "bg-gathering-surface-container-highest text-gathering-on-surface-variant"
          }`}
        >
          {ROLE_LABEL[role]}
        </span>
        {product.sponsored && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-brand text-xs font-semibold uppercase text-amber-700">
            Patrocinado
          </span>
        )}
      </div>

      <div className="flex gap-4">
        <div
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gathering-surface-container-highest/40 p-2 ${
            hero ? "h-28 w-28 sm:h-36 sm:w-36" : "h-24 w-24"
          }`}
        >
          {image ? (
            <img
              src={withBasePath(`/api/img?url=${encodeURIComponent(image)}`)}
              alt={product.title}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="material-symbols-outlined text-4xl text-gathering-outline-variant">image</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="line-clamp-3 font-brand text-base font-bold leading-snug text-gathering-on-surface sm:text-lg">
            {product.title}
          </h3>
          <span className="font-brand text-xs text-gathering-on-surface-variant">en {storeName(product.source)}</span>
          {pb && (
            <div>
              <p className={`font-brand font-extrabold text-gathering-on-surface ${hero ? "text-3xl" : "text-2xl"}`}>
                {pb.leadAmount}
                <span className="ml-1.5 text-sm font-medium text-gathering-on-surface-variant">{pb.leadUnit}</span>
              </p>
              {pb.sub && <p className="font-brand text-xs text-gathering-on-surface-variant">{pb.sub}</p>}
              {pb.tag && (
                <p className={`font-brand text-xs font-bold ${pb.tag.tone === "ok" ? "text-emerald-700" : "text-amber-700"}`}>
                  {pb.tag.text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {budgetFit && (
        <p
          className={`rounded-xl px-3 py-2 font-brand text-sm font-semibold ${
            budgetFit.tone === "warn" ? "bg-orange-500/10 text-orange-700" : "bg-emerald-600/10 text-emerald-700"
          }`}
        >
          {budgetFit.text}
        </p>
      )}

      <p className="font-brand text-sm text-gathering-on-surface-variant">{whyText(role, entry, reference)}</p>

      <ul className="flex flex-col gap-1.5">
        {entry.tasks.map((t) => (
          <li key={t.key} className="flex items-center gap-2 font-brand text-sm text-gathering-on-surface">
            <span
              className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${TICK_STYLE[t.level]}`}
              aria-hidden="true"
            >
              {TICK_ICON[t.level]}
            </span>
            <span className="min-w-0 flex-1">{t.label}</span>
            <span className="shrink-0 text-xs font-semibold text-gathering-on-surface-variant">{TASK_LEVEL_WORD[t.level]}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2 font-brand text-sm">
          <span className="text-gathering-on-surface-variant">Te va a andar bien unos</span>
          <b className="text-gathering-on-surface">
            {entry.yearsMin} a {entry.yearsMax} años
          </b>
        </div>
        <div
          className="relative h-2.5 rounded-full bg-gathering-surface-container-highest"
          role="img"
          aria-label={`${entry.yearsMin} a ${entry.yearsMax} años de uso cómodo`}
        >
          <span
            className="absolute bottom-0 top-0 rounded-full bg-gathering-primary-fixed-dim"
            style={{ left: `${lo}%`, width: `${width}%` }}
          />
        </div>
        <div className="flex justify-between font-brand text-[11px] text-gathering-on-surface-variant">
          <span>0</span>
          <span>3</span>
          <span>5</span>
          <span>{YEARS_SCALE_MAX} años</span>
        </div>
      </div>

      <div className="mt-auto flex flex-nowrap items-stretch gap-1.5 sm:gap-2">
        <a
          href={product.affiliate_url ?? product.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onBuy(product, rank, role)}
          className="flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gathering-primary-fixed-dim px-3 py-2.5 font-brand text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.97] sm:px-5 sm:py-3 sm:text-sm"
        >
          <span className="sm:hidden">
            <StoreLogo
              source={product.source}
              fallback={<span className="max-w-[5rem] truncate text-[11px] font-semibold opacity-90">{storeName(product.source)}</span>}
            />
          </span>
          <span className="hidden sm:inline-flex">
            <StoreLogo source={product.source} />
          </span>
          Comprar<span className="hidden sm:inline">&nbsp;en {storeName(product.source)}</span>
        </a>
        <button
          type="button"
          onClick={() => onCompareToggle(product)}
          disabled={!compared && compareDisabled}
          className={`whitespace-nowrap rounded-xl border px-2.5 py-2.5 font-brand text-xs font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none sm:px-4 sm:py-3 sm:text-sm ${
            compared
              ? "border-gathering-primary-fixed-dim bg-gathering-primary-fixed-dim/10 text-gathering-primary-fixed-dim"
              : "border-gathering-outline-variant text-gathering-on-surface-variant hover:border-gathering-primary-fixed-dim hover:bg-gathering-surface-container"
          }`}
        >
          {compared ? "✓ Comparando" : "Comparar"}
        </button>
        <OtherStoresButton
          productId={product.id}
          productTitle={product.title}
          current={{
            source: product.source,
            price_cash: product.price_cash,
            price_installment: product.price_installment,
            installment_count: product.installment_count ?? null,
            url: product.url,
            affiliate_url: product.affiliate_url,
          }}
          onCompareAdd={onCompareAdd}
          comparedIds={comparedIds}
          showIcon={false}
          triggerClassName="whitespace-nowrap rounded-xl border border-gathering-outline-variant px-2.5 py-2.5 font-brand text-xs font-semibold text-gathering-on-surface-variant transition-all hover:-translate-y-0.5 hover:border-gathering-primary-fixed-dim hover:bg-gathering-surface-container hover:shadow-md sm:px-4 sm:py-3 sm:text-sm"
        />
      </div>

      <SpecDetailPanel
        product={product}
        useCases={useCases}
        closedLabel="Ver las características"
        openLabel="Ocultar características"
      />
    </article>
  );
}

// ─── Escalera de precio ──────────────────────────────────────────────────────

function PriceLadder({ plan, recommended }: { plan: PodiumPlan; recommended: PodiumEntry }) {
  const [selectedId, setSelectedId] = useState(recommended.product.id);
  const selected = plan.ladder.find((l) => l.entry.product.id === selectedId)?.entry ?? recommended;
  const items = plan.ladder;

  // La línea del presupuesto va justo antes del primer equipo que se pasa.
  const budgetIndex =
    plan.budgetCash != null ? items.findIndex((l) => l.entry.cash > (plan.budgetCash as number)) : -1;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="ladder-title">
      <div className="flex flex-col gap-1">
        <h2 id="ladder-title" className="font-brand text-xl font-extrabold text-gathering-on-surface sm:text-2xl">
          ¿Y si pago más? ¿Y si pago menos?
        </h2>
        <p className="font-brand text-sm text-gathering-on-surface-variant">
          De la más barata a la más cara. Entre una y otra te decimos qué ganás o perdés por la diferencia. Tocá una para
          compararla con la que te recomendamos.
        </p>
      </div>

      <div className="flex flex-col">
        {items.map((item, i) => (
          <div key={item.entry.product.id} className="flex flex-col">
            {i === budgetIndex && plan.budgetCash != null && <BudgetLine amount={plan.budgetCash} />}
            {i > 0 && <LadderStep from={items[i - 1].entry} to={item.entry} />}
            <LadderNode
              item={item}
              selected={item.entry.product.id === selectedId}
              onSelect={() => setSelectedId(item.entry.product.id)}
            />
          </div>
        ))}
      </div>

      <LadderSummary recommended={recommended} selected={selected} budgetCash={plan.budgetCash} />
    </section>
  );
}

function Rail({ dot = false, active = false }: { dot?: boolean; active?: boolean }) {
  return (
    <div className="relative flex w-7 shrink-0 justify-center" aria-hidden="true">
      <span className="absolute bottom-0 top-0 w-[3px] rounded-full bg-gathering-outline-variant" />
      {dot && (
        <span
          className={`relative z-10 mt-4 h-[18px] w-[18px] rounded-full border-[3px] ${
            active
              ? "border-gathering-primary-fixed-dim bg-gathering-primary-fixed-dim"
              : "border-gathering-outline-variant bg-gathering-surface"
          }`}
        />
      )}
    </div>
  );
}

function BudgetLine({ amount }: { amount: number }) {
  return (
    <div className="flex gap-3">
      <Rail />
      <p className="flex flex-1 items-center gap-3 py-2 font-brand text-sm font-bold text-amber-700">
        <span className="flex-1 border-t-2 border-dashed border-amber-500/70" />
        Tu presupuesto: {formatPrice(amount)}
        <span className="flex-1 border-t-2 border-dashed border-amber-500/70" />
      </p>
    </div>
  );
}

function LadderNode({ item, selected, onSelect }: { item: LadderItem; selected: boolean; onSelect: () => void }) {
  const { entry, role, tooShort } = item;
  const specs = entry.product.specs as { ram_gb?: number; storage_gb?: number } | undefined;
  return (
    <div className="flex gap-3">
      <Rail dot active={selected} />
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`my-1 flex min-w-0 flex-1 flex-col gap-1 rounded-xl border bg-gathering-surface p-3 text-left transition-colors ${
          selected ? "border-2 border-gathering-primary-fixed-dim" : "border-gathering-outline-variant hover:border-gathering-primary-fixed-dim"
        }`}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 font-brand text-[15px] font-bold text-gathering-on-surface">{entry.product.title}</span>
          <span className="shrink-0 font-brand text-base font-extrabold text-gathering-on-surface">{formatPrice(entry.cash)}</span>
        </span>
        <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-brand text-xs text-gathering-on-surface-variant">
          {specs?.ram_gb ? <span>{specs.ram_gb} GB de memoria</span> : null}
          {specs?.storage_gb ? <span>{specs.storage_gb >= 1000 ? `${specs.storage_gb / 1000} TB` : `${specs.storage_gb} GB`} de espacio</span> : null}
          <span>
            Dura {entry.yearsMin} a {entry.yearsMax} años
          </span>
          <span>≈ {formatPrice(entry.cash / entry.yearsMid)} por año de uso</span>
        </span>
        {(role || tooShort) && (
          <span className="flex flex-wrap gap-1.5">
            {role && (
              <span className="rounded-full bg-gathering-primary-fixed-dim/15 px-2 py-0.5 font-brand text-[11px] font-bold uppercase tracking-wide text-gathering-primary-fixed-dim">
                {ROLE_LABEL[role]}
              </span>
            )}
            {tooShort && (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-brand text-[11px] font-bold uppercase tracking-wide text-red-700">
                Te queda corta
              </span>
            )}
          </span>
        )}
      </button>
    </div>
  );
}

const VERDICT_STYLE = { strong: "text-emerald-700", optional: "text-gathering-primary-fixed-dim", skip: "text-amber-700" } as const;

function LadderStep({ from, to }: { from: PodiumEntry; to: PodiumEntry }) {
  const d = diffEntries(from, to);
  const verdict = stepVerdict(d);
  const items = [...d.unlocked, ...d.gains];
  if (d.yearsDelta >= 0.75) items.push(`${yearsText(d.yearsDelta)} más de vida útil`);
  else if (Math.abs(d.yearsDelta) < 0.75) items.push("dura lo mismo");
  return (
    <div className="flex gap-3">
      <Rail />
      <div className="my-1 flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-dashed border-gathering-outline-variant px-3.5 py-2.5 font-brand text-[13px]">
        <span className="font-bold text-gathering-on-surface">Por {formatPrice(d.priceDelta)} más</span>
        <ul className="list-disc pl-5 text-gathering-on-surface-variant">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {verdict && <span className={`font-bold ${VERDICT_STYLE[verdict.tone]}`}>{verdict.text}</span>}
      </div>
    </div>
  );
}

function LadderSummary({
  recommended,
  selected,
  budgetCash,
}: {
  recommended: PodiumEntry;
  selected: PodiumEntry;
  budgetCash: number | null;
}) {
  if (selected.product.id === recommended.product.id) {
    return (
      <div className="rounded-2xl bg-gathering-primary-fixed-dim/10 px-4 py-3 font-brand text-sm text-gathering-on-surface">
        <p className="font-bold">Estás viendo la que te recomendamos</p>
        <p className="text-gathering-on-surface-variant">
          {recommended.product.title} a {formatPrice(recommended.cash)}. Tocá otra de la escalera para ver qué cambia.
        </p>
      </div>
    );
  }
  const d = diffEntries(recommended, selected);
  const lines: string[] = [];
  if (d.priceDelta < 0) {
    lines.push(`Ahorrás ${formatPrice(-d.priceDelta)}`);
    d.worsened.forEach((x) => lines.push(`Pero pierdés: ${x}`));
    d.losses.forEach((x) => lines.push(`Tiene ${x}`));
    if (d.yearsDelta <= -0.75) lines.push(`Te dura ${yearsText(d.yearsDelta)} menos`);
  } else {
    lines.push(`Pagás ${formatPrice(d.priceDelta)} más`);
    d.unlocked.forEach((x) => lines.push(`Ganás: ${x}`));
    d.gains.forEach((x) => lines.push(`Ganás ${x}`));
    lines.push(d.yearsDelta >= 0.75 ? `Te dura ${yearsText(d.yearsDelta)} más` : "No te dura más años");
    if (budgetCash != null && selected.cash > budgetCash) {
      lines.push(`Te pasás ${formatPrice(selected.cash - budgetCash)} de tu presupuesto`);
    }
  }
  return (
    <div className="rounded-2xl bg-gathering-primary-fixed-dim/10 px-4 py-3 font-brand text-sm text-gathering-on-surface" aria-live="polite">
      <p className="font-bold">{selected.product.title} en vez de la recomendada</p>
      <ul className="mt-1 list-disc pl-5 text-gathering-on-surface-variant">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
