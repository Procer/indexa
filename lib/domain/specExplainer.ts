// Traduce specs técnicas en explicaciones concretas y en lenguaje simple,
// para usuarios sin conocimiento técnico. Determinístico (no usa LLM) para
// que la explicación esté siempre fresca y grounded en los datos reales del
// producto, sin depender del caché de 24hs del análisis de precio/calidad.

import type {
  GpuType,
  NotebookSpecs,
  PhoneSpecs,
  ProcessorTier,
  ProductCategory,
  ProductSpecs,
  StorageType,
  TabletSpecs,
  UseCase,
} from "@/types";
import { getRequiredSpecs, PHONE_USE_CASE_SPECS, TIER_RANK } from "./usageToSpecs";

const TIER_LABEL: Record<ProcessorTier, string> = {
  low: "básica",
  mid: "intermedia",
  high: "alta",
  enthusiast: "tope de gama",
};

const TIER_USE_EXPLAIN: Record<ProcessorTier, string> = {
  low: "alcanza para lo esencial: navegar, redes sociales y documentos simples",
  mid: "cómoda para oficina, estudio y varias apps abiertas a la vez sin trabarse",
  high: "rápida incluso con tareas exigentes como edición o multitarea pesada",
  enthusiast: "pensada para las tareas más demandantes: edición profesional, diseño 3D o gaming competitivo",
};

const USE_CASE_LABEL: Partial<Record<UseCase, string>> = {
  casual_browsing: "uso diario",
  office: "trabajo de oficina",
  study: "estudio",
  multimedia: "ver películas y series",
  photo_editing_light: "edición de fotos",
  photo_editing_pro: "edición de fotos profesional",
  video_editing_1080: "edición de video",
  video_editing_4k: "edición de video en 4K",
  programming: "programar",
  gaming_casual: "jugar",
  gaming_competitive: "gaming competitivo",
  graphic_design: "diseño gráfico",
  cad_3d: "diseño 3D",
  portability: "llevarla a todos lados",
  stationary: "uso fijo en casa",
  photography: "sacar fotos",
  battery_life: "que la batería te dure todo el día",
  gaming_mobile: "jugar desde el celular",
  basic_use: "uso básico",
  social_media: "redes sociales",
  professional_mobile: "trabajo y email",
};

export function formatUseCasesLabel(useCases: UseCase[]): string {
  const labels = useCases.map((u) => USE_CASE_LABEL[u]).filter((l): l is string => Boolean(l));
  if (labels.length === 0) return "tu uso";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}

function ramBullet(ramGb: number, requiredGb: number): string {
  if (ramGb >= requiredGb * 2) {
    return `${ramGb}GB de RAM: el doble (o más) de lo que necesitás — podés tener el navegador con muchas pestañas, Excel y videollamadas abiertos a la vez sin que se cuelgue.`;
  }
  if (ramGb > requiredGb) {
    return `${ramGb}GB de RAM: más que suficiente para tu uso, no se va a trabar aunque tengas varias cosas abiertas.`;
  }
  if (ramGb === requiredGb) {
    return `${ramGb}GB de RAM: justo lo necesario para tu uso — anda bien, aunque sin mucho margen si con el tiempo abrís más programas.`;
  }
  return `${ramGb}GB de RAM: por debajo de los ${requiredGb}GB recomendados para tu uso — puede sentirse lenta con varias apps abiertas.`;
}

function processorBullet(
  brand: string,
  model: string,
  tier: ProcessorTier,
  requiredTier: ProcessorTier
): string {
  const base = `Procesador ${brand} ${model} (gama ${TIER_LABEL[tier]}): ${TIER_USE_EXPLAIN[tier]}`;
  if (TIER_RANK[tier] < TIER_RANK[requiredTier]) {
    return `${base}. Puede quedarse un poco corto para lo que buscás.`;
  }
  if (TIER_RANK[tier] > TIER_RANK[requiredTier] + 1) {
    return `${base} — de sobra para lo que necesitás.`;
  }
  return `${base}.`;
}

function storageBullet(storageGb: number, storageType: StorageType): string {
  if (storageType === "HDD") {
    return `Disco rígido (HDD) de ${storageGb}GB: guarda bastante, pero tarda más en prender y abrir programas que un SSD.`;
  }
  const nvme = storageType === "SSD_NVME";
  return `SSD${nvme ? " NVMe (el más rápido)" : ""} de ${storageGb}GB: la compu prende y abre programas en segundos, mucho más rápido que un disco rígido tradicional.`;
}

function wantsNumericKeyboard(useCases: UseCase[]): boolean {
  return useCases.includes("office");
}

function numericKeyboardBullet(): string {
  return "Teclado numérico: tiene teclado numérico aparte, cómodo para cargar números seguido (planillas, contabilidad).";
}

function gpuBullet(gpu: GpuType, gpuModel: string | null): string {
  if (gpu === "dedicated") {
    return `Tiene placa de video dedicada${gpuModel ? ` (${gpuModel})` : ""}: necesaria para que corra fluido lo que buscás, no solo con la gráfica integrada del procesador.`;
  }
  return `No tiene placa de video dedicada, solo gráfica integrada — puede quedarse corta para lo que buscás.`;
}

function storageQuickNote(storageGb: number): string {
  if (storageGb >= 256) return "espacio de sobra para fotos, apps y videos sin quedarte sin lugar";
  if (storageGb >= 128) return "alcanza para uso normal, con fotos y apps sin problema";
  return "justo para lo básico — se puede llenar rápido con fotos y videos";
}

function batteryQuickNote(mah: number): string {
  if (mah >= 5000) return "te dura fácil todo el día, incluso con uso intenso";
  if (mah >= 4000) return "te alcanza para un día normal de uso";
  return "puede quedarte corta en un día de uso intenso";
}

// ─── "Qué significa esto en la práctica" ──────────────────────────────────────
// A diferencia de explainProductSpecsSimple (que compara contra lo que un uso
// declarado requiere), estas funciones explican el valor crudo de una spec en
// sí mismo — para contextos sin uso declarado, como el comparador 1 a 1, donde
// lo único que hay es "esta tiene 42Wh" y hay que traducir qué implica eso.

// Referencia para traducir Wh de notebook/desktop a algo tangible: batería
// típica de un celular de gama media (~4000mAh a 3.85V ≈ 15Wh). No es una
// medida exacta (ver nota en la función), es una equivalencia para dar
// noción de magnitud, no una promesa de autonomía real.
const PHONE_BATTERY_WH_REF = 15;

function phoneChargesEquivalent(wh: number): string {
  const charges = Math.round((wh / PHONE_BATTERY_WH_REF) * 2) / 2;
  const label = Number.isInteger(charges) ? `${charges}` : charges.toFixed(1).replace(".", ",");
  return `unas ${label} cargas completas de un celular`;
}

/** Explica en la práctica qué significa la autonomía de batería (Wh para notebook/desktop, mAh para celular). */
export function explainBatteryMeaning(
  value: number,
  category: "phone" | "notebook" | "desktop"
): string {
  if (category === "phone") {
    if (value >= 5000) return "Batería grande: aguanta de que te levantás hasta la noche —redes, cámara y WhatsApp incluidos— sin tener que buscar el cargador en todo el día.";
    if (value >= 4000) return "Batería mediana: te alcanza para un día normal de uso (redes sociales, WhatsApp, alguna llamada), pero si la exigís a fondo —cámara y juegos todo el día— puede que llegués justo a la noche.";
    return "Batería más chica: en un día de uso normal probablemente termines con el cargador cerca antes de que anochezca.";
  }
  // Nota: la equivalencia en cargas de celular es una referencia de magnitud
  // (Wh de la notebook contra una batería de celular típica), no un cálculo
  // de autonomía real — la eficiencia de cada equipo varía.
  const charges = phoneChargesEquivalent(value);
  if (value >= 65) return `Autonomía alta: varias horas de uso sin depender del cargador — cómoda para llevarla a la facu o el trabajo sin el cargador encima. Como referencia de magnitud, esta batería guarda ${charges}.`;
  if (value >= 42) return `Autonomía media: alcanza para varias horas de uso normal, pero en uso intenso (video, juegos) puede que necesites el cargador cerca. Como referencia de magnitud, esta batería guarda ${charges}.`;
  return `Autonomía más corta: probablemente necesites tener el cargador a mano durante el día. Como referencia de magnitud, esta batería guarda ${charges}.`;
}

/** Explica en la práctica qué implica el tamaño/tipo de pantalla. */
export function explainScreenMeaning(
  inches: number,
  category: ProductCategory
): string {
  if (category === "phone") {
    if (inches >= 6.5) return "Pantalla grande: mejor para ver videos, jugar o leer, pero un poco más incómoda para usar con una sola mano.";
    if (inches >= 6.0) return "Tamaño intermedio: buen equilibrio entre cómoda para ver contenido y manejable con una mano.";
    return "Pantalla compacta: muy cómoda para usar con una mano y el bolsillo, aunque un poco más chica para ver videos o leer.";
  }
  if (inches >= 16) return "Pantalla grande: cómoda para ver películas o trabajar con varias ventanas a la vez, pero más pesada y menos práctica para llevar todos los días.";
  if (inches >= 14) return "Tamaño intermedio: buen equilibrio entre comodidad para trabajar y lo fácil que es llevarla a todos lados.";
  return "Pantalla chica: muy fácil de transportar, ideal si la llevás todos los días, aunque un poco más ajustada para tener varias ventanas abiertas.";
}

// Objeto cotidiano de referencia para el peso, calibrado en botellas de agua
// de 1,5L (~1,5kg cada una) por ser un objeto de peso conocido y manejable.
function weightObjectComparison(weightKg: number): string {
  if (weightKg <= 1.3) return "parecido a una botella de agua de 1,5 litros";
  if (weightKg <= 1.8) return "como dos botellas de agua de 1,5 litros";
  if (weightKg <= 2.3) return "como un diccionario grande";
  return "como tres botellas de agua de 1,5 litros juntas";
}

/** Compara el tamaño físico con un objeto cotidiano conocido, para dar una referencia tangible más allá de las pulgadas. */
export function explainPhysicalSize(
  inches: number,
  category: ProductCategory,
  weightKg?: number | null
): string {
  if (category === "phone") {
    if (inches >= 6.5) return "Tamaño físico: puede sobresalir un poco del bolsillo del jean, algo normal en los celulares grandes de hoy.";
    if (inches >= 6.0) return "Tamaño físico: entra cómodo en el bolsillo del jean, sin sentirse enorme en la mano.";
    return "Tamaño físico: entra cómodo en cualquier bolsillo, incluso los más chicos.";
  }

  if (category === "tablet") {
    if (inches >= 11) return "Tamaño físico: como una revista grande — para llevarla todos los días conviene un bolso o mochila, no entra en una cartera chica.";
    if (inches >= 9) return "Tamaño físico: parecida a una revista, entra en la mayoría de las mochilas sin problema.";
    return "Tamaño físico: similar a un libro de bolsillo, fácil de llevar hasta en una cartera chica.";
  }

  const weightNote = weightKg
    ? ` Pesa ${weightKg}kg —${weightObjectComparison(weightKg)}—${
        weightKg <= 1.5
          ? ", se siente liviana en la mochila"
          : weightKg <= 2
          ? ", peso normal para una notebook"
          : ", vas a notar el peso extra si la llevás todos los días"
      }.`
    : "";

  if (inches >= 17) return `Tamaño físico: grande, como una carpeta de tamaño oficio — pensada más para uso fijo que para cargarla todos los días.${weightNote}`;
  if (inches >= 15) return `Tamaño físico: un poco más grande que una hoja de carpeta — se nota al llevarla en la mochila todos los días.${weightNote}`;
  if (inches >= 13) return `Tamaño físico: más o menos como una hoja A4, cómoda para llevar todos los días.${weightNote}`;
  return `Tamaño físico: chica y liviana, entra fácil en cualquier mochila o bolso.${weightNote}`;
}

/** Explica en la práctica qué implica el nivel de potencia del procesador (sin contexto de uso declarado). */
// Cortas a propósito: la explicación larga con metáfora vive en specGlossary.ts
// (la guía de referencia que el usuario puede abrir aparte). Acá solo el dato
// rápido de escaneo para la tarjeta de producto y el comparador.
export function explainProcessorMeaning(tier: ProcessorTier): string {
  const SHORT: Record<ProcessorTier, string> = {
    low: "Alcanza para lo esencial.",
    mid: "Cómoda para el uso diario.",
    high: "Rápida hasta con tareas exigentes.",
    enthusiast: "Máxima potencia disponible.",
  };
  return SHORT[tier];
}

/** Explica en la práctica qué implica la cantidad de memoria RAM (versión corta para tarjeta). */
export function explainRamMeaning(ramGb: number): string {
  if (ramGb >= 16) return "De sobra para multitarea pesada.";
  if (ramGb >= 8) return "Cómoda para el uso diario.";
  return "Justa, puede tildarse con varias apps.";
}

/** Explica en la práctica qué implica el almacenamiento (versión corta para tarjeta). */
export function explainStorageMeaning(storageGb: number, storageType?: StorageType): string {
  const speed = storageType === "HDD" ? "más lento para abrir programas" : "abre todo casi al instante";
  return `${storageGb >= 1000 ? `${(storageGb / 1000).toLocaleString("es-AR")}TB` : `${storageGb}GB`}, ${speed}.`;
}

/** Explica en la práctica qué implica tener placa de video dedicada o integrada (versión corta). */
export function explainGpuMeaning(gpu: GpuType): string {
  if (gpu === "dedicated") return "Lista para juegos y edición pesada.";
  return "Pensada para uso cotidiano, no gaming.";
}

/** Explica en la práctica qué implica la resolución de la cámara principal (versión corta). */
export function explainCameraMeaning(mp: number): string {
  if (mp >= 100) return "Detalle altísimo, permite recortar mucho.";
  if (mp >= 48) return "Buena nitidez, margen para recortar.";
  return "Calidad estándar para uso diario.";
}

/** Versión corta de explainBatteryMeaning, para tarjeta/comparador (la versión larga sigue alimentando el chat). */
export function explainBatteryMeaningShort(
  value: number,
  category: "phone" | "notebook" | "desktop"
): string {
  if (category === "phone") {
    if (value >= 5000) return "Dura todo el día, incluso a fondo.";
    if (value >= 4000) return "Alcanza cómodo para un día normal.";
    return "Puede quedarte corta en un día intenso.";
  }
  if (value >= 65) return "Varias horas sin depender del cargador.";
  if (value >= 42) return "Autonomía media para el uso normal.";
  return "Puede necesitar el cargador cerca.";
}

/** Versión corta combinada de explainScreenMeaning + explainPhysicalSize, para tarjeta/comparador. */
export function explainScreenMeaningShort(
  inches: number,
  category: ProductCategory,
  weightKg?: number | null
): string {
  if (category === "phone") {
    if (inches >= 6.5) return "Grande, algo más incómoda a una mano.";
    if (inches >= 6.0) return "Buen equilibrio de tamaño y comodidad.";
    return "Compacta, cómoda con una sola mano.";
  }
  if (category === "tablet") {
    if (inches >= 11) return "Grande, mejor con mochila que cartera.";
    if (inches >= 9) return "Entra bien en la mayoría de las mochilas.";
    return "Chica, entra hasta en carteras.";
  }
  const weightNote = weightKg ? (weightKg <= 1.5 ? ", liviana" : weightKg > 2 ? ", pesa lo suyo" : "") : "";
  if (inches >= 17) return `Grande, pensada para uso fijo${weightNote}.`;
  if (inches >= 15) return `Cómoda para uso diario${weightNote}.`;
  if (inches >= 13) return `Tamaño estándar de mochila${weightNote}.`;
  return "Chica y liviana, entra en cualquier bolso.";
}

/** 2-3 datos concretos, en lenguaje simple, sobre por qué las specs del producto sirven para el uso declarado. */
export function explainProductSpecs(
  category: ProductCategory,
  specs: ProductSpecs,
  useCases: UseCase[],
  title?: string
): string[] {
  specs = sanitizeSpecs(category, specs, title);
  if (category === "notebook" || category === "desktop") {
    const s = specs as Partial<NotebookSpecs>;
    if (s.ram_gb == null || s.processor_tier == null || !s.processor_brand || !s.processor_model) {
      return [];
    }
    const required = getRequiredSpecs(useCases);
    const bullets = [
      ramBullet(s.ram_gb, required.ram_gb),
      processorBullet(s.processor_brand, s.processor_model, s.processor_tier, required.processor_tier),
    ];
    if (required.gpu === "dedicated" && s.gpu) {
      bullets.push(gpuBullet(s.gpu, s.gpu_model ?? null));
    } else if (s.storage_gb && s.storage_type) {
      bullets.push(storageBullet(s.storage_gb, s.storage_type));
    }
    if (s.has_numeric_keyboard && wantsNumericKeyboard(useCases)) {
      bullets.push(numericKeyboardBullet());
    }
    return bullets.slice(0, 4);
  }

  if (category === "phone") {
    const s = specs as Partial<PhoneSpecs>;
    const requiredList = useCases
      .map((u) => PHONE_USE_CASE_SPECS[u])
      .filter((r): r is (typeof PHONE_USE_CASE_SPECS)[string] => Boolean(r));
    const minRam = requiredList.length > 0 ? Math.max(...requiredList.map((r) => r.min_ram_gb)) : 4;
    const wantsCamera = requiredList.some((r) => r.min_camera_mp !== null);
    const wantsBattery = requiredList.some((r) => r.prefer_large_battery);

    const bullets: string[] = [];
    if (s.ram_gb) bullets.push(ramBullet(s.ram_gb, minRam));
    if (s.storage_gb) bullets.push(`${s.storage_gb}GB de almacenamiento: ${storageQuickNote(s.storage_gb)}.`);
    if (wantsCamera && s.main_camera_mp) {
      bullets.push(`Cámara principal de ${s.main_camera_mp}MP: pensada para sacar buenas fotos, no solo para uso básico.`);
    }
    if (wantsBattery && s.battery_mah) {
      bullets.push(`Batería de ${s.battery_mah}mAh: ${batteryQuickNote(s.battery_mah)}.`);
    }
    return bullets.slice(0, 3);
  }

  if (category === "tablet") {
    const s = specs as Partial<TabletSpecs>;
    const bullets: string[] = [];
    if (s.ram_gb) {
      bullets.push(
        `${s.ram_gb}GB de RAM: ${
          s.ram_gb >= 8
            ? "fluida para tener varias apps abiertas a la vez"
            : "alcanza para lo básico: navegar, mirar videos y usar apps livianas"
        }.`
      );
    }
    if (s.storage_gb) bullets.push(`${s.storage_gb}GB de almacenamiento para apps, fotos y videos.`);
    return bullets.slice(0, 2);
  }

  return [];
}

// ─── Versión básica (sin jerga técnica) ───────────────────────────────────────
// Misma lógica que explainProductSpecs, pero sin números de GB/mAh/MP ni
// nombres de procesador — solo la experiencia de uso, para quien no sabe qué
// significa "SSD NVMe" o "i5-1135G7". La versión técnica queda disponible
// aparte (spec_highlights) para quien la quiera desplegar.

function ramBulletSimple(ramGb: number, requiredGb: number): string {
  if (ramGb >= requiredGb * 2) return "Memoria: de sobra, multitarea sin trabas.";
  if (ramGb > requiredGb) return "Memoria: más que suficiente para tu uso.";
  if (ramGb === requiredGb) return "Memoria: justa pero cómoda para tu uso.";
  return "Memoria: algo justa, puede tildarse con varias apps.";
}

function processorBulletSimple(tier: ProcessorTier, requiredTier: ProcessorTier): string {
  const label = TIER_LABEL[tier];
  if (TIER_RANK[tier] < TIER_RANK[requiredTier]) return `Rapidez: potencia ${label}, algo justa para lo que buscás.`;
  if (TIER_RANK[tier] > TIER_RANK[requiredTier] + 1) return `Rapidez: potencia ${label}, de sobra para tu uso.`;
  return `Rapidez: potencia ${label}, cómoda para tu uso.`;
}

function storageBulletSimple(storageGb: number, storageType: StorageType): string {
  if (storageType === "HDD") return `Almacenamiento: ${storageGb}GB, pero más lento para abrir programas.`;
  return `Almacenamiento: ${storageGb}GB, abre todo casi al instante.`;
}

function gpuBulletSimple(gpu: GpuType): string {
  if (gpu === "dedicated") return "Gráfica: lista para juegos y edición pesada.";
  return "Gráfica: pensada para uso cotidiano, no gaming.";
}

const STORAGE_TYPE_SHORT: Record<StorageType, string> = { HDD: "HDD", SSD_SATA: "SSD", SSD_NVME: "SSD NVMe" };

function fmtStorageShort(gb: number): string {
  return gb >= 1000 ? `${(gb / 1000).toLocaleString("es-AR")}TB` : `${gb}GB`;
}

// Etiqueta ultra-corta del procesador para mostrar el dato crudo en la tarjeta
// ("i3", "Ryzen 5", "Ultra 7", "M2"). Cae al nombre de gama si el modelo no
// matchea ningún patrón conocido.
function shortProcessorLabel(
  model: string | null | undefined,
  tier: ProcessorTier | null | undefined
): string | null {
  const m = (model ?? "").toLowerCase();
  let g: RegExpMatchArray | null;
  if ((g = m.match(/\bcore\s*ultra\s*([3579])\b/))) return `Ultra ${g[1]}`;
  if ((g = m.match(/\bi([3579])\b/))) return `i${g[1]}`;
  if ((g = m.match(/\bryzen\s*ai\s*([3579])\b/))) return `Ryzen AI ${g[1]}`;
  if ((g = m.match(/\bryzen\s*([3579])\b/))) return `Ryzen ${g[1]}`;
  if ((g = m.match(/\b(celeron|pentium|athlon)\b/))) return g[1][0].toUpperCase() + g[1].slice(1);
  if ((g = m.match(/\bm([1234])\b/))) return `M${g[1]}`;
  if ((g = m.match(/\bsnapdragon\b/))) return "Snapdragon";
  if (tier) return TIER_LABEL[tier];
  return null;
}

// ─── Cordura de specs (valores inverosímiles del normalizador) ────────────────
// Bug real visto en vivo: "Notebook Lenovo LOQ i5-12450HX 24GB SSD512GB" quedó
// con specs.storage_gb = 24 (el normalizador copió el número de la RAM). El
// título casi siempre trae el dato bueno, así que cuando el valor guardado es
// físicamente inverosímil se intenta recuperar del título antes de mostrarlo.

// Menor almacenamiento plausible por categoría (GB). Debajo de esto el valor
// casi siempre es la RAM filtrada o un error de extracción.
function isImplausibleStorageGb(category: ProductCategory, gb: number): boolean {
  if (category === "notebook" || category === "desktop") return gb < 64;
  if (category === "phone" || category === "tablet") return gb < 8;
  return false;
}

// Recupera el almacenamiento del título ("SSD512GB", "512GB SSD", "1TB",
// "M.2 256 GB"). Prioriza el token pegado a SSD/HDD/NVMe; si no, el mayor
// token en GB que sea un tamaño de disco plausible (≥120GB). null si no hay
// nada confiable.
function recoverStorageGbFromTitle(title: string): number | null {
  const t = title.toLowerCase();
  const tb = t.match(/(\d+(?:[.,]\d+)?)\s*tb\b/);
  if (tb) return Math.round(parseFloat(tb[1].replace(",", ".")) * 1024);
  // Pegado a SSD/HDD/NVMe, con unidad ("SSD 512GB") o sin ella ("SSD480").
  const near = t.match(
    /(?:ssd|hdd|nvme|m\.?2|emmc)\s*(\d{2,4})\s*gb\b|(\d{2,4})\s*gb\s*(?:ssd|hdd|nvme|m\.?2|emmc)|(?:ssd|hdd|nvme|m\.?2)\s*(\d{3,4})\b/
  );
  if (near) {
    const n = parseInt(near[1] ?? near[2] ?? near[3], 10);
    if (n >= 64) return n;
  }
  const plausible = Array.from(t.matchAll(/(\d{2,4})\s*gb\b/g))
    .map((m) => parseInt(m[1], 10))
    .filter((n) => n >= 120);
  return plausible.length > 0 ? Math.max(...plausible) : null;
}

// Devuelve un storage_gb confiable: el guardado si es verosímil, si no el
// recuperado del título, si no null (mejor no mostrar número que uno falso).
function resolveStorageGb(
  category: ProductCategory,
  storageGb: number | null | undefined,
  title: string | undefined
): number | null {
  if (storageGb && !isImplausibleStorageGb(category, storageGb)) return storageGb;
  if (title) {
    const recovered = recoverStorageGbFromTitle(title);
    if (recovered && !isImplausibleStorageGb(category, recovered)) return recovered;
  }
  return null;
}

/**
 * Valor crudo y corto por spec, keyeado por la MISMA etiqueta en minúscula que
 * usa explainProductSpecsSimple ("rapidez", "memoria", "almacenamiento",
 * "cámara", "batería"). Para mostrar el número/nombre real ("i3", "8GB",
 * "256GB SSD") junto al veredicto en lenguaje llano de la tarjeta. `title` es
 * opcional pero permite recuperar el almacenamiento cuando el dato guardado es
 * inverosímil (ver resolveStorageGb).
 */
export function shortSpecValues(
  category: ProductCategory,
  specs: ProductSpecs,
  title?: string
): Record<string, string> {
  const out: Record<string, string> = {};
  const storageGb = resolveStorageGb(
    category,
    (specs as Partial<NotebookSpecs>).storage_gb,
    title
  );

  if (category === "notebook" || category === "desktop") {
    const s = specs as Partial<NotebookSpecs>;
    const proc = shortProcessorLabel(s.processor_model, s.processor_tier);
    if (proc) out["rapidez"] = proc;
    if (s.ram_gb) out["memoria"] = `${s.ram_gb}GB`;
    if (storageGb) {
      out["almacenamiento"] = `${fmtStorageShort(storageGb)}${
        s.storage_type ? ` ${STORAGE_TYPE_SHORT[s.storage_type]}` : ""
      }`;
    }
    return out;
  }

  if (category === "phone") {
    const s = specs as Partial<PhoneSpecs>;
    if (s.ram_gb) out["memoria"] = `${s.ram_gb}GB`;
    if (storageGb) out["almacenamiento"] = fmtStorageShort(storageGb);
    if (s.main_camera_mp) out["cámara"] = `${s.main_camera_mp}MP`;
    if (s.battery_mah) out["batería"] = `${s.battery_mah.toLocaleString("es-AR")}mAh`;
    return out;
  }

  if (category === "tablet") {
    const s = specs as Partial<TabletSpecs>;
    if (s.ram_gb) out["memoria"] = `${s.ram_gb}GB`;
    if (storageGb) out["almacenamiento"] = fmtStorageShort(storageGb);
    return out;
  }

  return out;
}

// ─── Datos físicos en lenguaje llano (pantalla, peso, tamaño) ─────────────────

// Guard de peso: el normalizador a veces guarda GRAMOS en weight_kg (visto en
// vivo: 40 notebooks con weight_kg ≈ 2200 → son 2,2 kg). Corrige y descarta lo
// que sigue fuera del rango físico de una notebook.
export function resolveWeightKg(weightKg: number | null | undefined): number | null {
  if (weightKg == null || Number.isNaN(weightKg)) return null;
  let kg = weightKg;
  if (kg > 100) kg = kg / 1000; // gramos → kg
  if (kg < 0.6 || kg > 5) return null;
  return Math.round(kg * 100) / 100;
}

function fmtKg(kg: number): string {
  return kg.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

// Comparación tangible del peso con un objeto cotidiano conocido.
function weightComparison(kg: number): string {
  if (kg <= 1.3) return "como una botella de agua de 1½ litro";
  if (kg <= 1.8) return "como dos botellas de agua de 1½ litro";
  if (kg <= 2.3) return "como un diccionario grande";
  return "como tres botellas de agua de 1½ litro";
}

function weightFeel(kg: number): string {
  if (kg <= 1.5) return "liviana para llevar a todos lados";
  if (kg <= 2) return "peso normal para una notebook";
  return "vas a notar el peso si la cargás todos los días";
}

function inchesRange(category: ProductCategory): [number, number] {
  if (category === "phone") return [4, 8];
  if (category === "tv") return [19, 120];
  if (category === "tablet") return [6, 15];
  return [10, 18.5]; // notebook / desktop
}

// Recupera el tamaño de pantalla del título (`15.6"`, `15,6 pulgadas`, `55"`)
// cuando la spec guardada falta o está fuera de rango para la categoría.
function recoverInchesFromTitle(title: string, category: ProductCategory): number | null {
  const m = title.toLowerCase().match(/\b(\d{1,3}(?:[.,]\d)?)\s*(?:"|''|pulg\.?|pulgadas?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  const [lo, hi] = inchesRange(category);
  return n >= lo && n <= hi ? n : null;
}

function resolveInches(
  category: ProductCategory,
  raw: number | null | undefined,
  title: string | undefined
): number | null {
  const [lo, hi] = inchesRange(category);
  if (typeof raw === "number" && raw >= lo && raw <= hi) return raw;
  return title ? recoverInchesFromTitle(title, category) : null;
}

/**
 * Copia de `specs` con los campos que el normalizador suele arruinar ya
 * saneados: `storage_gb` recuperado del título cuando el valor guardado es
 * inverosímil (la RAM filtrada al disco), `weight_kg` convertido de gramos a
 * kg. Si no hay forma de recuperar un valor, se quita (mejor sin dato que con
 * un número falso).
 *
 * El catálogo ya se corrigió en bloque (`scripts/fixSpecsFromTitle.ts`); esto
 * es la red de seguridad para ingestas futuras y para el server (chat/análisis),
 * que hasta ahora no aplicaba los guards que sí tenía la tarjeta.
 */
export function sanitizeSpecs<T extends ProductSpecs>(
  category: ProductCategory,
  specs: T,
  title?: string
): T {
  const s = { ...(specs as Record<string, unknown>) };
  if (typeof s.storage_gb === "number") {
    const fixed = resolveStorageGb(category, s.storage_gb, title);
    if (fixed == null) delete s.storage_gb;
    else s.storage_gb = fixed;
  }
  if (typeof s.weight_kg === "number") {
    const fixed = resolveWeightKg(s.weight_kg);
    if (fixed == null) delete s.weight_kg;
    else s.weight_kg = fixed;
  }
  return s as T;
}

function tvSizeHint(inches: number): string {
  if (inches >= 60) return "grande, se disfruta en un living amplio y de lejos";
  if (inches >= 48) return "buen tamaño para living o dormitorio";
  if (inches >= 40) return "cómoda para un dormitorio o espacio mediano";
  return "chica, para la cocina o un ambiente reducido";
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function stripSizePrefix(s: string): string {
  return s.replace(/^Tamaño físico:\s*/i, "").replace(/\.$/, "");
}

export interface CardFact {
  label: string;
  value?: string;
  text: string;
}

/**
 * Datos físicos entendibles para un usuario común, con comparaciones concretas
 * (pantalla, peso, tamaño). Determinístico, reusa los explicadores existentes.
 * `title` permite recuperar valores cuando la spec guardada es inverosímil.
 */
export function extraCardFacts(
  category: ProductCategory,
  specs: ProductSpecs,
  title?: string
): CardFact[] {
  const s = specs as Partial<NotebookSpecs & TabletSpecs & PhoneSpecs & { screen_inches: number }>;
  const inches = resolveInches(category, s.screen_inches, title);
  const facts: CardFact[] = [];

  if (category === "notebook") {
    if (inches) {
      facts.push({ label: "Pantalla", value: `${inches}"`, text: lowerFirst(explainScreenMeaningShort(inches, category)).replace(/\.$/, "") });
      facts.push({ label: "Tamaño", text: stripSizePrefix(explainPhysicalSize(inches, category)) });
    }
    const kg = resolveWeightKg((s as Partial<NotebookSpecs>).weight_kg);
    if (kg) facts.push({ label: "Peso", value: `${fmtKg(kg)} kg`, text: `${weightComparison(kg)}, ${weightFeel(kg)}` });
    return facts;
  }

  if (category === "phone") {
    if (inches) {
      facts.push({ label: "Pantalla", value: `${inches}"`, text: lowerFirst(explainScreenMeaningShort(inches, category)).replace(/\.$/, "") });
      facts.push({ label: "En la mano", text: stripSizePrefix(explainPhysicalSize(inches, category)) });
    }
    return facts;
  }

  if (category === "tablet") {
    if (inches) {
      facts.push({ label: "Pantalla", value: `${inches}"`, text: lowerFirst(explainScreenMeaningShort(inches, category)).replace(/\.$/, "") });
      facts.push({ label: "Tamaño", text: stripSizePrefix(explainPhysicalSize(inches, category)) });
    }
    return facts;
  }

  if (category === "tv") {
    if (inches) facts.push({ label: "Pantalla", value: `${inches}"`, text: tvSizeHint(inches) });
    return facts;
  }

  return facts;
}

/** Versión amigable de explainProductSpecs: mismos puntos, sin jerga técnica ni números de modelo. */
export function explainProductSpecsSimple(
  category: ProductCategory,
  specs: ProductSpecs,
  useCases: UseCase[],
  title?: string
): string[] {
  specs = sanitizeSpecs(category, specs, title);
  if (category === "notebook" || category === "desktop") {
    const s = specs as Partial<NotebookSpecs>;
    if (s.ram_gb == null || s.processor_tier == null) return [];
    const required = getRequiredSpecs(useCases);
    const bullets = [
      ramBulletSimple(s.ram_gb, required.ram_gb),
      processorBulletSimple(s.processor_tier, required.processor_tier),
    ];
    if (required.gpu === "dedicated" && s.gpu) {
      bullets.push(gpuBulletSimple(s.gpu));
    } else if (s.storage_gb && s.storage_type) {
      bullets.push(storageBulletSimple(s.storage_gb, s.storage_type));
    }
    if (s.has_numeric_keyboard && wantsNumericKeyboard(useCases)) {
      bullets.push(numericKeyboardBullet());
    }
    return bullets.slice(0, 4);
  }

  if (category === "phone") {
    const s = specs as Partial<PhoneSpecs>;
    const requiredList = useCases
      .map((u) => PHONE_USE_CASE_SPECS[u])
      .filter((r): r is (typeof PHONE_USE_CASE_SPECS)[string] => Boolean(r));
    const minRam = requiredList.length > 0 ? Math.max(...requiredList.map((r) => r.min_ram_gb)) : 4;
    const wantsCamera = requiredList.some((r) => r.min_camera_mp !== null);
    const wantsBattery = requiredList.some((r) => r.prefer_large_battery);

    const bullets: string[] = [];
    if (s.ram_gb) bullets.push(ramBulletSimple(s.ram_gb, minRam));
    if (s.storage_gb) bullets.push(`Almacenamiento: ${s.storage_gb}GB.`);
    if (wantsCamera && s.main_camera_mp) {
      bullets.push("Cámara: buena calidad de foto.");
    }
    if (wantsBattery && s.battery_mah) {
      bullets.push(`Batería: ${batteryQuickNote(s.battery_mah)}.`);
    }
    return bullets.slice(0, 3);
  }

  if (category === "tablet") {
    const s = specs as Partial<TabletSpecs>;
    const bullets: string[] = [];
    if (s.ram_gb) {
      bullets.push(
        s.ram_gb >= 8
          ? "Memoria: fluida para varias apps a la vez."
          : "Memoria: alcanza para lo básico."
      );
    }
    if (s.storage_gb) bullets.push(`Almacenamiento: ${s.storage_gb}GB.`);
    return bullets.slice(0, 2);
  }

  return [];
}

// Frases que marcan un bullet como una carencia (no un punto a favor) —
// se usan para no citar como "motivo ideal" algo que en realidad es un déficit.
const SHORTFALL_MARKERS = [
  "por debajo de",
  "puede quedarse",
  "puede sentirse",
  "puede quedarte",
  "no tiene placa",
];

// Clasificación liviana por palabras clave, usada por la UI (ProductCard) para
// pintar cada bullet simple como positivo/neutro/de alerta sin tener que
// cambiar la forma del dato (sigue siendo string[]).
const WARN_MARKERS = [
  "por debajo de",
  "puede quedarse",
  "puede sentirse",
  "puede quedarte",
  "algo justa",
  "tarda más",
  "no para juegos pesados",
];
const GREAT_MARKERS = ["de sobra", "más que suficiente", "casi al instante", "no solo lo básico"];

export type HighlightLevel = "great" | "ok" | "warn";

export function classifyHighlightLevel(text: string): HighlightLevel {
  const lower = text.toLowerCase();
  if (WARN_MARKERS.some((m) => lower.includes(m))) return "warn";
  if (GREAT_MARKERS.some((m) => lower.includes(m))) return "great";
  return "ok";
}

/** Frase corta ("es ideal para X gracias a Y") para usos como el veredicto del comparador. */
export function buildQuickSelectionReason(
  category: ProductCategory,
  specs: ProductSpecs,
  useCases: UseCase[],
  title?: string
): string {
  const label = formatUseCasesLabel(useCases);
  const bullets = explainProductSpecs(category, specs, useCases, title);
  const strongPoint = bullets.find(
    (b) => !SHORTFALL_MARKERS.some((marker) => b.includes(marker))
  );
  if (!strongPoint) return `es una opción para ${label}, aunque no la más potente disponible`;
  const specName = strongPoint.split(":")[0];
  return `es ideal para ${label} gracias a ${specName.toLowerCase()}`;
}

// ─── Veredicto comparativo (2 o más productos) ────────────────────────────────
// Determinístico: para cada spec relevante, encuentra qué producto(s) del grupo
// están a la cabeza y arma una frase concreta y en lenguaje simple. Sirve tanto
// para el duelo de 2 productos como para una tabla de N productos.

const STORAGE_RANK: Record<StorageType, number> = { HDD: 0, SSD_SATA: 1, SSD_NVME: 2 };
const STORAGE_LABEL: Record<StorageType, string> = { HDD: "HDD", SSD_SATA: "SSD", SSD_NVME: "SSD NVMe" };

interface Criterion<T> {
  weight: number;
  getValue: (specs: T) => number | null;
  higherIsBetter: boolean;
  reason: (formattedValue: string) => string;
  formatValue: (value: number) => string;
  // Si el "mejor" valor del grupo es este número, no hay nada destacable que decir
  // (ej: GPU integrada en todos → no tiene sentido premiar "0 dedicadas").
  skipIfBestEquals?: number;
}

const NOTEBOOK_CRITERIA: Criterion<Partial<NotebookSpecs>>[] = [
  {
    weight: 3,
    getValue: (s) => s.ram_gb ?? null,
    higherIsBetter: true,
    formatValue: (v) => `${v}GB`,
    reason: (v) => `Tiene la RAM más alta del grupo (${v}) — vas a poder tener más cosas abiertas a la vez sin que se cuelgue.`,
  },
  {
    weight: 3,
    getValue: (s) => (s.processor_tier ? TIER_RANK[s.processor_tier] : null),
    higherIsBetter: true,
    formatValue: (v) => TIER_LABEL[(Object.keys(TIER_RANK) as ProcessorTier[]).find((t) => TIER_RANK[t] === v) ?? "low"],
    reason: (v) => `Tiene el procesador más potente del grupo (gama ${v}) — anda mejor con tareas exigentes o varios programas a la vez.`,
  },
  {
    weight: 2.5,
    getValue: (s) => (s.gpu ? (s.gpu === "dedicated" ? 1 : 0) : null),
    higherIsBetter: true,
    skipIfBestEquals: 0,
    formatValue: () => "",
    reason: () => `Es el único con placa de video dedicada — corre mucho mejor juegos y programas de edición o diseño.`,
  },
  {
    weight: 2,
    getValue: (s) => (s.storage_type ? STORAGE_RANK[s.storage_type] : null),
    higherIsBetter: true,
    formatValue: (v) => STORAGE_LABEL[(Object.keys(STORAGE_RANK) as StorageType[]).find((t) => STORAGE_RANK[t] === v) ?? "HDD"],
    reason: (v) => `Tiene el almacenamiento más rápido del grupo (${v}) — prende y abre programas más rápido.`,
  },
  {
    weight: 1.5,
    getValue: (s) => s.storage_gb ?? null,
    higherIsBetter: true,
    formatValue: (v) => `${v}GB`,
    reason: (v) => `Tiene más espacio de almacenamiento del grupo (${v}) para guardar archivos, fotos y programas.`,
  },
  {
    weight: 1.5,
    getValue: (s) => s.battery_wh ?? null,
    higherIsBetter: true,
    formatValue: (v) => `${v}Wh`,
    reason: (v) => `Tiene la batería más grande del grupo (${v}) — te dura más tiempo sin cargador.`,
  },
  {
    weight: 1.2,
    getValue: (s) => s.weight_kg ?? null,
    higherIsBetter: false,
    formatValue: (v) => `${v}kg`,
    reason: (v) => `Es la más liviana del grupo (${v}) — más cómoda para llevar todos los días.`,
  },
];

const PHONE_CRITERIA: Criterion<Partial<PhoneSpecs>>[] = [
  {
    weight: 3,
    getValue: (s) => s.ram_gb ?? null,
    higherIsBetter: true,
    formatValue: (v) => `${v}GB`,
    reason: (v) => `Tiene la RAM más alta del grupo (${v}) — vas a poder tener más apps abiertas sin que se cuelgue.`,
  },
  {
    weight: 2,
    getValue: (s) => s.storage_gb ?? null,
    higherIsBetter: true,
    formatValue: (v) => `${v}GB`,
    reason: (v) => `Tiene más almacenamiento del grupo (${v}) — no te vas a quedar sin espacio para fotos y apps.`,
  },
  {
    weight: 2,
    getValue: (s) => s.main_camera_mp ?? null,
    higherIsBetter: true,
    formatValue: (v) => `${v}MP`,
    reason: (v) => `Tiene la mejor cámara del grupo (${v}) — para sacar fotos más nítidas.`,
  },
  {
    weight: 1.5,
    getValue: (s) => s.battery_mah ?? null,
    higherIsBetter: true,
    formatValue: (v) => `${v}mAh`,
    reason: (v) => `Tiene la batería más grande del grupo (${v}) — te dura más tiempo sin cargador.`,
  },
  {
    weight: 1,
    getValue: (s) => s.refresh_rate_hz ?? null,
    higherIsBetter: true,
    formatValue: (v) => `${v}Hz`,
    reason: (v) => `Tiene la pantalla más fluida del grupo (${v}) — se siente más suave al scrollear y jugar.`,
  },
];

/**
 * Para cada producto del grupo, devuelve la frase que mejor explica su
 * ventaja frente al resto (o un texto neutro si no se destaca en nada).
 * Funciona para 2 productos (duelo) o más (tabla comparativa).
 */
export function buildGroupVerdicts(
  items: { category: ProductCategory; specs: ProductSpecs }[]
): string[] {
  if (items.length < 2) return items.map(() => "");

  const isPhone = items[0].category === "phone";
  const criteria = isPhone ? PHONE_CRITERIA : NOTEBOOK_CRITERIA;

  const perItemReasons: { weight: number; text: string }[][] = items.map(() => []);

  for (const criterion of criteria) {
    const values = items.map((it) => criterion.getValue(it.specs as never));
    const valid = values.filter((v): v is number => v !== null);
    if (valid.length < 2) continue;

    const best = criterion.higherIsBetter ? Math.max(...valid) : Math.min(...valid);
    if (criterion.skipIfBestEquals !== undefined && best === criterion.skipIfBestEquals) continue;

    // Si todos los productos tienen el mismo valor, no hay diferenciador que destacar.
    const allEqual = valid.every((v) => v === valid[0]) && valid.length === values.length;
    if (allEqual) continue;

    values.forEach((v, i) => {
      if (v !== null && v === best) {
        perItemReasons[i].push({ weight: criterion.weight, text: criterion.reason(criterion.formatValue(v)) });
      }
    });
  }

  return perItemReasons.map((reasons) => {
    if (reasons.length === 0) {
      return "Tiene especificaciones más básicas que el resto del grupo en lo que comparamos acá — elegilo si buscás la opción más simple.";
    }
    reasons.sort((a, b) => b.weight - a.weight);
    return reasons[0].text;
  });
}
