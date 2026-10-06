// Explicación característica por característica ("¿qué estoy comprando?") para
// usuarios sin conocimiento técnico. Determinístico (sin LLM). Cada ítem dice:
// qué es (con una analogía), el dato real, y qué significa PARA EL USO que el
// usuario contó. El dato técnico exacto va aparte (`tech`) para quien lo entienda.

import {
  explainBatteryMeaning,
  extraCardFacts,
  formatUseCasesLabel,
  sanitizeSpecs,
  type HighlightLevel,
} from "./specExplainer";
import { getRequiredPhoneSpecs, getRequiredSpecs, TIER_RANK } from "./usageToSpecs";
import type {
  NotebookSpecs,
  PhoneSpecs,
  ProcessorTier,
  ProductCategory,
  ProductSpecs,
  StorageType,
  TabletSpecs,
  UseCase,
} from "@/types";

export interface SpecDetail {
  icon: string;
  label: string;
  // Dato real, corto y grande ("16 GB", "Ryzen 5", "6,7\"").
  value: string;
  level: HighlightLevel;
  verdict: string;
  // Qué es + qué significa para el usuario, 1-3 frases.
  why: string;
  // Detalle técnico exacto para quien lo quiera ("AMD Ryzen 5 5500U · SSD NVMe").
  tech?: string;
}

export interface SpecDetailInput {
  category: ProductCategory;
  title: string;
  specs?: ProductSpecs;
}

const VERDICT: Record<HighlightLevel, string> = { great: "De sobra", ok: "Te alcanza bien", warn: "Justo" };

const TIER_PLAIN: Record<ProcessorTier, string> = {
  low: "básico: alcanza para navegar, redes y documentos simples",
  mid: "intermedio: cómodo para oficina, estudio y varias cosas a la vez",
  high: "potente: aguanta tareas exigentes como edición o muchas cosas pesadas a la vez",
  enthusiast: "de lo más potente que hay: pensado para edición profesional, diseño 3D o juegos exigentes",
};

const STORAGE_TYPE_PLAIN: Record<StorageType, string> = {
  HDD: "disco rígido tradicional (más lento: tarda en prender y abrir programas)",
  SSD_SATA: "disco SSD (prende y abre programas en segundos)",
  SSD_NVME: "disco SSD NVMe (el más rápido: prende y abre todo casi al instante)",
};

function fmtStorage(gb: number): string {
  return gb >= 1000 ? `${(gb / 1000).toLocaleString("es-AR")} TB` : `${gb} GB`;
}

function ramDetail(ramGb: number, requiredGb: number, useLabel: string): SpecDetail {
  const level: HighlightLevel = ramGb >= requiredGb * 2 ? "great" : ramGb >= requiredGb ? "ok" : "warn";
  const intro = "La memoria es como el tamaño de tu escritorio de trabajo: cuanto más grande, más cosas podés tener abiertas a la vez sin que se trabe.";
  const verdictText =
    level === "great"
      ? `Para ${useLabel} te sobra: vas a poder tener muchas cosas abiertas sin problema.`
      : level === "ok"
        ? `Para ${useLabel} alcanza bien, sin lujos.`
        : `Para ${useLabel} queda justa: con varias cosas abiertas a la vez puede ponerse lenta.`;
  return { icon: "🍳", label: "Memoria", value: `${ramGb} GB`, level, verdict: VERDICT[level], why: `${intro} ${verdictText}`, tech: `${ramGb} GB de RAM` };
}

function storageDetail(
  gb: number,
  type: StorageType | undefined,
  category: ProductCategory
): SpecDetail {
  const big = category === "notebook" || category === "desktop" ? 512 : 256;
  const level: HighlightLevel = gb >= big ? "great" : gb >= big / 2 ? "ok" : "warn";
  const intro = "Es el lugar donde se guardan tus fotos, videos, documentos y programas.";
  const sizeText =
    level === "great"
      ? "Tenés espacio de sobra: no te vas a quedar sin lugar pronto."
      : level === "ok"
        ? "Alcanza para uso normal, pero si guardás muchos videos o juegos se puede llenar con el tiempo."
        : "Es poco: se puede llenar rápido con fotos, videos y programas.";
  const speedText = type ? ` Además es ${STORAGE_TYPE_PLAIN[type]}.` : "";
  return {
    icon: "🗄️",
    label: "Espacio para guardar",
    value: fmtStorage(gb),
    level,
    verdict: VERDICT[level],
    why: `${intro} ${sizeText}${speedText}`,
    tech: `${fmtStorage(gb)}${type ? ` · ${type === "SSD_NVME" ? "SSD NVMe" : type === "SSD_SATA" ? "SSD" : "HDD"}` : ""}`,
  };
}

function notebookDetails(s: Partial<NotebookSpecs>, useCases: UseCase[], useLabel: string): SpecDetail[] {
  const out: SpecDetail[] = [];
  const req = getRequiredSpecs(useCases);

  if (s.processor_tier) {
    const diff = TIER_RANK[s.processor_tier] - TIER_RANK[req.processor_tier];
    const level: HighlightLevel = diff < 0 ? "warn" : diff > 1 ? "great" : "ok";
    const fit =
      level === "great"
        ? `Para ${useLabel} te sobra potencia.`
        : level === "ok"
          ? `Para ${useLabel} anda cómodo.`
          : `Para ${useLabel} puede quedarse algo corto.`;
    out.push({
      icon: "⚙️",
      label: "Rapidez",
      value: TIER_VALUE[s.processor_tier],
      level,
      verdict: VERDICT[level],
      why: `El procesador es el cerebro: decide qué tan rápido responde todo. Este es ${TIER_PLAIN[s.processor_tier]}. ${fit}`,
      tech: s.processor_model ? `${s.processor_brand ?? ""} ${s.processor_model}`.trim() : undefined,
    });
  }
  if (s.ram_gb) out.push(ramDetail(s.ram_gb, req.ram_gb, useLabel));
  if (s.storage_gb) out.push(storageDetail(s.storage_gb, s.storage_type, "notebook"));

  if (s.gpu) {
    const needs = req.gpu === "dedicated";
    if (s.gpu === "dedicated") {
      out.push({
        icon: "🎮",
        label: "Gráficos (juegos y diseño)",
        value: "Placa dedicada",
        level: "great",
        verdict: "De sobra",
        why: "Es una placa de video aparte, pensada para mover juegos, edición de video y diseño con fluidez.",
        tech: s.gpu_model ?? undefined,
      });
    } else {
      out.push({
        icon: "🎮",
        label: "Gráficos (juegos y diseño)",
        value: "Básicos",
        level: needs ? "warn" : "ok",
        verdict: needs ? "Justo" : "Te alcanza bien",
        why: needs
          ? `No tiene placa de video aparte: sirve para ver películas y trabajar, pero para ${useLabel} puede quedarse corta.`
          : "No tiene placa de video aparte: es perfecta para ver películas, navegar y trabajar, pero no está pensada para juegos pesados.",
      });
    }
  }
  return out;
}

const TIER_VALUE: Record<ProcessorTier, string> = {
  low: "Básica",
  mid: "Intermedia",
  high: "Alta",
  enthusiast: "Tope de gama",
};

function phoneDetails(s: Partial<PhoneSpecs>, useCases: UseCase[], useLabel: string): SpecDetail[] {
  const out: SpecDetail[] = [];
  const req = getRequiredPhoneSpecs(useCases);
  if (s.ram_gb) out.push(ramDetail(s.ram_gb, req.min_ram_gb, useLabel));
  if (s.storage_gb) out.push(storageDetail(s.storage_gb, undefined, "phone"));
  if (s.main_camera_mp) {
    const mp = s.main_camera_mp;
    const level: HighlightLevel = mp >= 100 ? "great" : mp >= 48 ? "ok" : "warn";
    out.push({
      icon: "📷",
      label: "Cámara",
      value: `${mp} MP`,
      level,
      verdict: level === "warn" ? "Básica" : level === "great" ? "Muy buena" : "Buena",
      why: `Los megapíxeles indican cuánto detalle capta una foto (la calidad también depende de la luz y el lente). ${
        level === "great"
          ? "Esta toma fotos con muchísimo detalle y podés ampliarlas sin que se pierdan."
          : level === "ok"
            ? "Saca fotos nítidas para el uso diario y redes."
            : "Alcanza para fotos del día a día, sin grandes pretensiones."
      }`,
      tech: `Cámara principal de ${mp} MP`,
    });
  }
  if (s.battery_mah) {
    const level: HighlightLevel = s.battery_mah >= 5000 ? "great" : s.battery_mah >= 4000 ? "ok" : "warn";
    out.push({
      icon: "🔋",
      label: "Batería",
      value: `${s.battery_mah.toLocaleString("es-AR")} mAh`,
      level,
      verdict: level === "great" ? "Dura mucho" : level === "ok" ? "Dura un día" : "Dura poco",
      why: explainBatteryMeaning(s.battery_mah, "phone"),
      tech: `${s.battery_mah.toLocaleString("es-AR")} mAh`,
    });
  }
  return out;
}

function tabletDetails(s: Partial<TabletSpecs>, useLabel: string): SpecDetail[] {
  const out: SpecDetail[] = [];
  if (s.ram_gb) out.push(ramDetail(s.ram_gb, 4, useLabel));
  if (s.storage_gb) out.push(storageDetail(s.storage_gb, undefined, "tablet"));
  return out;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildSpecDetails(product: SpecDetailInput, useCases: UseCase[]): SpecDetail[] {
  if (!product.specs) return [];
  const specs = sanitizeSpecs(product.category, product.specs, product.title);
  const useLabel = useCases.length > 0 ? formatUseCasesLabel(useCases) : "el uso de todos los días";
  const cat = product.category;

  let details: SpecDetail[] = [];
  if (cat === "notebook" || cat === "desktop") details = notebookDetails(specs as Partial<NotebookSpecs>, useCases, useLabel);
  else if (cat === "phone") details = phoneDetails(specs as Partial<PhoneSpecs>, useCases, useLabel);
  else if (cat === "tablet") details = tabletDetails(specs as Partial<TabletSpecs>, useLabel);

  // Batería de notebook (Wh) — solo si el dato es creíble.
  if (cat === "notebook") {
    const wh = (specs as Partial<NotebookSpecs>).battery_wh;
    if (wh && wh >= 20 && wh <= 120) {
      const level: HighlightLevel = wh >= 65 ? "great" : wh >= 42 ? "ok" : "warn";
      details.push({
        icon: "🔋",
        label: "Batería",
        value: `${wh} Wh`,
        level,
        verdict: level === "great" ? "Dura mucho" : level === "ok" ? "Dura bastante" : "Dura poco",
        why: explainBatteryMeaning(wh, "notebook"),
        tech: `${wh} Wh`,
      });
    }
  }

  // Pantalla / tamaño / peso, con la comparación cotidiana (botella, hoja A4…).
  for (const f of extraCardFacts(cat, specs, product.title)) {
    details.push({
      icon: f.label === "Peso" ? "⚖️" : f.label === "Pantalla" ? "🖥️" : "📏",
      label: f.label === "En la mano" ? "Tamaño en la mano" : f.label,
      value: f.value ?? "",
      level: "ok",
      verdict: "",
      why: capitalize(f.text) + ".",
      tech: f.value,
    });
  }
  return details;
}
