// "¿Cuánto me va a durar?" y "¿qué puedo mejorar después?" en lenguaje llano.
// Determinístico (sin LLM) y deliberadamente una ESTIMACIÓN: se muestra como
// rango de años de uso cómodo, no como garantía. Se apoya en lo que realmente
// condiciona la vida útil de cada categoría (procesador y memoria en notebook,
// memoria/almacenamiento/sistema en celular y tablet).

import { formatUseCasesLabel, translationStrip } from "./specExplainer";
import type {
  NotebookSpecs,
  PhoneSpecs,
  ProductCategory,
  ProductSpecs,
  TabletSpecs,
  UseCase,
} from "@/types";

export interface Outlook {
  // "4 a 5 años"
  years: string;
  // Una frase que explica el número, citando el uso del usuario.
  summary: string;
  // Qué suma o resta (frases cortas, la más importante primero).
  reasons: { good: boolean; text: string }[];
  // Qué se puede mejorar después, y qué no.
  canUpgrade: string[];
  cannotUpgrade: string[];
}

export interface OutlookInput {
  category: ProductCategory;
  title: string;
  specs?: ProductSpecs;
}

const TIER_YEARS = { low: 3, mid: 4, high: 5, enthusiast: 5.5 } as const;

function range(score: number): string {
  const lo = Math.max(1, Math.round(score));
  const hi = lo + 1;
  return `${lo} a ${hi} años`;
}

function fmtGb(gb: number): string {
  return gb >= 1000 ? `${(gb / 1000).toLocaleString("es-AR")} TB` : `${gb} GB`;
}

function computerOutlook(
  category: ProductCategory,
  specs: Partial<NotebookSpecs>,
  useCases: UseCase[],
  title: string
): Outlook | null {
  if (!specs.processor_tier) return null;
  const reasons: Outlook["reasons"] = [];
  let score: number = TIER_YEARS[specs.processor_tier];
  reasons.push({
    good: specs.processor_tier !== "low",
    text:
      specs.processor_tier === "low"
        ? "El procesador es básico: va a quedar corto antes."
        : specs.processor_tier === "mid"
          ? "El procesador es intermedio: aguanta bien varios años."
          : "El procesador es potente: tiene margen para los próximos años.",
  });

  const ram = specs.ram_gb;
  const ramUp = !!specs.ram_upgradeable;
  if (typeof ram === "number" && ram > 0) {
    if (ram < 8) {
      score -= ramUp ? 0.5 : 1.5;
      reasons.push({ good: false, text: `${ram} GB de memoria es poco hoy${ramUp ? ", pero se puede ampliar" : " y no se puede ampliar"}.` });
    } else if (ram === 8) {
      score -= ramUp ? 0 : 0.5;
      reasons.push({ good: ramUp, text: `${ram} GB de memoria alcanza hoy${ramUp ? " y se puede ampliar más adelante" : ", pero con los años va a quedar justo y no se amplía"}.` });
    } else if (ram >= 32) {
      score += 1;
      reasons.push({ good: true, text: `${ram} GB de memoria: te sobra para muchos años.` });
    } else {
      score += 0.5;
      reasons.push({ good: true, text: `${ram} GB de memoria: cómodo para los próximos años.` });
    }
  }

  if (specs.storage_type === "HDD") {
    score -= 1;
    reasons.push({ good: false, text: "Tiene disco rígido tradicional: se va a sentir lenta antes (se arregla cambiándolo por un SSD)." });
  } else if (typeof specs.storage_gb === "number" && specs.storage_gb > 0 && specs.storage_gb < 256) {
    score -= 0.5;
    reasons.push({ good: false, text: `${fmtGb(specs.storage_gb)} de espacio se llena rápido.` });
  }

  // ¿Alcanza para el uso pedido? Si algo está justo, resta.
  const chips = translationStrip(category, specs as ProductSpecs, useCases, title);
  const warns = chips.filter((c) => c.level === "warn");
  if (warns.length > 0) {
    score -= 0.5 * Math.min(2, warns.length);
    reasons.push({ good: false, text: `Para tu uso ya está justa en ${warns.map((w) => w.label.toLowerCase()).join(" y ")}.` });
  }

  // Jugar envejece más rápido: los juegos nuevos exigen cada vez más a la placa
  // de video, que además no se puede cambiar en una notebook.
  if (useCases.some((u) => u.startsWith("gaming"))) {
    score -= 1;
    reasons.push({ good: false, text: "Para jugar, los juegos nuevos piden cada vez más: la placa de video es lo primero que va a quedar corta." });
  }

  const useLabel = useCases.length > 0 ? formatUseCasesLabel(useCases) : "el uso de todos los días";
  const years = range(score);
  const noun = category === "desktop" ? "esta PC" : "esta notebook";

  const canUpgrade: string[] = [];
  const cannotUpgrade: string[] = [];
  if (ramUp) canUpgrade.push(`La memoria${typeof ram === "number" ? ` (hoy ${ram} GB)` : ""}: es barato agregarle más.`);
  else cannotUpgrade.push("La memoria viene soldada: lo que trae es lo que va a tener.");
  if (specs.storage_upgradeable) canUpgrade.push("El disco: podés cambiarlo por uno más grande o más rápido.");
  else cannotUpgrade.push("El disco no se cambia fácil.");
  if (category === "desktop") {
    canUpgrade.push("En general también la placa de video y el procesador (según el modelo).");
  } else {
    cannotUpgrade.push("El procesador y la placa de video vienen soldados y no se cambian.");
    cannotUpgrade.push("La pantalla tampoco se cambia.");
    canUpgrade.push("La batería se puede reemplazar en un service cuando se desgaste.");
  }

  return {
    years,
    summary: `Para ${useLabel}, ${noun} te debería durar entre ${years.replace(' a ', ' y ')} antes de que empieces a notarla lenta.`,
    reasons: reasons.slice(0, 4),
    canUpgrade,
    cannotUpgrade,
  };
}

function phoneOutlook(specs: Partial<PhoneSpecs>): Outlook {
  const ios = specs.os === "iOS";
  let score = ios ? 5 : 3;
  const reasons: Outlook["reasons"] = [];
  if (ios) reasons.push({ good: true, text: "Apple actualiza sus celulares durante muchos años." });
  else reasons.push({ good: false, text: "Los Android de esta gama reciben actualizaciones por pocos años." });
  const ram = specs.ram_gb;
  if (typeof ram === "number" && ram > 0) {
    if (ram <= 4) {
      score -= 1;
      reasons.push({ good: false, text: `${ram} GB de memoria: con las apps nuevas se va a ir trabando.` });
    } else if (ram >= 8) {
      score += 1;
      reasons.push({ good: true, text: `${ram} GB de memoria: aguanta bien las apps del futuro.` });
    }
  }
  const st = specs.storage_gb;
  if (typeof st === "number" && st > 0 && st < 128) {
    score -= 0.5;
    reasons.push({ good: false, text: `${st} GB de espacio: se llena con fotos y videos.` });
  }
  const years = range(score);
  return {
    years,
    summary: `Un celular así te debería andar bien entre ${years.replace(' a ', ' y ')}. La batería es lo primero que se gasta: a los 2 o 3 años dura menos.`,
    reasons: reasons.slice(0, 4),
    canUpgrade: ["La batería se puede cambiar en un service técnico."],
    cannotUpgrade: ["Memoria, espacio y procesador no se pueden mejorar: elegí bien hoy."],
  };
}

function tabletOutlook(specs: Partial<TabletSpecs>): Outlook {
  let score = specs.processor_tier ? TIER_YEARS[specs.processor_tier] - 0.5 : 3;
  const reasons: Outlook["reasons"] = [];
  const ram = specs.ram_gb;
  if (typeof ram === "number" && ram > 0) {
    if (ram <= 3) {
      score -= 1;
      reasons.push({ good: false, text: `${ram} GB de memoria: se va a quedar corta pronto.` });
    } else if (ram >= 6) {
      score += 0.5;
      reasons.push({ good: true, text: `${ram} GB de memoria: cómoda para los próximos años.` });
    }
  }
  const years = range(score);
  return {
    years,
    summary: `Una tablet así te debería durar entre ${years.replace(' a ', ' y ')}, hasta que las apps nuevas empiecen a pedirle más.`,
    reasons,
    canUpgrade: specs.storage_upgradeable ? ["El espacio: podés ampliarlo con una tarjeta de memoria."] : [],
    cannotUpgrade: ["Memoria y procesador no se pueden mejorar.", "La batería solo se cambia en un service."],
  };
}

export function buildOutlook(product: OutlookInput, useCases: UseCase[]): Outlook | null {
  const specs = product.specs;
  if (!specs) return null;
  switch (product.category) {
    case "notebook":
    case "desktop":
      return computerOutlook(product.category, specs as Partial<NotebookSpecs>, useCases, product.title);
    case "phone":
      return phoneOutlook(specs as Partial<PhoneSpecs>);
    case "tablet":
      return tabletOutlook(specs as Partial<TabletSpecs>);
    case "tv":
      return {
        years: "7 a 10 años",
        summary: "Una TV suele durar entre 7 y 10 años. Lo que primero queda viejo es el sistema Smart.",
        reasons: [],
        canUpgrade: ["Si el Smart se pone lento, se arregla barato con un Chromecast o Fire TV Stick."],
        cannotUpgrade: ["El panel y los puertos no se pueden cambiar."],
      };
    default:
      return null;
  }
}
