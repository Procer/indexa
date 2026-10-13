// Vista "Podio y escalera": en vez de una lista de N tarjetas parecidas, elige 3
// equipos por un criterio humano (la que recomendamos, la más barata que sirve,
// la que más dura) y arma una escalera por precio con "qué ganás si pagás más".
// Determinístico (sin LLM): se apoya en la vida útil (longevity.ts) y en los
// mismos umbrales de uso → specs que el resto del sitio (usageToSpecs.ts).
//
// Solo notebook/desktop por ahora: son las categorías donde las specs son
// confiables (celulares y tablets tienen specs mal cargadas, ver memoria del
// proyecto). Si no hay datos suficientes devuelve null y la UI cae a la lista
// Simple de siempre.

import { buildOutlook } from "./longevity";
import { getRequiredSpecs, TIER_RANK, VALID_USE_CASES } from "./usageToSpecs";
import type { AlternativeProduct, NotebookSpecs, ProcessorTier, UseCase } from "@/types";

export type TaskLevel = "ok" | "just" | "no";

export interface PodiumTask {
  key: string;
  label: string;
  level: TaskLevel;
}

export type PodiumRole = "recommended" | "cheapest" | "lasting";

export interface PodiumEntry {
  product: AlternativeProduct;
  // Precio de contado (la base de todas las comparaciones).
  cash: number;
  yearsMin: number;
  yearsMax: number;
  yearsMid: number;
  tasks: PodiumTask[];
  // true si no le falla ninguna tarea del usuario (todas "ok" o "just").
  viable: boolean;
  justCount: number;
}

export interface PodiumPick {
  role: PodiumRole;
  entry: PodiumEntry;
}

export interface LadderItem {
  entry: PodiumEntry;
  role: PodiumRole | null;
  // No sirve para lo que pidió: se muestra igual (transparencia) pero marcada.
  tooShort: boolean;
}

export interface PodiumPlan {
  picks: PodiumPick[];
  ladder: LadderItem[];
  // Presupuesto de contado, si lo hay (para dibujar la línea en la escalera).
  budgetCash: number | null;
  consideredCount: number;
  // Todo lo que no es uno de los 3 elegidos ("Otras opciones").
  rest: AlternativeProduct[];
}

export interface PodiumInput {
  products: AlternativeProduct[];
  useCases: UseCase[];
  budgetCash: number | null;
}

// Tareas que dependen del rendimiento (procesador/memoria/placa). Los usos que
// son preferencias de forma (portátil, batería, cámara…) no se pueden evaluar
// con estos datos y se dejan afuera para no mostrar un tilde sin sustento.
const TASK_LABEL: Partial<Record<UseCase, string>> = {
  casual_browsing: "Navegar y mandar mails",
  office: "Trabajo de oficina",
  study: "Estudiar",
  multimedia: "Ver películas y series",
  photo_editing_light: "Editar fotos",
  photo_editing_pro: "Editar fotos de forma profesional",
  video_editing_1080: "Editar video",
  video_editing_4k: "Editar video en 4K",
  programming: "Programar",
  gaming_casual: "Jugar",
  gaming_competitive: "Jugar en competitivo",
  graphic_design: "Diseño gráfico",
  cad_3d: "Diseño 3D",
  basic_use: "Uso básico",
  social_media: "Redes sociales",
  professional_mobile: "Trabajo y mail",
};

const MAX_TASKS = 4;
const MAX_LADDER = 5;
// Cuánto más del presupuesto se tolera para "la que más dura" (se muestra y se avisa).
const OVER_BUDGET_TOLERANCE = 1.15;
// La más barata solo cuenta si es claramente más barata que la recomendada.
const CHEAPER_MARGIN = 0.95;
// Cuánto penaliza cada tarea "justa" en el costo por año al elegir la recomendada.
const JUST_PENALTY = 0.15;

export const TASK_LEVEL_WORD: Record<TaskLevel, string> = {
  ok: "Bien",
  just: "Justo",
  no: "No te va a andar",
};

function taskLevel(specs: Partial<NotebookSpecs>, useCase: UseCase): TaskLevel | null {
  if (!specs.processor_tier || !specs.ram_gb) return null;
  const req = getRequiredSpecs([useCase]);
  const rankDiff = TIER_RANK[specs.processor_tier] - TIER_RANK[req.processor_tier];
  const ramRatio = specs.ram_gb / req.ram_gb;
  if (req.gpu === "dedicated" && specs.gpu !== "dedicated") return "no";
  if (rankDiff >= 0 && ramRatio >= 1) return "ok";
  if ((rankDiff >= -1 && ramRatio >= 1) || (rankDiff >= 0 && ramRatio >= 0.5)) return "just";
  return "no";
}

function buildTasks(specs: Partial<NotebookSpecs>, useCases: UseCase[]): PodiumTask[] {
  const wanted = useCases.filter((u) => VALID_USE_CASES.has(u) && TASK_LABEL[u]);
  const list: UseCase[] = wanted.length > 0 ? wanted : ["casual_browsing"];
  const tasks: PodiumTask[] = [];
  const seen = new Set<string>();
  for (const uc of list) {
    const label = TASK_LABEL[uc];
    if (!label || seen.has(label)) continue;
    const level = taskLevel(specs, uc);
    if (!level) continue;
    seen.add(label);
    tasks.push({ key: uc, label, level });
    if (tasks.length >= MAX_TASKS) break;
  }
  // "Varias cosas abiertas a la vez" separa a los equipos cuando el usuario pidió
  // un solo uso (si no, todas las filas tendrían el mismo único tilde).
  if (specs.ram_gb && tasks.length < MAX_TASKS) {
    tasks.push({
      key: "multitask",
      label: "Muchas pestañas y programas abiertos",
      level: specs.ram_gb >= 16 ? "ok" : specs.ram_gb >= 8 ? "just" : "no",
    });
  }
  return tasks;
}

function toEntry(product: AlternativeProduct, useCases: UseCase[]): PodiumEntry | null {
  if (product.category !== "notebook" && product.category !== "desktop") return null;
  const cash = product.price_cash;
  if (!cash || cash <= 0 || !product.specs) return null;
  const specs = product.specs as Partial<NotebookSpecs>;
  if (!specs.processor_tier || !specs.ram_gb) return null;
  const outlook = buildOutlook(
    { category: product.category, title: product.title, specs: product.specs },
    useCases
  );
  if (!outlook) return null;
  const tasks = buildTasks(specs, useCases);
  if (tasks.length === 0) return null;
  const justCount = tasks.filter((t) => t.level === "just").length;
  return {
    product,
    cash,
    yearsMin: outlook.yearsMin,
    yearsMax: outlook.yearsMax,
    yearsMid: (outlook.yearsMin + outlook.yearsMax) / 2,
    tasks,
    viable: tasks.every((t) => t.level !== "no"),
    justCount,
  };
}

function costPerYear(e: PodiumEntry): number {
  return (e.cash / e.yearsMid) * (1 + JUST_PENALTY * e.justCount);
}

function minBy<T>(items: T[], key: (item: T) => number): T | null {
  let best: T | null = null;
  let bestKey = Infinity;
  for (const item of items) {
    const k = key(item);
    if (k < bestKey) {
      best = item;
      bestKey = k;
    }
  }
  return best;
}

export function buildPodium(input: PodiumInput): PodiumPlan | null {
  const { products, useCases, budgetCash } = input;
  const entries = products.map((p) => toEntry(p, useCases)).filter((e): e is PodiumEntry => e !== null);
  if (entries.length < 3) return null;
  const viable = entries.filter((e) => e.viable);
  if (viable.length < 2) return null;

  // Recomendada: la de mejor costo por año de las que entran en el presupuesto
  // (si ninguna entra, la más barata de las que sirven).
  const inBudget = budgetCash != null ? viable.filter((e) => e.cash <= budgetCash) : viable;
  const recPool = inBudget.length > 0 ? inBudget : [minBy(viable, (e) => e.cash)].filter((e): e is PodiumEntry => e !== null);
  const rec = minBy(recPool, costPerYear);
  if (!rec) return null;

  const picks: PodiumPick[] = [{ role: "recommended", entry: rec }];
  const taken = new Set<string>([rec.product.id]);

  const cheaper = minBy(
    viable.filter((e) => !taken.has(e.product.id) && e.cash <= rec.cash * CHEAPER_MARGIN),
    (e) => e.cash
  );
  if (cheaper) {
    picks.push({ role: "cheapest", entry: cheaper });
    taken.add(cheaper.product.id);
  }

  const limit = budgetCash != null ? budgetCash * OVER_BUDGET_TOLERANCE : rec.cash * 1.4;
  const lasting = minBy(
    viable.filter((e) => !taken.has(e.product.id) && e.yearsMid > rec.yearsMid && e.cash <= limit),
    // Más años primero; a igualdad de años, el más barato.
    (e) => -e.yearsMid * 1e9 + e.cash
  );
  if (lasting) {
    picks.push({ role: "lasting", entry: lasting });
    taken.add(lasting.product.id);
  }

  // Escalera: los elegidos + el tope de gama razonable + la que "queda corta"
  // más cercana por debajo (para mostrar por qué no se recomienda).
  const roleById = new Map<string, PodiumRole>(picks.map((p) => [p.entry.product.id, p.role]));
  const ladderEntries: PodiumEntry[] = picks.map((p) => p.entry);
  const maxPickCash = Math.max(...ladderEntries.map((e) => e.cash));
  const minPickCash = Math.min(...ladderEntries.map((e) => e.cash));

  const top = minBy(
    viable.filter((e) => !taken.has(e.product.id) && e.cash > maxPickCash && e.cash <= rec.cash * 1.6),
    (e) => -e.yearsMid * 1e9 + e.cash
  );
  if (top) ladderEntries.push(top);

  const tooShort = entries.filter((e) => !e.viable && e.cash < minPickCash);
  const closestShort = minBy(tooShort, (e) => -e.cash);
  if (closestShort) ladderEntries.push(closestShort);

  const ladder: LadderItem[] = ladderEntries
    .sort((a, b) => a.cash - b.cash)
    .slice(0, MAX_LADDER)
    .map((entry) => ({
      entry,
      role: roleById.get(entry.product.id) ?? null,
      tooShort: !entry.viable,
    }));

  return {
    picks,
    ladder,
    budgetCash,
    consideredCount: entries.length,
    rest: products.filter((p) => !taken.has(p.id)),
  };
}

// ─── Qué cambia entre dos escalones ──────────────────────────────────────────

export interface StepDiff {
  priceDelta: number;
  yearsDelta: number;
  gains: string[];
  losses: string[];
  // Tareas que mejoran / empeoran, en frase corta.
  unlocked: string[];
  worsened: string[];
}

const TIER_WORD: Record<ProcessorTier, string> = {
  low: "básica",
  mid: "intermedia",
  high: "rápida",
  enthusiast: "muy potente",
};

const LEVEL_RANK: Record<TaskLevel, number> = { no: 0, just: 1, ok: 2 };

function fmtGb(gb: number): string {
  return gb >= 1000 ? `${(gb / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} TB` : `${gb} GB`;
}

export function diffEntries(from: PodiumEntry, to: PodiumEntry): StepDiff {
  const a = (from.product.specs ?? {}) as Partial<NotebookSpecs>;
  const b = (to.product.specs ?? {}) as Partial<NotebookSpecs>;
  const gains: string[] = [];
  const losses: string[] = [];

  if (a.ram_gb && b.ram_gb && a.ram_gb !== b.ram_gb) {
    const ratio = b.ram_gb / a.ram_gb;
    const up = b.ram_gb > a.ram_gb;
    const how = ratio === 2 ? "el doble de memoria" : ratio === 0.5 ? "la mitad de memoria" : up ? "más memoria" : "menos memoria";
    (up ? gains : losses).push(`${how} (de ${a.ram_gb} a ${b.ram_gb} GB)`);
  }
  if (a.storage_gb && b.storage_gb && a.storage_gb !== b.storage_gb) {
    const up = b.storage_gb > a.storage_gb;
    (up ? gains : losses).push(`${up ? "más" : "menos"} espacio para guardar (${fmtGb(b.storage_gb)}, antes ${fmtGb(a.storage_gb)})`);
  }
  if (a.processor_tier && b.processor_tier && a.processor_tier !== b.processor_tier) {
    const up = TIER_RANK[b.processor_tier] > TIER_RANK[a.processor_tier];
    (up ? gains : losses).push(
      `${up ? "más rapidez" : "menos rapidez"}: pasa de ${TIER_WORD[a.processor_tier]} a ${TIER_WORD[b.processor_tier]}`
    );
  }

  const unlocked: string[] = [];
  const worsened: string[] = [];
  for (const t of to.tasks) {
    const before = from.tasks.find((x) => x.key === t.key);
    if (!before) continue;
    const d = LEVEL_RANK[t.level] - LEVEL_RANK[before.level];
    if (d > 0) unlocked.push(`${t.label}: ${t.level === "ok" ? "pasa a andar bien" : "pasa a andar justo"}`);
    if (d < 0) worsened.push(`${t.label}: ${t.level === "no" ? "ya no te va a andar" : "va a andar justo"}`);
  }

  return {
    priceDelta: to.cash - from.cash,
    yearsDelta: to.yearsMid - from.yearsMid,
    gains,
    losses,
    unlocked,
    worsened,
  };
}

export type StepVerdictTone = "strong" | "optional" | "skip";

export function stepVerdict(d: StepDiff): { tone: StepVerdictTone; text: string } | null {
  if (d.priceDelta <= 0) return null;
  if (d.unlocked.length > 0) return { tone: "strong", text: "Vale la pena: arregla algo que hoy te falla." };
  if (d.yearsDelta >= 1) return { tone: "optional", text: "Opcional: pagás más para que te dure más." };
  return { tone: "skip", text: "No hace falta para lo que hacés." };
}

export function yearsText(delta: number): string {
  const n = Math.abs(delta);
  if (n >= 0.75 && n < 1.25) return "1 año";
  if (n >= 1.25 && Math.abs(n - Math.round(n)) < 0.25) return `${Math.round(n)} años`;
  return n < 0.75 ? "menos de un año" : `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })} años`;
}
