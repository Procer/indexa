import type {
  GpuType,
  NotebookSpecs,
  ProcessorTier,
  SQLFilters,
  Slots,
  StorageType,
  UseCase,
} from "@/types";

// ─── Phone use case specs ─────────────────────────────────────────────────────

export interface PhoneRequiredSpecs {
  min_ram_gb: number;
  min_storage_gb: number;
  min_camera_mp: number | null;
  prefer_amoled: boolean;
  prefer_high_refresh: boolean;
  prefer_large_battery: boolean;
}

export const PHONE_USE_CASE_SPECS: Record<string, PhoneRequiredSpecs> = {
  basic_use: {
    min_ram_gb: 4,
    min_storage_gb: 64,
    min_camera_mp: null,
    prefer_amoled: false,
    prefer_high_refresh: false,
    prefer_large_battery: false,
  },
  social_media: {
    min_ram_gb: 6,
    min_storage_gb: 128,
    min_camera_mp: 48,
    prefer_amoled: true,
    prefer_high_refresh: false,
    prefer_large_battery: false,
  },
  photography: {
    min_ram_gb: 8,
    min_storage_gb: 128,
    min_camera_mp: 64,
    prefer_amoled: true,
    prefer_high_refresh: false,
    prefer_large_battery: false,
  },
  battery_life: {
    min_ram_gb: 4,
    min_storage_gb: 64,
    min_camera_mp: null,
    prefer_amoled: false,
    prefer_high_refresh: false,
    prefer_large_battery: true,
  },
  gaming_mobile: {
    min_ram_gb: 8,
    min_storage_gb: 128,
    min_camera_mp: null,
    prefer_amoled: true,
    prefer_high_refresh: true,
    prefer_large_battery: true,
  },
  professional_mobile: {
    min_ram_gb: 8,
    min_storage_gb: 256,
    min_camera_mp: 48,
    prefer_amoled: true,
    prefer_high_refresh: true,
    prefer_large_battery: false,
  },
};

// Máximo agregado de PHONE_USE_CASE_SPECS entre los use_cases del usuario —
// misma lógica de "el más exigente gana" que getRequiredSpecs, para notebook/
// desktop. Antes esto se recalculaba (parcial, solo min_ram_gb + booleans de
// cámara/batería, sin min_storage_gb ni el valor de min_camera_mp) inline en
// dos lugares de specExplainer.ts — se centraliza acá porque el re-rank de
// pipeline.ts también lo necesita, con el valor de MP real, no solo un booleano.
export function getRequiredPhoneSpecs(useCases: UseCase[]): PhoneRequiredSpecs {
  const requiredList = useCases
    .map((u) => PHONE_USE_CASE_SPECS[u])
    .filter((r): r is PhoneRequiredSpecs => Boolean(r));
  if (requiredList.length === 0) return PHONE_USE_CASE_SPECS.basic_use;
  return requiredList.reduce<PhoneRequiredSpecs>((acc, r) => ({
    min_ram_gb: Math.max(acc.min_ram_gb, r.min_ram_gb),
    min_storage_gb: Math.max(acc.min_storage_gb, r.min_storage_gb),
    min_camera_mp:
      r.min_camera_mp !== null
        ? Math.max(acc.min_camera_mp ?? 0, r.min_camera_mp)
        : acc.min_camera_mp,
    prefer_amoled: acc.prefer_amoled || r.prefer_amoled,
    prefer_high_refresh: acc.prefer_high_refresh || r.prefer_high_refresh,
    prefer_large_battery: acc.prefer_large_battery || r.prefer_large_battery,
  }), requiredList[0]);
}

interface RequiredSpecs {
  processor_tier: ProcessorTier;
  ram_gb: number;
  gpu: GpuType;
  storage_gb: number;
  storage_type: StorageType;
  screen_inches_min: number | null;
  weight_kg_max: number | null;
}

const USE_CASE_SPECS: Record<UseCase, RequiredSpecs> = {
  casual_browsing: {
    processor_tier: "low",
    ram_gb: 8,
    gpu: "integrated",
    storage_gb: 256,
    storage_type: "SSD_SATA",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  office: {
    processor_tier: "mid",
    ram_gb: 16,
    gpu: "integrated",
    storage_gb: 512,
    storage_type: "SSD_SATA",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  study: {
    processor_tier: "low",
    ram_gb: 8,
    gpu: "integrated",
    storage_gb: 256,
    storage_type: "SSD_SATA",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  multimedia: {
    processor_tier: "low",
    ram_gb: 8,
    gpu: "integrated",
    storage_gb: 256,
    storage_type: "SSD_SATA",
    screen_inches_min: 15,
    weight_kg_max: null,
  },
  photo_editing_light: {
    processor_tier: "mid",
    ram_gb: 16,
    gpu: "integrated",
    storage_gb: 512,
    storage_type: "SSD_SATA",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  photo_editing_pro: {
    processor_tier: "high",
    ram_gb: 16,
    gpu: "dedicated",
    storage_gb: 512,
    storage_type: "SSD_NVME",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  video_editing_1080: {
    processor_tier: "high",
    ram_gb: 16,
    gpu: "dedicated",
    storage_gb: 1024,
    storage_type: "SSD_NVME",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  video_editing_4k: {
    processor_tier: "enthusiast",
    ram_gb: 32,
    gpu: "dedicated",
    storage_gb: 1024,
    storage_type: "SSD_NVME",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  programming: {
    processor_tier: "mid",
    ram_gb: 16,
    gpu: "integrated",
    storage_gb: 512,
    storage_type: "SSD_SATA",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  gaming_casual: {
    processor_tier: "mid",
    ram_gb: 16,
    gpu: "dedicated",
    storage_gb: 512,
    storage_type: "SSD_SATA",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  gaming_competitive: {
    processor_tier: "high",
    ram_gb: 16,
    gpu: "dedicated",
    storage_gb: 512,
    storage_type: "SSD_NVME",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  graphic_design: {
    processor_tier: "high",
    ram_gb: 16,
    gpu: "dedicated",
    storage_gb: 512,
    storage_type: "SSD_NVME",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  cad_3d: {
    processor_tier: "enthusiast",
    ram_gb: 32,
    gpu: "dedicated",
    storage_gb: 1024,
    storage_type: "SSD_NVME",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  portability: {
    processor_tier: "low",
    ram_gb: 8,
    gpu: "integrated",
    storage_gb: 256,
    storage_type: "SSD_SATA",
    screen_inches_min: null,
    weight_kg_max: 1.5,
  },
  stationary: {
    processor_tier: "low",
    ram_gb: 8,
    gpu: "integrated",
    storage_gb: 256,
    storage_type: "SSD_SATA",
    screen_inches_min: 15,
    weight_kg_max: null,
  },
  // Phone-only use cases — spec filters are bypassed for phones, these are placeholders
  photography: {
    processor_tier: "mid",
    ram_gb: 8,
    gpu: "integrated",
    storage_gb: 128,
    storage_type: "SSD_SATA",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  battery_life: {
    processor_tier: "low",
    ram_gb: 4,
    gpu: "integrated",
    storage_gb: 64,
    storage_type: "SSD_SATA",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  gaming_mobile: {
    processor_tier: "mid",
    ram_gb: 8,
    gpu: "integrated",
    storage_gb: 128,
    storage_type: "SSD_SATA",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  basic_use: {
    processor_tier: "low",
    ram_gb: 4,
    gpu: "integrated",
    storage_gb: 64,
    storage_type: "SSD_SATA",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  social_media: {
    processor_tier: "low",
    ram_gb: 6,
    gpu: "integrated",
    storage_gb: 128,
    storage_type: "SSD_SATA",
    screen_inches_min: null,
    weight_kg_max: null,
  },
  professional_mobile: {
    processor_tier: "mid",
    ram_gb: 8,
    gpu: "integrated",
    storage_gb: 256,
    storage_type: "SSD_SATA",
    screen_inches_min: null,
    weight_kg_max: null,
  },
};

export const TIER_RANK: Record<ProcessorTier, number> = {
  low: 1,
  mid: 2,
  high: 3,
  enthusiast: 4,
};

// El LLM de slot-filling a veces devuelve un use_case que no es ninguno de los
// valores del enum (ej. "gaming" en vez de "gaming_casual"/"gaming_competitive",
// pese a que el prompt lo pide explícito) — sin este filtro, USE_CASE_SPECS[useCase]
// da `undefined` y revienta el reduce de abajo con un 500 real (visto en producción).
export const VALID_USE_CASES = new Set(Object.keys(USE_CASE_SPECS) as UseCase[]);

export function getRequiredSpecs(useCases: UseCase[]): RequiredSpecs {
  const validUseCases = useCases.filter((uc) => VALID_USE_CASES.has(uc));
  if (validUseCases.length === 0) {
    return USE_CASE_SPECS.casual_browsing;
  }

  // Take the most demanding spec across all use cases
  return validUseCases.reduce<RequiredSpecs>((acc, useCase) => {
    const specs = USE_CASE_SPECS[useCase];
    return {
      processor_tier:
        TIER_RANK[specs.processor_tier] > TIER_RANK[acc.processor_tier]
          ? specs.processor_tier
          : acc.processor_tier,
      ram_gb: Math.max(acc.ram_gb, specs.ram_gb),
      gpu: specs.gpu === "dedicated" ? "dedicated" : acc.gpu,
      storage_gb: Math.max(acc.storage_gb, specs.storage_gb),
      storage_type:
        specs.storage_type === "SSD_NVME" ? "SSD_NVME" : acc.storage_type,
      screen_inches_min:
        specs.screen_inches_min !== null
          ? Math.max(acc.screen_inches_min ?? 0, specs.screen_inches_min)
          : acc.screen_inches_min,
      weight_kg_max:
        specs.weight_kg_max !== null
          ? acc.weight_kg_max !== null
            ? Math.min(acc.weight_kg_max, specs.weight_kg_max)
            : specs.weight_kg_max
          : acc.weight_kg_max,
    };
  }, USE_CASE_SPECS[validUseCases[0]]);
}

export function buildSQLFilters(slots: Slots): SQLFilters {
  const specs = getRequiredSpecs(slots.use_cases);
  const tf = slots.technical_filters;

  // Tablets, TVs y phones no comparten el esquema GPU/RAM/storage de notebooks/desktops.
  const applySpecFilters =
    slots.category === null ||
    slots.category === "notebook" ||
    slots.category === "desktop";

  // 20% de slack: permite que productos hasta 20% sobre presupuesto lleguen al LLM,
  // que los gradesegún PRODUCT_ANALYSIS_PROMPT (≤20% → MUY BUENO, ≤50% → BUENO, etc.).
  const BUDGET_SLACK = 1.20;

  // Peso máximo: combinar el del use case (portability=1.5kg) con la preferencia explícita.
  const weightFromUseCase = applySpecFilters ? specs.weight_kg_max : null;
  const weightFromPref = slots.preferences.portability === "light" ? 1.5 : null;
  const max_weight_kg =
    weightFromUseCase !== null && weightFromPref !== null
      ? Math.min(weightFromUseCase, weightFromPref)
      : weightFromUseCase ?? weightFromPref;

  return {
    category: slots.category,
    // Presupuesto contado: solo cuando el usuario lo indicó explícitamente.
    max_price_cash: slots.budget_cash_ars
      ? slots.budget_cash_ars * BUDGET_SLACK
      : null,
    // Presupuesto en cuotas: solo incluye productos cuyo price_installment real <= budget.
    // La condición /12 de migración 010 fue eliminada en migración 011 porque causaba
    // falsos positivos (productos con 3 cuotas a $800k pasaban el filtro de $200k/mes).
    // Cuando tengamos planes múltiples reales en DB (Fase 2), filtrar por mejor plan disponible.
    max_price_installment: slots.budget_monthly_ars
      ? slots.budget_monthly_ars * BUDGET_SLACK
      : null,
    // GPU: filtrar solo cuando el usuario lo pidió explícitamente ("con GPU dedicada", "RTX", etc.).
    // El prompt garantiza que el LLM NO infiere gpu_required de use_cases como "gaming".
    require_gpu: applySpecFilters && tf.gpu_required,
    // RAM y SSD: siempre desactivados como filtros SQL duros.
    // El LLM infería estos de use_cases (gaming → 16GB + SSD) causando 0 resultados.
    // La evaluación de specs adecuadas se delega al LLM de análisis.
    min_ram_gb: null,
    require_ssd: false,
    brands_excluded: slots.preferences.brands_excluded,
    max_weight_kg,
  };
}

export function meetsMinSpecs(
  productSpecs: NotebookSpecs,
  useCases: UseCase[]
): boolean {
  const required = getRequiredSpecs(useCases);
  return (
    productSpecs.ram_gb >= required.ram_gb &&
    TIER_RANK[productSpecs.processor_tier] >=
      TIER_RANK[required.processor_tier] &&
    (required.gpu !== "dedicated" || productSpecs.gpu === "dedicated")
  );
}
