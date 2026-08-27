import OpenAI from "openai";
import type {
  NotebookSpecs,
  DesktopSpecs,
  TabletSpecs,
  TvSpecs,
  PhoneSpecs,
  PhoneChipBrand,
  PhoneScreenType,
  TvPanelType,
  TvResolution,
  SmartOsType,
  ProcessorTier,
  GpuType,
  StorageType,
  ScreenType,
} from "@/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── ML Attribute types ────────────────────────────────────────────────────────

export interface MLAttribute {
  id: string;
  name: string;
  value_name: string | null;
}

// ─── Attribute helpers ────────────────────────────────────────────────────────

export function attr(attributes: MLAttribute[], id: string): string | null {
  return attributes.find((a) => a.id === id)?.value_name ?? null;
}

function parseNum(value: string | null): number | null {
  if (!value) return null;
  const m = value.replace(",", ".").match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

// ─── Step 1: Extract from ML attributes ──────────────────────────────────────

export function extractFromAttributes(attributes: MLAttribute[]) {
  const procBrand = attr(attributes, "PROCESSOR_BRAND");
  const procModel =
    attr(attributes, "PROCESSOR_MODEL") ??
    attr(attributes, "PROCESSOR_LINE");

  const ramVal = attr(attributes, "RAM_MEMORY");
  const ramGB = parseNum(ramVal) ?? null;

  const storageVal = attr(attributes, "TOTAL_DISK_SPACE");
  let storageGB: number | null = null;
  if (storageVal) {
    const num = parseNum(storageVal) ?? 0;
    storageGB = storageVal.toUpperCase().includes("TB") ? num * 1000 : num;
  }

  const diskType = attr(attributes, "DISK_TYPE");
  const diskTech = attr(attributes, "DISK_TECHNOLOGY");

  const gpuModel = attr(attributes, "GPU_MODEL") ?? attr(attributes, "GPU_BRAND");

  const screenVal = attr(attributes, "SCREEN_SIZE");
  const screenInches = parseNum(screenVal);

  const screenRes = attr(attributes, "DISPLAY_RESOLUTION");
  const panelType = attr(attributes, "DISPLAY_TYPE");

  const weightVal = attr(attributes, "WEIGHT");
  const weightKg = parseNum(weightVal);

  const batteryVal =
    attr(attributes, "BATTERY_CAPACITY") ??
    attr(attributes, "BATTERY_LIFE_HOURS");
  let batteryWh: number | null = parseNum(batteryVal);
  if (batteryWh && batteryWh > 200) batteryWh = Math.round(batteryWh / 1000);

  const os = attr(attributes, "OPERATING_SYSTEM");

  return {
    procBrand,
    procModel,
    ramGB,
    storageGB,
    diskType,
    diskTech,
    gpuModel,
    screenInches,
    screenRes,
    panelType,
    weightKg,
    batteryWh,
    os,
  };
}

// ─── Step 2: Regex extraction from title ─────────────────────────────────────

export function extractFromTitle(title: string) {
  // Títulos de ML a veces pegan el procesador abreviado (i3/i5/i7/i9 o
  // Ryzen 3/5/7/9, sin espacio) directo contra la RAM que sigue — ej. "I3
  // 8GB RAM" escrito como "I38GB RAM". Sin separar esto antes de matchear,
  // el regex de RAM de abajo lee la corrida completa de dígitos "38" en vez
  // de los "8" reales (bug real reportado: un Galaxy Book i3/8GB se leía
  // como notebook de 38GB de RAM). Se inserta un espacio entre el dígito del
  // procesador y el que sigue antes de correr cualquier otro regex.
  const t = title
    .toLowerCase()
    .replace(/\bi([3579])(\d+\s*gb)/, "i$1 $2")
    .replace(/\bryzen\s*([3579])(\d+\s*gb)/, "ryzen $1 $2");

  let ramGB: number | null = null;
  const ramMatch = t.match(/(\d+)\s*gb\s*(ram|de\s*ram|memoria)/);
  if (!ramMatch) {
    const ramMatch2 = t.match(/ram\s*(\d+)\s*gb/);
    if (ramMatch2) ramGB = parseInt(ramMatch2[1]);
  } else {
    ramGB = parseInt(ramMatch[1]);
  }

  let storageGB: number | null = null;
  const storageMatch = t.match(/(\d+)\s*(gb|tb)\s*(ssd|nvme|hdd|disco|almacenamiento)/);
  if (storageMatch) {
    const num = parseInt(storageMatch[1]);
    storageGB = storageMatch[2] === "tb" ? num * 1000 : num;
  }

  let screenInches: number | null = null;
  const screenMatch = t.match(/(\d+[.,]\d+)[\s"''´`]*(?:pulgadas|")/);
  if (screenMatch) screenInches = parseFloat(screenMatch[1].replace(",", "."));

  let procBrand: string | null = null;
  let procModel: string | null = null;
  if (t.includes("ryzen")) {
    procBrand = "AMD";
    const m = t.match(/ryzen\s*\d+\s*[\d\w]*/);
    if (m) procModel = m[0].trim();
  } else if (t.includes("core i") || t.includes("core ultra")) {
    procBrand = "Intel";
    const m = t.match(/core\s*(ultra\s*)?(i\d|ultra\s*\d)\s*-?\d*[a-z]*/i);
    if (m) procModel = m[0].trim();
  } else if (t.includes("celeron") || t.includes("pentium")) {
    procBrand = "Intel";
    const m = t.match(/(celeron|pentium)\s*\w*/);
    if (m) procModel = m[0].trim();
  } else if (/\bi[3579]\b/.test(t)) {
    // "i3"/"i5"/"i7"/"i9" sueltos, sin la palabra "core" adelante — común en
    // títulos abreviados de ML (ej. "I3 8GB RAM"). Sin esto el procesador
    // quedaba sin detectar y cae en el fallback de LLM, que en la práctica
    // adivinó mal (un i3 real se guardó como "Core i5-1235U").
    procBrand = "Intel";
    const m = t.match(/\bi[3579]\b/);
    if (m) procModel = `Core ${m[0]}`;
  }

  const hasNVMe = t.includes("nvme") || t.includes("pcie");
  const hasSSD = t.includes("ssd");
  const hasHDD = t.includes("hdd") || t.includes("disco duro");

  // Detect discrete GPU from title keywords
  let gpuModel: string | null = null;
  const gpuMatch = t.match(/\b(rtx\s*\d{3,4}[\s\w]*|gtx\s*\d{3,4}[\s\w]*|radeon\s*rx\s*\d{3,4}[\s\w]*|rx\s*\d{3,4}[\s\w]*|arc\s*a\d+[\s\w]*)/);
  if (gpuMatch) gpuModel = gpuMatch[1].replace(/\s+/g, " ").trim().toUpperCase();

  return { ramGB, storageGB, screenInches, procBrand, procModel, hasNVMe, hasSSD, hasHDD, gpuModel };
}

// ─── Step 3: LLM fallback ────────────────────────────────────────────────────

interface LLMSpecs {
  processor_brand: string | null;
  processor_model: string | null;
  ram_gb: number | null;
  storage_gb: number | null;
  storage_type: "SSD_NVME" | "SSD_SATA" | "HDD" | null;
  gpu: "dedicated" | "integrated" | null;
  gpu_model: string | null;
  screen_inches: number | null;
}

export async function extractWithLLM(title: string): Promise<LLMSpecs> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extraé specs técnicas del título de un producto de tecnología argentino.
Si el dato está explícito en el título, usalo. Si no está pero podés inferirlo de forma coherente
(por ejemplo, un Ryzen 3 moderno suele tener GPU integrada, un título con "gaming" suele tener 16GB RAM, etc.),
inventá un valor realista y coherente. NUNCA devuelvas null: siempre completá todos los campos.

Devolvé SOLO JSON con exactamente estos campos:
- processor_brand: "AMD" | "Intel" | "Apple" (inferí por marca/modelo)
- processor_model: string (ej: "Ryzen 3 7320U", "Core i5-12450H")
- ram_gb: número entero (valores típicos: 4, 8, 16, 32)
- storage_gb: número entero (1TB=1000, valores típicos: 128, 256, 512, 1000)
- storage_type: "SSD_NVME" | "SSD_SATA" | "HDD"
- gpu: "dedicated" | "integrated"
- gpu_model: string o null (null solo si gpu es "integrated")
- screen_inches: número decimal (ej: 15.6, 14.0, 17.3)`,
      },
      { role: "user", content: title },
    ],
  });

  try {
    return JSON.parse(
      completion.choices[0].message.content ?? "{}"
    ) as LLMSpecs;
  } catch {
    return {
      processor_brand: null,
      processor_model: null,
      ram_gb: null,
      storage_gb: null,
      storage_type: null,
      gpu: null,
      gpu_model: null,
      screen_inches: null,
    };
  }
}

// ─── Inference helpers ────────────────────────────────────────────────────────

export function inferProcessorTier(brand: string | null, model: string | null): ProcessorTier {
  const b = (brand ?? "").toLowerCase();
  const m = (model ?? "").toLowerCase();

  if (b.includes("apple") || m.match(/m[234]\s*(pro|max|ultra)/)) return "enthusiast";
  if (m.match(/core\s*i9|core\s*ultra\s*9|ryzen\s*9/)) return "enthusiast";
  if (m.match(/core\s*i7|core\s*ultra\s*7|ryzen\s*7|m[234]$/)) return "high";
  if (m.match(/core\s*i5|core\s*ultra\s*5|ryzen\s*5/)) return "mid";
  if (m.match(/core\s*i3|ryzen\s*3/)) return "low";
  if (m.match(/celeron|pentium|athlon|n\d{3,4}/)) return "low";
  return "mid";
}

export function inferGPU(
  gpuModel: string | null
): { type: GpuType; model: string | null } {
  if (!gpuModel) return { type: "integrated", model: null };
  const g = gpuModel.toLowerCase();
  if (g.match(/rtx|gtx|radeon\s*rx|\brx\s*\d{3,4}|arc\s*a\d/)) {
    return { type: "dedicated", model: gpuModel };
  }
  return { type: "integrated", model: null };
}

export function inferStorageType(
  diskType: string | null,
  diskTech: string | null,
  title: string,
  hasNVMe = false,
  hasSSD = false
): StorageType {
  const combined = (
    (diskType ?? "") +
    " " +
    (diskTech ?? "") +
    " " +
    title
  ).toLowerCase();
  if (combined.includes("nvme") || combined.includes("pcie") || hasNVMe) return "SSD_NVME";
  if (combined.includes("ssd") || hasSSD) return "SSD_SATA";
  return "HDD";
}

export function inferScreenType(panelType: string | null, title: string): ScreenType {
  const combined = ((panelType ?? "") + " " + title).toLowerCase();
  if (combined.includes("oled")) return "OLED";
  if (combined.includes(" va ") || combined.includes("va\n")) return "VA";
  if (combined.includes("ips")) return "IPS";
  return "TN";
}

export function inferOS(os: string | null): string {
  const o = (os ?? "").toLowerCase();
  if (o.includes("mac") || o.includes("macos")) return "macOS";
  if (o.includes("linux") || o.includes("ubuntu")) return "Linux";
  if (o.includes("chrome")) return "ChromeOS";
  if (o.includes("sin sistema") || o.includes("freedos") || o.includes("free dos")) return "Sin OS";
  if (o.includes("11")) return "Windows 11 Home";
  if (o.includes("10")) return "Windows 10 Home";
  return "Windows 11 Home";
}

// ─── Main export: normalize specs from ML data ───────────────────────────────

interface NormalizedNotebookSpecs {
  specs: NotebookSpecs;
  usedLLM: boolean;
}

interface NormalizedDesktopSpecs {
  specs: DesktopSpecs;
  usedLLM: boolean;
}

export async function normalizeNotebookSpecs(
  title: string,
  attributes: MLAttribute[]
): Promise<NormalizedNotebookSpecs> {
  const fromAttrs = extractFromAttributes(attributes);
  const fromTitle = extractFromTitle(title);
  let usedLLM = false;

  let procBrand = fromAttrs.procBrand ?? fromTitle.procBrand;
  let procModel = fromAttrs.procModel ?? fromTitle.procModel;
  let ramGB = fromAttrs.ramGB ?? fromTitle.ramGB;
  let storageGB = fromAttrs.storageGB ?? fromTitle.storageGB;
  let screenInches = fromAttrs.screenInches ?? fromTitle.screenInches;
  // Start with GPU from attrs or title regex before calling LLM
  let rawGpuModel: string | null = fromAttrs.gpuModel ?? fromTitle.gpuModel;

  // LLM fallback if critical specs are still missing
  if (!procBrand || !ramGB || !storageGB) {
    usedLLM = true;
    const llm = await extractWithLLM(title);
    procBrand = procBrand ?? llm.processor_brand;
    procModel = procModel ?? llm.processor_model;
    ramGB = ramGB ?? llm.ram_gb;
    storageGB = storageGB ?? llm.storage_gb;
    screenInches = screenInches ?? llm.screen_inches;
    // Use LLM GPU only if neither attrs nor title regex found a GPU model
    if (!rawGpuModel && llm.gpu === "dedicated") {
      rawGpuModel = llm.gpu_model ?? "Dedicada";
    }
  }

  const { type: gpuType, model: gpuModel } = inferGPU(rawGpuModel);
  const storageType = inferStorageType(
    fromAttrs.diskType,
    fromAttrs.diskTech,
    title,
    fromTitle.hasNVMe,
    fromTitle.hasSSD
  );

  const specs: NotebookSpecs = {
    processor_brand: (procBrand ?? "Intel") as NotebookSpecs["processor_brand"],
    processor_model: procModel ?? "Desconocido",
    processor_tier: inferProcessorTier(procBrand, procModel),
    ram_gb: ramGB ?? 8,
    ram_upgradeable: true,
    storage_gb: storageGB ?? 256,
    storage_type: storageType,
    storage_upgradeable: true,
    gpu: gpuType,
    gpu_model: gpuModel,
    screen_inches: screenInches ?? 15.6,
    screen_resolution: fromAttrs.screenRes?.match(/\d+[x×]\d+/)
      ? fromAttrs.screenRes
      : "1920x1080",
    screen_type: inferScreenType(fromAttrs.panelType, title),
    has_numeric_keyboard: (screenInches ?? 15.6) >= 15.4,
    weight_kg: fromAttrs.weightKg ?? 1.9,
    battery_wh: fromAttrs.batteryWh ?? 42,
    os: inferOS(fromAttrs.os),
    ports: [],
    connectivity: ["Wi-Fi"],
  };

  return { specs, usedLLM };
}

// ─── Desktop normalizer (unchanged) ──────────────────────────────────────────

export async function normalizeDesktopSpecs(
  title: string,
  attributes: MLAttribute[]
): Promise<NormalizedDesktopSpecs> {
  const fromAttrs = extractFromAttributes(attributes);
  const fromTitle = extractFromTitle(title);
  let usedLLM = false;

  let procBrand = fromAttrs.procBrand ?? fromTitle.procBrand;
  let procModel = fromAttrs.procModel ?? fromTitle.procModel;
  let ramGB = fromAttrs.ramGB ?? fromTitle.ramGB;
  let storageGB = fromAttrs.storageGB ?? fromTitle.storageGB;
  let rawGpuModel: string | null = fromAttrs.gpuModel ?? fromTitle.gpuModel;

  if (!procBrand || !ramGB || !storageGB) {
    usedLLM = true;
    const llm = await extractWithLLM(title);
    procBrand = procBrand ?? llm.processor_brand;
    procModel = procModel ?? llm.processor_model;
    ramGB = ramGB ?? llm.ram_gb;
    storageGB = storageGB ?? llm.storage_gb;
    if (!rawGpuModel && llm.gpu === "dedicated") {
      rawGpuModel = llm.gpu_model ?? "Dedicada";
    }
  }

  const { type: gpuType, model: gpuModel } = inferGPU(rawGpuModel);
  const storageType = inferStorageType(
    fromAttrs.diskType,
    fromAttrs.diskTech,
    title,
    fromTitle.hasNVMe,
    fromTitle.hasSSD
  );

  const specs: DesktopSpecs = {
    processor_brand: (procBrand ?? "Intel") as DesktopSpecs["processor_brand"],
    processor_model: procModel ?? "Desconocido",
    processor_tier: inferProcessorTier(procBrand, procModel),
    ram_gb: ramGB ?? 8,
    ram_upgradeable: true,
    storage_gb: storageGB ?? 256,
    storage_type: storageType,
    storage_upgradeable: true,
    gpu: gpuType,
    gpu_model: gpuModel,
    screen_inches: 0,
    screen_resolution: "N/A",
    screen_type: "TN",
    os: inferOS(fromAttrs.os),
    ports: [],
    connectivity: [],
  };

  return { specs, usedLLM };
}

// ─── Phone normalizer ─────────────────────────────────────────────────────────

function inferPhoneChip(title: string): PhoneChipBrand {
  const t = title.toLowerCase();
  if (t.includes("snapdragon")) return "Snapdragon";
  if (t.includes("dimensity")) return "Dimensity";
  if (t.includes("helio")) return "Dimensity";
  if (t.includes("apple") || t.includes("iphone")) return "Apple A";
  if (t.includes("exynos")) return "Exynos";
  if (t.includes("tensor")) return "Tensor";
  if (t.includes("motorola") || t.includes("xiaomi") || t.includes("poco")) return "Snapdragon";
  return "Snapdragon";
}

function inferPhoneScreenType(title: string): PhoneScreenType {
  const t = title.toLowerCase();
  if (t.includes("ltpo")) return "LTPO";
  if (t.includes("amoled") || t.includes("oled")) return "AMOLED";
  return "IPS";
}

function extractPhoneFromTitle(title: string) {
  const t = title.toLowerCase();

  let ramGB: number | null = null;
  const ramMatch = t.match(/(\d+)\s*gb\s*(?:ram|de ram)/) ?? t.match(/(\d+)\s*gb\s*\//);
  if (ramMatch) ramGB = parseInt(ramMatch[1]);

  let storageGB: number | null = null;
  const storageSlash = t.match(/\d+\s*gb\s*[\/]\s*(\d+)\s*gb/);
  if (storageSlash) {
    storageGB = parseInt(storageSlash[1]);
  } else {
    const storageMatch = t.match(/(\d+)\s*gb\s*(?:rom|almacenamiento|internal)/);
    if (storageMatch) storageGB = parseInt(storageMatch[1]);
  }

  let cameraMP: number | null = null;
  const camMatch = t.match(/(\d+)\s*mp/);
  if (camMatch) cameraMP = parseInt(camMatch[1]);

  let batteryMAh: number | null = null;
  const batMatch = t.match(/(\d+)\s*mah/);
  if (batMatch) batteryMAh = parseInt(batMatch[1]);

  let screenInches: number | null = null;
  const screenMatch = t.match(/(\d+[.,]\d+)\s*(?:"|''|pulgadas)/);
  if (screenMatch) screenInches = parseFloat(screenMatch[1].replace(",", "."));

  let refreshRate: 60 | 90 | 120 | 144 = 60;
  const hzMatch = t.match(/(\d+)\s*hz/);
  if (hzMatch) {
    const hz = parseInt(hzMatch[1]);
    if (hz >= 144) refreshRate = 144;
    else if (hz >= 120) refreshRate = 120;
    else if (hz >= 90) refreshRate = 90;
  }

  const has5G = t.includes("5g");
  const hasNFC = t.includes("nfc");
  const os: "Android" | "iOS" = t.includes("iphone") || t.includes("ios") ? "iOS" : "Android";

  return { ramGB, storageGB, cameraMP, batteryMAh, screenInches, refreshRate, has5G, hasNFC, os };
}

async function extractPhoneWithLLM(title: string): Promise<{
  processor_model: string;
  ram_gb: number;
  storage_gb: number;
  main_camera_mp: number;
  battery_mah: number;
  screen_inches: number;
}> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 150,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extraé specs de un celular desde su título. Devolvé SOLO JSON con:
- processor_model: string (ej: "Snapdragon 695", "Apple A16 Bionic", "Dimensity 7020")
- ram_gb: número (valores típicos: 4, 6, 8, 12)
- storage_gb: número (valores típicos: 64, 128, 256)
- main_camera_mp: número (ej: 48, 50, 108, 200)
- battery_mah: número (ej: 4000, 5000, 5100)
- screen_inches: número decimal (ej: 6.1, 6.5, 6.7)
Si no podés inferir un campo, usá un valor típico. NUNCA devuelvas null.`,
      },
      { role: "user", content: title },
    ],
  });
  try {
    return JSON.parse(completion.choices[0].message.content ?? "{}");
  } catch {
    return { processor_model: "Desconocido", ram_gb: 4, storage_gb: 128, main_camera_mp: 48, battery_mah: 4500, screen_inches: 6.5 };
  }
}

export async function normalizePhoneSpecs(
  title: string,
  attributes: MLAttribute[]
): Promise<{ specs: PhoneSpecs; usedLLM: boolean }> {
  const fromTitle = extractPhoneFromTitle(title);
  let usedLLM = false;

  let processorModel: string | null = null;
  let ramGB = fromTitle.ramGB;
  let storageGB = fromTitle.storageGB;
  let cameraMP = fromTitle.cameraMP;
  let batteryMAh = fromTitle.batteryMAh;
  let screenInches = fromTitle.screenInches;

  const attrVal = (name: string) =>
    attributes.find(a => a.name.toLowerCase().includes(name.toLowerCase()))?.value_name ?? null;

  if (!processorModel) processorModel = attrVal("procesador") ?? attrVal("chipset") ?? null;
  if (!ramGB) { const v = parseNum(attrVal("ram") ?? attrVal("memoria ram")); if (v) ramGB = v; }
  if (!storageGB) { const v = parseNum(attrVal("almacenamiento") ?? attrVal("memoria interna")); if (v) storageGB = v; }
  if (!cameraMP) { const v = parseNum(attrVal("cámara") ?? attrVal("camara")); if (v) cameraMP = v; }
  if (!batteryMAh) { const v = parseNum(attrVal("batería") ?? attrVal("bateria")); if (v) batteryMAh = v; }

  if (!processorModel || !ramGB || !storageGB || !cameraMP || !batteryMAh || !screenInches) {
    usedLLM = true;
    const llm = await extractPhoneWithLLM(title);
    processorModel = processorModel ?? llm.processor_model;
    ramGB = ramGB ?? llm.ram_gb;
    storageGB = storageGB ?? llm.storage_gb;
    cameraMP = cameraMP ?? llm.main_camera_mp;
    batteryMAh = batteryMAh ?? llm.battery_mah;
    screenInches = screenInches ?? llm.screen_inches;
  }

  // Sanity check: ningún celular real tiene más de ~24GB de RAM — si ramGB
  // quedó implausiblemente alto y storageGB cae en un rango de RAM real,
  // lo más probable es que los dos valores se extrajeron invertidos. Bugs
  // reales encontrados en vivo: "128GB" de almacenamiento cargado como RAM
  // (error del LLM en un título sin separador claro), y un título formato
  // "256gb/12gb" (storage/RAM, no RAM/storage) que la regex de arriba
  // interpreta al revés. Cubre ambos casos sin depender de adivinar en qué
  // orden escribe cada tienda el título.
  if (ramGB != null && ramGB > 24 && storageGB != null && storageGB <= 24) {
    [ramGB, storageGB] = [storageGB, ramGB];
  }

  const specs: PhoneSpecs = {
    processor_chip: inferPhoneChip(title + " " + (processorModel ?? "")),
    processor_model: processorModel ?? "Desconocido",
    ram_gb: ramGB ?? 4,
    storage_gb: storageGB ?? 128,
    main_camera_mp: cameraMP ?? 48,
    battery_mah: batteryMAh ?? 4500,
    screen_inches: screenInches ?? 6.5,
    screen_type: inferPhoneScreenType(title),
    refresh_rate_hz: fromTitle.refreshRate,
    nfc: fromTitle.hasNFC,
    has_5g: fromTitle.has5G,
    os: fromTitle.os,
    connectivity: [
      "WiFi",
      "Bluetooth",
      "USB-C",
      ...(fromTitle.has5G ? ["5G"] : ["4G"]),
      ...(fromTitle.hasNFC ? ["NFC"] : []),
    ],
  };

  return { specs, usedLLM };
}

// ─── Tablet normalizer ────────────────────────────────────────────────────────

function extractTabletFromTitle(title: string) {
  const t = title.toLowerCase();

  let ramGB: number | null = null;
  const ramMatch = t.match(/(\d+)\s*gb\s*(?:ram|de ram)/) ?? t.match(/(\d+)\s*gb\s*\//);
  if (ramMatch) ramGB = parseInt(ramMatch[1]);

  let storageGB: number | null = null;
  const storageSlash = t.match(/\d+\s*gb\s*[\/]\s*(\d+)\s*gb/);
  if (storageSlash) {
    storageGB = parseInt(storageSlash[1]);
  } else {
    const storageMatch = t.match(/(\d+)\s*(gb|tb)\s*(?:rom|almacenamiento|wifi|android|ipados|$)/);
    if (storageMatch) {
      const num = parseInt(storageMatch[1]);
      storageGB = storageMatch[2] === "tb" ? num * 1000 : num;
    }
  }

  let screenInches: number | null = null;
  const screenMatch = t.match(/(\d+[.,]\d+)\s*(?:"|''|pulgadas)/);
  if (screenMatch) screenInches = parseFloat(screenMatch[1].replace(",", "."));

  const hasCellular = t.includes("5g") || t.includes("4g") || t.includes("lte") || t.includes("con sim");
  const stylusCompatible = t.includes("s pen") || t.includes("apple pencil") || t.includes("lápiz") || t.includes("stylus");
  const os = t.includes("ipad") || t.includes("ipados") ? "iPadOS 17" : "Android 14";

  return { ramGB, storageGB, screenInches, hasCellular, stylusCompatible, os };
}

async function extractTabletWithLLM(title: string): Promise<{
  processor_model: string;
  ram_gb: number;
  storage_gb: number;
  screen_inches: number;
  screen_resolution: string;
}> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 120,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extraé specs de una tablet desde su título. Devolvé SOLO JSON con:
- processor_model: string (ej: "Snapdragon 695", "Apple M2", "MediaTek Helio G99")
- ram_gb: número (valores típicos: 4, 6, 8, 12)
- storage_gb: número (valores típicos: 64, 128, 256)
- screen_inches: número decimal (ej: 10.4, 11.0, 12.4)
- screen_resolution: string (ej: "2000x1200", "2560x1600")
NUNCA devuelvas null.`,
      },
      { role: "user", content: title },
    ],
  });
  try {
    return JSON.parse(completion.choices[0].message.content ?? "{}");
  } catch {
    return { processor_model: "Desconocido", ram_gb: 4, storage_gb: 128, screen_inches: 10.9, screen_resolution: "1920x1200" };
  }
}

function inferTabletTier(processorModel: string): ProcessorTier {
  const m = processorModel.toLowerCase();
  if (m.includes("m4") || m.includes("m3") || m.includes("m2") || m.includes("8 gen") || m.includes("snapdragon 8")) return "enthusiast";
  if (m.includes("m1") || m.includes("snapdragon 7") || m.includes("dimensity 8") || m.includes("a15")) return "high";
  if (m.includes("snapdragon 6") || m.includes("dimensity 7") || m.includes("g99") || m.includes("exynos 13")) return "mid";
  return "low";
}

export async function normalizeTabletSpecs(
  title: string,
  attributes: MLAttribute[]
): Promise<{ specs: TabletSpecs; usedLLM: boolean }> {
  const fromTitle = extractTabletFromTitle(title);
  let usedLLM = false;

  let processorModel: string | null = null;
  let ramGB = fromTitle.ramGB;
  let storageGB = fromTitle.storageGB;
  let screenInches = fromTitle.screenInches;
  let screenResolution: string | null = null;

  const attrVal = (name: string) =>
    attributes.find(a => a.name.toLowerCase().includes(name.toLowerCase()))?.value_name ?? null;

  if (!processorModel) processorModel = attrVal("procesador") ?? attrVal("chipset") ?? null;
  if (!ramGB) { const v = parseNum(attrVal("ram") ?? attrVal("memoria ram")); if (v) ramGB = v; }
  if (!storageGB) { const v = parseNum(attrVal("almacenamiento") ?? attrVal("memoria")); if (v) storageGB = v; }
  if (!screenInches) { const v = parseNum(attrVal("pantalla") ?? attrVal("tamaño")); if (v) screenInches = v; }
  screenResolution = attrVal("resolución") ?? attrVal("resolucion") ?? null;

  if (!processorModel || !ramGB || !storageGB || !screenInches) {
    usedLLM = true;
    const llm = await extractTabletWithLLM(title);
    processorModel = processorModel ?? llm.processor_model;
    ramGB = ramGB ?? llm.ram_gb;
    storageGB = storageGB ?? llm.storage_gb;
    screenInches = screenInches ?? llm.screen_inches;
    screenResolution = screenResolution ?? llm.screen_resolution;
  }

  const specs: TabletSpecs = {
    processor_model: processorModel ?? "Desconocido",
    processor_tier: inferTabletTier(processorModel ?? ""),
    ram_gb: ramGB ?? 4,
    storage_gb: storageGB ?? 128,
    storage_upgradeable: !title.toLowerCase().includes("ipad"),
    screen_inches: screenInches ?? 10.9,
    screen_resolution: screenResolution ?? "1920x1200",
    has_cellular: fromTitle.hasCellular,
    os: fromTitle.os,
    stylus_compatible: fromTitle.stylusCompatible,
  };

  return { specs, usedLLM };
}

// ─── TV normalizer ────────────────────────────────────────────────────────────

function extractTVFromTitle(title: string) {
  const t = title.toLowerCase();

  let screenInches: number | null = null;
  const inchMatch = t.match(/(\d+)\s*(?:"|''|pulgadas)/);
  if (inchMatch) screenInches = parseInt(inchMatch[1]);

  let panelType: TvPanelType = "LED";
  if (t.includes("oled")) panelType = "OLED";
  else if (t.includes("mini led") || t.includes("miniled")) panelType = "MiniLED";
  else if (t.includes("qled")) panelType = "QLED";
  else if (t.includes("nanocell") || t.includes("nano cell")) panelType = "NanoCell";

  let resolution: TvResolution = "HD";
  if (t.includes("8k")) resolution = "8K";
  else if (t.includes("4k") || t.includes("uhd") || t.includes("ultra hd")) resolution = "4K";
  else if (t.includes("fhd") || t.includes("full hd") || t.includes("1080")) resolution = "FHD";

  let refreshRateHz: 60 | 120 | 144 = 60;
  const hzMatch = t.match(/(\d+)\s*hz/);
  if (hzMatch && parseInt(hzMatch[1]) >= 120) refreshRateHz = 120;

  const hdrSupport = t.includes("hdr");

  let smartOs: SmartOsType = "none";
  if (t.includes("google tv")) smartOs = "Google TV";
  else if (t.includes("android tv")) smartOs = "Android TV";
  else if (t.includes("webos") || t.includes("web os")) smartOs = "webOS";
  else if (t.includes("tizen")) smartOs = "Tizen";
  else if (t.includes("smart")) smartOs = "Google TV";

  return { screenInches, panelType, resolution, refreshRateHz, hdrSupport, smartOs };
}

export async function normalizeTVSpecs(
  title: string,
  _attributes: MLAttribute[]
): Promise<{ specs: TvSpecs; usedLLM: boolean }> {
  const fromTitle = extractTVFromTitle(title);
  let screenInches = fromTitle.screenInches;
  let usedLLM = false;

  if (!screenInches) {
    usedLLM = true;
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 30,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: 'Extraé el tamaño de pantalla en pulgadas de este TV. Devolvé SOLO JSON con: {"screen_inches": número}. Si no podés determinarlo, usá 50.' },
        { role: "user", content: title },
      ],
    });
    try {
      const r = JSON.parse(completion.choices[0].message.content ?? "{}") as { screen_inches?: number };
      screenInches = r.screen_inches ?? 50;
    } catch {
      screenInches = 50;
    }
  }

  const specs: TvSpecs = {
    panel_type: fromTitle.panelType,
    screen_inches: screenInches ?? 50,
    resolution: fromTitle.resolution,
    refresh_rate_hz: fromTitle.refreshRateHz,
    hdr_support: fromTitle.hdrSupport,
    smart_os: fromTitle.smartOs,
    ports: ["HDMI x3", "USB x2"],
    connectivity: ["WiFi", "Bluetooth"],
  };

  return { specs, usedLLM };
}
